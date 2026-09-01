# MCP Registry Surface

## Status

`PROVEN — RUST METADATA PROJECTION; INSTALLED INTERACTIVE ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add typed MCP integration projection.
- [x] Render LBE registry identity, availability, and bounded metadata.
- [x] Route `/mcp` refresh through `RefreshMcpRegistry` and `RealLbeWrapper`.

## Acceptance Criteria

- [x] No MCP transport is implemented inside the UI layer.
- [x] Registry metadata comes from the LBE capability-list projection.
- [ ] Installed interactive LBE/MCP acceptance is proven.

## Out of Scope

- MCP transport, execution, and authorization ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

The Rust projection now invokes the authorized LBE product command `capabilities list --registry <path> --format json`, validates `action=capabilities.list`, `schema_version=1`, and `execution_attempted=false`, then emits `McpRegistryUpdated`. `App` atomically retains the schema version and integration metadata, and `/mcp` renders metadata-only rows. The Rust side does not retain MCP transport, execution, authorization, credential plaintext, or registry authority.

## Completion

Source implementation, live wrapper attachment, live metadata refresh, and Rust contract tests are complete. Keep this module open until installed interactive LBE/MCP acceptance is demonstrated.

## Checkpoint (2026-09-01)

LBE runtime: MCP/external capability registration and installed capability discovery are PASS. The authoritative `capabilities list --registry <path> --format json` command returned `schema_version=1`, `count=0`, `integrations=[]`, and `execution_attempted=false` for the verified registry path. Rust TUI: the metadata-only bridge, retained state projection, and dynamic `/mcp` rendering are implemented; configured `RealLbeWrapper` attachment and MCP refresh passed live wrapper checks, and the Rust suite passed 178 tests. Installed interactive `/mcp` PTY/E2E acceptance remains NOT PROVEN; the active P2/P3 gate remains OPEN.

