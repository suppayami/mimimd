<script setup lang="ts">
import type { Frontmatter } from '../contracts'
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { renderDiagrams } from './diagrams'
import FrontmatterView from './FrontmatterView.vue'
import { theme } from './theme'

const props = defineProps<{
	html: string
	frontmatter?: Frontmatter
	revision: number
	path: string
	activePath: string
}>()
const emit = defineEmits<{ rendered: [path: string, scroll: number] }>()
const article = ref<HTMLElement>()
const staging = ref<HTMLElement>()
const rendering = ref(false)
const displayedTheme = ref(theme.value)
const displayedFrontmatter = shallowRef<Frontmatter>()
let generation = 0

onBeforeUnmount(() => {
	generation++
})

watch(
	() =>
		[
			props.html,
			props.revision,
			props.path,
			theme.value,
			props.activePath,
			props.frontmatter,
		] as const,
	async ([html, revision, path, mode, activePath, frontmatter]) => {
		const token = ++generation
		rendering.value = true
		if (path !== activePath) {
			return
		}

		await nextTick()
		if (token !== generation || !article.value || !staging.value) {
			return
		}

		const prepared = document.createElement('div')
		prepared.innerHTML = html
		for (const image of prepared.querySelectorAll('img')) {
			const url = new URL(image.src)
			if (url.origin === location.origin) {
				url.searchParams.set('revision', String(revision))
				image.src = url.href
			}
		}

		staging.value.append(prepared)
		try {
			await renderDiagrams(prepared, mode, () => token === generation)
			if (token !== generation || !article.value) {
				return
			}

			const scroll = window.scrollY
			article.value.replaceChildren(...prepared.childNodes)
			displayedTheme.value = mode
			displayedFrontmatter.value = frontmatter
			rendering.value = false
			await nextTick()
			if (token === generation) {
				emit('rendered', path, scroll)
			}
		} finally {
			prepared.remove()
		}
	},
	{ immediate: true },
)
</script>
<template>
	<FrontmatterView v-if="displayedFrontmatter" :key="path" :frontmatter="displayedFrontmatter" />
	<article
		ref="article"
		:class="{ dark: displayedTheme === 'dark' }"
		:aria-busy="rendering"
		aria-label="Document content"
	/>
	<p v-if="rendering" class="loading" role="status">Preparing document…</p>
	<div ref="staging" class="staging" aria-hidden="true" inert />
</template>
<style scoped>
.staging {
	position: fixed;
	inset: 0;
	visibility: hidden;
	pointer-events: none;
}
.loading {
	position: fixed;
	right: 1rem;
	bottom: 1rem;
	padding: 0.4rem 0.7rem;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 0.5rem;
	font-size: 0.85rem;
	z-index: 1;
}
article {
	overflow-wrap: anywhere;
	min-width: 0;
	font: 1.125rem/1.8 var(--ui-font);
}
article :deep(h1),
article :deep(h2),
article :deep(h3),
article :deep(h4),
article :deep(h5),
article :deep(h6) {
	font-family: var(--ui-font);
	font-weight: 600;
	line-height: 1.3;
	letter-spacing: -0.025em;
	color: var(--teal);
	scroll-margin-top: 8rem;
	margin: 1.75rem 0 0.75rem;
}
article :deep(h1) {
	font-family: var(--ui-font);
	font-size: clamp(2.5rem, 4vw, 3.5rem);
	letter-spacing: -0.045em;
	color: var(--red);
	margin: 0 0 1.25rem;
}
article :deep(h2) {
	font-size: 1.55rem;
	color: var(--heading);
	margin-top: 2.5rem;
}
article :deep(h3) {
	font-size: 1.2rem;
}
article :deep(p) {
	margin: 0 0 1.25rem;
}
article :deep(li) {
	margin-block: 0.4rem;
}
article :deep(li::marker) {
	color: var(--heading);
}
article :deep(a:hover) {
	color: var(--teal);
	text-decoration-thickness: 2px;
}
article :deep(hr) {
	border: 0;
	border-top: 1px solid var(--border);
	margin-block: 2rem;
}
article :deep(pre) {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	overflow-x: auto;
	padding: 1.25rem;
	border: 1px solid var(--border);
	border-radius: 0.5rem;
	line-height: 1.75;
	background: var(--surface);
	margin-block: 1.5rem;
}
article :deep(code) {
	font-family: var(--mono-font);
	font-size: 0.8em;
}
article :deep(:not(pre) > code) {
	padding: 0.15rem 0.35rem;
	border-radius: 0.25rem;
	background: var(--surface);
	color: var(--plum);
	box-decoration-break: clone;
}
article :deep(img),
article :deep(svg) {
	max-width: 100%;
	height: auto;
}
article :deep(table) {
	overflow-wrap: normal;
	display: block;
	overflow-x: auto;
	border-collapse: collapse;
	font: 0.875rem/1.7 var(--ui-font);
	margin-block: 1.5rem;
	text-align: left;
}
article :deep(th) {
	background: var(--surface);
	color: var(--heading);
	font-weight: 650;
}
article :deep(th),
article :deep(td) {
	padding: 0.75rem 1rem;
	border-bottom: 1px solid var(--border);
}
article :deep(blockquote) {
	border-left: 3px solid var(--yellow);
	margin: 1.75rem 0;
	padding: 0.25rem 0 0.25rem 1.5rem;
	color: var(--gold);
	font-style: italic;
}
article :deep(blockquote > p:last-child) {
	margin-bottom: 0;
}
article :deep(.katex-display) {
	overflow-x: auto;
	overflow-y: hidden;
}
@media (max-width: 1000px) {
	article :deep(:is(h1, h2, h3, h4, h5, h6)) {
		scroll-margin-top: 10rem;
	}
}
article.dark :deep(.shiki),
article.dark :deep(.shiki span) {
	color: var(--shiki-dark) !important;
	background-color: var(--shiki-dark-bg) !important;
	font-style: var(--shiki-dark-font-style) !important;
}
</style>
