# Implementation plan: mimimd

## Input and scope

Accepted specification: `docs/specs/markdown-reader.md`.

Build a Node CLI that serves a Markdown file or recursive folder as a Vue reading website. This document is a plan, not implementation approval.

At planning time the repository contained instructions, skills, and the specification, with no application, package manifest, or runnable formatting/lint script. Implementation status and verification results are now recorded in `tasks/todo.md`. Existing project instructions require small changes, pnpm, scoped Vue styles, and behavior-focused tests. Keep screenshots and visual checks outside functional suites.

## Decisions and rationale

- Require Node.js >=24. Verify availability before implementation validation. Never silently substitute a lower baseline.
- Use pnpm with `minimumReleaseAge: 2880`. Choose compatible releases at least two days old. Stay on Vue 3.5; do not copy prerelease dependency versions from skill documentation.
- Use strict TypeScript, Vue SFCs, Vite, and scoped component CSS. Limit global styles to theme tokens, document defaults, and vendor CSS.
- Use Vue Router for document URLs and browser history. This is within the approved optional dependency and avoids rebuilding its navigation behavior.
- Use Hono with its Node HTTP adapter, not Vite preview, for the installed CLI (approved implementation update). Vite builds the browser assets. Compile server code separately with TypeScript.
- Proposed route contract: `/` opens the default document; `/doc/<encoded relative path>` opens a document; `/api/index` returns the eligible tree; `/api/document?path=...` returns rendered content and headings; `/content/<encoded relative path>` serves allowed local assets; `/events` provides updates. Bundled UI assets use a separate prefix. Encode path segments once and keep fragments separate.
- Keep one filesystem-access policy for indexing, documents, assets, and watching. File mode exposes only its selected Markdown document. Do not follow symbolic links.
- Use unified/remark/rehype and Shiki on the server. Render KaTeX with trust disabled. Render Mermaid in the browser with strict security. Never compile Markdown as Vue templates.
- Verify Everforest Medium palette provenance early. Use custom Shiki themes if built-ins do not match. Keep one authoritative palette source for page, code, and diagram colors.
- Use Vitest for server and component tests, `@testing-library/vue` for observable Vue behavior, and Playwright for real browser flows. Avoid tests that merely repeat configuration constants.
- The package name is `@suppayami/mimimd`, with executable `mimimd`; registry availability is a publication prerequisite, not a local development blocker.

## Verification conventions

Commands below become executable as their tasks create scripts and test files. They are not currently available. `pnpm test` must run Vitest once, not watch indefinitely. `pnpm test:e2e` runs Playwright. Tests create only synthetic fixtures inside the workspace and do not read private files or contact external services.

After each implementation batch, run `pnpm format`, `pnpm lint:fix`, and `pnpm lint`. Also run the task-specific checks. Avoid broad fixes to unrelated files. Tests use public HTTP interfaces, CLI processes, and accessible UI interactions. File lists below omit the pnpm lockfile when dependency changes require it.

## Phase 1: prerequisites and tooling

## Task 1: Establish the runtime and dependency gate

**Description:** Verify the requested Node version is available and installed. Create package metadata with Node engines and a pinned compatible pnpm version. Configure the two-day release-age policy before installing dependencies. Record actual versions and blockers. Do not proceed with a falsely passing unsupported-runtime validation.
**Acceptance criteria:** (1) The runtime satisfies >=24, or a blocker is explicitly reported. (2) pnpm enforces the release-age policy without exceptions. (3) Package metadata uses ESM and the `@suppayami/mimimd` name.
**Verification:** `node --version`; `pnpm --version`; `pnpm install`; review engine and release-age declarations against the approved spec.
**Dependencies:** None.
**Files likely touched:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
**Estimated scope:** M.

## Task 2: Configure formatting and linting

