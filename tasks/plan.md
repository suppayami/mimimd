# Plan: Agent publishing sessions

Status: Implemented. See [todo.md](todo.md) for verification evidence, measured performance, and remaining platform/release caveats.

Input: [Accepted specification](../docs/specs/agent-publishing.md).

## Outcome and scope

Agents discover running mimimd sessions, publish up to 10 MiB of Markdown over HTTP, replace a stable key, and obtain URLs for links. Readers see upload and preparation status without losing their selection or previous content. `mimimd skill` prints reusable agent instructions.

Session content is memory-only. Filesystem content remains read-only. Publishing is local-only. No database, resumable uploads, patches, delete API, MCP, automatic navigation, or publishing CLI is included.

## Existing conventions and decisions

- Keep the existing Hono server and Vue reader. Use Node standard-library facilities for worker isolation and discovery.
- Keep filesystem identity and policy in `FileScope`. Session keys are separate identities under `/session/<key>`.
- Preserve `/api/index`, filesystem reader routes, and filesystem-relative links. Extend shared contracts explicitly rather than reinterpreting filesystem paths as session keys.
- Use a single streamed raw-Markdown PUT. A 202 response means upload accepted, not browser display complete.
- Keep only a committed rendered revision and the latest attempt metadata per key. Reserve capacity while the old revision remains visible.
- Render session documents in a worker. Existing filesystem rendering remains unchanged; moving all filesystem rendering is outside this feature.
- Retain serialized rendered results where practical so repeated GETs do not rebuild large JSON responses on the HTTP event loop. Enforce the complete result limit, including headings and frontmatter.
- Use named SSE status events alongside existing filesystem change events. Do not refetch or rerender the full article for every upload-progress event.
- On SSE connection or reconnection, send a current session-attempt snapshot before incremental status events. This makes first publications discoverable even when they are not in the committed document map. Keep it bounded by the key limit and order it so no transition is missed.
- Use absolute reader URLs from the map in agent-authored links. They are already skipped by the renderer's relative-link rewrite. Do not add speculative Markdown URL syntax.
- The router already has a catch-all route. Session support primarily changes `App.vue` route interpretation and link interception, not router architecture.
- Initial resource limits and the two-second health/status target are accepted baselines. Measure them; do not silently relax them to make tests pass.
- Build resolves server modules under `dist`. Worker URLs must resolve relative to the installed server module, not the caller's working directory.

## Verification rules

Commands below are intended for implementation, after the named test sources exist. They have not been run as implementation verification during planning.

Run tests through public HTTP, browser, and CLI interfaces. Exercise real local transport for streaming, security, lifecycle, and discovery. Do not add tests solely for type shapes or copied limit constants.

Use project-local synthetic directories for all generated data. Every new test must close servers, streams, workers, and child processes and clean its generated artifacts in teardown, including failure paths. Cleanup must respect approval and path-safety rules. Never use the real user discovery registry in tests.

The existing package test generates an installation workspace and requires dependency registry access. Existing tests do not consistently clean artifacts. Inspect generated paths before runs and clean only artifacts from those runs; do not sweep user files or fixtures.

After each implementation slice, run `pnpm typecheck` and its targeted checks. After all changes, run `pnpm format`, `pnpm lint:fix`, and `pnpm lint`. No screenshots belong in functional suites.

## Phase 1: Session foundation and risky publishing path

## Task 1: Start empty sessions and expose health identity

**Description:** Allow no-input CLI startup with an optional filesystem scope. Establish a fresh session ID and cheap health response with protocol identity, endpoint, capability, and limits. Skip filesystem watchers and assets when no scope exists. Preserve file/folder startup and occupied-port behavior. Do not introduce discovery writes yet.

**Acceptance criteria:**

1. An empty server answers health and an empty index without exposing local documents or assets.
2. File/folder index and content behavior remain unchanged; each startup has a different session ID.
3. Shutdown releases the listener with or without a watcher.

**Verification:** `pnpm test -- tests/cli.test.ts tests/server/http.test.ts tests/server/lifecycle.test.ts`; test real no-scope startup, protected assets, restart identity, and occupied ports.

**Dependencies:** None.

**Files likely touched:** `src/args.ts`, `src/cli.ts`, `src/server/http.ts`, `tests/cli.test.ts`, `tests/server/lifecycle.test.ts`.

**Estimated scope:** M: 3–5 files.

## Task 2: Publish and replace through an isolated renderer

