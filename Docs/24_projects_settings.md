# Projects / Settings

## Status
MISSING

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
