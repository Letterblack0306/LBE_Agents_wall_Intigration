# LBE TUI Modular Status

Update this file only when a module changes.

| Module | Status | Product Relevance | Depends On | Notes |
|---|---|---|---|---|
| `01_transcript_viewport.md` | MISSING | CORE | - | LbeEvent vocabulary for commands/stdout/stderr/detached exists. No scroll offset, PageUp/Down/Home/End, follow-tail, or detail view. |
| `02_model_picker.md` | PARTIAL | CORE | - | UserRequest::SelectModel exists. No interactive picker with row selection/nav. |
| `03_checkpoints_restore.md` | PARTIAL | CORE | - | Full checkpoint event vocabulary exists. No compare/restore request contracts or detail rendering. |
| `04_sessions.md` | PARTIAL | CORE | - | Session lineage/status types exist. /session is placeholder; /new is local-only. |
| `05_background_processes.md` | PARTIAL | CORE | - | Command/detached event vocabulary exists. /processes panel not implemented. |
| `06_provider_configuration.md` | PARTIAL | CORE | - | Provider types and mock catalog exist. No configure/validate/remove request contracts. |
| `07_tools_registry.md` | PLACEHOLDER | CORE | - | /tools panel placeholder. ToolRisk/ValidationStatus exist. No typed projection. |
| `08_evidence_browser.md` | PLACEHOLDER | CORE | `07` | /evidence panel placeholder. No evidence record types. Depends on tool projection contract. |
| `09_receipts_browser.md` | PLACEHOLDER | CORE | `08` | /receipts panel placeholder. Receipt IDs in transcripts only. Depends on evidence projection. |
| `10_mcp_surface.md` | PLACEHOLDER | CORE | - | /mcp panel placeholder. No MCP server projection. |
| `11_terminal_compatibility.md` | MISSING | CORE | - | RGB palette, unicode logo only. No NO_COLOR, ASCII fallback, CJK width tests. |
| `12_plain_cli_mode.md` | MISSING | CORE | - | No --no-tui path. All output via Termina. |
| `13_lifecycle_acceptance.md` | NOT_PROVEN | CORE | `14` | Unit tests exist for layout/animation. No PTY smoke tests for quit/signal/panic. |
| `14_responsive_acceptance.md` | PARTIAL | CORE | - | 60x18 minimum check exists. No pinned populated-state render tests. |
| `15_session_memory_recall.md` | PARTIAL | CORE | `04` | Memory projection, recall request/events, and /memory panel exist. Missing @memory/@session references, automatic bounded recall, and real LBE memory owner integration. |
| `16_browser_chat_bridge.md` | CLOSED_PRE_INTEGRATION | EXTERNAL INTERACTION | `15` | Browser chat contract/UI layer closed for pre-integration. Real browser automation, automatic memory recall, and live attachment remain later integration dependencies. |
| `17_policy_hooks_permissions.md` | MISSING | CORE | `07` | No /permissions panel, sandbox projection, policy hook result view, or allow/deny/escalation explanation UX. |
| `18_schedules.md` | MISSING | SUPPORTING | `04` | No schedules/cron projection, next-run status, run history, or enable/disable controls. |
| `19_connectors.md` | MISSING | SUPPORTING | `04`, `16` | Browser bridge exists, but no generic Slack/Discord/Linear/chat connector projection or thread-session mapping. |
| `20_agent_teams.md` | MISSING | ADVANCED CORE | `04`, `23` | No team members, coordinator/specialist views, shared task board, mailbox, or mission log projection. |
| `21_conversation_handoff.md` | MISSING | CORE FOR MULTI-CLIENT USE | `04`, `15` | No conversation export/import/handoff package, multi-client resume, or visual-client transfer UI. |
| `22_artifacts_review.md` | MISSING | CORE | `03`, `08`, `09`, `29` | No artifact list/detail, plan walkthrough, diff artifact review, or test-run artifact browser. |
| `23_subagents.md` | MISSING | CORE FOR AGENTIC CODING | `05`, `07`, `17` | No subagent registry, spawn/status/output controls, or authority-bound subagent tool routing UI. |
| `24_projects_settings.md` | MISSING | CORE | `06`, `17` | No /settings or project selector/trust/config-source projection. |
| `25_composer_prompt_editor.md` | MISSING | CORE | - | Composer is single-line/basic. No multiline editing, cursor movement, paste handling, Vim mode, or history search. |
| `26_statusline_title.md` | MISSING | UX SUPPORT | `24` | No /statusline, /title, terminal-title update, or configurable footer/status format. |
| `27_code_search.md` | MISSING | CORE | `07`, `24` | No /codesearch command, query/results panel, symbol/file navigation, or evidence-linked search result projection. |
| `28_usage_quotas.md` | MISSING | SUPPORTING | `06` | No /usage or /credits projection for quotas, rate limits, model costs, or provider budget state. |
| `29_workspace_changes_diff.md` | MISSING | CORE | `03`, `08` | No changed-files list, git/workspace status, diff summary, hunk navigation, accept/reject status, or validation/checkpoint linkage. |
| `30_file_editor_patch_review.md` | MISSING | CORE | `17`, `22`, `29` | No proposed-edit queue, patch preview, file navigation, accept/reject edit controls, conflict state, or edit provenance view. |
| `31_cline_interop_reuse_strategy.md` | MISSING | STRATEGIC | `17`-`30` | No module-by-module Cline adopt/adapt/wrap/native decisions have been proven yet. Prevents rebuilding generic coding-agent frontend features without evidence. |

