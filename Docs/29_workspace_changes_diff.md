# Workspace Changes / Diff

## Status
MISSING

## Product Relevance
CORE

## Purpose
Show changed files, workspace/git status, diff summaries, hunks, accepted/rejected changes, and validation/checkpoint relationships.

## Authority Boundary
The TUI renders workspace-change projections and requests actions. LBE/tool layer owns workspace inspection, mutation, checkpoints, and validation truth.

## Work Items
- [ ] Add `/changes` or `/diff` panel.
- [ ] Define workspace status projection.
- [ ] Show changed files and diff summary.
- [ ] Add file-level diff and hunk navigation.
- [ ] Show accepted/rejected/pending change state.
- [ ] Link changes to checkpoints, validation, evidence, and receipts.
- [ ] Add refresh/compare request contracts.

## Acceptance
- [ ] User can inspect current workspace changes.
- [ ] Diffs are navigable at file and hunk level.
- [ ] Change provenance is visible.
- [ ] TUI does not mutate workspace outside LBE requests.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
