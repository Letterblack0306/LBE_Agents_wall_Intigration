# Stage 0 — Baseline Freeze

```text
stage: 0
result: PASS
captured: 2026-08-24
worktree: C:\Agents-Memory-Tool-v6-integration
branch: main
upstream: origin/main
HEAD: 090a53f4847279e2515dc84677efdaa995b9c809
origin/main: 090a53f4847279e2515dc84677efdaa995b9c809
ahead/behind: 0/0
staged_paths_at_capture: 0
dirty_paths_at_capture: 65
code_changes_by_stage_0: none
```

The inventory was captured with `git status --short --untracked-files=all` before
this record was created. This record is a new B1 path, so the live dirty count after
record creation is 66.

## Exact one-time classification

### B1 — documentation / navigation / doctrine

```text
.agent/PROJECT_CONTEXT.md
README.md
VALIDATION_CURRENT.md
docs/AUDIT_FINDING_REVIEW_REGISTER.md
docs/CURRENT_STATUS.md
docs/IMPLEMENTATION_PLAN.md
docs/README.md
docs/acceptance/CURRENT_IMPLEMENTATION_GATE.md
docs/acceptance/PUBLICATION_VERSION_2_0_3_PREPARATION_GATE.md
docs/reference/CLI_AGENT_REFERENCE_REVIEW_2026-08-21.md
docs/reference/ui/lbe_architecture_registry.html
docs/reference/ui/lbe_docs_node_map.html
docs/design/AGENT_AGENCY_LBE_AUTHORITY_SEPARATION.md
LBE Documentation-Only Correction Instruction.md
acceptance/README.md
docs/ARCHITECTURE.md
docs/MODES.md
docs/RUNTIME_CONTRACT.md
docs/acceptance/COMPLETE_LBE_AGENT_RUNTIME_GATE.md
docs/acceptance/README.md
docs/acceptance/TERMINAL_WORKSPACE_FOUNDATION_GATE.md
docs/design/LBE_RUNTIME_VISION_DOCTRINE_DRIVEN_ENGINEERING.md
docs/acceptance/WORKSPACE_PRESERVATION_BOUNDARY_MATRIX.md
docs/acceptance/STAGE_0_BASELINE_FREEZE.md
```

### B2 — runtime / provider / user-state

```text
lbe_guard_inspector/cli.py
lbe_guard_inspector/provider_registry.py
lbe_guard_inspector/provider_turn_runtime.py
lbe_guard_inspector/reasoning_config.py
lbe_guard_inspector/runtime/governed_coding.py
lbe_guard_inspector/runtime/tool_orchestration.py
lbe_guard_inspector/credential_store.py
lbe_guard_inspector/runtime/agent_guidance.py
lbe_guard_inspector/user_state.py
tests/test_cli.py
tests/test_provider_registry.py
tests/test_provider_turn_runtime.py
tests/test_agent_guidance.py
tests/test_user_state.py
```

### B3 — TUI / projection; held

```text
lbe_guard_inspector/terminal_projection.py
lbe_guard_inspector/textual_tui.py
tests/test_terminal_projection.py
tests/test_textual_tui.py
```

### B4 — historical transcript / document relocation

```text
docs/PHASE12_END_TO_END_PROOF.md
docs/PHASE_13_CALLBACK_VERTICAL_SLICE.md
docs/PRIORITY_MODULE_REGISTRY.md
docs/VALIDATED_WORKSPACE_MEMORY.md
tests/test differfence/1785460319869_yl0hf/1785460319869_yl0hf.json
tests/test differfence/1785460319869_yl0hf/1785460319869_yl0hf.messages.json
tests/test differfence/1785461332072_pt9mp/1785461332072_pt9mp.json
tests/test differfence/1785461332072_pt9mp/1785461332072_pt9mp.messages.json
docs/history/PHASE12_END_TO_END_PROOF.md
docs/history/PHASE_13_CALLBACK_VERTICAL_SLICE.md
docs/history/README.md
docs/history/agent-evaluations/README.md
docs/history/agent-evaluations/test-differfence-transcripts/1785460319869_yl0hf/1785460319869_yl0hf.json
docs/history/agent-evaluations/test-differfence-transcripts/1785460319869_yl0hf/1785460319869_yl0hf.messages.json
docs/history/agent-evaluations/test-differfence-transcripts/1785461332072_pt9mp/1785461332072_pt9mp.json
docs/history/agent-evaluations/test-differfence-transcripts/1785461332072_pt9mp/1785461332072_pt9mp.messages.json
docs/contracts/PRIORITY_MODULE_REGISTRY.md
docs/contracts/README.md
docs/contracts/VALIDATED_WORKSPACE_MEMORY.md
```

### B5 — quarantine / review; never stage or delete

```text
.agent/evidence/CURRENT_TASK.md
Doc/cline/1787447735839_spg38.messages.json
Doc/cline/1787447735839_spg38_actions.md
Doc/cline/1787447735839_spg38_content.md
```

### Governance exclusion

```text
.lbe/governance/implementation-gates.json
```

The governance path is classified once as an independent governance change and is
excluded from B1–B5 and all documentation-only staging.

## Checks

| Check | Result |
|---|---|
| HEAD, origin/main, branch, upstream recorded | PASS |
| HEAD equals origin/main | PASS |
| Staged inventory empty | PASS |
| Frozen dirty inventory recorded | PASS — 65 paths |
| Every frozen path classified exactly once | PASS |
| Code changes made | PASS — none |
| B4 hash/move validation | DEFERRED to Stage 2 |
| B4 modified-relocation review | DEFERRED to Stage 2 |

Stage 1 is not executed by this record. No staging, commit, push, branch, worktree,
cleanup, delete, governance alignment, TUI decision, or runtime implementation was
performed.
