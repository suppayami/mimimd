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
					>{{ entry.key }}</RouterLink
				>
				<span v-if="entry.attempt?.state === 'receiving'" role="status">
					— Receiving Markdown ({{ entry.attempt.receivedBytes }} bytes)…</span
				>
				<span v-else-if="entry.attempt?.state === 'preparing'" role="status">
					— Preparing on server…</span
				>
				<span v-else-if="entry.attempt?.state === 'failed'" role="status">
					— {{ entry.attempt.error?.message }} Ask the publisher to retry.</span
				>
			</li>
		</ul>
	</section>
</template>

<style scoped>
section {
	margin-top: 1.5rem;
}
ul {
	padding-left: 1rem;
}
li {
	margin-block: 0.75rem;
	overflow-wrap: anywhere;
}
a[aria-current] {
	font-weight: bold;
}
</style>