**Description:** Add Oxfmt and `@antfu/eslint-config`. Configure Oxfmt with tabs, tab width 4, single quotes, no semicolons, and no package JSON sorting. Set Antfu `stylistic: false`, `lessOpinionated: true`, and `curly: ['error', 'all']`. Add the exact approved command mappings.
**Acceptance criteria:** (1) Format and lint check commands do not modify files. (2) `format` invokes `oxfmt --write .`; `lint:fix` invokes `eslint . --fix`. (3) The resolved lint configuration enforces braces without a competing formatting ruleset.
**Verification:** `pnpm format`; `pnpm lint:fix`; `pnpm lint`; `pnpm format:check`; after Task 3 creates the entry point, inspect `pnpm exec eslint --print-config src/cli.ts`.
**Dependencies:** 1.
**Files likely touched:** `package.json`, `.oxfmtrc.json`, `eslint.config.js`.
**Estimated scope:** M.

### Checkpoint A

Confirm runtime availability and tool versions. Stop for user input if the minimum runtime cannot be met. No unsupported-version workaround or release-age exemption.

## Task 3: Establish server compilation and CLI contract

**Description:** Add TypeScript server compilation and CLI argument handling using Node facilities where suitable. Implement required input, host, port, recursion, help, version, and open options. Keep startup wiring separate from parsing. Define the executable bin and preserve its shebang in output.
**Acceptance criteria:** (1) Help/version work without a document. (2) Invalid arguments produce nonzero exits with actionable messages. (3) Compiled CLI starts from an unrelated working directory without resolving package files there.
**Verification:** `pnpm build:server`; `node dist/cli.js --help`; `pnpm test tests/cli.test.ts` once Task 5 provides Vitest.
**Dependencies:** 2.
**Files likely touched:** `src/cli.ts`, `src/args.ts`, `tsconfig.server.json`, `package.json`, `tests/cli.test.ts`.
**Estimated scope:** M.

## Task 4: Establish the Vue/Vite build

**Description:** Add the browser entry and minimal semantic Vue shell. Configure Vite with the Vue plugin. Keep server and browser outputs separate. Add `vue-tsc` checks and a development command that accepts the document argument; complete server integration in Task 8. Do not add UI libraries or a global state store.
**Acceptance criteria:** (1) Vite builds local browser assets. (2) Vue components use TypeScript setup and scoped CSS. (3) Browser and server builds do not erase each other's output.
**Verification:** `pnpm build`; `pnpm typecheck`; inspect output locations and open the development shell after Task 8.
**Dependencies:** 3.
**Files likely touched:** `vite.config.ts`, `src/web/index.html`, `src/web/main.ts`, `src/web/App.vue`, `package.json`.
**Estimated scope:** M.

## Task 5: Configure behavioral test environments

**Description:** Configure Vitest with Node and DOM environments, Vue component transforms, and `@testing-library/vue`. Add Vue type-check configuration and Playwright setup. Keep browser screenshot capture out of functional tests. Reuse a small shell test only to prove a real accessible landmark renders; do not add placeholder assertions.
**Acceptance criteria:** (1) CLI tests execute under Node and component tests under a DOM environment. (2) Vue type checks and the accessible-shell test pass. (3) Playwright is configured to exercise the built app once the server slice exists.
**Verification:** `pnpm test tests/cli.test.ts tests/web/app.test.ts`; `pnpm typecheck`; `pnpm exec playwright test --list` after browser cases are added.
**Dependencies:** 4.
**Files likely touched:** `vitest.config.ts`, `playwright.config.ts`, `tsconfig.web.json`, `tests/web/app.test.ts`, `package.json`.
**Estimated scope:** M.

### Checkpoint B

Build the CLI and Vue shell. Run formatting, lint, type checks, and available tests. Resolve build and test compatibility before implementing the reader.

## Phase 2: safe single-file reading

## Task 6: Implement the root-access policy and document index

