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

The real LBE runtime is the default. The active interface is the Rust/Ratatui TUI, which routes actions through the `LbeWrapper` trait and renders typed `LbeSnapshot` / `LbeEvent` values. The fail-closed `RealLbeWrapper` path requires explicit Agent Wall configuration and does not fabricate state. Set `LBE_RUNTIME=mock` only for deterministic local contract previews. LBE's Python runtime remains the authoritative backend for provider access, governance, authorization, execution, evidence, receipts, validation, and completion truth. The Rust TUI is only the client/projection layer and does not replace LBE authority. The Python TUI direction is retired and reference-only; no further Python terminal UI implementation is planned. The app runs in the alternate screen and restores the terminal on normal exit, `q`, or Ctrl+C.

## Conversational interaction and diagnostic surfaces

Chat is the primary user-facing interface. The agent interprets the conversation, selects capabilities, and submits requests through `LbeWrapper`; LBE performs access control, policy evaluation, execution, validation, evidence, receipts, and completion.

The TUI has three conversational modes:

- **Runtime** — broad workspace-aware agent assistance using governed capabilities when needed.
- **Plan** — broad workspace investigation and proposal; no execution.
- **Audit** — focused, read-only investigation of workspace rules, guards, and evidence.

The following slash commands are optional navigation or diagnostic scaffolding, not required user operations. `/mcp` renders the connected LBE capability metadata projection when the real runtime is configured and otherwise remains explicitly unavailable; the other listed surfaces remain truthful projection scaffolding until their canonical LBE contracts are available: `/account`, `/provider`, `/model`, `/tools`, `/history`, `/session`, `/processes`, `/evidence`, `/receipts`, `/status`, and `/undo`.

The lower-level `/open`, `/read`, `/tree`, `/list`, `/glob`, `/find`, `/search`, `/patch`, `/run`, and `/authorize` entries are developer/agent integration paths for contract testing and governed request inspection. They do not grant permission, bypass LBE policy, or represent the normal user workflow. In Audit mode, the agent should find relevant workspace evidence and reason over it conversationally; users are not expected to drive audits with these commands.

- `/help` opens the shortcut reference.
- `/mode` shows the active mode; `/audit` selects Audit mode.
- `/clear` clears only the rendered local transcript; `/new` resets the local mock session; `/quit` exits.
- Plan submissions produce a local mock plan without entering execution. Audit submissions represent an agent-led, read-only workspace investigation and produce `INSUFFICIENT_EVIDENCE` because no LBE guard runtime is connected.

## LBE provider integration policy

- Cline documentation is reference only.
- Cline authentication is not used.
- `api.cline.bot` is not used.
- Providers will connect directly through an LBE-owned provider gateway when integration is explicitly opened.
- Provider credentials remain provider-native and are referenced through secure storage; raw credentials are never rendered in TUI snapshots or events.
- Provider and runtime authority remain outside this UI repository.
- OpenCode and Cline are external behavior references only; any reuse must pass
  through `LbeWrapper` and the authoritative LBE runtime.
- Rust/Ratatui is the active interface implementation; Python terminal UI is
  retired/reference-only.
- The Rust TUI renders provider/runtime projections supplied by the authoritative
  LBE Python runtime and never owns provider credentials or runtime authority.
