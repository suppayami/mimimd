import { mkdir, mkdtemp, rename, symlink, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import path from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FileScope } from '../../src/server/files'
import { startServer } from '../../src/server/http'
let app: Awaited<ReturnType<typeof startServer>>
let root: string
beforeAll(async () => {
	root = await mkdtemp(path.resolve('tests/.http-'))
	await mkdir(path.join(root, '.git'))
	await mkdir(path.join(root, 'nested'))
	await writeFile(path.join(root, 'README.md'), '# Home')
	await writeFile(path.join(root, 'nested', 'guide.md'), '# Guide')
	await writeFile(path.join(root, '.hidden.md'), 'private')
	await writeFile(path.join(root, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
	await writeFile(path.join(root, 'code.js'), 'alert(1)')
	await writeFile(path.join(root, '.gitignore'), 'ignored.md\nignored.svg\n')
	await writeFile(path.join(root, 'ignored.md'), '# Ignored')
	await writeFile(path.join(root, 'ignored.svg'), '<svg/>')
	await symlink(path.join(root, 'README.md'), path.join(root, 'link.md'))
	app = await startServer(await FileScope.create(root, false), '127.0.0.1', 0)
})
afterAll(async () => {
	await app?.close()
})
it('serves a readable document and the built SPA on direct routes', async () => {
	expect(await (await fetch(`${app.url}/api/index`)).json()).toMatchObject({
		documents: ['README.md'],
	})
	expect(await (await fetch(`${app.url}/api/document?path=README.md`)).json()).toMatchObject({
		headings: [{ text: 'Home' }],
	})
	expect((await fetch(`${app.url}/doc/README.md`)).status).toBe(200)
	expect((await fetch(`${app.url}/unrelated`)).status).toBe(404)
})
it('rejects excluded documents, hidden entries, symlinks, executable assets and bad origins', async () => {
	for (const target of [
		'/api/document?path=nested%2Fguide.md',
		'/api/document?path=link.md',
		'/api/document?path=.hidden.md',
		'/content/code.js',
		'/api/document?path=ignored.md',
		'/content/ignored.svg',
		'/content/%2ehidden.md',
	]) {
		expect((await fetch(app.url + target)).status).toBe(404)
	}
	expect(
		(await fetch(`${app.url}/api/index`, { headers: { Origin: 'https://evil.invalid' } }))
			.status,
	).toBe(403)
	expect(
		await new Promise((resolve) => {
			request(
				app.url,
				{ path: '/api/index', headers: { Host: 'evil.invalid' } },
				(response) => {
					response.resume()
					resolve(response.statusCode)
				},
			).end()
		}),
	).toBe(403)
	const svg = await fetch(`${app.url}/content/image.svg`)
	expect(svg.headers.get('content-type')).toBe('image/svg+xml')
	expect(svg.headers.get('content-security-policy')).toContain('sandbox')
})
it('rejects malformed and encoded traversal before normalization', async () => {
	for (const target of ['/content/%zz', '/content/%2e%2e/README.md', '/content/..%5cREADME.md']) {
		const status = await new Promise<number>((resolve) => {
			request(app.url, { path: target }, (response) => {
				response.resume()
				resolve(response.statusCode!)
			}).end()
		})
		expect(status).toBe(400)
	}
})
it('rejects a directory swapped for an out-of-root symlink after startup', async () => {
	const outside = await mkdtemp(path.resolve('tests/.outside-'))
	await writeFile(path.join(outside, 'image.png'), 'OUTSIDE_MARKER')
	await rename(path.join(root, 'nested'), path.join(root, 'original'))
	await symlink(outside, path.join(root, 'nested'))
	const response = await fetch(`${app.url}/content/nested/image.png`)
	expect(response.status).toBe(404)
	expect(await response.text()).not.toContain('OUTSIDE_MARKER')
})
it('delivers filesystem changes over SSE', async () => {
	const controller = new AbortController()
	const response = await fetch(`${app.url}/events`, { signal: controller.signal })
	const reader = response.body!.getReader()
	await reader.read()
	await writeFile(path.join(root, 'README.md'), '# Updated')
	const event = await reader.read()
	expect(new TextDecoder().decode(event.value)).toContain('change')
	controller.abort()
}, 5000)
