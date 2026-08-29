# Session Management

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Define requests for new/list/restore/switch/close session.
- [ ] Replace local-only /new reset with runtime request contract.
- [ ] Add session list/detail projection.
- [ ] Keep durable identity runtime-owned.

## Acceptance Criteria

- [ ] Session IDs originate from runtime projection.
- [ ] Session switching/restoring is request-based.
- [ ] UI never invents durable session authority.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `SessionLineage`, `SessionStatus`, and `LbeEvent::SessionStarted` / `SessionRestored` already exist.
- `/session` opens `MockPanel::Session`, which renders `root_session_id`, `parent_session_id` (or "none"), and `origin` from `snapshot.lineage`.
- **Not yet built:** `/new` (in `handle_command`) is still a fully local reset — `self.transcript.clear(); self.phase = Phase::Welcome;` — with no wrapper request involved at all. This is exactly the "Replace local-only /new reset with runtime request contract" work item, confirmed still open. No list/switch/close requests exist in `UserRequest` yet either.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.