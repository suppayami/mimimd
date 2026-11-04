<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { renderDiagrams } from './diagrams'
import { theme } from './theme'

const props = defineProps<{ html: string; revision: number }>()
const article = ref<HTMLElement>()
let generation = 0

onBeforeUnmount(() => {
	generation++
})

watch(
	() => [props.html, props.revision, theme.value],
	async () => {
		const token = ++generation
		await nextTick()
		if (!article.value) {
			return
		}

		article.value.innerHTML = props.html
		for (const image of article.value.querySelectorAll('img')) {
			const url = new URL(image.src)
			if (url.origin === location.origin) {
				url.searchParams.set('revision', String(props.revision))
				image.src = url.href
			}
		}

		await renderDiagrams(article.value, theme.value, () => token === generation)
	},
	{ immediate: true },
)
</script>
<template>
	<article ref="article" :class="{ dark: theme === 'dark' }" aria-label="Document content" />
</template>
<style scoped>
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
