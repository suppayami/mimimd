<script setup lang="ts">
import type { Frontmatter } from '../contracts'

defineProps<{ frontmatter: Frontmatter }>()
</script>

<template>
	<details class="frontmatter" open>
		<summary>
			<span>Document properties</span>
			<span class="format">YAML</span>
		</summary>
		<div class="properties">
			<p v-if="frontmatter.error" class="error" role="status">
				Unable to parse frontmatter. Showing the original YAML.
			</p>
			<pre v-if="frontmatter.raw !== undefined"><code>{{ frontmatter.raw }}</code></pre>
			<dl v-else>
				<div
					v-for="(property, index) in frontmatter.properties"
					:key="index"
					class="property"
				>
					<dt>{{ property.name }}</dt>
					<dd>
						<ul v-if="Array.isArray(property.value)" class="values">
							<li v-for="(value, valueIndex) in property.value" :key="valueIndex">
								{{ value }}
							</li>
						</ul>
						<pre v-else-if="property.structured"><code>{{ property.value }}</code></pre>
						<span v-else>{{ property.value }}</span>
					</dd>
				</div>
			</dl>
		</div>
	</details>
</template>

<style scoped>
.frontmatter {
	margin-bottom: 2.5rem;
	border: 1px solid var(--border);
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--surface) 45%, var(--bg));
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}
summary {
	padding: 0.9rem 1.25rem;
	cursor: pointer;
	color: var(--heading);
	font-weight: 600;
}
summary::marker {
	color: var(--gold);
}
summary > span:first-child {
	margin-left: 0.4rem;
}
.format {
	float: right;
	margin-left: 0.75rem;
	color: var(--fg);
	font: 0.65rem/2.2 var(--mono-font);
	letter-spacing: 0.08em;
}
.properties {
	padding: 0 1.25rem 0.5rem;
	border-top: 1px solid var(--border);
}
dl {
	margin: 0;
}
.property {
	display: grid;
	grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
	gap: 0.5rem 1.5rem;
	padding: 0.85rem 0;
}
.property + .property {
	border-top: 1px solid var(--border);
}
dt {
	color: var(--teal);
	font-weight: 500;
}
dd {
	min-width: 0;
	margin: 0;
	white-space: pre-wrap;
}
.values {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	list-style: none;
	margin: 0;
	padding: 0;
}
.values li {
	padding: 0.1rem 0.55rem;
	border-radius: 0.3rem;
	background: var(--active);
	color: var(--heading);
	font-size: 0.8rem;
}
pre {
	margin: 0.85rem 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font: 0.75rem/1.8 var(--mono-font);
	color: var(--plum);
}
dd pre {
	margin: 0;
}
code {
	font: inherit;
}
.error {
	color: var(--gold);
	margin: 1rem 0;
}
@media (max-width: 600px) {
	.property {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.35rem;
	}
}
</style>
