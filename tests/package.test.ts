import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)
it('installs a tarball and serves from an unrelated working directory', async () => {
	const root = await mkdtemp(path.resolve('tests/.package-'))
	const env = { ...process.env, MIMIMD_STATE_DIR: path.join(root, 'state') }
	try {
		const installation = path.join(root, 'installation')
		const caller = path.join(root, 'caller')
		await mkdir(installation)
		await mkdir(caller)
		await mkdir(path.join(caller, '.git'))
		await writeFile(path.join(installation, 'package.json'), JSON.stringify({ private: true }))
		await writeFile(path.join(installation, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 2880\n')
		await writeFile(path.join(caller, 'hello.md'), '# Installed reader')
		await exec('pnpm', ['pack', '--out', path.join(root, 'mimimd.tgz')], {
			maxBuffer: 10_000_000,
		})
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
		expect((await exec('node', [entry, '--version'], { cwd: caller })).stdout.trim()).toBe(
			'0.1.0',
		)
		expect(await readdir(path.join(installed, 'dist/web/assets'))).toEqual(
			expect.arrayContaining([expect.stringMatching(/\.woff2$/)]),
		)
		expect(await readFile(path.join(installed, 'docs/theme-attribution.md'), 'utf8')).toContain(
			'Copyright (c) 2019 sainnhe',
		)
		const child = spawn('node', [entry, 'hello.md', '--port', '3197'], {
			cwd: caller,
			env,
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
			const skill = (await exec('node', [entry, 'skill'], { cwd: caller, env })).stdout
			expect(skill).toContain('name: mimimd-publishing')
			const records = JSON.parse(
				(await exec('node', [entry, 'discover', '--json'], { cwd: caller, env })).stdout,
			)
			expect(records).toHaveLength(1)
			for (const revision of [1, 2]) {
				expect(
					(
						await fetch(`${url}/api/session-documents/installed`, {
							method: 'PUT',
							body: '# Installed worker',
							headers: {
								'Content-Type': 'text/markdown; charset=utf-8',
								'X-Mimimd-Session': records[0].sessionId,
							},
						})
					).status,
				).toBe(202)
				await expect
					.poll(
						async () =>
							(
								await (
									await fetch(`${url}/api/session-documents/installed/status`)
								).json()
							).revision,
						{ timeout: 10000 },
					)
					.toBe(revision)
			}
			const html = await (await fetch(url)).text()
			const script = html.match(/src="([^"]+\.js)"/)![1]!
			expect((await fetch(url + script)).status).toBe(200)
		} finally {
			if (child.exitCode === null) {
				const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
				child.kill('SIGINT')
				await exited
			}
		}

		const empty = spawn('node', [entry, '--port', '3197'], {
			cwd: caller,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		try {
			await new Promise<void>((resolve, reject) => {
				empty.stdout.on('data', (chunk) => {
					if (String(chunk).includes('http://')) {
						resolve()
					}
				})
				empty.once('error', reject)
				empty.once('exit', (code) =>
					reject(new Error(`Empty installed CLI exited: ${code}`)),
				)
			})
			const records = JSON.parse(
				(await exec('node', [entry, 'discover', '--json'], { cwd: caller, env })).stdout,
			)
			expect(records).toHaveLength(1)
			const url = records[0].readerUrl
			expect(await (await fetch(`${url}/api/index`)).json()).toMatchObject({
				mode: 'empty',
				documents: [],
			})
			expect((await fetch(`${url}/api/session-documents/installed`)).status).toBe(404)
			expect((await fetch(`${url}/content/image.svg`)).status).toBe(404)
		} finally {
			if (empty.exitCode === null) {
				const exited = new Promise<void>((resolve) => empty.once('exit', () => resolve()))
				empty.kill('SIGINT')
				await exited
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true })
	}
}, 120_000)
