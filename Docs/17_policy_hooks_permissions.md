# Permissions / Policy / Sandbox

## Status
`IMPLEMENTED / LOCAL TESTED — LIVE AUTHORIZATION ACCEPTANCE OPEN`

## Product Relevance
CORE

## Purpose
Expose the authorization, policy-hook, and sandbox state needed for governed coding work without moving enforcement into the TUI.

## Authority Boundary
The TUI renders and requests permission decisions. LBE owns policy evaluation, sandboxing, authorization, escalation, and audit truth.

## Work Items
- [x] Project authorization state through the existing account/status surface.
- [ ] Add dedicated `/permissions` panel.
- [ ] Add sandbox status projection.
- [x] Project policy decision status and rationale.
- [x] Show allow/deny/requires-approval state by tool/action.
- [x] Show approval prompts and explanations.
- [x] Link permission decisions to operation/approval identity and receipt/evidence projections.
- [x] Fail closed when policy state is unavailable.

## Acceptance
- [ ] User can inspect the complete current permission/sandbox state.
- [x] Tool approval requirements are visible before execution.
- [x] Denied actions explain the policy rationale supplied by LBE.
- [x] TUI cannot bypass LBE policy enforcement.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: R6C authorization and R6E governed dispatch are accepted. Rust TUI: patch approval review, authorization-required/allow/deny projection, identity checks, and fail-closed continuation are implemented and locally tested; dedicated permissions/sandbox projection and installed live approval acceptance remain open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\R6E_GOVERNED_TOOL_ORCHESTRATION_ACCEPTANCE_CHECKPOINT.md:17-27`.
