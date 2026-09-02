# Receipt Browser

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE RECEIPT ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add structured receipt projection.
- [x] Render receipt ID, source, session/execution/tool, status, and evidence reference.
- [x] Expose evidence references attached to receipts.

## Acceptance Criteria

- [x] Receipts remain canonical runtime artifacts.
- [x] UI presents rather than generates receipt truth.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

The former fake-reference placeholder has been replaced. `App` retains typed `ReceiptProjection` records from workspace, execution, and conversational tool events, de-duplicates them by receipt ID, and `/receipts` renders the canonical receipt/evidence references. Connected-state labeling and receipt empty-state handling are also locally tested; installed live receipt retrieval and full completion acceptance remain open.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: ToolReceipt lifecycle and receipt-backed continuation are accepted. Rust TUI: structured receipt projection, local rendering, connected-state labeling, and receipt empty-state handling are implemented and tested; installed live receipt retrieval and completion acceptance remain open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\R6E_GOVERNED_TOOL_ORCHESTRATION_ACCEPTANCE_CHECKPOINT.md:20-27,65-85`.
