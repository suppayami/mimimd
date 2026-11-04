import { expect, it } from 'vitest'
import { FileScope } from '../../src/server/files'
import { startServer } from '../../src/server/http'

it('maps eligible files and committed session revisions without identity collisions', async () => {
	const app = await startServer(
		await FileScope.create('tests/fixtures/README.md'),
		'127.0.0.1',
		0,
		{ workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url) },
	)
	try {
		for (const revision of [1, 2]) {
			expect(
				(
					await fetch(`${app.url}/api/session-documents/README`, {
						method: 'PUT',
						body: '# Published',
						headers: {
							'Content-Type': 'text/markdown; charset=utf-8',
							'X-Mimimd-Session': app.sessionId,
						},
					})
				).status,
			).toBe(202)
			await expect
				.poll(
					async () =>
						(
							await (
								await fetch(`${app.url}/api/session-documents/README/status`)
							).json()
						).revision,
				)
				.toBe(revision)
			const map = await (await fetch(`${app.url}/api/documents`)).json()
			expect(map.sessionId).toBe(app.sessionId)
			expect(map.documents).toHaveLength(2)
			expect(map.documents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						source: 'filesystem',
						path: 'README.md',
						writable: false,
					}),
					expect.objectContaining({
						source: 'session',
						key: 'README',
						writable: true,
						revision,
					}),
				]),
			)
			for (const entry of map.documents) {
				expect((await fetch(entry.readerUrl)).status).toBe(200)
			}
		}
	} finally {
		await app.close()
	}
})