**Description:** Add the session store and worker-backed publishing routes in one vertical slice. Stream UTF-8 input with actual-byte limits, validate keys and session identity, enforce local-only writes, and return 202 after admission. Run existing Markdown rendering in a module-relative worker. Expose latest attempt status and committed rendered responses. Reject duplicate active keys and preserve the previous revision until a new render succeeds. Define backend-only types in the session module until browser contracts are needed.

**Acceptance criteria:**

1. Valid PUT followed by status polling yields readable rendered content; replacing the same key keeps its identity and increments its committed revision.
2. Over-limit, invalid UTF-8, invalid media, wrong session, and prohibited network writes do not commit content.
3. Upload and worker failures preserve the previous committed revision, and a subsequent valid request succeeds.

**Verification:** `pnpm build:server && pnpm test -- tests/server/publishing.test.ts`; cover raw streaming, exact byte boundaries, split UTF-8 characters, first creation, replacement, 202 semantics, and failure recovery over real HTTP. `pnpm test -- tests/server/http.test.ts tests/server/lifecycle.test.ts` checks unchanged read/security behavior.

**Dependencies:** 1.

**Files likely touched:** `src/server/http.ts`, `src/server/session.ts` (new), `src/server/render-worker.ts` (new), `src/server/render-session.ts` (new), `tests/server/publishing.test.ts` (new).

**Estimated scope:** M: 5 files. Keep this slice limited to the publish/status/read lifecycle; resource stress tests follow separately.

### Checkpoint A: Working publish boundary

Demonstrate one create, one replacement, and one rejected upload through HTTP. Confirm that no unbounded body parser or direct session render remains on the HTTP thread. Stop for review if worker packaging or stream behavior requires a different architecture.

## Task 3: Enforce capacity, deadlines, and worker recovery

**Description:** Complete resource reservations and failure cleanup for the accepted limits: two attempts, one renderer, 256 keys, 128 MiB payload budget, 32 MiB output, upload/render deadlines, and worker heap limit. Retain old revisions during replacements. Bound queueing and release source buffers after use. Detect worker exit/error and reject the affected attempt without terminating HTTP. Ensure shutdown cancels pending work and terminates workers.

**Acceptance criteria:**

1. Same-key overlap returns 409; attempt or storage exhaustion returns 503 with Retry-After without consuming an unbounded body.
2. Disconnect, timeout, excessive output, and worker termination release capacity and retain previously committed content.
3. Health and status remain usable during rendering, after failure, and during orderly teardown.

**Verification:** `pnpm build:server && pnpm test -- tests/server/publishing.test.ts tests/server/publishing-limits.test.ts tests/server/lifecycle.test.ts`; test public responses and recovery. For long deadline and worker-crash cases, use a narrowly scoped test harness with shortened budgets or a controlled worker fixture; keep production defaults separately exercised by Task 4. Do not expose test controls through HTTP or CLI.

**Dependencies:** 2.

**Files likely touched:** `src/server/session.ts`, `src/server/render-session.ts`, `src/server/render-worker.ts`, `tests/server/publishing-limits.test.ts` (new), `tests/server/lifecycle.test.ts`.

**Estimated scope:** M: 5 files.

## Task 4: Prove large-input behavior before UI work

**Description:** Add reproducible integration verification for a streamed 10 MiB prose document, large multibyte input, rich Markdown, and a pathological render. Probe health/status during upload and rendering. Measure latency, render duration, and memory under production budgets. Avoid generating permanent large fixtures; construct synthetic inputs in tests. Correct bottlenecks in the publishing path only.

**Acceptance criteria:**

1. The representative 10 MiB input renders successfully under the accepted budgets; a chunked 10 MiB-plus-one-byte upload returns 413.
2. Health/status requests finish within two seconds on the recorded verification machine while upload/render work is active.
3. Pathological content fails explicitly without replacing the old revision or preventing later valid publishes; memory and environment observations are reported honestly.

**Verification:** `pnpm build:server && pnpm test -- tests/server/large-publishing.test.ts`; run with production limits. Record Node version, OS, CPU/RAM, fixture shape, peak RSS observations, maximum probe latency, and render duration in the verification summary. Clean temporary reports and fixture outputs after the run.

**Dependencies:** 3.

**Files likely touched:** `tests/server/large-publishing.test.ts` (new), `src/server/session.ts`, `src/server/render-session.ts`, `src/server/render-worker.ts`.

**Estimated scope:** M: 4 files.

