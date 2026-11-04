<script setup lang="ts">
import type { DocumentIndex, RenderedDocument } from '../contracts'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FileTree from './FileTree.vue'
import MarkdownView from './MarkdownView.vue'
import { theme, toggleTheme } from './theme'
const route = useRoute()
const router = useRouter()
const index = shallowRef<DocumentIndex>()
const document = shallowRef<RenderedDocument>()
const error = ref('')
const filter = ref('')
const filesOpen = ref(false)
const headingsOpen = ref(false)
const fileButton = ref<HTMLButtonElement>()
const headingButton = ref<HTMLButtonElement>()
const revision = ref(0)
const active = computed(() =>
	route.path.startsWith('/doc/')
		? route.path.slice(5).split('/').map(decodeURIComponent).join('/')
		: '',
)
let generation = 0
let loadedPath: string | undefined
let events: EventSource | undefined
async function refresh() {
	const token = ++generation
	try {
		const response = await fetch('/api/index')
		if (!response.ok) {
			throw new Error('Unable to load document list.')
		}
		const nextIndex = (await response.json()) as DocumentIndex
		if (token !== generation) {
			return
		}
		index.value = nextIndex
		if (route.path === '/' && nextIndex.defaultDocument) {
			await router.replace(
				`/doc/${nextIndex.defaultDocument
					.split('/')
					.map(encodeURIComponent)
					.join('/')}${route.hash}`,
			)
			return
		}
		if (!nextIndex.documents.length && !active.value) {
			document.value = undefined
			error.value = 'No Markdown documents found.'
			return
		}
		const content = await fetch(`/api/document?path=${encodeURIComponent(active.value)}`)
		if (!content.ok) {
			throw new Error('Document unavailable. Select another document from the file list.')
		}
		const result = (await content.json()) as RenderedDocument
		if (token !== generation) {
			return
		}
		const changedDocument = loadedPath !== active.value
		const scroll = window.scrollY
		loadedPath = active.value
		document.value = result
		error.value = ''

		await nextTick()
		if (!changedDocument) {
			window.scrollTo(0, scroll)
			return
		}
		if (route.hash) {
			await scrollToHeading()
			return
		}
		window.scrollTo(0, 0)
	} catch (failure) {
		if (token !== generation) {
			return
		}
		document.value = undefined
		error.value = (failure as Error).message
	}
}
async function scrollToHeading() {
	await nextTick()
	if (route.hash) {
		window.document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView()
	}
}
async function toggleFiles() {
	filesOpen.value = !filesOpen.value
	if (!filesOpen.value) {
		return
	}
	await nextTick()
	window.document.getElementById('filter')?.focus()
}
async function toggleHeadings() {
	headingsOpen.value = !headingsOpen.value
	if (!headingsOpen.value) {
		return
	}
	await nextTick()
	const navigation = window.document.getElementById('headings')
	navigation?.querySelector<HTMLElement>('a, button')?.focus()
}
function closeFiles() {
	filesOpen.value = false
	fileButton.value?.focus()
}
function closeHeadings() {
	headingsOpen.value = false
	headingButton.value?.focus()
}
function navigate(event: MouseEvent) {
	const link = (event.target as Element).closest('a')
	if (
		!link ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.altKey ||
		event.button !== 0
	) {
		return
	}
	const url = new URL(link.href)
	if (
		url.origin === location.origin &&
		(url.pathname.startsWith('/doc/') || url.pathname === route.path)
	) {
		event.preventDefault()
		void router.push(url.pathname + url.search + url.hash)
	}
}
watch(
	() => route.path,
	() => {
		void refresh()
	},
)
watch(
	() => route.hash,
	() => {
		void scrollToHeading()
	},
)
onMounted(() => {
	void refresh()
	events = new EventSource('/events')
	events.onmessage = () => {
		revision.value++
		void refresh()
	}
	events.onopen = () => {
		void refresh()
	}
})
onUnmounted(() => {
	generation++
	events?.close()
})
</script>
<template>
	<a class="skip" href="#reading">Skip to content</a>
	<header>
		<RouterLink class="brand" to="/">mimimd <span> / a quiet place to read</span></RouterLink>
		<div class="controls">
			<button
				v-if="index?.mode === 'folder'"
				ref="fileButton"
				class="mobile"
				:aria-expanded="filesOpen"
				aria-controls="files"
				@click="toggleFiles"
			>
				Files
			</button>
			<button
				ref="headingButton"
				class="mobile"
				:aria-expanded="headingsOpen"
				aria-controls="headings"
				@click="toggleHeadings"
			>
				Headings
			</button>
			<button
				:aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`"
				@click="toggleTheme"
			>
				{{ theme === 'light' ? 'Dark' : 'Light' }} mode
			</button>
		</div>
	</header>
	<div class="layout" :class="{ single: index?.mode === 'file' }">
		<nav
			v-if="index?.mode === 'folder'"
			id="files"
			aria-label="Files"
			:class="{ expanded: filesOpen }"
			@keydown.esc="closeFiles"
		>
			<h2>Documents</h2>
			<label for="filter">Filter files</label>
			<input id="filter" v-model="filter" type="search" placeholder="Filename or path" />
			<FileTree
				:entries="index.tree"
				:active="active"
				:filter="filter"
				@select="closeFiles"
			/>
			<button class="mobile" @click="closeFiles">Close files</button>
		</nav>
		<main id="reading" tabindex="-1" @click="navigate">
			<p class="path">
				{{ active }}
			</p>
			<p v-if="error" role="status">
				{{ error }}
			</p>
			<MarkdownView v-else-if="document" :html="document.html" :revision="revision" />
			<p v-else role="status">Loading document…</p>
		</main>
		<nav
			id="headings"
			aria-label="On this page"
			:class="{ expanded: headingsOpen }"
			@keydown.esc="closeHeadings"
		>
			<h2>On this page</h2>
			<ul>
				<li v-for="heading in document?.headings" :key="heading.id">
					<a :href="`#${heading.id}`" @click="closeHeadings">{{ heading.text }}</a>
				</li>
			</ul>
			<button class="mobile" @click="closeHeadings">Close headings</button>
		</nav>
	</div>
