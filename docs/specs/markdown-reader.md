# Spec: mimimd Markdown Reader

## Objective

Build a Node.js CLI that serves one Markdown file or a folder as a polished reading website. Folder mode provides recursive navigation. Serve locally by default and allow explicit LAN sharing.

Use matching Everforest Medium Light and Dark palettes across the page, code blocks, math, and diagrams. Use Shiki for code highlighting.

## Tech Stack

- TypeScript, Node.js >=24, and pnpm. Declare the Node requirement in package engines and use a pnpm lockfile.
- Set `minimumReleaseAge: 2880` in `pnpm-workspace.yaml`. This is a two-day minimum dependency release age, expressed in minutes.
- Verify that Node.js 24 and compatible tooling are available before implementation validation. Do not silently lower the requested minimum.
- Hono with its Node HTTP adapter and a small route layer (approved implementation update). No public hosting or authentication layer.
- Vue.js 3.5 single-file components with TypeScript and scoped CSS. Use semantic HTML.
- Use Vue Router for document navigation, direct links, and browser history. This avoids maintaining a custom history implementation.
- Vite with the Vue plugin for development and bundled browser assets; users do not run a build step.
- Oxfmt for formatting. ESLint with `@antfu/eslint-config` for linting, configured with `stylistic: false`, `lessOpinionated: true`, and `curly: ['error', 'all']`.
- Unified/remark/rehype for CommonMark, GitHub-style Markdown, heading IDs, and safe HTML output.
- Shiki for server-side code highlighting. Reuse highlighters rather than initializing per request.
- KaTeX for math. Mermaid for browser-side diagrams in strict security mode. Bundle dependencies locally; no CDN requirement.
- Chokidar for file watching; server-sent events notify connected pages of changes.
- Vitest for unit, integration, and Vue component tests. Use `@testing-library/vue` for user-facing component tests.
- Playwright for end-to-end browser tests.
- Verify compatible dependency versions during implementation. No dependencies or existing conventions are present yet.

## Commands

Proposed public interface:

```sh
pnpm dlx @suppayami/mimimd README.md
pnpm dlx @suppayami/mimimd ./docs
pnpm dlx @suppayami/mimimd ./docs --no-recursive
pnpm dlx @suppayami/mimimd ./docs --host 0.0.0.0 --port 6395
pnpm dlx @suppayami/mimimd ./docs --open
pnpm dlx @suppayami/mimimd --help
pnpm dlx @suppayami/mimimd --version
```

- Require one file or directory argument. Resolve it against the caller's working directory.
- Accept `.md` and `.markdown`, case-insensitively.
- Default to localhost and port 6395. If the port is occupied, fail with an actionable message; do not silently change ports.
- `--open` opens the browser only after the server starts. It is off by default.
- Folder scanning is recursive unless `--no-recursive` is set.
- Print the served root and URL at startup. Warn that LAN mode has no authentication.
- Invalid arguments, missing paths, unsupported file inputs, and unreadable roots produce a nonzero exit status and concise errors.
- Ctrl-C closes the server, event streams, and watcher.

Planned repository scripts, to be created during implementation:

```sh
pnpm install
pnpm dev ./docs
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format:check
pnpm format
pnpm test
pnpm test:e2e
pnpm pack
```

Required script mappings:

| Command             | Script            | Behavior                                 |
| ------------------- | ----------------- | ---------------------------------------- |
| `pnpm format`       | `oxfmt --write .` | Format files in place.                   |
| `pnpm format:check` | `oxfmt --check .` | Check formatting without changing files. |
| `pnpm lint`         | `eslint .`        | Check lint rules without changing files. |
| `pnpm lint:fix`     | `eslint . --fix`  | Apply available ESLint fixes.            |

## Project Structure

Proposed layout; the repository has no source code yet:

```text
src/
  cli.ts
  server/       # HTTP routes, path containment, file index, watching
  markdown/     # Rendering, headings, links, Shiki configuration
  web/          # Vue components, navigation, scoped styles, diagrams
  themes/       # Verified Everforest Medium palette definitions
 tests/         # Unit, integration, browser tests and fixtures
 docs/specs/
tasks/          # Implementation plan and ordered checklist
```

The published package includes compiled CLI/server code and browser assets. Runtime asset paths resolve relative to the installed package, not the caller's working directory.

### Reading and navigation

