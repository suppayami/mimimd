import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { request } from 'node:http'
import { cpus, platform, release, totalmem } from 'node:os'
import process from 'node:process'
import { expect, it } from 'vitest'
import { startServer } from '../../src/server/http'

it('streams representative 10 MiB prose under production budgets while health and status stay responsive', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	const bytes = 10 * 1024 * 1024
	// Roughly 2 KiB paragraphs: ordinary prose, no syntax-heavy expansion or permanent fixture.
	const paragraph = `${'Readers explore a quiet garden and share their observations. '.repeat(34)}\n\n`
	const source = `${`# Beginning\n\n${paragraph.repeat(Math.ceil(bytes / paragraph.length))}`.slice(
		0,
		bytes - 12,
	)}\n\n# The end\n`
	const latencies: number[] = []
	const observedStates = new Set<string>()
	let peakRss = process.memoryUsage().rss
	const started = performance.now()
	let timer: ReturnType<typeof setInterval> | undefined
	let probe: Promise<void> = Promise.resolve()
	const measure = async () => {
		for (const route of ['/api/health', '/api/session-documents/large/status']) {
			const before = performance.now()
			const response = await fetch(app.url + route, { signal: AbortSignal.timeout(2000) })
			const result = await response.json()
			if (route.endsWith('/status')) {
				observedStates.add(result.state)
			}
			latencies.push(performance.now() - before)
		}
		peakRss = Math.max(peakRss, process.memoryUsage().rss)
	}
	try {
		expect(Buffer.byteLength(source)).toBe(bytes)
		timer = setInterval(() => {
			probe = probe.then(measure)
		}, 100)
		const response = new Promise<number>((resolve, reject) => {
			const upload = request(
				`${app.url}/api/session-documents/large`,
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						'X-Mimimd-Session': app.sessionId,
					},
				},
				(res) => {
					res.resume()
					resolve(res.statusCode!)
				},
			)
			upload.on('error', reject)
			void (async () => {
				for (let offset = 0; offset < source.length; offset += 65536) {
					if (!upload.write(source.slice(offset, offset + 65536))) {
						await once(upload, 'drain')
					}
					await new Promise((resolve) => setTimeout(resolve, 5))
				}
				upload.end()
			})().catch(reject)
		})
		expect(await response).toBe(202)
		const uploadAccepted = performance.now()
		let status
		do {
			await new Promise((resolve) => setTimeout(resolve, 100))
			status = await (await fetch(`${app.url}/api/session-documents/large/status`)).json()
		} while (!['ready', 'failed'].includes(status.state) && performance.now() - started < 65000)
		clearInterval(timer)
		await probe
		console.warn(
			JSON.stringify({
				node: process.version,
				os: `${platform()} ${release()}`,
				cpu: cpus()[0]?.model,
				logicalCpus: cpus().length,
				ramBytes: totalmem(),
				fixtureBytes: bytes,
				paragraphBytes: paragraph.length,
				elapsedMs: performance.now() - started,
				uploadMs: uploadAccepted - started,
				postAcceptanceToTerminalMs: performance.now() - uploadAccepted,
				maxProbeMs: Math.max(...latencies),
				observedProcessPeakRss: peakRss,
				status,
			}),
		)
		expect(status.state, JSON.stringify(status)).toBe('ready')
		expect(Math.max(...latencies)).toBeLessThan(2000)
		expect([...observedStates]).toEqual(expect.arrayContaining(['receiving', 'preparing']))
		const rendered = await (await fetch(`${app.url}/api/session-documents/large`)).json()
		expect(rendered.html).toContain('Beginning')
		expect(rendered.html).toContain('The end')
	} finally {
		clearInterval(timer)
		await probe.catch(() => {})
		await app.close()
	}
}, 75000)

