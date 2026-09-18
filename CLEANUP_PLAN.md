# LBE-TUI-Lab Cleanup & Consolidation Plan

**Original date**: 2026-09-07  
**Current status**: SUPERSEDED IN PRODUCT-SURFACE SCOPE BY EXPLICIT OWNER DECISION — 2026-09-18

## Current product decision

```text
PRODUCT                         = LBE
VISIBLE TERMINAL IMPLEMENTATION = LBE-owned Rust/Ratatui
VISUAL / INTERACTION CONTRACT   = existing LBE HTML/React work
CLINE                            = headless reasoning/provider/model/continuation mechanics only
LBE RUNTIME                     = C:\Agents-Memory-Tool-v6-integration
```

The old Phase 3 question about keeping or deleting a copied Cline CLI/TUI tree is no longer a product-selection blocker. A full copied Cline UI tree is **not required** for the visible product.

Cline remains a selected reuse dependency behind LBE through the governed worker/provider path. Do not delete or recreate dependency material blindly; preserve only what the canonical backend/package owners actually require.

## Cleanup rules that remain valid

- preserve unrelated user work;
- do not use `git clean -fd`, reset, stash, or destructive cleanup without explicit authorization;
- generated build outputs, logs, and temporary runtime state are not product authority;
- `target/`, node_modules, logs, and local runtime-state paths remain ignore candidates;
- current machine gate and active intent outrank this historical cleanup plan.

## Cline disposition — resolved

```text
full copied Cline CLI/OpenTUI product tree = NOT REQUIRED AS PRODUCT UI
system-installed visible Cline CLI         = NOT CANONICAL PRODUCT DEPENDENCY
@cline/agents / governed Cline worker      = RETAIN AS HEADLESS MECHANICS
upstream Cline UI source                   = REFERENCE/REUSE INPUT ONLY
```

Do not restore `C:\LBE-TUI-Lab\cline\apps\cli` merely to make Cline the visible UI.

## Rust disposition — resolved

```text
C:\LBE-TUI-Lab\src\
  -> canonical LBE-owned Rust/Ratatui product client
  -> presentation/input/projection only
  -> must route all authority-bearing consequences through LBE
```

The existing Rust work is now implementation material, not disposable reference work.

## HTML / React disposition

The existing LBE HTML/React terminal/cockpit work is retained for:

- visual hierarchy;
- layout;
- interaction behavior;
- [I] composer identity;
- timeline collapse/expand behavior;
- context indicator design;
- LetterBlack/LBE brand system.

Hard-coded state, simulated timing, fabricated runtime status, and browser-only proof remain non-authoritative.

## Current cleanup priority

1. Preserve the Rust client and all useful LBE UI work.
2. Preserve governed Cline worker/provider dependencies actually used by the backend.
3. Remove only proven generated/clutter material under normal preservation rules.
4. Reconcile launch/build/package owners so `lbe` installs and launches the Rust LBE client.
5. Do not perform destructive workspace cleanup as a substitute for product integration.

## Validation

Before any cleanup is reported complete:

```text
git status --short
cargo check
cargo test
cargo fmt -- --check
backend machine gate / active intent match
no required Cline worker dependency removed
no unrelated dirty user work lost
```
