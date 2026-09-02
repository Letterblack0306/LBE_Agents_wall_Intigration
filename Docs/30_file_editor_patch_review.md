# File / Patch Review

## Status
`IMPLEMENTED / LOCAL TESTED — LIVE PATCH ACCEPTANCE OPEN`

## Product Relevance
CORE

## Purpose
Provide review UI for proposed edits and patches before/after governed workspace mutation.

## Authority Boundary
The TUI previews and submits accept/reject decisions. LBE owns patch application, conflict detection, policy, evidence, and receipts.

## Work Items
- [x] Add patch review panel.
- [x] Define proposed edit projection: file, expected hash, replacement content, and status.
- [x] Add patch preview and unified diff rendering for returned patches.
- [x] Add accept/reject edit request contracts.
- [x] Show stale-hash/conflict failure state through the wrapper error path.
- [x] Link edits to operation, approval, execution, evidence, and receipt IDs.
- [ ] Preserve review decisions across reconnect.

## Acceptance
- [x] User can inspect proposed edits before accepting.
- [x] Conflict/provenance state is visible.
- [x] Accept/reject routes through LBE.
- [x] Applied edits link to receipt/evidence projections; live validation/completion remains unproven.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: mutation is authorization-bound and receipt/evidence-backed. Rust TUI: patch review, accept/reject routing, identity-bound continuation, diff rendering, and receipt/evidence projection are implemented and locally tested; real writable mutation and installed completion acceptance remain open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\R6E_GOVERNED_TOOL_ORCHESTRATION_ACCEPTANCE_CHECKPOINT.md:15-27`.