### Checkpoint B: Large-content feasibility gate

Do not proceed on the assumption that the limit works. Require evidence for the 10 MiB success case and two-second responsiveness target. If worker heap/output limits prevent ordinary prose from succeeding, request a spec revision rather than disable limits or simplify rendering. Document that this does not establish a process-wide hard memory ceiling.

## Phase 2: Maps, live state, and reader behavior

## Task 5: Expose unified document maps and reader addresses

**Description:** Add explicit shared types for session identity, document-map entries, revisions, and attempt state. Return eligible filesystem documents plus committed session entries with absolute reader URLs. Serve the session reader shell. Preserve all existing filesystem APIs and namespace boundaries. Commit map visibility with the rendered revision.

**Acceptance criteria:**

1. The map lists both sources with stable URLs and writable flags; a replacement does not add another entry.
2. File mode, ignore rules, hidden entries, and excluded files remain restricted in both maps and reads.
3. Session shell URLs support direct HTTP loads; unsuccessful first publications do not appear as committed map entries.

**Verification:** `pnpm test -- tests/server/document-map.test.ts tests/server/http.test.ts tests/server/files.test.ts`; publish and replace through HTTP, follow returned URLs, and verify file/folder/empty scopes with excluded synthetic paths.

**Dependencies:** 4.

**Files likely touched:** `src/contracts.ts`, `src/server/http.ts`, `src/server/session.ts`, `tests/server/document-map.test.ts` (new).

**Estimated scope:** M: 4 files.

## Task 6: Deliver bounded live status and reconnect snapshots

**Description:** Extend SSE with document-specific attempt events and a current snapshot. Keep filesystem notifications compatible. Coalesce byte progress and ensure snapshots plus incremental delivery cannot miss committed transitions. Reuse the session store as authoritative state. Send neither source nor rendered payloads in events, and do not permit slow clients to grow unbounded queues.

**Acceptance criteria:**

1. A subscriber sees receiving, preparing, and terminal state with matching attempt IDs and revisions.
2. A subscriber reconnecting during first publication or after failure obtains current state without requiring a committed map entry.
3. Slow or disconnected clients cannot block publication or retain unlimited event data; existing filesystem changes still notify readers.

**Verification:** `pnpm test -- tests/server/session-events.test.ts tests/server/http.test.ts`; use real event streams, controlled slow uploads, reconnects, simultaneous completion, and disconnected consumers. Check observable event payloads and later HTTP state, not private queue internals.

**Dependencies:** 5.

**Files likely touched:** `src/server/http.ts`, `src/server/session.ts`, `src/contracts.ts`, `tests/server/session-events.test.ts` (new).

**Estimated scope:** M: 4 files.

### Checkpoint C: Agent contract complete

Walk through health → PUT → status → map → reader URL with an HTTP client. Confirm map and event contracts agree on keys, sessions, and revisions. Freeze these shapes before writing the printed skill and browser consumers.

## Task 7: Add session navigation without taking over selection

**Description:** Extend reader route interpretation and loading for `/session/<key>`. Add a distinct session navigation group alongside existing files. Render a useful empty-session welcome state. Preserve file/folder default selection, while new session documents never select themselves. Reuse the existing catch-all router and preserve the file tree's filesystem-only responsibilities.

**Acceptance criteria:**

1. Session documents are selectable in empty, file, and folder modes; direct URLs and back/forward work.
2. Publishing does not change the current reader selection or replace the empty welcome screen automatically.
3. Missing session documents have a recoverable state with navigation still available; filesystem selection and filtering remain functional.

**Verification:** `pnpm build && pnpm exec playwright test tests/e2e/session-navigation.spec.ts tests/e2e/reader.spec.ts`; cover new tabs/direct loads, empty startup, selected-file startup, and publication while reading. `pnpm test -- tests/web/app.test.ts` checks existing component behavior.

**Dependencies:** 6.

**Files likely touched:** `src/web/App.vue`, `src/web/SessionDocuments.vue` (new), `tests/e2e/session-navigation.spec.ts` (new), `tests/web/app.test.ts`.

**Estimated scope:** M: 4 files.

## Task 8: Display upload, server preparation, and browser preparation states

**Description:** Consume session snapshots/events without refetching content for every progress update. Show document-specific accessible status, including pending first publications and failed replacements. Fetch committed content only when needed. Preserve the prior article until staged browser rendering completes. Retain stale-response guards across navigation, revisions, and theme changes.

