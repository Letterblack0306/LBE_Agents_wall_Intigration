# Module 33 â€” Real CLI IDE Implementation Plan

## Status

`ACTIVE — RUST/RATATUI CLIENT; REAL LBE + CLINE/OPENCODE REUSE BOUNDARY`

## Product Relevance

CORE / SEQUENCING

## Purpose

Define the ordered integration path for the active Rust/Ratatui client over the
authoritative Python LBE runtime. The separate HTML cockpit in the LBE workspace
is a reference/coordination surface and does not change this repository's active
interface or the machine gate.

The Python TUI is retired/reference-only and has no further implementation path.
The Rust TUI owns interaction and projection contracts only; LBE remains the
authority for providers, governance, authorization, execution, evidence,
receipts, validation, persistence, and completion truth.

This module is a planning gate, not a feature implementation.

## Verified Current State

The current bounded integration state is:
Rust/Ratatui TUI                  ACTIVE INTERFACE / CLIENT PROJECTION
Python TUI                        RETIRED / REFERENCE-ONLY
LBE Python runtime                AUTHORITATIVE BACKEND / GOVERNANCE
Real provider/model binding       LBE PASS; Rust projection integration pending
Audit provider round trip         LBE PASS
Governed read-only tool path      LBE PASS
Receipt/evidence continuation     LBE PASS
Plan/investigation mode           LBE PASS
Runtime/read-only mode            LBE PASS
Read-only mutation denial         LBE PASS
Rust real-wrapper projection      BOUNDED P1 PASS; full integration pending
Installed PTY interactive TUI     NOT PROVEN
Persistent sessions               LBE PASS; Rust integration pending
Canonical evidence/receipts       LBE PASS; Rust structured projection pending
Real Agent Wall attachment        LBE runtime PASS; Rust live adapter integration pending
```

The current runtime boundary is: Rust/Ratatui routes through `LbeWrapper` and
renders authoritative projections from the Python LBE runtime. The Rust client
must not claim or implement independent authorization, execution, validation,
evidence, receipt, provider, or completion authority.

The HTML LBE cockpit at
`C:\Agents-Memory-Tool-v6-integration\.ui-preview\agent_cockpit.html` is a
separate backend-workspace reference/coordination surface. This Rust plan is the
active interface implementation path for `C:\LBE-TUI-Lab`; neither UI owns LBE
runtime authority.

## Non-Negotiable Architecture

```text
LBE Coding TUI / CLI
|
+- editor / composer
+- search / files / diff
+- processes
+- sessions
+- artifacts
+- providers / models
+- agents / subagents
+- evidence / receipts
        |
        v
     LbeWrapper
        |
        v
    RealLbeWrapper
        |
        v
      LBE Wall
        |
+- authorization
+- policy / sandbox
+- agent runtime
+- tools / commands
+- providers
+- persistence
+- validation
+- evidence
+- receipts
```

The TUI may become IDE-like, but canonical authority remains outside the TUI.

## Reference and Reuse Rule

External agent IDEs/CLIs may supply reusable implementation mechanics and interaction patterns, but must not become LBE authority. Cline and OpenCode must be checked before implementing any equivalent capability in the Rust client.

```text
 Cline implementation/reference
 -> agent loop, provider streaming, tools, approvals, MCP, teams, schedules, connectors, SDK/headless flows

OpenCode implementation/reference
-> terminal/desktop/IDE surfaces, build/plan agents, subagents, multi-session, provider breadth, extension patterns

Antigravity-style reference
-> terminal IDE UX patterns

LBE
-> authority, governance, evidence, receipts, validation
```

Allowed reuse means:

```text
ADOPT interaction pattern
ADAPT client primitive
WRAP compatible frontend abstraction
```

Forbidden reuse means:

```text
import another runtime as authority
bypass LbeWrapper
execute commands directly from UI
store raw provider credentials in TUI state
claim evidence/receipt truth without LBE ownership
```

## Upstream Capability Reuse Decision

OpenCode and Cline are reuse sources, not parallel LBE authorities. Their session,
provider, tool, approval, process, MCP, subagent, team, connector, diff, and
headless-event patterns must be adopted, adapted, or wrapped where compatible,
and only behind the existing `LbeWrapper` boundary.

```text
OpenCode / Cline behavior patterns
        -> neutral adapter contract
        -> LbeWrapper / RealLbeWrapper
        -> authoritative LBE runtime
        -> typed LbeEvent / LbeSnapshot projection
        -> Letterblack-branded Ratatui UI
