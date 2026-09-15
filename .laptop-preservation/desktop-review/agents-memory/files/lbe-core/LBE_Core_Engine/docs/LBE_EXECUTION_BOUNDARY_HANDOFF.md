# LBE Execution Boundary Handoff

This document records the current product discussion so future agents do not need the full conversation repeated.

## Status

Current status: UNKNOWN for mandatory enforcement, READY for the architectural distinction.

LBE Core currently has policy, CLI, local executor, preload hook, audit, intent, target, and proof pieces. It is not yet proven as a mandatory execution boundary for every possible agent write, edit, delete, move, or shell path.

## Origin

The LBE concept came from a long-running single workspace that accumulated:

- gates
- contracts
- release controls
- path policies
- execution-surface validators
- agent instructions
- runtime boundary checks

That original workspace proved the need for governance, but it also showed the difference between a governed project and a reusable enforcement engine.

The current LBE Core package is the extracted product direction:

```text
original workspace discipline
        ->
reusable local execution boundary
```

## Core Finding

Based on the original planning, the main missing product shape is a closed execution loop:

```text
Agent proposes intent
        ->
Controller validates
        ->
Adapter executes
        ->
UI/user sees phase, solve state, and proof
        ->
Audit records result
```

The original principle remains correct:

```text
Agents propose.
Controller decides.
Adapters execute.
UI informs.
```

What is not technically forced yet is the complete controller-enforced circuit.

The important failure pattern was:

```text
built-in write path: blocked by host workspace guard
MCP filesystem write path: succeeded
```

That means a project can appear "held by LBE" while another enabled tool still has write authority. In that state, LBE is advisory or auditing, not mandatory enforcement.

Correct diagnosis:

```text
LBE may be configured for the project, but it is not the exclusive execution authority.
```

## Missing Pieces

| Priority | Missing part | Why it matters |
|---|---|---|
| 1 | Mandatory execution boundary | Tests showed agents can still edit through other tools. LBE is not yet the only path. |
| 2 | Adapter isolation | Agents and tools must not hold direct filesystem or shell authority in enforce mode. |
| 3 | Enforced intent lifecycle | Every mutation should require active intent, before snapshot, after snapshot, and proof. |
| 4 | Audit-mode product layer | LBE should report mismatch, missing intent, outside scope, proof incomplete, and validation missing without exposing raw internals. |
| 5 | Capability verification | Environment/tool capability checks must be proven before routing. |
| 6 | Command authenticity | Requester identity, session, nonce, and signature must be present where execution is controlled. |
| 7 | Immutable audit proof | Decisions and execution results need append-only evidence. |
| 8 | Standard error schema | Agents and users need structured failure states instead of random text. |
| 9 | State inside `.lbe/` | Runtime state should not pollute the project root. |
| 10 | Clean SDK/product boundary | Public SDK should expose stable APIs only and avoid internal/private implementation or unrelated CEP/AI leftovers. |

What is not missing:

```text
more README wording
more policy syntax
more marketing
more npm packaging
more agent instruction files
```

Those may help, but they do not complete the original architecture.

## Product Modes

LBE should support two clearly separated modes.

### Audit Mode

Audit mode does not modify agent tools and does not require a server.

It watches intent, file changes, commands, proof state, and validation evidence. It reports missing or inconsistent discipline after the fact.

Audit mode can prove:

- missing intent
- stale intent
- changed files outside declared intent
- forbidden file changed
- validation missing
- proof incomplete
- suspicious mismatch between declared work and actual changes

Audit mode cannot prevent:

- direct write tools
- direct shell tools
- external MCP filesystem tools
- host-native edits
- writes from tools that do not call LBE

Allowed claim:

```text
LBE Audit Mode detects and reports unsafe or undocumented agent behavior.
```

Forbidden claim:

```text
LBE Audit Mode blocks unsafe agent behavior.
```

### Enforce Mode

Enforce mode must sit in the execution path before privileged actions.

The agent can think, inspect, plan, and propose normally, but every mutation must route through LBE before execution:

```text
agent -> LBE bridge -> filesystem/shell
```

Enforce mode requires removing or disabling direct mutation tools outside the guarded route. If direct Edit, shell, or MCP filesystem tools remain enabled, the bridge is optional and enforcement is not true.

Allowed claim only after proof:

```text
LBE Enforce Mode blocks unauthorized routed actions before execution.
```

Stronger claim requires stronger proof:

```text
LBE is the only write/shell authority in this host configuration.
```

## Missing Layer

The missing layer is the mandatory host execution bridge.

It should not only block the agent. It should force a disciplined lifecycle:

```text
intent -> preview -> controlled mutation -> after snapshot -> proof -> receipt
```

Required rule:

```text
No mutation may execute without an active intent_id.
```

Required bridge tools:

```text
lbe_begin_intent
lbe_preview_change
lbe_apply_patch
lbe_write_file
lbe_delete_file
lbe_move_file
lbe_run_command
lbe_finish_intent
lbe_get_proof
```

