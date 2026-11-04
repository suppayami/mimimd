import { parentPort, workerData } from 'node:worker_threads'

// Controlled retained-output sizes exercise HTTP storage admission without expensive Markdown expansion.
const html = workerData.source === 'large' ? 'x'.repeat(30 * 1024 * 1024) : '<h1>Recovered</h1>'
parentPort.postMessage({
	serialized: JSON.stringify({ ...workerData.identity, html, headings: [] }),
})
