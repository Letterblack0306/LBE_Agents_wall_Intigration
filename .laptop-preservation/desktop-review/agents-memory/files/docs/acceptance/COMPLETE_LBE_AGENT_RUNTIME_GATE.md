# Complete LBE Agent Runtime Gate

Status: **CLOSED — COMPLETE RUNTIME AND SESSION CONTRACT PROVEN — PUBLICATION PAUSED**

## Machine-selected state

```text
phase: COMPLETE_LBE_AGENT_RUNTIME
slice: NONE
slice_result: CLOSED
status: CLOSED
implementation_allowed: false
architecture_changes_allowed: true (explicit user authorization)
next_phase_locked: true
publication_controls: false (nested publication governance records)
```

The machine gate at `.lbe/governance/implementation-gates.json` is the execution authority. This document is the human-readable projection.

## Scope

Deliver one local LBE agent runtime. Providers supply reasoning only; LBE owns workspace identity, doctrine/mode, policy, authorization, governed dispatch, receipts, evidence, persistence, recovery, and deterministic completion. The terminal is the user-facing LBE projection/control client and must not become a second runtime.

```text
open LBE
  -> resolve workspace/session/provider/profile/doctrine
  -> load bounded project context
  -> provider/agent reasons and requests a capability
  -> LBE authorizes before execution
  -> approved adapter executes
  -> ToolReceipt/evidence returns
  -> provider continues
  -> LBE validates completion
  -> LBE interface projects result/evidence/diff/uncertainty/next action
```

## Existing owners to reuse

- `SessionMemoryRuntimeBridge`, `WorkspaceMemoryStore`, `SessionOperationalHistory`, and R5 recovery owners for session/task/checkpoint/recovery persistence;
- R6C authorization and R6E `GovernedToolOrchestrator` / `ToolRegistry` / `ToolReceipt` for governed capability dispatch;
- `CodingCompletionRuntime`, task completion policy, trusted completion-evidence producers, and the existing completion gate for deterministic completion;
- `MemoryPromoter` for evidence-gated durable memory promotion;
- provider registry/configuration/health and provider turn runtime for reasoning continuation;
- CLI/product entry plus terminal projection/Textual client for entry and presentation.

No parallel session, provider, authorization, executor, receipt, evidence, recovery, memory-promotion, or completion owner may be introduced.

## Completed product slices

```text
VERSIONED_USER_STATE_AND_PROVIDER_PROFILE_LIFECYCLE = PASS
DOCTRINE_TO_PROVIDER_CONTEXT_BRIDGE                 = PASS
WORKSPACE_HYGIENE_GOVERNED_DELETION                = PASS
MANDATORY_GOVERNED_AGENT_MUTATION_DISPATCH          = PASS
GOVERNED_EXTERNAL_CAPABILITY_REGISTRATION           = PASS
FIRST_RUN_LIVE_SESSION_ENTRY                        = PASS
INSTALLED_CAPABILITY_REGISTRY_DISCOVERY             = PASS
LBE_INTERFACE_CONTROL_EVIDENCE_SURFACES             = PASS
```

Latest validated slice:

### LBE_INTERFACE_CONTROL_EVIDENCE_SURFACES — PASS

Implementation HEAD: `9ca27a1498afa017ec0c5a449d80882ca0958a73`

LoopTool acceptance:

```text
COMMAND HASH = 334C15A0913D56BE5D6EC6057BA5B66909B06C72F745FA92A5D3281837821C04
MACHINE_BINDING = PASS
focused regression = 53 passed
full regression = 763 passed
local exception = ?? lbe-tui/ (reference-only, untouched)
```

Checkpoint: `docs/acceptance/LBE_INTERFACE_CONTROL_EVIDENCE_SURFACES_CHECKPOINT.md`.

## Completed slice — RECOVERY_COMPLETION_PROMOTION_INTEGRATION

### Proven gap

The normal governed coding path already:

1. resolves and persists an immutable LBE completion contract;
2. captures the pre-task live repository baseline;
3. runs provider reasoning through existing runtime owners;
4. keeps provider `COMPLETED` provisional as `RUNNING / AWAITING_VALIDATION`;
5. produces trusted `source_change`, `focused_test`, and `git_status` evidence.

Before this slice, the normal gateway stopped there. It did **not** call the already-proven `CodingCompletionRuntime.finalize()` path automatically. Deterministic completion therefore existed but was not composed into the normal product lifecycle.

### Implementation direction

Reuse the existing owners only:

```text
coding request
  -> immutable completion contract
  -> R5 single-attempt persisted recovery identity for mutation-capable reasoning
       max_attempts=1
       idempotent=false
       no automatic mutation retry
  -> CodingCompletionRuntime.run_reasoning
  -> provider COMPLETED remains provisional
  -> MemoryPromoter stores task_complete as TEMP / UNVERIFIED
  -> trusted completion evidence producers
       source_change
       focused_test
       git_status
       each may use idempotent bounded recovery for transient timeout/tool failure only
  -> existing CodingCompletionRuntime.finalize
  -> existing completion gate
       READY      -> COMPLETED / VALIDATED_COMPLETION
       FAILED     -> FAILED / VALIDATION_FAILED
       INCOMPLETE -> BLOCKED / VALIDATION_INCOMPLETE
  -> READY only: promote the same task_complete proof to VERIFIED
```

