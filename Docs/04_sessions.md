# Session Management

## Status

`IMPLEMENTED / LBE OWNER PASS; RUST ADAPTER PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Define requests for close session.
- [x] Replace local-only /new reset with runtime request contract.
- [x] Add session list/detail projection.
- [x] Keep durable identity runtime-owned.

## Acceptance Criteria

- [x] Session IDs originate from runtime projection.
- [x] Session switching/restoring is request-based.
- [x] UI never invents durable session authority.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `SessionLineage`, `SessionStatus`, and `LbeEvent::SessionStarted` / `SessionRestored` already exist.
- `/session` and `/sessions` open `MockPanel::Session`; `/sessions` requests runtime-owned session summaries and renders bounded ID/status/parent rows.
- `/new`, `/sessions`, `/resume <session_id>`, and `/close <session_id>` dispatch runtime-owned requests. Closing the active session is rejected without a replacement. The mock wrapper emits runtime-owned session identity, parent lineage, summaries, restore, and close events. The real wrapper remains fail-closed while disconnected.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: IMPLEMENTED / PASS — LbeSessionService, SessionMemoryRuntimeBridge, WorkspaceMemoryStore, and PersistentTurnControl own lifecycle. Rust TUI: contracts/local projection exist, but direct live service/event integration remains pending. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\SESSION_APPLICATION_CONTRACT_UNIFICATION_CHECKPOINT.md:28-47,53-79.

