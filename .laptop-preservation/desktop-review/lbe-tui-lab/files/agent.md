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
# LBE TUI — End-to-End Agent Instructions

This supersedes the earlier `LBE_TUI_ENHANCEMENT_PLAN.md` and
`LBE_TUI_MODULATION_FINISH_INSTRUCTIONS.md` — those were written before the
canonical knowledge base (`GPT-Knowledge`) was located. Work through the
phases in order. Each phase has a verification step; do not start the next
phase until the current one's verification passes. This project's history
so far has one repeated failure mode — batching several changes before
checking any of them — so the phase structure below is deliberately small
and sequential.

## Phase 0 — Ground yourself in canonical knowledge (read-only, do first)

Before touching any code, read these from `github.com/Letterblack0306/GPT-Knowledge`,
in this order:

1. `000_START_HERE.md` and `knowledge-index.json` — routing, not content.
2. `ai-agents/unified-agent-engineering-methods.md` — canonical
   agent-engineering method. Method first, source second: diagnose the
   actual problem before picking a technique.
3. `letterblack-branding/industrial-dark-ui-system.md` — the canonical
   Letterblack UI/branding system (palette, typography, density, cockpit
   layout, state semantics, component language). **Every UI decision made
   in this session before this document was located — the red/ink/cyan
   palette, the four layout-direction prototypes, the setup-first
   landing — was inferred from an HTML reference file, not from this
   canonical source. Treat all of it as provisional until checked against
   this doc, not as settled.**
4. `local-models/lm-studio-runtime-and-agent-integration.md` — needed for
   Phase 2.
5. `ai-agents/letterblack-governance-debugging-references.md` — only if
   Phase 1 or later work touches authority/guard/policy/completion
   boundaries. Do not preload it otherwise.

Do not preload every domain in the knowledge base — only what's listed
above, plus anything a later phase explicitly names.

**Verification:** you can state, in your own words, what the Industrial
Dark system says about color, density, and layout — not just that you
opened the file.

## Phase 1 — Resolve blocking infrastructure state

These are open, unverified, or hung threads from direct investigation this
session. None of the later work is trustworthy until these are closed.

1. **Confirm the `LBE-TUI-Lab` fast-forward.** A stash (`pre-fastforward
   local hand-patches`) was created and a `git merge --ff-only origin/main`
   was attempted but its result was never observed (command hung/timed
   out with no output). Re-run standalone, `--no-pager`:
   ```
   git merge --ff-only origin/main; git status --short --branch; cargo check --message-format=short 2>&1 | Out-String -Width 200
   ```