**Acceptance criteria:**

1. Controlled slow publication shows receiving and preparation status without navigating the reader; failed publication shows an actionable error.
2. Replacing the open document keeps prior content until the new DOM is ready; failure preserves that content and reader context.
3. Reconnection and rapid updates converge on the latest revision, with no stale browser commit or claim that server-ready means browser-ready.

**Verification:** `pnpm build && pnpm exec playwright test tests/e2e/session-updates.spec.ts tests/e2e/live-updates.spec.ts tests/e2e/diagrams.spec.ts`; use real streamed uploads for receiving and real browser staging for display completion. Use controlled response timing only where needed to reproduce races; verify visible text, accessible status, links, and navigation outcomes.

**Dependencies:** 7.

**Files likely touched:** `src/web/App.vue`, `src/web/SessionDocuments.vue`, `src/web/MarkdownView.vue`, `tests/e2e/session-updates.spec.ts` (new).

**Estimated scope:** M: 4 files.

### Checkpoint D: Reader behavior review

Demonstrate an upload while viewing another document, an open-document replacement, and a failure that retains previous content. Confirm keyboard access and announced status without screenshots in functional tests. Do not conflate server preparation with browser preparation.

## Task 9: Verify map links and the large browser document

**Description:** Complete same-origin link interception for session routes. Verify map-generated URLs across both sources, fragments, encoded filenames, and navigation history. Keep existing file-relative rewriting unchanged. Exercise the representative 10 MiB document in Chromium and record display behavior without adding virtualization or stripping rich content.

**Acceptance criteria:**

1. Map-based links work session-to-session, session-to-file, and file-to-session, including fragments and direct refresh.
2. Existing relative filesystem links/assets still work; an empty session never exposes local assets.
3. The representative large document reaches visible completion with its content intact, while status is shown before preparation; browser performance limitations are reported.

**Verification:** `pnpm build && pnpm exec playwright test tests/e2e/session-links.spec.ts tests/e2e/session-large.spec.ts tests/e2e/security.spec.ts`; verify independent first/middle/last content markers and navigable headings rather than screenshots or DOM-size constants. `pnpm test -- tests/markdown/render.test.ts` guards existing rewrites and sanitization.

**Dependencies:** 8.

**Files likely touched:** `src/web/App.vue`, `tests/e2e/session-links.spec.ts` (new), `tests/e2e/session-large.spec.ts` (new), `tests/markdown/render.test.ts`.

**Estimated scope:** M: 4 files.

## Phase 3: Discovery and reusable agent guidance

## Task 10: Register sessions and verify live discovery records

**Description:** Add per-user metadata registration after server readiness and removal during graceful shutdown. Implement bounded verification of records by exact session identity, with no redirects or non-loopback probes. Resolve the state-directory convention before implementation and record it in the spec. Use injected project-local state roots in tests. Keep document data out of metadata and logs. Treat malformed/stale records as non-live, not grounds to delete unrelated files.

**Acceptance criteria:**

1. Registration occurs only after readiness; shutdown removes only its own record, and restart changes session identity.
2. Discovery excludes dead, malformed, mismatched, redirected, and non-loopback records and never probes an external destination.
3. Simultaneous records remain independent; permission/setup errors produce explicit diagnostics instead of false success.

**Verification:** `pnpm build:server && pnpm test -- tests/server/discovery.test.ts tests/server/lifecycle.test.ts`; use synthetic registry directories, local fake health services, and actual session startup/shutdown. Validate OS permission behavior on each supported platform before claiming it verified.

**Dependencies:** 1; run after 9 in the default sequence. Can be developed separately after Checkpoint A if contracts are coordinated.

**Files likely touched:** `src/server/discovery.ts` (new), `src/cli.ts`, `tests/server/discovery.test.ts` (new), `tests/server/lifecycle.test.ts`, `docs/specs/agent-publishing.md`.

**Estimated scope:** M: 5 files.

### Checkpoint E: Links, browser limits, and discovery policy

Review large-document browser observations and the selected discovery directory convention. Resolve LAN-only binds that cannot be probed over loopback: do not invent an endpoint or silently advertise an unreachable session. Return to the spec for any required contract change.

## Task 11: Expose discovery through the CLI

**Description:** Add `mimimd discover --json`, command dispatch, and help. Return all verified sessions with scope labels, endpoints, session IDs, and write capabilities. Make no-server output a successful empty result. Keep stdout machine-readable and diagnostics on stderr. Document reserved bare command names and explicit relative paths for same-named directories.

