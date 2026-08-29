# Evidence Browser

## Status

`PLACEHOLDER`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add typed evidence record projection.
- [ ] Render evidence ID/type/source/origin/timestamp/status/summary.
- [ ] Link evidence records to execution/tool/session references.

## Acceptance Criteria

- [ ] Evidence is supplied by canonical runtime.
- [ ] UI does not manufacture canonical proof.
- [ ] Evidence records can be inspected from references shown in transcripts.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed PLACEHOLDER: `/evidence` → `MockPanel::Evidence` is the same two-line static placeholder as Tools/MCP. One hook already exists to build on: `LbeEvent::ToolCompleted` already carries an `evidence_ref: Option<String>`, so the reference plumbing from tool execution to an evidence record has a starting point — it's just not rendered or projected as a typed evidence record anywhere yet._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.