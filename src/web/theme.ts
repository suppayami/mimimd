import { ref, watch } from 'vue'

export const theme = ref<'light' | 'dark'>(
	localStorage.getItem('mimimd-theme') === 'dark'
		? 'dark'
		: localStorage.getItem('mimimd-theme') === 'light'
			? 'light'
			: matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light',
)

watch(
	theme,
	(value) => {
		document.documentElement.dataset.theme = value
	},
	{ immediate: true },
)

export function toggleTheme() {
	theme.value = theme.value === 'dark' ? 'light' : 'dark'
	localStorage.setItem('mimimd-theme', theme.value)
}
