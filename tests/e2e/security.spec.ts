import { expect, test } from '@playwright/test'
test('malicious content and diagrams cannot execute and failures stay local', async ({ page }) => {
	await page.goto('/doc/security.md')
	await expect(page.getByRole('heading', { name: 'Untrusted content' })).toBeVisible()
	await expect(page.getByText('Diagram unavailable.', { exact: false })).toHaveCount(3)
	await expect(page.getByRole('heading', { name: 'Still readable' })).toBeVisible()
	expect(await page.evaluate(() => '__compromised' in window)).toBe(false)
	expect(await page.locator('article a[href^="javascript:"]').count()).toBe(0)
	await page.goto('/content/unsafe.svg')
	expect(await page.evaluate(() => '__compromised' in window)).toBe(false)
})
test('renders math, code and diagrams without external requests', async ({ page }) => {
	const external: string[] = []
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).origin !== 'http://localhost:3100') {
			external.push(route.request().url())
			await route.abort()
			return
		}
		await route.continue()
	})
	await page.goto('/')
	await expect(page.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible()
	await expect(page.locator('math').first()).toBeAttached()
	await expect(page.getByRole('code').filter({ hasText: 'const message' })).toBeVisible()
	await page.getByRole('button', { name: 'Switch to dark theme' }).click()
	await expect(page.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible()
	expect(external).toEqual([])
})
