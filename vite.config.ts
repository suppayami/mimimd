import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
export default defineConfig({
	root: 'src/web',
	base: '/ui/',
	plugins: [vue()],
	build: { outDir: '../../dist/web', emptyOutDir: true },
})
