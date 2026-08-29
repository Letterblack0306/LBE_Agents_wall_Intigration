# Terminal Compatibility

## Status

`MISSING`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add NO_COLOR handling.
- [ ] Add ASCII fallback tokens.
- [ ] Verify terminal-cell-width handling for CJK, emoji and combining characters.
- [ ] Test long paths/model names.

## Acceptance Criteria

- [ ] State remains understandable without color.
- [ ] ASCII-only terminals remain usable.
- [ ] Wide characters do not corrupt layout.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed MISSING: no `NO_COLOR` check, no ASCII-fallback token path, and no explicit wide-character (CJK/emoji/combining) width handling anywhere in `main.rs`. All colors come straight from the fixed `PALETTE` constant with no override path._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.