New code may compose these owners but may not create another evaluator or promotion database.

### Required acceptance evidence

- provider `COMPLETED` is not itself final LBE completion truth;
- provisional `task_complete` memory is `UNVERIFIED` before a READY decision;
- normal coding path automatically calls the existing completion gate after producer-bound evidence exists;
- READY sets canonical task status `COMPLETED` and product outcome `VALIDATED_COMPLETION`;
- READY alone upgrades the same completion proof to `VERIFIED`;
- failed/incomplete validation never promotes verified completion truth;
- mutation-capable provider reasoning has `max_attempts=1` and is never automatically retried;
- exact request replay is blocked after terminal single-attempt recovery identity;
- trusted validation/evidence producers may retry only idempotent transient failures within bounded R5 policy;
- persisted recovery state survives `SessionMemoryRuntimeBridge` reconstruction;
- terminal successful recovery identity prevents duplicate execution under the same task/operation identity;
- no second recovery, completion, memory-promotion, session, provider, or execution owner exists;
- focused recovery/completion/gateway regression passes;
- full suite passes;
- `git diff --check` and protected reference preservation pass.

## Completed slice — INSTALLED_PACKAGE_END_TO_END_ACCEPTANCE

The remaining complete-runtime requirement was installed-artifact proof. Build
and install the canonical package into an isolated acceptance environment and
prove entrypoint/import isolation, session/provider persistence, installed
capability projection, governed execution receipts/evidence, deterministic
completion and verified promotion, recovery reconstruction, and installed
Textual projection. This slice adds no runtime authority and does not activate
the preserved lifecycle patch or the untracked `lbe-tui/` reference.

The acceptance is recorded in
`docs/acceptance/INSTALLED_PACKAGE_END_TO_END_ACCEPTANCE_CHECKPOINT.md`.
The complete runtime gate is now PASS; publication remains separately locked.

## Completed product slice — SESSION_APPLICATION_CONTRACT_UNIFICATION

The authorized product slice unified CLI and Textual session/provider
lifecycle operations behind one shared `LbeSessionService` contract. It must
reuse `SessionMemoryRuntimeBridge`, `WorkspaceMemoryStore`, `ProviderRegistry`,
and `PersistentTurnControl`; it must not introduce a second session, provider,
persistence, execution, authorization, receipt, or completion authority.

The preserved four-file patch was hash-verified, reconciled against current
`main`, applied, tested, and recorded in
`docs/acceptance/SESSION_APPLICATION_CONTRACT_UNIFICATION_CHECKPOINT.md`.

## Closure state

```text
COMPLETE_LBE_AGENT_RUNTIME = PASS
SESSION_APPLICATION_CONTRACT_UNIFICATION = PASS
ACTIVE_SLICE = NONE
NEXT_PRODUCT_SLICE = NOT_ACTIVATED
PUBLICATION = LOCKED / NOT AUTHORIZED
```

The machine gate is closed until a new product intent is explicitly bound.

## Current remaining product sequence

After this slice passes:

```text
installed-package end-to-end acceptance
```

That final product gate must exercise the installed artifact rather than source-only imports and prove the normal start/session/provider/governed capability/evidence/completion path from the installed distribution.

## Invariants

- Credentials exist only in the host credential store and outbound transport.
- Cloud provider failure is explicit; another provider/model is never silently substituted.
- MCP, plugins, subagents, network, and hosted-service capabilities are registrations behind LBE dispatch and receive policy, receipts, evidence, and scoped parent identity.
- Ordinary policy-covered work is automatic. High-risk authority expansion uses a separate explicit decision; there is no generic approval queue.
- Provider prose cannot decide completion.
- Mutation-capable reasoning is not automatically retried.
- Completion evidence classification belongs to registered LBE producers, not the provider.
- No integrated agent receives a direct mutation capability that bypasses LBE pre-action authorization and approved adapters.
- Decision identity, operation identity, receipt, recovery state, validation evidence, and completion truth remain correlated from proposal through completion.
- Pre-action authorization, execution evidence, deterministic validation, and post-validation memory promotion remain separate control layers.

## Exclusions

- publication, tagging, or GitHub release before the publication gate is explicitly reactivated;
- provider API-token fallback without separate authorization;
- parallel session, provider, authorization, executor, receipt, evidence, recovery, memory-promotion, or completion systems;
- automatic retry of mutation-capable provider reasoning;
- direct verified promotion of provider/model completion prose;
- treating `lbe-tui/` or `lbe-core/` reference material as canonical runtime authority.
