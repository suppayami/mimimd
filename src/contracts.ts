export interface Entry {
	path: string
	name: string
	children?: Entry[]
}
export interface DocumentIndex {
	mode: 'file' | 'folder'
	tree: Entry[]
	documents: string[]
	defaultDocument: string | null
}
export interface Heading {
	id: string
	text: string
	depth: number
}
export interface RenderedDocument {
	html: string
	headings: Heading[]
}
