# Transcript Viewport and Long Output

## Status

`IMPLEMENTED / LOCAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add transcript scroll offset and follow-tail state.
- [ ] Support PageUp/PageDown/Home/End.
- [ ] Preserve streaming follow-tail only when user has not scrolled upward.
- [ ] Add command/tool detail view for long stdout/stderr.

## Acceptance Criteria

- [ ] Long transcripts remain navigable.
- [ ] Streaming does not forcibly jump the user to the bottom after manual scroll.
- [ ] Large command output can be inspected without flooding the main transcript.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed MISSING: `App.transcript` is a flat `Vec<String>` with no scroll offset, follow-tail flag, or detail-view state anywhere in `main.rs`. Nothing to build on yet â€” this is a clean start._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: IMPLEMENTED / PASS — persisted provider/event history and conversation projections exist in the canonical runtime. Rust TUI: implemented local projection; live LBE event binding and PTY acceptance remain open. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\LBE_AGENT_CONVERSATION_CONTINUATION_CHECKPOINT.md:8-32.

