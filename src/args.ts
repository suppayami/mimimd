import { parseArgs } from 'node:util'

export function parseArguments(args: string[]) {
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
		},
	})

	if (values.help || values.version) {
		return { ...values, input: '', port: 6395, recursive: true }
	}

	if (positionals.length !== 1) {
		throw new Error('Provide exactly one Markdown file or directory. Use --help for usage.')
	}

	if (!values.host?.trim() || values.host !== values.host.trim()) {
		throw new Error('--host must be a hostname or IP address.')
	}

	const port = Number(values.port)
	if (!/^\d+$/.test(values.port!) || port < 1 || port > 65535) {
		throw new Error('--port must be an integer from 1 to 65535.')
	}

	return { ...values, input: positionals[0]!, port, recursive: !values['no-recursive'] }
}
