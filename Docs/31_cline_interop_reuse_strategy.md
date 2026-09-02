# Cline / OpenCode Interop and Reuse Strategy

## Status
`PASS — CLINE/OPENCODE AUDIT COMPLETE; LBE ADAPTER COMPOSITION PROVEN; LIVE PROVIDER ACCEPTANCE OPEN`

## Product Relevance
STRATEGIC

## Purpose
Avoid rebuilding generic coding-agent frontend and runtime features already provided by Cline or OpenCode. Determine which LBE TUI modules should be adopted, adapted, wrapped, or implemented natively only when LBE governance, provenance, or authority requires it.

## Core Principle
Cline and OpenCode provide reusable agent-loop, terminal/IDE interaction, provider/model, session, tool, approval, MCP, subagent, diff, and headless-operation mechanics. Reuse or adapt those capabilities before creating new TUI equivalents. LBE must remain the authority for authorization, tool execution, workspace mutation, policy decisions, evidence, receipts, validation, memory promotion, persistence, and completion truth.

## Current-source reuse evidence

- **Cline:** the official repository exposes a shared agent core across CLI, IDE extensions, and SDK, with interactive/headless operation, plan/act modes, MCP, checkpoints, rules/skills, provider configuration, teams, schedules, connectors, approvals, plugins, and session/history flows. The local LBE audit further proves an `ADAPT` boundary for Cline AgentRuntime continuation/event/tool mechanics.
- **OpenCode:** the pinned local source review below confirms terminal, provider, session, tool, permission, MCP, and extension mechanics. These are reuse inputs, not LBE authority.
- **LBE:** existing runtime owners remain authoritative for session identity, provider policy, authorization, governed dispatch, workspace mutation, evidence, receipts, persistence, validation, and completion.

Official references: `https://github.com/cline/cline`, `https://github.com/cline/cline/tree/main/apps/cli`, `https://github.com/anomalyco/opencode`, and `https://opencode.ai/`. Source and capability claims must be revalidated against the pinned revision used for implementation.

## Pinned OpenCode source review

```text
SOURCE: C:\OpenCode-upstream
REVISION: dc4449df0d52199704ea4989a5a993ebbc605612
BRANCH: dev / origin/dev
PACKAGE: opencode 1.18.25
COMMIT_DATE: 2026-08-29T02:34:49Z
SOURCE_STATUS: committed HEAD inspected read-only; source checkout intentionally removed after audit
```

The source was inspected from the committed `HEAD` tree because the local
checkout reported an empty index with mass deleted/untracked paths. The
abandoned `C:\OpenCode-upstream` checkout was subsequently removed at the
owner's direction. The revision hash and audit conclusions remain as the
source provenance record; no source was copied into LBE.

