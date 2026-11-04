import { Worker } from 'node:worker_threads'

export function renderSession(
	source: string,
	outputBytes: number,
	timeoutMs: number,
	workerUrl = new URL('./render-worker.js', import.meta.url),
	identity: { sessionId: string; key: string; revision: number },
) {
	const worker = new Worker(workerUrl, {
		workerData: { source, outputBytes, identity },
		resourceLimits: { maxOldGenerationSizeMb: 256 },
	})
	const result = new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('render_timeout'))
			void worker.terminate()
		}, timeoutMs)
		worker.once('message', (message: { serialized?: string; error?: string }) => {
			clearTimeout(timer)
			if (message.serialized !== undefined) {
				resolve(message.serialized)
			} else {
				reject(new Error(message.error ?? 'render_failed'))
			}
			void worker.terminate()
		})
		worker.once('error', () => {
			clearTimeout(timer)
			reject(new Error('worker_failed'))
		})
		worker.once('exit', () => {
			clearTimeout(timer)
			reject(new Error('worker_failed'))
		})
	})
	return { result, stop: () => worker.terminate() }
}
