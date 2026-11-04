export interface Entry {
	path: string
	name: string
	children?: Entry[]
}

export interface DocumentIndex {
	mode: 'empty' | 'file' | 'folder'
	tree: Entry[]
	documents: string[]
	defaultDocument: string | null
}

export interface SessionStatus {
	sessionId: string
	key: string
	attemptId: string
	state: 'receiving' | 'preparing' | 'ready' | 'failed'
	receivedBytes: number
	revision: number | null
	error?: { code: string; message: string }
}

export interface DocumentMapEntry {
	id: string
	source: 'filesystem' | 'session'
	label: string
	readerUrl: string
	writable: boolean
	key?: string
	path?: string
	revision?: number
}

export interface DocumentMap {
	sessionId: string
	documents: DocumentMapEntry[]
}

export interface Heading {
	id: string
	text: string
	depth: number
}

export interface Frontmatter {
	properties: { name: string; value: string | string[]; structured?: boolean }[]
	raw?: string
	error?: string
}

export interface RenderedDocument {
	html: string
	headings: Heading[]
	frontmatter?: Frontmatter
}