| Capability family | Classification | OpenCode source seam | LBE boundary |
|---|---|---|---|
| Terminal/TUI rendering and prompt interaction | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/cli/cmd/run/*`, `packages/opencode/src/cli/tui/*` | Rust/LBE owns product projection and identity; OpenCode supplies interaction mechanics only. |
| Provider streaming and turn continuation | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/session/llm/*`, `packages/opencode/src/session/processor.ts` | LBE owns provider policy, session identity, receipts, evidence, and completion. |
| Permission request and approval presentation | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/permission/*`, `packages/opencode/src/cli/cmd/run/footer.permission.tsx` | LBE R6C owns authorization; the client only presents and forwards decisions. |
| Tool registry and tool-loop mechanics | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/tool/registry.ts`, `packages/opencode/src/session/tools.ts` | LBE R6E/ToolRegistry/ToolReceipt owns registration, dispatch, execution, and correlation. |
| Sessions and history | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/session/*`, `packages/opencode/src/storage/*` | LBE owns canonical session, persistence, recovery, and event history. |
| MCP and extension surfaces | `ADAPT_FROM_OPENCODE` | `packages/opencode/src/mcp/*`, `packages/opencode/src/plugin/*` | LBE external-capability registration and governed dispatch remain authoritative. |
| Native filesystem mutation, shell, process, and editor tools | `REJECT` | `packages/opencode/src/tool/{write,edit,apply_patch,shell}.ts` | Direct paths would bypass LBE authorization, containment, receipts, and evidence. |
| Native permission, persistence, completion, and provider authority | `REJECT` | OpenCode permission/session/provider/runtime owners | These concerns already have accepted LBE owners and must not be duplicated. |

### Adapter decision

The smallest safe seam is an LBE-owned adapter that exposes only
LBE-generated governed tool proxies to reusable OpenCode mechanics, routes
proposals through R6C/R6E, returns LBE receipt/evidence-backed results to the
existing continuation loop, and projects persisted LBE events into the Rust
client. OpenCode-native mutation, shell/process, provider, session,
authorization, receipt, evidence, and completion paths remain unavailable as
canonical LBE authorities.

## Classification Vocabulary
- `ADOPT_FROM_CLINE` - use the Cline frontend behavior directly where compatible.
- `ADAPT_FROM_CLINE` - reuse the UX/flow but route authority through LBE.
- `WRAP_CLINE` - integrate with a Cline-compatible frontend or runtime boundary.
- `LBE_NATIVE_REQUIRED` - implement natively because governance/provenance requires LBE-specific semantics.
- `LATER_DECISION` - defer until real integration constraints are known.

## Initial Module Classification
| Module | Area | Reuse Classification | Notes |
|---|---|---|---|
| `17_policy_hooks_permissions.md` | Permissions / policy / sandbox | LBE_NATIVE_REQUIRED | Cline patterns may help UX, but LBE owns enforcement and audit truth. |
| `18_schedules.md` | Schedules | ADAPT_FROM_CLINE | Scheduling UX can be adapted; schedule authority remains LBE. |
| `19_connectors.md` | Connectors | ADAPT_FROM_CLINE / WRAP_CLINE | Prefer reuse for connector ergonomics while preserving LBE session/tool authority. |
| `20_agent_teams.md` | Agent teams | ADAPT_FROM_CLINE | Team/board UX can be adapted; task/session/evidence truth remains LBE. |
| `21_conversation_handoff.md` | Conversation handoff | LBE_NATIVE_REQUIRED + ADAPT_FROM_CLINE | Handoff identity/provenance is LBE-native; UX can be adapted. |
| `22_artifacts_review.md` | Artifacts / diff / test review | ADAPT_FROM_CLINE | Review UX can be adapted; artifact provenance/validation is LBE-native. |
| `23_subagents.md` | Subagents | ADAPT_FROM_CLINE | Subagent UX can be adapted; tool routing and policy remain LBE. |
| `24_projects_settings.md` | Projects / settings | ADAPT_FROM_CLINE | Settings UX can be adapted with LBE project trust and redaction semantics. |
| `25_composer_prompt_editor.md` | Composer / prompt editor | ADOPT_FROM_CLINE / ADAPT_FROM_CLINE | Generic editor UX should be reused where possible. |
| `26_statusline_title.md` | Statusline / title | ADOPT_FROM_CLINE / ADAPT_FROM_CLINE | Generic terminal UX can be reused. |
| `27_code_search.md` | Code search | ADAPT_FROM_CLINE | Search UX can be adapted; file access/evidence routing remains LBE. |
| `28_usage_quotas.md` | Usage / quotas | ADAPT_FROM_CLINE | Provider usage UX can be adapted; verified billing/quota source remains provider/LBE. |
| `29_workspace_changes_diff.md` | Workspace changes / diff | ADAPT_FROM_CLINE | Diff UX can be adapted; checkpoint/receipt linkage is LBE-native. |
| `30_file_editor_patch_review.md` | File / patch review | ADAPT_FROM_CLINE | Patch review UX can be adapted; mutation authority is LBE-native. |

## Reuse-first module cross-check

| Capability | Existing source to reuse/adapt | LBE owner that must remain authoritative | TUI work allowed |
|---|---|---|---|
| Agent loop, streaming, continuation, abort | Cline `AgentRuntime`; OpenCode agent/session mechanics | LBE provider-turn, session, completion, and cancellation owners | Adapter/event projection only |
| Providers and models | Cline provider/SDK gateway; OpenCode multi-provider surface | LBE provider registry, capability, health, and credential policy | Configuration/projection adapter only |
| Sessions and history | Cline session/history flows; OpenCode multi-session | LBE `LbeSessionService`, memory, and persistence owners | Client navigation/projection only |
| Tools, approvals, permissions | Cline tool policies/approval UX; OpenCode plan/build permission patterns | LBE R6C/R6E authorization and governed dispatcher | Approval presentation/request mapping only |
| MCP, plugins, external capabilities | Cline MCP/plugin surfaces; OpenCode extension patterns | LBE external-capability registration and `ToolRegistry` | Registry/projection adapter only |
| Teams, subagents, schedules, connectors | Cline teams/schedules/connectors; OpenCode subagent/multi-session patterns | LBE external capability, session, policy, and receipt owners | Reuse UX/contracts; do not create local executors |
| Diffs, edits, artifacts, review | Cline/OpenCode diff/edit/review mechanics | LBE workspace, checkpoint, evidence, receipt, and validation owners | Read-only review/projection only until governed |
| Headless/JSON/SDK | Cline headless/SDK surfaces; OpenCode CLI/desktop/IDE product split | LBE CLI/product entry and completion contracts | Thin client adapter; stable output mapping |

## Work Items
- [x] Inspect official Cline CLI/frontend and SDK capability surfaces.
- [x] Inspect official OpenCode product and repository capability surfaces.
- [x] Decide reuse/adapt/wrap/native classification per capability family against pinned revision `dc4449d`.
- [x] Define the interoperability boundary between Cline/OpenCode mechanics and LBE runtime authority.
- [x] Implement and validate the LBE contract adapter that prevents direct execution bypass.
- [ ] Record implementation evidence for every capability intentionally rebuilt instead of reused.

## Acceptance
- [x] Each Module 17-30 has a reuse/native classification before implementation.
- [x] Official Cline and OpenCode capability surfaces are recorded as reuse inputs.
- [x] No generic coding frontend feature is to be rebuilt without documented reason.
- [x] LBE authority boundaries remain explicit in every adapted/wrapped flow.
- [x] OpenCode interop decisions are recorded against pinned revision `dc4449d` and the current LBE authority boundary.
- [x] Validate adapter composition against current LBE runtime contracts and installed Python/TUI behavior.
- [ ] Validate live authenticated OpenCode execution and visible installed TUI projection.


## Cross-workspace status (2026-08-31)

LBE workspace completed the Cline source audit and the pinned OpenCode source review. Both are reuse inputs behind an LBE-owned adapter; direct native mutation/execution tools remain rejected. The adapter and installed provider registry composition are proven; live authenticated provider execution and installed TUI projection remain open. Evidence: `C:\Agents-Memory-Tool-v6-integration\lbe_guard_inspector\cline_reasoning_provider.py`, installed provider list, and OpenCode revision `dc4449d` above.
