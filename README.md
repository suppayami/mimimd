# mimimd

> [!CAUTION]
> AI Slop, use at your own risk.

A local Markdown reader built with Vue 3.5 and a Hono Node server. Requires Node **>=24**.

```sh
pnpm install
pnpm dev ./docs
# Or after building:
pnpm build
node dist/cli.js README.md
node dist/cli.js ./docs --no-recursive
node dist/cli.js ./docs --host 0.0.0.0 --port 6395
node dist/cli.js ./docs --open
```

Once published, `pnpm dlx @suppayami/mimimd <file-or-folder>` runs without a user build step. Publication and registry-name availability are not confirmed.

Localhost:6395 is the default. An occupied port is an error. LAN sharing is explicitly **unauthenticated**: use only trusted networks, never public hosting. Ctrl-C closes the watcher and connections.

## Reading

Folder mode offers expandable directories, filename/path filtering, heading links, direct URLs and browser history. File mode hides the file sidebar and does not expose sibling Markdown. Theme selection follows the OS initially and persists when changed. Narrow screens provide Files and Headings controls.

CommonMark/GFM, task lists, Shiki code, KaTeX math and strict Mermaid diagrams render locally without CDN requests. Unknown code languages remain plain text. Raw HTML, MDX, diagram directives and click actions are disabled. Content, tree and image changes update automatically.

YAML frontmatter at the start of a document appears in a collapsible **Document properties** panel. Scalar lists display as chips; nested values remain YAML. Metadata is displayed as text, not HTML, and is excluded from the page outline. Invalid YAML remains visible as source without preventing the document from rendering.

Hidden entries, node_modules, secrets directories, key files and symlinks are excluded. Only indexed .md/.markdown documents are readable. Assets are limited to PNG/JPEG/GIF/WebP/AVIF/ICO/SVG images and PDF attachments within the root; nested assets remain available in shallow mode. SVG responses are sandboxed; PDF downloads are attachments. Local HTML, JavaScript and arbitrary files are never served as user content.

## Development

Use pnpm 12.6.0. Dependencies have a two-day minimum release age. TypeScript 6 is used because current Vue and ESLint tooling do not support TypeScript 7.

```sh
pnpm build
pnpm typecheck
pnpm format
pnpm lint:fix
pnpm lint
pnpm format:check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm pack
```

Tests use synthetic workspace fixtures. Generated test workspaces are retained under ignored `tests/.*` directories; no production data or external model services are used. Package smoke validation installs a local tarball and requires registry access for dependencies, then exercises the installed CLI and locally bundled UI.

See [architecture and application flow](docs/architecture.md) and [theme attribution](docs/theme-attribution.md). Separate desktop/mobile screenshot review and text-contrast verification were performed outside the functional suites. Run `node scripts/check-contrast.ts` to recheck palette text contrast; use `tests/fixtures/layout.md` for overflow and fallback review. Physical LAN-device verification remains a release check. Linux is the currently tested platform; concurrent adversarial filesystem mutation and Windows/macOS require further validation. Do not serve a directory writable by an untrusted process.
