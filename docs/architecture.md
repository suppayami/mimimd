# Architecture and application flow

## Overview

`@suppayami/mimimd` provides the `mimimd` command: a read-only Markdown reader running as a local Node.js process and a Vue application in the browser. It requires Node >=24 and defaults to `http://localhost:6395`.

The filesystem is the source of truth. There is no database, editing API, authentication layer, or external rendering service. The server indexes eligible files and renders requested documents; the browser owns navigation, theme selection, and diagrams.

```text
CLI arguments
    |
    v
FileScope <---- Hono / Node HTTP server <---- Browser requests
    |                    |                         |
    v                    v                         v
Local files      Markdown rendering         Vue / Vue Router
                         |                         |
                         +---- HTML + headings --->+
                                                   |
                                      Hidden diagram preparation
                                                   |
                                      Completed document display

Filesystem changes --> Chokidar --> SSE --> Browser refresh
```

## Main components

| Location                                          | Responsibility                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/args.ts`, `src/cli.ts`                       | Parse arguments, establish the file scope, start the server, optionally open the browser, and shut down resources.     |
| `src/server/files.ts`                             | Central filesystem policy, eligible document discovery, stable ordering, default selection, and checked reads.         |
| `src/server/http.ts`                              | Hono routes and Node HTTP integration, request security checks, bundled/user assets, watching, and server-sent events. |
| `src/markdown/render.ts`                          | Server-side Markdown parsing, sanitization, headings, link rewriting, highlighting, and math.                          |
| `src/contracts.ts`                                | Shared TypeScript shapes for the document index, tree entries, rendered HTML, and headings.                            |
| `src/web/App.vue`, `src/web/FileTree.vue`         | Route-driven loading, navigation, filtering, heading links, responsive controls, and focus management.                 |
| `src/web/MarkdownView.vue`, `src/web/diagrams.ts` | Prepare document DOM and sanitized Mermaid SVGs before replacing visible content.                                      |
| `src/web/theme.ts`, `src/themes/everforest.ts`    | Browser theme preference and shared Everforest Medium palettes for the page, Shiki, and Mermaid.                       |

## Startup and filesystem scope

1. The CLI handles help/version without requiring a document. Otherwise, it resolves the input relative to the caller's working directory.
2. `FileScope.create()` validates the input, rejects symbolic-link input paths and private paths, and establishes the document/asset root.
3. Discovery builds a deterministic tree of `.md` and `.markdown` files, case-insensitively. Hidden entries, `node_modules`, private entries, symbolic links, and `.gitignore` matches are excluded. Empty directories are omitted from the tree.
4. The server binds to the requested host and port, then starts the watcher. An occupied port is an error, not a reason to choose another port silently.
5. The CLI prints the root and URL. Browser opening is opt-in; non-loopback binding prints an unauthenticated-access warning.
6. SIGINT/SIGTERM closes the watcher, event streams, and HTTP connections.

Folder mode scans recursively unless `--no-recursive` is set. Root `README.md`, then `index.md`, is preferred case-insensitively; otherwise, the first document in tree order is selected.

A built-in matcher applies `.gitignore` rules from the nearest repository root (including worktrees) through nested folders, with negation, anchored paths, directory patterns, and Git wildcards. Outside a repository, rules start at the document/asset root. Ignored directories are not scanned; ignored documents and assets cannot be read directly, even in file mode. Symlinked `.gitignore` files are not followed. Each index or read uses fresh rules; Git itself and an ignore package are not required. Global Git excludes and `.git/info/exclude` are not used.

File mode exposes only the selected Markdown document and hides file navigation. Its parent directory is the asset root. Shallow folder mode excludes nested documents from both the index and direct document access, but still permits eligible nested assets.

## HTTP boundary

| Route                               | Purpose                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/doc/<encoded-relative-path>` | Serve the browser shell, including direct loads and history navigation.                                                            |
| `/api/index`                        | Return mode, eligible tree, document paths, and default document.                                                                  |
| `/api/document?path=...`            | Verify index membership, read the document, and return `{ html, headings, frontmatter? }`. With no path, use the default document. |
| `/content/<encoded-relative-path>`  | Serve allowlisted local images and PDF attachments through checked filesystem reads.                                               |
| `/ui/*`                             | Serve the installed package's bundled JavaScript, CSS, fonts, and other UI assets.                                                 |
| `/events`                           | Notify connected browsers of filesystem changes through SSE.                                                                       |

Document identity uses root-relative paths rather than generated numeric IDs. URL path segments are encoded individually, with fragments kept separate. Relative Markdown links become reader routes; local image and attachment links become content routes. A reader URL alone does not grant access: the document API still checks eligibility.

Bundled UI assets resolve relative to the installed server module, not the caller's directory. User-content routes never act as an arbitrary static file server.

## Server-side Markdown pipeline

```text
Markdown source
  -> remark parsing + YAML frontmatter extraction + GFM + math syntax
  -> Markdown tree to HTML tree (raw HTML disabled)
  -> explicit sanitization schema
  -> unique heading IDs and heading collection
  -> local URL rewriting and Shiki code highlighting
  -> KaTeX math output, with trust disabled
  -> serialized HTML + heading metadata + optional frontmatter properties
```