**Description:** Validate the input and build an index of eligible Markdown files. Enforce hidden-entry exclusion, `node_modules` exclusion, symbolic-link rejection, extension handling, recursion rules, and deterministic ordering. Select root README, then index, then the first eligible document. Define stable path identifiers for HTTP/UI use.
**Acceptance criteria:** (1) File, recursive-folder, shallow-folder, and empty-folder inputs produce the specified eligible documents. (2) Root escapes, hidden entries, and symlinks cannot be read through the access policy. (3) Default selection and ordering are deterministic, including case-insensitive extensions.
**Verification:** `pnpm test tests/server/files.test.ts`; use synthetic nested, Unicode, repeated-name, symlink, and empty fixtures.
**Dependencies:** 5.
**Files likely touched:** `src/server/files.ts`, `src/server/index.ts`, `src/contracts.ts`, `tests/server/files.test.ts`.
**Estimated scope:** M.

## Task 7: Implement safe baseline Markdown rendering

**Description:** Render CommonMark and GFM with stable unique heading IDs. Disable raw HTML, filter unsafe protocols, and sanitize output. Return headings alongside HTML. Establish structured code and Mermaid handling points without enabling diagrams yet. Define the sanitize ordering so later trusted highlighting/math transforms cannot accidentally reopen raw user HTML.
**Acceptance criteria:** (1) Tables, tasks, links, and repeated headings render correctly. (2) Raw HTML and unsafe links cannot execute. (3) Empty and malformed content do not corrupt the response contract.
**Verification:** `pnpm test tests/markdown/render.test.ts`; inspect malicious synthetic documents through the renderer's public API.
**Dependencies:** 5.
**Files likely touched:** `src/markdown/render.ts`, `src/markdown/sanitize.ts`, `tests/markdown/render.test.ts`, `package.json`.
**Estimated scope:** M.

## Task 8: Serve a single document end to end

**Description:** Wire CLI startup to the HTTP server, index, renderer, and built Vue shell. Add document loading and a scoped Markdown view. Bind locally by default, report port conflicts, implement opt-in browser opening after successful listening, print the LAN warning, and close resources on Ctrl-C. Keep host/origin checks in place from the first exposed server.
**Acceptance criteria:** (1) A file opens as readable Markdown with no folder sidebar. (2) Startup errors are actionable, default binding is local, and LAN binding is explicit. (3) Shutdown releases the listening port; package assets resolve independently of the caller's directory.
**Verification:** `pnpm build`; `pnpm test tests/server/http.test.ts`; `pnpm dev docs/specs/markdown-reader.md`; manually check the URL, absent sidebar, occupied-port message, and Ctrl-C shutdown.
**Dependencies:** 3, 4, 6, 7.
**Files likely touched:** `src/server/http.ts`, `src/cli.ts`, `src/web/App.vue`, `src/web/MarkdownView.vue`, `tests/server/http.test.ts`.
**Estimated scope:** M.

### Checkpoint C

Demonstrate the first vertical slice: one Markdown file served locally. Recheck direct request containment, raw HTML rejection, runtime error messages, and graceful shutdown before adding folder UI.

## Phase 3: theme and folder navigation

## Task 9: Verify Everforest palettes and add Shiki

**Description:** Verify the source and license for exact Everforest Medium Light/Dark palettes. Record attribution and create custom Shiki definitions if required. Reuse highlighter instances and support both modes without rerendering the server pipeline for each theme switch. Preserve only necessary generated markup through the sanitizer.
**Acceptance criteria:** (1) Both themes have verified provenance and match the Medium variant. (2) Known languages highlight and unknown/absent languages remain escaped readable text. (3) Sanitization preserves legitimate highlighting without accepting arbitrary user styles or scripts.
**Verification:** `pnpm test tests/markdown/highlight.test.ts`; review palette source/license; visually compare light/dark code samples separately from functional tests.
**Dependencies:** 7.
**Files likely touched:** `src/themes/everforest.ts`, `src/markdown/render.ts`, `src/markdown/highlight.ts`, `tests/markdown/highlight.test.ts`, `docs/theme-attribution.md`.
**Estimated scope:** M.

## Task 10: Apply reader styling and theme controls

