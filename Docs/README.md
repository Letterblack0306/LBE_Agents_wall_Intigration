# LBE TUI Product Roadmap

## Purpose

This package tracks the LBE terminal frontend as a governed coding-agent CLI/TUI, not only an audit surface. Audit is one mode of the product; the full product scope includes coding, runtime/session, tool/process, evidence/receipt, and external interaction frontends. Start with [`00_integration_alignment.md`](00_integration_alignment.md) for the two-repository ownership boundary, runtime modes, and integration sequence.

Rust/Ratatui is the active interface implementation. The Python TUI direction is
retired/reference-only and has no further implementation path. The Python LBE
runtime remains authoritative for governance, providers, authorization,
execution, evidence, receipts, validation, and completion truth. The Rust TUI
must remain a client/projection layer over `LbeWrapper` and LBE.

The separate LBE workspace now records PASS for the complete runtime, session/application contract, governed tool orchestration, external capability registration, provider continuation, and interface control/evidence surfaces. The Rust TUI remains a client/projection adapter; real read-only workspace adapter paths, MCP metadata refresh, connected-state labeling for tool/process/receipt/MCP panels, and provider catalog-before-selection ordering are locally verified, but installed interactive `/mcp` PTY/E2E and live provider acceptance are not yet proven. The real runtime is now the default binary path; set `LBE_RUNTIME=mock` only for deterministic local contract previews.
Remaining work is Rust/Ratatui interactive acceptance and live integration
proof. The vendored optional documentation companion is available under
`documentation_companion_plugin/`; it consumes only LBE-owned identifiers/events
when explicitly invoked and is not imported by the active runtime.

Cline source audit and reuse classification are complete in the LBE workspace: ADAPT Cline AgentRuntime continuation/event/tool mechanics behind an LBE-owned adapter; reject direct native mutation/execution tools. OpenCode is also an official reuse/reference source, and its pinned revision `dc4449df0d52199704ea4989a5a993ebbc605612` is classified in Module 31. Both must be reused or adapted before equivalent features are recreated. No external runtime may replace LBE authority.

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

Before implementing Modules `17`-`30` natively, inspect the official Cline and OpenCode sources for an equivalent CLI/frontend/runtime primitive. Prefer adopting, adapting, or wrapping existing behavior. Implement only the LBE-specific adapter, projection, authority, provenance, policy, evidence, receipt, validation, memory, persistence, or completion semantics that cannot be safely delegated. Module `31` records this reuse strategy.

## Roadmap Tracks

### A. Existing Slices Integration

Modules `01`-`16` cover the Rust/Ratatui TUI shell and contracts. The bounded
read-only provider/tool path is accepted; remaining work is interactive Rust
client acceptance and additional Rust-side projections over the real LBE wall.

### B. Coding Frontend Implementation Roadmap

Modules `17`-`30` cover remaining coding-client surfaces. Build each independently, then connect through the same `LbeWrapper` boundary.

### C. Reuse / Interop Strategy

Module `31` prevents rebuilding generic coding-agent frontend and runtime capabilities that
can be adopted, adapted, or wrapped from Cline/OpenCode surfaces. Module `32`
records the deterministic runtime state-machine foundation. Python terminal UI
is retired/reference-only; Rust/Ratatui is the active interface. The bounded
governed read-only path is accepted, and the next work is Rust interactive
acceptance plus remaining Rust client integration.

### D. Real CLI IDE Implementation Plan

Module `33` defines the implementation sequence from mock TUI contract preview to real governed CLI IDE. It gates `RealLbeWrapper` as a minimal read-only attachment before governed execution, provider/model integration, IDE workflows, persistence, and multi-agent features.

## Modules

