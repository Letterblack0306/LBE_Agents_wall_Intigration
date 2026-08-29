# Responsive and Minimum-Size Acceptance

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add pinned render tests at 60x18 and 80x24 for populated states.
- [ ] Test provider/model/doctor/session panels at narrow widths.
- [ ] Test long workspace paths and model names.
- [ ] Confirm explicit too-small behavior remains truthful.

## Acceptance Criteria

- [ ] Main populated screens are usable at the declared minimum.
- [ ] Overflow/truncation behavior is deterministic.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- Two pinned render tests already exist and cover exactly the two sizes named in the work items: `welcome_frame_renders_the_supplied_logo_at_80_by_24` (populated-state, 80×24) and `below_minimum_size_shows_an_honest_fallback` (59×17, confirms the "LBE terminal needs at least 60×18" message).
- **Not yet built:** no narrow-width tests for the provider/model/doctor/session panels specifically (only the welcome screen is pinned), and no long-workspace-path / long-model-name test yet.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.