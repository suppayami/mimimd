import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { expect, test } from '@playwright/test'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the packaged server and its module-relative worker.
import { FileScope } from '../../dist/server/files.js'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the packaged server and its module-relative worker.
import { startServer } from '../../dist/server/http.js'

test('empty reader preserves selection, shows upload status, replaces atomically, and follows map links', async ({
	page,
}) => {
	const app = await startServer(null, '127.0.0.1', 0)
	const headers = {
		'Content-Type': 'text/markdown; charset=utf-8',
		'X-Mimimd-Session': app.sessionId,
	}
	const put = async (key: string, body: string) => {
		const response = await fetch(`${app.url}/api/session-documents/${key}`, {
			method: 'PUT',
			headers,
			body,
		})
		expect(response.status).toBe(202)
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/${key}/status`)).json())
						.state,
			)
			.toBe('ready')
	}
	let upload: ReturnType<typeof httpRequest> | undefined
	try {
		await page.goto(app.url)
		await expect(page.getByRole('main').getByRole('status')).toContainText('Welcome to mimimd')
		upload = httpRequest(
			`${app.url}/api/session-documents/first`,
			{ method: 'PUT', headers },
			(response) => response.resume(),
		)
		upload.on('error', () => {})
		upload.write('# First version\n\n')
		await expect(page.getByRole('region', { name: 'Session documents' })).toContainText(
			'Receiving Markdown',
		)
		expect(new URL(page.url()).pathname).toBe('/')
		// Session-relative images are rejected, but must not prevent the article from displaying.
		upload.end('First body\n\n![Unavailable relative image](image.png)')
		await expect(page.getByRole('region', { name: 'Session documents' })).not.toContainText(
			'Receiving Markdown',
		)
		await expect(page.getByRole('main').getByRole('status')).toContainText('Welcome to mimimd')
		await page.getByRole('link', { name: 'first', exact: true }).click()
		await expect(
			page.getByRole('heading', { name: 'First version', exact: true }),
		).toBeVisible()
		await put('second', `# Second\n\n[First document](${app.url}/session/first#first-version)`)
		expect(new URL(page.url()).pathname).toBe('/session/first')
		upload = httpRequest(
			`${app.url}/api/session-documents/first`,
			{ method: 'PUT', headers },
			(response) => response.resume(),
		)
		upload.on('error', () => {})
		upload.write('# Replacement\n\n')
		await expect(page.getByRole('region', { name: 'Session documents' })).toContainText(
			'Receiving Markdown',
		)
		await expect(
			page.getByRole('heading', { name: 'First version', exact: true }),
		).toBeVisible()
		upload.end('Replacement body\n\n![Unavailable relative image](image.png)')
		await expect(page.getByRole('heading', { name: 'Replacement', exact: true })).toBeVisible()
		const bad = await fetch(`${app.url}/api/session-documents/first`, {
			method: 'PUT',
			headers,
			body: Buffer.from([0xff]),
		})
		expect(bad.status).toBe(400)
		await expect(page.getByRole('region', { name: 'Session documents' })).toContainText(
			'Ask the publisher to retry',
		)
		await expect(page.getByRole('heading', { name: 'Replacement', exact: true })).toBeVisible()
		await page.getByRole('link', { name: 'second', exact: true }).click()
		await expect(page.getByRole('heading', { name: 'Second', exact: true })).toBeVisible()
		await page.getByRole('link', { name: 'First document' }).click()
		await expect(page.getByRole('heading', { name: 'Replacement', exact: true })).toBeVisible()
		await page.goBack()
		await expect(page.getByRole('heading', { name: 'Second', exact: true })).toBeVisible()
		await page.reload()
		await expect(page.getByRole('heading', { name: 'Second', exact: true })).toBeVisible()
	} finally {
		upload?.destroy()
		await app.close()
	}
})

test('late rendered responses cannot replace a newer committed revision', async ({ page }) => {
	const app = await startServer(null, '127.0.0.1', 0)
	let release: (() => void) | undefined
	let intercepted: (() => void) | undefined
	const paused = new Promise<void>((resolve) => {
		intercepted = resolve
	})
	const put = async (body: string, revision: number) => {
		await fetch(`${app.url}/api/session-documents/race`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Mimimd-Session': app.sessionId,
			},
			body,
		})
		await expect
			.poll(
				async () =>
					(await (await fetch(`${app.url}/api/session-documents/race/status`)).json())
						.revision,
			)
			.toBe(revision)
	}
	try {
		await put('# Original', 1)
		await page.goto(`${app.url}/session/race`)
		await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible()
		await page.route('**/api/session-documents/race', async (route) => {
			const response = await route.fetch()
			const data = await response.json()
			if (data.revision === 2) {
				await new Promise<void>((resolve) => {
					release = resolve
					intercepted!()
				})
			}
			await route.fulfill({ response })
		})
		await put('# Stale response', 2)
		await paused
		await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible()
		await put('# Latest response', 3)
		await expect(
			page.getByRole('heading', { name: 'Latest response', exact: true }),
		).toBeVisible()
		release!()
		await page.unrouteAll({ behavior: 'wait' })
		await expect(
			page.getByRole('heading', { name: 'Latest response', exact: true }),
		).toBeVisible()
		await expect(
			page.getByRole('heading', { name: 'Stale response', exact: true }),
		).toHaveCount(0)
	} finally {
		release?.()
		await app.close()
	}
})

test('file mode keeps selected filesystem document and offers session navigation', async ({
	page,
}) => {
	const app = await startServer(
		await FileScope.create('tests/fixtures/README.md'),
		'127.0.0.1',
		0,
	)
	try {
		await page.goto(app.url)
		await expect(page).toHaveURL(/\/doc\/README.md$/)
		const map = await (await fetch(`${app.url}/api/documents`)).json()
		await fetch(`${app.url}/api/session-documents/link`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'X-Mimimd-Session': app.sessionId,
			},
			body: `# Session link\n\n[Back to file](${map.documents[0].readerUrl})`,
		})
		await expect(page.getByRole('link', { name: 'link', exact: true })).toBeVisible()
		await expect(page).toHaveURL(/\/doc\/README.md$/)
		await page.getByRole('link', { name: 'link', exact: true }).click()
		await expect(page.getByRole('heading', { name: 'Session link', exact: true })).toBeVisible()
		await page.getByRole('link', { name: 'Back to file' }).click()
		await expect(page).toHaveURL(/\/doc\/README.md$/)
	} finally {
		await app.close()
	}
})
