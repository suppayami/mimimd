import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { discover, registerSession } from '../../src/server/discovery'
import { startServer } from '../../src/server/http'

it('verifies exact live identities, excludes malformed/external/redirected records, and removes only its own record', async () => {
	const directory = await mkdtemp(path.resolve('tests/.discovery-'))
	const app = await startServer(null, '127.0.0.1', 0)
	let requests = 0
	const redirect = createServer((_request, response) => {
		requests++
		response.writeHead(302, { Location: `${app.url}/api/health` })
		response.end()
	})
	await new Promise<void>((resolve) => redirect.listen(0, '127.0.0.1', resolve))
	const record = {
		sessionId: app.sessionId,
		pid: process.pid,
		startedAt: new Date().toISOString(),
		probeUrl: `${app.url}/api/health`,
		readerUrl: app.url,
		scopeLabel: 'Synthetic empty session',
		protocolVersion: 1 as const,
	}
	try {
		const unregister = await registerSession(record, directory)
		if (process.platform !== 'win32') {
			expect((await stat(path.join(directory, `${app.sessionId}.json`))).mode & 0o777).toBe(
				0o600,
			)
		}
		await writeFile(path.join(directory, `${randomUUID()}.json`), '{malformed')
		await registerSession({ ...record, sessionId: randomUUID() }, directory)
		await registerSession(
			{
				...record,
				sessionId: randomUUID(),
				probeUrl: `http://127.0.0.1:${(redirect.address() as { port: number }).port}/api/health`,
			},
			directory,
		)
		await registerSession(
			{ ...record, sessionId: randomUUID(), probeUrl: 'http://192.0.2.1:80/api/health' },
			directory,
		)
		expect(await discover(directory)).toEqual([{ ...record, writable: true }])
		expect(requests).toBe(1)
		await unregister()
		expect(await readdir(directory)).toHaveLength(4)
		expect(await discover(directory)).toEqual([])
	} finally {
		await app.close()
		await new Promise<void>((resolve) => redirect.close(() => resolve()))
		await rm(directory, { recursive: true, force: true })
	}
})
