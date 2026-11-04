import { networkInterfaces } from 'node:os'
import { expect, it } from 'vitest'
import { FileScope } from '../../src/server/files'
import { startServer } from '../../src/server/http'
it('fails on occupied ports and releases the listener on shutdown', async () => {
	const scope = await FileScope.create('tests/fixtures/README.md')
	const first = await startServer(scope, '127.0.0.1', 0)
	const port = Number(new URL(first.url).port)
	try {
		await expect(startServer(scope, '127.0.0.1', port)).rejects.toMatchObject({
			code: 'EADDRINUSE',
		})
	} finally {
		await first.close()
	}
	const second = await startServer(scope, '127.0.0.1', port)
	await second.close()
})
it('accepts same-origin requests through an explicit LAN binding', async () => {
	const scope = await FileScope.create('tests/fixtures/README.md')
	const app = await startServer(scope, '0.0.0.0', 0)
	try {
		const address =
			Object.values(networkInterfaces())
				.flat()
				.find((address) => address?.family === 'IPv4' && !address.internal)?.address ??
			'127.0.0.1'
		const origin = `http://${address}:${new URL(app.url).port}`
		const response = await fetch(`${origin}/api/index`, { headers: { Origin: origin } })
		expect(response.status).toBe(200)
		expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
	} finally {
		await app.close()
	}
})
