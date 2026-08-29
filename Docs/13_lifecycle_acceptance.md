# Terminal Lifecycle Acceptance

## Status

`NOT_PROVEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add PTY smoke tests for normal quit, Ctrl+C, Ctrl+D and error/panic exits.
- [ ] Verify alternate screen, cursor and raw mode restoration.
- [ ] Verify resize and supported suspend/resume behavior.

## Acceptance Criteria

- [ ] Terminal state is restored after every supported exit path.
- [ ] No raw-mode or alternate-screen leakage remains.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- The underlying mechanism is already reasonable: `init_terminal()` enables raw mode + alternate screen + hides the cursor and installs a panic hook that restores both (`alternate_screen(false)` + `cursor_visible(true)`) before unwinding; `restore_terminal()` does the same on normal exit. Ctrl+C and Ctrl+D are both handled explicitly in `handle_key`.
- **Not yet built:** none of this is exercised by a PTY-driven test — there's no automated proof that quit / Ctrl+C / Ctrl+D / a panic actually leave the terminal clean, which is exactly why this is `NOT_PROVEN` rather than `MISSING`: the code looks right, it just isn't verified.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.