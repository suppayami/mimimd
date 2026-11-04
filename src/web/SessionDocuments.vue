<script setup lang="ts">
import type { DocumentMapEntry, SessionStatus } from '../contracts'
import { computed } from 'vue'

const props = defineProps<{
	documents: DocumentMapEntry[]
	attempts: SessionStatus[]
	active: string
}>()
const emit = defineEmits<{ select: [] }>()
const entries = computed(() => {
	const keys = new Set([
		...props.documents.map((document) => document.key!),
		...props.attempts.map((attempt) => attempt.key),
	])
	return [...keys].map((key) => ({
		key,
		attempt: props.attempts.find((attempt) => attempt.key === key),
	}))
})
</script>

<template>
	<section aria-label="Session documents">
		<h2>Session documents</h2>
		<p v-if="!entries.length">Published documents will appear here.</p>
		<ul>
			<li v-for="entry in entries" :key="entry.key">
				<RouterLink
					:to="`/session/${entry.key}`"
					:aria-current="active === `/session/${entry.key}` ? 'page' : undefined"
					@click="emit('select')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h4" />
					</svg>
					<span>{{ entry.key }}</span>
				</RouterLink>
				<span v-if="entry.attempt?.state === 'receiving'" role="status">
					Receiving Markdown ({{ entry.attempt.receivedBytes }} bytes)…</span
				>
				<span v-else-if="entry.attempt?.state === 'preparing'" role="status">
					Preparing on server…</span
				>
				<span v-else-if="entry.attempt?.state === 'failed'" role="status">
					{{ entry.attempt.error?.message }} Ask the publisher to retry.</span
				>
			</li>
		</ul>
	</section>
</template>

<style scoped>
section {
	margin-top: 2rem;
	padding-top: 1.5rem;
	border-top: 1px solid var(--border);
	font-size: 0.8125rem;
}
h2 {
	margin: 0 0 1rem;
	color: var(--heading);
	font-size: 0.8125rem;
	font-weight: 600;
	line-height: 1.5;
}
p {
	margin: 0;
	line-height: 1.7;
}
ul {
	list-style: none;
	padding: 0;
	margin: 0;
}
li {
	margin-block: 0.25rem;
	overflow-wrap: anywhere;
}
a {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 2.75rem;
	padding: 0.5rem 0.6rem;
	border-radius: 0.4rem;
	color: var(--fg);
	text-decoration: none;
	line-height: 1.5;
}
a span {
	min-width: 0;
}
svg {
	width: 1rem;
	height: 1rem;
	flex: none;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linejoin: round;
}
a:hover {
	background: var(--surface);
	color: var(--heading);
}
a[aria-current] {
	font-weight: 600;
	background: var(--active);
	color: var(--heading);
}
a[aria-current]::after {
	content: '';
	width: 0.3rem;
	height: 0.3rem;
	flex: none;
	margin-left: auto;
	border-radius: 50%;
	background: var(--heading);
}
[role='status'] {
	display: block;
	margin: 0.25rem 0.6rem 0.75rem;
	font-size: 0.8125rem;
	line-height: 1.7;
}
</style>
