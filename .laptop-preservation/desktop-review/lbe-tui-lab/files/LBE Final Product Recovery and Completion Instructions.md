# LBE FINAL PRODUCT RECOVERY AND COMPLETION INSTRUCTIONS

## AUTHORITATIVE WORKSPACES

Backend / runtime authority:

```text
C:\Agents-Memory-Tool-v6-integration
```

Client / terminal integration:

```text
C:\LBE-TUI-Lab
```

Repositories:

```text
Letterblack0306/LBE_Presistent_Agent_wall
Letterblack0306/LBE_Agents_wall_Intigration
```

---

# OBJECTIVE

Complete LBE as one real installed product.

Do not redesign LBE Core.

Do not build another runtime.

Do not create another provider system.

Do not create another session owner.

Do not create fake UI state.

Do not claim completion from source presence, imports, unit tests, screenshots, or isolated component PASS results.

The final result must prove this complete chain:

```text
LBE terminal
    ↓
provider/model selection
    ↓
Cline reasoning/provider mechanics
    ↓
authoritative LBE session/runtime
    ↓
LBE authorization
    ↓
LBE governed execution
    ↓
real ToolReceipt
    ↓
real persisted Evidence
    ↓
validation
    ↓
LBE completion decision
    ↓
clean terminal exit
    ↓
restart
    ↓
resume same persisted session
```

Only this complete composition constitutes final product acceptance.

---

# CURRENT ARCHITECTURE — DO NOT CHANGE

## Product

```text
PRODUCT = LBE
```

Everything visible to the user is LBE.

Do not expose Cline branding as the product.

Do not expose backend subsystem names unnecessarily.

Cline is implementation machinery under LBE authority.

---

# AUTHORITY SPLIT

## Cline owns

```text
reasoning
planning
provider interaction mechanics
model interaction
tool proposals
continuation
response composition
```

## LBE owns

```text
workspace identity
session identity
mode
policy
permissions
authorization
ToolRegistry
governed execution
receipts
evidence
persistence
recovery
validation
completion truth
```

Hard rule:

```text
Cline may propose.
LBE decides whether execution is authorized.
LBE executes through governed owners.
LBE records truth.
```

Never allow:

```text
Cline → direct filesystem mutation
Cline → raw shell
Cline → direct MCP execution
Cline → independent receipt generation
Cline → independent session ownership
Cline → completion authority
```

---

# EXISTING WORK THAT MUST BE REUSED

The backend already contains mature owners for:

```text
session persistence
workspace identity
provider registry
provider gateway
authorization
ToolRegistry
GovernedToolOrchestrator
workspace.read
workspace.list
workspace.glob
workspace.search
workspace.patch
process.run_registered
external capability registration
ToolReceipt persistence
Evidence persistence
validation
completion gating
restart/recovery foundations
```

Do not recreate these.

First locate the existing owner.

Then adapt or wrap it.

Required implementation rule:

```text
REUSE
→ ADAPT
→ WRAP
→ EXTEND

NEVER:
duplicate owner
parallel owner
replacement owner
```

---

# CURRENT MACHINE GATE

The current canonical backend machine state is approximately:

```text
active phase:
INSTALLED_PTY_CONPTY_AND_FINAL_PRODUCT_ACCEPTANCE

active product work:
FINAL PRODUCT SOURCE / PRODUCT PROJECTION RECONCILIATION

status:
OPEN
```

Do not use old historical slice names as current execution authority.

Historical PASS records remain evidence of completed lower-level capabilities but do not close the current final-product gate.

---

# WHAT IS ACTUALLY BROKEN

The core runtime is not the main problem.

The current failure is product composition.

Current categories:

```text
LBE core runtime                  largely proven
session ownership                 proven
authorization                     proven
governed tools                    proven
receipts backend                  proven
evidence backend                  proven
provider abstraction              proven

final UI/runtime composition      incomplete
real provider binding in product  incomplete/unverified
governed coding from final UI     incomplete
receipt/evidence projection       incorrect on some surfaces
PTY/ConPTY installed proof        incomplete
restart/resume acceptance         incomplete
cross-repo installed acceptance   missing
```

---

# CRITICAL CURRENT DEFECT — TEXTUAL PRODUCT PATH

Inspect:

```text
lbe_guard_inspector/textual_tui.py
lbe_guard_inspector/product_entry.py
lbe_guard_inspector/cli.py
```

The canonical reconciliation previously identified that the Textual surface can:

