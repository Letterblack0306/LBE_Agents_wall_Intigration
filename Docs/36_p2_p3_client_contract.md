# P2/P3 Client Contract â€” Governed Workspace Operations

Status: **READ-ONLY ADAPTER INTEGRATION VERIFIED — FULL P2/P3 REMAINS INCOMPLETE**

Updated: 2026-09-02

Progress: The Rust adapter now requires every `EXECUTED` runtime response to
contain a non-empty LBE-generated `receipt_id` before projecting completion.
The real read-only `workspace.read`, `workspace.list`, `workspace.glob`, and
`workspace.search` paths have been validated against the authoritative LBE
runtime and project receipt/evidence-backed events. Denied, escalated, and
failed statuses remain visible through the existing failure path. Full P2/P3
 governed-operation integration remains incomplete. Patch review, approval routing,
 diff rendering, and typed receipt/evidence projection are implemented and locally
 tested, but credentialed writable execution is not proven.

The provider/catalog adapter reconciliation is also locally proven: registered LBE
provider IDs are decoded by the Rust adapter, real discovery updates the adapter
snapshot, and startup waits for `ModelCatalogDiscovered` before applying a requested
model. This does not prove live authenticated execution for every provider.

This document defines the smallest TUI-facing contract batch for the active
`TUI_P2_P3_GOVERNED_EXECUTION_INTEGRATION` slice. It is an adapter contract,
not a second runtime implementation.

## Authority boundary

```text
TUI request
    -> WrapperClient / LbeWrapper
    -> LBE ToolRegistry
    -> LBE authorization resolver
    -> governed handler
    -> ToolReceipt + evidence
    -> TUI event/projection
```

The TUI supplies user intent and renders results. LBE owns registration,
authorization, workspace containment, filesystem access, evidence, receipts,
validation, and completion truth.

## MCP governed-routing update (2026-09-02)

The BirdEye Rust adapter now follows the same authority boundary as the other
governed operations: `RealLbeWrapper` invokes the LBE product command
`tool mcp.birdeye.<tool>` rather than launching the BirdEye server directly.
The LBE side creates the bounded `mcp.birdeye.*` tool registration and routes it
through `ToolRegistry` and `GovernedToolOrchestrator`; the Rust side only projects
the returned status, authorization, output, receipt, and evidence values.

Local validation passed: LBE focused regression `75 passed`, Rust full regression
`205 passed`, Rust `cargo check`, and Python compilation. This is local adapter /
owner validation, not installed MCP acceptance. The live registry fixture was not
available, so installed BirdEye registration, DENY-zero, ALLOW-exactly-one,
persisted MCP event ordering, and provider continuation remain open.

## Common request envelope

Every operation must carry a unique, stable `operation_id` for its lifetime.
LBE uses that identifier for correlated receipts and idempotent replay
protection.

```json
{
  "operation_id": "operation-<unique-id>",
  "tool_id": "workspace.list | workspace.read | workspace.patch",
  "arguments": {},
  "workspace_id": "<LBE workspace identity>",
  "workspace_root": "<LBE-authorized workspace root>",
  "mode": "regular | audit",
  "client": "lbe-terminal"
}
```

The TUI must not infer or replace `workspace_id`, `workspace_root`, policy,
authorization, evidence, or receipt values with local values.

## Operation contracts

### `workspace.list`

Read-only directory listing. Required argument:

```json
{ "path": "relative/directory/path-or-." }
```

Successful LBE output:

```json
{
  "path": "relative/path-or-.",
  "entries": [
    { "name": "src", "path": "src", "type": "directory" },
    { "name": "README.md", "path": "README.md", "type": "file" }
  ],
  "entry_count": 2
}
```

The associated evidence may contain `ref`, `source_type`, `workspace_id`,
`path`, `entry_type`, `verified`, and operation/tool metadata. The TUI renders
that evidence as provenance; it does not generate replacement evidence.

### `workspace.read`

Read-only UTF-8 file read. Required argument:

```json
{ "path": "relative/file/path" }
```

Successful LBE output:

```json
{
  "path": "relative/file/path",
  "content": "<verified UTF-8 content>",
  "content_sha256": "<SHA-256 of exact bytes read>",
  "evidence_count": 1,
  "missing_evidence": []
}
```

The current runtime bounds reads to 512 KiB, requires workspace containment,
rejects non-UTF-8 content, and hashes the exact bytes read. These constraints
remain LBE-owned and must not be reimplemented as TUI authority.

### `workspace.patch`

Governed single-file replacement. Required arguments:

