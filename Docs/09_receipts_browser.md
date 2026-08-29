# Receipt Browser

## Status

`PLACEHOLDER`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add structured receipt projection.
- [ ] Render receipt ID, execution ID, authorization, execution, validation and completion state.
- [ ] Expose evidence references attached to receipts.

## Acceptance Criteria

- [ ] Receipts remain canonical runtime artifacts.
- [ ] UI presents rather than generates receipt truth.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed PLACEHOLDER: `/receipts` → `MockPanel::Receipts` is a static two-line placeholder that currently hardcodes a fake reference ("Mock receipt rcpt_demo_7f31 is not a canonical receipt.") rather than reading from a real projection. `receipt_id: Option<String>` already exists on both `ExecutionCompleted` and `LbeCompletionAccepted`, so — like evidence — the reference hook exists but there's no structured receipt type or list/detail rendering yet._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.