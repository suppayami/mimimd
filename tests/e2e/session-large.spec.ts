import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the packaged server and its module-relative worker.
import { startServer } from '../../dist/server/http.js'

test('displays the complete representative 10 MiB session document', async ({ page }) => {
	test.setTimeout(90000)
	const app = await startServer(null, '127.0.0.1', 0)
	try {
		await page.goto(`${app.url}/session/large`)
		await expect(page.getByRole('status')).toContainText('Document unavailable')
		const paragraph = `${'Readers explore a quiet garden and share their observations. '.repeat(34)}\n\n`
		const half = paragraph.repeat(2524)
		const prefix = `# Beginning marker\n\n${half}\n\n## Middle marker\n\n`
		const ending = '\n\n## Ending marker\n'
		const source =
			prefix +
			half.repeat(2).slice(0, 10 * 1024 * 1024 - prefix.length - ending.length) +
			ending
		expect(Buffer.byteLength(source)).toBe(10 * 1024 * 1024)
		const started = performance.now()
		const response = await fetch(`${app.url}/api/session-documents/large`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Mimimd-Session': app.sessionId,
			},
			body: source,
		})
		expect(response.status).toBe(202)
		await expect(page.getByRole('region', { name: 'Session documents' })).toContainText(
			'Preparing on server',
		)
		await expect(page.getByRole('article', { name: 'Document content' })).toContainText(
			'Beginning marker',
			{ timeout: 70000 },
		)
		await expect(page.getByRole('article', { name: 'Document content' })).toContainText(
			'Middle marker',
		)
		await expect(page.getByRole('article', { name: 'Document content' })).toContainText(
			'Ending marker',
		)
		await expect(page.getByRole('article', { name: 'Document content' })).toHaveAttribute(
			'aria-busy',
			'false',
		)
		await page
			.getByRole('navigation', { name: 'On this page' })
			.getByRole('link', { name: 'Ending marker' })
			.click()
		await expect(page).toHaveURL(/#ending-marker$/)
		await expect(
			page.getByRole('heading', { name: 'Ending marker', exact: true }),
		).toBeVisible()
		console.warn(
			`Chromium: 10 MiB prose reached visible completion and heading navigation in ${Math.round(performance.now() - started)} ms (upload + server + browser).`,
		)
	} finally {
		await app.close()
	}
})
