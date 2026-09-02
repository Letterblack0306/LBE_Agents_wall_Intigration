# Subagents

## Status
`PARTIAL — LBE EXTERNAL CAPABILITY REGISTRATION PASS; SUBAGENT UI/RUNTIME NOT PROVEN`

## Product Relevance
CORE FOR AGENTIC CODING

## Purpose
Expose subagent creation, status, outputs, cancellation, and authority-bound tool usage.

## Authority Boundary
The TUI requests subagent actions. LBE owns subagent lifecycle, permissions, tool routing, evidence, and receipts.

## Work Items
- [ ] Add `/subagents` panel.
- [ ] Define subagent projection: ID, role, status, current task, parent turn.
- [ ] Add spawn/cancel/message request contracts.
- [ ] Show subagent output streams and blocked states.
- [ ] Link subagent actions to tools/evidence/receipts.
- [ ] Enforce policy display for subagent tool use.

## Acceptance
- [ ] User can inspect active subagents.
- [ ] Subagent tool requests cross LBE policy.
- [ ] Parent/child session lineage is visible.
- [ ] Cancellation and failures are explicit.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: subagent registrations are governed by ToolRegistry/authorization; complete subagent lifecycle UI is not proven. Rust TUI: subagent panel remains unimplemented. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\GOVERNED_EXTERNAL_CAPABILITY_REGISTRATION_CHECKPOINT.md:32-43.

