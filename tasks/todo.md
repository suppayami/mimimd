# Agent publishing implementation checklist

Status: Plan ready for review. No application tasks have been implemented.

- Specification: [docs/specs/agent-publishing.md](../docs/specs/agent-publishing.md)
- Detailed tasks, acceptance criteria, commands, and dependencies: [plan.md](plan.md)

## Before implementation

- [x] Confirm the product scope through the interview.
- [x] Save and obtain acceptance of the specification.
- [x] Inspect current CLI, HTTP, renderer, browser, and packaging flows.
- [x] Write the dependency-ordered implementation plan.
- [ ] Obtain review of the plan.
- [ ] Confirm any unresolved discovery policy before Task 10.

## Phase 1: Safe publishing

- [ ] **Task 1:** Empty startup, fresh session identity, cheap health response, and clean shutdown.
- [ ] **Task 2:** Streamed raw-Markdown PUT, isolated render, status polling, and stable replacement.
- [ ] **Checkpoint A:** Demonstrate create, replace, and reject over HTTP.
- [ ] **Task 3:** Capacity reservations, deadlines, worker recovery, and teardown.
- [ ] **Task 4:** Verify 10 MiB support, over-limit rejection, responsiveness, and failure recovery under production budgets.
- [ ] **Checkpoint B:** Review measured feasibility. Request approval for any limit or architecture change.

## Phase 2: Maps and reader

- [ ] **Task 5:** Unified eligible-document map, shared identities, and stable reader URLs.
- [ ] **Task 6:** Bounded SSE status, reconnect snapshots, and unchanged filesystem notifications.
- [ ] **Checkpoint C:** Freeze the tested agent API and event shapes.
- [ ] **Task 7:** Session navigation, direct routes, empty welcome state, and unchanged reader selection.
- [ ] **Task 8:** Accessible upload/preparation/error states and atomic browser updates.
- [ ] **Checkpoint D:** Review visible behavior, failure preservation, and keyboard access.
- [ ] **Task 9:** Cross-source map links, fragments, history, and representative large-document browser verification.

## Phase 3: Agent entry points

- [ ] **Task 10:** Isolated discovery records, verified health probes, and lifecycle cleanup.
- [ ] **Checkpoint E:** Review discovery directory policy, explicit LAN-only binding behavior, and browser limits.
- [ ] **Task 11:** `mimimd discover --json`, multiple/zero-session behavior, and command/path compatibility.
- [ ] **Task 12:** `mimimd skill`, bundled Markdown, and independently exercised examples.
- [ ] **Checkpoint F:** Follow printed skill instructions without a paid model or live user data.

## Phase 4: Distribution and final checks

- [ ] **Task 13:** Installed-package worker, skill, discovery, and cleanup verification.
- [ ] **Task 14:** Public documentation, complete tests, and acceptance evidence.
- [ ] Run `pnpm build` and `pnpm typecheck`.
- [ ] Run `pnpm test` and `pnpm test:e2e`.
- [ ] Run `pnpm format`, `pnpm lint:fix`, `pnpm lint`, and `pnpm format:check`.
- [ ] Clean generated artifacts after each verification run, including failed runs.
- [ ] Inspect `git status --short` for unexpected changes.
- [ ] Report platform coverage, package registry-access constraints, memory observations, latency, and browser limits.
- [ ] **Checkpoint G:** Review all 14 specification success criteria and remaining caveats.

## Evidence to record during implementation

Record each completed task's tested commands and outcomes. Do not check a task solely because its code exists.

| Area                                | Evidence                                                                                           | Status  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| Publishing and stable replacement   | HTTP results, entry count, identity, revision, and retained content after failure                  | Not run |
| Upload boundaries                   | Exactly 10 MiB, plus one byte, chunked bodies, split UTF-8                                         | Not run |
| Capacity and render failures        | Busy/conflict responses, budget failures, recovery, and shutdown                                   | Not run |
| Large-content performance           | Machine/Node details, fixture shape, render time, maximum health latency, peak memory observations | Not run |
| Browser behavior                    | Selection preservation, status, live commit, links, history, representative large display          | Not run |
| Security                            | Host/Origin/session checks, loopback restrictions, eligible document scope                         | Not run |
| Discovery                           | Multiple servers, custom ports, stale/malformed/redirected records, restart identity               | Not run |
| Printed skill and installed package | No-server skill output and full documented flow from unrelated caller directory                    | Not run |
| Final quality and cleanup           | Typecheck, tests, formatting, lint, artifact inspection                                            | Not run |

## Planning-only verification

The specification was formatted and linted before acceptance. After creating this plan, run the repository's required formatting and lint commands. Those checks do not verify the unimplemented publishing feature.
