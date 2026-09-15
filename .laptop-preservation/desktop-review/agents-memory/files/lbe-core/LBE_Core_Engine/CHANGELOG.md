# Changelog

## 1.3.42

- Release the approved public SDK release-hygiene fix as the next patch version without moving historical `v1.3.41`.
- Regenerate public package artifacts for `1.3.42` and align the README approval marker to the new package version.
- Update release metadata and validation expectations to treat `1.3.41` as historical published bits.

## 1.3.41

- Version bump from 1.3.40 to 1.3.41
- PUBLIC_README_APPROVAL.json updated with new SHA-256 for version 1.3.41
- RELEASE_SCOPE.md updated to reflect v1.3.41
- test/cli-tui.test.js updated to expect version 1.3.41 from generated public CLI

## 1.3.40

- Fix: `scripts/build-public-sdk.mjs` — corrected `\\n` escapes in `showHeader()` template literal (single `\n` produced raw newline bytes that broke the JS parser in generated `dist/cli.js`)
- Fix: `scripts/build-public-sdk.mjs` — `publicPackageVersion` now properly interpolated with `${}` in generated output
- Fix: `src/cli/tui.js` — removed MENU_ITEMS variable-name leak from display text and comments
- Rebuilt `release-public/dist/cli.js` verified parse-clean
- `npx lbe`, `npx lbe init`, `npx lbe status`, `npx lbe proof` all verified working from fresh install
- README version bumped to 1.3.40 across all surfaces

## 1.3.39

- ISSUE-0039: Public strings single source of truth — all CLI labels, help text, and TUI prompts now import from `src/cli/public-strings.js` with plain language that does not reveal internal architecture
- ISSUE-0039: Root README rewritten as professional product page with sections (Why, What, Who, How, Limits, Flow, Install, Menu) and no method-revealing terms
- ISSUE-0039: `release/README.md` template removed; `build-public-sdk.mjs` now copies root README directly as single source
- ISSUE-0037: Test timeout hardening — `npm test`, `test:unit`, `test:release` use `--test-timeout=120000` with explicit file lists excluding slow `security-invariants.test.js`
- Release hygiene gate: `release:check` blocks publish unless version/files/docs/CLI/tests agree
- CLI routing fixes: audit-workspace handler, remove command
- ISSUE-0038: Fixed private workspace path leak in `docs/RELEASE_PLAYBOOK.md`
- Version alignment across all artifacts

## 1.3.37 — 2026-07-02

- Releases ISSUE-0022 reliability hardening as a forward version without moving `v1.3.36`.
- Adds bounded child-process execution in governance, release, and publish gates.
- Makes audit hash handling fail closed when prior log state cannot be trusted.
- Improves atomic write wait fallback, failed run exit-code handling, and assert-consumer failure behavior.
- Keeps the public README intro reviewed and regenerates the public SDK artifacts for `1.3.37`.

## 1.3.32

- Fixes tagged release workflow by allowing release-mode public SDK packaging on detached HEAD checkouts.
- Preserves artifact-only release authority from 1.3.31.
- No runtime behavior change.

## 1.3.31

* Enforces artifact-only release authority.
* Publishes from generated release artifacts, not repo root.
* Adds npm pack proof for forbidden paths and forbidden public text markers.
* Keeps public mirror sync and npm package contents as separate release surfaces.
* Fixes release workflow install path and public artifact validation.

## 1.3.29 — 2026-06-25

### Changed
- Expanded public mirror README with problem statement, target audience, use cases, why-local-first rationale, and scope boundaries. Previously documented only the technical surface.

## 1.3.28 — 2026-06-25

### Fixed
- Fixed public mirror README source: updated `release/README.md` (the template read by `build-public-sdk.mjs`) instead of `release-public/README.md` which is overwritten at build time. README now accurately documents the 6 real CLI commands, programmatic API, request/response shape, and package contents.

## 1.3.27 — 2026-06-25

### Changed
- Rewrote public mirror README to accurately reflect the 6 real CLI commands, programmatic API, request/response shape, and what ships in the package. Removed all phantom commands and stale package references.

## 1.3.26 — 2026-06-25

### Fixed
- Version bump to clear npm E403 conflict from incomplete 1.3.25 publish (sync step failed after npm publish succeeded).

