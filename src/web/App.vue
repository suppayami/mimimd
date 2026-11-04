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
const document = shallowRef<RenderedDocument & { path: string }>()
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

		document.value = { ...result, path: active.value }
		error.value = ''
	} catch (failure) {
		if (token !== generation) {
			return
		}

		document.value = undefined
		error.value = (failure as Error).message
	}
}

async function onDocumentRendered(path: string, scroll: number) {
	if (path !== active.value) {
		return
	}

	const changedDocument = loadedPath !== path
	loadedPath = path
	if (!changedDocument) {
		window.scrollTo(0, scroll)
		return
	}

	if (route.hash) {
		await scrollToHeading()
		return
	}

	window.scrollTo(0, 0)
}

async function scrollToHeading() {
	await nextTick()
	if (loadedPath === active.value && route.hash) {
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
		<RouterLink class="brand" to="/">
			<span class="brand-name">mimimd</span>
			<span class="tagline">a quiet place to read</span>
		</RouterLink>
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
				class="theme-toggle"
				:aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`"
				@click="toggleTheme"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path v-if="theme === 'light'" d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />
					<template v-else>
						<circle cx="12" cy="12" r="4" />
						<path
							d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"
						/>
					</template>
				</svg>
				<span>{{ theme === 'light' ? 'Dark' : 'Light' }} mode</span>
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
			<h2>
				Documents <span class="count">{{ index.documents.length }}</span>
			</h2>
			<label for="filter">Filter files</label>
			<div class="search">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="10.5" cy="10.5" r="6.5" />
					<path d="m16 16 4 4" />
				</svg>
				<input id="filter" v-model="filter" type="search" placeholder="Filename or path" />
			</div>
			<FileTree
				:entries="index.tree"
				:active="active"
				:filter="filter"
				@select="closeFiles"
			/>
			<p class="rail-note">
				Local Markdown, simply read.<br />No distractions. Just your words.
			</p>
			<button class="mobile" @click="closeFiles">Close files</button>
		</nav>
		<main id="reading" tabindex="-1" @click="navigate">
			<p class="path">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h4" />
				</svg>
				<span>{{ active || 'Your documents' }}</span>
			</p>
			<p v-if="error" role="status">
				{{ error }}
			</p>
			<MarkdownView
				v-else-if="document"
				:html="document.html"
				:path="document.path"
				:active-path="active"
				:revision="revision"
				@rendered="onDocumentRendered"
			/>
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
					<a
						:href="`#${heading.id}`"
						:style="{ paddingInlineStart: `${0.9 + (heading.depth - 1) * 0.65}rem` }"
						:aria-current="route.hash === `#${heading.id}` ? 'location' : undefined"
						@click="closeHeadings"
						>{{ heading.text }}</a
					>
				</li>
			</ul>
			<button class="mobile" @click="closeHeadings">Close headings</button>
		</nav>
	</div>
</template>
<style scoped>
header {
	position: sticky;
	top: 0;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	min-height: 5.5rem;
	padding: 1rem 2rem;
	background: var(--bg);
	border-bottom: 1px solid var(--border);
}
.brand {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	color: var(--heading);
	text-decoration: none;
}
.brand-name {
	font: 700 1.75rem/1 var(--ui-font);
	letter-spacing: -0.07em;
}
.tagline {
	margin-left: 0.5rem;
	padding-left: 1rem;
	border-left: 1px solid var(--border);
	color: var(--fg);
	font-size: 0.8rem;
}
.controls {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.8rem;
}
.controls button {
	min-height: 2.75rem;
}
.theme-toggle {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.theme-toggle svg,
.search svg,
.path svg {
	width: 1.1rem;
	height: 1.1rem;
	flex: none;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.6;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.layout {
	display: grid;
	grid-template-columns: 15.5rem minmax(0, 100ch) 13rem;
	justify-content: center;
	max-width: calc(100ch + 28.5rem);
	margin-inline: auto;
	min-height: calc(100dvh - 5.5rem);
}
.layout.single {
	grid-template-columns: minmax(0, 100ch) 13rem;
}
main {
	padding: 1.75rem clamp(2rem, 4vw, 4.5rem) 6rem;
	min-width: 0;
}
.path {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	margin: 0 0 2.5rem;
	padding-bottom: 1.5rem;
	border-bottom: 1px solid var(--border);
	font: 0.75rem/1.7 var(--mono-font);
	overflow-wrap: anywhere;
}
.path svg {
	color: var(--heading);
}
nav {
	padding: 2rem 1.5rem;
	position: sticky;
	top: 5.5rem;
	align-self: start;
	max-height: calc(100dvh - 5.5rem);
	overflow: auto;
	font-size: 0.8rem;
}
#files {
	background: color-mix(in srgb, var(--surface) 35%, var(--bg));
	border-right: 1px solid var(--border);
	min-height: calc(100dvh - 5.5rem);
}
nav h2 {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin: 0 0 1.25rem;
	font-size: 0.7rem;
	font-weight: 650;
	text-transform: uppercase;
	letter-spacing: 0.1em;
}
.count {
	padding: 0.1rem 0.45rem;
	background: var(--active);
	color: var(--heading);
	border-radius: 0.3rem;
	letter-spacing: 0;
}
label {
	font-size: 0.75rem;
}
.search {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0.5rem 0 1.5rem;
	padding: 0.5rem 0.65rem;
	border: 1px solid var(--border);
	border-radius: 0.4rem;
	background: var(--bg);
}
.search:focus-within {
	outline: 2px solid var(--link);
	outline-offset: 2px;
}
input {
	width: 100%;
	min-width: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background: transparent;
}
input:focus-visible {
	outline: none;
}
.rail-note {
	margin-top: 3rem;
	padding-top: 1.25rem;
	border-top: 1px solid var(--border);
	font-size: 0.7rem;
	line-height: 1.9;
}
#headings ul {
	list-style: none;
	padding: 0;
	border-left: 1px solid var(--border);
}
#headings a {
	display: block;
	margin-left: -1px;
	padding: 0.45rem 0;
	border-left: 2px solid transparent;
	color: var(--fg);
	text-decoration: none;
	overflow-wrap: anywhere;
	line-height: 1.6;
	font-size: 0.75rem;
}
#headings a:hover,
#headings a[aria-current] {
	color: var(--heading);
	background: var(--active);
	border-left-color: var(--green);
}
.mobile {
	display: none;
}
.skip {
	position: fixed;
	left: 1rem;
	top: -5rem;
	background: var(--surface);
	padding: 0.75rem 1rem;
	z-index: 3;
}
.skip:focus {
	top: 0.5rem;
}
@media (max-width: 1100px) and (min-width: 1001px) {
	.layout {
		grid-template-columns: 13.5rem minmax(0, 1fr) 11rem;
	}
	nav {
		padding-inline: 1rem;
	}
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
		border-bottom: 1px solid var(--border);
		padding: 1.5rem;
	}
	#files {
		min-height: 0;
		border-right: 0;
	}
	#headings {
		grid-row: 1;
	}
	nav.expanded {
		display: block;
	}
	#headings a {
		min-height: 2.75rem;
		font-size: 0.875rem;
	}
	.mobile {
		display: inline-block;
		min-height: 2.75rem;
	}
	main {
		width: 100%;
		max-width: 100ch;
		margin-inline: auto;
		padding: 1.5rem 1.5rem 4rem;
	}
	header {
		flex-wrap: wrap;
		padding: 1rem 1.25rem;
	}
	.tagline,
	.rail-note,
	.theme-toggle span {
		display: none;
	}
	.path {
		margin-bottom: 2rem;
	}
}
@media (max-width: 360px) {
	header {
		gap: 0.75rem;
	}
	.brand {
		gap: 0.4rem;
	}
	.brand-name {
		font-size: 1.5rem;
	}
	.controls {
		gap: 0.25rem;
	}
	.controls button {
		padding-inline: 0.5rem;
	}
}
</style>
