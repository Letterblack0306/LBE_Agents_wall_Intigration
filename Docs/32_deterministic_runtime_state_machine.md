# Module 32 — Deterministic Runtime State Machine

## Contents

- [Module 32 — Deterministic Runtime State Machine](#module-32--deterministic-runtime-state-machine)
- [Status](#status)
- [Product Relevance](#product-relevance)
- [Purpose](#purpose)
- [Current Problem](#current-problem)
- [Required Architecture](#required-architecture)
- [State Ownership](#state-ownership)
  - [Runtime / Wrapper Owns](#runtime--wrapper-owns)
  - [App Owns](#app-owns)
- [Execution Status Model](#execution-status-model)
- [Terminal States](#terminal-states)
- [Terminal Invariant](#terminal-invariant)
- [Session / Execution Synchronization](#session--execution-synchronization)
- [Transition Validation](#transition-validation)
  - [Required Transition Rules](#required-transition-rules)
  - [Invalid Transitions](#invalid-transitions)
- [Lifecycle Identity Tracking](#lifecycle-identity-tracking)
- [Timeout Enforcement](#timeout-enforcement)
  - [Required Runtime Flow](#required-runtime-flow)
  - [Timeout Ownership](#timeout-ownership)
- [Failure Semantics](#failure-semantics)
  - [Required Baseline](#required-baseline)
  - [Retry Semantics](#retry-semantics)
  - [Abort Semantics](#abort-semantics)
  - [Reconnect / Interruption Semantics](#reconnect--interruption-semantics)
- [UI Reducer Simplification](#ui-reducer-simplification)
  - [Remove / Avoid](#remove--avoid)
  - [Keep](#keep)
- [Required Tests](#required-tests)
  - [Terminal Exactly Once](#terminal-exactly-once)
  - [Duplicate Protection](#duplicate-protection)
  - [Ordering Protection](#ordering-protection)
  - [Post-Terminal Protection](#post-terminal-protection)
  - [State Synchronization](#state-synchronization)
  - [Timeout / Abort](#timeout--abort)
  - [Identity Isolation](#identity-isolation)
  - [Retry / Reconnect](#retry--reconnect)
- [Acceptance Criteria](#acceptance-criteria)
- [Out of Scope](#out-of-scope)
- [Integration Gate](#integration-gate)
- [Completion Result](#completion-result)

## Status

REQUIRED_BEFORE_REAL_WALL_ATTACHMENT

## Product Relevance

CORE / BLOCKING

## Purpose

Replace the current split mock execution/session state handling with one deterministic runtime-owned state machine behind `LbeWrapper`.

This module is not a new frontend feature.

It is a correctness prerequisite for the existing TUI contracts before attaching the real Agent Wall.

## Current Problem

The current mock implementation has two overlapping state authorities:

```text
MockLbeWrapper
    mutates LbeSnapshot / session state

App
    mutates local phase + overlapping snapshot/session projection
```

This permits contradictions such as:

```text
UI phase = Completed
runtime/session snapshot = Running
```

The current happy path is tested, but global lifecycle correctness is not enforced for:

- failures;
- timeouts;
- duplicate terminal events;
- out-of-order events;
- post-terminal events;
- aborts;
- retries;
- reconnect/interruption;
- concurrent executions.

## Required Architecture

The target architecture is:

```text
UserRequest
    ↓
LbeWrapper
    ↓
ExecutionStateMachine
    ↓
validated transition
    ↓
authoritative LbeSnapshot + LbeEvent
    ↓
App
    ↓
projection / rendering only
```

The TUI must not independently decide canonical runtime state.

## State Ownership

### Runtime / Wrapper Owns

The runtime-owned state machine must own:

- session status
- execution status
- tool lifecycle
- command lifecycle
- validation lifecycle
- terminal state
- timeout
- retry
- abort
- completion acceptance
- execution identity
- tool-call identity
- command identity
- validation identity/state

### App Owns

The `App` layer should own only UI-local state:

- input/editor state
- panel selection
- scroll state
- local overlays
- shortcut visibility
- navigation
- rendered transcript

Canonical runtime/session state must be projected into the `App`, not authored by it.

## Execution Status Model

Introduce one explicit execution lifecycle model.

Recommended shape:

```rust
enum ExecutionStatus {
    Pending,
    WaitingForApproval,
    Running,
    Validating,

    Completed,
    Failed,
    TimedOut,
    Aborted,
    Rejected,
}
```

Exact naming may follow existing project conventions, but the semantics must remain equivalent.

## Terminal States

The following states are terminal:

- Completed
- Failed
- TimedOut
- Aborted
- Rejected

## Terminal Invariant

Once an execution reaches a terminal state:

```text
NO later lifecycle transition may mutate that execution.
```

Only explicitly permitted informational/read-only operations may occur afterward, such as:

- evidence retrieval;
- receipt lookup;
- transcript inspection;
- artifact inspection.

A second terminal transition must be rejected or ignored deterministically and must not mutate canonical state.

## Session / Execution Synchronization

A completed execution must result in synchronized runtime state.

Required success flow:

```text
ExecutionStarted
    ↓
tool / command lifecycle
    ↓
ExecutionCompleted
    ↓
ValidationStarted
    ↓
ValidationCompleted(Passed)
    ↓
LbeCompletionAccepted
    ↓
execution status = Completed
session status   = Completed
    ↓
SnapshotUpdated / SessionStatusUpdated
    ↓
App renders Completed
```

It must be impossible for:

```text
App = Completed
snapshot.session_state = Running
```

after the terminal transition has been accepted.

## Transition Validation

The runtime state machine must validate lifecycle ordering before events reach the UI reducer.

### Required Transition Rules

At minimum:

```text
ToolCompleted
requires
ToolStarted

CommandCompleted
requires
CommandStarted

CommandFailed
requires
CommandStarted

ExecutionCompleted
requires
ExecutionStarted

ValidationCompleted
requires
ValidationStarted

LbeCompletionAccepted
requires
ValidationCompleted(Passed)
```

Additional existing lifecycle events should receive equivalent transition rules.

### Invalid Transitions

The runtime owner must reject or deterministically ignore:

- duplicate terminal event
- event after terminal
- unknown execution ID
- unknown tool-call ID
- unknown command ID
- wrong execution relationship
- missing intermediate state
- completion before validation
- validation completion before validation start
- tool completion before tool start
- command completion before command start

Invalid transitions must not silently alter canonical state.

## Lifecycle Identity Tracking

Track lifecycle state by identity.

At minimum:

- `execution_id`
- `tool_call_id`
- `command_id`
- validation state

Where applicable, maintain parent linkage:

```text
session
  └─ execution
       ├─ tool call
       │    └─ command
       └─ validation
```

IDs must not be reused across concurrent active lifecycles.

## Timeout Enforcement

The current timeout fields/events are insufficient if they are only projected.

Timeout must become deterministic runtime behavior.

### Required Runtime Flow

```text
ExecutionStarted
    ↓
deadline = execution_start + timeout
    ↓
LbeWrapper::next_wake()
    ↓
deadline reached
    ↓
Running → TimedOut
    ↓
clear/cancel pending execution work
    ↓
terminalize exactly once
    ↓
emit authoritative state/event update
```

### Timeout Ownership

Timeout authority belongs in the runtime/wrapper state-machine layer.

The `App` may display:

- elapsed
- deadline
- warning
- timed-out state

but must not decide when timeout occurs.

## Failure Semantics

Failure events must have explicit deterministic consequences.

### Required Baseline

```text
ValidationCompleted(Failed)
→ execution terminal = Failed

TimedOut
→ execution terminal = TimedOut

Abort
→ execution terminal = Aborted

Reject
→ execution terminal = Rejected
```

For:

- `ToolFailed`
- `CommandFailed`

the runtime must define whether each failure:

```text
A. terminalizes the execution
```

or

```text
B. permits recovery/retry/alternate path
```

That policy must be explicit and testable.

It must not be decided implicitly by the UI reducer.

### Retry Semantics

If retry events are supported, define deterministic retry state.

At minimum:

- retry count
- retry limit
- retry target
- current execution state
- whether retry preserves or replaces execution/tool/command identity
- terminal behavior after retry limit

`RetryLimitReached` must have a defined terminal consequence.

### Abort Semantics

Abort must:

1. identify the active execution
2. prevent additional scheduled lifecycle work
3. transition execution to Aborted
4. transition session consistently
5. emit terminal state exactly once
6. prevent later queued events from mutating the execution

Clearing the queue alone is not sufficient if canonical state is not terminalized.

### Reconnect / Interruption Semantics

For reconnect/interrupted paths, define whether the execution is:

- still running
- paused
- detached
- recoverable
- failed
- aborted

Reconnection must not recreate or duplicate terminal events.

If runtime truth cannot be recovered:

```text
fail closed / mark state unresolved
```

rather than guessing continuation state.

## UI Reducer Simplification

`App::reduce_lbe_event` should become a projection reducer rather than the canonical runtime state machine.

### Remove / Avoid

The `App` should not independently:

- decide execution completion;
- decide canonical session completion;
- decide failure terminalization;
- decide timeout;
- validate lifecycle ordering;
- create runtime IDs;
- alter runtime-owned retry state.

### Keep

The `App` may:

- append transcript lines;
- update local panel/view state;
- render projected snapshots;
- show terminal state;
- show errors;
- maintain scroll/focus/editor state.

## Required Tests

The following tests become mandatory for this module.

### Terminal Exactly Once

- `success_terminal_exactly_once`
- `failure_terminal_exactly_once`
- `timeout_terminal_exactly_once`
- `abort_terminal_exactly_once`
- `reject_terminal_exactly_once`

### Duplicate Protection

- `duplicate_completion_rejected`
- `duplicate_failure_rejected`
- `duplicate_timeout_rejected`
- `duplicate_abort_rejected`

### Ordering Protection

- `tool_completed_before_started_rejected`
- `command_completed_before_started_rejected`
- `validation_completed_before_started_rejected`
- `execution_completed_before_started_rejected`
- `completion_before_validation_rejected`

### Post-Terminal Protection

- `event_after_completion_rejected`
- `event_after_failure_rejected`
- `event_after_timeout_rejected`
- `event_after_abort_rejected`
- `event_after_rejection_rejected`

### State Synchronization

- `snapshot_session_matches_execution_terminal`
- `ui_projection_matches_runtime_snapshot`
- `completed_ui_never_projects_running_session`
- `failed_ui_never_projects_running_session`

### Timeout / Abort

- `timeout_clears_pending_work`
- `timeout_terminalizes_once`
- `abort_clears_pending_work`
- `abort_terminalizes_once`

### Identity Isolation

- `parallel_execution_ids_do_not_collide`
- `parallel_tool_ids_do_not_collide`
- `parallel_command_ids_do_not_collide`

### Retry / Reconnect

- `retry_preserves_valid_state_order`
- `retry_limit_terminalizes_deterministically`
- `reconnect_does_not_duplicate_terminal_event`
- `interrupted_execution_state_is_explicit`

## Acceptance Criteria

Module 32 is complete only when all of the following are true:

- [ ] Exactly one runtime-owned execution/session state machine exists behind `LbeWrapper`.
- [ ] `App` no longer independently authors canonical execution/session terminal state.
- [ ] Success terminalizes execution and session consistently.
- [ ] Failure terminalizes consistently.
- [ ] Timeout is enforced by runtime timing behavior.
- [ ] Abort terminalizes consistently.
- [ ] Rejection terminalizes consistently.
- [ ] Duplicate terminal events cannot mutate state twice.
- [ ] Post-terminal lifecycle events cannot mutate terminal executions.
- [ ] Out-of-order lifecycle events are rejected.
- [ ] Unknown lifecycle IDs are rejected.
- [ ] Tool/command/execution/validation identities are tracked.
- [ ] Retry behavior has explicit state semantics.
- [ ] Reconnect/interruption behavior has explicit state semantics.
- [ ] UI projection agrees with authoritative runtime/session snapshot.
- [ ] Existing successful mock path continues to work.
- [ ] Existing pre-integration mock truth labeling remains intact.
- [ ] All existing tests continue to pass.
- [ ] New deterministic lifecycle tests pass.

## Out of Scope

This module must not:

- attach the real Agent Wall;
- add new coding-frontend features;
- implement roadmap Modules 17–30;
- redesign provider interfaces;
- add direct tool execution to the TUI;
- move authorization into the UI;
- move validation into the UI;
- move evidence or receipt authority into the UI;
- remove `MockLbeWrapper`;
- bypass `LbeWrapper`.

## Integration Gate

Real Agent Wall attachment should remain blocked until this module is closed.

Required gate:

```text
MODULE 32
DETERMINISTIC_RUNTIME_STATE_MACHINE
STATUS = CLOSED
```

Only then should the real adapter replace or coexist with the mock implementation behind:

```text
LbeWrapper
├─ MockLbeWrapper
└─ RealLbeWrapper / real adapter
```

## Completion Result

When complete, record:

```text
MODULE
32_deterministic_runtime_state_machine

STATUS
CLOSED

AUTHORITY
Runtime-owned state machine behind LbeWrapper

TERMINAL INVARIANT
PASS

TRANSITION ORDERING
PASS

TIMEOUT ENFORCEMENT
PASS

FAILURE TERMINALIZATION
PASS

UI/RUNTIME STATE CONSISTENCY
PASS

DUPLICATE / POST-TERMINAL GUARDS
PASS

IDENTITY ISOLATION
PASS

REAL WALL ATTACHMENT GATE
OPEN
```