| Module | Area | Product Relevance | Status |
|---|---|---|---|
| `00_integration_alignment.md` | Two-Repository Ownership, Modes, and Sequence | GOVERNANCE | ACTIVE |
| `01_transcript_viewport.md` | Transcript Viewport and Long Output | CORE | IMPLEMENTED / LOCAL |
| `02_model_picker.md` | Interactive Model Picker | CORE | IMPLEMENTED / LOCAL — CATALOG ORDERING RECONCILED |
| `03_checkpoints_restore.md` | Checkpoint Compare and Restore Requests | CORE | IMPLEMENTED / LOCAL |
| `04_sessions.md` | Session Management | CORE | PARTIAL |
| `05_background_processes.md` | Background and Detached Processes | CORE | PARTIAL |
| `06_provider_configuration.md` | Provider Configuration UI Contract | CORE | PARTIAL — IDENTITY/CATALOG ADAPTER RECONCILED |
| `07_tools_registry.md` | Tool Registry Surface | CORE | IMPLEMENTED / LOCAL TESTED — CONNECTED PROJECTION; LIVE ACCEPTANCE OPEN |
| `08_evidence_browser.md` | Evidence Browser | CORE | IMPLEMENTED / LOCAL TESTED — CONNECTED PROJECTION; LIVE ACCEPTANCE OPEN |
| `09_receipts_browser.md` | Receipt Browser | CORE | IMPLEMENTED / LOCAL TESTED — CONNECTED PROJECTION; LIVE ACCEPTANCE OPEN |
| `10_mcp_surface.md` | MCP Registry Surface | CORE | PROVEN — METADATA/CONNECTED PROJECTION; INSTALLED ACCEPTANCE OPEN |
| `11_terminal_compatibility.md` | Terminal Compatibility | CORE | MISSING |
| `12_plain_cli_mode.md` | Plain / Non-TUI Mode Contract | CORE | MISSING |
| `13_lifecycle_acceptance.md` | Terminal Lifecycle Acceptance | CORE | NOT_PROVEN |
| `14_responsive_acceptance.md` | Responsive and Minimum-Size Acceptance | CORE | PARTIAL |
| `15_session_memory_recall.md` | Session Memory and Recall | CORE | PARTIAL |
| `16_browser_chat_bridge.md` | Browser Chat Interaction Bridge | EXTERNAL INTERACTION | CLOSED_PRE_INTEGRATION |
| `17_policy_hooks_permissions.md` | Permissions / Policy / Sandbox | CORE | IMPLEMENTED / LOCAL TESTED — LIVE ACCEPTANCE OPEN |
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
| `29_workspace_changes_diff.md` | Workspace Changes / Diff | CORE | IMPLEMENTED / LOCAL TESTED — LIVE WRITABLE ACCEPTANCE OPEN |
| `30_file_editor_patch_review.md` | File / Patch Review | CORE | IMPLEMENTED / LOCAL TESTED — LIVE PATCH ACCEPTANCE OPEN |
| `31_cline_interop_reuse_strategy.md` | Cline Interop / Reuse Strategy | STRATEGIC | MISSING |
| `32_deterministic_runtime_state_machine.md` | Deterministic Runtime State Machine | CORE / BLOCKING | IMPLEMENTED_PRE_INTEGRATION |
| `33_real_cli_ide_implementation_plan.md` | Real CLI IDE Implementation Plan | CORE / SEQUENCING | ACTIVE SEQUENCE |
| `34_p1_live_readonly_acceptance.md` | P1 Read-Only Real Runtime Acceptance | ACCEPTANCE | PASS |
| `35_p1_live_acceptance_evidence_record.md` | P1 Live Acceptance Evidence Record | ACCEPTANCE | PASS |
| `36_p2_p3_client_contract.md` | Governed Workspace Operation Client Contract | CONTRACT | LIVE READ-ONLY PROVEN — PROVIDER/CATALOG RECONCILED — FULL P2/P3 INCOMPLETE |
| `34_autonomous_developer_frontend.md` | Autonomous Developer Frontend Features (Handoff) | CORE | PARTIAL |

## Optional documentation companion

`documentation_companion_plugin/` is a vendored, isolated Python prototype from
`C:\Users\prave\Downloads\lbe_documentation_companion_plugin`. Its manifest and
contract remain authoritative for the plug-in boundary: it may correlate
LBE-owned identifiers/events and render derived Markdown, but it must not create
identifiers, authorize, execute, validate, create canonical evidence/receipts,
decide completion, or own persistence. It is not imported by the active Rust or
LBE runtime.

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




## Current cross-workspace reconciliation (2026-08-31)

The canonical LBE workspace at C:\Agents-Memory-Tool-v6-integration has PASS evidence for complete runtime/session/application ownership, governed tools and receipts, provider continuation, external capability registration, and interface control/evidence surfaces. The Rust repository must consume those owners through LbeWrapper and must not recreate session, provider, authorization, execution, evidence, receipt, persistence, memory, or completion authority. The remaining Rust scope is live adapter/event mapping, feature projections, and installed interactive acceptance.

## Current UI projection checkpoint (2026-09-02)

The Rust client now makes the connected-runtime boundary visible in the normal
welcome projection and in the Tools, Processes, Receipts, and MCP panels. These
panels identify connected data as authoritative LBE projections and retain
explicit unavailable/read-only language when disconnected. This is a local UI
projection improvement only; it does not close installed PTY/E2E acceptance,
approval-enabled mutation, or the full P2/P3 gate. Current local validation is
the Rust suite (`201 passed`) and `cargo check` PASS.
