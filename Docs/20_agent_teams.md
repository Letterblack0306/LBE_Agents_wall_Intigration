# Agent Teams

## Status
`PARTIAL — LBE EXTERNAL/SUBAGENT REGISTRATION ONLY; TEAM PRODUCT NOT PROVEN`

## Product Relevance
ADVANCED CORE

## Purpose
Render coordinated multi-agent work: team members, task board, mailbox, mission log, dependencies, and progress.

## Authority Boundary
The TUI orchestrates display and user requests. LBE owns team/session state, task assignment, execution authorization, evidence, and receipts.

## Work Items
- [ ] Add `/team` panel.
- [ ] Define team/member/task/mailbox/mission-log projections.
- [ ] Show coordinator and specialist roles.
- [ ] Show task dependencies and status.
- [ ] Link teammate outputs to LBE turns, evidence, and receipts.
- [ ] Add start/pause/cancel request contracts.

## Acceptance
- [ ] User can inspect team state and active work.
- [ ] Inter-agent messages are visible with provenance.
- [ ] Team tasks remain authority-bound through LBE.
- [ ] Mission log survives reconnect through runtime projection.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: subagent/external capability registration is accepted, but a coordinated team/task-board product is not specified as complete. Rust TUI: teams remain unimplemented. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\GOVERNED_EXTERNAL_CAPABILITY_REGISTRATION_CHECKPOINT.md:32-43.

