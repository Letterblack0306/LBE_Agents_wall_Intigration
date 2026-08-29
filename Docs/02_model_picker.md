# Interactive Model Picker

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add selected-row state to /model.
- [ ] Add Up/Down navigation.
- [ ] Enter submits UserRequest::SelectModel.
- [ ] Esc closes without mutation.
- [ ] Surface wrapper errors for invalid selections.

## Acceptance Criteria

- [ ] Only models from the discovered catalog can be selected.
- [ ] Current model is visibly marked.
- [ ] Unknown models still fail closed through LbeWrapper.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `/model` (in `handle_command`) already opens `MockPanel::Model` and fires `UserRequest::RefreshProviderCatalog`.
- `mock_panel_text(MockPanel::Model, ...)` already renders the full catalog from `snapshot.models`: display name, context window, max output, and a capability marker row (streaming/tools/reasoning/images/caching) per model.
- `UserRequest::SelectModel { model: ModelRef }` and the `ModelRef`/`ModelDescriptor` types already exist — the request contract is there.
- **Not yet built:** no selected-row index on `App`, no Up/Down handling while the Model panel is open, and `Enter` still only calls `submit_or_approve` (composer/approval), never dispatches `SelectModel`. `Esc` closes the panel generically, not as a model-picker-specific no-op.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.