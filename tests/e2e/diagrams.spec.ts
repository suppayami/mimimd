import { expect, test } from '@playwright/test'

test('prepares diagrams without exposing intermediate content or stale navigation', async ({
	page,
}) => {
	await page.goto('/doc/nested/guide.md')
	const article = page.getByRole('article', { name: 'Document content' })
	await expect(article.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible()

	await page.evaluate(() => {
		const state = Object.assign(window, { documentStates: [] as string[] })
		const article = document.querySelector('article')!
		new MutationObserver(() => {
			state.documentStates.push(article.textContent ?? '')
		}).observe(article, { childList: true, subtree: true })
	})

	// Hold the real, lazy-loaded diagram engine rather than mocking Mermaid's output.
	let release!: () => void
	const ready = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/flowDiagram-*.js', async (route) => {
		await ready
		await route.continue()
	})

	try {
		const requested = page.waitForRequest('**/flowDiagram-*.js')
		await page.getByRole('link', { name: 'Home', exact: true }).click()
		await requested
		await expect(article.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible()
		await expect(page.getByRole('status')).toHaveText('Preparing document…')
		await expect(article).not.toContainText('graph TD')

		await page.getByRole('link', { name: 'layout.md', exact: true }).click()
		await expect(
			page.getByRole('navigation', { name: 'On this page' }).getByRole('link', {
				name: 'Overflow and fallback review',
				exact: true,
			}),
		).toBeVisible()
		release()

		await expect(
			article.getByRole('heading', { name: 'Overflow and fallback review' }),
		).toBeVisible()
		const obsoleteStates = await page.evaluate(
			() => (window as Window & { documentStates: string[] }).documentStates,
		)
		expect(obsoleteStates.some((state) => state.includes('Welcome'))).toBe(false)

		await page.getByRole('link', { name: 'README.md', exact: true }).click()
		await expect(article.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
		await expect(
			article
				.getByRole('img', { name: 'Mermaid diagram' })
				.getByText('Read', { exact: true }),
		).toBeVisible()
		await expect(page.getByRole('status')).toHaveCount(0)

		const states = await page.evaluate(
			() => (window as Window & { documentStates: string[] }).documentStates,
		)
		expect(states.some((state) => state.includes('graph TD'))).toBe(false)
	} finally {
		release()
	}
})