it('renders large multibyte prose at the actual UTF-8 byte boundary', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	const paragraph = `${'猫の庭で読書します。'.repeat(100)}\n\n`
	const text = `# 多言語\n\n${paragraph.repeat(3000)}`
	const source = text + 'a'.repeat(10485760 - Buffer.byteLength(text))
	try {
		expect(
			(
				await fetch(`${app.url}/api/session-documents/unicode`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						'X-Mimimd-Session': app.sessionId,
					},
					body: source,
				})
			).status,
		).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/unicode/status`)).json())
						.state,
				{ timeout: 65000 },
			)
			.toBe('ready')
		expect(
			await (await fetch(`${app.url}/api/session-documents/unicode`)).json(),
		).toMatchObject({ headings: [{ text: '多言語' }] })
	} finally {
		await app.close()
	}
}, 75000)

it('retains a rich committed revision after pathological render failure and recovers', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	const put = (body: string) =>
		fetch(`${app.url}/api/session-documents/rich`, {
			method: 'PUT',
			body,
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Mimimd-Session': app.sessionId,
			},
		})
	const status = async () =>
		await (await fetch(`${app.url}/api/session-documents/rich/status`)).json()
	try {
		expect(
			(
				await put(
					'# 猫\n\n| Name | Value |\n| --- | --- |\n| 猫 | 1 |\n\n```js\nconst cat = 1\n```\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B\n```',
				)
			).status,
		).toBe(202)
		await expect.poll(async () => (await status()).state, { timeout: 10000 }).toBe('ready')
		const previous = await (await fetch(`${app.url}/api/session-documents/rich`)).json()
		expect(previous.html).toContain('<table')
		expect(previous.html).toContain('mermaid-source')
		expect((await put('*word* '.repeat(500000))).status).toBe(202)
		await expect.poll(async () => (await status()).state, { timeout: 65000 }).toBe('failed')
		expect(await (await fetch(`${app.url}/api/session-documents/rich`)).json()).toEqual(
			previous,
		)
		expect((await put('# Recovered 猫')).status).toBe(202)
		await expect.poll(async () => (await status()).state, { timeout: 10000 }).toBe('ready')
		expect((await status()).revision).toBe(2)
	} finally {
		await app.close()
	}
}, 75000)

it('counts frontmatter in the complete serialized output budget and releases the renderer', async () => {
	const app = await startServer(null, '127.0.0.1', 0, {
		outputBytes: 512,
		workerUrl: new URL('../../dist/server/render-worker.js', import.meta.url),
	})
	const headers = {
		'Content-Type': 'text/markdown; charset=utf-8',
		'X-Mimimd-Session': app.sessionId,
	}
	try {
		expect(
			(
				await fetch(`${app.url}/api/session-documents/output`, {
					method: 'PUT',
					headers,
					body: `---\nmetadata: ${'large metadata '.repeat(100)}\n---\n# Small article`,
				})
			).status,
		).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/output/status`)).json())
						.error?.code,
				{ timeout: 65000 },
			)
			.toBe('output_limit')
		expect((await fetch(`${app.url}/api/session-documents/output`)).status).toBe(404)
		expect(
			(
				await fetch(`${app.url}/api/session-documents/output`, {
					method: 'PUT',
					headers,
					body: '# Recovered output',
				})
			).status,
		).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/output/status`)).json())
						.state,
			)
			.toBe('ready')
	} finally {
		await app.close()
	}
}, 75000)

it('rejects a chunked 10 MiB plus one byte upload without Content-Length', async () => {
	const app = await startServer(null, '127.0.0.1', 0)
	try {
		const status = await new Promise<number>((resolve, reject) => {
			const upload = request(
				`${app.url}/api/session-documents/oversize`,
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
			void (async () => {
				const chunk = Buffer.alloc(65536, 'a')
				for (let i = 0; i < 160; i++) {
					if (!upload.write(chunk)) {
						await once(upload, 'drain')
					}
				}
				upload.end('x')
			})().catch(reject)
		})
		expect(status).toBe(413)
		expect((await fetch(`${app.url}/api/session-documents/oversize`)).status).toBe(404)
	} finally {
		await app.close()
	}
}, 15000)
