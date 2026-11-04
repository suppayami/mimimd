import { request } from 'node:http'
import { expect, it } from 'vitest'
import { startServer } from '../../src/server/http'

const workerUrl = new URL('../../dist/server/render-worker.js', import.meta.url)

it('counts failed first attempts toward the key limit while allowing retries of existing keys', async () => {
	const app = await startServer(null, '127.0.0.1', 0, { workerUrl })
	const headers = {
		'Content-Type': 'text/markdown; charset=utf-8',
		'X-Mimimd-Session': app.sessionId,
	}
	try {
		for (let i = 0; i < 256; i++) {
			const response = await fetch(`${app.url}/api/session-documents/key-${i}`, {
				method: 'PUT',
				headers,
				body: new Uint8Array([0xff]),
			})
			expect(response.status).toBe(400)
		}
		const busy = await fetch(`${app.url}/api/session-documents/new-key`, {
			method: 'PUT',
			headers,
			body: '# New',
		})
		expect(busy.status).toBe(503)
		expect(busy.headers.get('Retry-After')).toBe('1')
		expect(
			(
				await fetch(`${app.url}/api/session-documents/key-0`, {
					method: 'PUT',
					headers,
					body: '# Retry',
				})
			).status,
		).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/key-0/status`)).json())
						.state,
			)
			.toBe('ready')
		expect((await (await fetch(`${app.url}/api/documents`)).json()).documents).toHaveLength(1)
	} finally {
		await app.close()
	}
})

it('bounds simultaneous receiving attempts and releases timed out and disconnected uploads', async () => {
	const app = await startServer(null, '127.0.0.1', 0, { uploadTimeoutMs: 400, workerUrl })
	const uploads: ReturnType<typeof request>[] = []
	const headers = {
		'Content-Type': 'text/markdown; charset=utf-8',
		'X-Mimimd-Session': app.sessionId,
	}
	const put = (key: string) =>
		fetch(`${app.url}/api/session-documents/${key}`, {
			method: 'PUT',
			headers,
			body: '# Ready',
		})
	try {
		for (const key of ['one', 'two']) {
			const upload = request(
				`${app.url}/api/session-documents/${key}`,
				{ method: 'PUT', headers },
				(response) => response.resume(),
			)
			upload.on('error', () => {})
			upload.write('# Incomplete')
			uploads.push(upload)
		}
		await expect
			.poll(async () => (await fetch(`${app.url}/api/session-documents/two/status`)).status)
			.toBe(200)
		expect((await put('one')).status).toBe(409)
		const busy = await put('three')
		expect(busy.status).toBe(503)
		expect(busy.headers.get('Retry-After')).toBe('1')
		uploads[0].destroy()
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/one/status`)).json())
						.state,
			)
			.toBe('failed')
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/two/status`)).json())
						.error?.code,
			)
			.toBe('upload_timeout')
		expect((await put('one')).status).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/one/status`)).json())
						.state,
			)
			.toBe('ready')
	} finally {
		for (const upload of uploads) {
			upload.destroy()
		}
		await app.close()
	}
})

it('reserves replacement capacity while retaining old payloads and frees superseded storage', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../fixtures/capacity-worker.js', import.meta.url),
	})
	const headers = {
		'Content-Type': 'text/markdown; charset=utf-8',
		'X-Mimimd-Session': app.sessionId,
	}
	const put = (key: string, body: string) =>
		fetch(`${app.url}/api/session-documents/${key}`, { method: 'PUT', headers, body })
	let upload: ReturnType<typeof request> | undefined
	try {
		for (const key of ['one', 'two']) {
			expect((await put(key, 'large')).status).toBe(202)
			await expect
				.poll(
					async () =>
						(
							await (
								await fetch(`${app.url}/api/session-documents/${key}/status`)
							).json()
						).state,
				)
				.toBe('ready')
		}
		upload = request(
			`${app.url}/api/session-documents/three`,
			{ method: 'PUT', headers },
			(response) => response.resume(),
		)
		upload.on('error', () => {})
		upload.write('Receiving')
		await expect
			.poll(async () => (await fetch(`${app.url}/api/session-documents/three/status`)).status)
			.toBe(200)
		expect((await put('one', 'replace')).status).toBe(503)
		expect((await put('four', 'new')).status).toBe(503)
		const map = await (await fetch(`${app.url}/api/documents`)).json()
		expect(map.documents.map((entry: { revision: number }) => entry.revision)).toEqual([1, 1])
		upload.destroy()
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/three/status`)).json())
						.state,
			)
			.toBe('failed')
		expect((await put('one', 'replace')).status).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/one/status`)).json())
						.revision,
			)
			.toBe(2)
		expect((await put('four', 'new')).status).toBe(202)
	} finally {
		upload?.destroy()
		await app.close()
	}
})

it('reports renderer deadlines and worker exits without losing HTTP service or capacity', async () => {
	for (const options of [
		{ renderTimeoutMs: 1, workerUrl },
		{ workerUrl: new URL('../fixtures/exiting-worker.js', import.meta.url) },
	]) {
		const app = await startServer(null, '127.0.0.1', 0, options)
		try {
			for (let i = 0; i < 3; i++) {
				const response = await fetch(`${app.url}/api/session-documents/key`, {
					method: 'PUT',
					body: '# Text',
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						'X-Mimimd-Session': app.sessionId,
					},
				})
				expect(response.status).toBe(202)
				await expect
					.poll(
						async () =>
							(
								await (
									await fetch(`${app.url}/api/session-documents/key/status`)
								).json()
							).state,
					)
					.toBe('failed')
				expect((await fetch(`${app.url}/api/health`)).status).toBe(200)
				expect((await fetch(`${app.url}/api/session-documents/key`)).status).toBe(404)
			}
		} finally {
			await app.close()
		}
	}
})
