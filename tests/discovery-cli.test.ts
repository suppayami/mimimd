import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)

it('discovers multiple CLI sessions, prints the reusable skill, and cleans registry records at shutdown', async () => {
	const root = await mkdtemp(path.resolve('tests/.discovery-'))
	const env = { ...process.env, MIMIMD_STATE_DIR: root }
	const children: ReturnType<typeof spawn>[] = []
	try {
		expect(
			JSON.parse((await exec('node', ['dist/cli.js', 'discover', '--json'], { env })).stdout),
		).toEqual([])
		const skill = (await exec('node', ['dist/cli.js', 'skill'], { env })).stdout
		expect(skill).toMatch(/^---\nname: mimimd-publishing\ndescription: .+\n---/)
		expect(await readdir(root)).toEqual([])
		for (const port of ['3198', '3199']) {
			const child = spawn('node', ['dist/cli.js', '--port', port], {
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			children.push(child)
			await new Promise<void>((resolve, reject) => {
				let output = ''
				let diagnostic = ''
				child.stderr!.on('data', (chunk) => {
					diagnostic += chunk
				})
				child.stdout!.on('data', (chunk) => {
					output += chunk
					if (output.includes(`http://localhost:${port}`)) {
						resolve()
					}
				})
				child.once('error', reject)
				child.once('exit', (code) =>
					reject(new Error(`CLI exited: ${code}: ${diagnostic}`)),
				)
			})
		}
		const records = JSON.parse(
			(await exec('node', ['dist/cli.js', 'discover', '--json'], { env })).stdout,
		)
		expect(records).toHaveLength(2)
		for (const record of records) {
			expect(record.writable).toBe(true)
			const health = await (await fetch(record.probeUrl)).json()
			expect(health.sessionId).toBe(record.sessionId)
			const response = await fetch(`${record.readerUrl}/api/session-documents/guide`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					'X-Mimimd-Session': record.sessionId,
				},
				body: '# From printed workflow',
			})
			expect(response.status).toBe(202)
			const receipt = await response.json()
			await expect
				.poll(async () => (await (await fetch(receipt.statusUrl)).json()).state)
				.toBe('ready')
		}
	} finally {
		await Promise.all(
			children.map(async (child) => {
				if (child.exitCode !== null) {
					return
				}
				const exited = once(child, 'exit')
				child.kill('SIGTERM')
				await exited
			}),
		)
		expect(await readdir(root)).toEqual([])
		await rm(root, { recursive: true, force: true })
	}
}, 20000)
