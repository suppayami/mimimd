import { describe, expect, it } from 'vitest'
import { parseArguments } from '../src/args'
describe('command-line arguments', () => {
	it('accepts informational commands without input', () => {
		expect(parseArguments(['--help']).help).toBe(true)
		expect(parseArguments(['--version']).version).toBe(true)
	})
	it('requires one input and rejects invalid ports and unknown flags', () => {
		for (const args of [
			[],
			['a', 'b'],
			['a', '--port', '0'],
			['a', '--port', '3.5'],
			['a', '--host', ''],
			['a', '--unknown'],
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
