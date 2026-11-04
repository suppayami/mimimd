#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { agentSkill } from './agent-skill.js'
import { parseArguments } from './args.js'
import { discover, registerSession } from './server/discovery.js'
import { FileScope } from './server/files.js'
import { startServer } from './server/http.js'

try {
	const args = parseArguments(process.argv.slice(2))

	if (args.help) {
		console.log(
			'Usage: mimimd [file.md|directory] [--host localhost] [--port 6395] [--no-recursive] [--open]\n       mimimd discover --json\n       mimimd skill\n\nEmpty startup exposes no local files. Bare discover and skill are commands; use ./discover or ./skill for directories.\n\n--help, -h     Show help\n--version, -v  Show version\nLAN sharing is unauthenticated; use only trusted networks.',
		)
	} else if (args.version) {
		console.log(
			JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version,
		)
	} else if (args.command === 'discover') {
		console.log(JSON.stringify(await discover()))
	} else if (args.command === 'skill') {
		console.log(agentSkill)
	} else {
		const scope = args.input ? await FileScope.create(args.input, args.recursive) : null
		const app = await startServer(scope, args.host, args.port)

		let unregister: (() => Promise<void>) | undefined
		try {
			const address = (app.server.address() as { address: string }).address
			const probeHost =
				address === '0.0.0.0' ? '127.0.0.1' : address === '::' ? '::1' : address
			if (['127.0.0.1', '::1'].includes(probeHost)) {
				const probe = new URL('/api/health', app.url)
				probe.hostname = probeHost.includes(':') ? `[${probeHost}]` : probeHost
				const reader = new URL(app.url)
				if (args.host === '0.0.0.0' || args.host === '::') {
					reader.hostname = probe.hostname
				}
				unregister = await registerSession({
					sessionId: app.sessionId,
					pid: process.pid,
					startedAt: new Date().toISOString(),
					probeUrl: probe.href,
					readerUrl: reader.origin,
					scopeLabel: scope?.root ?? 'Empty session',
					protocolVersion: 1,
				})
			} else {
				console.warn(
					'Discovery unavailable: this explicit binding has no loopback probe endpoint.',
				)
			}
		} catch (error) {
			await app.close()
			throw error
		}

		console.log(`Serving ${scope?.root ?? 'empty session'}\n${app.url}`)
		if (!['localhost', '127.0.0.1', '::1'].includes(args.host!)) {
			console.warn('Warning: LAN access has no authentication. Use only a trusted network.')
		}

		if (args.open) {
			const command =
				process.platform === 'darwin'
					? 'open'
					: process.platform === 'win32'
						? 'explorer.exe'
						: 'xdg-open'
			const child = spawn(command, [app.url], { stdio: 'ignore' })
			child.on('error', (error) => console.error(`Could not open browser: ${error.message}`))
			child.unref()
		}

		let closing = false
		const close = async () => {
			if (closing) {
				return
			}
			closing = true
			try {
				await app.close()
				await unregister?.()
			} catch (error) {
				console.error(`mimimd: ${(error as Error).message}`)
				process.exitCode = 1
			}
		}

		process.once('SIGINT', close)
		process.once('SIGTERM', close)
	}
} catch (error) {
	const detail =
		(error as NodeJS.ErrnoException).code === 'EADDRINUSE'
			? 'Port is occupied. Choose another port with --port.'
			: (error as Error).message

	console.error(`mimimd: ${detail}`)
	process.exitCode = 1
}
