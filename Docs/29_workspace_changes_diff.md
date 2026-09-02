# Workspace Changes / Diff

## Status
`IMPLEMENTED / LOCAL TESTED — LIVE WRITABLE ACCEPTANCE OPEN`

## Product Relevance
CORE

## Purpose
Show changed files, workspace/git status, diff summaries, hunks, accepted/rejected changes, and validation/checkpoint relationships.

## Authority Boundary
The TUI renders workspace-change projections and requests actions. LBE/tool layer owns workspace inspection, mutation, checkpoints, and validation truth.

## Work Items
- [x] Add `/changes` and `/diff` panel.
- [x] Define workspace status and patch projections.
- [x] Show changed-file and diff summary metadata.
- [x] Render file-level unified patch content with add/remove styling.
- [x] Show accepted/rejected/pending change state.
- [x] Link changes to evidence and receipt references.
- [x] Retain checkpoint compare request contracts.

## Acceptance
- [x] User can inspect projected workspace changes.
- [ ] Full file/hunk navigation is not yet proven; current UI renders the authoritative unified patch.
- [x] Change provenance is visible.
- [x] TUI does not mutate workspace outside LBE requests.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: governed mutation, receipts, evidence, checkpoints, and interface diff projections are accepted. Rust TUI: changes/diff projection and local rendering are implemented and tested; live writable mutation, complete hunk navigation, and installed acceptance remain open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\LBE_INTERFACE_CONTROL_EVIDENCE_SURFACES_CHECKPOINT.md:34-49`.
