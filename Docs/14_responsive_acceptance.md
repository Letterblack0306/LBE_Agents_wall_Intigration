# Responsive and Minimum-Size Acceptance

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE TERMINAL ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add pinned render tests at 60x18 and 80x24 for populated states.
- [x] Test provider/model/doctor/session panels at narrow widths.
- [x] Test long workspace paths and model names.
- [x] Confirm explicit too-small behavior remains truthful.

## Acceptance Criteria

- [x] Main populated screens are usable at the declared minimum.
- [x] Overflow/truncation behavior is deterministic.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- Pinned render tests cover 80×24 welcome, 60×18 compact, 80×18 compact-height, and 59×17 too-small fallback behavior.
- `populated_panels_render_without_overflow_at_the_compact_terminal_size` covers provider, model, doctor, and session panels at 60×18.
- `truncate_text` tests cover wide CJK characters and long ASCII labels using terminal cell width.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: canonical Textual interface is accepted. Rust TUI: local populated narrow-width, minimum-size, and long-name acceptance is implemented; external PTY/ConPTY acceptance remains open. Evidence: `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\LBE_INTERFACE_PRODUCT_SURFACE_CHECKPOINT.md:9-32`.
