# Cline Interop / Reuse Strategy

## Status
MISSING

## Product Relevance
STRATEGIC

## Purpose
Avoid rebuilding generic coding-agent frontend features already provided by Cline. Determine which LBE TUI modules should be adopted, adapted, wrapped, or implemented natively for LBE governance reasons.

## Core Principle
Cline can provide or inspire the general coding-agent CLI/frontend surface. LBE must remain the authority for authorization, tool execution, workspace mutation, policy decisions, evidence, receipts, validation, memory promotion, and completion truth.

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

## Work Items
- [ ] Inspect Cline CLI/frontend primitives before implementing Modules 17-30.
- [ ] Decide adopt/adapt/wrap/native classification per module with current source evidence.
- [ ] Define allowed interoperability boundary between Cline-like frontend behavior and LBE runtime authority.
- [ ] Prevent direct execution bypass when wrapping or adapting Cline behavior.
- [ ] Record evidence for any native rebuild decision.

## Acceptance
- [ ] Each Module 17-30 has a reuse/native classification before implementation.
- [ ] No generic coding frontend feature is rebuilt without documented reason.
- [ ] LBE authority boundaries remain explicit in every adapted/wrapped flow.
- [ ] Interop decisions are validated against current Cline capabilities and current LBE runtime contracts.
