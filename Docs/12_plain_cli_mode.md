# Plain / Non-TUI Mode Contract

## Status

`MISSING`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Define --no-tui or equivalent command path.
- [ ] Reserve stdout for results.
- [ ] Reserve stderr for diagnostics.
- [ ] Define meaningful exit-code contract.

## Acceptance Criteria

- [ ] Automation can use the client without alternate-screen UI.
- [ ] TUI output never corrupts machine-readable stdout.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed MISSING: `main()` unconditionally calls `init_terminal()` and enters the alternate screen — there is no argument parsing and no non-TUI code path at all. Anything routed to stdout today would collide with the alternate-screen UI._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.