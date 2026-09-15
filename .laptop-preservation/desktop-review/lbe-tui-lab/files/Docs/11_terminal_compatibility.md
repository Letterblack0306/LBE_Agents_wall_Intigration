# Terminal Compatibility

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE TERMINAL ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add NO_COLOR handling.
- [x] Add ASCII fallback tokens.
- [x] Verify terminal-cell-width handling for CJK, emoji and combining characters.
- [x] Test long paths/model names through bounded truncation coverage.

## Acceptance Criteria

- [x] State remains understandable without color.
- [x] ASCII-only terminals remain usable.
- [x] Wide characters do not corrupt layout.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

`src/ui.rs` now detects `NO_COLOR`, clears rendered cell styles after drawing, provides explicit ASCII token fallbacks through `LBE_ASCII`, and truncates text using `unicode-width` cell measurements. The Rust tests cover ASCII tokens, wide-character truncation, long text bounds, and truthful minimum-size behavior. External terminal/PTY lifecycle acceptance remains separate and open.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: canonical interface product surface is accepted. Rust TUI: NO_COLOR handling, ASCII fallback, Unicode-width truncation, and local compatibility tests are implemented; external PTY/ConPTY lifecycle acceptance remains open. Evidence: `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\LBE_INTERFACE_PRODUCT_SURFACE_CHECKPOINT.md:5-32`.
