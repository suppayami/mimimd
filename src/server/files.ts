import type { DocumentIndex, Entry } from '../contracts.js'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { GitIgnore } from './gitignore.js'

export const isMarkdown = (name: string) => /\.(?:md|markdown)$/i.test(name)

export const isExcluded = (name: string) =>
	name.startsWith('.') || name === 'node_modules' || name === 'secrets' || name.endsWith('.key')

export class FileScope {
	private constructor(
		readonly root: string,
		readonly selected: string | null,
		readonly recursive: boolean,
		readonly ignoreRoot: string,
	) {}

	static async create(input: string, recursive = true) {
		const absolute = path.resolve(input)
		if (
			absolute
				.split(path.sep)
				.some(
					(name) =>
						name === 'secrets' ||
						name === '.ssh' ||
						name.startsWith('.env') ||
						name.endsWith('.key'),
				)
		) {
			throw new Error('Private paths are not supported.')
		}

		// Reject symlinks in the input itself as well as every ancestor.
		let current = path.parse(absolute).root
		for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
			current = path.join(current, segment)
			if ((await lstat(current)).isSymbolicLink()) {
				throw new Error('Symbolic links are not supported.')
			}
		}

		const stat = await lstat(absolute)
		if (!stat.isDirectory() && (!stat.isFile() || !isMarkdown(absolute))) {
			throw new Error('Input must be a Markdown file or directory.')
		}

		const root = await realpath(stat.isDirectory() ? absolute : path.dirname(absolute))
		const scope = new FileScope(
			root,
			stat.isDirectory() ? null : path.basename(absolute),
			recursive,
			await GitIgnore.findRoot(root),
		)
		if (scope.selected) {
			await scope.read(scope.selected)
		}

		await scope.index()

		return scope
	}

	async checked(relative: string, ignores = new GitIgnore(this.ignoreRoot)) {
		if (
			(await lstat(this.root)).isSymbolicLink() ||
			(await realpath(this.root)) !== this.root
		) {
			throw new Error('Unavailable path')
		}

		const segments = relative.split('/')
		if (
			!relative ||
			segments.some(
				(s) => !s || s === '.' || s === '..' || isExcluded(s) || /[\\:\0]/.test(s),
			)
		) {
			throw new Error('Unavailable path')
		}

		let current = this.root
		for (const segment of segments) {
			current = path.join(current, segment)
			if ((await lstat(current)).isSymbolicLink()) {
				throw new Error('Unavailable path')
			}
		}

		if (await ignores.isIgnored(current, (await lstat(current)).isDirectory())) {
			throw new Error('Unavailable path')
		}

		return current
	}

	async read(relative: string) {
		const target = await this.checked(relative)
		const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)

		try {
			// Revalidate after opening; the opened inode must still be the checked file.
			const actual = await this.checked(relative)
			const [opened, named] = await Promise.all([handle.stat(), lstat(actual)])
			if (
				process.platform === 'linux' &&
				(await realpath(`/proc/self/fd/${handle.fd}`)) !== target
			) {
				throw new Error('Unavailable path')
			}

			if (
				!opened.isFile() ||
				opened.ino !== named.ino ||
				opened.dev !== named.dev ||
				(await realpath(actual)) !== target
			) {
				throw new Error('Unavailable path')
			}

			return await handle.readFile()
		} finally {
			await handle.close()
		}
	}

	async index(): Promise<DocumentIndex> {
		if (
			(await lstat(this.root)).isSymbolicLink() ||
			(await realpath(this.root)) !== this.root
		) {
			throw new Error('Unavailable path')
		}

		const ignores = new GitIgnore(this.ignoreRoot)
		if (await ignores.isIgnored(this.root, true)) {
			throw new Error('Unavailable path')
		}

		const documents: string[] = []
		const scan = async (prefix: string): Promise<Entry[]> => {
			const names = await readdir(prefix ? await this.checked(prefix, ignores) : this.root, {
				withFileTypes: true,
			})

			names.sort(
				(a, b) =>
					Number(b.isDirectory()) - Number(a.isDirectory()) ||
					a.name.localeCompare(b.name, 'en') ||
					(a.name < b.name ? -1 : 1),
			)

			const entries: Entry[] = []
			for (const item of names) {
				if (isExcluded(item.name) || item.isSymbolicLink()) {
					continue
				}

				const relative = prefix ? `${prefix}/${item.name}` : item.name
				if (await ignores.isIgnored(path.join(this.root, relative), item.isDirectory())) {
					continue
				}

				if (item.isDirectory() && this.recursive && !this.selected) {
					const children = await scan(relative)
					if (children.length) {
						entries.push({ name: item.name, path: relative, children })
					}
				}

				if (
					item.isFile() &&
					isMarkdown(item.name) &&
					(!this.selected || relative === this.selected)
				) {
					documents.push(relative)
					entries.push({ name: item.name, path: relative })
				}
			}

			return entries
		}

		const tree = await scan('')
		const preferred = ['readme.md', 'index.md']
			.map((name) => documents.find((p) => p.toLowerCase() === name))
			.find(Boolean)

		return {
			mode: this.selected ? 'file' : 'folder',
			tree,
			documents,
			defaultDocument: preferred ?? documents[0] ?? null,
		}
	}
}