- File mode opens the selected document and omits the folder sidebar. Its parent directory is the asset root, but sibling Markdown documents are not exposed as navigable documents.
- Folder mode displays a collapsible directory tree, with directories before files and stable alphabetical sorting.
- Ignore hidden entries and `node_modules`. Do not follow symbolic links. Apply these rules to direct requests as well as discovery.
- Hide folders with no eligible documents. Display a clear empty state for an empty root.
- Prefer a root `README.md`, then `index.md`, case-insensitively. Otherwise open the first document in the stable tree order.
- Filter filenames and relative paths without case sensitivity. Preserve enough parent context to distinguish repeated names. This is not full-text search.
- Use stable, shareable document URLs derived from root-relative paths. Direct loads, refresh, and browser Back/Forward work.
- Resolve Markdown links relative to the current document. Links to indexed Markdown files navigate within the reader; fragments scroll to stable, unique heading IDs.
- Resolve local images relative to the document and support spaces and Unicode in paths.
- Links outside the allowed document scope must not expand that scope. Show a clear unavailable-document state for missing or excluded documents.
- In `--no-recursive` mode, nested documents remain unavailable even by direct URL. Nested safe assets may still be used within the root.
- Include a heading table of contents and clear active-document styling.

### Visual design and accessibility

- Use Everforest Medium Light for light mode and Everforest Medium Dark for dark mode, including code highlighting.
- Verify palette provenance and licensing. Do not treat a generic built-in Everforest theme as an exact Medium match. Supply custom Shiki theme definitions if required.
- Default to the operating system theme. Offer a light/dark toggle and persist the user's choice locally.
- Use a readable content width, clear heading hierarchy, comfortable line spacing, and horizontally scrollable code blocks and tables.
- Desktop uses a file sidebar, reading area, and heading navigation when space permits. Narrow screens use keyboard-accessible toggles for navigation.
- Use semantic landmarks, visible keyboard focus, labeled controls, and accessible navigation states. Meet WCAG AA text contrast; use suitable palette colors without changing the agreed theme family.
- Honor reduced-motion preferences. Show no dependency on externally hosted fonts or rendering assets.

### Markdown and live updates

- Support CommonMark plus GitHub-style tables, task lists, strikethrough, and automatic links.
- Render fenced code with Shiki. Unknown or absent language identifiers fall back to escaped plain text.
- Support inline and block math with KaTeX and fenced `mermaid` diagrams.
- Disable raw HTML, MDX, KaTeX trust features, Mermaid click actions, and unsafe URL protocols.
- Sanitize generated Markdown HTML using an explicit schema that preserves only required highlighting and math markup. Treat Mermaid SVG as a separate untrusted rendering boundary.
- Invalid math or diagrams show a local error/fallback without breaking the rest of the page.
- Watch document, directory, and local asset changes. Debounce event bursts and update the index on additions, renames, and deletions.
- Refresh changed content automatically, preserving the current document, theme, and scroll position where possible. Re-render diagrams for theme changes.
- Deleting the active document shows a missing-document state while keeping navigation usable.

### HTTP and file access

- Canonicalize and validate paths before reading files. Reject traversal, malformed encodings, hidden entries, and symbolic-link access. Use the same checks for documents and assets.
- Serve only indexed Markdown documents and an explicit set of static asset types needed by the reader, such as raster images, SVG images, and PDF attachments. Do not provide arbitrary directory or source-file downloads.
- Serve SVG as image content with restrictive response headers, not as injected page markup. Do not expose local HTML or JavaScript files as reader content.
- Separate bundled application assets from user content routes. Set correct content types, `nosniff`, and a content security policy compatible with bundled renderers but not arbitrary scripts.
- Do not enable permissive CORS. Validate Host/Origin where applicable to reduce cross-origin and DNS-rebinding access to the local server.
- LAN access is explicitly unauthenticated. This tool is not a public file server.

## Code Style

- Use strict TypeScript and ES modules. Type-check Vue components with `vue-tsc`.
- Use Vue 3.5 single-file components with `<script setup lang="ts">` and `<style scoped>`.
- Keep component styles scoped. Use scoped deep selectors for sanitized Markdown inserted with `v-html`; never compile document content as Vue templates. Limit global CSS to shared theme tokens, document defaults, and required vendor styles.
- Configure Oxfmt in `.oxfmtrc.json` with these explicit settings:

```json
{
	"useTabs": true,
	"tabWidth": 4,
	"singleQuote": true,
	"semi": false,
	"sortPackageJson": false
}
```