```text
initialize PREVIEW state
synthesize governed-turn output
synthesize ToolReceipt-looking IDs
synthesize Evidence labels
```

This is unacceptable for the final product.

The UI must never invent runtime truth.

Required rule:

```text
UI STATE = projection of authoritative runtime state
```

Not:

```text
UI STATE = locally fabricated approximation
```

Every displayed:

```text
receipt
evidence record
tool execution
provider connection
validation result
completion
session status
```

must originate from a real authoritative backend record/event.

---

# FIRST TASK — ESTABLISH CURRENT SOURCE TRUTH

Before editing anything, inspect both repositories.

## Backend

```powershell
cd C:\Agents-Memory-Tool-v6-integration

git status --short --branch
git log -10 --oneline --decorate
git diff --stat
git diff --check

Get-Content .lbe\governance\implementation-gates.json
Get-Content .agent\evidence\CURRENT_TASK.md
```

Record:

```text
current HEAD
current branch
dirty files
active phase
active slice
active intent
allowed paths
current blockers
```

## Rust/client

```powershell
cd C:\LBE-TUI-Lab

git status --short --branch
git log -10 --oneline --decorate
git diff --stat
git diff --check
git stash list
```

Also inspect:

```text
src/main.rs
src/wrapper.rs
src/app.rs
src/types.rs
src/ui.rs
lbe-cli.ps1
lbe.ps1
lbe.bat
run-lbe.bat
run-cline-lbe.ps1
```

Do not modify until current source ownership is understood.

---

# SECOND TASK — DEFINE ONE FINAL PRODUCT ENTRYPOINT

There must be exactly one normal user launch path.

Target experience:

```text
lbe
```

The user should not need to know:

```text
python module name
Cline binary path
backend worker path
Rust binary path
provider adapter name
```

Internally the launcher may compose them.

Externally:

```text
lbe
```

must be the product.

---

# REQUIRED LAUNCH CONTRACT

On launch:

```text
1. resolve workspace
2. resolve/create LBE session
3. load persisted session state
4. load provider configuration
5. discover configured provider/model
6. establish real runtime attachment
7. render actual state
8. accept user task
```

No fabricated connection state.

If provider is absent:

```text
Provider: NOT CONFIGURED
```

If configured but unreachable:

```text
Provider: UNREACHABLE
```

If reachable:

```text
Provider: READY
```

Do not collapse:

```text
selected
configured
reachable
authenticated
healthy
operation succeeded
```

into one boolean.

---

# PROVIDER CONFIGURATION

Provider configuration must be application-wide by default.

Do not require separate configuration for:

```text
audit
coding
review
investigation
subagent
tool
feature
```

Default rule:

```text
one selected LBE provider/model
```

Optional overrides may exist only when explicitly configured.

The provider ID/model ID must be discovered from real runtime/configuration.

Never hardcode model IDs into final product behavior.

---

# THIRD TASK — UNIFY THE REASONING PATH

Every interactive user turn must reach one canonical provider reasoning path.

Do not maintain separate incompatible reasoning pipelines for:

```text
TUI
CLI
product_entry
Rust
Textual
Cline launcher
```

Create one canonical application service or adapter boundary.

Conceptually:

```text
UserTurn
    ↓
LBE session state
    ↓
build mode/doctrine guidance
    ↓
Cline/provider reasoning adapter
    ↓
model response/tool proposal
    ↓
LBE authorization/execution
```

The UI is only a client.

---

# DOCTRINE / MODE INJECTION

Existing work already introduced `AgentGuidance` into one CLI non-coding path.

Do not duplicate that logic independently.

Canonicalize it.

Modes may include current supported equivalents such as:

```text
coding
audit
investigation
plan
```

The exact public naming must follow current source/user-approved product contract.

Mode controls:

```text
guidance
permissions
allowed tools
evidence requirements
completion requirements
```

Do not implement mode as an LLM personality only.

---

# KNOWN SIBLING GAP

Inspect:

```text
lbe_guard_inspector/product_entry.py:_turn
```

It has been identified as constructing:

```text
GovernedProviderTurnRuntime
```

without the same guidance injection used in the fixed CLI path.

Do not patch this blindly.

First determine whether `_turn` remains part of the final product path.

If yes:

```text
route it through the canonical provider-turn application owner
```

Do not copy/paste guidance construction into another parallel path.

If no:

```text
remove/deprecate the unreachable duplicate path
```

after proving no required installed consumer depends on it.

