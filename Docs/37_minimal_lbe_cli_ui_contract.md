# 37 — Minimal LBE CLI/TUI Surface Contract

Status: **ACTIVE UI CONTRACT — IMPLEMENTATION / INSTALLED ACCEPTANCE OPEN**

## Purpose

Define the minimal user-facing terminal surface for the LBE CLI/TUI product.

This contract is intentionally smaller than the earlier panel-heavy prototypes. It is based on the current product boundary:

```text
LBE CLI/TUI = active user-facing product
Cline       = embedded provider/model/reasoning/delegated-agent mechanics
LBE runtime = sole session/governance/tool/evidence/completion authority
Rust        = reference/integration client
```

The UI must project real runtime state only. It must not fabricate provider health, tool results, receipts, child-agent status, completion, approvals, or session state.

## Product identity

Startup identity:

```text
LBE
Lockstep Boundry Engine
LETTERBLACK
```

Normal interactive chrome should use the compact `LBE` identity only.

No Cline branding is permitted in the visible product surface.
No mascot, robot, oversized ASCII logo, gradients, or decorative panels are required.

## Permanent layout

The active CLI/TUI should have only four permanent regions:

```text
┌──────────────────────────────────────────────────────────────┐
│ LBE   workspace   model   MODE                       STATE   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ordered conversation + execution timeline                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ > Message LBE…                                               │
├──────────────────────────────────────────────────────────────┤
│ ctx · session · governed state · one shortcut hint           │
└──────────────────────────────────────────────────────────────┘
```

Permanent regions:

1. compact top runtime line;
2. one ordered conversation/execution timeline;
3. composer;
4. compact status/footer line.

Do not keep permanent sidebars or duplicate information panels for tools, agents, evidence, runtime, settings, objectives, or receipts.

## Remove duplicate permanent state

Do not render the same `mode`, `provider/model`, `session`, or `state` in both header and footer.

Recommended split:

```text
top:
LBE   <workspace>   <model>   <mode>   <state>

bottom:
ctx <usage> · session <short-id> · governed · ctrl+k
```

If a field is unavailable, render a truthful unavailable/unknown state. Do not synthesize it.

## No separate objective strip

The user request belongs in the ordered timeline.

Do not add a permanent objective bar such as:

```text
> No objective submitted
```

The conversation itself is the task context.

## One ordered interaction timeline

Conversation, tool execution, child-agent activity, approvals, validation, receipts, and completion should remain in one time-ordered stream.

Example:

```text
YOU
Inspect the current continuation path.

LBE
Checking the runtime contract.

› read  cline/apps/cli/src/runtime/lbe-tool-adapter.ts
  ✓

› child  inspect parent continuation
  ✓ completed · 1 tool · 2.3s

LBE
The persisted child result is not yet consumed by the parent...
```

Do not scatter the same turn across separate chat, activity, tool, agent, and evidence panels.

## Tool rows

Default rendering must be compact:

```text
› read  workspace/plan.md
  ✓
```

State glyphs:

```text
› executing
✓ completed
! warning
× failed
? approval
```

Do not use emoji in the active product surface.

Expanded detail may show:

```text
tool                 workspace.read
status               EXECUTED
receipt_id           ...
provider_tool_call   ...
lbe_call_id          ...
runtime_operation    ...
duration             ...
```

Only identifiers actually projected by LBE may be displayed.

## Child-agent rows

Do not create a permanent Agents panel.

Render delegated children inline:

```text
› child  inspect provider continuation
  running
```

then:

```text
› child  inspect provider continuation
  ✓ completed · 1 tool · 2.3s
```

Expandable detail may expose authoritative evidence:

```text
child_run_id
child_session_id
spawn_operation_id
tool_receipt_id
runtime_operation_id
provider_tool_call_id
lbe_call_id
terminal_status
```

Cline delegated-agent IDs are correlation metadata only and must not replace LBE lifecycle identity.

## Approvals and diffs

Approval must interrupt the same timeline at the consequential action:

```text
› patch  src/runtime/foo.ts
  ? approval required

  [Approve] [Reject] [View diff]
```

Do not use a permanent approval panel.

Diff review, receipt detail, and evidence detail are transient/expandable views.

## Composer

Normal state:

```text
> Message LBE…
```

Do not keep a permanent full command legend under the composer.

Contextual discovery:

```text
/  -> command suggestions
@  -> context suggestions
#  -> skills only when the active product supports that interaction
+  -> attachment options only when actually available
```

A single compact shortcut hint such as `ctrl+k commands` is sufficient.

## Transient surfaces

The following are transient overlays, pickers, popovers, or expanded rows:

- command palette;
- model/provider selector;
- session selector;
- approval;
- diff review;
- receipt/evidence detail;
- settings;
- diagnostics.

They must not become permanent dashboard regions.

## Color and typography

Use terminal-safe, restrained styling:

```text
background        black / near-black
primary text      near-white
secondary text    gray
accent            one restrained LBE accent
success           green
warning           amber
failure           red
selection         high-contrast neutral/accent
```

Color communicates state, not decoration.

## Truthfulness rule

Never render a runtime fact from UI-local simulation.

Forbidden examples:

```text
fake setTimeout completion
hard-coded provider health
hard-coded latency
invented receipt IDs
invented session IDs
simulated child status
simulated tool execution
```

Required rule:

```text
No runtime fact is displayed unless projected from the actual active runtime/session state.
```

## Implementation target

Primary target:

```text
C:/LBE-TUI-Lab/cline/apps/cli
```

Expected implementation areas are the existing Cline CLI/TUI components and runtime event projection. Reuse existing keyboard/action/runtime mechanics; do not create a second UI state machine or second runtime authority.

The Rust/Ratatui client may mirror this contract only when explicitly scoped as reference/integration work.

## Acceptance requirements

The minimal UI slice is not complete until all of the following are proven on the active Cline product path:

- exactly four permanent regions;
- no permanent objective strip;
- no duplicate header/footer state;
- no permanent agents/tools/evidence/settings side panels;
- tool rows render inline and expand on demand;
- child-agent rows render inline and expand on demand;
- approvals/diffs are transient;
- composer has contextual suggestions rather than a permanent legend;
- visible branding is LBE-only;
- no emoji in active terminal rows;
- all runtime facts originate from real runtime projections;
- existing keyboard and runtime bindings remain functional;
- TypeScript typecheck and focused UI tests pass;
- installed terminal rendering remains separately unproven until PTY/ConPTY acceptance is executed.

## Non-goals

This UI simplification does not authorize:

- a new agent runtime;
- a new child lifecycle owner;
- a new evidence/receipt store;
- changes to LBE authorization semantics;
- exposing `/team` before installed subagent acceptance;
- replacing existing Cline delegated-agent mechanics.

## Resume rule

Local implementation agents should treat this document as the current visual/surface contract and preserve all existing runtime bindings while simplifying the presentation.

If local source is ahead of GitHub, pull/retrieve this contract only and apply it to the current assembled worktree without resetting or discarding local implementation.