**Description:** Apply verified palette tokens to the page and code. Add system-theme default, light/dark selection, persistence, readable typography, and overflow handling. Use scoped deep selectors for sanitized content. Keep required global tokens and defaults separate from component styles.
**Acceptance criteria:** (1) Theme selection survives refresh and initially follows the operating system. (2) Long code/tables remain usable without forcing the whole page wider. (3) Both modes have visible focus and readable text contrast.
**Verification:** `pnpm test tests/web/theme.test.ts`; `pnpm build`; inspect desktop/mobile samples and measure text contrast in a separate visual review, not CSS-value assertions in functional tests.
**Dependencies:** 8, 9.
**Files likely touched:** `src/web/theme.ts`, `src/web/ThemeToggle.vue`, `src/web/MarkdownView.vue`, `src/web/App.vue`, `tests/web/theme.test.ts`.
**Estimated scope:** M.

## Task 11: Add folder navigation and browser history

**Description:** Add Vue Router with stable document routes and server history fallback. Fetch the eligible index and present a collapsible tree with filename/path filtering. Use labeled disclosure buttons and links rather than an incomplete ARIA tree widget. Include default-document routing, active-document indication, empty-folder and missing-document states. Prevent stale fetches from replacing newer navigation results.
**Acceptance criteria:** (1) Recursive and shallow modes show only eligible files; filter results retain path context. (2) Direct URLs, refresh, Back, and Forward select the correct document. (3) Empty or missing content leaves navigation usable.
**Verification:** `pnpm test tests/web/navigation.test.ts`; `pnpm test:e2e tests/e2e/navigation.spec.ts`; keyboard-check expanding folders and selecting duplicate filenames.
**Dependencies:** 8, 10.
**Files likely touched:** `src/web/router.ts`, `src/web/FileTree.vue`, `src/web/App.vue`, `tests/web/navigation.test.ts`, `tests/e2e/navigation.spec.ts`.
**Estimated scope:** M.

### Checkpoint D

Review the light/dark reader with nested documentation. Confirm palette accuracy before expanding styling. Test keyboard file selection, refresh, history, and path filtering.

## Task 12: Resolve document links and serve safe assets

**Description:** Resolve links relative to the current document, preserving fragments and encoded path segments. Map eligible Markdown destinations to reader routes. Add a narrow static-asset allowlist and safe content types. Apply root checks to assets, including SVG image responses and PDF attachments. File-mode links must not expose sibling Markdown files. Update the HTTP history fallback only for reader routes.
**Acceptance criteria:** (1) Nested Markdown links, images, spaces, and Unicode resolve correctly. (2) Excluded documents and external-root targets remain inaccessible through direct URLs or links. (3) HTML/JavaScript and disallowed assets are not served as user content; SVG cannot become injected application markup.
**Verification:** `pnpm test tests/server/assets.test.ts tests/markdown/links.test.ts`; manually follow links and images in a nested fixture through the reader.
**Dependencies:** 6, 11.
**Files likely touched:** `src/markdown/links.ts`, `src/markdown/render.ts`, `src/server/http.ts`, `tests/server/assets.test.ts`, `tests/markdown/links.test.ts`.
**Estimated scope:** M.

## Task 13: Add heading navigation and responsive controls

**Description:** Add the heading table of contents, hash navigation after asynchronous document loads, mobile file/heading controls, focus management, and reduced-motion behavior. Keep controls labeled and use semantic landmarks. Restore focus when mobile navigation closes.
**Acceptance criteria:** (1) Heading links, including duplicate-heading fragments, reach the correct section after direct loading. (2) File and heading navigation are keyboard-operable on narrow screens. (3) Focus is not trapped or lost when navigation closes or document loading fails.
**Verification:** `pnpm test tests/web/headings.test.ts`; `pnpm test:e2e tests/e2e/accessibility.spec.ts`; manually complete a keyboard-only reading flow at narrow and wide viewport sizes.
**Dependencies:** 11, 12.
**Files likely touched:** `src/web/TableOfContents.vue`, `src/web/App.vue`, `src/web/router.ts`, `tests/web/headings.test.ts`, `tests/e2e/accessibility.spec.ts`.
**Estimated scope:** M.

### Checkpoint E

Verify relative links, safe image delivery, heading fragments, and responsive keyboard navigation together. Keep visual layout review separate from behavioral test assertions.

