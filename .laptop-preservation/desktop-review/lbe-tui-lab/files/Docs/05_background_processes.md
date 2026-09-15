# Background and Detached Processes

## Status

`PARTIAL — LBE OWNER EXISTS; RUST LIVE PROJECTION PENDING`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add /processes panel.
- [x] Project command ID, state, source tool call, latest activity, exit code, log availability.
- [x] Add detail view for detached process logs/progress.

## Acceptance Criteria

- [x] Detached commands are discoverable after leaving the initiating transcript position.
- [x] UI remains projection-only and does not manage OS processes directly.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- The event model is mostly already there: `CommandStarted`, `CommandStdoutDelta`, `CommandStderrDelta`, `CommandCompleted`, `CommandFailed`, `CommandDetached`, `DetachedCommandProgress`, `DetachedCommandCompleted`, `DetachedLogAvailable` all exist on `LbeEvent`, and `reduce_lbe_event` already turns the non-detached ones into transcript lines (covered by the `execution_projects_checkpoint_and_command_streams_without_spawning_a_process` test).
- `/processes` now opens a projection-only panel showing the latest command ID,
  source tool call, lifecycle state, latest activity, exit code, and detached-log
  availability. The panel does not control operating-system processes.
- The panel includes a bounded detached detail view retaining the latest 32
  stdout/stderr/progress/error/lifecycle entries.
- The connected panel header now identifies an authoritative LBE process projection; disconnected mode remains explicitly unavailable.
- Focused process projection tests and connected-state panel tests pass; full Rust suite: `201 passed`.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: process/runtime owners exist and governed execution is accepted. Rust TUI: detached-process projection and connected-state labeling exist locally; live process event binding and installed acceptance remain pending. Evidence: `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\PROJECT_INDEX.md:14-18`.
