# Plain / Non-TUI Mode Contract

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE GOVERNED COMPLETION ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Define --no-tui or equivalent command path.
- [x] Reserve stdout for results.
- [x] Reserve stderr for diagnostics.
- [x] Define meaningful exit-code contract.

## Acceptance Criteria

- [x] Automation can use the client without alternate-screen UI.
- [x] TUI output never corrupts machine-readable stdout.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

`src/main.rs` parses `run` and `--no-tui` before terminal initialization. The headless path emits structured JSON events/results on stdout, writes diagnostics to stderr, returns `0` for completed work, `2` for approval-required work, and `1` for runtime/error/timeout outcomes. Prompt parsing and machine-readable event/result serialization are covered by the Rust tests. Live governed completion remains dependent on the configured LBE runtime.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: installed CLI/product entry and non-TUI commands are accepted. Rust TUI: `--no-tui`/headless routing and output contract are implemented and locally tested; live governed completion remains runtime-dependent. Evidence: `C:\LBE-TUI-Lab\src\main.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\FIRST_RUN_LIVE_SESSION_ENTRY_CHECKPOINT.md:9-18`.
