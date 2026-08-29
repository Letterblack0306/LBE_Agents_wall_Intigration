# Session Memory and Recall

## Status
PARTIAL

## Existing Authority
Canonical LBE runtime owns durable memory and verified promotion.

## TUI Work
- [x] Add `MemoryProjection`
- [x] Add session hash projection
- [x] Add `RecallSessionMemory` request
- [x] Add memory recall events
- [x] Add `/memory` panel
- [ ] Add `@memory` / `@session` context references
- [ ] Add automatic bounded recall before turns
- [x] Show verified/unverified/stale state in the memory contract
- [x] Never treat TUI-local cache as canonical truth

## Acceptance
- [x] Same mock session has stable session identity/hash
- [x] Relevant previous mock session records can be retrieved
- [ ] User does not need to repeat prior task context
- [x] Retrieval is bounded by request limit
- [x] Unrelated sessions are not dumped into context by the mock recall query
- [x] Verified memory has explicit truth state for ranking by the runtime adapter
- [ ] Real integration uses existing LBE persistence owner