**Acceptance criteria:**

1. Discovery lists two live custom-port sessions without selecting one, and returns an empty array when none exist.
2. CLI JSON contains no logs and remains parseable; invalid command arguments fail clearly.
3. File/folder invocation and `./discover` or `./skill` directory inputs retain their intended meaning.

**Verification:** `pnpm build:server && pnpm test -- tests/cli.test.ts tests/discovery-cli.test.ts`; spawn compiled commands with isolated state directories and live local servers, parse stdout as JSON, and check exit codes.

**Dependencies:** 10.

**Files likely touched:** `src/args.ts`, `src/cli.ts`, `src/server/discovery.ts`, `tests/cli.test.ts`, `tests/discovery-cli.test.ts` (new).

**Estimated scope:** M: 5 files.

## Task 12: Print the bundled recommended skill

**Description:** Add a single-source skill Markdown payload bundled through the existing TypeScript build, and dispatch `mimimd skill` without server startup. Cover the finalized discovery/API flow, streaming file/stdin input, map links, stable replacements, status checks, limits, retries, and safe data handling. Use illustrative local data only. Avoid shell arguments containing large Markdown bodies.

**Acceptance criteria:**

1. `mimimd skill` outputs valid skill frontmatter and complete Markdown with no network, registry, or server side effect.
2. Following its examples against an isolated live session publishes, links, and replaces one key successfully.
3. Instructions correctly handle zero/multiple sessions, read-only sessions, session mismatch, 202 polling, and failures without claiming display completion.

**Verification:** `pnpm build:server && pnpm test -- tests/skill-cli.test.ts tests/cli.test.ts`; parse skill metadata and exercise the documented HTTP flow against a real synthetic session. Manually review streaming examples and safety instructions rather than relying only on text snapshots.

**Dependencies:** 6, 11.

**Files likely touched:** `src/agent-skill.ts` (new), `src/args.ts`, `src/cli.ts`, `tests/skill-cli.test.ts` (new).

**Estimated scope:** M: 4 files.

### Checkpoint F: Agent workflow review

Use only printed skill instructions to discover a session, publish two linked documents, replace one, and verify status. Confirm no files are installed and no session content is persisted. Do not run a paid model to perform this check.

## Phase 4: Distribution and release verification

## Task 13: Verify installed-package resources and isolation

**Description:** Extend the existing tarball test to run empty startup, discovery, publishing through the compiled worker, and skill printing from an unrelated project-local directory. Ensure subprocess environment redirects discovery state. Add teardown for generated artifacts in this modified test. Resolve packaging changes only if compiled assets are actually missing.

**Acceptance criteria:**

1. The installed package publishes and replaces a document with the worker resolved independently of the caller directory.
2. Skill output and discovery work from the installed CLI with no source checkout dependency or real-user registry access.
3. Child processes and test installation artifacts are cleaned on success and failure.

**Verification:** `pnpm test -- tests/package.test.ts`; this invokes `pnpm pack` and local installation and may need dependency registry access. Report unavailable network separately from code failures. Inspect the generated tarball only during the test, then clean it.

**Dependencies:** 9, 12.

**Files likely touched:** `tests/package.test.ts`, `package.json` only if required, `src/server/render-session.ts` only if module-relative packaging fails, `src/agent-skill.ts` only if bundling fails.

**Estimated scope:** M: 3–4 files maximum; expected primary change is the package test.

## Task 14: Document contracts and run the complete acceptance gate

**Description:** Update public usage and architecture documentation to remove the obsolete claim that no editing API exists. Explain memory-only publishing, read-only filesystem behavior, loopback-only writes, discovery, limits, status semantics, and skill output. Run complete verification and map results to all accepted success criteria. Record actual platform/performance coverage and unresolved release limits without claiming unrun checks passed.

**Acceptance criteria:**

1. Documentation matches actual commands, endpoints, lifecycle, failure behavior, and trust boundaries.
2. Type checking, functional tests, formatting, and lint pass; installed-package and performance evidence is reported with its environment.
3. All generated verification artifacts are cleaned and no unrelated user files or production credentials were touched.

**Verification:** `pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e`; then `pnpm format && pnpm lint:fix && pnpm lint && pnpm format:check`. Inspect `git status --short` for unexpected changes. Re-run targeted tests if final fixes affect behavior. Manually verify loopback publishing and LAN read-only behavior where a second device is available; otherwise mark the physical-device check unverified.

