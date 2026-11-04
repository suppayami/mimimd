// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/vue'
import { expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import FileTree from '../../src/web/FileTree.vue'
it('expands folders and exposes distinct document destinations', async () => {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
	})
	const screen = render(FileTree, {
		props: {
			entries: [
				{
					path: 'nested',
					name: 'nested',
					children: [{ path: 'nested/guide.md', name: 'guide.md' }],
				},
			],
			active: 'nested/guide.md',
			filter: '',
		},
		global: { plugins: [router] },
	})
	await fireEvent.click(screen.getByText('nested'))
	expect(screen.getByRole('link', { name: 'guide.md' }).getAttribute('href')).toBe(
		'/doc/nested/guide.md',
	)
	await screen.rerender({ filter: 'missing' })
	expect(screen.queryByRole('link', { name: 'guide.md' })).toBeNull()
})
