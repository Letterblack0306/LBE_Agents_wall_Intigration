# Tool Registry Surface

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE REGISTRY ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add a bounded projection of the latest runtime-derived tool request.
- [x] Render tool name, input summary, risk, and lifecycle state.
- [x] Add read-only detail view.

## Acceptance Criteria

- [x] Tool policy remains runtime-owned.
- [x] UI does not grant permissions.
- [x] Risk/approval state is visible without relying on color alone.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `/tools` now projects the latest runtime-derived tool request, including tool
  name, input summary, risk, and lifecycle state.
- The read-only detail includes the observed tool-call ID and explicitly states
  that the request view grants no permission.
- The panel explicitly states that authorization and permissions remain runtime-
  owned; it does not grant capability or construct a canonical registry.
- Connected-state labeling now distinguishes an authoritative LBE tool projection from an unavailable/disconnected projection without granting permission locally.
- Focused connected-panel projection tests pass; the current full Rust suite is `201 passed`.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: ToolRegistry, GovernedToolOrchestrator, authorization, idempotency, receipts, and continuation are PASS. Rust TUI: typed request/risk/authorization projection and connected authoritative-state labeling are implemented and locally tested; installed live registry/event acceptance remains open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\R6E_GOVERNED_TOOL_ORCHESTRATION_ACCEPTANCE_CHECKPOINT.md:15-47,58-94`.
