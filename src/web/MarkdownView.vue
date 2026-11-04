<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { renderDiagrams } from './diagrams'
import { theme } from './theme'

const props = defineProps<{ html: string; revision: number; path: string; activePath: string }>()
const emit = defineEmits<{ rendered: [path: string, scroll: number] }>()
const article = ref<HTMLElement>()
const staging = ref<HTMLElement>()
const rendering = ref(false)
const displayedTheme = ref(theme.value)
let generation = 0

onBeforeUnmount(() => {
	generation++
})

watch(
	() => [props.html, props.revision, props.path, theme.value, props.activePath] as const,
	async ([html, revision, path, mode, activePath]) => {
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
			rendering.value = false
			emit('rendered', path, scroll)
		} finally {
			prepared.remove()
		}
	},
	{ immediate: true },
)
</script>
<template>
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
	border: 1px solid var(--fg);
	border-radius: 0.3rem;
	font-size: 0.85rem;
	z-index: 1;
}
article {
	overflow-wrap: anywhere;
	min-width: 0;
}
article :deep(h1) {
	font-size: 2.25rem;
	line-height: 1.25;
}
article :deep(h1),
article :deep(h2),
article :deep(h3) {
	scroll-margin-top: 5rem;
}
article :deep(pre) {
	overflow-x: auto;
	padding: 1.25rem;
	border-radius: 0.5rem;
	line-height: 1.6;
	background: var(--surface);
}
article :deep(code) {
	font-family: ui-monospace, monospace;
	font-size: 0.9em;
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
}
article :deep(th),
article :deep(td) {
	padding: 0.5rem 0.8rem;
	border: 1px solid var(--fg);
}
article :deep(blockquote) {
	border-left: 0.2rem solid var(--fg);
	margin-left: 0;
	padding-left: 1.2rem;
}
article :deep(.katex-display) {
	overflow-x: auto;
	overflow-y: hidden;
}
article.dark :deep(.shiki),
article.dark :deep(.shiki span) {
	color: var(--shiki-dark) !important;
	background-color: var(--shiki-dark-bg) !important;
	font-style: var(--shiki-dark-font-style) !important;
}
</style>
