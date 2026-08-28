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

The runtime remains deliberately mocked. The TUI consumes typed proposal, execution, validation, completion, and receipt events through a local `MockRuntimeClient`; this is the adapter seam for a future canonical LBE runtime client, not proof of live LBE authorization or validation. Type a task and press Enter to create a proposal; press Enter again to approve it, or Escape to reject it. The app runs in the alternate screen and restores the terminal on normal exit, `q`, or Ctrl+C.