---

# FOURTH TASK — REMOVE SYNTHETIC PRODUCT STATE

Search for all code that creates UI-facing fake values.

Search terms:

```text
PREVIEW
mock
fake
synthetic
fabricated
ToolReceipt(
receipt_id
evidence
sample
placeholder
demo
not connected
```

Classify each occurrence:

```text
TEST FIXTURE
DEMO ONLY
PRODUCTION REACHABLE
DEAD CODE
```

Hard requirement:

Any production-reachable synthetic execution/evidence state must be removed or replaced with projection from authoritative persisted records.

Mocks may remain only in:

```text
tests
explicit demo fixtures
isolated mock wrapper
```

and must never be reachable by normal `lbe` launch.

---

# FIFTH TASK — CONNECT REAL LBE TOOL FLOW

The provider must only receive tool definitions generated from LBE-authorized capabilities.

Required path:

```text
provider proposes tool call
        ↓
LBE resolves ToolRegistry entry
        ↓
LBE checks mode/policy/permission
        ↓
approval if required
        ↓
GovernedToolOrchestrator executes
        ↓
ToolReceipt persisted
        ↓
Evidence persisted
        ↓
provider receives result
        ↓
provider continues reasoning
```

Prove this with at least:

```text
workspace.read
workspace.search
workspace.patch
process.run_registered
```

Do not expose arbitrary shell as a generic provider tool.

---

# SIXTH TASK — APPROVAL → MUTATION → EXACTLY ONCE

This remains a critical installed acceptance requirement.

Prove:

```text
provider proposes mutation
→ LBE requests approval
→ one approval ID created
→ approval accepted
→ mutation occurs once
→ one correlated receipt
→ provider continuation occurs once
```

Test duplicate/replay behavior.

Required result:

```text
same approval/result cannot cause duplicate mutation
```

Use operation IDs / correlation IDs / idempotency already present in architecture.

Do not invent a second retry mechanism if one exists.

---

# SEVENTH TASK — REAL RECEIPT AND EVIDENCE PROJECTION

UI should subscribe/project existing runtime records.

The visible receipt must correspond to a persisted backend receipt.

The visible evidence item must correspond to persisted evidence.

Minimum fields should map to real source values such as:

```text
operation/correlation ID
tool name
session ID
turn ID
authorization result
execution state
validation state
result/error
timestamp
```

Do not create display-only fake IDs.

Acceptance:

```text
receipt shown in UI
=
receipt found in backend persistence
```

and:

```text
evidence shown in UI
=
evidence found in backend persistence
```

---

# EIGHTH TASK — SESSION OWNERSHIP

One session owner only:

```text
LBE
```

Cline session mechanics may be embedded for provider continuation, but they must not become authoritative product session ownership.

Rust must not create separate authoritative sessions.

Textual must not create separate authoritative sessions.

Required state flow:

```text
LBE session ID
workspace ID
turn ID
provider/model
mode
permission
runtime policy
```

must all originate from the authoritative LBE session.

---

# NINTH TASK — TERMINAL / PTY / CONPTY ACCEPTANCE

Do not treat normal redirected subprocess tests as proof of a full-screen TUI.

Build/use a PTY/ConPTY acceptance harness.

Prove at minimum:

```text
launch lbe
initial render appears
keyboard input accepted
submit works
Ctrl+C behavior correct
Ctrl+D behavior correct where applicable
quit command works
terminal state restored
panic/error restores terminal
no orphan child process
```

Windows must be tested through a real ConPTY-compatible harness.

---

# TENTH TASK — RESTART / RESUME

Required acceptance:

```text
start session
perform real turn
persist state
exit cleanly

launch lbe again
resume same LBE session
restore:
  workspace
  mode
  provider/model
  task/session state
  evidence history
  receipts

continue conversation
```

Do not call restart/resume PASS from unit persistence tests alone.

Installed product restart must be exercised.

---

# ELEVENTH TASK — RUST ROLE

Do not make Rust another runtime authority.

Rust may remain:

```text
terminal UI
client
projection
adapter
operator surface
```

Rust must delegate to LBE.

If Rust functionality duplicates backend authority, remove or convert it into projection/adaptation.

Review unsupported operations in `RealLbeWrapper`.

Classify each as:

```text
required for final product
not required
backend missing
client adapter missing
deprecated
```

Implement only the required adapter gaps.

---

# TWELFTH TASK — CLINE ROLE