Minimum mutation checks:

- target is inside workspace root
- target matches active intent allowed files
- target does not match forbidden files
- local policy allows the action
- change preview can be produced
- before snapshot exists
- after snapshot is captured
- proof compares actual changed files to intent

## Existing Pieces

These pieces already exist in the source tree and should be reused:

- `src/state/intentRegistry.js` records intent in JSONL.
- `src/state/targetRegistry.js` records targets and target evidence.
- `src/state/proofRunner.js` compares changed files with intent and writes proof.
- `src/exec/localExecutor.js` routes writes, patches, deletes, and shell commands through validation and audit.
- `src/hooks/register.cjs` can intercept Node `fs` and `child_process` calls inside a Node process launched with the preload hook.

Known limitation:

`src/hooks/register.cjs` only applies inside the launched Node process. It does not intercept Codex built-in Edit tools, external MCP filesystem servers, native host writes, or arbitrary tools outside that process.

## Anonymous User-Facing Layer

The user-facing product should not expose raw internal behavior by default.

Private audit details should retain exact evidence:

- file paths
- command names
- tool route
- intent id
- target id
- audit event ids
- proof failures
- before/after file index

The user-facing layer should show anonymous status labels:

```text
Intent registered
Missing intent
Mismatch detected
Changed outside declared scope
Forbidden target changed
Validation missing
Proof incomplete
Action observed
Action blocked
```

Example mapping:

```text
private evidence:
package.json changed without active intent

user-facing label:
Mismatch detected
```

```text
private evidence:
MCP filesystem wrote outside declared workspace

user-facing label:
Changed outside declared scope
```

```text
private evidence:
no validation command recorded after mutation

user-facing label:
Validation missing
```

This keeps the user interface simple while preserving exact audit evidence locally.

## Recommended Next Build Path

Build audit mode first as the complete no-server layer. Do not jump directly to system-wide blocking.

First product sequence:

```text
v1: Local SDK/CLI audit mode
v2: Optional local guard bridge
v3: Dashboard or hosted layer only if users ask for it
```

Audit mode is the right first ship for a solo developer because it does not require a server, does not require replacing the agent's tools, and does not make a system-wide blocking claim.

Minimum useful audit commands:

```text
npx lbe intent begin
npx lbe snapshot before
npx lbe snapshot after
npx lbe proof
npx lbe status
```

Expected audit flow:

```text
user or agent declares intent
        ->
LBE snapshots before state
        ->
agent works normally
        ->
LBE snapshots after state
        ->
LBE detects mismatch, warning, or missing proof
        ->
LBE writes audit/proof result
```

Normal user-facing statuses should be stable and anonymous:

```text
INTENT_REGISTERED
NO_INTENT_FOUND
MISMATCH_DETECTED
CHANGED_OUTSIDE_SCOPE
PROOF_INCOMPLETE
VALIDATION_MISSING
CLEAN
```

Private evidence should stay in `.lbe/`:

```text
.lbe/
  intent.jsonl
  audit.jsonl
  proof/
    latest.json
  snapshots/
    before.json
    after.json
  policy.json
```

Normal CLI output should show status labels and concise summaries. Exact file paths, tool routes, and internal details should remain in private audit/proof JSON unless the user explicitly asks for detailed evidence.

Then build enforce mode as an optional stronger host bridge:

```text
npx lbe guard --root <workspace> --mode enforce
```

The guard command should clearly print whether it is enforcement or only advisory:

```text
LBE guard active
root: <workspace>
mode: enforce
direct filesystem tools: must be disabled
exposed tools:
- lbe_begin_intent
- lbe_write_file
- lbe_patch_file
- lbe_run_command
- lbe_finish_intent
```

## Required Tests

Audit mode tests:

- clean intent with matching changes produces `CLEAN`
- no intent with changed files produces `NO_INTENT_FOUND`
- changed file outside declared scope produces `MISMATCH_DETECTED`
- missing validation proof produces `VALIDATION_MISSING`
- forbidden file changed produces `CHANGED_OUTSIDE_SCOPE` or a stricter private violation
- exact matching intent and file changes produces proof pass

Enforce mode tests:

- package.json deny rule blocks before write
- outside-workspace write blocks before write
- allowed src repair passes through LBE-routed write
- direct non-LBE tool remains documented as an uncontrolled route unless disabled
- proof records before and after snapshots

## Claim Boundaries

Use these truth labels:

```text
Audit mode: detects and reports
Enforce mode: blocks routed actions
Exclusive host mode: all writes/shells are forced through LBE
```

Do not claim exclusive protection until tests prove every enabled mutation route is either disabled or routed through LBE.

## Final Product Definition

LBE should become:

```text
a local intent, audit, proof, and optional enforcement boundary for agent actions
```

The first reliable product can be auditor mode. The stronger product is enforce mode with a mandatory bridge.
