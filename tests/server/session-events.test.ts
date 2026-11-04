import { request } from 'node:http'
import { expect, it } from 'vitest'
import { startServer } from '../../src/server/http'

it('snapshots receiving first publications on reconnect and sends preparing/ready without content', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	const abort = new AbortController()
	const upload = request(
		`${app.url}/api/session-documents/live`,
		{
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Mimimd-Session': app.sessionId,
			},
		},
		(response) => response.resume(),
	)
	upload.on('error', () => {})
	let consume: Promise<void> | undefined
	try {
		upload.write('# Private content marker')
		await expect
			.poll(async () => (await fetch(`${app.url}/api/session-documents/live/status`)).status)
			.toBe(200)
		const response = await fetch(`${app.url}/events`, { signal: abort.signal })
		const reader = response.body!.getReader()
		const snapshot = new TextDecoder().decode((await reader.read()).value)
		expect(snapshot).toContain('event: session-snapshot')
		expect(snapshot).toContain('receiving')
		expect(snapshot).not.toContain('Private content marker')
		const messages: string[] = []
		consume = (async () => {
			try {
				while (true) {
					const { value, done } = await reader.read()
					if (done) {
						return
					}
					messages.push(new TextDecoder().decode(value))
				}
			} catch (error) {
				if (!abort.signal.aborted) {
					throw error
				}
			}
		})()
		upload.end()
		await expect.poll(() => messages.join('')).toContain('ready')
		expect(messages.join('')).toContain('preparing')
		expect(messages.join('')).not.toContain('Private content marker')
		const reconnect = await fetch(`${app.url}/events`, { signal: abort.signal })
		const state = new TextDecoder().decode((await reconnect.body!.getReader().read()).value)
		expect(state).toContain('"revision":1')
		expect(state).toContain('ready')
	} finally {
		abort.abort()
		upload.destroy()
		await consume
		await app.close()
	}
})
