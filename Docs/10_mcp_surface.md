# MCP Registry Surface

## Status

`PLACEHOLDER`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add typed MCP server projection.
- [ ] Render server identity, transport, connection state, health and tool count.
- [ ] Reserve configuration/connect actions as wrapper requests.

## Acceptance Criteria

- [ ] No MCP transport is implemented inside the UI layer.
- [ ] Connection state comes from runtime projection.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

_Confirmed PLACEHOLDER: `/mcp` → `MockPanel::Mcp` is a static two-line placeholder. No MCP-related types (server identity, transport, connection state, tool count) exist anywhere in `main.rs` yet — this module is starting from zero, unlike Evidence/Receipts which at least have a reference-id hook._

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.