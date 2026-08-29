# 35 — P1 Live Acceptance Evidence Record

## Purpose

Use this record to capture the observed evidence for `P1_READ_ONLY_REAL_LBE_WRAPPER` without converting missing evidence into PASS.

This file is an evidence template. Populate it only from an authorized live read-only Agent Wall run.

## Binding

Record only non-secret identifiers and paths.

```text
LBE_RUNTIME=real
LBE_WALL_ROOT=<canonical Agent Wall runtime root>
LBE_TARGET_WORKSPACE=<authorized target workspace>
LBE_WALL_DATABASE=<authorized Agent Wall database path or approved locator>
LBE_SESSION_ID=<authorized persisted session>
LBE_TASK_ID=<optional; leave absent when task is null>
LBE_WALL_PYTHON=<optional>
```

Do not record credentials, tokens, provider secrets, or unrelated environment values.

## Repository identity

```text
repository:
workspace_root:
branch:
head:
origin_main:
alignment:
working_tree_status:
```

## Authoritative runtime identity

```text
session_id:
workspace_id:
workspace_root:
permission:
runtime_policy:
task_id: <null is allowed for P1>
project_truth_outcome:
```

## Check 1 — Real attachment projection

Expected condition:

- real runtime binding attaches through `RealLbeWrapper`;
- `LbeSnapshot` reports authoritative connected state;
- no mock substitution occurs.

Evidence:

```text
command_or_action:
observed_connection_state:
observed_projection_source:
observed_session_id:
observed_workspace_id:
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Check 2 — Real identity projection

Expected condition:

- connected `/session` displays the authoritative Agent Wall session ID;
- connected `/session` displays the authoritative workspace identity;
- absent task identity remains absent rather than fabricated.

Evidence:

```text
session_panel_connection_state:
session_panel_session_id:
session_panel_workspace_id:
session_panel_task_state:
session_panel_authority_label:
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Check 3 — Read-only runtime refresh

Expected condition:

- the read-only refresh reaches the configured Agent Wall projection surface;
- returned data is authoritative LBE-owned projection data;
- `insufficient_evidence` remains visible when that is the authoritative result;
- no mock replacement occurs.

Evidence:

```text
request:
projection_type:
projection_read_only:
projection_workspace_id:
projection_session_id:
project_truth_outcome:
error_code_if_any:
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Check 4 — Disconnect/reconnect projection

Expected condition:

- disconnect is projected as disconnected;
- reconnect uses the same authorized real binding;
- authoritative session/workspace identity is restored only when confirmed by the runtime;
- stale or foreign identity is not retained as current truth.

Evidence:

```text
pre_disconnect_state:
disconnected_state:
post_reconnect_state:
post_reconnect_session_id:
post_reconnect_workspace_id:
stale_identity_observed: yes | no
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Check 5 — No mock fallback

Expected condition:

- an unavailable or failed real-runtime condition fails closed;
- the real path never republishes mock state as authoritative real state.

Evidence:

```text
failure_condition:
observed_connection_state:
observed_authority_label:
mock_state_presented_as_real: yes | no
error_or_status:
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Check 6 — No mutation capability

Expected condition:

P1 exposes no enabled path for:

- workspace writes;
- mutation-capable tools;
- command execution;
- provider generation;
- credential rendering;
- permission or governance bypass.

Evidence:

```text
available_real_requests:
mutation_request_available: yes | no
command_execution_available: yes | no
provider_generation_available: yes | no
workspace_write_available: yes | no
credential_material_rendered: yes | no
governance_bypass_observed: yes | no
raw_evidence_reference:
```

Verdict:

```text
PASS | FAIL | BLOCKED
```

## Validation after live checks

Run the normal repository validation only after collecting the live evidence.

```text
cargo fmt --check:
cargo check:
cargo test:
git diff --check:
```

## Final P1 decision

All six checks must PASS before P1 can close.

```text
CHECK_1_REAL_ATTACHMENT=
CHECK_2_REAL_IDENTITY=
CHECK_3_READ_ONLY_REFRESH=
CHECK_4_DISCONNECT_RECONNECT=
CHECK_5_NO_MOCK_FALLBACK=
CHECK_6_NO_MUTATION=

P1_READ_ONLY_REAL_LBE_WRAPPER=
```

Allowed final classifications:

```text
PASS
IMPLEMENTED / LIVE ACCEPTANCE BLOCKED
FAIL
```

## Commit gate

Commit/push P1 implementation only after:

1. all six checks PASS;
2. validation passes;
3. repository identity and diff are verified;
4. evidence references are retained;
5. no P2+ capability was introduced to manufacture P1 evidence.
