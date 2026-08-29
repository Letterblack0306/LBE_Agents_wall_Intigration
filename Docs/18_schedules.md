# Schedules

## Status
MISSING

## Product Relevance
SUPPORTING

## Purpose
Display and manage scheduled LBE tasks such as cron-driven agents, recurring checks, and periodic summaries.

## Authority Boundary
The TUI requests schedule changes. LBE owns schedule persistence, execution, locking, and run history truth.

## Work Items
- [ ] Add `/schedules` panel.
- [ ] Define schedule projection: ID, prompt, cadence, enabled state, next run, last run.
- [ ] Add create/update/delete/enable/disable request contracts.
- [ ] Show run history and receipt/evidence linkage.
- [ ] Surface missed/failed run state.

## Acceptance
- [ ] User can list schedules.
- [ ] User can see next and previous run state.
- [ ] Schedule execution links to LBE sessions/receipts.
- [ ] TUI does not execute schedules locally.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
