import { expect, test } from '@playwright/test'

test('reads and collapses metadata safely without polluting headings or other documents', async ({
	page,
}) => {
	await page.goto('/doc/frontmatter.md')
	await expect(page.getByRole('heading', { name: 'Reading notes', exact: true })).toBeVisible()
	const properties = page
		.locator('details')
		.filter({ has: page.locator('summary', { hasText: 'Document properties' }) })
	await expect(properties.getByText('A quiet place to read', { exact: true })).toBeVisible()
	await expect(properties.getByRole('listitem')).toHaveText(['Markdown', 'Everforest', 'Reading'])
	await expect(properties.getByText('false', { exact: true })).toBeVisible()
	await expect(
		properties.getByText('<img src=x alt="Not an image" onerror="alert(1)">', { exact: true }),
	).toBeVisible()
	await expect(properties.getByRole('img')).toHaveCount(0)
	await expect(
		page.getByRole('navigation', { name: 'On this page' }).getByRole('link'),
	).toHaveText(['Reading notes', 'Start here'])

	await properties.locator('summary').click()
	await expect(properties.getByText('A quiet place to read', { exact: true })).toBeHidden()
	await properties.locator('summary').focus()
	await page.keyboard.press('Enter')
	await expect(properties.getByText('A quiet place to read', { exact: true })).toBeVisible()

	await page.getByRole('link', { name: 'Return to the welcome page' }).click()
	await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
	await expect(page.getByText('Document properties', { exact: true })).toHaveCount(0)
})

test('shows malformed frontmatter as text while keeping the document readable on mobile', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/doc/frontmatter-invalid.md')
	await expect(page.getByRole('status')).toHaveText(
		'Unable to parse frontmatter. Showing the original YAML.',
	)
	await expect(page.getByText('tags: [unfinished', { exact: true })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Still readable', exact: true })).toBeVisible()
})
