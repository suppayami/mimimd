import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { mkdir, open, readdir, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface DiscoveryRecord {
	sessionId: string
	pid: number
	startedAt: string
	probeUrl: string
	readerUrl: string
	scopeLabel: string
	protocolVersion: 1
}

export function stateDirectory() {
	if (process.env.MIMIMD_STATE_DIR) {
		return path.resolve(process.env.MIMIMD_STATE_DIR)
	}
	if (process.platform === 'darwin') {
		return path.join(homedir(), 'Library', 'Application Support', 'mimimd')
	}
	if (process.platform === 'win32') {
		return path.join(
			process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'),
			'mimimd',
		)
	}
	return path.join(
		process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'),
		'mimimd',
	)
}

export async function registerSession(record: DiscoveryRecord, directory = stateDirectory()) {
	await mkdir(directory, { recursive: true, mode: 0o700 })
	const filename = path.join(directory, `${record.sessionId}.json`)
	const file = await open(filename, 'wx', 0o600)
	try {
		await file.writeFile(JSON.stringify(record))
	} finally {
		await file.close()
	}
	return async () => {
		await unlink(filename)
	}
}

function localProbe(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false
	}
	try {
		const url = new URL(value)
		return (
			url.protocol === 'http:' &&
			['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) &&
			!url.username &&
			!url.password &&
			url.pathname === '/api/health' &&
			!url.search &&
			!url.hash
		)
	} catch {
		return false
	}
}

export async function discover(directory = stateDirectory()) {
	let names: string[]
	try {
		names = await readdir(directory)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return []
		}
		throw error
	}
	const live: (DiscoveryRecord & { writable: boolean })[] = []
	// Sequential probes bound concurrent connections; each record has a strict deadline.
	for (const name of names) {
		if (!/^[a-f\d-]{36}\.json$/i.test(name)) {
			continue
		}
		let record: DiscoveryRecord
		try {
			const file = await open(
				path.join(directory, name),
				constants.O_RDONLY | constants.O_NOFOLLOW,
			)
			try {
				const stat = await file.stat()
				if (!stat.isFile() || stat.size > 4096) {
					continue
				}
				record = JSON.parse(await file.readFile('utf8'))
			} finally {
				await file.close()
			}
		} catch (error) {
			if (
				error instanceof SyntaxError ||
				['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')
			) {
				continue
			}
			throw error
		}
		if (
			!record ||
			record.protocolVersion !== 1 ||
			`${record.sessionId}.json` !== name ||
			!Number.isInteger(record.pid) ||
			typeof record.startedAt !== 'string' ||
			typeof record.readerUrl !== 'string' ||
			typeof record.scopeLabel !== 'string' ||
			!localProbe(record.probeUrl)
		) {
			continue
		}
		try {
			const probe = new URL(record.probeUrl)
			// Never allow registry-controlled DNS to turn a localhost probe into an external request.
			if (probe.hostname === 'localhost') {
				probe.hostname = '127.0.0.1'
			}
			const response = await fetch(probe, {
				redirect: 'error',
				signal: AbortSignal.timeout(1000),
			})
			if (!response.ok) {
				continue
			}
			const reader = response.body!.getReader()
			const chunks: Uint8Array[] = []
			let bytes = 0
			try {
				while (true) {
					const { value, done } = await reader.read()
					if (done) {
						break
					}
					bytes += value.byteLength
					if (bytes > 16384) {
						throw new Error('Oversized health response')
					}
					chunks.push(value)
				}
			} finally {
				await reader.cancel()
			}
			const health = JSON.parse(Buffer.concat(chunks).toString('utf8'))
			if (
				health.product !== 'mimimd' ||
				health.protocolVersion !== 1 ||
				health.sessionId !== record.sessionId ||
				typeof health.writable !== 'boolean'
			) {
				continue
			}
			live.push({ ...record, writable: health.writable })
		} catch {
			// Dead, redirected, timed-out or unrelated listeners are not live sessions.
		}
	}
	return live
}
