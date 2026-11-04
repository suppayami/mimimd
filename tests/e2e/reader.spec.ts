import { expect, test } from '@playwright/test'
test('reads rich content, navigates history and persists theme', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
	await expect(page.getByRole('table')).toBeVisible()
	await expect
		.poll(() =>
			page
				.getByRole('img', { name: 'Local illustration' })
				.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
		)
		.toBe(true)
	await expect(page.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible()
	await expect(
		page.getByRole('img', { name: 'Mermaid diagram' }).getByText('Read', { exact: true }),
	).toBeVisible()
	await expect(
		page.getByRole('img', { name: 'Mermaid diagram' }).getByText('Enjoy', { exact: true }),
	).toBeVisible()
	await expect(page.locator('math').first()).toBeAttached()
	await page.getByRole('button', { name: 'Switch to dark theme' }).click()
	await page.reload()
	await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
	await page.getByRole('link', { name: 'Read the guide' }).click()
	await expect(page.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible()
	await page.goBack()
	await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
	await page.goForward()
	await expect(page.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible()
	await page.goBack()
	await page.getByRole('link', { name: 'Unicode notes' }).click()
	await expect(page.getByRole('heading', { name: '猫 notes' })).toBeVisible()
	await page.reload()
	await expect(page.getByRole('heading', { name: '猫 notes' })).toBeVisible()
	await page.goto('/doc/README.md#repeat-1')
	await expect(page.getByRole('heading', { name: 'Repeat', exact: true }).nth(1)).toBeInViewport()
})
test('heading fragments do not target application controls', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 600 })
	for (const name of ['Files', 'Reading', 'Filter', 'Headings', 'App']) {
		await page.goto(`/doc/heading-collisions.md#${name.toLowerCase()}`)
		await expect(page.getByRole('heading', { name, exact: true })).toBeInViewport()
	}

	await page.goto('/doc/heading-collisions.md')
	await page.getByRole('link', { name: 'Jump to Files', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeInViewport()
	await page
		.getByRole('navigation', { name: 'On this page' })
		.getByRole('link', { name: 'Reading', exact: true })
		.click()
	await expect(page.getByRole('heading', { name: 'Reading', exact: true })).toBeInViewport()
})

test('mobile navigation restores focus and filters files', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await page.getByRole('button', { name: 'Files', exact: true }).focus()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('searchbox', { name: 'Filter files' })).toBeFocused()
	await page.getByRole('searchbox', { name: 'Filter files' }).fill('nested/guide')
	await page.keyboard.press('Tab')
	await page.keyboard.press('Tab')
	await expect(page.getByRole('link', { name: 'guide.md', exact: true })).toBeFocused()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('heading', { name: 'Guide', exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Files', exact: true })).toBeFocused()
	await page.getByRole('button', { name: 'Headings', exact: true }).click()
	await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(page.getByRole('button', { name: 'Headings', exact: true })).toBeFocused()
})