No Cline branding in final user-facing product.

Cline should be embedded/reused for:

```text
reasoning loop
provider support
model support
tool-call continuation mechanics
```

Do not duplicate Cline provider infrastructure in Rust or Python if the existing embedded mechanism can be reused safely.

Do not let Cline own LBE policy or execution.

---

# THIRTEENTH TASK — UI CONTRACT

Use current Letterblack Industrial Dark system.

Primary identity:

```text
LBE
```

State must be real.

Recommended operational layout:

```text
TOP BAR

LEFT CONTEXT      PRIMARY TASK / CONVERSATION      RIGHT STATE

BOTTOM:
events
receipts
evidence
validation
terminal

STATUS BAR
```

Avoid:

```text
marketing paragraphs
large decorative cards
fake progress
fake provider state
cyan-as-generic-active-state if inconsistent with canonical palette
Cline branding
emoji
```

Operational semantics matter more than decoration.

---

# FOURTEENTH TASK — REMOVE LAUNCHER CONFUSION

Current workspace historically contained several launchers.

Examples:

```text
lbe-cli.ps1
lbe.ps1
lbe.bat
run-lbe.bat
run-cline-lbe.ps1
launch-lbe.ps1
```

Classify each.

Final result should be either:

```text
one canonical launcher
```

or:

```text
one canonical launcher
+
small documented compatibility shims
```

No launcher may implement its own runtime logic.

Compatibility wrappers should only forward to the canonical product entrypoint.

---

# FIFTEENTH TASK — CLEAN WORKSPACE DEBRIS

After product ownership is resolved, remove confirmed temporary/debris directories such as historical:

```text
cline.failed-checkout-*
cline.incomplete-*
cline.partial-*
Agents-Memory-Tool-v6-integrationlbe_guard_inspector
```

Only delete after proving they are not referenced by runtime/build/package scripts.

Use governed deletion where required.

---

# SIXTEENTH TASK — CROSS-REPO CONTRACT

Create explicit compatibility between:

```text
LBE backend
Rust/client
embedded Cline adapter
```

At minimum define:

```text
protocol/version
required backend capabilities
client version
event schema version
tool schema version
receipt schema
session schema
```

A client build must fail or warn clearly if it is incompatible with the backend contract.

---

# SEVENTEENTH TASK — CROSS-REPO ACCEPTANCE TEST

Add one automated installed composition test.

It must test actual artifacts, not imports.

Required environment:

```text
fresh temporary installation
real backend package
real terminal/client executable
test workspace
test provider or deterministic local provider fixture
real persisted database
```

Test:

```text
launch
session create
provider selection
prompt
read tool
write approval
write
receipt
evidence
validation
completion
exit
restart
resume
```

This becomes the final release gate.

---

# EIGHTEENTH TASK — PROVIDER LIVE PROOF

Do not block the entire project merely because old runtime values are missing.

Discover the current values from the live machine.

Find:

```text
provider-config JSON
endpoint
advertised models
current DB
current session
```

Do not reuse remembered values.

Provider acceptance sequence:

```text
discover config
discover endpoint
GET /models or provider-equivalent
select advertised model
provider health probe
controlled normal turn
controlled audit/investigation turn
compare behavior
```

No cloud fallback unless explicitly configured.

---

# NINETEENTH TASK — GOVERNANCE

Respect:

```text
.lbe/governance/implementation-gates.json
PROJECT_INDEX.md
PROJECT_INTENT_LEDGER.md
active intent
active slice
allowed path prefixes
```

Do not stage files merely to make the checker pass.

When a real mutation is ready:

```text
verify active intent
verify slice match
verify expected paths
update index if required
stage exact scope
run gate
run diff check
run targeted tests
run full relevant suite
```

Do not silently change the active gate.

---

# TWENTIETH TASK — VALIDATION LADDER

Every implementation slice must use:

```text
1. source inspection
2. static/build validation
3. focused unit tests
4. contract tests
5. integration tests
6. runtime test
7. installed product test
8. user-visible acceptance
```

Do not skip from 2/3 directly to “complete.”

---

# COMPLETION STATES

Every finding must use one of:

```text
PROVEN
IMPLEMENTED
DOCUMENTED
INFERRED
UNVERIFIED
STALE
BLOCKED
```

Never report:

```text
working
done
complete
ready
```

without corresponding claim-matched evidence.

---

# FINAL ACCEPTANCE MATRIX

The project is COMPLETE only when all are PASS:

