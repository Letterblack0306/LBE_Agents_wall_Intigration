# Interactive Model Picker

## Status

`IMPLEMENTED / LOCAL — CATALOG ORDERING RECONCILED`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add selected-row state to /model.
- [x] Add Up/Down navigation.
- [x] Enter submits UserRequest::SelectModel.
- [x] Esc closes without mutation.
- [x] Surface wrapper errors for invalid selections.

## Acceptance Criteria

- [x] Only models from the discovered catalog can be selected.
- [x] Current model is visibly marked.
- [x] Unknown models still fail closed through LbeWrapper.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `/model` (in `handle_command`) already opens `MockPanel::Model` and fires `UserRequest::RefreshProviderCatalog`.
- `mock_panel_text(MockPanel::Model, ...)` already renders the full catalog from `snapshot.models`: display name, context window, max output, and a capability marker row (streaming/tools/reasoning/images/caching) per model.
- `UserRequest::SelectModel { model: ModelRef }` and the `ModelRef`/`ModelDescriptor` types already exist â€” the request contract is there.
- The Rust client owns only picker cursor/projection state. Selection is dispatched through `LbeWrapper`; catalog membership and model authority remain runtime-owned.
- Real startup now waits for the authoritative `ModelCatalogDiscovered` event before submitting a requested `SelectModel`, preventing a valid LBE model from being rejected while catalog discovery is still in flight.

## Completion

When PTY-level interactive acceptance is proven, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: IMPLEMENTED / PASS — ProviderRegistry owns provider/model selection and first-run entry validates provider/model pairing. Rust TUI: local picker and catalog-before-selection ordering are implemented; installed live provider catalog acceptance remains open. Evidence: `C:\LBE-TUI-Lab\src\main.rs`, `C:\LBE-TUI-Lab\src\wrapper.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\FIRST_RUN_LIVE_SESSION_ENTRY_CHECKPOINT.md:32-43`.