## Phase 4: rich content and live updates

## Task 14: Add mathematical notation

**Description:** Add inline and block math using KaTeX with trust disabled. Bundle fonts and CSS. Adjust sanitization to preserve only the required output. Render a local fallback for invalid expressions without losing the rest of the document.
**Acceptance criteria:** (1) Inline/block math renders without network font requests. (2) Invalid math leaves surrounding text readable. (3) Untrusted math cannot create executable content or unsafe links.
**Verification:** `pnpm test tests/markdown/math.test.ts`; inspect a math fixture offline in both themes; run the security cases added with the renderer.
**Dependencies:** 9, 12.
**Files likely touched:** `src/markdown/render.ts`, `src/markdown/sanitize.ts`, `src/web/main.ts`, `tests/markdown/math.test.ts`, `package.json`.
**Estimated scope:** M.

## Task 15: Add secure Mermaid rendering

**Description:** Render Mermaid blocks using a locally bundled module, strict security, disabled click actions, and controlled theme configuration. Prevent document directives from relaxing security. Keep diagram SVG within an explicit sanitized rendering boundary. Re-render on content/theme changes and discard stale asynchronous results. Show local parse errors without replacing the document.
**Acceptance criteria:** (1) Valid diagrams render offline in both matching palettes. (2) Malicious diagram content cannot execute scripts, activate click actions, or relax security. (3) Invalid diagrams and rapid navigation do not break or overwrite the active document.
**Verification:** `pnpm test:e2e tests/e2e/diagrams.spec.ts`; manually switch themes on a diagram fixture; verify malformed and malicious examples through the browser.
**Dependencies:** 10, 12.
**Files likely touched:** `src/web/diagrams.ts`, `src/web/MarkdownView.vue`, `src/markdown/render.ts`, `tests/e2e/diagrams.spec.ts`, `package.json`.
**Estimated scope:** M.

## Task 16: Implement live content and tree updates

**Description:** Watch only the allowed scope with Chokidar. Debounce bursts and send server-sent events. Refresh index/content for additions, edits, renames, and deletions. Refresh changed local images without stale browser caches. Preserve active route, theme, and scroll where possible. Clean up watchers and event connections on shutdown and handle browser reconnect by refreshing current state.
**Acceptance criteria:** (1) Document and tree changes appear without manual refresh, normally within one second of the watcher notification in local fixtures. (2) Deleting the active document displays a missing state while navigation still works. (3) Unchanged navigation/theme state survives updates and process shutdown releases resources.
**Verification:** `pnpm test tests/server/watch.test.ts`; `pnpm test:e2e tests/e2e/live-updates.spec.ts`; edit, rename, delete, and restore synthetic files and change a local image while the page is open.
**Dependencies:** 11, 12, 15.
**Files likely touched:** `src/server/watch.ts`, `src/server/http.ts`, `src/web/App.vue`, `tests/server/watch.test.ts`, `tests/e2e/live-updates.spec.ts`.
**Estimated scope:** M.

### Checkpoint F

Exercise code, math, diagrams, links, images, and live reload in one fixture. Review CSP compatibility without weakening script restrictions. Confirm theme switching cannot leave stale diagram results.

## Phase 5: security and distribution

## Task 17: Verify the HTTP security boundary

**Description:** Complete adversarial HTTP/browser tests and tighten the shared policies where tests expose gaps. Verify encoded traversal, malformed paths, symbolic-link swaps where supported, hidden-entry access, allowlisted assets, Host/Origin handling, and CSP. Avoid adding unrelated defensive limits. Keep legitimate LAN requests working while rejecting untrusted origins and rebinding-style hosts.
**Acceptance criteria:** (1) Direct requests cannot bypass document eligibility or root containment. (2) Malicious Markdown, math, Mermaid, and SVG fixtures do not execute arbitrary scripts or disclose synthetic out-of-root markers. (3) Local and explicit LAN flows work without permissive CORS.
**Verification:** `pnpm test tests/server/security.test.ts`; `pnpm test:e2e tests/e2e/security.spec.ts`; manually check startup warning and access from an authorized LAN device.
**Dependencies:** 13, 14, 15, 16.
**Files likely touched:** `src/server/files.ts`, `src/server/http.ts`, `src/markdown/sanitize.ts`, `tests/server/security.test.ts`, `tests/e2e/security.spec.ts`.
**Estimated scope:** M.

