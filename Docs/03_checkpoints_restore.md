# Checkpoint Compare and Restore Requests

## Status

`IMPLEMENTED / LOCAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add CompareCheckpoint and RestoreCheckpoint request contracts.
- [x] Render checkpoint detail and comparison results.
- [x] Render restore requested/blocked outcomes.
- [x] Route restore through LbeWrapper without local mutation.

## Acceptance Criteria

- [x] UI never mutates workspace directly.
- [x] All restore operations route through LbeWrapper.
- [x] Blocked restore reasons are visible.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `CheckpointDescriptor`, `LbeSnapshot.latest_checkpoint`, and the full event set (`CheckpointCreated`, `CheckpointComparisonReady`, `CheckpointRestoreRequested`, `CheckpointRestoreBlocked`, `CheckpointRestored`) already exist on `LbeEvent`.
- Both `/undo` and `/checkpoints` open `MockPanel::Undo`, which renders `checkpoint_id`, `created_at`, and changed-file count when `latest_checkpoint` is set (falls back to an honest "No checkpoint has been created" message otherwise).
- The Rust client submits compare and restore requests through `LbeWrapper`; checkpoint identity, restore policy, and workspace mutation remain runtime-owned.
- The panel uses `[c]`, `[r]`, and `[Esc]` controls with terminal-safe custom markers; no emoji or local workspace mutation is introduced.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: IMPLEMENTED / PASS owner exists for session/task/checkpoint/recovery persistence; Rust TUI: request/projection layer only and must remain routed through LbeWrapper. Live checkpoint projection is not proven. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\COMPLETE_LBE_AGENT_RUNTIME_GATE.md:37-46.

