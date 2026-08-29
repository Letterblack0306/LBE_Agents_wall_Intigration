# LBE TUI Product Roadmap

## Purpose

This package tracks the LBE terminal frontend as a governed coding-agent CLI/TUI, not only an audit surface. Audit is one mode of the product; the full product scope includes coding, runtime/session, tool/process, evidence/receipt, and external interaction frontends.

The real LBE runtime integration remains a later phase. Rich frontend modules must still route authority-bearing actions through `LbeWrapper`.

## Product Scope

```text
LBE TUI PRODUCT SCOPE
+- Governance / audit frontend
+- Coding-agent frontend
+- Runtime/session frontend
+- Tool/process frontend
+- Evidence/receipt frontend
+- External interaction frontend
```

## Authority Boundary

```text
Coding TUI / CLI
|
+- composer
+- files / diffs
+- code search
+- processes
+- sessions
+- subagents
+- projects
+- permissions
+- artifacts
+- providers
+- browser/connectors
        |
        v
     LbeWrapper
        |
        v
   Real LBE runtime
```

The frontend may become IDE-like, but LBE remains authoritative for authorization, execution, guards, workspace mutation, tool policy, evidence, validation, receipts, memory promotion, and completion truth.

## Reuse Rule

Before implementing Modules `17`-`30` natively, inspect whether Cline already provides an equivalent CLI/frontend primitive. Prefer adopting, adapting, or wrapping Cline-style frontend behavior unless LBE governance, provenance, policy, evidence, receipts, validation, memory, or completion truth requires native implementation. Module `31` tracks this reuse strategy.

## Roadmap Tracks

### A. Existing Slices Integration

Modules `01`-`16` cover the current pre-integration TUI shell and contracts that should be connected to the real LBE wall.

### B. Coding Frontend Implementation Roadmap

Modules `17`-`30` cover remaining coding-client surfaces. Build each independently, then connect through the same `LbeWrapper` boundary.

### C. Reuse / Interop Strategy

Module `31` prevents rebuilding generic coding-agent frontend capabilities that can be adopted, adapted, or wrapped from Cline-compatible surfaces. Module `32` records the deterministic runtime state-machine prerequisite that must be closed before real Agent Wall attachment.

### D. Real CLI IDE Implementation Plan

Module `33` defines the implementation sequence from mock TUI contract preview to real governed CLI IDE. It gates `RealLbeWrapper` as a minimal read-only attachment before governed execution, provider/model integration, IDE workflows, persistence, and multi-agent features.

## Modules

| Module | Area | Product Relevance | Status |
|---|---|---|---|
| `01_transcript_viewport.md` | Transcript Viewport and Long Output | CORE | MISSING |
| `02_model_picker.md` | Interactive Model Picker | CORE | PARTIAL |
| `03_checkpoints_restore.md` | Checkpoint Compare and Restore Requests | CORE | PARTIAL |
| `04_sessions.md` | Session Management | CORE | PARTIAL |
| `05_background_processes.md` | Background and Detached Processes | CORE | PARTIAL |
| `06_provider_configuration.md` | Provider Configuration UI Contract | CORE | PARTIAL |
| `07_tools_registry.md` | Tool Registry Surface | CORE | PLACEHOLDER |
| `08_evidence_browser.md` | Evidence Browser | CORE | PLACEHOLDER |
| `09_receipts_browser.md` | Receipt Browser | CORE | PLACEHOLDER |
| `10_mcp_surface.md` | MCP Registry Surface | CORE | PLACEHOLDER |
| `11_terminal_compatibility.md` | Terminal Compatibility | CORE | MISSING |
| `12_plain_cli_mode.md` | Plain / Non-TUI Mode Contract | CORE | MISSING |
| `13_lifecycle_acceptance.md` | Terminal Lifecycle Acceptance | CORE | NOT_PROVEN |
| `14_responsive_acceptance.md` | Responsive and Minimum-Size Acceptance | CORE | PARTIAL |
| `15_session_memory_recall.md` | Session Memory and Recall | CORE | PARTIAL |
| `16_browser_chat_bridge.md` | Browser Chat Interaction Bridge | EXTERNAL INTERACTION | CLOSED_PRE_INTEGRATION |
| `17_policy_hooks_permissions.md` | Permissions / Policy / Sandbox | CORE | MISSING |
| `18_schedules.md` | Schedules | SUPPORTING | MISSING |
| `19_connectors.md` | Connectors | SUPPORTING | MISSING |
| `20_agent_teams.md` | Agent Teams | ADVANCED CORE | MISSING |
| `21_conversation_handoff.md` | Conversation Handoff | CORE FOR MULTI-CLIENT USE | MISSING |
| `22_artifacts_review.md` | Artifacts / Diff / Test Review | CORE | MISSING |
| `23_subagents.md` | Subagents | CORE FOR AGENTIC CODING | MISSING |
| `24_projects_settings.md` | Projects / Settings | CORE | MISSING |
| `25_composer_prompt_editor.md` | Composer / Prompt Editor | CORE | MISSING |
| `26_statusline_title.md` | Statusline / Title | UX SUPPORT | MISSING |
| `27_code_search.md` | Code Search | CORE | MISSING |
| `28_usage_quotas.md` | Usage / Quotas | SUPPORTING | MISSING |
| `29_workspace_changes_diff.md` | Workspace Changes / Diff | CORE | MISSING |
| `30_file_editor_patch_review.md` | File / Patch Review | CORE | MISSING |
| `31_cline_interop_reuse_strategy.md` | Cline Interop / Reuse Strategy | STRATEGIC | MISSING |
| `32_deterministic_runtime_state_machine.md` | Deterministic Runtime State Machine | CORE / BLOCKING | IMPLEMENTED_PRE_INTEGRATION |
| `33_real_cli_ide_implementation_plan.md` | Real CLI IDE Implementation Plan | CORE / SEQUENCING | PLANNED |
| `34_autonomous_developer_frontend.md` | Autonomous Developer Frontend Features (Handoff) | CORE | PARTIAL |

## Status Vocabulary

- `MISSING` - no usable UI implementation exists.
- `PARTIAL` - contract or projection exists, but the user-facing flow is incomplete.
- `PLACEHOLDER` - command/panel exists but only displays a not-connected placeholder.
- `NOT_PROVEN` - implementation may exist, but required acceptance evidence is absent.
- `IMPLEMENTED` - module implementation is complete but may still require integration later.
- `CLOSED_PRE_INTEGRATION` - module contract/UI layer is closed for mock/pre-integration scope; live integration dependencies are external.
- `CLOSED` - implementation and module acceptance criteria are satisfied.

## Closure Rule

The pre-integration UI can be classified as `UI_IMPLEMENTATION_COMPLETE_READY_FOR_LBE_INTEGRATION` only when required product modules are closed for their defined scope and all authority-bearing actions continue to route through `LbeWrapper` without moving canonical LBE authority into the TUI.