## Task 18: Validate package installation and release checks

**Description:** Define the published file list and build-before-pack flow. Add an isolated tarball smoke test that invokes the installed CLI from another directory within a synthetic workspace fixture. Document commands, supported content, LAN limitations, exclusions, and theme attribution. Add CI checks using the supported runtime and frozen lockfile. Do not publish during this task.
**Acceptance criteria:** (1) The tarball includes the executable, browser assets, fonts, and required theme/license data but no development fixtures. (2) Installed file/folder serving works outside the source tree without a user build or CDN. (3) CI runs format, lint, type checks, tests, build, and package smoke validation.
**Verification:** `pnpm install --frozen-lockfile`; `pnpm format`; `pnpm lint:fix`; `pnpm lint`; `pnpm format:check`; `pnpm typecheck`; `pnpm test`; `pnpm build`; `pnpm test:e2e`; `pnpm pack`; `pnpm test tests/package.test.ts`. Inspect tarball contents and run the installed executable offline after dependencies are installed.
**Dependencies:** 17.
**Files likely touched:** `package.json`, `tests/package.test.ts`, `README.md`, `.github/workflows/ci.yml`.
**Estimated scope:** M.

### Checkpoint G: release readiness

Walk through specification success criteria 1–11. Separately review desktop/mobile visuals, text contrast, and both Everforest themes. Record unresolved platform or runtime limitations. Confirm registry naming and publication permission before any release.

## Sequencing and safe parallel work

- Tasks 1–5 establish shared tooling and should run in order.
- Tasks 6 and 7 can proceed independently after Task 5.
- Task 9 can start after Task 7 while Task 8 is being integrated, but coordinate renderer edits.
- Tasks 14 and 15 have independent renderer concerns but share `render.ts` and package metadata; use separate commits or serialize those files.
- Documentation and manual visual review can run alongside implementation after contracts stabilize. Do not parallelize overlapping App.vue/router edits without coordination.
- Every checkpoint is a stop to verify the slice, not permission to skip unresolved failures.

## Risks and open questions

1. **Runtime availability:** Node >=24 is verified locally on v24.22.2. Other supported runtime/platform combinations still need release validation.
2. **Theme identity and license:** Generic Everforest themes may not match Medium. Confirm provenance before styling; request direction if licensing or exact palette availability prevents reuse.
3. **Renderer security:** Sanitization order, KaTeX output, Mermaid SVG, and CSP must work together. Never solve compatibility by allowing arbitrary scripts or raw HTML.
4. **File security:** Path encoding, symlinks, and platform differences can undermine containment. Test through HTTP, not only string helpers. Files concurrently replaced during reads need explicit containment review.
5. **Live reload behavior:** Watcher behavior varies by platform; validate real filesystem events with eventual assertions, not fixed sleeps. Keep the stated one-second target measured from notification, not the external editor write.
6. **Package resolution:** Asset paths must not depend on the source checkout. The tarball smoke test is required before release.
7. **Scale:** No arbitrary file-count target is defined. Avoid eager rendering of every document; index metadata and render requested documents. Do not add caching frameworks or virtualization without demonstrated need.
8. **Publication:** The registry name has not been checked. No publishing, authentication, or credential handling is part of this plan.

## Specification coverage

- Criteria 1 and 9: Tasks 3, 6, 8, 18.
- Criteria 2 and 3: Tasks 6, 11, 12, 13.
- Criteria 4 and 5: Tasks 7, 9, 10, 14, 15.
- Criterion 6: Task 16.
- Criterion 7: Tasks 10, 11, 13 and separate visual review.
- Criterion 8: Tasks 6, 7, 12, 14, 15, 17.
- Criteria 10 and 11: Tasks 1–5 and 18.
