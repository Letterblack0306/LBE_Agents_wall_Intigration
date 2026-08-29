# Tool Registry Surface

## Status

`PLACEHOLDER`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add typed tool registry projection.
- [ ] Render name, description, owner/source, risk, enabled state, approval requirement.
- [ ] Add read-only detail view.

## Acceptance Criteria

- [ ] Tool policy remains runtime-owned.
- [ ] UI does not grant permissions.
- [ ] Risk/approval state is visible without relying on color alone.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed PLACEHOLDER: `/tools` opens `MockPanel::Tools`, but `mock_panel_text` renders only two static lines ("MOCK / NOT CONNECTED" + one sentence) — no typed tool registry, no per-tool rows, nothing derived from `snapshot`. Matches the status label exactly._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.