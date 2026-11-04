# Agent publishing implementation checklist

Status: Implemented and verified on Linux/WSL2 with Chromium. All task slices have automated evidence; platform and stress-coverage caveats are recorded below.

- Specification: [docs/specs/agent-publishing.md](../docs/specs/agent-publishing.md)
- Detailed tasks, acceptance criteria, commands, and dependencies: [plan.md](plan.md)

## Before implementation

- [x] Confirm the product scope through the interview.
- [x] Save and obtain acceptance of the specification.
- [x] Inspect current CLI, HTTP, renderer, browser, and packaging flows.
- [x] Write the dependency-ordered implementation plan.
- [x] Obtain review of the plan.
- [x] Confirm any unresolved discovery policy before Task 10.

## Phase 1: Safe publishing

- [x] **Task 1:** Empty startup, fresh session identity, cheap health response, and clean shutdown.
- [x] **Task 2:** Streamed raw-Markdown PUT, isolated render, status polling, and stable replacement.
- [x] **Checkpoint A:** Demonstrate create, replace, and reject over HTTP.
- [x] **Task 3:** Capacity reservations, deadlines, worker recovery, and teardown.
- [x] **Task 4:** Verify 10 MiB support, over-limit rejection, responsiveness, and failure recovery under production budgets.
- [x] **Checkpoint B:** Review measured feasibility. Request approval for any limit or architecture change.

## Phase 2: Maps and reader

- [x] **Task 5:** Unified eligible-document map, shared identities, and stable reader URLs.
- [x] **Task 6:** Bounded SSE status, reconnect snapshots, and unchanged filesystem notifications.
- [x] **Checkpoint C:** Freeze the tested agent API and event shapes.
- [x] **Task 7:** Session navigation, direct routes, empty welcome state, and unchanged reader selection.
- [x] **Task 8:** Accessible upload/preparation/error states and atomic browser updates.
- [x] **Checkpoint D:** Review visible behavior, failure preservation, and keyboard access.
- [x] **Task 9:** Cross-source map links, fragments, history, and representative large-document browser verification.

## Phase 3: Agent entry points

- [x] **Task 10:** Isolated discovery records, verified health probes, and lifecycle cleanup.
- [x] **Checkpoint E:** Review discovery directory policy, explicit LAN-only binding behavior, and browser limits.
- [x] **Task 11:** `mimimd discover --json`, multiple/zero-session behavior, and command/path compatibility.
- [x] **Task 12:** `mimimd skill`, bundled Markdown, and independently exercised examples.
- [x] **Checkpoint F:** Follow printed skill instructions without a paid model or live user data.

## Phase 4: Distribution and final checks

- [x] **Task 13:** Installed-package worker, skill, discovery, and cleanup verification.
- [x] **Task 14:** Public documentation, complete tests, and acceptance evidence.
- [x] Run `pnpm build` and `pnpm typecheck`.
- [x] Run `pnpm test` and `pnpm test:e2e`.
- [x] Run `pnpm format`, `pnpm lint:fix`, `pnpm lint`, and `pnpm format:check`.
- [x] Clean generated artifacts after each verification run, including failed runs.
- [x] Inspect `git status --short` for unexpected changes.
- [x] Report platform coverage, package registry-access constraints, memory observations, latency, and browser limits.
- [x] **Checkpoint G:** Review all 14 specification success criteria and remaining caveats.

## Evidence to record during implementation

Record each completed task's tested commands and outcomes. Do not check a task solely because its code exists.

