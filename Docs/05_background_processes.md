# Background and Detached Processes

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add /processes panel.
- [ ] Project command ID, state, source tool call, latest activity, exit code, log availability.
- [ ] Add detail view for detached process logs/progress.

## Acceptance Criteria

- [ ] Detached commands are discoverable after leaving the initiating transcript position.
- [ ] UI remains projection-only and does not manage OS processes directly.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- The event model is mostly already there: `CommandStarted`, `CommandStdoutDelta`, `CommandStderrDelta`, `CommandCompleted`, `CommandFailed`, `CommandDetached`, `DetachedCommandProgress`, `DetachedCommandCompleted`, `DetachedLogAvailable` all exist on `LbeEvent`, and `reduce_lbe_event` already turns the non-detached ones into transcript lines (covered by the `execution_projects_checkpoint_and_command_streams_without_spawning_a_process` test).
- **Not yet built:** there's no `/processes` command or panel — once a command's output scrolls out of the transcript it isn't discoverable again, which is the actual acceptance criterion this module is tracking, not the event plumbing.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.