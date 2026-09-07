# LBE-TUI-Lab Agent Information Hub

## PRIMARY AUTHORITY

**This document is the authoritative source of information for any agent operating in this workspace.**

All agents must read this file first before performing any work.

---

## PRODUCT IDENTITY

**LBE (Lockstep Boundary Engine)** - An accountable AI agent terminal owned by **LETTERBLACK**.

### Final Product Definition

### Final Product Definition
```
LBE CLI (user-facing product)  <-- LBE-NATIVE INTERFACE (NOT Cline)
    - Green/Amber color scheme (not blue/purple)
    - Governance-focused layout
    - BirdEye MCP integration
Cline  ---->  embedded provider/reasoning engine
LBE    ---->  sole authority (session / governance / evidence / completion)
```


```
LBE CLI (user-facing product)
    Cline  ---->  embedded provider/reasoning engine
    LBE    ---->  sole authority (session / governance / evidence / completion)
```

### Core Principle
> **The agent owns cognition. LBE owns capabilities and consequences.**

### What LBE Provides
| Feature | Description |
|---------|-------------|
| **Authorization** | Every action is checked against policy before execution |
| **Receipts** | Every action produces a proof record of what happened |
| **Evidence** | Complete audit trail tied to operations |
| **Persistence** | Sessions survive restarts |
| **Governance** | Mutation requires approval; read operations are fast |

---

## WORKSPACE STRUCTURE

```
C:\LBE-TUI-Lab                        <-- This workspace (TUI/Integration)
        |
        v
C:\Agents-Memory-Tool-v6-integration  <-- LBE Runtime (Authority)
        |
        v
C:\LBE_RUNTIME_PY312                  <-- Installed runtime (v2.0.3)
```

### Key Paths
| Component | Path | Purpose |

### Key Paths
| Component | Path | Purpose |
|-----------|------|---------|
| **LBE-NATIVE CLI** | `lbe.ps1`/`lbe.bat` | User-facing LBE interface (NOT Cline) |
| **LBE CLI Script** | `lbe-cli.ps1` | Unique green/amber terminal UI |
| **Rust source** | `src/` | Reference client implementation |
| **Rust binary** | `target/release/lbe.exe` | Built reference client |
| **Docs** | `Docs/` | Integration documentation |


|-----------|------|---------|
| **Rust source** | `src/` | Reference client implementation |
| **LBE CLI launcher** | `run-cline-lbe.ps1` | Uses npm-installed Cline |
| **Rust binary** | `target/release/lbe.exe` | Built reference client |
| **Docs** | `Docs/` | Integration documentation |

---

## LINKED WORKSPACE: C:\Agents-Memory-Tool-v6-integration

This workspace is the **authoritative LBE runtime** that owns:
- Governance and policy evaluation
- Evidence and receipts
- Session persistence and recovery
- Provider integration
- Capability registry
- Tool orchestration and execution

**Never bypass or replace LBE runtime authority.**

### Key Memory Integration
- **BirdEye MCP Server**: Evidence and knowledge management endpoint
- **Evidence projections**: Consumed through `LbeWrapper` in Rust client
- **Receipts**: Proof records from the runtime

---

## MAJOR DOCUMENTATION

### This Workspace (C:\LBE-TUI-Lab) Root Documents

| Document | Purpose |
|----------|---------|
| `README.md` | Product overview, commands, and runtime requirements |
| `WHAT_IS_LBE.md` | Core product definition and principles |
| `Agent.md` | (This file) Agent information hub |
| `CLEANUP_PLAN.md` | Workspace cleanup and migration plan |

### This Workspace (C:\LBE-TUI-Lab) Docs Directory