- Use Oxfmt as the formatter. Set `stylistic: false` and `lessOpinionated: true` in `@antfu/eslint-config`, and explicitly set `curly: ['error', 'all']` in its rules. Do not enable competing ESLint formatting rules.
- Provide separate lint, lint-fix, format, and format-check scripts with the exact mappings listed under Commands. CI runs `pnpm lint` and `pnpm format:check` without rewriting files.
- Keep CLI parsing, filesystem policy, rendering, and browser behavior separate.
- Reuse one path-access policy rather than duplicating security checks in routes.
- Prefer small functions and explicit data types. Add no speculative plugin system or configuration framework.
- Unexpected server errors are logged without exposing stack traces to browser clients. Expected input errors receive specific messages.

## Testing Strategy

- Unit tests: argument parsing, tree ordering/filtering, default document selection, heading IDs, link resolution, Markdown features, theme mapping, and plain-text highlighting fallback.
- Vitest integration tests: file/folder serving, direct URLs, nested paths, recursion controls, asset containment, missing paths, bad input, port conflicts, watcher events, and shutdown.
- Vue component tests use Vitest and `@testing-library/vue`. Query by accessible role, label, and visible text. Test file-tree expansion, filtering, theme controls, table of contents, and empty/missing-document states through user interactions rather than component internals.
- Security fixtures: encoded traversal, malformed URLs, symlinks, hidden files, unsafe links, raw HTML, malicious diagrams, and out-of-root asset requests.
- Browser tests: keyboard tree navigation, mobile navigation, theme persistence, table of contents, Back/Forward, local images, code highlighting, math, Mermaid, and live updates.
- Keep screenshot capture and visual review separate from functional tests. Review both themes at desktop and mobile sizes for readable contrast and code/page palette consistency. Functional tests must not assert arbitrary CSS classes, computed styles, or pixel dimensions.
- Package smoke test: install a built tarball in a temporary fixture and run the CLI from an unrelated directory without a source checkout or network rendering dependencies.

## Boundaries

- Always: default to localhost; enforce the served-root boundary; use matching Everforest Medium variants; maintain accessible navigation; test observable user behavior.
- Ask first: add a framework beyond the approved Vue/Vite stack, change the Node minimum or package manager, change theme family, allow raw HTML, follow symlinks, broaden file access, or introduce public hosting.
- Never: execute Markdown as code; load project configuration as executable code; expose arbitrary local files; add editing, MDX, authentication, full-text search, wiki links, or static export to version one.

## Success Criteria

1. A single command serves a supported Markdown file, with no sidebar and no user build step.
2. A folder with nested Markdown files displays a stable collapsible tree. Filtering finds filenames and paths. `--no-recursive` removes nested documents from both navigation and direct access.
3. Direct URLs and browser history reopen the correct document. Relative Markdown links, image paths, duplicate headings, spaces, and Unicode work.
4. Page and highlighted code use the verified Everforest Medium Light/Dark pair. Changing mode also updates diagrams and persists across refresh.
5. Tables, task lists, highlighted code, math, and Mermaid render correctly. Unknown code languages and invalid diagrams do not break the page.
6. File edits and tree changes appear without manual refresh, normally within one second after the watcher reports a change in local test fixtures.
7. Keyboard-only users can open files, filter the tree, change theme, and use mobile navigation. Both themes pass text contrast checks.
8. Traversal, symlink escape, hidden-file access, raw HTML script injection, unsafe URL protocols, and malicious renderer fixtures do not expose files or execute arbitrary scripts.
9. The server binds locally by default. LAN mode requires an explicit host flag and prints an unauthenticated-access warning.
10. The published package runs from an unrelated working directory and renders its UI, code, diagrams, and math without CDN access.
11. On Node.js >=24, pnpm installation, build, Vue/TypeScript type checks, lint, formatting checks, and tests pass. The UI uses Vue 3.5 with scoped component CSS. The resolved ESLint configuration disables stylistic rules, enables `lessOpinionated`, and enforces braces for all control statements.

## Open Questions

- Package name `@suppayami/mimimd`, executable name `mimimd`, and the listed CLI defaults are accepted for implementation; registry availability remains unverified.
- Verify availability of the requested Node.js >=24 baseline and compatible dependency releases. Treat unavailable tooling as a validation blocker, not permission to substitute a different baseline.
- Verify exact Everforest Medium palette source, license, and availability as Shiki themes before implementation. Custom themes are allowed to meet the confirmed visual requirement.
- Confirm npm package-name availability before publication; local command naming does not depend on registry availability.