```json
{
    "path": "relative/existing/file/path",
  "content": "<replacement UTF-8 content>",
  "expected_sha256": "<hash observed before the edit>"
}
```

Successful LBE output extends the governed write result with a unified patch:

```json
{
  "path": "relative/existing/file/path",
  "created": false,
  "updated": true,
  "bytes": 1234,
  "before_sha256": "<before hash>",
  "sha256": "<after hash>",
  "patch": "<unified diff>"
}
```

The operation requires authorization for capability `modify`, is medium risk,
uses no automatic retry, requires an existing regular file, and denies stale
and denies stale writes when `expected_sha256` does not match the current file. The TUI must
show the patch and authorization state before submitting an approval decision. The current
contract does not authorize creating a new file: the target must already be an existing regular
file, so a new temporary-file acceptance requires a separate LBE-owned create capability.

## Common receipt projection

Every governed invocation returns or persists a receipt with this shape:

```json
{
  "operation_id": "<same request operation id>",
  "tool_id": "workspace.list | workspace.read | workspace.patch",
  "status": "EXECUTED | DENIED | ESCALATED | FAILED",
  "receipt_id": "<LBE-generated receipt id>",
  "authorization": {
    "verdict": "<LBE authorization verdict>",
    "capability": "<capability>",
    "rationale": "<LBE rationale>"
  },
  "output": {},
  "evidence": [],
  "error_code": null,
  "error_message": null
}
```

For denied, escalated, or failed operations, `output` may be absent or empty.
The TUI must render the status and rationale without converting an error or
escalation into success.

## TUI event mapping

The existing TUI event vocabulary maps the contract as follows:

```text
workspace.list  -> WorkspaceListingReady
workspace.read  -> WorkspaceReadReady
authorization   -> AuthorizationRequired / AuthorizationResolved
tool lifecycle  -> ToolRequested / ToolStarted / ToolCompleted / ToolFailed
validation      -> ValidationStarted / ValidationCompleted
completion      -> LbeCompletionAccepted
```

The event must retain correlation to `operation_id`, tool identity, and receipt
or evidence references where the runtime provides them. A missing required
field is a visible contract error, not permission to fabricate a value.

## Mode rules

### Normal Agent Runtime

The agent may select an available capability. LBE evaluates the applicable
policy and authorization before execution. `workspace.patch` may proceed only
through the governed approval path.

### Audit mode

Audit mode is strictly read-only. `workspace.list` and `workspace.read` may be
used when authorized by the audit path. `workspace.patch` is unavailable and
must be denied before any handler or filesystem mutation is reached.

## Error handling requirements

The TUI must visibly distinguish:

- unregistered tool;
- invalid arguments;
- authorization denied;
- approval required/escalated;
- workspace escape or forbidden path;
- missing file or directory;
- stale patch hash;
- runtime unavailable;
- malformed or schema/version-incompatible result.

No error state may be displayed as `EXECUTED`, `PASS`, or completed work.

## Scope boundary

This contract does not authorize implementation by itself. Before code changes:

1. validate the runtime output shape with focused LBE tests;
2. confirm the active machine-gated slice;
3. implement defensive Rust decoding and visible schema/version errors;
4. test read-only operations first;
5. test patch review and deny-before-execute behavior;
6. retain raw runtime proof in the LBE repository.

## Implemented adapter step

`C:\LBE-TUI-Lab\src\wrapper.rs` now centralizes the successful-receipt check
for the governed workspace and registered-process projections. An `EXECUTED`
response with a missing or blank `receipt_id` is rejected as a visible wrapper
contract error rather than being projected as completed work.

This step does not prove live P2/P3 acceptance, mutation authorization, or
runtime schema completeness.

Focused adapter tests cover a valid trimmed receipt, missing/blank/non-string
receipt values, preservation of non-executed failure handling, invalid JSON and
non-UTF-8 output, required `workspace.read` content/hash fields, complete
`workspace.list` entry fields, complete `workspace.glob`, `workspace.search`,
and `workspace.patch` success payloads, registered-process execution
references, and projection-only process lifecycle state, latest tool-request
projection, read-only tool detail, and authorization decision projection. The
current Rust validation result is `cargo test --quiet`: `172 passed`.

The adapter now rejects malformed successful workspace payloads instead of
silently projecting incomplete read or list results as completed work.

## Live read-only adapter validation (2026-08-31)

Using the documented real binding:

