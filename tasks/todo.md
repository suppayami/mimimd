# mimimd implementation checklist

Specification: `docs/specs/markdown-reader.md`.
Detailed tasks and verification: `tasks/plan.md`.

The reader is implemented with Hono and its Node adapter, following the approved server change. Automated checks now pass on Node v24.22.2 / pnpm 12.6.0 on Linux; the earlier separate visual review ran on Node v26.13.0. Unchecked items below remain release verification, not completed work.

## Phase 1: prerequisites and tooling

- [x] 1. Verify Node.js >=24 and establish pnpm with `minimumReleaseAge: 2880`.
- [x] 2. Configure approved Oxfmt settings, Antfu ESLint options, and exact format/lint scripts.
- [x] Checkpoint A: resolve runtime/tooling blockers without lowering the baseline.
- [x] 3. Compile the server entry and implement the CLI argument contract.
- [x] 4. Build the Vue 3.5/Vite shell with scoped component CSS.
- [x] 5. Configure Vitest, `@testing-library/vue`, Vue type checking, and Playwright.
- [x] Checkpoint B: pass builds, available tests, lint, formatting, and type checks.

## Phase 2: safe single-file reading

- [x] 6. Implement shared root-access checks and recursive document indexing.
- [x] 7. Render safe CommonMark/GFM with unique heading IDs.
- [x] 8. Serve a single document end to end, including startup/shutdown and local/LAN behavior.
- [x] Checkpoint C: demonstrate safe single-file reading.

## Phase 3: theme and navigation

- [x] 9. Verify Everforest Medium provenance and implement dual-theme Shiki highlighting.
- [x] 10. Apply reader styling, theme persistence, and accessible controls.
- [x] 11. Add Vue Router, recursive file navigation, filtering, and history.
- [x] Checkpoint D: review both themes and keyboard folder navigation.
- [x] 12. Resolve Markdown links and serve only permitted local assets.
- [x] 13. Add heading navigation and responsive keyboard-accessible controls.
- [x] Checkpoint E: verify links, assets, heading fragments, and focus behavior.

## Phase 4: rich content and live updates

- [x] 14. Add safe KaTeX math and local assets.
- [x] 15. Add secure Mermaid rendering and theme updates.
- [x] 16. Add filesystem watching, event delivery, and live content/tree updates.
- [x] Checkpoint F: exercise rich content, theme changes, and live reload together.

## Phase 5: security and distribution

- [ ] 17. Complete security release verification: adversarial HTTP/browser fixtures and explicit LAN-interface requests pass; physical LAN-device access and sustained concurrent filesystem-swap testing remain unverified.
- [x] 18. Validate the installed tarball, add usage documentation, and establish CI checks.
- [ ] Checkpoint G: final release approval after outstanding security/platform checks; criteria 1–11 have automated coverage plus the separate visual review described below.
- [x] Complete separate desktop/mobile visual and contrast review in both themes.
- [ ] Finish cross-platform verification and reconfirm registry naming immediately before publication (the earlier unscoped `mimimd` registry lookup returned 404; `@suppayami/mimimd` availability and scope permissions remain unverified; no publication performed).
- [ ] Obtain explicit permission before publishing. Publication is not an implementation task.

## Verification record

- Runtime gate: Node >=24, verified on v24.22.2 with pnpm 12.6.0; frozen installation, build, type checks, formatting/lint, 16 Vitest tests (including package smoke), and five Playwright flows pass. The initial implementation was verified on v26.13.0. Node 24 type definitions and jsdom 27.4.0 replace dependencies that assumed a newer baseline. `minimumReleaseAge: 2880` remains enforced without exemptions.
- Builds and source type checks pass. TypeScript 6.0.3 is intentionally used because the current Vue/ESLint tools reject TypeScript 7.
- `pnpm format`, `pnpm lint:fix`, `pnpm lint`, `pnpm format:check` pass. Resolved ESLint has `curly: [2, 'all']`, no active stylistic rules and Vue indentation disabled. A formatting-rule exclusion config prevents upstream Vue lint rules competing with Oxfmt.
- Vitest: 16 tests across seven files, including actual HTTP security, symlink replacement, SSE delivery, listener lifecycle, an explicit LAN-interface request, and installed-tarball execution from an unrelated working directory.
- Playwright: five flows cover history, encoded/Unicode links and images, duplicate-heading targets, keyboard mobile navigation, theme persistence, rich content, malicious renderers, offline rendering, edits/renames and refreshed image responses.
- Package smoke test runs `pnpm pack`, installs that tarball with the release-age policy, invokes its executable, and verifies UI assets/fonts/attribution. Installation needs registry access; browser rendering needs no CDN.
- Separate screenshot review at 1440×1000 and 390×844 in both modes; overflow/fallback fixture reviewed separately. Artifacts are retained in ignored `tests/.final-*.png` and `tests/.table-fixed-mobile.png`, never asserted by functional tests. Review caught and fixed dark-code styling, missing SVG diagram labels and overly narrow table wrapping.
- `node scripts/check-contrast.ts` independently checks WCAG AA palette text pairings: minimum **4.87:1 light**, **4.55:1 dark**. Light code uses palette foreground plus weight/style distinctions rather than low-contrast accents.
- CI is configured for frozen installation, formatting, lint, source type checks, build, Vitest/package smoke and Playwright. Hosted CI has not been executed here.

## Remaining limitations

- Tested platform: Linux/Chromium only. Windows/macOS and a physical second LAN device remain unverified.
- Symlinks are rejected on discovery and reads, files are revalidated after opening, and Linux checks the opened descriptor path. A directory-to-symlink replacement is tested; sustained concurrent adversarial mutation is not fully validated. Do not serve roots writable by untrusted processes.
- Visual checks covered the supplied fixtures, not every Mermaid diagram family or arbitrary author-generated content.
- Mermaid's bundled lazy chunks produce Vite size warnings; builds succeed and no external rendering assets are needed.
- Synthetic test workspaces, installed tarballs and visual captures are retained in ignored workspace paths. No destructive cleanup, publishing, credentials or model-provider calls were performed.
- Existing reference-file formatting changes were retained with explicit user approval; the added Hono skill/lock entry was preserved.

## Per-batch checks

- [x] Run task-specific behavioral checks from `tasks/plan.md`.
- [x] Run `pnpm format`, then `pnpm lint:fix`, then `pnpm lint`.
- [x] Run `pnpm format:check` and `pnpm typecheck` where the scripts are available.
- [x] Keep screenshots, CSS-value assertions, and pixel measurements outside functional tests.
- [x] Keep all fixtures synthetic and within the workspace. Do not access private files or live external services.