| Document | Topic |
|----------|-------|
| `00_integration_alignment.md` | Two-repository ownership boundary |
| `01_transcript_viewport.md` | Chat transcript handling |
| `02_model_picker.md` | Provider/AI model selection |
| `03_checkpoints_restore.md` | Session checkpoint and restore |
| `04_sessions.md` | Session management |
| `05_background_processes.md` | Background process handling |
| `06_provider_configuration.md` | AI provider configuration |
| `07_tools_registry.md` | Tool registration and management |
| `08_evidence_browser.md` | Evidence browsing interface |
| `09_receipts_browser.md` | Receipt viewing |
| `10_mcp_surface.md` | MCP (Model Context Protocol) integration |
| `11_terminal_compatibility.md` | Terminal compatibility |
| `12_plain_cli_mode.md` | CLI-only mode |
| `13_lifecycle_acceptance.md` | Lifecycle acceptance testing |
| `14_responsive_acceptance.md` | Responsive UI acceptance |
| `15_session_memory_recall.md` | Memory recall integration |
| `16_browser_chat_bridge.md` | Browser-based chat interface |
| `17_policy_hooks_permissions.md` | Policy hooks and permissions |
| `18_schedules.md` | Scheduled operations |
| `19_connectors.md` | External connectors |
| `20_agent_teams.md` | Multi-agent team support |
| `21_conversation_handoff.md` | Conversation handoff |
| `22_artifacts_review.md` | Artifact review interface |
| `23_subagents.md` | Subagent management |
| `24_projects_settings.md` | Project settings |
| `25_composer_prompt_editor.md` | Prompt composition |
| `26_statusline_title.md` | Status line display |
| `27_code_search.md` | Code search integration |
| `28_usage_quotas.md` | Usage tracking |
| `29_workspace_changes_diff.md` | Workspace diff viewer |
| `30_file_editor_patch_review.md` | Patch review interface |
| `31_cline_interop_reuse_strategy.md` | Cline interoperability strategy |
| `32_deterministic_runtime_state_machine.md` | State machine design |
| `33_real_cli_ide_implementation_plan.md` | CLI/IDE implementation plan |
| `34_autonomous_developer_frontend.md` | Autonomous developer mode |
| `34_p1_live_readonly_acceptance.md` | P1 live read-only acceptance |
| `35_p1_live_acceptance_evidence_record.md` | Acceptance evidence |
| `36_p2_p3_client_contract.md` | P2/P3 client contracts |
| `37_opencode_go_reference_and_gap_analysis.md` | OpenCode reference |
| `38_complete_cline_lbe_capability_diff.md` | Capability comparison |

### Linked Workspace (C:\Agents-Memory-Tool-v6-integration) Docs

| Document | Purpose |
|----------|---------|
| `docs/README.md` | LBE documentation library entrypoint |
| `docs/DOCUMENT_INTENT_MANIFEST.md` | Document classification and ownership manifest |
| `docs/CURRENT_STATUS.md` | Human-readable current-state projection |
| `docs/IMPLEMENTATION_PLAN.md` | Ordered roadmap and implementation sequence |
| `docs/LBE_AGENT_LIFECYCLE.md` | Agent lifecycle and state management |
| `docs/AUDIT_FINDING_REVIEW_REGISTER.md` | Finding review and disposition records |
| `PROJECT_INDEX.md` | Root structural authority index |
| `BASELINE_VALIDATION.md` | Historical baseline and validation record |
| `MIGRATION.md` | Legacy-state migration and rollback instructions |
| `WHAT_IS_LBE.md` | Core product definition |

---

## EVIDENCE CLASSIFICATION

| Level | Meaning |
|-------|---------|
| `PROVEN` | Deterministic wrapper lifecycle, typed contracts |
| `SUPPORTED` | Evidence exists but not conclusive |
| `HYPOTHESIS` | Proposed but not verified |
| `UNKNOWN` | Status unclear |
| `BLOCKED` | Cannot proceed |

---

## AUTHORITY FLOW

```
USER -> AGENT (reasons) -> LBE (checks) -> EXECUTION (does) -> RECEIPT (proves)
```

### Runtime Authority
- **LBE Runtime** (`C:\Agents-Memory-Tool-v6-integration`) owns all authority
- **Rust TUI** is a client/projection layer only
- **Cline** provides the embedded provider/reasoning engine

---

## BUILD AND RUN COMMANDS

```powershell
cargo build --release    # Build Rust binary
cargo run --bin lbe      # Run LBE TUI
cargo test               # Run tests
cargo fmt --check        # Format check
.\run-cline-lbe.ps1      # LBE CLI (Cline-powered)
```

---

## PRODUCT VERSION

```
lbe_guard_inspector v2.0.3
```

---

## CHAT HISTORY REFERENCE

```
G:\Datatest\LoopGPTV2\chat_Print\
  chatgpt_export_20260906_051733.json
  chatgpt_export_20260906_191358.json
  chatgpt_export_20260906_210436.json
  chatgpt_export_20260906_213302.json
  chatgpt_export_20260906_213749.json
  chatgpt_export_20260906_224148.json
```

---

## AGENT RULES

1. **Always read this file first** before any work
2. **Never fabricate state** -- only proven, observed evidence counts
3. **Route all authority through LBE runtime** -- never bypass it
4. **Preserve existing behavior** outside requested scope
5. **Use smallest targeted changes** that resolve stated problems
6. **Validate all changes** before reporting completion

---

*This file is the source of truth for all agents operating in C:\LBE-TUI-Lab.*
