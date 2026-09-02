# Provider Configuration UI Contract

## Status

`PARTIAL — LBE PROVIDER LIFECYCLE PASS; RUST IDENTITY/CATALOG ADAPTER RECONCILED`

## Scope

This module is part of the pre-integration TUI implementation. It must remain compatible with the existing `LbeWrapper` boundary and must not assume canonical LBE authority.

## Work Items

- [x] Add provider configure/validate/remove request contracts.
- [ ] Allow provider selection and base URL editing where applicable.
- [ ] Represent credential state only through opaque credential references/status.
- [ ] Keep raw secrets out of snapshots/events.

## Acceptance Criteria

- [x] Provider configuration actions route through LbeWrapper.
- [ ] No raw credentials appear in rendered state.
- [x] Provider auth/health transitions are visible.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.

## Evidence / Notes

- `ProviderConfig`, `CredentialRef`, `AuthState`, `ProviderHealth`, and `ProviderProjection` already exist.
- `/provider` opens `MockPanel::Provider`, which renders each provider's auth state, health, and local/remote flag from `snapshot.providers` (mock catalog defined in `mock_provider_catalog()`).
- `/provider-config <gemini|openai|anthropic>` dispatches `UserRequest::ConfigureProvider`; `/provider-validate <gemini|openai|anthropic>` dispatches `UserRequest::ValidateProvider`; `/provider-remove <gemini|openai|anthropic>` dispatches `UserRequest::RemoveProvider`. These route through `LbeWrapper`, use opaque credential references, and project auth/health transitions without rendering raw credentials. Richer base URL editing and live runtime validation remain open.
- The Rust provider decoder now accepts the registered LBE identities `openai`, `openai-native`, `anthropic`, `gemini`, `vertex`, `bedrock`, `ollama`, `lmstudio`/`lm-studio`, `openrouter`, `opencode`, and `openai-compatible`. This is identity/projection compatibility only; provider transport and credentials remain LBE-owned.

## Completion

When all work items and acceptance criteria are satisfied, change this module status to `CLOSED` and update `STATUS.md`.

## Cross-workspace status (2026-08-31)

LBE runtime: provider registry/configuration/health and provider-turn continuation are implemented and accepted. Rust TUI: provider identity decoding and catalog ordering are reconciled locally; richer editing, installed provider/model binding, and live authenticated acceptance remain pending. Evidence: `C:\LBE-TUI-Lab\src\main.rs`, `C:\LBE-TUI-Lab\src\wrapper.rs`, `C:\LBE-TUI-Lab\src\tests.rs`, and `C:\Agents-Memory-Tool-v6-integration\docs\CURRENT_STATUS.md:276-325`.