2. **Decide the fate of the uncommitted Cline-launcher work** in
   `C:\LBE-TUI-Lab\cline\` (real, validated-locally work — a compiled
   `cline.exe` v3.0.61, an LBE-authority TypeScript adapter — with zero
   git history backing it). Commit it to its own branch before Phase 1.1's
   fast-forward or any stash-pop risks it.
3. **Fix `git fetch` hanging on `C:\Agents-Memory-Tool-v6-integration`**
   (remote: `Letterblack0306/LBE_Presistent_Agent_wall`). Zero output
   before timeout even with `GIT_TERMINAL_PROMPT=0` — check
   `git config --get credential.helper` and whether a GUI credential
   manager is intercepting the request invisibly to a non-interactive
   shell. May need a cached PAT or an SSH remote instead of HTTPS.
4. **Note, don't yet act on:** the Drive sync shows `LBE-TUI-Lab` hasn't
   synced since Sept 8, while sibling projects (`brew`, `Agents Memory`)
   synced Sept 12 — a 4-day gap worth being aware of when trusting "current
   state" claims from any source other than the live machine.

**Verification:** `cargo check` on `LBE-TUI-Lab` passes clean, `git fetch`
on `Agents-Memory-Tool-v6-integration` returns without hanging, and the
Cline-launcher work has a commit hash, not just a working-tree presence.

## Phase 2 — Resolve the `model.error`

1. Find the actual `--provider-config` value `RealLbeWrapper` passes to
   `lbe_guard_inspector.product_entry` (not confirmed which file this
   resolves to — `reasoning-provider.json` is a strong candidate, not a
   proven one).
2. Apply `local-models/lm-studio-runtime-and-agent-integration.md` from
   Phase 0 to check: is an LM Studio (or equivalent) server actually
   running on the configured endpoint (`127.0.0.1:1234` in
   `reasoning-provider.json`)? Is the `model` field still the literal
   placeholder `"replace-with-provider-model-id"`?
3. Fix whichever of those is actually wrong, using the LM Studio doc's
   guidance on model discovery rather than guessing a model name.

**Verification:** a real conversational turn submitted through
`RealLbeWrapper` completes without a `model.error` event, and the
response content is inspected, not just the absence of an error.

## Phase 3 — Workspace cleanup

Safe to do now that Phase 1 has resolved what's real vs. debris:

1. Remove `cline.failed-checkout-*`, `cline.incomplete-*`,
   `cline.partial-*` — confirmed debris from before the working `cline/`
   checkout succeeded.
2. Fix or remove the malformed folder
   `Agents-Memory-Tool-v6-integrationlbe_guard_inspector` (concatenated
   path segments, clearly not intentional).
3. Consolidate the three launchers (`lbe-cli.ps1`, `lbe.bat`, `lbe.ps1`)
   into one, or document why three are genuinely needed (e.g. different
   invocation contexts) — don't leave three with no stated reason.
4. Pick one source of truth for module status
   (`status.json`/`STATUS.md`/`README.md`'s table currently duplicate each
   other) and either drop the redundant two or generate them from it.

**Verification:** `git status --short` on `LBE-TUI-Lab` shows no untracked
debris, and there is exactly one launcher script or a documented reason
for more than one.

## Phase 4 — Reconcile UI direction against the canonical system

This is where Phase 0's `industrial-dark-ui-system.md` actually gets
applied, replacing inference with the real spec.

1. Compare the Industrial Dark system's palette/density/layout guidance
   against everything prototyped this session: the reconstructed welcome
   screen, the four structural directions (Boundary View, Ledger-centric,
   Dashboard-first — rejected, Setup-first), and the declutter directive.
   Where they conflict, the canonical doc wins.
2. The **setup-first landing direction** (provider + runtime selection as
   the actual landing task, Plan/Audit mode replacing the industry-standard
   Plan/Act pairing as a visible differentiator) was the last direction
   settled on before this canonical doc was found. Re-validate it against
   Industrial Dark's "cockpit layout" and "state semantics" guidance
   specifically — it may already match, or may need real adjustment, not
   just re-coloring.
3. Only after reconciliation, resume closing the panel-consistency gap
   from the earlier audit (`/mcp`, `/tools`, `/evidence`, `/receipts` were
   static placeholders; `/evidence` and `/receipts` already have real data
   hooks to wire up first).

**Verification:** the implemented (or re-implemented) landing screen can
be checked line-by-line against specific statements in
`industrial-dark-ui-system.md`, not just "it looks similar to the mockup
from the session."

## Phase 5 — Re-audit module status against current code

The 15-module doc package (`Docs/01`–`Docs/15_session_memory_recall.md` —
note: 15, not 14; a module was added since the original audit) was last
verified against `main.rs` before the 8-file split and the "proven client
composition" commits. Re-run the same evidence-gathering process used
originally — grep for actual command/panel wiring per module — rather than
trusting the old `Evidence/Notes` entries, which predate significant
changes (`app.rs` alone gained 109 lines across those commits).

**Verification:** every module's status and Evidence/Notes section cites a
specific function, type, or test that exists in the *current* `src/` tree,
checked this session, not carried over from the earlier audit.

## Phase 6 — Remaining feature work

Only after Phases 1–5 are verified. In priority order:

1. **Plain/non-TUI CLI mode** — `main()` currently unconditionally takes
   over the terminal; blocks any automation or scripted use.
2. **Terminal compatibility** — `NO_COLOR`, ASCII fallback, wide-character
   width. Currently zero work started.
3. **Lifecycle acceptance** — PTY-driven tests for quit/Ctrl+C/Ctrl+D/panic
   terminal-restore behavior. The mechanism looks correct by inspection but
   is unproven.
4. **Cross-workspace packaging** (compiled Cline client + LBE runtime wheel
   + Cline worker + launcher + config + integration manifest) — the
   Cline-launcher status report names this as the next required step and
   explicitly not release-ready.

## Standing rule for every phase above

Verify after each individual change, not after a batch. Every major
setback this session — the interleaved function bodies in `app.rs`, the
duplicate type definitions in `types.rs`, the null-byte `build_errors.txt`
red herring — traces back to a check being deferred until "the end" of some
larger unit of work instead of happening immediately after each step.