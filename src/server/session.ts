import type { SessionStatus } from '../contracts.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { renderSession } from './render-session.js'

export const publishingLimits = {
	sourceBytes: 10 * 1024 * 1024,
	activeAttempts: 2,
	renderConcurrency: 1,
	keys: 256,
	payloadBytes: 128 * 1024 * 1024,
	outputBytes: 32 * 1024 * 1024,
	renderTimeoutMs: 60_000,
	uploadTimeoutMs: 120_000,
	workerHeapMb: 256,
} as const

export interface SessionOptions {
	outputBytes?: number
	uploadTimeoutMs?: number
	renderTimeoutMs?: number
	workerUrl?: URL
}

interface Attempt {
	status: SessionStatus
	attemptId: string
	cancel?: () => void
	source?: string
}

interface Committed {
	serialized: string
	bytes: number
	revision: number
}

export class PublishError extends Error {
	constructor(
		public code: string,
		message: string,
		public status: 400 | 409 | 413 | 503,
	) {
		super(message)
	}
}

export class SessionStore {
	private attempts = new Map<string, Attempt>()
	private committed = new Map<string, Committed>()
	private active = new Set<Attempt>()
	private queue: Attempt[] = []
	private rendering?: ReturnType<typeof renderSession>
	private running?: Promise<void>
	private closed = false
	private listeners = new Set<(status: SessionStatus) => void>()
	private progress = new Map<Attempt, ReturnType<typeof setTimeout>>()

	constructor(
		private sessionId: string,
		private options: SessionOptions = {},
	) {}

	begin(key: string, declaredLength?: string): Attempt {
		if (!/^[a-z\d][\w-]{0,127}$/i.test(key)) {
			throw new PublishError(
				'invalid_key',
				'Use 1–128 ASCII letters, digits, hyphens or underscores, starting with a letter or digit.',
				400,
			)
		}
		if (
			declaredLength !== undefined &&
			(!/^\d+$/.test(declaredLength) || Number(declaredLength) > publishingLimits.sourceBytes)
		) {
			throw new PublishError('input_limit', 'Markdown exceeds the 10 MiB source limit.', 413)
		}
		const previous = this.attempts.get(key)
		if (previous && this.active.has(previous)) {
			throw new PublishError('key_busy', 'This key already has an active publication.', 409)
		}
		const retained = [...this.committed.values()].reduce((sum, value) => sum + value.bytes, 0)
		const reservation = publishingLimits.sourceBytes + publishingLimits.outputBytes
		if (
			this.closed ||
			this.active.size >= publishingLimits.activeAttempts ||
			(!previous && this.attempts.size >= publishingLimits.keys) ||
			retained + (this.active.size + 1) * reservation > publishingLimits.payloadBytes
		) {
			throw new PublishError('capacity', 'Publishing capacity is busy; retry later.', 503)
		}
		const attemptId = randomUUID()
		const attempt: Attempt = {
			attemptId,
			status: {
				sessionId: this.sessionId,
				key,
				attemptId,
				state: 'receiving',
				receivedBytes: 0,
				revision: this.committed.get(key)?.revision ?? null,
			},
		}
		this.attempts.set(key, attempt)
		this.active.add(attempt)
		this.emit(attempt)
		return attempt
	}

