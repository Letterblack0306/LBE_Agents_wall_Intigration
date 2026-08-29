# Agent Teams

## Status
MISSING

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
