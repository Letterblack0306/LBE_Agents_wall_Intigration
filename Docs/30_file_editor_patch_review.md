# File / Patch Review

## Status
MISSING

## Product Relevance
CORE

## Purpose
Provide review UI for proposed edits and patches before/after governed workspace mutation.

## Authority Boundary
The TUI previews and submits accept/reject decisions. LBE owns patch application, conflict detection, policy, evidence, and receipts.

## Work Items
- [ ] Add patch review panel.
- [ ] Define proposed edit projection: file, hunks, source tool/turn, status.
- [ ] Add file navigation and patch preview.
- [ ] Add accept/reject edit request contracts.
- [ ] Show conflict state and resolution requirements.
- [ ] Link edits to tool execution, evidence, validation, and receipt IDs.
- [ ] Preserve review decisions across reconnect.

## Acceptance
- [ ] User can inspect proposed edits before accepting.
- [ ] Conflict/provenance state is visible.
- [ ] Accept/reject routes through LBE.
- [ ] Applied edits link to validation and receipt evidence.

## Reuse Strategy
Before implementing this module natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping that surface instead of recreating it, unless LBE governance, provenance, policy, evidence, receipt, validation, or memory authority requires native implementation.
