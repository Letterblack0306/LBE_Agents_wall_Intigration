# Conversation Handoff

## Status
`PARTIAL — LBE SESSION PERSISTENCE PASS; HANDOFF PRODUCT NOT PROVEN`

## Product Relevance
CORE FOR MULTI-CLIENT USE

## Purpose
Support exporting, importing, and resuming conversations across TUI, browser, IDE, or other LBE clients.

## Authority Boundary
The TUI creates/consumes handoff requests. LBE owns canonical session identity, turn history, memory, receipts, and completion state.

## Work Items
- [ ] Add `/handoff` and `/resume` flows.
- [ ] Define handoff package projection.
- [ ] Add export/import/resume request contracts.
- [ ] Show source client, target client, session ID, and session hash.
- [ ] Link handoff to memory checkpoints.
- [ ] Validate stale/conflicting handoff state.

## Acceptance
- [ ] User can resume a known LBE session.
- [ ] Handoff preserves session/turn identity.
- [ ] External transcript is not canonical unless imported by LBE.
- [ ] Conflicting handoffs are blocked or explained.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: persisted session identity/resume is accepted. A cross-client handoff package/export contract is not proven in the current evidence. Rust TUI: handoff UI remains unimplemented. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\SESSION_APPLICATION_CONTRACT_UNIFICATION_CHECKPOINT.md:28-51.

