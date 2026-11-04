import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)
it('installs a tarball and serves from an unrelated working directory', async () => {
	const root = await mkdtemp(path.resolve('tests/.package-'))
	const installation = path.join(root, 'installation')
	const caller = path.join(root, 'caller')
	await mkdir(installation)
	await mkdir(caller)
	await writeFile(path.join(installation, 'package.json'), JSON.stringify({ private: true }))
	await writeFile(path.join(installation, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 2880\n')
	await writeFile(path.join(caller, 'hello.md'), '# Installed reader')
	await exec('pnpm', ['pack', '--out', path.join(root, 'mimimd.tgz')], { maxBuffer: 10_000_000 })
	await exec(
		'pnpm',
		['--dir', installation, '--ignore-workspace', 'add', path.join(root, 'mimimd.tgz')],
		{ maxBuffer: 10_000_000 },
	)
	const installed = path.join(installation, 'node_modules/@suppayami/mimimd')
	const entry = path.join(installed, 'dist/cli.js')
	expect(
		(
			await exec(path.join(installation, 'node_modules/.bin/mimimd'), ['--help'], {
				cwd: caller,
			})
		).stdout,
	).toContain('Usage: mimimd')
	expect((await exec('node', [entry, '--version'], { cwd: caller })).stdout.trim()).toBe('0.1.0')
	expect(await readdir(path.join(installed, 'dist/web/assets'))).toEqual(
		expect.arrayContaining([expect.stringMatching(/\.woff2$/)]),
	)
	expect(await readFile(path.join(installed, 'docs/theme-attribution.md'), 'utf8')).toContain(
		'Copyright (c) 2019 sainnhe',
	)
	const child = spawn('node', [entry, 'hello.md', '--port', '3197'], {
		cwd: caller,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	try {
		const url = await new Promise<string>((resolve, reject) => {
			let output = ''
			child.stdout.on('data', (chunk) => {
				output += chunk
				const match = output.match(/http:\/\/localhost:\d+/)
				if (match) {
					resolve(match[0])
				}
			})
			child.once('error', reject)
			child.once('exit', (code) => reject(new Error(`Installed CLI exited: ${code}`)))
		})
		expect(await (await fetch(`${url}/api/index`)).json()).toMatchObject({
			mode: 'file',
			documents: ['hello.md'],
		})
		expect(await (await fetch(`${url}/api/document?path=hello.md`)).json()).toMatchObject({
			headings: [{ text: 'Installed reader' }],
		})
		const html = await (await fetch(url)).text()
		const script = html.match(/src="([^"]+\.js)"/)![1]!
		expect((await fetch(url + script)).status).toBe(200)
	} finally {
		child.kill('SIGINT')
		await new Promise<void>((resolve) => child.once('exit', () => resolve()))
	}
}, 120_000)
