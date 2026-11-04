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
					<summary>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M3 7h7l2-3h8v15H3Z" />
						</svg>
						{{ entry.name }}
					</summary>
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
					><svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h4" />
					</svg>
					<span>{{ entry.name }}</span></RouterLink
				>
			</li>
		</template>
	</ul>
</template>
<style scoped>
ul {
	list-style: none;
	padding: 0;
	margin: 0;
}
details > ul {
	margin-left: 0.5rem;
	padding-left: 0.65rem;
	border-left: 1px solid var(--border);
}
li {
	margin: 0.25rem 0;
	overflow-wrap: anywhere;
}
summary {
	cursor: pointer;
	padding: 0.5rem 0.25rem;
}
summary::marker {
	color: var(--gold);
	font-size: 0.75em;
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
summary svg {
	color: var(--gold);
	vertical-align: -0.15rem;
	margin-right: 0.25rem;
}
a {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 2.4rem;
	padding: 0.45rem 0.6rem;
	border-radius: 0.4rem;
	color: var(--fg);
	text-decoration: none;
	line-height: 1.5;
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
@media (max-width: 1000px) {
	a,
	summary {
		min-height: 2.75rem;
	}
}
</style>