```text
[ ] canonical single-command launch

[ ] authoritative LBE session attached

[ ] real provider config discovered

[ ] real provider/model attached

[ ] real conversation succeeds

[ ] coding mode receives correct policy

[ ] audit/investigation receives correct doctrine

[ ] provider receives only LBE-authorized tools

[ ] workspace read works

[ ] workspace search works

[ ] mutation approval works

[ ] workspace patch executes once

[ ] registered process execution works

[ ] real ToolReceipt persisted

[ ] UI receipt equals persisted receipt

[ ] real Evidence persisted

[ ] UI evidence equals persisted evidence

[ ] validation result is real

[ ] completion result comes from LBE

[ ] Ctrl+C behavior verified

[ ] quit verified

[ ] terminal restored

[ ] no orphan processes

[ ] restart verified

[ ] same session resumed

[ ] no synthetic product state

[ ] no parallel execution owner

[ ] no parallel authorization owner

[ ] no parallel session owner

[ ] no parallel evidence/receipt owner

[ ] no Cline branding exposed as product

[ ] final LBE UI reflects real runtime state

[ ] cross-repository installed acceptance passes
```

If any item is not proven:

```text
FINAL_PRODUCT_ACCEPTANCE != PASS
```

---

# REQUIRED FIRST EXECUTION ORDER

Do not work randomly.

Execute in this order:

```text
A. establish both worktree states

B. reconcile current machine gate + active intent

C. identify exact final entrypoint

D. map every production-reachable UI path

E. identify synthetic/preview runtime paths

F. identify canonical backend owners for each missing path

G. connect final entrypoint to authoritative runtime

H. connect real provider/model

I. connect real governed tool flow

J. connect real receipts/evidence projection

K. prove approval + exactly-once mutation

L. build PTY/ConPTY installed acceptance

M. prove clean exit

N. prove restart/resume

O. run full installed end-to-end test

P. only then close final product gate
```

---

# DO NOT DO

Do not:

```text
redesign LBE
replace existing runtime owners
start another TUI framework
create another provider registry
create another session database
invent receipt IDs
invent evidence
hardcode model IDs
hardcode provider health
copy historical session IDs
treat provider READY as doctrine proof
treat build success as product acceptance
treat unit tests as installed acceptance
add unrelated improvements
publish
push
tag
release
```

unless explicitly authorized.

---

# REQUIRED REPORT AFTER EACH MAJOR SLICE

Return:

```text
SLICE:
<name>

SOURCE TRUTH:
<what currently owns this behavior>

FILES READ:
[...]

FILES CHANGED:
[...]

REUSED OWNERS:
[...]

DUPLICATE OWNERS INTRODUCED:
NONE | list

TESTS:
command
result

RUNTIME PROOF:
<actual evidence>

INSTALLED PROOF:
<actual evidence>

STATUS:
PROVEN | IMPLEMENTED | UNVERIFIED | BLOCKED | FAIL

NEXT BLOCKER:
<single highest-value blocker>
```

---

# FINAL RESPONSE REQUIRED FROM AGENT

When all work is complete, return:

```text
FINAL PRODUCT: LBE

Runtime authority:
LBE

Reasoning/provider mechanics:
Cline under LBE authority

Canonical entry:
lbe

Session persistence:
PASS / FAIL

Provider/model live:
PASS / FAIL

Governed tools:
PASS / FAIL

Approval:
PASS / FAIL

Exactly-once mutation:
PASS / FAIL

Receipt persistence:
PASS / FAIL

Evidence persistence:
PASS / FAIL

UI real-state projection:
PASS / FAIL

PTY/ConPTY:
PASS / FAIL

Clean exit:
PASS / FAIL

Restart/resume:
PASS / FAIL

Cross-repo installed E2E:
PASS / FAIL

Synthetic product state remaining:
NONE | list

Parallel authority remaining:
NONE | list

FINAL_PRODUCT_ACCEPTANCE:
PASS | BLOCKED | FAIL
```

`PASS` is permitted only after the full installed chain is exercised.

---

# PRIMARY ENGINEERING PRINCIPLE

The project does not need another architecture.

The engine already exists.

The task is to **finish the composition**:

```text
existing LBE authority
+
existing Cline reasoning/provider mechanics
+
one LBE-branded client
+
real runtime projection
+
installed end-to-end proof
```

Do not rebuild what already works.

Connect it correctly, eliminate synthetic/duplicate paths, and prove the complete product.