YAML frontmatter is parsed separately using `remark-frontmatter` and `yaml`, then displayed by `FrontmatterView.vue` with Vue text interpolation. It never enters rendered HTML or the heading outline. Nested YAML nodes and aliases are serialized without alias expansion. Malformed or non-mapping frontmatter is preserved as text; the Markdown body still renders. The browser commits frontmatter alongside the corresponding prepared article.

`unified` composes this pipeline. `unist-util-visit` walks tree nodes for transformations, while `hast-util-to-text` extracts heading labels and code contents without treating nested markup as source text.

Sanitization happens before trusted highlighting and math generation. Raw user HTML is not reintroduced afterward. The schema retains the code/math markers needed by those transforms. Unknown code languages fall back to escaped plain text. A shared Shiki highlighter loads supported languages as needed rather than initializing per document.

Mermaid fences remain marked code blocks in the response; their SVG generation happens in the browser. Invalid math or diagrams produce local fallback content rather than replacing the entire document with an error.

## Browser loading and document commit

1. Vue Router determines the active document from the URL. At `/`, the application fetches the index and replaces the route with the default document URL.
2. `App.vue` fetches the index and requested document. Generation checks prevent older requests from replacing newer navigation results. Empty and missing states keep file navigation available.
3. `MarkdownView.vue` prepares incoming HTML in a hidden, inert staging area attached to the DOM. Keeping it attached allows Mermaid to measure SVG text without exposing intermediate content.
4. Local image URLs receive a revision query parameter. Mermaid renders inside the hidden area with strict security and SVG text labels. Initialization directives and click actions are rejected; DOMPurify sanitizes the resulting SVG before display.
5. The previous article stays visible with a small preparation indicator. Once all diagrams are ready, the component replaces the article's children in one commit and removes staging content. Obsolete render generations cannot commit, including when the active route changes before its response arrives.
6. A completion event lets `App.vue` apply the correct heading fragment or navigation scroll position after the prepared DOM is available. Same-document updates preserve scroll where possible.

The browser inserts rendered HTML as DOM; it never compiles Markdown as Vue templates. File disclosure controls, filtering, heading navigation, and theme selection are ordinary Vue components/state rather than a separate global store.

Theme selection initially follows the OS and persists explicit choices in local storage. Shiki HTML contains both light and dark theme values; switching themes also prepares new Mermaid output. Palette provenance and licensing are documented in [theme attribution](theme-attribution.md).

## Live-update flow

```text
Allowed filesystem change
  -> Chokidar notification
  -> debounce event burst
  -> SSE change message
  -> refresh index and current document
  -> prepare HTML, images, and diagrams
  -> commit completed content
```

Changes trigger fresh discovery and rendering, not eager rendering of every document. The browser refreshes state on SSE reconnection as well. Image revision parameters and no-store responses avoid stale local assets. The active route and theme remain unchanged; removing or renaming the active file produces a missing-document state until another eligible document is selected.

## Security and operating limits

- The same filesystem policy rejects traversal, hidden/excluded entries, and symlinks for documents and content assets. Reads revalidate the opened file; Linux also verifies the opened descriptor's path.
- Asset types are allowlisted. SVG image responses receive a restrictive sandbox CSP, and PDFs are attachments. Local HTML, JavaScript, and arbitrary source files are not served as user content.
- Host/port and Origin checks reduce cross-origin and DNS-rebinding access. Responses include CSP and `nosniff`; permissive CORS is not enabled.
- Browser diagram sanitization is a separate boundary from server Markdown sanitization. Rendering off-screen does not replace either security boundary.
- LAN mode has no authentication. This is a trusted local reader, not a public hosting service. Do not serve roots writable by untrusted processes.

Linux/Chromium is the currently exercised platform. Physical second-device LAN access, Windows/macOS behavior, and sustained adversarial filesystem mutation still require further verification. Registry scope permissions and publication have not been established.

## Build, distribution, and verification

TypeScript compiles the CLI/server to `dist/`; Vite separately builds the Vue application into `dist/web/`. `pnpm dev <path>` builds and then runs the CLI—it is not a Vite development server. Document updates are handled by SSE; source-code changes require rebuilding.

The root `tsconfig.json` references the server and web configurations. The server uses Node module resolution; the web application uses bundler resolution and Vue type checking. Component CSS is scoped, with global styles limited to shared tokens, document defaults, and vendor styles.

`pnpm pack` builds before packaging the compiled application and documentation. Consumers run the `mimimd` executable without building the source. Fonts, math styles, diagram modules, and syntax highlighting assets are local; browser rendering does not depend on a CDN.

Vitest covers CLI, filesystem, renderer, HTTP, component behavior, and installed-tarball execution. Playwright covers real navigation, security, rich content, live updates, and asynchronous document commits. Use the repository's installed Playwright through `pnpm exec playwright` or `pnpm test:e2e`, not an on-demand package runner.

Functional tests avoid screenshots and arbitrary CSS/pixel assertions. Separate visual review covers both themes, desktop/mobile layouts, and overflow/fallback fixtures. `node scripts/check-contrast.ts` checks palette text contrast independently. Generated synthetic workspaces and visual artifacts remain in ignored `tests/.*` paths; package smoke installation needs registry access for dependencies, but rendering itself does not.