| Area                                | Evidence                                                                                                                                                                                | Status |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Publishing and stable replacement   | Real HTTP create/replace/reject/recover, stable map entry/URL, attempt IDs and revisions; installed worker exercised                                                                    | Passed |
| Upload boundaries                   | Streamed exactly 10 MiB prose, 10 MiB UTF-8 multibyte prose, chunked plus-one-byte rejection, split UTF-8 and invalid UTF-8                                                             | Passed |
| Capacity and render failures        | Same-key/attempt/key/storage exhaustion, Retry-After, disconnect/deadline, controlled worker exit, pathological heap failure, complete-output/frontmatter budget and recovery           | Passed |
| Large-content performance           | Isolated production-budget prose: 0.911 s upload, 9.713 s post-202 preparation, max probe 14.87 ms during receiving/preparing, sampled process RSS 376,774,656 bytes; environment below | Passed |
| Browser behavior                    | Empty/file/folder navigation, slow receiving, retained article, failed replacement, stale response race, cross-source encoded URLs/fragments/history; 10 MiB Chromium completion        | Passed |
| Security                            | Existing filesystem exclusion/symlink/sanitization/CSP suites plus invalid session/media/compression/key/origin, empty assets and wildcard read-only checks                             | Passed |
| Discovery                           | Two custom-port CLI sessions, empty results, exact identities, malformed/mismatched/external/redirected records skipped, Linux record modes, own-record shutdown removal                | Passed |
| Printed skill and installed package | Skill frontmatter/no-server output, public workflow, tarball install from unrelated caller, compiled worker replacement, isolated discovery, empty restart and cleanup                  | Passed |
| Final quality and cleanup           | Build/typecheck, 48 Vitest tests (15 files), including the standalone curl skill workflow, 14 Chromium tests; format/lint checks and inspected artifact cleanup                         | Passed |

## Implementation evidence and caveats

- Full application verification: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` passed. The final complete unit/integration run covered 48 Vitest tests across 15 files, including the standalone curl skill workflow; all passed. The complete Chromium run covered 14 tests; all passed.
- Targeted verification used `pnpm exec vitest run` for publishing, limits, large inputs, maps, SSE, discovery, CLI, and installed-package tests. The installed tarball test passed with dependency installation available; it verified file and empty startup, a module-relative compiled worker, stable replacement, discovery, bundled skill, unrelated caller directory, and teardown. No real user discovery registry was accessed.
- The printed skill workflow is independently exercised with `curl --data-binary @file` and `@-`, map-based links, status polling and same-key replacement. No paid model was used.
- Isolated production-budget measurement: Node v26.13.0, Linux 6.18.54.1-microsoft-standard-WSL2, AMD Ryzen 7 5800X, 16 logical CPUs, 12,542,959,616 bytes reported RAM. Fixture: 10,485,760 ASCII bytes, approximately 2,076-byte ordinary-prose paragraphs, streamed in 64 KiB chunks with 5 ms pacing. Upload acceptance took 0.911 s; post-202-to-terminal preparation took 9.713 s (polling includes up to roughly 100 ms). Maximum health/status latency was 14.87 ms with both receiving and preparing observed. Sampled test-process RSS peaked at 376,774,656 bytes (~359 MiB), including that process's worker; it excludes other test processes and browser memory and is not a hard ceiling. Other runs observed roughly 337–370 MiB and up to 16.22 ms probe latency.
- Chromium's representative 10 MiB prose document reached visible completion and heading navigation in 8.462 s in the final full browser run (other runs: 9.266–12.207 s). Independent first/middle/last markers were intact. This does not establish arbitrary rich-content DOM performance, bounded browser memory, or continuously responsive interaction during DOM preparation. Rich rendering was not stripped or virtualized.
- Pathological emphasis under production limits failed safely and retained the previous rich revision; a later publication succeeded. A 7 MiB ampersand expansion experiment hit the worker heap before the output-size check. The complete serialized-output check, including frontmatter, is therefore separately exercised with a small internal output-budget harness; production output/heap limits were not relaxed. Upload/render deadline tests similarly shorten internal budgets without exposing test controls over HTTP or CLI. Storage-reservation tests use a controlled large-output worker fixture.
- Slow-client SSE buffering is bounded by disconnecting clients that exhaust stream demand. Snapshot/reconnection and ordinary streamed-consumer behavior are tested; sustained adversarial slow-client memory profiling remains unmeasured.
- Discovery directory policy was explicitly approved: standard Linux/macOS/Windows state locations, an isolated `MIMIMD_STATE_DIR` override, and a diagnostic/no registration for explicit LAN-only bindings without loopback probes. Linux record permissions are verified. Windows/macOS permissions, physical second-device LAN access, and sustained adversarial filesystem mutation remain release caveats.
- The Hono adapter now leaves Node's global Request/Response objects intact: compiled startup exposed a Node 26/Shiki incompatibility with the adapter's global replacement. No dependencies were added or release-age policy changed. The optional Hono CLI is not installed; public real-HTTP tests provide verification instead.
- All generated test directories/reports from these runs were inspected and removed; pre-existing build output was preserved. Formatting/lint fixes can require a second format pass because ESLint inserts braces; final format and lint checks are both required.
