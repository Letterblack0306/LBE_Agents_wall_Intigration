# LetterBlack Engine terminal CLI

Rust/Ratatui full-screen terminal prototype using Ratatui 0.30's Termina backend. The welcome logo is a terminal-safe adaptation of `G:\Developments\UI\ lbe-logo-from-image.html`; the screen composition follows `G:\Developments\UI\LBE_Cline_Style_TUI_Reference (1).html`.

## Runtime requirement

Rust 1.88 or newer. This workspace was validated with Rust 1.96.0 on Windows.

## Commands

```text
cargo run --bin lbe
cargo test
cargo fmt --check
cargo check
```

The runtime remains deliberately mocked. The TUI routes actions through the `LbeWrapper` trait and renders typed `LbeSnapshot` / `LbeEvent` values from `MockLbeWrapper`; it visibly identifies this state as `MOCK / NOT CONNECTED · UI CONTRACT PREVIEW`. This workspace contains no `RealLbeWrapper`, canonical LBE wall, persistent-agent service, guard runtime, live authorization, evidence, receipts, providers, or model integration. `MockLbeWrapper` is not proof of live LBE authorization, execution, validation, evidence, or receipt ownership. Type a task and press Enter to create a proposal; press Enter again to approve it, or Escape to reject it. The app runs in the alternate screen and restores the terminal on normal exit, `q`, or Ctrl+C.

## Mock-only surfaces

The following commands provide navigation scaffolding and explicitly render `MOCK / NOT CONNECTED` until canonical LBE contracts are available: `/account`, `/provider`, `/model`, `/mcp`, `/tools`, `/history`, `/session`, `/evidence`, `/receipts`, `/status`, and `/undo`.

- `/help` opens the shortcut reference.
- `/mode` shows the active mode; `/audit` selects Lbe Audit.
- `/clear` clears only the rendered local transcript; `/new` resets the local mock session; `/quit` exits.
- Plan submissions produce a local mock plan without entering execution. Audit submissions produce `INSUFFICIENT_EVIDENCE` because no LBE guard runtime is connected.

## LBE provider integration policy

- Cline documentation is reference only.
- Cline authentication is not used.
- `api.cline.bot` is not used.
- Providers will connect directly through an LBE-owned provider gateway when integration is explicitly opened.
- Provider credentials remain provider-native and are referenced through secure storage; raw credentials are never rendered in TUI snapshots or events.
- Provider and runtime authority remain outside this UI repository.
- This repository renders mock provider-contract state only until real integration is explicitly opened.
