import { JSDOM } from 'jsdom'
import { expect, it } from 'vitest'
import { renderMarkdown } from '../../src/markdown/render'
it('renders GFM, unique headings, math, highlighted code and encoded relative links', async () => {
	const result = await renderMarkdown(
		'# Same\n\n# Same\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] Done\n\n[Next](../guide%20%E7%8C%AB.md#same)\n\n![image](pic%20one.png)\n\n$x^2$\n\n```ts\nconst x = 1\n```',
		'nested/start.md',
	)
	expect(result.headings.map((h) => h.id)).toEqual(['same', 'same-1'])
	expect(new JSDOM(result.html).window.document.querySelector('table')).not.toBeNull()
	expect(result.html).toContain('type="checkbox"')
	expect(result.html).toContain('/doc/guide%20%E7%8C%AB.md#same')
	expect(result.html).toContain('/content/nested/pic%20one.png')
	expect(new JSDOM(result.html).window.document.querySelector('math')).not.toBeNull()
	expect(new JSDOM(result.html).window.document.querySelector('pre code')?.textContent).toContain(
		'const x = 1',
	)
})
it('extracts YAML properties without rendering metadata as headings or expanding aliases', async () => {
	const result = await renderMarkdown(
		'---\ntitle: Reading notes\ntags: [Markdown, Everforest]\ndraft: false\ncount: 0\nempty: null\nauthor: &author\n  name: Mimi\ncredit: *author\n---\n\n# Notes\n\nBody text.\n\n---\n\nMore text.',
		'notes.md',
	)
	expect(result.headings).toEqual([{ id: 'notes', text: 'Notes', depth: 1 }])
	expect(result.frontmatter?.properties).toEqual([
		{ name: 'title', value: 'Reading notes' },
		{ name: 'tags', value: ['Markdown', 'Everforest'] },
		{ name: 'draft', value: 'false' },
		{ name: 'count', value: '0' },
		{ name: 'empty', value: 'null' },
		{ name: 'author', value: '&author\nname: Mimi', structured: true },
		{ name: 'credit', value: '*author', structured: true },
	])
	const document = new JSDOM(result.html).window.document
	expect(document.querySelector('hr')).not.toBeNull()
	expect(document.body.textContent).not.toContain('Reading notes')
	expect(document.body.textContent).toContain('Body text.')
})

it('preserves invalid and non-mapping YAML without hiding the Markdown body', async () => {
	const invalid = await renderMarkdown(
		'---\ntags: [unfinished\n---\n\n# Still readable',
		'notes.md',
	)
	expect(invalid.frontmatter).toMatchObject({
		raw: 'tags: [unfinished',
		error: expect.any(String),
	})
	expect(invalid.html).toContain('Still readable')

	const sequence = await renderMarkdown('---\n- one\n- two\n---\n\n# List', 'notes.md')
	expect(sequence.frontmatter).toEqual({ properties: [], raw: '- one\n- two' })

	const empty = await renderMarkdown('---\n---\n\n# Empty', 'notes.md')
	expect(empty.frontmatter).toBeUndefined()
})

it('discards executable HTML, unsafe URLs, untrusted math and escapes unknown code', async () => {
	const result = await renderMarkdown(
		'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert)\n\n$\\href{javascript:alert(1)}{bad}$\n\n```unknownlang\n<script>danger</script>\n```',
		'readme.md',
	)
	expect(result.html).not.toContain('<script>')
	expect(result.html).not.toContain('onerror=')
	expect(result.html).not.toContain('href="javascript:')
	expect(new JSDOM(result.html).window.document.querySelector('pre')?.textContent).toContain(
		'<script>danger</script>',
	)
})
