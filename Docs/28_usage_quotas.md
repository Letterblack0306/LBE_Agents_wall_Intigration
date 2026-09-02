# Usage / Quotas

## Status
`PARTIAL — LBE PROVIDER HEALTH/CAPABILITY OWNERS PASS; QUOTA PRODUCT NOT PROVEN`

## Product Relevance
SUPPORTING

## Purpose
Expose model/provider usage, quotas, credits, rate limits, and budget warnings.

## Authority Boundary
The TUI displays usage projections. LBE/provider adapters own measurement, pricing source, and enforcement.

## Work Items
- [ ] Add `/usage` panel.
- [ ] Add `/credits` panel or alias.
- [ ] Define provider/model quota projection.
- [ ] Show rate-limit, budget, token, and fallback state.
- [ ] Add warning events for quota exhaustion.
- [ ] Avoid presenting estimates as verified billing truth unless provider-verified.

## Acceptance
- [ ] User can inspect current usage/quota state.
- [ ] Warnings are visible before/after failures.
- [ ] Projection distinguishes estimated vs provider-verified values.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: provider registry, capability, health, and continuation owners exist. Verified billing/quota projection is not proven. Rust TUI: usage/quotas remain unimplemented. Evidence: C:\Agents-Memory-Tool-v6-integration\PROJECT_INDEX.md:13-16.

