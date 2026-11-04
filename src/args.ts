import { parseArgs } from 'node:util'

export function parseArguments(args: string[]) {
	const command = args[0] === 'discover' || args[0] === 'skill' ? args[0] : 'serve'
	if (command !== 'serve') {
		args = args.slice(1)
	}
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			host: { type: 'string', default: 'localhost' },
			port: { type: 'string', default: '6395' },
			'no-recursive': { type: 'boolean' },
			open: { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
			version: { type: 'boolean', short: 'v' },
			json: { type: 'boolean' },
		},
	})

	if (values.help || values.version) {
		return { ...values, command, input: '', port: 6395, recursive: true }
	}

	if (
		command !== 'serve' &&
		(positionals.length ||
			args.some((arg) => arg !== '--json') ||
			(command === 'discover' && !values.json) ||
			(command === 'skill' && values.json))
	) {
		throw new Error('Use mimimd discover --json or mimimd skill without server options.')
	}
	if (command === 'serve' && values.json) {
		throw new Error('--json is only supported by discover.')
	}

	if (positionals.length > 1) {
		throw new Error('Provide at most one Markdown file or directory. Use --help for usage.')
	}

	if (!values.host?.trim() || values.host !== values.host.trim()) {
		throw new Error('--host must be a hostname or IP address.')
	}

	const port = Number(values.port)
	if (!/^\d+$/.test(values.port!) || port < 1 || port > 65535) {
		throw new Error('--port must be an integer from 1 to 65535.')
	}

	return {
		...values,
		command,
		input: positionals[0] ?? '',
		port,
		recursive: !values['no-recursive'],
	}
}
