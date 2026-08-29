# Connectors

## Status
MISSING

## Product Relevance
SUPPORTING

## Purpose
Expose external conversation connectors such as Slack, Discord, Linear, or other chat/ticket systems while preserving LBE session authority.

## Authority Boundary
Connectors are external interaction surfaces. LBE owns session identity, tool execution, evidence, receipts, validation, and memory promotion.

## Work Items
- [ ] Add `/connectors` panel.
- [ ] Define connector provider/session/thread projections.
- [ ] Map external thread IDs to LBE session IDs.
- [ ] Add attach/detach/reconnect request contracts.
- [ ] Show connector health and last activity.
- [ ] Link connector messages to LBE turns.

## Acceptance
- [ ] External threads map to LBE sessions.
- [ ] Connector failures fail closed.
- [ ] Connector history alone is not canonical LBE memory.
- [ ] Tool requests from connectors cross LBE before execution.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