```

The LBE workspace contains Cline reference/source material under
`C:\Agents-Memory-Tool-v6-integration\vendor\cline-cli` and
`C:\Agents-Memory-Tool-v6-integration\unused-in-repo\cline-cli-reference-copy-2026-08-27`.
OpenCode remains an official external source to cross-check at its pinned
revision. Reuse must be selective and source-backed: do not import either
runtime as LBE authority, call their provider/auth services as canonical,
store raw credentials in TUI state, or project their results as LBE evidence or
receipts. The missing implementation is the governed LBE adapter, not a second
generic agent runtime.

## Implementation Milestones

### Milestone A â€” Runtime Attachment Foundation

Build the smallest real-runtime slice first:

```text
1. RealLbeWrapper skeleton
2. attach / disconnect / reconnect lifecycle
3. authoritative snapshot projection
4. real session identity
5. Cline/OpenCode reuse adapter inventory and pinned-source compatibility checks
6. one read-only runtime operation
```

Acceptance:

```text
TUI
-> RealLbeWrapper
-> Agent Wall
-> real snapshot/event
-> TUI
```

Constraints:

- no workspace mutation;
- no provider/model generation;
- no command execution;
- no file writes;
- no direct UI-owned runtime state;
- reconnect must fail closed if runtime truth cannot be recovered.

### Milestone B â€” Real Coding Execution

Add governed execution only after the read-only runtime boundary is proven:

```text
real workspace inspection
real code/file search
real tool registry
real command execution
sandbox / permissions
approval policy
timeouts / abort
background processes
```

Required chain:

```text
User task
-> LbeWrapper
-> LBE authorization
-> governed tool
-> command/file operation
-> evidence
-> validation
-> receipt
-> completion
```

Direct command execution must not be implemented first with governance added later.

### Milestone C â€” Provider + Agent Loop

Connect the model loop after governed tool execution exists:

```text
provider gateway
model catalog
secure credential references
streaming model events
tool calls
agent loop
continuation
context compaction
```

The provider gateway remains LBE-owned. The TUI may display redacted provider/model state but must not own credentials or provider authority.

### Milestone D â€” IDE Workflow

Activate the coding frontend surfaces after the single-agent execution path is governed:

```text
/open
/codesearch
/changes
/diff
artifact review
test-result review
checkpoint compare/restore
command logs
process manager
composer/editor
```

Relevant modules:

```text
22_artifacts_review.md
25_composer_prompt_editor.md
27_code_search.md
29_workspace_changes_diff.md
30_file_editor_patch_review.md
```

Diff/change review should precede multi-agent features.

### Milestone E â€” Persistence

Convert the CLI from an execution console into a durable workspace:

```text
persistent sessions
/resume
session switching
conversation handoff
memory recall
checkpoint persistence
artifact persistence
receipt/evidence history
```

Persistent data must remain LBE-owned or explicitly projected from LBE-owned storage.

### Milestone F â€” Agent Workspace

Only after the single-agent path is deterministic and governed:

```text
subagents
agent teams
background agents
dependency chains
mission log
per-agent process/log view
per-agent evidence/receipts
```

Multi-agent behavior must not be layered on an unfinished single-agent runtime.

## Priority Order

```text
P0  Finish deterministic wrapper invariants
P1  RealLbeWrapper read-only attachment
P2  Real governed tool/command execution
P3  Permissions / sandbox
P4  Real provider + agent loop
P5  Diff / file / artifact review
P6  Persistent sessions / checkpoints / memory
P7  Headless JSON / CI mode
P8  Background processes
P9  Subagents / teams
P10 Connectors / schedules / advanced UX
```

## Gate Conditions

### P0 Gate â€” Deterministic Wrapper Invariants

- [x] Module 32 is closed for the deterministic pre-integration runtime scope.
- [x] Terminal state is emitted exactly once.
- [x] Duplicate terminal events are suppressed or rejected.
- [x] Post-terminal lifecycle events cannot mutate terminal state.
- [x] Timeout/abort/reject/failure/success all terminalize deterministically.
- [x] Retry and reconnect/interruption semantics are implemented and tested behind the wrapper; real Agent Wall attachment remains separate.

### P1 Gate â€” Read-Only RealLbeWrapper Attachment

- [x] `RealLbeWrapper` exists behind the same `LbeWrapper` trait.
- [x] Runtime attach event is projected into `LbeSnapshot`.
- [x] Runtime disconnect event is projected into `LbeSnapshot`.
- [x] Runtime reconnect event is projected into `LbeSnapshot`.
- [ ] Real session identity is displayed and externally accepted in a live configured run.
- [x] At least one read-only operation returns an LBE-owned event (`RefreshRuntimeSnapshot`).
- [x] No mutation-capable operation is enabled.
- [x] Mock mode remains available and truth-labeled.

### P2/P3 Gate â€” Governed Execution

- [ ] Every mutation-capable operation routes through LBE authorization.
- [ ] Tool registry exposes risk and permission metadata.
- [ ] Command execution is sandboxed or explicitly denied.
- [ ] Approval policy produces auditable allow/deny/escalate outcomes.
- [ ] Evidence is produced before validation.
- [ ] Receipt is produced only after validation/completion acceptance.
- [ ] Timeout and abort clear pending work and terminalize exactly once.

### P4 Gate â€” Provider + Agent Loop

- [ ] Provider gateway is LBE-owned.
- [ ] Credentials are referenced, never rendered raw.
- [ ] Model catalog comes from real provider/runtime state.
- [ ] Streaming model events are ordered and recoverable.
- [ ] Tool calls route back through governed execution.

### P5 Gate â€” IDE Workflow

- [ ] Code search results are evidence-linked.
- [ ] Workspace changes are visible before approval.
- [ ] Diff review supports file/hunk navigation.
- [ ] Patch acceptance/rejection is policy-bound.
- [ ] Artifacts link to evidence, validation, and receipts.

### P6 Gate â€” Persistence

- [ ] Sessions survive process restart.
- [ ] `/resume` restores real session state.
- [ ] Checkpoints/artifacts/evidence/receipts remain queryable.
- [ ] Stale or unresolved runtime truth is visible, not guessed.

### P7 Gate â€” Headless JSON / CI Mode

- [ ] Non-TUI mode exists.
- [ ] JSON output is deterministic and schema-versioned.
- [ ] Exit codes distinguish success, validation failure, policy denial, timeout, abort, and runtime unavailable.
- [ ] No interactive prompt occurs in CI/headless mode.

### P8/P9 Gate â€” Background and Multi-Agent

- [ ] Background processes have IDs, states, logs, timeout, and kill/cancel.
- [ ] Subagents have isolated identities and event streams.
- [ ] No event mixing occurs between concurrent executions.
- [ ] Per-agent evidence and receipts are attributable.

## Out of Scope For This Plan

This module does not implement:

- `RealLbeWrapper`;
- real Agent Wall attachment;
- provider integration;
- command execution;
- sandboxing;
- persistence;
- multi-agent runtime;
- UI redesign.

It only records the implementation order and gates.

## Acceptance

- [ ] Roadmap sequencing is explicit.
- [ ] `RealLbeWrapper` first slice is read-only.
- [ ] Governance precedes command/file mutation.
- [ ] Provider/model loop follows governed execution.
- [ ] Diff/file/artifact review precedes multi-agent work.
- [ ] Persistence and headless mode are separately gated.
- [ ] External references are constrained to patterns/primitives, not authority.

## Cross-workspace status (2026-08-31)

The LBE workspace has accepted complete-runtime, session/application, governed-tool, external-capability, provider-continuation, and interface-control slices. The remaining Rust work is configured live adapter/event projection and installed interactive acceptance; do not add another mock authority. Evidence: `C:\Agents-Memory-Tool-v6-integration\docs\acceptance\CURRENT_IMPLEMENTATION_GATE.md:10-36`.
