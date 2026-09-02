# 34 â€” P1 Live Read-Only Acceptance

## Scope

This document defines the bounded live acceptance gate for `P1_READ_ONLY_REAL_LBE_WRAPPER`.

P1 proves read-only attachment and authoritative projection only. It does **not** require provider execution, governed mutation, command execution, sandboxing, persistence work, or a provider-created task lifecycle.

## Runtime authority

The live source of truth is the canonical Agent Wall read-only projection surface.

For P1, an authorized persisted session is sufficient when it resolves to the target workspace and read-only/audit policy.

`LBE_TASK_ID` is optional for the P1 session attachment path. A missing task record must remain visible as `task: null`; it must not be fabricated and must not force provider execution merely to satisfy P1.

A task ID becomes required only for projections whose contract explicitly requires task-scoped state, such as task completion validation.

## Required non-secret binding

```text
LBE_RUNTIME=real
LBE_WALL_ROOT=<canonical Agent Wall runtime root>
LBE_TARGET_WORKSPACE=<authorized target workspace>
LBE_WALL_DATABASE=<authorized Agent Wall database>
LBE_SESSION_ID=<authorized persisted session>
LBE_WALL_PYTHON=<optional; use when normal python does not resolve Agent Wall>
```

Optional for P1:

```text
LBE_TASK_ID=<authorized task when one already exists>
```

Do not create a provider task solely to populate this optional field.

## Six bounded acceptance checks

### 1. Real attachment projection

Attach using the real runtime binding.

PASS only if the TUI projects the authoritative connection state into `LbeSnapshot` and does not substitute mock state.

### 2. Real identity projection

PASS only if the connected `/session` view displays the real Agent Wall `session_id` and workspace identity for the authorized target workspace.

A task may be absent during P1 and must be represented truthfully as absent.

### 3. Read-only runtime refresh

Issue the existing read-only runtime refresh request.

PASS only if the returned projection is LBE-owned authoritative data from the configured real runtime path.

`project_truth = insufficient_evidence` is valid authoritative data and must remain visible as such; it is not converted into PASS and is not silently replaced by mock data.

### 4. Disconnect/reconnect projection

Exercise disconnect and reconnect against the same authorized real binding.

PASS only if attachment state changes are projected accurately and stale/foreign identity is not retained as current truth.

### 5. No mock fallback

Force or observe an unavailable real-runtime condition.

PASS only if the real path fails closed and never republishes mock state as though it were authoritative real state.

### 6. No mutation capability

Inspect the connected P1 surface and submit only the approved read-only request set.

PASS only if P1 exposes no mutation-capable tool, command execution, provider generation, workspace write, credential rendering, or permission bypass.

## Acceptance result

P1 may be classified `PASS` only when all six checks are supported by observed live evidence.

If the persisted session is missing or identity cannot be resolved:

```text
P1_READ_ONLY_REAL_LBE_WRAPPER
= IMPLEMENTED
= LIVE ACCEPTANCE BLOCKED
```

If an authorized persisted session exists but its task is `null`, continue the P1 read-only checks without fabricating `LBE_TASK_ID`.

Provider/task creation belongs to later governed runtime work unless a specific P1 read-only contract proves otherwise.

## Commit gate

Do not advance to P2 merely because local unit tests pass.

After all six live checks PASS:

1. record the live acceptance evidence;
2. run the normal Rust validation suite;
3. verify repository diff/identity;
4. commit and push P1;
5. only then evaluate the P2 gate.

## Prohibited shortcuts

- Do not fabricate session or task identity.
- Do not use another repository's session as authority.
- Do not create provider execution solely to manufacture a P1 task.
- Do not treat `insufficient_evidence` as `PASS`.
- Do not fall back from real mode to mock while claiming real attachment.
- Do not start P2+ mutation/provider work before P1 live acceptance passes.


## Cross-workspace status (2026-08-31)

This is a bounded historical P1 acceptance contract for the Rust wrapper. The current LBE workspace has progressed to accepted complete-runtime, session/application, provider continuation, governed-tool, and interface-control slices, but this document does not prove full Rust integration or P2/P3 mutation capability.

