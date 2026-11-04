import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { startServer } from '../src/server/http'

const exec = promisify(execFile)

it('prints valid standalone skill Markdown and exercises its file/stdin/link/replacement curl workflow', async () => {
	const root = await mkdtemp(path.resolve('tests/.publishing-'))
	const app = await startServer(null, '127.0.0.1', 0, {
		workerUrl: new URL('../dist/server/render-worker.js', import.meta.url),
	})
	try {
		const skill = (
			await exec('node', ['dist/cli.js', 'skill'], {
				env: { ...process.env, MIMIMD_STATE_DIR: root },
			})
		).stdout
		const metadata = parse(skill.split('---')[1]!)
		expect(metadata).toMatchObject({
			name: 'mimimd-publishing',
			description: expect.any(String),
		})
		expect(await readdir(root)).toEqual([])
		const first = path.join(root, 'article.md')
		const replacement = path.join(root, 'replacement.md')
		await writeFile(first, '# Guide\n\nOriginal content')
		await writeFile(replacement, '# Updated guide\n\nReplacement content')
		const flags = [
			'--fail-with-body',
			'--silent',
			'--show-error',
			'--request',
			'PUT',
			'--header',
			'Content-Type: text/markdown; charset=utf-8',
			'--header',
			`X-Mimimd-Session: ${app.sessionId}`,
		]
		for (const [file, revision] of [
			[first, 1],
			[replacement, 2],
		] as const) {
			const receipt = JSON.parse(
				(
					await exec('curl', [
						...flags,
						'--data-binary',
						`@${file}`,
						`${app.url}/api/session-documents/guide`,
					])
				).stdout,
			)
			expect(receipt.sessionId).toBe(app.sessionId)
			await expect
				.poll(async () => (await (await fetch(receipt.statusUrl)).json()).revision)
				.toBe(revision)
			if (revision === 1) {
				const map = await (await fetch(`${app.url}/api/documents`)).json()
				const child = spawn(
					'curl',
					[...flags, '--data-binary', '@-', `${app.url}/api/session-documents/linked`],
					{ stdio: ['pipe', 'pipe', 'pipe'] },
				)
				try {
					let output = ''
					child.stdout.on('data', (chunk) => {
						output += chunk
					})
					child.stderr.resume()
					const exit = new Promise<number | null>((resolve, reject) => {
						child.once('error', reject)
						child.once('exit', resolve)
					})
					child.stdin.end(`# Linked\n\n[Guide](${map.documents[0].readerUrl}#guide)`)
					expect(await exit).toBe(0)
					const linked = JSON.parse(output)
					await expect
						.poll(async () => (await (await fetch(linked.statusUrl)).json()).state)
						.toBe('ready')
				} finally {
					if (child.exitCode === null) {
						const exited = new Promise<void>((resolve) =>
							child.once('exit', () => resolve()),
						)
						child.kill()
						await exited
					}
				}
			}
		}
		const map = await (await fetch(`${app.url}/api/documents`)).json()
		expect(map.documents).toHaveLength(2)
		expect(map.documents.find((entry: { key: string }) => entry.key === 'guide')).toMatchObject(
			{ revision: 2, readerUrl: `${app.url}/session/guide` },
		)
		expect(await (await fetch(`${app.url}/api/session-documents/linked`)).json()).toMatchObject(
			{ html: expect.stringContaining(`${app.url}/session/guide#guide`) },
		)
	} finally {
		await app.close()
		await rm(root, { recursive: true, force: true })
	}
}, 15000)
