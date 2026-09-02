# Projects / Settings

## Status
`PARTIAL — LBE HOME/PROVIDER/SESSION OWNERS PASS; RUST UI MISSING`

## Product Relevance
CORE

## Purpose
Expose project/workspace identity, trust, active settings, configuration sources, providers, and shared preferences.

## Authority Boundary
The TUI displays and requests setting changes. LBE owns project trust, persisted settings, secrets, and policy application.

## Work Items
- [ ] Add `/projects` and `/settings` panels.
- [ ] Define project projection: ID, root, trust, config source, runtime attachment.
- [ ] Define settings projection with redacted sensitive values.
- [ ] Add project switch/trust/update request contracts.
- [ ] Show provider/model/policy setting sources.
- [ ] Surface settings sync state for multi-client use.

## Acceptance
- [ ] User can identify active project and trust state.
- [ ] Sensitive values are never displayed raw.
- [ ] Settings changes route through LBE.
- [ ] Multi-client config conflicts are visible.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.


## Cross-workspace status (2026-08-31)

LBE runtime: project/config/provider/session ownership and Home/provider contract surfaces are implemented. Rust TUI: project/settings panels remain unimplemented. Evidence: C:\Agents-Memory-Tool-v6-integration\PROJECT_INDEX.md:12-16,28-30.

