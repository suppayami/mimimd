import type { HttpBindings } from '@hono/node-server'
import type { FileScope } from './files.js'
import type { SessionOptions } from './session.js'
import { randomUUID } from 'node:crypto'
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
import { GitIgnore } from './gitignore.js'
import { PublishError, publishingLimits, SessionStore } from './session.js'

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

export async function startServer(
	scope: FileScope | null = null,
	host = 'localhost',
	port = 6395,
	options: SessionOptions = {},
) {
	const sessionId = randomUUID()
	const sessions = new SessionStore(sessionId, options)
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
			return c.json({ error: { code: 'untrusted_host', message: 'Untrusted Host' } }, 403)
		}

		if (c.req.header('origin') && c.req.header('origin') !== authority.origin) {
			return c.json({ error: { code: 'untrusted_origin', message: 'Untrusted Origin' } }, 403)
		}

		if (
			c.req.method !== 'GET' &&
			c.req.method !== 'HEAD' &&
			!(c.req.method === 'PUT' && /^\/api\/session-documents\/[^/]+$/.test(c.req.path))
		) {
			return c.json(
				{ error: { code: 'method_not_allowed', message: 'Method not allowed' } },
				405,
			)
		}

		const decoded = decodeURIComponent(c.env.incoming.url!.split('?')[0]!)
		if (decoded.includes('\\') || decoded.split('/').some((s) => s === '.' || s === '..')) {
			return c.json({ error: { code: 'invalid_path', message: 'Invalid path' } }, 400)
		}

		await next()
	})

	const broadcast = (message: string) => {
		for (const client of clients) {
			if ((client.desiredSize ?? 0) <= 0) {
				client.close()
				clients.delete(client)
				continue
			}
			client.enqueue(new TextEncoder().encode(message))
		}
	}
	sessions.subscribe((status) =>
		broadcast(`event: session-status\ndata: ${JSON.stringify(status)}\n\n`),
	)

	app.get('/events', (c) => {
		let client: ReadableStreamDefaultController<Uint8Array>
		const encoder = new TextEncoder()
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				client = controller
				clients.add(controller)
				controller.enqueue(
					encoder.encode(
						`data: ready\n\nevent: session-snapshot\ndata: ${JSON.stringify({ sessionId, attempts: sessions.snapshot() })}\n\n`,
					),
				)
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

	const readerHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
	const readerUrl = () =>
		`http://${readerHost.includes(':') ? `[${readerHost}]` : readerHost}:${(server.address() as { port: number }).port}`
	const loopback = (address: string | undefined) =>
		!!address && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
	const writable = () =>
		['localhost', '127.0.0.1', '::1'].includes(host) &&
		loopback((server.address() as { address: string }).address)

	app.get('/api/health', (c) =>
		c.json({
			product: 'mimimd',
			protocolVersion: 1,
			sessionId,
			readerUrl: readerUrl(),
			writable: writable(),
			limits: publishingLimits,
		}),
	)

	app.put('/api/session-documents/:key', async (c) => {
		if (!writable() || !loopback(c.env.incoming.socket.remoteAddress)) {
			return c.json(
				{
					error: {
						code: 'forbidden',
						message: 'Publishing requires an explicit loopback binding and peer.',
					},
				},
				403,
			)
		}
		if (c.req.header('X-Mimimd-Session') !== sessionId) {
			return c.json(
				{
					error: {
						code: 'session_mismatch',
						message: 'Verify the current session identity.',
					},
				},
				409,
			)
		}
		if (
			!/^text\/markdown\s*;\s*charset=utf-8$/i.test(c.req.header('content-type') ?? '') ||
			c.req.header('content-encoding')
		) {
			return c.json(
				{
					error: {
						code: 'unsupported_media',
						message: 'Send uncompressed text/markdown; charset=utf-8.',
					},
				},
				415,
			)
		}
		const key = c.req.param('key')
		const attempt = sessions.begin(key, c.req.header('content-length'))
		await sessions.receive(attempt, c.req.raw)
		return c.json(
			{
				key,
				attemptId: attempt.attemptId,
				sessionId,
				readerUrl: `${readerUrl()}/session/${key}`,
				statusUrl: `${readerUrl()}/api/session-documents/${key}/status`,
			},
			202,
		)
	})

	app.get('/api/session-documents/:key/status', (c) => {
		const status = sessions.status(c.req.param('key'))
		return status
			? c.json(status)
			: c.json({ error: { code: 'not_found', message: 'No attempt for this key.' } }, 404)
	})

	app.get('/api/session-documents/:key', (c) => {
		const serialized = sessions.read(c.req.param('key'))
		return serialized
			? c.body(serialized, 200, { 'Content-Type': 'application/json' })
			: c.json({ error: { code: 'not_found', message: 'No committed document.' } }, 404)
	})

	app.get('/api/documents', async (c) => {
		const index = scope ? await scope.index() : null
		return c.json({
			sessionId,
			documents: [
				...(index?.documents ?? []).map((document) => ({
					id: `filesystem:${document}`,
					source: 'filesystem',
					path: document,
					label: document,
					readerUrl: `${readerUrl()}/doc/${document.split('/').map(encodeURIComponent).join('/')}`,
					writable: false,
				})),
				...sessions.entries().map(({ key, revision }) => ({
					id: `session:${key}`,
					source: 'session',
					key,
					label: key,
					revision,
					readerUrl: `${readerUrl()}/session/${key}`,
					writable: writable(),
				})),
			],
		})
	})

	app.get('/api/index', async (c) =>
		c.json(
			scope
				? await scope.index()
				: { mode: 'empty', tree: [], documents: [], defaultDocument: null },
		),
	)

	app.get('/api/document', async (c) => {
		if (!scope) {
			return c.text('Document unavailable', 404)
		}
		const document = c.req.query('path') ?? (await scope.index()).defaultDocument
		if (
			!document ||
			!isMarkdown(document) ||
			(scope.selected !== null && document !== scope.selected) ||
			(!scope.recursive && document.includes('/'))
		) {
			return c.text('Document unavailable', 404)
		}

		return c.json(await renderMarkdown((await scope.read(document)).toString('utf8'), document))
	})

	app.get('/content/*', async (c) => {
		if (!scope) {
			return c.text('Asset unavailable', 404)
		}
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

	app.get('/session/:key', async (c) =>
		c.html(await readFile(path.join(webRoot, 'index.html'), 'utf8')),
	)

	app.onError((error, c) => {
		if (error instanceof PublishError) {
			if (error.status === 503) {
				c.header('Retry-After', '1')
			}
			return c.json({ error: { code: error.code, message: error.message } }, error.status)
		}
		if (error instanceof URIError) {
			return c.json({ error: { code: 'invalid_path', message: 'Malformed URL' } }, 400)
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

	server.on('request', getRequestListener(app.fetch, { overrideGlobalObjects: false }))

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, host, () => {
			server.off('error', reject)
			resolve()
		})
	})

	const stopWatching = scope
		? await watchScope(scope, () => broadcast('data: change\n\n'))
		: async () => {}

	return {
		server,
		url: readerUrl(),
		sessionId,
		async close() {
			await stopWatching()
			await sessions.close()
			for (const client of clients) {
				client.close()
			}
			clients.clear()
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()))
				server.closeAllConnections()
			})
		},
	}
}