**Dependencies:** 13.

**Files likely touched:** `README.md`, `docs/architecture.md`, `docs/specs/agent-publishing.md` for approved clarifications, `tasks/todo.md` for completion evidence.

**Estimated scope:** M: 4 files. Any implementation defect found here returns to its owning task rather than expanding this task into a refactor.

### Checkpoint G: Final approval

Review the acceptance matrix, performance observations, remaining platform caveats, and artifact cleanup. Planning approval is not evidence of implementation completion.

## Sequencing and safe parallel work

Default order is Tasks 1–14. Keep the publish/render path and performance gate ahead of browser polish.

- Task 10 discovery logic can proceed after Task 1 while Tasks 2–9 progress, but coordinate shared `src/cli.ts`, lifecycle tests, and health contracts. Merge its spec decision before Task 11.
- Skill prose can be drafted after Checkpoint C. Final examples depend on discovery behavior from Task 11.
- Browser work depends on map/event contracts; it must not invent new server states independently.
- Do not edit shared `http.ts`, `App.vue`, or CLI dispatch concurrently without explicit ownership.
- No parallel agents are launched by this plan.

## Acceptance coverage

| Spec criterion                        | Primary tasks      |
| ------------------------------------- | ------------------ |
| 1: Empty and existing startup         | 1, 7               |
| 2: Verified discovery                 | 10, 11             |
| 3: Stable publication and replacement | 2, 5               |
| 4: Selection and live replacement     | 7, 8               |
| 5: 10 MiB boundary                    | 2, 4               |
| 6: Responsiveness                     | 3, 4               |
| 7: Failure and capacity recovery      | 3, 4               |
| 8: Visible stages and stale work      | 6, 8               |
| 9: Attempt/revision semantics         | 2, 6, 12           |
| 10: Cross-source links and scope      | 5, 9               |
| 11: Local-only write security         | 2, 3               |
| 12: Shutdown and fresh sessions       | 1, 3, 10           |
| 13: Printed installed skill           | 12, 13             |
| 14: Complete verification and cleanup | Every task, 13, 14 |

## Risks and unresolved questions

1. **Input size does not bound rendering cost.** The 256 MiB worker heap may be insufficient for some ordinary 10 MiB documents. Checkpoint B must establish feasibility before proceeding. Worker limits do not contain all native allocations or guarantee an RSS cap.
2. **Large response serialization can block HTTP.** Serialize and size-check in the worker where possible; avoid repeated parent-thread conversions and retained duplicate representations. Measure responsiveness during rendered GETs as well as preparation.
3. **Browser DOM and Mermaid can block the browser.** An indicator is not virtualization. Task 9 measures the accepted representative case. Broader rendering changes need scope approval.
4. **Memory capacity includes replacements.** Conservative reservations can reject a replacement even when its final output would fit. Document this behavior; do not evict the current revision to make room.
5. **Failed keys count toward 256 slots.** With no deletion API, a session that exhausts distinct keys needs restart. The printed skill should recommend reusing keys. Changing this policy needs spec review.
6. **Latest-only status is not job history.** An agent may observe another writer's later attempt. Compare attempt IDs and revisions; never report an unrelated attempt as the caller's success.
7. **Discovery storage convention remains a decision gate.** Candidate defaults are an XDG state directory on Linux, Application Support on macOS, and Local AppData on Windows. Choose and record exact fallback/permission rules before Task 10 implementation. Do not add a general user configuration system merely for tests.
8. **LAN-only binds may lack a loopback probe path.** Wildcard binds can usually be probed locally, but an explicit interface-only bind cannot necessarily satisfy the loopback-only discovery rule. Resolve this with the user if such sessions must be discoverable; do not probe remote addresses or claim full discovery coverage silently.
9. **Tests need isolation after discovery becomes automatic.** Existing CLI-spawning and Playwright tests must not create real-user records. Inspect every spawn path before enabling registration; keep any required test-environment changes within the owning task or split a focused follow-up before running those tests.
10. **Existing filesystem rendering still shares the event loop.** The responsiveness guarantee being verified concerns pushed session content. Broader filesystem-render isolation is separate work.
11. **No same-user authentication.** The session header prevents stale endpoint use, not malicious local clients. Retain this explicit trust boundary.
12. **Planning estimates are focused file scopes, not time promises.** Split a task if inspection reveals more than five substantive files or independent subsystems. Revisit the spec before changing accepted behavior.