</template>
<style scoped>
header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 2rem;
	border-bottom: 1px solid var(--fg);
}
.brand {
	font-weight: 750;
	text-decoration: none;
	letter-spacing: 0.04em;
}
.brand span {
	font-weight: 400;
	font-size: 0.8rem;
}
.controls {
	display: flex;
	gap: 0.5rem;
}
.layout {
	display: grid;
	grid-template-columns: minmax(12rem, 17rem) minmax(0, 52rem) minmax(10rem, 15rem);
	justify-content: center;
}
.layout.single {
	grid-template-columns: minmax(0, 52rem) minmax(10rem, 15rem);
}
main {
	padding: 2rem 3rem 6rem;
	min-width: 0;
}
.path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}
nav {
	padding: 1.5rem;
	position: sticky;
	top: 0;
	align-self: start;
	max-height: 100vh;
	overflow: auto;
	font-size: 0.9rem;
}
nav h2 {
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.1em;
}
nav ul {
	list-style: none;
	padding: 0;
}
nav li {
	margin: 0.6rem 0;
}
input::placeholder {
	color: var(--fg);
	opacity: 1;
}
input {
	width: 100%;
	margin-top: 0.4rem;
}
.mobile {
	display: none;
}
.skip {
	position: absolute;
	left: 1rem;
	top: -5rem;
	background: var(--bg);
	padding: 0.5rem;
	z-index: 2;
}
.skip:focus {
	top: 0.5rem;
}
@media (max-width: 1000px) {
	.layout,
	.layout.single {
		grid-template-columns: minmax(0, 1fr);
	}
	nav {
		display: none;
		position: static;
		max-height: none;
	}
	nav.expanded {
		display: block;
	}
	.mobile {
		display: inline-block;
	}
	main {
		padding: 1.5rem;
	}
	header {
		flex-wrap: wrap;
		padding: 1rem;
	}
	.brand span {
		display: none;
	}
}
</style>
