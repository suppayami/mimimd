import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileScope } from '../../src/server/files'
describe('file scope', () => {
	it('orders directories first, selects a root README, and rejects excluded paths', async () => {
		const root = await mkdtemp(path.resolve('tests/.files-'))
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
	it('returns an empty state for an empty directory', async () => {
		const root = await mkdtemp(path.resolve('tests/.empty-'))
		expect(await (await FileScope.create(root)).index()).toMatchObject({
			documents: [],
			defaultDocument: null,
		})
	})
})
