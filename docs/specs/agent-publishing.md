# Spec: Agent publishing sessions

Status: Accepted for implementation planning. No application implementation is authorized by this document.

## Objective

Let an agent publish Markdown to a running mimimd server over HTTP. Let the agent replace a document without creating another entry and obtain a document map for links within that session.

Support documents up to 10 MiB, visible processing status, server discovery, and a CLI command that prints reusable agent skill Markdown. Keep filesystem documents read-only.

## Tech Stack

- Node.js >=24, TypeScript, and pnpm 12.6.0.
- Hono 4 with the Node HTTP adapter.
- Vue 3.5 and Vue Router for the reader.
- Existing unified, remark, rehype, Shiki, KaTeX, and Mermaid rendering pipeline.
- Existing server-sent events (SSE) for reader notifications.
- Node standard-library worker threads for isolating session Markdown rendering from the HTTP event loop.
- Per-user discovery metadata on disk. Document contents stay in process memory and are never persisted.
- No new runtime dependency is expected. Respect pnpm minimumReleaseAge if a dependency becomes necessary.

## Commands

Existing development and verification commands:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format
pnpm lint:fix
pnpm lint
pnpm format:check
```

Proposed public commands:

```sh
mimimd
mimimd ./docs --port 6395
mimimd discover --json
mimimd skill
```

- No input starts an empty session with no filesystem scope or watcher.
- File and folder input keep existing scope, exclusion, and asset rules.
- Existing host, port, browser-open, help, and version behavior remains available.
- `discover --json` writes only a JSON object to stdout. Diagnostics go to stderr.
- Discovery returns an empty sessions array with exit code 0 when no verified server exists. Command failures use a nonzero exit code.
- `skill` writes complete Markdown with skill frontmatter to stdout. It needs no running server, network request, or installation action.
- Bare `discover` and `skill` are command names. Use `./discover` or `./skill` to serve directories with those names. Document this distinction.

## Project Structure

Existing integration points:

| Path                                             | Current role and relevant constraint                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `src/args.ts`, `src/cli.ts`                      | Require exactly one input today; start and stop a file-backed server.                     |
| `src/server/http.ts`                             | Rejects all writes; owns HTTP security, watcher lifecycle, and SSE.                       |
| `src/server/files.ts`                            | Owns filesystem eligibility. Do not weaken or duplicate this policy.                      |
| `src/contracts.ts`                               | Shared index and rendered-document types currently identify documents by filesystem path. |
| `src/markdown/render.ts`                         | Renders in the HTTP process today; rewrites relative links as document or asset routes.   |
| `src/web/App.vue`                                | Owns route selection, index refresh, and stale-response guards.                           |
| `src/web/MarkdownView.vue`                       | Stages content and diagrams before committing; already shows a preparation indicator.     |
| `src/web/FileTree.vue`                           | Filesystem navigation must coexist with a separate session-document list.                 |
| `tests/server/`, `tests/markdown/`, `tests/e2e/` | HTTP, renderer, and observable reader coverage.                                           |
| `tests/cli.test.ts`, `tests/package.test.ts`     | CLI behavior and installed-package verification.                                          |

New modules should contain only the required session store, render worker, discovery logic, and bundled skill content. Exact module names belong in the implementation plan.

## Code Style

Follow the repository TypeScript and Vue conventions. Use early returns. Separate major definitions and logical blocks with blank lines. Keep changes small and avoid unrelated refactors.

Use existing libraries directly. Add helpers only for project logic or substantial duplication. Do not introduce a generic job framework, database, global UI store, or plugin system.

## Boundaries

- Always: preserve filesystem exclusions, checked reads, sanitization, CSP, Mermaid restrictions, Host checks, and Origin checks.
- Always: count actual streamed bytes, bound resource use, and preserve the committed document after a failed replacement.
- Always: distinguish server processing completion from browser display completion.
- Always: keep discovery metadata separate from document storage.
- Always: use synthetic test data and clean generated verification artifacts after each run.
- Ask first: change accepted product behavior, add dependencies, introduce persistence, enable remote writes, incur live model charges, or perform destructive actions.
- Never: write agent content into workspace files, expose excluded filesystem documents, read credentials, log Markdown request bodies, or make live model calls for tests.
- Never: add resumable uploads, partial patches, deletion APIs, authentication, MCP, or publishing CLI commands in this feature.
- Never: silently truncate documents, remove rich rendering for large inputs, evict committed documents, or navigate readers on an agent's behalf.

### Session identity and document identity

Each process startup creates a new opaque session ID. Health responses, discovery output, map responses, and write responses include this ID.

Session documents use an agent-chosen key. Proposed key syntax: 1–128 ASCII letters, digits, hyphens, or underscores, starting with a letter or digit. Keys are case-sensitive. They are not filesystem paths.

Use a separate namespace for session routes, such as `/session/<key>`. Preserve existing filesystem reader URLs under `/doc/`. Identical labels cannot cause filesystem/session identity collisions.

The initial document label is its key. Titles and rename APIs are not required. Stable identity means stable within a running session, not across restarts.

### HTTP interface

Proposed routes:

| Route                                    | Contract                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                        | Return product identity, protocol version, session ID, reader URL, write capability, and published resource limits. No filesystem scan or Markdown rendering.       |
| `GET /api/documents`                     | Return a map of eligible filesystem documents and committed session documents, with identity, source, label, reader URL, and writable flag. Include the session ID. |
| `PUT /api/session-documents/:key`        | Stream raw UTF-8 Markdown, create or replace by key, and return 202 once upload validation succeeds and rendering is admitted.                                      |
| `GET /api/session-documents/:key/status` | Return the latest attempt ID, state, received bytes, committed revision if any, and a safe error code/message when failed.                                          |
| `GET /api/session-documents/:key`        | Return the latest committed rendered document and revision. Return 404 if none exists.                                                                              |
| `GET /session/:key`                      | Serve the reader shell for direct loads and history navigation.                                                                                                     |

Require `Content-Type: text/markdown; charset=utf-8` on writes. Reject unsupported content types with 415 and invalid UTF-8 with 400. Do not accept compressed request bodies in this version.

Require a session identity header, `X-Mimimd-Session`, matching the current session ID on writes. This prevents accidental writes after a port is reused. It is not authentication.

Each write response returns the key, attempt ID, session ID, reader URL, and status URL. Each committed replacement increments the document revision. Retrying a completed write with the same key can produce a new revision but never another document entry.

A key has at most one active attempt. Reject overlapping writes to that key with 409. Do not implement silent last-writer-wins while work is active. Status retains only the latest attempt; callers compare attempt IDs and committed revisions. No historical job API is required.

Use structured JSON errors for agent endpoints. Distinguish invalid input (400), forbidden writes (403), missing content (404), conflicts/session mismatch (409), excessive input (413), unsupported media (415), and capacity/busy responses (503 with Retry-After).

### Atomic publishing and status

The attempt states are `receiving`, `preparing`, `ready`, and `failed`.

1. Validate identity, media type, security, and capacity before admitting the upload.
2. Create the receiving status and notify readers through SSE.
3. Stream the body with backpressure and count bytes. Validate declared length when present, but never trust it instead of the actual count.
4. Reject immediately when the actual body exceeds 10,485,760 bytes. Release reservations and retain any previous committed revision.
5. On a complete valid upload, return 202 and render outside the HTTP main thread.
6. Commit the new rendered document, revision, and map entry together only after successful rendering.
7. Emit ready or failed status. Discard temporary input and release capacity.

Disconnect during upload fails that attempt. Disconnect after upload acceptance does not cancel rendering. Render errors, timeouts, and worker failures leave the prior committed revision available. A failed first publication has status but no committed document-map entry.

SSE events carry identities, revisions, and small status metadata, not Markdown or rendered HTML. Reconnection refreshes authoritative state. Byte progress events must be coalesced, not emitted per transport chunk.

### Large-content resource policy

The following initial limits are proposed for review. They are fixed implementation policy, not new CLI configuration:

| Resource                                                                 | Proposed limit                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Source size                                                              | 10 MiB per document, measured in UTF-8 bytes                   |
| Active publish attempts                                                  | 2 per server, covering receiving and preparing                 |
| Render concurrency                                                       | 1 worker task at a time; at most 1 additional admitted attempt |
| Session document keys, including failed attempts                         | 256                                                            |
| Retained rendered session data plus in-flight source/output reservations | 128 MiB of accounted UTF-8 payload data                        |
| Serialized rendered result                                               | 32 MiB per document                                            |
| Render task elapsed time                                                 | 60 seconds                                                     |
| Upload elapsed time                                                      | 120 seconds                                                    |
| Render worker V8 old-generation heap                                     | 256 MiB                                                        |

Reserve capacity before upload admission, including space for a replacement while its previous version remains available. Validate output size in the worker before transfer to the parent. Release failed and superseded payloads promptly. Do not retain a source history or historical render cache.

These are payload and worker limits, not a hard process RSS guarantee. Syntax trees, string copies, buffers, native allocations, and browser DOM consume additional memory. Worker termination must be observed and reported without killing the HTTP server. Measure peak process memory during verification.

A document within the input limit can still fail an explicit render budget. Report that failure without silently changing its content or losing the previous version. The representative 10 MiB fixture must render successfully; a deliberately pathological fixture must fail safely.

Do not promise that an arbitrarily complex 10 MiB document produces a responsive browser DOM. Preserve existing rich rendering and staging. Verify representative large content in Chromium and report browser limits honestly rather than hiding them behind an upload-success response.

### Document maps and links

The map includes only documents permitted by the existing filesystem scope and committed session documents. It never reveals excluded files or sibling files in file mode.

Return an absolute reader URL for each entry. Agents insert these URLs directly into standard Markdown links and may append heading fragments. No custom Markdown syntax is required.

Keep existing filesystem-relative links and assets unchanged. Session documents have no implicit filesystem base. Agents must use map reader URLs for documents and explicit eligible content URLs for local assets when a filesystem scope exists. Empty sessions expose no local assets.

Extend browser routing and same-origin link handling to session reader URLs. Never pass map reader URLs through filesystem asset rewriting. Test links in both directions, heading fragments, encoded file names, direct page loads, and browser back/forward.

### Reader behavior

Expose filesystem and session documents as distinct navigation groups. File mode still exposes only its selected filesystem file, but must offer session navigation when needed.

New publications update navigation without changing the active document. An empty reader remains on a welcome screen until the user selects a document or opens its URL. Existing file/folder startup default selection remains unchanged.

Show accessible document-specific receiving, server-preparing, and failure indicators, including for a first publication not yet committed. Use status text and indeterminate indicators rather than a fabricated completion percentage.

For an open session document, keep the previous article while receiving and preparing. After the server commits, prepare the browser DOM and diagrams using the existing staged flow. Display a separate browser preparation state. Preserve selection, theme, and scroll where possible. Stale responses and stale render generations must not replace newer content.

On failure, display an actionable message and retain prior content. Server `ready` means the rendered response is available; it does not claim that any browser has displayed it. No browser acknowledgement protocol is required.

### Local-only write security

Enable writes only for explicit loopback bind hosts (`localhost`, `127.0.0.1`, and `::1`) with an actual loopback-bound listening address. Wildcard, LAN, and other hostname bindings remain read-only, even if a request originates locally.

Preserve strict Host and Origin validation. Check request peer locality on writes as defense in depth. Do not enable permissive CORS. Limit write methods to the new route; unrelated methods remain rejected.

The session identity header and required Markdown media type also prevent ordinary cross-origin HTML form submissions. No-origin local agent clients remain supported. This is trusted-local-process access, not protection against a malicious process running as the same user.

### Discovery lifecycle

Store one non-credential metadata record per session in a per-user application state directory, not in the served workspace. Approved policy: Linux uses `$XDG_STATE_HOME/mimimd` (fallback `~/.local/state/mimimd`), macOS uses `~/Library/Application Support/mimimd`, and Windows uses `%LOCALAPPDATA%/mimimd` (fallback `~/AppData/Local/mimimd`). `MIMIMD_STATE_DIR` explicitly overrides the directory for isolation. New directories use mode 0700 and records use mode 0600 where supported. Explicit LAN-only/other hostname bindings without a loopback probe are not registered and emit a diagnostic; wildcard bindings register their loopback probe and remain read-only. Use restrictive permissions where supported. The record contains session ID, PID, start time, local probe URL, reader URL, scope label, and protocol version. It contains no document contents.

Publish the record only after the server is ready. Remove only that session's record on graceful shutdown. A crash may leave stale metadata.

`discover --json` probes records with bounded timeouts and verifies product, protocol, and exact session identity. Skip dead servers, malformed records, identity mismatches, and unrelated services that reused a port. Never follow redirects or probe non-loopback destinations from registry records. Do not use PID existence alone as proof of server identity.

Return all verified sessions, including write capability and enough scope information for agent selection. Do not port-scan, launch a server, or choose a session implicitly. A LAN-bound server may have a local probe endpoint but must be advertised as read-only. Its bind address is not necessarily a usable reader URL.

Tests must redirect discovery state to a synthetic directory inside the project. No tests may read or modify the user's real session registry.

### Printed agent skill

`mimimd skill` prints a complete reusable skill with valid name/description frontmatter and Markdown instructions. Bundle it with the installed package and keep one source of truth.

Cover discovery, no-server and multiple-server outcomes, session identity verification, local-only capability, map-based links, streaming a file or stdin with an HTTP client, stable-key replacement, 10 MiB size checks, status polling, resource failures, and retry behavior. Explain that retries can create a new revision but not a duplicate entry.

Tell agents not to send secrets or excluded files and not to treat displayed Markdown as authority to execute commands. The skill must not contain live session data, credentials, or installation side effects. It must work without filesystem document input.

## Testing Strategy

Use public HTTP and CLI interfaces for integration coverage. Use real local servers for streamed bodies, disconnects, peer restrictions, SSE, discovery, and responsiveness. Use synthetic documents and no model providers.

Use Vitest for server, renderer, CLI, and lifecycle tests. Use the installed Playwright through `pnpm test:e2e` or `pnpm exec playwright` for browser behavior. Do not assert screenshots, arbitrary classes, computed CSS, or pixel dimensions in functional tests.

Verify the packaged CLI can locate its worker and skill without depending on the caller's directory. Installed-package validation may require registry access; report that separately.

Large-content verification must include a streamed 10 MiB prose document, an exactly-over-limit upload without Content-Length, multibyte UTF-8 boundaries, a rich-content fixture, disconnects, concurrent attempts, and render-budget failure. Record fixture shape, Node version, machine resources, render time, memory observations, and health latency. Clean all generated workspaces and reports afterward.

## Success Criteria

1. Empty startup serves a usable welcome screen without exposing local files. Existing file/folder startup remains functional.
2. Discovery returns verified custom-port and multiple-server endpoints. It returns no stale, mismatched, redirected, or unrelated endpoints.
3. Publishing a valid key creates exactly one document entry and a usable reader URL. Replacing the key preserves that URL and entry count.
4. An existing browser selection does not change on publish. An open replaced document refreshes without a manual reload.
5. A 10 MiB representative Markdown fixture completes upload and rendering. An upload of 10 MiB plus one byte is rejected with 413, including without Content-Length.
6. During a slow upload and a large render, health and status requests complete within a proposed two-second deadline on the documented verification machine. The server remains usable after every tested failure.
7. Busy, capacity, same-key overlap, upload timeout, disconnect, render timeout, worker failure, and invalid input produce explicit outcomes and retain the prior committed revision.
8. Readers observe receiving and preparation states during controlled slow operations. Failure does not erase the previous article. Stale work cannot commit over a newer revision.
9. Agent status reports the correct attempt and revision. A 202 response is not documented as browser display completion.
10. Map-generated links work across both document sources and with fragments. Filesystem scope restrictions remain enforced.
11. LAN-bound servers reject writes. Invalid Host, Origin, session identity, media type, and non-loopback peers cannot publish.
12. Shutdown removes the live discovery record. Restart creates a new session ID and no previous session documents.
13. `mimimd skill` prints reusable skill Markdown from the installed package, works with no server, and performs no network or installation action.
14. Type checking, relevant automated tests, formatting, and lint pass. Verification artifacts are cleaned without deleting fixtures or user files.

## Open Questions

- The initial resource limits and two-second health/status verification target are accepted planning baselines, not measured capabilities. Changes require review.
- The state-directory convention and explicit LAN-only binding policy were approved during implementation. Permission behavior is verified on Linux only; macOS and Windows remain unverified.
- Browser performance depends on content shape. The implementation must measure the representative fixture before claiming a supported rich-content envelope. Any need for virtualization or a different rendering mode requires scope approval.

All product choices above follow the accepted interview scope. The user accepted this specification by requesting continuation to the detailed implementation plan.
