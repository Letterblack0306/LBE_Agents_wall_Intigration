# Checkpoint Compare and Restore Requests

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add CompareCheckpoint and RestoreCheckpoint request contracts.
- [ ] Render checkpoint list/detail.
- [ ] Render comparison results before restore.
- [ ] Render restored/blocked outcomes.

## Acceptance Criteria

- [ ] UI never mutates workspace directly.
- [ ] All restore operations route through LbeWrapper.
- [ ] Blocked restore reasons are visible.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `CheckpointDescriptor`, `LbeSnapshot.latest_checkpoint`, and the full event set (`CheckpointCreated`, `CheckpointComparisonReady`, `CheckpointRestoreRequested`, `CheckpointRestoreBlocked`, `CheckpointRestored`) already exist on `LbeEvent`.
- Both `/undo` and `/checkpoints` open `MockPanel::Undo`, which renders `checkpoint_id`, `created_at`, and changed-file count when `latest_checkpoint` is set (falls back to an honest "No checkpoint has been created" message otherwise).
- **Not yet built:** no `UserRequest` variants for compare/restore exist — the panel can only display a checkpoint that arrived via an event, it can't ask the wrapper to compare or restore one. That's the actual gap against the acceptance criteria, not the projection/rendering.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.