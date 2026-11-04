# mimimd implementation checklist

Specification: `docs/specs/markdown-reader.md`.
Detailed tasks and verification: `tasks/plan.md`.

Planning is complete. Implementation has not started. Check off a task only after its acceptance criteria and verification pass.

## Phase 1: prerequisites and tooling
- [ ] 1. Verify Node.js >=26.13.0 and establish pnpm with `minimumReleaseAge: 2880`.
- [ ] 2. Configure approved Oxfmt settings, Antfu ESLint options, and exact format/lint scripts.
- [ ] Checkpoint A: resolve runtime/tooling blockers without lowering the baseline.
- [ ] 3. Compile the server entry and implement the CLI argument contract.
- [ ] 4. Build the Vue 3.5/Vite shell with scoped component CSS.
- [ ] 5. Configure Vitest, `@testing-library/vue`, Vue type checking, and Playwright.
- [ ] Checkpoint B: pass builds, available tests, lint, formatting, and type checks.

## Phase 2: safe single-file reading
- [ ] 6. Implement shared root-access checks and recursive document indexing.
- [ ] 7. Render safe CommonMark/GFM with unique heading IDs.
- [ ] 8. Serve a single document end to end, including startup/shutdown and local/LAN behavior.
- [ ] Checkpoint C: demonstrate safe single-file reading.

## Phase 3: theme and navigation
- [ ] 9. Verify Everforest Medium provenance and implement dual-theme Shiki highlighting.
- [ ] 10. Apply reader styling, theme persistence, and accessible controls.
- [ ] 11. Add Vue Router, recursive file navigation, filtering, and history.
- [ ] Checkpoint D: review both themes and keyboard folder navigation.
- [ ] 12. Resolve Markdown links and serve only permitted local assets.
- [ ] 13. Add heading navigation and responsive keyboard-accessible controls.
- [ ] Checkpoint E: verify links, assets, heading fragments, and focus behavior.

## Phase 4: rich content and live updates
- [ ] 14. Add safe KaTeX math and local assets.
- [ ] 15. Add secure Mermaid rendering and theme updates.
- [ ] 16. Add filesystem watching, event delivery, and live content/tree updates.
- [ ] Checkpoint F: exercise rich content, theme changes, and live reload together.

## Phase 5: security and distribution
- [ ] 17. Verify adversarial HTTP/content fixtures and preserve legitimate LAN access.
- [ ] 18. Validate the installed tarball, add usage documentation, and establish CI checks.
- [ ] Checkpoint G: review all eleven specification success criteria.
- [ ] Complete separate desktop/mobile visual and contrast review in both themes.
- [ ] Record remaining platform/runtime limitations and confirm registry naming.
- [ ] Obtain explicit permission before publishing. Publication is not an implementation task.

## Per-batch checks
- [ ] Run task-specific behavioral checks from `tasks/plan.md`.
- [ ] Run `pnpm format`, then `pnpm lint:fix`, then `pnpm lint`.
- [ ] Run `pnpm format:check` and `pnpm typecheck` where the scripts are available.
- [ ] Keep screenshots, CSS-value assertions, and pixel measurements outside functional tests.
- [ ] Keep all fixtures synthetic and within the workspace. Do not access private files or live external services.
