<script setup lang="ts">
import type { Entry } from '../contracts'

defineProps<{ entries: Entry[]; active: string; filter: string }>()
defineEmits<{ select: [] }>()

const href = (path: string) => `/doc/${path.split('/').map(encodeURIComponent).join('/')}`

const matches = (entry: Entry, filter: string): boolean =>
	entry.path.toLowerCase().includes(filter.toLowerCase()) ||
	!!entry.children?.some((child) => matches(child, filter))
</script>
<template>
	<ul>
		<template v-for="entry in entries" :key="entry.path">
			<li v-if="matches(entry, filter)">
				<details v-if="entry.children" :open="!!filter">
					<summary>{{ entry.name }}</summary>
					<FileTree
						:entries="entry.children"
						:active="active"
						:filter="filter"
						@select="$emit('select')"
					/>
				</details>
				<RouterLink
					v-else
					:to="href(entry.path)"
					:aria-current="entry.path === active ? 'page' : undefined"
					@click="$emit('select')"
					>{{ entry.name }}</RouterLink
				>
			</li>
		</template>
	</ul>
</template>
<style scoped>
ul {
	list-style: none;
	padding-left: 1rem;
}
li {
	margin: 0.35rem 0;
	overflow-wrap: anywhere;
}
summary {
	cursor: pointer;
}
a[aria-current] {
	font-weight: bold;
	text-decoration-thickness: 0.2em;
}
</style>
