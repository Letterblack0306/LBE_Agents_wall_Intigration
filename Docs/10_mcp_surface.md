# MCP Registry Surface

## Status

`LBE BIRDEYE AUTHORITY CONFIRMED — BACKEND MCP PROOF ACTIVE; UI PROJECTION SEQUENCED`

## Scope

This module is part of the pre-integration TUI implementation. The working MCP authority is `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`. It must remain compatible with the existing `LbeWrapper` boundary and must not create a second hashing, indexing, caching, transport, authorization, receipt, evidence, or runtime authority.

## Work Items

- [x] Add typed MCP integration projection.
- [x] Render LBE registry identity, availability, and bounded metadata.
- [x] Route `/mcp` refresh through `RefreshMcpRegistry` and `RealLbeWrapper`.
- [x] Confirm the working BirdEye stdio owner at `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`.
- [ ] Resolve the canonical capability registry.
- [x] Route BirdEye requests through the LBE governed tool command and existing ToolRegistry/R6C/R6E boundary.
- [ ] Verify BirdEye registration in the installed LBE capability registry.
- [x] Prove unregistered capability rejection at the governed LBE registry boundary (local owner tests).
- [x] Prove authorization precedes BirdEye invocation in the governed LBE path (local owner tests).
- [ ] Prove `DENY` equals zero BirdEye execution.
- [ ] Prove `ALLOW` equals exactly one invocation.
- [x] Project the LBE-generated result, receipt, and evidence envelope through the Rust adapter (local integration tests).
- [ ] Prove provider continuation.
- [ ] Prove persisted event sequence.
- [ ] Complete UI-dependent projection and installed UI acceptance after the separate UI agent completes its owned changes.

## Acceptance Criteria

- [x] No MCP transport is implemented inside the UI layer.
- [x] Registry metadata comes from the LBE capability-list projection.
- [ ] Installed interactive LBE/MCP acceptance is proven.

## Out of Scope

- MCP transport, execution, and authorization ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

The Rust projection invokes the authorized LBE product command `capabilities list --registry <path> --format json`, validates `action=capabilities.list`, `schema_version=1`, and `execution_attempted=false`, then emits `McpRegistryUpdated`. The working live MCP implementation is `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`, registered through the MCP Local stdio configuration. Its existing SHA-256 hashing, SQLite indexing, freshness, and cache services remain the authority. The Rust side must consume those results through LBE governance and must not retain a duplicate store or bypass authorization/receipt/evidence ownership.

## Completion

Source ownership and live MCP server location are confirmed. Backend/integration proof proceeds independently through the LBE-owned registry and governance seams. Keep only UI-dependent projection and installed UI acceptance sequenced behind the separate UI agent.

## Implementation checkpoint (2026-09-02)

BirdEye queries no longer launch the MCP server directly from Rust. `RealLbeWrapper::query_birdeye` now invokes the existing LBE product command `tool mcp.birdeye.<tool>`, carrying the active session, workspace, and operation identity. The LBE runtime exposes bounded BirdEye tools through its existing `ToolRegistry` and `GovernedToolOrchestrator`; R6C authorization therefore occurs before the BirdEye stdio handler, and the returned `ToolReceipt` status, receipt ID, evidence, and output are projected back into Rust events.

Validation completed: LBE focused external-capability/product/orchestration regression `75 passed`; Rust full regression `205 passed`; Rust `cargo check` passed; Python compilation passed. `cargo fmt -- --check` remains failed by pre-existing formatting differences elsewhere in the working tree. Installed MCP execution, DENY-zero, ALLOW-exactly-one, persisted event ordering, provider continuation, and installed Rust/TUI acceptance remain unproven until the configured live registry/runtime fixture is available.

## Checkpoint (2026-09-02)

LBE runtime: MCP/external capability registration and installed capability discovery remain the authority. The working MCP server is `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`, exposed through the configured stdio registry. BirdEye already owns the SHA-256 hashing, SQLite index/cache, freshness, and governed MCP surfaces. Backend/integration proof is active and must continue independently: canonical registry resolution, BirdEye registration, unregistered rejection, authorization ordering, DENY/zero execution, ALLOW/exactly-one execution, result-to-receipt-to-evidence correlation, provider continuation, and persisted event sequence. Do not duplicate BirdEye stores or bypass LBE authorization, receipt, or evidence ownership. UI-dependent projection and installed UI acceptance remain sequenced behind the separate UI agent.

