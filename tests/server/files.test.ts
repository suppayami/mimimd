import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileScope } from '../../src/server/files'
describe('file scope', () => {
	it('orders directories first, selects a root README, and rejects excluded paths', async () => {
		const root = await mkdtemp(path.resolve('tests/.files-'))
		await mkdir(path.join(root, '.git'))
		await mkdir(path.join(root, 'nested'))
		await writeFile(path.join(root, 'nested', 'a.MARKDOWN'), '# Nested')
		await writeFile(path.join(root, 'README.MD'), '# Root')
		await writeFile(path.join(root, '.hidden.md'), 'private')
		await symlink(path.join(root, 'README.MD'), path.join(root, 'link.md'))
		const scope = await FileScope.create(root)
		const index = await scope.index()
		expect(index.documents).toEqual(['nested/a.MARKDOWN', 'README.MD'])
		expect(index.defaultDocument).toBe('README.MD')
		for (const name of ['../README.md', '.hidden.md', 'link.md', 'nested/../../README.md']) {
			await expect(scope.read(name)).rejects.toThrow()
		}
		expect((await (await FileScope.create(root, false)).index()).documents).toEqual([
			'README.MD',
		])
		expect(
			(await (await FileScope.create(path.join(root, 'README.MD'))).index()).documents,
		).toEqual(['README.MD'])
	})
	it('applies repository and nested ignore rules to discovery and direct reads', async () => {
		const root = await mkdtemp(path.resolve('tests/.gitignore-'))
		// A .git file also marks a repository boundary (for example, a worktree).
		await writeFile(path.join(root, '.git'), 'gitdir: unused')
		await mkdir(path.join(root, 'docs', 'blocked'), { recursive: true })
		await mkdir(path.join(root, 'elsewhere'))
		await writeFile(
			path.join(root, '.gitignore'),
			'# Comment\n*.md\n!keep.md\n/docs/root-only.svg\nblocked/\n*.png\n',
		)
		await writeFile(
			path.join(root, 'docs', '.gitignore'),
			'!guide.md\n!blocked/hidden.md\nkeep.md\n',
		)
		for (const relative of [
			'keep.md',
			'hidden.md',
			'docs/guide.md',
			'docs/keep.md',
			'docs/blocked/hidden.md',
			'docs/root-only.svg',
			'docs/image.png',
			'elsewhere/root-only.svg',
		]) {
			await writeFile(path.join(root, relative), relative)
		}

		const scope = await FileScope.create(root)
		expect((await scope.index()).documents).toEqual(['docs/guide.md', 'keep.md'])
		for (const relative of [
			'hidden.md',
			'docs/keep.md',
			'docs/blocked/hidden.md',
			'docs/root-only.svg',
			'docs/image.png',
		]) {
			await expect(scope.read(relative)).rejects.toThrow('Unavailable path')
		}
		expect((await scope.read('elsewhere/root-only.svg')).toString()).toBe(
			'elsewhere/root-only.svg',
		)
		expect((await (await FileScope.create(path.join(root, 'docs'))).index()).documents).toEqual(
			['guide.md'],
		)
		await expect(FileScope.create(path.join(root, 'hidden.md'))).rejects.toThrow()
		await expect(FileScope.create(path.join(root, 'docs', 'blocked'))).rejects.toThrow()
		expect(
			(await (await FileScope.create(path.join(root, 'docs', 'guide.md'))).index()).documents,
		).toEqual(['guide.md'])
	})

	it('matches globstars, anchoring, character classes, escapes, and directory-only patterns', async () => {
		const root = await mkdtemp(path.resolve('tests/.patterns-'))
		await mkdir(path.join(root, '.git'))
		await writeFile(
			path.join(root, '.gitignore'),
			[
				'/root.md',
				'**/draft?.md',
				'a/**/note.md',
				'archive/**',
				'[ab].md',
				'number[[:digit:]].md',
				'letter[!a-c].md',
				'\\#literal.md',
				'\\!literal.md',
				'literal\\*.md',
				'trailing.md   ',
				'space\\ ',
				'cache/',
				'# comment.md',
				'literal[.md',
				'reversed[z-a].md',
			].join('\r\n'),
		)
		const ignored = [
			'root.md',
			'draft1.md',
			'nested/draft2.md',
			'a/note.md',
			'a/deep/note.md',
			'archive/old.md',
			'archive/line\nbreak.md',
			'a.md',
			'b.md',
			'number7.md',
			'letterz.md',
			'#literal.md',
			'!literal.md',
			'literal*.md',
			'trailing.md',
			'space ',
			'cache/note.md',
		]
		const allowed = [
			'nested/root.md',
			'draft12.md',
			'other/note.md',
			'c.md',
			'numberx.md',
			'letterb.md',
			'literalX.md',
			'comment.md',
			'nested/cache.md',
			'literal[.md',
			'reversedz.md',
		]
		for (const relative of [...ignored, ...allowed]) {
			await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
			await writeFile(path.join(root, relative), '# Document')
		}

		const scope = await FileScope.create(root)
		expect((await scope.index()).documents.sort()).toEqual([...allowed].sort())
		for (const relative of ignored) {
			await expect(scope.read(relative)).rejects.toThrow('Unavailable path')
		}
		for (const relative of allowed) {
			expect((await scope.read(relative)).toString()).toBe('# Document')
		}
	})

	it('rechecks ignore rules after edits and does not follow symlinked ignore files', async () => {
		const root = await mkdtemp(path.resolve('tests/.ignore-edits-'))
		await mkdir(path.join(root, '.git'))
		await writeFile(path.join(root, 'guide.md'), '# Guide')
		const scope = await FileScope.create(root)
		await writeFile(path.join(root, '.gitignore'), 'guide.md\n')
		expect((await scope.index()).documents).toEqual([])
		await expect(scope.read('guide.md')).rejects.toThrow('Unavailable path')
		await writeFile(path.join(root, '.gitignore'), '!guide.md\n')
		expect((await scope.index()).documents).toEqual(['guide.md'])
		expect((await scope.read('guide.md')).toString()).toBe('# Guide')

		await mkdir(path.join(root, 'nested'))
		await writeFile(path.join(root, 'nested', 'guide.md'), '# Nested')
		await writeFile(path.join(root, 'rules.txt'), '*.md\n')
		await symlink(path.join(root, 'rules.txt'), path.join(root, 'nested', '.gitignore'))
		expect((await scope.index()).documents).toEqual(['nested/guide.md', 'guide.md'])
	})

	it('returns an empty state for an empty directory', async () => {
		const root = await mkdtemp(path.resolve('tests/.empty-'))
		await mkdir(path.join(root, '.git'))
		expect(await (await FileScope.create(root)).index()).toMatchObject({
			documents: [],
			defaultDocument: null,
		})
	})
})
