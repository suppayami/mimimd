import { Buffer } from 'node:buffer'
import { parentPort, workerData } from 'node:worker_threads'
import { renderMarkdown } from '../markdown/render.js'

async function render() {
	try {
		const rendered = await renderMarkdown(workerData.source, null)
		const serialized = JSON.stringify({ ...workerData.identity, ...rendered })
		if (Buffer.byteLength(serialized) > workerData.outputBytes) {
			parentPort!.postMessage({ error: 'output_limit' })
			return
		}

		parentPort!.postMessage({ serialized })
	} catch {
		parentPort!.postMessage({ error: 'render_failed' })
	}
}

void render()