async function watchScope(scope: FileScope, broadcast: () => void) {
	const ignoreFiles = new Set<string>()
	for (let directory = scope.root; ; directory = path.dirname(directory)) {
		ignoreFiles.add(path.join(directory, '.gitignore'))
		if (directory === scope.ignoreRoot) {
			break
		}
	}

	let ignores = new GitIgnore(scope.ignoreRoot)
	const createWatcher = () =>
		watch([scope.root, ...ignoreFiles], {
			ignoreInitial: true,
			followSymlinks: false,
			ignored: (file, stat) => {
				if (ignoreFiles.has(file)) {
					return false
				}

				const relative = path.relative(scope.root, file)
				if (!relative) {
					return false
				}

				const parts = relative.split(path.sep)
				if (parts.at(-1) === '.gitignore' && !parts.slice(0, -1).some(isExcluded)) {
					return false
				}

				if (parts.some(isExcluded)) {
					return true
				}

				if (stat && ignores.isIgnored(file, stat.isDirectory())) {
					return true
				}

				if (scope.selected && stat?.isFile()) {
					return (
						parts.join('/') !== scope.selected &&
						!types[path.extname(file).toLowerCase()]
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

	let watcher = createWatcher()
	let timer: ReturnType<typeof setTimeout> | undefined
	let closed = false
	let rebuild = Promise.resolve()

	const notify = () => {
		clearTimeout(timer)
		timer = setTimeout(() => {
			broadcast()
		}, 100)
	}

	const onChange = (_event: string, file: string) => {
		if (path.basename(file) !== '.gitignore') {
			notify()
			return
		}

		// Rewalk with fresh rules so newly unignored directories gain watches too.
		rebuild = rebuild.then(async () => {
			await watcher.close()
			if (closed) {
				return
			}

			ignores = new GitIgnore(scope.ignoreRoot)
			watcher = createWatcher()
			watcher.on('all', onChange)
			await new Promise<void>((resolve) => watcher.once('ready', resolve))
			if (!closed) {
				notify()
			}
		})
	}

	watcher.on('all', onChange)
	await new Promise<void>((resolve) => watcher.once('ready', resolve))

	return async () => {
		closed = true
		clearTimeout(timer)
		await rebuild
		await watcher.close()
	}
}
