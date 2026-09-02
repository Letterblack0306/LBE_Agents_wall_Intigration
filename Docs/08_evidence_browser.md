# Evidence Browser

## Status

`IMPLEMENTED / LOCAL TESTED — LIVE EVIDENCE ACCEPTANCE OPEN`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add typed evidence record projection.
- [x] Render evidence reference/source/session/execution/tool/summary fields.
- [x] Link evidence records to execution/tool/session references.

## Acceptance Criteria

- [x] Evidence is supplied by canonical runtime projections.
- [x] UI does not manufacture canonical proof.
- [x] Evidence records can be inspected from references shown in transcripts.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

The former placeholder has been replaced. `App` retains typed `EvidenceProjection` records from workspace and tool/conversational events, de-duplicates them by reference, and `/evidence` renders the retained references and provenance fields. Connected-state UI labels now make the LBE projection boundary explicit. This proves the local projection path, not a complete installed live evidence browser.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: EvidenceService and evidence-bound guard results are implemented. Rust TUI: typed evidence projection, local rendering, and connected-state labeling are implemented and tested; installed live evidence retrieval/acceptance remains open. Evidence: `C:\LBE-TUI-Lab\src\app.rs`, `C:\LBE-TUI-Lab\src\ui.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\README.md:23-39`.
