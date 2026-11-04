import { spawn } from 'node:child_process'
import { mkdtemp, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
test('refreshes edits and renames while retaining the active route and theme', async ({ page }) => {
	const root = await mkdtemp(path.resolve('tests/.live-'))
	const source = path.join(root, 'README.md')
	const image = path.join(root, 'icon.svg')
	await writeFile(
		image,
		'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Original image</title></svg>',
	)
	await writeFile(source, '# Before\n\n![Live image](icon.svg)')
	const child = spawn('node', ['dist/cli.js', root, '--port', '3198'], {
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	try {
		await new Promise<void>((resolve, reject) => {
			child.stdout.on('data', (chunk) => {
				if (String(chunk).includes('http://')) {
					resolve()
				}
			})
			child.once('error', reject)
			child.once('exit', (code) => reject(new Error(`CLI exited: ${code}`)))
		})
		await page.goto('http://localhost:3198')
		await expect(page.getByRole('heading', { name: 'Before', exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Switch to dark theme' }).click()
		await writeFile(source, '# After\n\n![Live image](icon.svg)')
		await expect(page.getByRole('heading', { name: 'After', exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
		expect(new URL(page.url()).pathname).toBe('/doc/README.md')
		const refreshedImage = page.waitForResponse(
			(response) => response.url().includes('/content/icon.svg') && response.status() === 200,
		)
		await writeFile(
			image,
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Updated image</title></svg>',
		)
		expect(await (await refreshedImage).text()).toContain('Updated image')
		await rename(source, path.join(root, 'renamed.md'))
		await expect(page.getByRole('status')).toContainText('Document unavailable')
		await expect(page.getByRole('link', { name: 'renamed.md', exact: true })).toBeVisible()
		await page.getByRole('link', { name: 'renamed.md', exact: true }).click()
		await expect(page.getByRole('heading', { name: 'After', exact: true })).toBeVisible()
	} finally {
		child.kill('SIGINT')
		await new Promise<void>((resolve) => child.once('exit', () => resolve()))
	}
})
