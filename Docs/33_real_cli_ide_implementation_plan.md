# Module 33 — Real CLI IDE Implementation Plan

## Status

PLANNED

## Product Relevance

CORE / SEQUENCING

## Purpose

Define the ordered implementation path from the current mock LBE TUI contract preview to a real governed CLI IDE.

This module is a planning gate, not a feature implementation.

## Verified Current State

At repository revision `4f596f71c3f4cee54d37a5b2fe93acdb8add47f6`, the workspace is still pre-integration:

```text
TUI shell                         IMPLEMENTED
MockLbeWrapper                    IMPLEMENTED
Deterministic mock lifecycle      IMPLEMENTED / HARDENING
Provider/model UI contract        IMPLEMENTED MOCK
Evidence/receipt UI contract      IMPLEMENTED/PARTIAL MOCK
Plan/Audit modes                  IMPLEMENTED MOCK
Checkpoint contract               IMPLEMENTED/PARTIAL

RealLbeWrapper                    MISSING
Real providers                    MISSING
Real tool/command execution       MISSING
Real sandbox/policy enforcement   MISSING
Persistent sessions               MISSING
Canonical evidence/receipts       MISSING
Real Agent Wall attachment        MISSING
```

The README remains authoritative for the current runtime boundary: the TUI routes through `LbeWrapper` and renders `MockLbeWrapper` snapshots/events. It must not claim live LBE authorization, execution, validation, evidence, receipts, providers, or model integration until those paths exist.

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

## Reference Use Rule

External agent IDEs/CLIs may inform interaction design, but must not become LBE authority.

```text
Cline-style reference
-> runtime/session/tool/provider patterns

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

## Implementation Milestones

### Milestone A — Runtime Attachment Foundation

Build the smallest real-runtime slice first:

```text
1. RealLbeWrapper skeleton
2. attach / disconnect / reconnect lifecycle
3. authoritative snapshot projection
4. real session identity
5. one read-only runtime operation
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

### Milestone B — Real Coding Execution

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

### Milestone C — Provider + Agent Loop

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

### Milestone D — IDE Workflow

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

### Milestone E — Persistence

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

### Milestone F — Agent Workspace

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

### P0 Gate — Deterministic Wrapper Invariants

- [x] Module 32 is closed for the deterministic pre-integration runtime scope.
- [x] Terminal state is emitted exactly once.
- [x] Duplicate terminal events are suppressed or rejected.
- [x] Post-terminal lifecycle events cannot mutate terminal state.
- [x] Timeout/abort/reject/failure/success all terminalize deterministically.
- [x] Retry and reconnect/interruption semantics are implemented and tested behind the wrapper; real Agent Wall attachment remains separate.

### P1 Gate — Read-Only RealLbeWrapper Attachment

- [ ] `RealLbeWrapper` exists behind the same `LbeWrapper` trait.
- [ ] Runtime attach event is projected into `LbeSnapshot`.
- [ ] Runtime disconnect event is projected into `LbeSnapshot`.
- [ ] Runtime reconnect event is projected into `LbeSnapshot`.
- [ ] Real session identity is displayed.
- [ ] At least one read-only operation returns an LBE-owned event.
- [ ] No mutation-capable operation is enabled.
- [ ] Mock mode remains available and truth-labeled.

### P2/P3 Gate — Governed Execution

- [ ] Every mutation-capable operation routes through LBE authorization.
- [ ] Tool registry exposes risk and permission metadata.
- [ ] Command execution is sandboxed or explicitly denied.
- [ ] Approval policy produces auditable allow/deny/escalate outcomes.
- [ ] Evidence is produced before validation.
- [ ] Receipt is produced only after validation/completion acceptance.
- [ ] Timeout and abort clear pending work and terminalize exactly once.

### P4 Gate — Provider + Agent Loop

- [ ] Provider gateway is LBE-owned.
- [ ] Credentials are referenced, never rendered raw.
- [ ] Model catalog comes from real provider/runtime state.
- [ ] Streaming model events are ordered and recoverable.
- [ ] Tool calls route back through governed execution.

### P5 Gate — IDE Workflow

- [ ] Code search results are evidence-linked.
- [ ] Workspace changes are visible before approval.
- [ ] Diff review supports file/hunk navigation.
- [ ] Patch acceptance/rejection is policy-bound.
- [ ] Artifacts link to evidence, validation, and receipts.

### P6 Gate — Persistence

- [ ] Sessions survive process restart.
- [ ] `/resume` restores real session state.
- [ ] Checkpoints/artifacts/evidence/receipts remain queryable.
- [ ] Stale or unresolved runtime truth is visible, not guessed.

### P7 Gate — Headless JSON / CI Mode

- [ ] Non-TUI mode exists.
- [ ] JSON output is deterministic and schema-versioned.
- [ ] Exit codes distinguish success, validation failure, policy denial, timeout, abort, and runtime unavailable.
- [ ] No interactive prompt occurs in CI/headless mode.

### P8/P9 Gate — Background and Multi-Agent

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