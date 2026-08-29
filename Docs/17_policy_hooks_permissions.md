# Permissions / Policy / Sandbox

## Status
MISSING

## Product Relevance
CORE

## Purpose
Expose the authorization, policy-hook, and sandbox state needed for governed coding work without moving enforcement into the TUI.

## Authority Boundary
The TUI renders and requests permission decisions. LBE owns policy evaluation, sandboxing, authorization, escalation, and audit truth.

## Work Items
- [ ] Add `/permissions` panel.
- [ ] Add sandbox status projection.
- [ ] Add policy hook status/results projection.
- [ ] Show allow/deny/requires-approval rules by tool/action.
- [ ] Show escalation prompts and explanations.
- [ ] Link permission decisions to evidence/receipts.
- [ ] Fail closed when policy state is unavailable.

## Acceptance
- [ ] User can inspect current permission/sandbox state.
- [ ] Tool approval requirements are visible before execution.
- [ ] Denied actions explain the policy source.
- [ ] TUI cannot bypass LBE policy enforcement.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
