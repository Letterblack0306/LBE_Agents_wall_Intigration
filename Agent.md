# LBE-TUI-Lab Agent Operating Contract

## Purpose

This file is the workspace-local operating contract for agents working in
`C:\LBE-TUI-Lab`.

It is **not** the global LBE runtime/status authority. Agents must establish
current project truth before changing code.

## Required authority order

For implementation, debugging, acceptance, or UI work, use this order:

```text
1. explicit current user instruction
2. live runtime evidence
3. current local worktree/source and Git identity
4. LBE machine gate / active governance intent
5. project-owned acceptance checkpoints
6. C:\Agents-Memory-Tool-v6-integration\docs\CURRENT_STATUS.md
7. accepted project-specific interaction/design contract
8. GPT-Knowledge canonical engineering/UI guidance
9. reference/research documents
10. historical chats, prototypes, and superseded plans
```

Do not promote a lower source over a higher one.

## Product identity

```text
PRODUCT                         = LBE
RUNTIME / GOVERNANCE AUTHORITY  = LBE Persistent Agent Wall
ACCEPTED PRODUCT-SURFACE DIR    = Cline CLI/TUI mechanics under LBE authority
RUST / RATATUI                  = reference / integration client
CLINE                            = reasoning/provider/UI mechanics; not authority
```

The governing invariant is:

> The reasoning agent owns cognition. LBE owns capabilities, authorization,
> governed execution, receipts/evidence, persistence, validation, and completion
> truth.

Cline or Rust must never become a second owner for session identity,
authorization, execution, receipt/evidence truth, persistence, or completion.

## Linked authoritative runtime workspace

```text
C:\Agents-Memory-Tool-v6-integration
```

Before significant work, inspect at minimum:

```text
.lbe/governance/implementation-gates.json
docs/CURRENT_STATUS.md
relevant acceptance checkpoint(s)
current Git status / HEAD / origin alignment
```

GPT-Knowledge is methodology/design guidance, not runtime authority. For UI work,
load the canonical Letterblack Industrial Dark UI system before inventing visual
direction.

## Locked terminal interaction baseline

The September 5 LBE interaction contract is locked unless the user explicitly
changes it. The workspace README records the consolidated contract.

Do not create new alternative UI directions, setup/dashboard concepts, or
replacement layout plans before reconciling the current build against that
contract.

Required interaction invariants include:

```text
primary focus       = conversation + active execution + composer
secondary metadata  = model / mode / git / diff / context / shortcuts
context bar         = real context-window utilization
idle composer       = [I] Message LBE…
active [I] state    = bounded runtime-driven activity animation
active process      = max 3 raw event lines, internally scrolling
expanded process    = explicit user expansion to full history
completed process   = one-line ordered summary
next process        = previous process auto-collapses
UI state            = authoritative runtime projection only
```

The visual system is Letterblack Industrial Dark. Do not reverse-engineer a new
palette from prototypes when GPT-Knowledge already defines the canonical tokens
and state semantics.

## State-truth rules

Never conflate these states:

```text
configured != connected
connected  != healthy
healthy    != operation succeeded
selected   != authenticated
requested  != authorized
started    != completed
completed  != validated
```

The UI must not fabricate provider health, execution, ToolReceipt IDs, evidence,
completion, or context usage.

## Evidence vocabulary

Use evidence labels only when earned by the claim-matched proof:

```text
PROVEN
IMPLEMENTED
DOCUMENTED
INFERRED
UNVERIFIED
STALE
BLOCKED
```

A local build or focused unit test does not establish installed/runtime/user-flow
acceptance.

For user-facing features track applicable layers separately:

```text
FUNCTIONAL
CANONICAL_PATH
INSTALLED
RUNTIME_EVIDENCE
USER_FLOW
UX
FINAL_FEATURE
```

`FINAL_FEATURE = PASS` only when all applicable layers pass.

## Existing-owner rule

Before adding a module, planner, provider adapter, executor, UI surface, state
store, or document:

```text
1. identify the current owner
2. inspect whether it already satisfies the requirement
3. reuse / adapt / wrap / extend the existing owner
4. create a new owner only when incompatibility is proven
```

Do not create new work faster than existing work is verified or retired.

## Document discipline

Do not create another planning/status document when an existing canonical owner
can be updated.

The workspace README is product/integration guidance, not release truth.
`Docs/STATUS.md` is a Rust-module projection, not backend runtime authority.
Backend `docs/CURRENT_STATUS.md`, machine gates, and acceptance checkpoints
remain higher authority.

Historical docs and chat exports are evidence/provenance only unless explicitly
promoted by current project authority.

## Workspace roles

```text
C:\LBE-TUI-Lab
  -> client / product-surface integration workspace

C:\Agents-Memory-Tool-v6-integration
  -> authoritative LBE runtime workspace
```

Important client paths:

```text
src/                 Rust/Ratatui reference client
run-cline-lbe.ps1    accepted Cline-based product launcher when the bundled/local
                     Cline surface is present and proven
Docs/                integration/reference documentation
```

The existence of a local or copied Cline tree does not itself prove installed
product acceptance.

## Validation rule

Use the evidence ladder appropriate to the claim:

```text
source inspection
-> build/static validation
-> focused tests
-> contract tests
-> integration tests
-> runtime proof
-> installed product proof
-> user-flow / UX acceptance
```

Do not skip directly from source/build success to READY or COMPLETE.

## Mutation rules

1. Preserve unrelated user work.
2. Follow the active LBE governance intent and allowed scope.
3. Do not silently change the machine gate.
4. Do not create branches/worktrees unless explicitly authorized.
5. Do not publish/tag/release unless explicitly authorized.
6. Do not bypass LBE authorization or execution owners.
7. Prefer the smallest architecture-consistent patch.
8. Validate the exact changed path before reporting completion.

## Rust reference-client commands

```powershell
cargo check
cargo test
cargo fmt --check
cargo run --bin lbe
```

These commands validate the Rust reference/integration client only. They do not,
by themselves, prove the accepted Cline/LBE product surface or installed LBE
runtime behavior.