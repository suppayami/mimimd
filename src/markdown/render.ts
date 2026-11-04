import type { Element, Root } from 'hast'
import type { RenderedDocument } from '../contracts.js'
import { posix } from 'node:path'
import { toText } from 'hast-util-to-text'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { bundledLanguages, createHighlighter } from 'shiki'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { themes } from '../themes/everforest.js'

const highlighter = createHighlighter({
	themes,
	langs: [],
})

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export async function renderMarkdown(source: string, document: string): Promise<RenderedDocument> {
	const headings: RenderedDocument['headings'] = []
	const highlight = await highlighter

	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkMath)
		.use(remarkRehype)
		// User-controlled HTML is discarded and sanitized BEFORE trusted code/math generation.
		.use(rehypeSanitize, {
			...defaultSchema,
			attributes: {
				...defaultSchema.attributes,
				code: [['className', /^language-./, 'math-inline', 'math-display']],
			},
		})
		.use(rehypeSlug)
		.use(() => async (tree: Root) => {
			const languages = new Set<keyof typeof bundledLanguages>()

			visit(tree, 'element', (node) => {
				for (const name of (node.properties.className as string[] | undefined) ?? []) {
					const language = name.replace(/^language-/, '')
					if (Object.hasOwn(bundledLanguages, language)) {
						languages.add(language as keyof typeof bundledLanguages)
					}
				}
			})

			await Promise.all([...languages].map((language) => highlight.loadLanguage(language)))

			visit(tree, 'element', (node: Element, index, parent) => {
				if (node.tagName === 'table') {
					node.properties.tabIndex = 0
				}

				if (/^h[1-6]$/.test(node.tagName)) {
					headings.push({
						id: String(node.properties.id),
						text: toText(node),
						depth: Number(node.tagName[1]),
					})
				}

				for (const attribute of ['href', 'src'] as const) {
					const value = node.properties[attribute]
					if (typeof value !== 'string' || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) {
						continue
					}

					try {
						const url = new URL(value, `http://reader/${encodePath(document)}`)
						const relative = decodeURIComponent(value.split(/[?#]/)[0]!)
						const target = posix.normalize(
							relative.startsWith('/')
								? relative.slice(1)
								: posix.join(posix.dirname(document), relative),
						)
						if (target === '..' || target.startsWith('../')) {
							node.properties[attribute] = '/doc/_unavailable'
							continue
						}

						node.properties[attribute] =
							(attribute === 'href' && /\.(?:md|markdown)$/i.test(target)
								? '/doc/'
								: '/content/') +
							encodePath(target) +
							url.search +
							url.hash
					} catch {
						delete node.properties[attribute]
					}
				}

				if (node.tagName !== 'pre' || !parent || index === undefined) {
					return
				}

				const code = node.children[0]
				if (!code || code.type !== 'element' || code.tagName !== 'code') {
					return
				}

				const language = String(
					(code.properties.className as string[] | undefined)
						?.find((c) => c.startsWith('language-'))
						?.slice(9) ?? 'text',
				)
				if (language === 'math') {
					return
				}

				if (language === 'mermaid') {
					node.properties.className = ['mermaid-source']
					return
				}

				const lang = Object.hasOwn(bundledLanguages, language) ? language : 'text'
				const highlighted = highlight.codeToHast(toText(code), {
					lang,
					themes: { light: 'everforest-medium-light', dark: 'everforest-medium-dark' },
				})

				parent.children[index] = highlighted.children[0]!
			})
		})
		.use(rehypeKatex, { trust: false, strict: 'error', errorColor: 'currentColor' })
		.use(rehypeStringify)
		.process(source)

	return { html: String(result), headings }
}
