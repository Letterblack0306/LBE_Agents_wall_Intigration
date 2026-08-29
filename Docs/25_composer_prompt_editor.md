# Composer / Prompt Editor

## Status
MISSING

## Product Relevance
CORE

## Purpose
Upgrade the task composer from basic single-line input to a coding-agent prompt editor.

## Authority Boundary
The TUI owns local editing UX only. Submitted content becomes an LBE request with session/turn identity.

## Work Items
- [ ] Add multiline composer.
- [ ] Add cursor movement, selection, and word navigation.
- [ ] Add safe paste handling for large/multiline text.
- [ ] Add history search.
- [ ] Add optional Vim editor mode.
- [ ] Add attachment/reference insertion for files, memory, sessions, evidence, receipts.
- [ ] Add draft preservation across panel switches.

## Acceptance
- [ ] User can edit multiline prompts before submission.
- [ ] Pasted content is visible and not silently executed.
- [ ] History recall/search works predictably.
- [ ] Submitted prompt is routed through LbeWrapper.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
