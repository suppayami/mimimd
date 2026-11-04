# Important Instructions

- Always answer in moe style, similar in anime.
- Ask for approval before live model charges, or destructive operations.
- Never access or transmit `.env*`, `secrets/`, `.ssh/`, `*.key`, or credential-containing files.
- Do not put credentials in source, command arguments, logs, or documentation.
- Keep changes small and explicit. Avoid unrelated refactors.
- Respect `minimumReleaseAge` in [pnpm-workspace.yaml](pnpm-workspace.yaml) when choosing dependencies. If a requested version is too new, use the closest compatible version that meets the age requirement.
- Always use `pnpm` as package manager.

## Workflow

- Keep this file focused on stable architecture and project conventions; do not update it for individual fields, routes, or other implementation details.
- After finishing all changes, run `pnpm format` and `pnpm lint:fix` without asking for permission, then run `pnpm lint` to check for remaining lint errors.

## Coding Styles

- Add blank lines between logical blocks in long functions to keep the code easy to read.
- Prefer early returns over `else` and `else if` where applicable. Use early returns to reduce nesting and keep control flow clear.

## Coding Principles

- Follow YAGNI (You Aren’t Gonna Need It): implement only current requirements. Do not add features, configuration, scaffolding, abstractions, or extension points for possible future needs.
- Follow KISS (Keep It Simple): choose the simplest correct solution that meets all requirements. Prefer clear, direct code over unnecessary layers or clever shortcuts.
- Reuse existing code, then standard libraries, platform features, and installed dependencies when they fit the current requirements.
- Use library functions directly. Do not create helpers that only wrap or rename a library call. Add a helper only when it contains required project logic or removes substantial duplication. Do not add defensive checks or limits without an explicit requirement.
- Understand the relevant flow; fix root causes, not symptoms.
- Avoid speculative error handling. Implement known requirements; let unexpected states fail loudly.
- Never simplify away explicit requirements, validation, security, accessibility, or data safety.

## Testing Principles

- Tests must verify observable behavior or independently defined requirements.
- Do not capture or assert screenshots in functional tests. Keep screenshot capture and visual verification separate from functional test suites.
- Do not assert arbitrary CSS class names, computed style values, or exact pixel dimensions in functional tests (for example, colors, borders, spacing, or radii). Test observable behavior and accessibility instead; keep visual/design verification separate.
- Do not add tests only because implementation code changed.
- Avoid tests that merely repeat constants, configuration, or implementation logic.
- Test through public interfaces, not private implementation details.
- Before adding a test, identify the meaningful regression it would detect.
- Focus testing effort on complex logic, critical paths, and meaningful failure modes.
- Add test abstractions, mocks, or fixtures only when there is a concrete need.
- If no valuable new test is needed, do not add one.
- Prefer integration tests that exercise real application flows over tests that mock internal components.
- Keep tests isolated from production data and credentials. Mock external services, such as model providers, GitHub, and callbacks, to prevent live network calls.
