# LBE TUI Modular Status

Update this file only when a module changes.

| Module | Status | Depends On | Notes |
|---|---|---|---|
| `01_transcript_viewport.md` | MISSING | — | LbeEvent vocabulary for commands/stdout/stderr/detached exists. No scroll offset, PageUp/Down/Home/End, follow-tail, or detail view. |
| `02_model_picker.md` | PARTIAL | — | UserRequest::SelectModel exists. No interactive picker with row selection/nav. |
| `03_checkpoints_restore.md` | PARTIAL | — | Full checkpoint event vocabulary exists. No compare/restore request contracts or detail rendering. |
| `04_sessions.md` | PARTIAL | — | Session lineage/status types exist. /session is placeholder; /new is local-only. |
| `05_background_processes.md` | PARTIAL | — | Command/detached event vocabulary exists. /processes panel not implemented. |
| `06_provider_configuration.md` | PARTIAL | — | Provider types and mock catalog exist. No configure/validate/remove request contracts. |
| `07_tools_registry.md` | PLACEHOLDER | — | /tools panel placeholder. ToolRisk/ValidationStatus exist. No typed projection. |
| `08_evidence_browser.md` | PLACEHOLDER | `07` | /evidence panel placeholder. No evidence record types. Depends on tool projection contract. |
| `09_receipts_browser.md` | PLACEHOLDER | `08` | /receipts panel placeholder. Receipt IDs in transcripts only. Depends on evidence projection. |
| `10_mcp_surface.md` | PLACEHOLDER | — | /mcp panel placeholder. No MCP server projection. |
| `11_terminal_compatibility.md` | MISSING | — | RGB palette, unicode logo only. No NO_COLOR, ASCII fallback, CJK width tests. |
| `12_plain_cli_mode.md` | MISSING | — | No --no-tui path. All output via Termina. |
| `13_lifecycle_acceptance.md` | NOT_PROVEN | `14` | Unit tests exist for layout/animation. No PTY smoke tests for quit/signal/panic. |
| `14_responsive_acceptance.md` | PARTIAL | — | 60x18 minimum check exists. No pinned populated-state render tests. |