## 1.3.25 — 2026-06-25

### Fixed
- Replaced `tar -tf` with `npm pack --json` file list in package runtime verification to fix cross-platform path failures on Windows network drives (`Z:`).

## 1.3.24 — 2026-06-24

### Fixed
- Fixed internal linting errors preventing clean CI execution.
- Restored and aligned the GitHub Actions release workflow.

## 1.3.3 — 2026-06-23

### Fixed
- Rebuilt the docs-aligned release from a committed tree so the npm artifact
  gitHead matches the release commit.

## 1.3.2 — 2026-06-23

### Fixed
- Aligned the public README surfaces and release docs with the shipped
  `@letterblack/lbe-core` package and current CLI commands.

## 1.3.1 — 2026-06-23

### Fixed
- Re-aligned the release branch and published package lineage after the 1.3.0
  tag/artifact mismatch was detected.

## 1.3.0 — 2026-06-23

### Added
- Central local workspace state, proof summaries, and one-time import of legacy
  `.lbe/events.jsonl` entries while preserving the original local log.

## 1.2.0 — 2026-06-20

### Added
- **Real JS governance engine** — `createLBE()` now uses the full 7-gate validation pipeline (schema — key lifecycle — timestamp skew — rate limit — nonce replay — policy) with backup, rollback, and audit. Previously backed by a thin WASM wrapper.
- **Observer mode** — `createLBE({ mode: 'observe' })` or `npx lbe observe`. All gates run silently, audit log is written, nothing is blocked. Default for new and half-built projects.
- **Policy file** (`lbe.policy.json`) — human-readable rule store per project. Records `effect`, `type`, `pattern`, the original user message (`from`), and timestamp (`at`). Deny always wins over allow.
- **New CLI commands:**
  - `npx lbe observe` — switch to observer mode
  - `npx lbe enforce` — switch to enforcement mode
  - `npx lbe policy` — list all rules with source context
- **Universal CLI interface** — non-JS projects (Python, Rust, Go, any language) can pipe JSON to `npx lbe execute`. Exit 0 = allowed, exit 1 = denied, exit 2 = error.
- **Language-agnostic design** — WASM runtime path documented as the path to non-JS bindings. JS engine is the current production runtime.

### Changed
- `LBEResult` now includes `commandId`, `stage`, `risk`, `output` fields.
- `LBEOptions` removes `policy_mode` / `timeout_ms` — these are managed by the governance engine internally.
- `wrapTools().dispatch()` now returns `Promise<LBEResult>` (async) to match the real engine contract.
- Types updated throughout to reflect observer mode result shape (`LBEObservedResult`).

---

## 1.0.4 — 2026-06-19

### Removed
- MCP execution surface — `lbe-mcp` command, MCP adapter, and configuration examples removed.
  An MCP server only offers LBE as one optional tool; agent hosts with native tools can act outside that boundary, so it cannot enforce the governance boundary. See `docs/decisions/ADR-001-remove-mcp-execution-surface.md`.
- HTTP server surface — `lbe-serve` command and HTTP adapter removed.
  An HTTP endpoint replicates governance in a separate process and creates a second attack surface without guaranteeing the calling agent routes through it. See `docs/decisions/ADR-002-remove-http-server-surface.md`.

### Changed
- Established SDK-only product boundary: LBE ships as one local SDK and CLI embedded in the caller's application. No daemon, host platform, Docker deployment, or companion system. See `docs/decisions/ADR-003-sdk-only-product-boundary.md`.
- Workspace pruned to SDK-only source; all optional execution surfaces removed from `src/`, `bin/`, and CI config.
- Public package identity (`LBE_PUBLIC_PACKAGE_NAME`, `LBE_PUBLIC_PACKAGE_VERSION`) is now parameterised via environment variables in the build script.
- Test command made portable across Node.js versions (no `--experimental-vm-modules` flag needed).

### Public surface
The public package (`@letterblack/lbe-sdk`) exports exactly one function:

```ts
export function execute(input: string): string;
```

No server, daemon, MCP surface, or optional execution layer ships in the public package.

---

## 1.0.3 and earlier

Pre-release development. No public changelog maintained.
