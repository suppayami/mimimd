import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
// eslint-disable-next-line antfu/no-import-dist -- Verify compiled reader routes and worker links.
import { FileScope } from '../../dist/server/files.js'
// eslint-disable-next-line antfu/no-import-dist -- Verify compiled reader routes and worker links.
import { startServer } from '../../dist/server/http.js'

test('uses map URLs across filesystem/session namespaces, encoded names, fragments and history', async ({
	page,
}) => {
	const root = await mkdtemp(path.resolve('tests/.publishing-'))
	let app: Awaited<ReturnType<typeof startServer>> | undefined
	try {
		await mkdir(path.join(root, '.git'))
		const file = path.join(root, 'notes #%.md')
		await writeFile(file, '# File anchor')
		app = await startServer(await FileScope.create(file), '127.0.0.1', 0)
		const headers = {
			'Content-Type': 'text/markdown; charset=utf-8',
			'X-Mimimd-Session': app.sessionId,
		}
		const fileMap = await (await fetch(`${app.url}/api/documents`)).json()
		const fileUrl = fileMap.documents[0].readerUrl
		await fetch(`${app.url}/api/session-documents/linked`, {
			method: 'PUT',
			headers,
			body: `# Session anchor\n\n[File map link](${fileUrl}#file-anchor)`,
		})
		const url = app.url
		await expect
			.poll(
				async () =>
					(await (await fetch(`${url}/api/session-documents/linked/status`)).json())
						.state,
			)
			.toBe('ready')
		const map = await (await fetch(`${url}/api/documents`)).json()
		const sessionUrl = map.documents.find(
			(entry: { source: string }) => entry.source === 'session',
		).readerUrl
		await writeFile(file, `# File anchor\n\n[Session map link](${sessionUrl}#session-anchor)`)
		await page.goto(fileUrl)
		await page.getByRole('link', { name: 'Session map link' }).click()
		await expect(page).toHaveURL(`${sessionUrl}#session-anchor`)
		await expect(
			page.getByRole('heading', { name: 'Session anchor', exact: true }),
		).toBeVisible()
		await page.getByRole('link', { name: 'File map link' }).click()
		await expect(page).toHaveURL(`${fileUrl}#file-anchor`)
		await expect(page.getByRole('heading', { name: 'File anchor', exact: true })).toBeVisible()
		await page.reload()
		await expect(page.getByRole('heading', { name: 'File anchor', exact: true })).toBeVisible()
		await page.goBack()
		await expect(
			page.getByRole('heading', { name: 'Session anchor', exact: true }),
		).toBeVisible()
	} finally {
		await app?.close()
		await rm(root, { recursive: true, force: true })
	}
})
