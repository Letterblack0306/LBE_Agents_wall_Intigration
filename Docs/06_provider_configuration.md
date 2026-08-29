# Provider Configuration UI Contract

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [ ] Add provider configure/validate/remove request contracts.
- [ ] Allow provider selection and base URL editing where applicable.
- [ ] Represent credential state only through opaque credential references/status.
- [ ] Keep raw secrets out of snapshots/events.

## Acceptance Criteria

- [ ] Provider configuration actions route through LbeWrapper.
- [ ] No raw credentials appear in rendered state.
- [ ] Provider auth/health transitions are visible.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `ProviderConfig`, `CredentialRef`, `AuthState`, `ProviderHealth`, and `ProviderProjection` already exist.
- `/provider` opens `MockPanel::Provider`, which renders each provider's auth state, health, and local/remote flag from `snapshot.providers` (mock catalog defined in `mock_provider_catalog()`).
- **Not yet built:** no configure/validate/remove `UserRequest` variants exist — only `RefreshProviderCatalog`. The panel is read-only today; there's no way to edit a base URL or credential ref from the UI yet.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.