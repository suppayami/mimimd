import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { palettes } from '../themes/everforest'

let counter = 0

export async function renderDiagrams(
	element: HTMLElement,
	mode: 'light' | 'dark',
	current: () => boolean,
) {
	const p = palettes[mode]
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		htmlLabels: false,
		suppressErrorRendering: true,
		theme: 'base',
		secure: [
			'securityLevel',
			'htmlLabels',
			'startOnLoad',
			'maxTextSize',
			'suppressErrorRendering',
			'theme',
			'themeVariables',
		],
		themeVariables: {
			background: p.bg,
			primaryColor: p.surface,
			primaryTextColor: p.fg,
			primaryBorderColor: p.fg,
			lineColor: p.fg,
			secondaryColor: p.bg,
			tertiaryColor: p.surface,
			fontFamily: 'system-ui',
		},
	})

	for (const block of element.querySelectorAll<HTMLElement>('.mermaid-source')) {
		const source = block.textContent ?? ''
		const output = document.createElement('div')
		output.setAttribute('role', 'img')
		output.setAttribute('aria-label', 'Mermaid diagram')

		try {
			if (/%%\{|^\s*---|^\s*click\s/im.test(source)) {
				throw new Error('Diagram directives and click actions are disabled.')
			}

			const { svg } = await mermaid.render(`diagram-${++counter}`, source)
			if (!current()) {
				return
			}

			output.innerHTML = DOMPurify.sanitize(svg, {
				USE_PROFILES: { svg: true, svgFilters: true },
				FORBID_TAGS: ['a', 'foreignObject', 'script'],
				FORBID_ATTR: ['href', 'xlink:href'],
			})
			block.replaceWith(output)
		} catch {
			if (!current()) {
				return
			}

			output.removeAttribute('role')
			output.textContent = `Diagram unavailable.\n${source}`
			block.replaceWith(output)
		}
	}
}
