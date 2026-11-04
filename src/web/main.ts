import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { palettes } from '../themes/everforest'
import App from './App.vue'
import 'katex/dist/katex.min.css'
import './style.css'

for (const [mode, palette] of Object.entries(palettes)) {
	const style = document.createElement('style')
	style.textContent = `[data-theme="${mode}"]{${Object.entries(palette)
		.map(([key, value]) => `--${key}:${value}`)
		.join(';')}}`
	document.head.append(style)
}

const router = createRouter({
	history: createWebHistory(),
	routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
})

createApp(App).use(router).mount('#app')
