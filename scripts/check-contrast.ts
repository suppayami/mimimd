// Separate design verification, deliberately outside the functional test suites.
import { palettes, themes } from '../src/themes/everforest.ts'

function luminance(hex: string) {
	const channels = hex
		.slice(1)
		.match(/../g)!
		.map((channel) => {
			const value = Number.parseInt(channel, 16) / 255
			return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
		})
	return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function contrast(foreground: string, background: string) {
	const a = luminance(foreground)
	const b = luminance(background)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

for (const [mode, palette] of Object.entries(palettes)) {
	const theme = themes.find((theme) => theme.type === mode)!
	const ratios = [
		contrast(palette.fg, palette.bg),
		contrast(palette.fg, palette.surface),
		...theme.tokenColors!.map((token) => contrast(token.settings.foreground!, palette.bg)),
	]
	const minimum = Math.min(...ratios)
	console.log(`${mode} minimum text contrast: ${minimum.toFixed(2)}:1`)
	if (minimum < 4.5) {
		throw new Error(`${mode} text contrast is below WCAG AA.`)
	}
}
