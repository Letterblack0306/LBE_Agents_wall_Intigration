# LBE — Lockstep Boundary Engine terminal integration

## Authority and product identity

```text
PRODUCT                         = LBE
RUNTIME / GOVERNANCE AUTHORITY  = LBE Persistent Agent Wall
ACCEPTED PRODUCT-SURFACE DIR    = Cline CLI/TUI mechanics under LBE authority
RUST / RATATUI                  = reference / integration client
CLINE                            = reasoning/provider/UI mechanics; not LBE authority
```

LBE owns workspace/session identity, policy, authorization, governed execution,
ToolReceipt/evidence persistence, validation, recovery, and completion truth.

Cline may supply reasoning, provider interaction, continuation, and terminal UI
mechanics, but it must not become a second session, authorization, execution,
receipt/evidence, persistence, or completion owner.

The Rust/Ratatui client in this repository remains useful integration evidence.
It must not be promoted to final-product authority merely because it builds or
passes local tests.

## Current source-truth rule

Do not use this README as a release/status record.

For current acceptance and implementation truth, use this precedence:

```text
1. live runtime evidence
2. current local worktree/source
3. LBE machine gate / governance state
4. project-owned acceptance checkpoints
5. backend docs/CURRENT_STATUS.md
6. accepted project-specific interaction/design contract
7. GPT-Knowledge reusable UI/engineering guidance
8. reference/research documents
9. historical chats, mockups, and superseded plans
```

A historical PASS does not automatically prove the currently installed product
surface. Build success does not equal runtime acceptance. Runtime acceptance does
not automatically equal user-flow or UX acceptance.

## Locked LBE terminal interaction contract

The September 5 interaction decisions are the product-specific baseline. Do not
redesign these behaviors unless the user explicitly changes the contract.

### Primary shell

```text
LBE · <workspace> · <model> · <mode>                  git <branch> · <diff>
                                                       [ ||||........ ]
                                                       context usage

<conversation / execution timeline>

<active process>
<raw runtime event 1>
<raw runtime event 2>
<raw runtime event 3>

✓ <previous process> · <target> · <duration>

[I] Message LBE…
────────────────────────────────────────────────────────────────────────
ctx <usage> · <active mode>                                      Ctrl+K
```

### Visual hierarchy

Primary/high-visibility information:

```text
LBE identity
workspace
conversation
active execution
composer/input
```

Secondary/muted information:

```text
model
mode
git branch
diff
context metadata
footer metadata
shortcut hints
```

Secondary metadata should remain visible without competing with the active task.

### Context indicator

The thin context bar represents **real model context-window utilization**.

It must not be reused for arbitrary task progress, decorative loading, or an
unverified approximation.

### `[I]` composer/activity identity

Idle state:

```text
[I] Message LBE…
```

During verified active execution, the same identity area may animate as a
bounded horizontal activity indicator. Animation must be driven by real runtime
execution state; it must not imply work when no authoritative operation is
running.

### Active-process projection

For the currently active process:

```text
show at most 3 raw emitted runtime/event lines
scroll those 3 lines internally while active
single-click/explicit expand reveals full process history
```

When the next process begins, the prior process automatically collapses to one
ordered summary line, for example:

```text
✓ workspace.read · product_entry.py · 180ms
```

Completed process history remains available without keeping every raw event
expanded in the main conversation surface.

### State-truth requirements

The UI is a projection/control surface, not a simulation.

```text
configured != connected
connected  != healthy
healthy    != current operation succeeded
selected   != authenticated
requested  != authorized
started    != completed
completed  != validated
```

Provider state, tool activity, authorization, receipts, evidence, completion,
context usage, and process progress must come from authoritative runtime state.
The UI must not synthesize receipt IDs, evidence IDs, completion, connection,
or execution state.

## Visual system

The terminal surface follows the canonical Letterblack Industrial Dark system
from GPT-Knowledge:

```text
background primary    #0b0b0c
background secondary  #141416
background tertiary   #1c1c1f
accent red            #ff3b3b
border                #2a2a2d
main text             #e1e1e6
muted text            #8e8e93
```

Use compact technical hierarchy, thin structural lines, restrained rounding,
monospace output where appropriate, and state-semantic colors. Red is a signal
color, not a default large surface. Green is reserved for evidence-backed healthy
or verified-running state. Do not use emoji for operational UI.

## User interaction acceptance

A feature is not product-complete merely because a unit/integration test says
PASS. User-facing features should be classified separately:

```text
FUNCTIONAL         PASS / FAIL
CANONICAL_PATH     PASS / FAIL
INSTALLED          PASS / FAIL
RUNTIME_EVIDENCE   PASS / FAIL
USER_FLOW          PASS / FAIL
UX                 PASS / FAIL
FINAL_FEATURE      PASS only when all applicable layers pass
```

Normal users should not need to understand internal provider-config paths,
database paths, runtime adapter names, or raw session identifiers for ordinary
use.

## Product-surface reconciliation rule

Do not reopen Textual vs Rust vs HTML vs Cline as a greenfield design decision.
Current accepted direction is Cline CLI/TUI mechanics under LBE authority; Rust
remains the bounded reference/integration client.

Do not create another UI plan or alternative layout unless one of these is true:

1. the locked September 5 contract explicitly requires it;
2. the Industrial Dark system requires it;
3. a proven runtime capability requires a projection that has no existing owner;
4. the user explicitly changes the product interaction contract.

Textual is not a canonical final-product surface.

## Implementation target

The intended final interaction chain is:

```text
LBE terminal
  -> authoritative LBE session
  -> configured/discovered provider + model
  -> Cline reasoning/provider mechanics
  -> LBE authorization
  -> LBE governed execution
  -> persisted ToolReceipt
  -> persisted Evidence
  -> validation
  -> LBE completion truth
  -> truthful terminal projection
  -> clean exit / restart / resume proof
```

No layer in the client may bypass or recreate LBE authority.

## Rust reference client

This repository still contains the Rust/Ratatui reference client.

```text
cargo run --bin lbe
cargo test
cargo fmt --check
cargo check
```

Its real-runtime path must continue to route through `LbeWrapper` /
`RealLbeWrapper` and authoritative LBE product-entry contracts. Mock mode is
preview/test scope only and must never be represented as installed product proof.

## Evidence discipline

Use explicit classifications when reporting implementation state:

```text
PROVEN
IMPLEMENTED
DOCUMENTED
INFERRED
UNVERIFIED
STALE
BLOCKED
```

Do not report READY, WORKING, DONE, or COMPLETE unless the evidence level matches
the exact claim.