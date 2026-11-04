import type { Element, Root } from 'hast'
import type { Frontmatter, RenderedDocument } from '../contracts.js'
import { posix } from 'node:path'
import { toText } from 'hast-util-to-text'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { bundledLanguages, createHighlighter } from 'shiki'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { isMap, isScalar, isSeq, parseDocument, stringify } from 'yaml'
import { themes } from '../themes/everforest.js'

const highlighter = createHighlighter({
	themes,
	langs: [],
})

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

function readFrontmatter(source: string): Frontmatter {
	const parsed = parseDocument(source)
	if (parsed.errors.length) {
		return { properties: [], raw: source, error: parsed.errors[0]!.message }
	}

	if (!isMap(parsed.contents)) {
		return { properties: [], raw: source }
	}

	return {
		properties: parsed.contents.items.map(({ key, value }) => {
			const name = isScalar(key)
				? String(key.value)
				: stringify(key, { verifyAliasOrder: false }).trimEnd()
			if (isScalar(value) || value === null) {
				return { name, value: String(value === null ? null : value.value) }
			}

			if (isSeq(value) && value.items.length) {
				const items = value.items.flatMap((item) =>
					isScalar(item) ? [String(item.value)] : [],
				)
				if (items.length === value.items.length) {
					return { name, value: items }
				}
			}

			// Serialize YAML nodes directly: aliases are displayed, never expanded or executed.
			return {
				name,
				value: stringify(value, { verifyAliasOrder: false }).trimEnd(),
				structured: true,
			}
		}),
	}
}

export async function renderMarkdown(source: string, document: string): Promise<RenderedDocument> {
	const headings: RenderedDocument['headings'] = []
	let frontmatter: Frontmatter | undefined
	const highlight = await highlighter

	const result = await unified()
		.use(remarkParse)
		.use(remarkFrontmatter)
		.use(() => (tree) => {
			visit(tree, (node) => {
				if (
					node.type === 'yaml' &&
					'value' in node &&
					typeof node.value === 'string' &&
					node.value.trim()
				) {
					frontmatter = readFrontmatter(node.value)
				}
			})
		})
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
				const highlighted = highlight.codeToHast(toText(code, { whitespace: 'pre' }), {
					lang,
					themes: { light: 'everforest-medium-light', dark: 'everforest-medium-dark' },
				})

				parent.children[index] = highlighted.children[0]!
			})
		})
		.use(rehypeKatex, { trust: false, strict: 'error', errorColor: 'currentColor' })
		.use(rehypeStringify)
		.process(source)

	return { html: String(result), headings, ...(frontmatter && { frontmatter }) }
}
