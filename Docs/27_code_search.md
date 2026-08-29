# Code Search

## Status
MISSING

## Product Relevance
CORE

## Purpose
Provide a governed code search frontend for files, symbols, text, and semantic search results.

## Authority Boundary
The TUI requests search and renders results. LBE/tool layer owns filesystem access, indexing, permissions, and evidence.

## Work Items
- [ ] Add `/codesearch` command.
- [ ] Define search request/result projections.
- [ ] Show file path, line, snippet, score, and source.
- [ ] Add keyboard navigation from result to file/diff/artifact views.
- [ ] Link search results to evidence when used in a decision.
- [ ] Respect project trust and sandbox policy.

## Acceptance
- [ ] User can search current workspace from the TUI.
- [ ] Results are bounded and navigable.
- [ ] Search does not bypass LBE permissions.
- [ ] Used results can be cited as evidence.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