```text
LBE_WALL_ROOT=C:\Agents-Memory-Tool-v6-integration
LBE_TARGET_WORKSPACE=C:\LBE-TUI-Lab
LBE_WALL_DATABASE=C:\Agents-Memory-Tool-v6-integration\state\lbe-runtime.db
LBE_SESSION_ID=tui-fb2fe3a87da24552910a5b2d8fb45c7d
LBE_WALL_PYTHON=C:\LBE_RUNTIME_PY312\Scripts\python.exe
```

The following focused tests passed after adapting the Rust decoder to the
authoritative LBE receipt envelope (`output.content` / `output.entries`):

```text
real_wrapper_workspace_read_projects_agent_wall_receipt_and_evidence   PASS
real_wrapper_workspace_list_projects_agent_wall_receipt_and_evidence   PASS
real_wrapper_workspace_glob_projects_agent_wall_receipt_and_evidence   PASS
real_wrapper_workspace_search_projects_agent_wall_receipt_and_evidence PASS
```

## Current writable approval status (2026-09-02)

```text
patch review UI                         IMPLEMENTED / LOCAL TESTED
RequestAuthorization routing            IMPLEMENTED / LOCAL TESTED
approval identity binding               IMPLEMENTED / LOCAL TESTED
ALLOW-only patch continuation            IMPLEMENTED / LOCAL TESTED
diff/receipt/evidence projection        IMPLEMENTED / LOCAL TESTED
credentialed workspace.patch             NOT PROVEN
validation/completion after live patch   NOT PROVEN
installed Rust writable acceptance       BLOCKED
```

The installed live attempt was not started because the configured registry path
`C:\Agents-Memory-Tool-v6-integration\.lbe\capabilities\registry.json` was missing,
and the proposed `.lbe-acceptance/live-approval-proof.txt` target does not satisfy this
contract's existing-file requirement. No mutation was performed.

The initial read/list failures were caused by a TUI-side envelope-decoding
mismatch. No LBE runtime authority or source was changed. The real read-only
adapter now projects LBE-generated receipt and workspace evidence references.
This evidence does not prove workspace.patch approval/mutation acceptance,
complete P3 policy/sandbox acceptance, or interactive PTY acceptance.

## Live authorization denial validation (2026-08-31)

Against the same authorized taskless session, the real LBE authorization
resolver returned the following for capability `modify`:

```text
permission: read_only
runtime_policy: audit
verdict: DENY
approval_id: null
rationale: Operation is explicitly forbidden by active policy.
```

The Rust test
`real_wrapper_projects_agent_wall_authorization_denial_for_read_only_session`
now asserts this deny-before-execute behavior and passed. No approval or
workspace mutation was attempted. This verifies the active read-only/audit
policy path; it does not prove an approval-enabled writable session or a
successful `workspace.patch` mutation.

The TUI evidence and receipt panels now project existing workspace- and
execution-derived references from the app state and show explicit unavailable
text when no runtime-derived record exists. They do not manufacture canonical
records.

The TUI tools panel projects only observed request data and explicitly leaves
authorization, permissions, and canonical tool registration to LBE.

The authorization panel projects required/resolved verdicts, capability,
operation/approval identifiers, and rationale from existing LBE events; it does
not perform authorization.

## Source owners

- LBE tool orchestration: `C:\Agents-Memory-Tool-v6-integration\lbe_guard_inspector\runtime\tool_orchestration.py`
- LBE governed patch handler: `C:\Agents-Memory-Tool-v6-integration\lbe_guard_inspector\runtime\governed_coding.py`
- TUI request contract: `src/requests.rs`
- TUI event contract: `src/events.rs`
- TUI adapter boundary: `src/wrapper.rs`
- Active authorization: `C:\Agents-Memory-Tool-v6-integration\.lbe\governance\implementation-gates.json`

## Cross-workspace status (2026-08-31)

The LBE workspace has PASS evidence for governed ToolRegistry/orchestration, receipt-backed continuation, external capability registration, provider continuation, and interface evidence surfaces. The Rust adapter now has isolated live read-only Agent Wall proof and a real PTY connection/clean-exit proof; approval-enabled mutation, interactive receipt/diff/evidence rendering, MCP/control projection, and full installed P2/P3 acceptance remain unproven. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\R6E_GOVERNED_TOOL_ORCHESTRATION_ACCEPTANCE_CHECKPOINT.md:15-27; C:\Agents-Memory-Tool-v6-integration\docs\acceptance\LBE_CLINE_PROVIDER_CONTINUATION_CHECKPOINT.md:13-35; C:\Agents-Memory-Tool-v6-integration\docs\acceptance\CURRENT_IMPLEMENTATION_GATE.md:10-36.
