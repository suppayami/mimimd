import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

interface Rule {
	pattern: RegExp
	negated: boolean
	directoryOnly: boolean
}

const characterClasses: Record<string, string> = {
	alnum: 'a-zA-Z0-9',
	alpha: 'a-zA-Z',
	blank: ' \\t',
	cntrl: '\\x00-\\x1f\\x7f',
	digit: '0-9',
	graph: '\\x21-\\x7e',
	lower: 'a-z',
	print: '\\x20-\\x7e',
	punct: '!-/:-@\\[-`{-~',
	space: '\\t-\\r ',
	upper: 'A-Z',
	xdigit: 'a-fA-F0-9',
}

function globPattern(glob: string): string {
	let result = ''
	for (let index = 0; index < glob.length; index++) {
		const char = glob[index]!
		if (char === '\\' && index + 1 < glob.length) {
			result += glob[++index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			continue
		}

		if (char === '*') {
			let end = index
			while (glob[end + 1] === '*') {
				end++
			}

			const globstar = end - index === 1 && (index === 0 || glob[index - 1] === '/')
			if (globstar && glob[end + 1] === '/') {
				result += '(?:[^/]+/)*'
				index = end + 1
				continue
			}

			result += globstar && end === glob.length - 1 ? '[\\s\\S]*' : '[^/]*'
			index = end
			continue
		}

		if (char === '?') {
			result += '[^/]'
			continue
		}

		if (char === '[') {
			let end = index + 1
			let content = ''
			if (glob[end] === '!' || glob[end] === '^') {
				content = '^'
				end++
			}

			if (glob[end] === ']') {
				content += '\\]'
				end++
			}

			for (; end < glob.length && glob[end] !== ']'; end++) {
				const named = glob.slice(end).match(/^\[:([a-z]+):\]/)
				if (named && characterClasses[named[1]!]) {
					content += characterClasses[named[1]!]!
					end += named[0].length - 1
					continue
				}

				if (glob[end] === '\\' && end + 1 < glob.length) {
					content += `\\${glob[++end]}`
					continue
				}

				content += glob[end] === '[' ? '\\[' : glob[end]
			}

			if (end === glob.length) {
				return '(?!)'
			}

			result += `(?!/)[${content}]`
			index = end
			continue
		}

		result += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	return result
}

function parseRules(source: string): Rule[] {
	const rules: Rule[] = []
	for (let line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		while (line.endsWith(' ')) {
			let backslashes = 0
			for (let index = line.length - 2; index >= 0 && line[index] === '\\'; index--) {
				backslashes++
			}

			if (backslashes % 2) {
				break
			}

			line = line.slice(0, -1)
		}

		if (!line || line.startsWith('#')) {
			continue
		}

		const negated = line.startsWith('!')
		if (negated) {
			line = line.slice(1)
		}

		const directoryOnly = line.endsWith('/')
		if (directoryOnly) {
			line = line.slice(0, -1)
		}

		const anchored = line.includes('/')
		if (line.startsWith('/')) {
			line = line.slice(1)
		}

		if (!line) {
			continue
		}

		try {
			rules.push({
				pattern: new RegExp(
					`${anchored ? '^' : '(?:^|/)'}${globPattern(line)}(?![\\s\\S])`,
				),
				negated,
				directoryOnly,
			})
		} catch (error) {
			// Invalid bracket expressions do not match paths in Git either.
			if (!(error instanceof SyntaxError)) {
				throw error
			}
		}
	}

	return rules
}

async function statIfPresent(target: string) {
	try {
		return await lstat(target)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null
		}

		throw error
	}
}

export class GitIgnore {
	private readonly rules = new Map<string, Promise<Rule[]>>()

	constructor(private readonly root: string) {}

	static async findRoot(directory: string) {
		let current = directory
		while (true) {
			if (await statIfPresent(path.join(current, '.git'))) {
				return current
			}

			const parent = path.dirname(current)
			if (parent === current) {
				return directory
			}

			current = parent
		}
	}

	private async load(directory: string) {
		let rules = this.rules.get(directory)
		if (!rules) {
			rules = (async () => {
				const matcher: Rule[] = []
				const target = path.join(directory, '.gitignore')
				if (!(await statIfPresent(target))?.isFile()) {
					return matcher
				}

				const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
				try {
					return parseRules(await handle.readFile('utf8'))
				} finally {
					await handle.close()
				}
			})()
			this.rules.set(directory, rules)
		}

		return rules
	}

	async isIgnored(target: string, directory: boolean) {
		const segments = path.relative(this.root, target).split(path.sep).filter(Boolean)
		const ancestors: { directory: string; matcher: Rule[] }[] = []
		let current = this.root
		for (const [index, segment] of segments.entries()) {
			ancestors.push({ directory: current, matcher: await this.load(current) })
			current = path.join(current, segment)
			const isDirectory = index < segments.length - 1 || directory
			let ignored = false
			for (const ancestor of ancestors) {
				const relative = path
					.relative(ancestor.directory, current)
					.split(path.sep)
					.join('/')
				for (const rule of ancestor.matcher) {
					if ((!rule.directoryOnly || isDirectory) && rule.pattern.test(relative)) {
						ignored = !rule.negated
					}
				}
			}

			// Git cannot re-include children of an excluded directory.
			if (ignored) {
				return true
			}
		}

		return false
	}
}
