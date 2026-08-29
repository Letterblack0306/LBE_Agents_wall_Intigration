# LBE TUI Modular Pre-Integration Closure

## Purpose

This package splits the remaining TUI work into independent modules so a future agent can work on one gap without regenerating or rewriting the entire implementation plan.

The real LBE runtime integration remains a later phase.

## Working Rule

Each module is independently actionable. Update only the module being worked on, plus `STATUS.md`.

```text
Ratatui TUI
    ↓
LbeWrapper
    ↓
MockLbeWrapper   ← current pre-integration implementation

Later:

Ratatui TUI
    ↓
LbeWrapper
    ↓
Real LBE adapter
    ↓
Canonical LBE runtime
```

## Modules

| Module | Area | Initial Status |
|---|---|---|
| `01_transcript_viewport.md` | Transcript Viewport and Long Output | MISSING |
| `02_model_picker.md` | Interactive Model Picker | PARTIAL |
| `03_checkpoints_restore.md` | Checkpoint Compare and Restore Requests | PARTIAL |
| `04_sessions.md` | Session Management | PARTIAL |
| `05_background_processes.md` | Background and Detached Processes | PARTIAL |
| `06_provider_configuration.md` | Provider Configuration UI Contract | PARTIAL |
| `07_tools_registry.md` | Tool Registry Surface | PLACEHOLDER |
| `08_evidence_browser.md` | Evidence Browser | PLACEHOLDER |
| `09_receipts_browser.md` | Receipt Browser | PLACEHOLDER |
| `10_mcp_surface.md` | MCP Registry Surface | PLACEHOLDER |
| `11_terminal_compatibility.md` | Terminal Compatibility | MISSING |
| `12_plain_cli_mode.md` | Plain / Non-TUI Mode Contract | MISSING |
| `13_lifecycle_acceptance.md` | Terminal Lifecycle Acceptance | NOT_PROVEN |
| `14_responsive_acceptance.md` | Responsive and Minimum-Size Acceptance | PARTIAL |

## Status Vocabulary

- `MISSING` — no usable UI implementation exists.
- `PARTIAL` — contract or projection exists, but the user-facing flow is incomplete.
- `PLACEHOLDER` — command/panel exists but only displays a not-connected placeholder.
- `NOT_PROVEN` — implementation may exist, but required acceptance evidence is absent.
- `IMPLEMENTED` — module implementation is complete but may still require integration later.
- `CLOSED` — implementation and module acceptance criteria are satisfied.

## Closure Rule

The pre-integration UI can be classified as `UI_IMPLEMENTATION_COMPLETE_READY_FOR_LBE_INTEGRATION` when all required modules are `CLOSED` and all UI actions continue to route through `LbeWrapper` without moving canonical LBE authority into the TUI.