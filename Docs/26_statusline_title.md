# Statusline / Title

## Status
MISSING

## Product Relevance
UX SUPPORT

## Purpose
Allow configurable statusline/footer and terminal title projection for active project/session/runtime state.

## Authority Boundary
The TUI renders status/title state. LBE owns canonical runtime/session/project values.

## Work Items
- [ ] Add `/statusline` panel/command.
- [ ] Add `/title` panel/command.
- [ ] Define configurable status fields.
- [ ] Set terminal title from safe projected state.
- [ ] Show active mode, model, runtime, session, project, and policy state.
- [ ] Add fallback for unsupported terminals.

## Acceptance
- [ ] User can inspect statusline configuration.
- [ ] Terminal title updates without corrupting terminal state.
- [ ] Displayed values come from projection or local UI state only.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
