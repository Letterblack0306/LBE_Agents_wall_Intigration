# Artifacts / Diff / Test Review

## Status
MISSING

## Product Relevance
CORE

## Purpose
Provide structured review surfaces for plans, diffs, test results, screenshots, generated files, and validation artifacts.

## Authority Boundary
The TUI renders artifacts and user decisions. LBE owns artifact provenance, validation truth, evidence, receipts, and workspace mutation.

## Work Items
- [ ] Add `/artifacts` panel.
- [ ] Define artifact projection: ID, type, source turn/tool, status, summary.
- [ ] Add plan walkthrough view.
- [ ] Add test-run artifact view.
- [ ] Link artifacts to evidence/receipts/checkpoints.
- [ ] Add accept/reject/comment request contracts.

## Acceptance
- [ ] User can inspect artifacts independently from transcript text.
- [ ] Artifacts show provenance and validation status.
- [ ] Artifact decisions route through LBE.
- [ ] Diff/test artifacts link to workspace changes.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
