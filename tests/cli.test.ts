import { describe, expect, it } from 'vitest'
import { parseArguments } from '../src/args'
describe('command-line arguments', () => {
	it('accepts informational commands without input', () => {
		expect(parseArguments(['--help']).help).toBe(true)
		expect(parseArguments(['--version']).version).toBe(true)
	})
	it('accepts empty startup and rejects invalid ports and unknown flags', () => {
		expect(parseArguments([]).input).toBe('')
		for (const args of [
			['a', 'b'],
			['a', '--port', '0'],
			['a', '--port', '3.5'],
			['a', '--host', ''],
			['a', '--unknown'],
		]) {
			expect(() => parseArguments(args)).toThrow()
		}
	})
	it('reserves bare commands without stealing explicit relative paths', () => {
		expect(parseArguments(['discover', '--json']).command).toBe('discover')
		expect(parseArguments(['skill']).command).toBe('skill')
		for (const input of ['./discover', './skill']) {
			expect(parseArguments([input])).toMatchObject({ command: 'serve', input })
		}
		for (const args of [
			['discover'],
			['discover', '--json', 'docs'],
			['skill', '--port', '4000'],
			['--json'],
		]) {
			expect(() => parseArguments(args)).toThrow()
		}
	})

	it('preserves explicit LAN and shallow mode choices', () => {
		expect(
			parseArguments(['docs', '--host', '0.0.0.0', '--no-recursive', '--port', '4444']),
		).toMatchObject({ input: 'docs', host: '0.0.0.0', port: 4444, recursive: false })
	})
})