	async receive(attempt: Attempt, request: Request) {
		const reader = request.body?.getReader()
		const decoder = new TextDecoder('utf-8', { fatal: true })
		const chunks: string[] = []
		let failure: PublishError | undefined
		const cancel = (error: PublishError) => {
			failure = error
			void reader?.cancel().catch(() => {})
		}
		attempt.cancel = () =>
			cancel(new PublishError('shutdown', 'The session is shutting down.', 503))
		const timer = setTimeout(
			() => cancel(new PublishError('upload_timeout', 'Upload exceeded its deadline.', 400)),
			this.options.uploadTimeoutMs ?? publishingLimits.uploadTimeoutMs,
		)
		const abort = () =>
			cancel(
				new PublishError(
					'upload_disconnected',
					'Upload disconnected before completion.',
					400,
				),
			)
		request.signal.addEventListener('abort', abort, { once: true })
		try {
			while (true) {
				const { value, done } = reader
					? await reader.read()
					: { value: undefined, done: true as const }
				if (failure) {
					throw failure
				}
				if (done) {
					break
				}
				attempt.status.receivedBytes += value.byteLength
				if (attempt.status.receivedBytes > publishingLimits.sourceBytes) {
					throw new PublishError(
						'input_limit',
						'Markdown exceeds the 10 MiB source limit.',
						413,
					)
				}
				chunks.push(decoder.decode(value, { stream: true }))
				if (!this.progress.has(attempt)) {
					this.progress.set(
						attempt,
						setTimeout(() => this.emit(attempt), 100),
					)
				}
			}
			if (failure) {
				throw failure
			}
			chunks.push(decoder.decode())
			const declared = request.headers.get('content-length')
			if (declared !== null && Number(declared) !== attempt.status.receivedBytes) {
				throw new PublishError(
					'invalid_length',
					'The received length does not match Content-Length.',
					400,
				)
			}
			attempt.source = chunks.join('')
			attempt.status.state = 'preparing'
			this.emit(attempt)
			this.queue.push(attempt)
			this.pump()
		} catch (error) {
			void reader?.cancel().catch(() => {})
			const reported =
				failure ??
				(error instanceof PublishError
					? error
					: new PublishError(
							'invalid_upload',
							'Upload must complete with valid UTF-8.',
							400,
						))
			this.fail(attempt, reported.code, reported.message)
			throw reported
		} finally {
			clearTimeout(timer)
			request.signal.removeEventListener('abort', abort)
			attempt.cancel = undefined
			reader?.releaseLock()
		}
	}

	snapshot() {
		return [...this.attempts.values()].map((attempt) => attempt.status)
	}

	entries() {
		return [...this.committed.entries()].map(([key, value]) => ({
			key,
			revision: value.revision,
		}))
	}

	subscribe(listener: (status: SessionStatus) => void) {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	private emit(attempt: Attempt) {
		clearTimeout(this.progress.get(attempt))
		this.progress.delete(attempt)
		for (const listener of this.listeners) {
			listener(attempt.status)
		}
	}

	status(key: string) {
		return this.attempts.get(key)?.status
	}

	read(key: string) {
		return this.committed.get(key)?.serialized
	}

	private fail(attempt: Attempt, code: string, message: string) {
		attempt.status.state = 'failed'
		attempt.status.error = { code, message }
		attempt.source = undefined
		this.active.delete(attempt)
		this.emit(attempt)
	}

	private pump() {
		if (this.rendering || this.closed) {
			return
		}
		const attempt = this.queue.shift()
		if (!attempt) {
			return
		}
		const revision = (this.committed.get(attempt.status.key)?.revision ?? 0) + 1
		const task = renderSession(
			attempt.source!,
			this.options.outputBytes ?? publishingLimits.outputBytes,
			this.options.renderTimeoutMs ?? publishingLimits.renderTimeoutMs,
			this.options.workerUrl,
			{ sessionId: this.sessionId, key: attempt.status.key, revision },
		)
		attempt.source = undefined
		this.rendering = task
		this.running = (async () => {
			try {
				const serialized = await task.result
				if (this.closed) {
					return
				}
				this.committed.set(attempt.status.key, {
					serialized,
					bytes: Buffer.byteLength(serialized),
					revision,
				})
				attempt.status.revision = revision
				attempt.status.state = 'ready'
				this.active.delete(attempt)
				this.emit(attempt)
			} catch (error) {
				const code = (error as Error).message
				this.fail(
					attempt,
					code,
					'Server preparation failed. Previous content is retained; retry publication.',
				)
			} finally {
				await task.stop()
				this.active.delete(attempt)
				this.rendering = undefined
				this.pump()
			}
		})()
	}

	async close() {
		this.closed = true
		for (const attempt of this.active) {
			attempt.cancel?.()
			this.fail(attempt, 'shutdown', 'The session is shutting down.')
		}
		this.queue = []
		await this.rendering?.stop()
		await this.running
		this.committed.clear()
		for (const timer of this.progress.values()) {
			clearTimeout(timer)
		}
		this.progress.clear()
		this.listeners.clear()
	}
}
