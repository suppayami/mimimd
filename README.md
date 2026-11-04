# mimimd

> [!CAUTION]
> AI Slop, use at your own risk.

A local Markdown reader built with Vue 3.5 and a Hono Node server. Requires Node **>=24**.

```sh
pnpm install
pnpm dev ./docs
# Or after building:
pnpm build
node dist/cli.js # Empty, memory-only publishing session
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

## Agent publishing

Start `mimimd` without input for an empty reader, or keep serving a file/folder alongside session documents. Filesystem content stays read-only. Published documents live only in memory and disappear at shutdown. Publishing updates navigation without choosing a document for the reader.

- `mimimd discover --json` returns all verified running sessions; an empty array is a successful no-server result. Choose explicitly when several sessions exist.
- `mimimd skill` prints reusable agent instructions without starting a server or performing network/installation actions.
- Bare `discover` and `skill` are reserved commands; use `./discover` or `./skill` to serve same-named directories.

Use `GET /api/health` to verify product, protocol, session ID, write capability and limits. `GET /api/documents` returns eligible filesystem and committed session entries with absolute reader URLs for Markdown links. Session documents have no implicit filesystem-relative link base.

Publish raw UTF-8 with `PUT /api/session-documents/<key>`, `Content-Type: text/markdown; charset=utf-8`, and `X-Mimimd-Session` matching health. Keys are case-sensitive, 1–128 ASCII letters/digits/hyphens/underscores, starting with a letter/digit. Reuse the same key to replace atomically at the same `/session/<key>` URL. Poll the returned status URL and compare attempt IDs. **202 is acceptance, not display completion**; `ready` means server rendering committed, with browser preparation still separate. Failed replacements retain previous content.

Only explicit `localhost`, `127.0.0.1`, and `::1` bindings with loopback listeners/peers permit publishing. Wildcard/LAN bindings are read-only. Host and Origin checks remain enforced, without permissive CORS. The session ID prevents accidental writes after port reuse; it is not authentication against another local process.

Limits: 10 MiB actual UTF-8 source bytes, two active attempts, one render worker, 256 keys including failed attempts, 128 MiB accounted payloads/reservations, 32 MiB complete serialized rendered output, 120-second upload and 60-second render deadlines, and 256 MiB worker old-generation heap. These are not a process RSS ceiling. Same-key overlap returns 409; busy/storage capacity returns 503 with `Retry-After`. Invalid UTF-8, excessive input, wrong media and forbidden writes return explicit errors. Do not truncate rich content to hide a failure.

Discovery stores metadata only: Linux `$XDG_STATE_HOME/mimimd` or `~/.local/state/mimimd`, macOS `~/Library/Application Support/mimimd`, Windows `%LOCALAPPDATA%/mimimd`. `MIMIMD_STATE_DIR` overrides this for isolated environments. New directories/records use restrictive permissions where supported. Records are registered after readiness, verified over bounded loopback-only health probes without redirects, and removed at graceful shutdown. Stale records are skipped, not swept. Explicit LAN-only bindings without a loopback probe are not registered and print a diagnostic.

See [the publishing specification](docs/specs/agent-publishing.md) for contracts and [implementation evidence](tasks/todo.md) for measured limits and remaining platform caveats.

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

Tests use synthetic workspace fixtures and isolated discovery directories; no production data or external model services are used. Publishing/discovery/package tests clean their generated workspaces. Older tests may leave ignored `tests/.*` directories, which must be inspected and cleaned after verification. Package smoke validation installs a local tarball and requires registry access for dependencies, then exercises the installed CLI and locally bundled UI.

See [architecture and application flow](docs/architecture.md) and [theme attribution](docs/theme-attribution.md). Separate desktop/mobile screenshot review and text-contrast verification were performed outside the functional suites. Run `node scripts/check-contrast.ts` to recheck palette text contrast; use `tests/fixtures/layout.md` for overflow and fallback review. Physical LAN-device verification remains a release check. Linux is the currently tested platform; concurrent adversarial filesystem mutation and Windows/macOS require further validation. Do not serve a directory writable by an untrusted process.
