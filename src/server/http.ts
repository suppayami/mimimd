import type { HttpBindings } from '@hono/node-server'
import type { FileScope } from './files.js'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { watch } from 'chokidar'
import { Hono } from 'hono'
import { renderMarkdown } from '../markdown/render.js'
import { isExcluded, isMarkdown } from './files.js'

const types: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
}

const uiTypes: Record<string, string> = {
	...types,
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.html': 'text/html',
}

const webRoot = fileURLToPath(new URL('../web/', import.meta.url))

export async function startServer(scope: FileScope, host = 'localhost', port = 6395) {
	const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
	const allowed = new Set([
		'localhost',
		'127.0.0.1',
		'[::1]',
		host.includes(':') ? `[${host}]` : host,
	])

	if (host === '0.0.0.0' || host === '::') {
		for (const addresses of Object.values(networkInterfaces())) {
			for (const address of addresses ?? []) {
				allowed.add(address.family === 'IPv6' ? `[${address.address}]` : address.address)
			}
		}
	}

	const server = createServer()
	const app = new Hono<{ Bindings: HttpBindings }>()

	app.use('*', async (c, next) => {
		c.header('X-Content-Type-Options', 'nosniff')
		c.header(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
		)
		c.header('Cache-Control', 'no-store')

		const authority = new URL(`http://${c.req.header('host')}`)
		const actualPort = (server.address() as { port: number }).port
		if (!allowed.has(authority.hostname) || (authority.port || '80') !== String(actualPort)) {
			return c.text('Untrusted Host', 403)
		}

		if (c.req.header('origin') && c.req.header('origin') !== authority.origin) {
			return c.text('Untrusted Origin', 403)
		}

		if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
			return c.text('Method not allowed', 405)
		}

		const decoded = decodeURIComponent(c.env.incoming.url!.split('?')[0]!)
		if (decoded.includes('\\') || decoded.split('/').some((s) => s === '.' || s === '..')) {
			return c.text('Invalid path', 400)
		}

		await next()
	})

	app.get('/events', (c) => {
		let client: ReadableStreamDefaultController<Uint8Array>
		const encoder = new TextEncoder()
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				client = controller
				clients.add(controller)
				controller.enqueue(encoder.encode('data: ready\n\n'))
			},
			cancel() {
				clients.delete(client)
			},
		})

		c.req.raw.signal.addEventListener(
			'abort',
			() => {
				clients.delete(client)
			},
			{ once: true },
		)

		return c.newResponse(stream, 200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
		})
	})

	app.get('/api/index', async (c) => c.json(await scope.index()))

	app.get('/api/document', async (c) => {
		const index = await scope.index()
		const document = c.req.query('path') ?? index.defaultDocument
		if (!document || !index.documents.includes(document)) {
			return c.text('Document unavailable', 404)
		}

		return c.json(await renderMarkdown((await scope.read(document)).toString('utf8'), document))
	})

	app.get('/content/*', async (c) => {
		const relative = decodeURIComponent(new URL(c.req.url).pathname.slice(9))
		const type = types[path.extname(relative).toLowerCase()]
		if (!type) {
			return c.text('Asset unavailable', 404)
		}

		if (type === 'image/svg+xml') {
			c.header(
				'Content-Security-Policy',
				"default-src 'none'; style-src 'unsafe-inline'; sandbox",
			)
		}

		if (type === 'application/pdf') {
			c.header('Content-Disposition', 'attachment')
		}

		c.header('Content-Type', type)
		return c.body(new Uint8Array(await scope.read(relative)))
	})

	app.get('/ui/*', async (c) => {
		const relative = decodeURIComponent(new URL(c.req.url).pathname.slice(4))
		const type = uiTypes[path.extname(relative)]
		if (relative.split('/').some((s) => !s || s.startsWith('.') || s.includes('\\')) || !type) {
			return c.text('Not found', 404)
		}

		c.header('Content-Type', type)
		return c.body(new Uint8Array(await readFile(path.join(webRoot, relative))))
	})

	app.get('/', async (c) => c.html(await readFile(path.join(webRoot, 'index.html'), 'utf8')))
	app.get('/doc/*', async (c) => c.html(await readFile(path.join(webRoot, 'index.html'), 'utf8')))

	app.onError((error, c) => {
		if (error instanceof URIError) {
			return c.text('Malformed URL', 400)
		}

		if (
			['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '') ||
			error.message === 'Unavailable path'
		) {
			return c.text('Unavailable path', 404)
		}

		console.error(error)
		return c.text('Unable to load content', 500)
	})

	server.on('request', getRequestListener(app.fetch))

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, host, () => {
			server.off('error', reject)
			resolve()
		})
	})

	const watcher = watch(scope.root, {
		ignoreInitial: true,
		followSymlinks: false,
		ignored: (file, stat) => {
			const relative = path.relative(scope.root, file)
			if (!relative) {
				return false
			}

			const parts = relative.split(path.sep)
			if (parts.some(isExcluded)) {
				return true
			}

			if (scope.selected && stat?.isFile()) {
				return (
					parts.join('/') !== scope.selected && !types[path.extname(file).toLowerCase()]
				)
			}

			if (!scope.recursive && stat?.isFile() && parts.length > 1) {
				return !types[path.extname(file).toLowerCase()]
			}

			if (stat?.isFile()) {
				return !isMarkdown(file) && !types[path.extname(file).toLowerCase()]
			}

			return false
		},
	})

	let timer: ReturnType<typeof setTimeout> | undefined
	watcher.on('all', () => {
		clearTimeout(timer)
		timer = setTimeout(() => {
			for (const client of clients) {
				client.enqueue(new TextEncoder().encode('data: change\n\n'))
			}
		}, 100)
	})

	await new Promise<void>((resolve) => watcher.once('ready', resolve))

	return {
		server,
		url: `http://${host.includes(':') ? `[${host}]` : host}:${
			(server.address() as { port: number }).port
		}`,

		async close() {
			clearTimeout(timer)
			await watcher.close()

			for (const client of clients) {
				client.close()
			}

			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()))
				server.closeAllConnections()
			})
		},
	}
}
