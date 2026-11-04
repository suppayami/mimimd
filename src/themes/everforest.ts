import type { ThemeRegistration } from 'shiki'
export const palettes = {
	light: {
		bg: '#fdf6e3',
		surface: '#f4f0d9',
		fg: '#5c6a72',
		red: '#f85552',
		green: '#8da101',
		blue: '#3a94c5',
		purple: '#df69ba',
		yellow: '#dfa000',
	},
	dark: {
		bg: '#2d353b',
		surface: '#343f44',
		fg: '#d3c6aa',
		red: '#e67e80',
		green: '#a7c080',
		blue: '#7fbbb3',
		purple: '#d699b6',
		yellow: '#dbbc7f',
	},
}
export const themes: ThemeRegistration[] = (['light', 'dark'] as const).map((mode) => {
	const p = palettes[mode]
	return {
		name: `everforest-medium-${mode}`,
		type: mode,
		colors: { 'editor.background': p.bg, 'editor.foreground': p.fg },
		tokenColors: [
			{ scope: ['comment'], settings: { foreground: p.fg, fontStyle: 'italic' } },
			{
				scope: ['keyword', 'storage'],
				settings: { foreground: mode === 'light' ? p.fg : p.red, fontStyle: 'bold' },
			},
			{ scope: ['string'], settings: { foreground: mode === 'light' ? p.fg : p.green } },
			{
				scope: ['entity.name.function', 'support.function'],
				settings: { foreground: mode === 'light' ? p.fg : p.blue },
			},
			{
				scope: ['constant', 'entity.name.type'],
				settings: { foreground: mode === 'light' ? p.fg : p.purple },
			},
		],
	}
})
