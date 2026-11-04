#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArguments } from './args.js'
import { FileScope } from './server/files.js'
import { startServer } from './server/http.js'

try {
	const args = parseArguments(process.argv.slice(2))

	if (args.help) {
		console.log(
			'Usage: mimimd <file.md|directory> [--host localhost] [--port 6395] [--no-recursive] [--open]\n\n--help, -h     Show help\n--version, -v  Show version\nLAN sharing is unauthenticated; use only trusted networks.',
		)
	} else if (args.version) {
		console.log(
			JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version,
		)
	} else {
		const scope = await FileScope.create(args.input, args.recursive)
		const app = await startServer(scope, args.host, args.port)

		console.log(`Serving ${scope.root}\n${app.url}`)
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

		const close = async () => {
			await app.close()
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
