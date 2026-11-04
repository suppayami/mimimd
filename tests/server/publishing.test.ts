import { Buffer } from 'node:buffer'
import { request } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { startServer } from '../../src/server/http'

const apps: Awaited<ReturnType<typeof startServer>>[] = []

async function start(host = '127.0.0.1') {
	const app = await startServer(null, host, 0, {
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	apps.push(app)
	return app
}

async function publish(
	app: Awaited<ReturnType<typeof start>>,
	body: string | Uint8Array,
	key = 'guide',
	headers = {},
) {
	return fetch(`${app.url}/api/session-documents/${key}`, {
		method: 'PUT',
		body: body as BodyInit,
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'X-Mimimd-Session': app.sessionId,
			...headers,
		},
	})
}

async function terminal(app: Awaited<ReturnType<typeof start>>, key = 'guide') {
	let status: { state: string; revision: number; error?: { code: string } }
	const deadline = Date.now() + 10000
	do {
		status = await (await fetch(`${app.url}/api/session-documents/${key}/status`)).json()
		if (['ready', 'failed'].includes(status.state)) {
			return status
		}
		await new Promise((resolve) => setTimeout(resolve, 20))
	} while (Date.now() < deadline)
	throw new Error('Publication did not reach a terminal state')
}

afterEach(async () => {
	await Promise.all(apps.splice(0).map((app) => app.close()))
})

it('starts empty without filesystem reads, creates fresh identities, and releases its listener', async () => {
	const app = await start()
	const health = await (await fetch(`${app.url}/api/health`)).json()
	expect(health).toMatchObject({
		product: 'mimimd',
		protocolVersion: 1,
		sessionId: app.sessionId,
		writable: true,
	})
	expect(await (await fetch(`${app.url}/api/index`)).json()).toMatchObject({
		documents: [],
		defaultDocument: null,
	})
	for (const route of ['/content/image.svg', '/api/document?path=README.md']) {
		expect((await fetch(app.url + route)).status).toBe(404)
	}
	const second = await start()
	expect(second.sessionId).not.toBe(app.sessionId)
})

it('accepts before preparation, commits revisions, and retains previous content after invalid uploads', async () => {
	const app = await start()
	const created = await publish(app, '# First')
	expect(created.status).toBe(202)
	const receipt = await created.json()
	expect(receipt).toMatchObject({
		key: 'guide',
		sessionId: app.sessionId,
		readerUrl: `${app.url}/session/guide`,
	})
	expect(await terminal(app)).toMatchObject({ state: 'ready', revision: 1 })
	expect(await (await fetch(`${app.url}/api/session-documents/guide`)).json()).toMatchObject({
		revision: 1,
		headings: [{ text: 'First' }],
	})
	expect((await publish(app, '# Second')).status).toBe(202)
	expect(await terminal(app)).toMatchObject({ state: 'ready', revision: 2 })
	expect((await publish(app, new Uint8Array([0xc3, 0x28]))).status).toBe(400)
	expect(await terminal(app)).toMatchObject({ state: 'failed', revision: 2 })
	expect(await (await fetch(`${app.url}/api/session-documents/guide`)).json()).toMatchObject({
		revision: 2,
		headings: [{ text: 'Second' }],
	})
	expect((await publish(app, '# Recovered')).status).toBe(202)
	expect(await terminal(app)).toMatchObject({ state: 'ready', revision: 3 })
})

it('rejects wrong sessions, invalid media, compressed bodies, bad keys, and LAN writes', async () => {
	const app = await start()
	for (const [headers, status] of [
		[{ 'X-Mimimd-Session': 'stale' }, 409],
		[{ 'Content-Type': 'text/plain' }, 415],
		[{ 'Content-Encoding': 'gzip' }, 415],
		[{ Origin: 'https://evil.invalid' }, 403],
	] as const) {
		expect((await publish(app, '# No', 'guide', headers)).status).toBe(status)
	}
	expect((await publish(app, '# No', '_bad')).status).toBe(400)
	const lan = await start('0.0.0.0')
	const url = lan.url.replace('0.0.0.0', '127.0.0.1')
	expect(
		(
			await fetch(`${url}/api/session-documents/guide`, {
				method: 'PUT',
				body: '# No',
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					'X-Mimimd-Session': lan.sessionId,
				},
			})
		).status,
	).toBe(403)
})

it('validates streamed bytes and split UTF-8 rather than decoding each transport chunk independently', async () => {
	const app = await start()
	const result = await new Promise<number>((resolve, reject) => {
		const upload = request(
			`${app.url}/api/session-documents/guide`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					'X-Mimimd-Session': app.sessionId,
				},
			},
			(response) => {
				response.resume()
				resolve(response.statusCode!)
			},
		)
		upload.on('error', reject)
		upload.write(Buffer.from([0x23, 0x20, 0xe7]))
		setTimeout(() => upload.end(Buffer.from([0x8c, 0xab])), 30)
	})
	expect(result).toBe(202)
	expect(await terminal(app)).toMatchObject({ state: 'ready' })
	expect(await (await fetch(`${app.url}/api/session-documents/guide`)).json()).toMatchObject({
		headings: [{ text: '猫' }],
	})
})
