# LetterBlack LBE Agent / IDE Integration Plan

## Purpose

`C:\LBE-TUI-Lab` is the clean TUI development and integration-preparation
workspace for the LetterBlack Engine product. It is not treated as a second
runtime authority and is not described as a security sandbox unless a separate
security boundary is explicitly established.

## Main HEAD Implementation Rule

All implementation work for this repository must be performed directly in the
primary checkout on the current `main` branch and current `main` HEAD.

```text
repository: Letterblack0306/LBE_Agents_wall_Intigration
working checkout: C:\LBE-TUI-Lab
implementation branch: main
```

Agents must inspect the current `main` HEAD before beginning work and must keep
all authorized implementation changes in this checkout. Do not create or use
feature branches or Git worktrees for this plan. Do not commit or push unless
the active session explicitly authorizes those actions.

The workspace `C:\Agents-Memory-Tool-v6-integration` is the canonical LBE runtime
counterpart, not a substitute implementation checkout. Its code, governance,
raw proof, and runtime state remain there. TUI-side code may be adapted only
through a separately authorized integration slice after the corresponding work
is implemented and validated on this repository's `main` HEAD.

The TUI is the interaction and projection layer. LBE remains responsible for
workspace identity, authorization, policy, governed execution, validation,
evidence, receipts, persistence, and completion truth.

The eventual integration destination is:

```text
C:\Agents-Memory-Tool-v6-integration
```

Integration must happen incrementally. A capability is not considered
integrated merely because a UI control, mock event, or type exists in this
workspace.

## Product Direction

The target product is a native LetterBlack terminal IDE / agent workspace:

```text
LetterBlack Terminal IDE
        ↓
conversation / planning / audit / coding UI
        ↓
LbeWrapper
        ↓
LBE runtime / Agent Wall
        ↓
authorization, policy, execution, providers, sessions,
memory/context, evidence, validation, receipts, completion truth
```

### Active interface and runtime authority

- **Rust/Ratatui TUI:** active interface implementation and client/projection
  layer over LBE.
- **Python TUI:** retired; reference-only; no further implementation work.
- **LBE Python runtime:** authoritative backend, governance, provider, session,
  authorization, execution, evidence, receipt, validation, and completion
  runtime.
- **Rust TUI authority boundary:** the Rust client must not replace or duplicate
  LBE authority; it submits requests and renders authoritative projections.

The original blueprint defines the user interface as a client, the LBE
orchestrator as the control layer, and the reasoning model as a planner and
interpreter rather than the owner of project memory or execution authority
(`C:\Users\prave\Downloads\lbe_agent_blueprint\docs\02_ARCHITECTURE.md`,
sections 1–3).

The blueprint also defines the runtime sequence as intake, project detection,
rule loading, planning, evidence collection, proposal, governance review,
execution, validation, result synthesis, and memory commit
(`C:\Users\prave\Downloads\lbe_agent_blueprint\docs\03_RUNTIME_PIPELINE.md`,
"Pipeline states").

## Workspace Role and Boundaries

### This workspace owns

- TUI interaction and rendering;
- typed request, event, snapshot, and projection contracts;
- mock behavior used for deterministic pre-integration tests;
- lifecycle and correlation correctness;
- terminal behavior and UI acceptance tests;
- integration adapters only when an explicitly authorized slice is active.

### This workspace must not become

- a second authorization owner;
- a second execution/runtime owner;
- a provider credential store;
- a persistence authority;
- an evidence or receipt authority;
- a direct command executor from the UI;
- a replacement for Agent Wall.

The blueprint's governance default is read-only until user or policy permission
is granted, with workspace operations restricted to the selected project root
(`C:\Users\prave\Downloads\lbe_agent_blueprint\docs\12_GOVERNANCE.md`,
"Default posture" and "Workspace boundary").

## Current Checkpoint

Recorded on 2026-08-30:

```text
repository: Letterblack0306/LBE_Agents_wall_Intigration
workspace: C:\LBE-TUI-Lab
branch: main
HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
origin/main: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
```

### Proven / closed

- Module 32 deterministic runtime state machine: `PROVEN / CLOSED / PUBLISHED`.
- TUI request/event correlation and stale/foreign event protection.
- Deterministic terminalization, timeout, abort, rejection, retry, and
  interruption behavior for the pre-integration mock runtime.
- Mock truth labeling remains explicit.

### Remaining / not started

- Installed interactive Rust/Ratatui acceptance, including PTY-level smoke
  coverage where the environment supports it.
- Remaining Rust client integration and user-visible projection coverage.
- Governed mutation, command execution, and approval flows beyond the proven
  read-only path.
- Real command execution.
- Persistent runtime/session integration.

The current TUI README continues to identify the runtime as deliberately
mocked and not connected to live LBE authority
(`C:\LBE-TUI-Lab\README.md`, section "Runtime requirement").

## Phase 0 Progress Checkpoint — Documentation Alignment

```text
DATE: 2026-08-30
PHASE: P0 — DOCUMENTATION ALIGNMENT
SLICE: TWO-REPOSITORY OWNERSHIP, MODES, AND INTEGRATION SEQUENCE
STATUS: CLOSED / PROVEN
REPOSITORY HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
BRANCH: main
```

Implemented:

- added `Docs/00_integration_alignment.md` as the TUI-side integration map;
- documented the separate Normal Agent Runtime and strict Audit mode;
- documented LBE runtime authority versus TUI projection/client ownership;
- documented the P0 → P1 → P2/P3 → P4+ integration sequence;
- recorded that raw LBE proof, runtime state, databases, credentials, and
  machine governance remain in `C:\Agents-Memory-Tool-v6-integration`;
- aligned `Docs/README.md` and `Docs/STATUS.md` with the recorded P1 PASS and
  the active P2/P3 next slice;
- updated this plan with the current repository identity and Phase 0 status;
- deleted the confirmed non-product backup `rust/main.rs.bak`.

Validation:

- `git diff --check` passed for the Phase 0 documentation changes;
- alignment-document final-newline check passed;
- current TUI branch is `main` and all work remains visible in the primary
  checkout;
- no branch or worktree was created;
- no LBE repository files were modified;
- existing unrelated working-tree changes were preserved.

Preserved invariants:

- LBE remains the authority for identity, policy, authorization, execution,
  evidence, receipts, persistence, validation, and completion truth;
- the TUI remains the interaction/projection layer;
- Normal Agent Runtime may use LBE-governed capabilities;
- Audit mode remains strictly read-only and evidence-bound;
- P2/P3 implementation remains subject to the LBE machine gate.

Next minimal action:

The P2/P3 client contract batch is defined in
`Docs/36_p2_p3_client_contract.md`. The next minimal action is broader schema
and error testing. The LBE human-readable gate has been reconciled with the
machine gate. The first defensive Rust receipt check is implemented in
`src/wrapper.rs`; full P2/P3 integration is not complete. Do not copy the LBE
runtime or raw proof.

## P2/P3 Progress Checkpoint — Gate Reconciliation

```text
DATE: 2026-08-30
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: MACHINE/HUMAN GATE RECONCILIATION
STATUS: IMPLEMENTED / PROVEN BY CROSS-REPOSITORY READ
TUI REPOSITORY HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
LBE REPOSITORY HEAD: 7ca58f866c662ab246c6c3ef23667c4cf7519d03
BRANCH: main in both repositories
```

Implemented:

- reconciled the LBE human-readable current gate with the machine-declared
  `TUI_P2_P3_GOVERNED_EXECUTION_INTEGRATION` slice;
- preserved the earlier workspace-hygiene record as completed historical
  baseline rather than current authorization;
- confirmed the active owner remains the existing LBE R6C/R6E runtime with the
  TUI `LbeWrapper` as projection adapter;
- updated the TUI alignment date wording so the active gate is not described as
  a Phase 0-time snapshot.

Validation:

- machine gate read and parsed successfully;
- human gate projection now matches the machine active phase/slice/status;
- both repositories remain on primary `main` checkouts;
- no branches or worktrees created;
- no runtime code, raw proof, state, credentials, or historical acceptance
  records were copied or modified.

Remaining limitation:

- gate reconciliation authorizes the integration slice but does not prove live
  P2/P3 execution, mutation acceptance, or complete schema validation.

## P2/P3 Progress Checkpoint — Defensive Receipt Validation

```text
DATE: 2026-08-30
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: EXECUTED RECEIPT IDENTITY VALIDATION
STATUS: IMPLEMENTED / PROVEN LOCALLY
REPOSITORY HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
BRANCH: main
```

Implemented:

- centralized validation of non-empty `receipt_id` for `EXECUTED` runtime
  responses in the Rust adapter;
- applied the check to workspace read/list/glob/search/patch and registered
  process projections;
- preserved denied, escalated, and failed statuses as visible non-success
  results;
- kept all runtime authority and raw proof in the LBE repository.

Validation:

- LBE focused contract tests: `44 passed`;
- focused receipt-contract tests: `5 passed`;
- workspace payload/error tests: `18 passed`;
- evidence/receipt projection tests: `3 passed`;
- process projection tests: `2 passed`;
- detached detail retention test: `1 passed`;
- tools projection tests: `2 passed`;
- authorization projection tests: `2 passed`;
- registered execution reference projection: covered;
- `cargo fmt -- --check`: PASS;
- `cargo check --quiet`: PASS;
- `cargo test --quiet`: `148 passed`;
- `git diff --check`: PASS for the affected Rust files.

Limitation:

- This is a defensive adapter step only. It does not prove complete live P2/P3
  acceptance, schema-version validation, or governed mutation acceptance.

Next minimal action:
Review the remaining operation/result projection surface before attempting live
governed execution acceptance; authorization, tools, evidence, receipt, and
process panels remain projection-only until live runtime records are available.

## Integration Sequence

The integration destination must receive changes in this order. Each phase
requires its own evidence and must preserve the authority boundary.

### P0 — Deterministic wrapper invariants

Status: `CLOSED / PUBLISHED`.

This phase is complete in the TUI workspace and is a prerequisite for real
runtime attachment.

### P1 — Read-only RealLbeWrapper attachment

Status: `PASS`.

Bounded scope:

- retain the existing `RealLbeWrapper` boundary;
- attach and disconnect without fabricating state;
- reconnect only when authoritative truth is recovered;
- project real runtime/session identity into `LbeSnapshot`;
- consume one read-only LBE-owned operation/event;
- preserve mock mode as explicitly labeled.

Current implementation evidence:

- `RealLbeWrapper` is behind the shared `LbeWrapper` trait;
- attach/disconnect/reconnect project fail-closed read-only Agent Wall state;
- `UserRequest::RefreshRuntimeSnapshot` reprojects authoritative read-only
  state only when the real wrapper is connected;
- mock mode rejects that request explicitly rather than fabricating a refresh.

The six bounded P1 checks are recorded as PASS in
`Docs/35_p1_live_acceptance_evidence_record.md`. This proves read-only
attachment only; it does not prove governed mutation, provider generation,
command execution, or the complete IDE runtime.

Forbidden in P1:

- workspace mutation;
- provider generation;
- command execution;
- file writes;
- raw credentials;
- P2/P3/P4 implementation.

### P2/P3 — Governed tools, permissions, and policy

Status: `ACTIVE NEXT SLICE`.

Add capabilities only through the LBE authorization and policy path. The
required chain is user task → wrapper → authorization → governed tool →
operation → evidence → validation → receipt → completion.

Implement or integrate policy ownership only in the governing runtime. Do not
move permission decisions into TUI state. The LBE machine gate identifies this
combined next slice as `TUI_P2_P3_GOVERNED_EXECUTION_INTEGRATION`; its status and
authorization remain owned by the LBE repository.

### P4 — Provider and reasoning-agent loop

Status: `NOT_STARTED`.

Providers, credentials, model catalogs, streaming, tool calls, and replanning
remain LBE-owned. The TUI may display redacted projections only.

### P5 — IDE workflow

Status: `NOT_STARTED`.

Integrate file/context navigation, code search, changed-workspace views, diff
review, patch review, and artifacts only after the governed execution path is
proven.

### P6–P10 — Durable and advanced workspace

Status: `NOT_STARTED`.

Persistence, checkpoints, memory, headless/CI mode, background processes,
subagents, teams, connectors, schedules, and advanced UX follow the single
agent governed path.

This sequence follows the current TUI roadmap priorities in
`C:\LBE-TUI-Lab\Docs\33_real_cli_ide_implementation_plan.md`, section
"Priority Order".

## Audit Mode Product Rule

Audit mode is a conversational workspace investigation mode, not a mechanical
verdict console.

It may inspect current workspace facts, trace implementation paths, compare
requirements with evidence, identify contradictions, explain findings, and
produce a concise evidence-backed conclusion. It must remain read-only unless
a separate governed apply operation is explicitly selected.

Formal classifications such as `PASS`, `FAIL`, `INSUFFICIENT_EVIDENCE`, and
`NOT_APPLICABLE` are conclusions or evidence/status fields, not a replacement
for the investigation conversation.

The original blueprint explicitly defines Audit mode as read-only and as
producing findings, evidence, risk ranking, and recommended actions
(`C:\Users\prave\Downloads\lbe_agent_blueprint\docs\15_EXECUTION_PIPELINE.md`,
"Execution modes").

## Agent Progress Update Protocol

Future agents may update this file as work progresses, but only under these
rules:

1. **Inspect first.** Record repository identity, branch, HEAD, working-tree
   state, active authority, and relevant source/runtime path before changing
   status.
2. **Use evidence levels.** Every status entry must be one of:
   `PLANNED`, `AUTHORIZED`, `IN_PROGRESS`, `IMPLEMENTED`, `PROVEN`, `CLOSED`,
   `BLOCKED`, or `NOT_STARTED`.
3. **Do not promote by assumption.** `IMPLEMENTED` becomes `PROVEN` only after
   claim-matched tests or runtime evidence pass. A design document alone does
   not prove implementation.
4. **Record exact evidence.** Include the revision, files, tests/commands,
   and any environment limitation supporting a change in status.
5. **Keep scope bounded.** Update only the active phase or directly affected
   dependency. Do not self-activate a later phase.
6. **Preserve truth labels.** Mock, unavailable, blocked, stale, and not-proven
   states must remain visible and must not be presented as live runtime truth.
7. **Do not rewrite history.** Preserve prior checkpoint notes; append a new
   dated checkpoint when status changes materially.
8. **Update authority-bearing plans after implementation.** If a phase closes,
   update the relevant acceptance document and this plan together, without
   changing a later phase to started unless separately authorized.
9. **Protect unrelated work.** Do not modify, delete, stage, commit, or rename
   user-owned files outside the active slice.
10. **Report blockers precisely.** Identify whether a blocker is governance,
    source, test, runtime, dependency, or environment related.

## Checkpoint Template

Agents should append a checkpoint in this form when a phase materially changes:

```text
DATE:
PHASE:
SLICE:
STATUS:
REPOSITORY HEAD:
FILES CHANGED:
IMPLEMENTED:
EVIDENCE:
VALIDATION:
PRESERVED INVARIANTS:
BLOCKERS / NOT PROVEN:
NEXT MINIMAL ACTION:
```

## Merge Discipline

Before moving a TUI slice into
`C:\Agents-Memory-Tool-v6-integration`:

- verify the destination branch and revision;
- compare contracts before copying implementation;
- map each TUI request/event/snapshot to an existing LBE owner;
- reject any direct UI-to-runtime bypass;
- keep mock and real paths explicitly distinguishable;
- run focused validation for the slice;
- run the destination's required validation;
- inspect the final diff for unrelated changes;
- record the integration evidence in this plan.

No merge, commit, or push is implied by this document. Those actions require
separate authorization.

## Source Blueprint References

The initial blueprint remains the product-design reference for the following:

- vision and non-goals: `docs/01_VISION.md`;
- component and authority boundaries: `docs/02_ARCHITECTURE.md`;
- runtime phases: `docs/03_RUNTIME_PIPELINE.md`;
- tool capability metadata: `docs/05_TOOL_REGISTRY.md`;
- bounded planning and stop conditions: `docs/06_PLANNER.md`;
- workspace read/write controls: `docs/10_WORKSPACE_TOOL.md`;
- validation and fast-fail order: `docs/11_VALIDATION_AND_FAST_FAIL.md`;
- governance: `docs/12_GOVERNANCE.md`;
- reasoning boundary: `docs/13_REASONING_LAYER.md`;
- verified memory: `docs/14_LEARNING_AND_MEMORY.md`;
- execution modes: `docs/15_EXECUTION_PIPELINE.md`;
- original capability roadmap: `docs/16_ROADMAP.md`;
- acceptance requirements: `docs/17_ACCEPTANCE_CRITERIA.md`;
- worked behavior examples: `docs/18_WORKED_EXAMPLES.md`.

These references describe intended architecture and product behavior. Current
repository source, current runtime evidence, and current authorized slice
remain implementation authority.

## P2/P3 Progress Checkpoint — Operation Result Shape Validation

```text
DATE: 2026-08-31
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: READ-ONLY ADAPTER RESULT SHAPE VALIDATION
STATUS: IMPLEMENTED / PROVEN LOCALLY
REPOSITORY HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631
BRANCH: main
```

Implemented:

- added defensive success-payload validation for `workspace.glob`,
  `workspace.search`, and `workspace.patch` in `src/wrapper.rs`;
- required operation-specific collections, counts, patch metadata, and
  receipt-backed success decoding before projecting completion;
- retained the existing LBE-owned identity, authorization, evidence, receipt,
  and execution boundaries.

Validation:

- `cargo fmt -- --check`: PASS;
- `cargo check --quiet`: PASS;
- `cargo test --quiet`: `172 passed`;
- `git diff --check -- src/wrapper.rs src/tests.rs`: PASS.

Blockers / not proven:

- approval-enabled `workspace.patch` mutation, complete P3 policy acceptance,
  full live integration, and installed interactive PTY acceptance remain
  unproven;
- the initial write-format attempt encountered a transient Windows mapped-file
  lock, so formatting was checked without rewriting unrelated files.

Next minimal action:

Run the focused real-runtime patch denial/approval contract only when an
approval-enabled writable LBE session and explicit mutation evidence are
available; do not claim mutation readiness from this decoder validation.

## P2/P3 Checkpoint — Baseline Revalidated

```text
DATE: 2026-08-31
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: TUI_P2_P3_GOVERNED_EXECUTION_INTEGRATION
STATUS: BASELINE REVALIDATED / CONTINUING
LBE HEAD: 7ca58f8 (main, dirty user work preserved)
TUI HEAD: 75d6a9678986654bb108f6c75f6c0fc3fe31e631 (main)
MACHINE GATE: OPEN / implementation_allowed=true / next_phase_locked=true
```

The LBE machine gate confirms this remains one active slice. Existing dirty
work is preserved; no staging, branch, worktree, commit, or push was used.
The next checkpoint is the existing adapter and contract validation.

## P2/P3 Checkpoint — Live Read-Only Agent Wall Flow

```text
DATE: 2026-08-31
STATUS: LIVE READ-ONLY FLOW PROVEN / MUTATION AND FULL P2/P3 REMAIN OPEN
SESSION: tui-live-readonly-20260831
WORKSPACE_ID: workspace_681a91b3a62538ad
```

Evidence from the isolated runtime session:

- real `workspace.read`, `workspace.list`, `workspace.glob`, and
  `workspace.search`: PASS; the writable `workspace.patch` fixture was not
  enabled;
- read-only authorization denial: PASS;
- missing-configuration and reconnect fail-closed tests: PASS (7 tests);
- installed `cargo run` PTY rendered `CONNECTED · AGENT WALL` and restored the
  terminal after `q`: PASS.

The complete P2/P3 gate remains open because approval-enabled mutation,
interactive receipt/diff/evidence rendering, and installed interactive
MCP/control-surface acceptance are not yet demonstrated. The Rust MCP
metadata bridge, retained state projection, and `/mcp` renderer are now
implemented and tested. The temporary runtime database is outside both
repositories and is not product state.

## MCP Metadata Projection Checkpoint — 2026-09-01

```text
STATUS: RUST MCP METADATA PROJECTION PROVEN / INSTALLED INTERACTIVE ACCEPTANCE OPEN
LBE CONTRACT: capabilities list --registry <path> --format json
RUST BRIDGE: RealLbeWrapper -> McpRegistryUpdated
RUST STATE: App retains schema version and Vec<McpIntegration>
RUST UI: /mcp renders retained metadata-only integration rows
EXECUTION_ATTEMPTED: false
```

The authorized LBE source defines the product command and public payload:
`action=capabilities.list`, `schema_version=1`, `integrations`, and
`execution_attempted=false`. Rust validates those fields and does not retain
MCP transport, execution, authorization, credential plaintext, or registry
authority. Configured live wrapper attachment and MCP metadata refresh passed;
the authoritative registry result was `schema_version=1`, `count=0`,
`integrations=[]`, and `execution_attempted=false`. Rust validation is
`cargo fmt -- --check` PASS, `cargo check` PASS, and `cargo test` PASS (178
tests). Installed interactive `/mcp` PTY/E2E acceptance remains NOT PROVEN and
the active P2/P3 gate remains OPEN.

## P2/P3 Checkpoint — Scoped Completion Boundary

```text
DATE: 2026-08-31
STATUS: CHECKPOINT COMPLETE / ACTIVE GATE REMAINS OPEN
```

Final scoped validation before the MCP slice passed: `cargo fmt -- --check`,
`cargo check --quiet`, and `cargo test --quiet` (`172 passed`). The MCP slice
subsequently passed `cargo check` and `cargo test` (`178 passed`), with the
metadata projection regression test passing. Documentation JSON parses
successfully. The remaining stop condition is the gate's unproven product
scope: approval-enabled writable mutation, interactive receipt/diff/evidence
rendering, installed interactive MCP acceptance, and full installed P2/P3
acceptance.

The combined repository diff check reports only pre-existing dirty-work
whitespace findings in unrelated files; those files were not reformatted or
reset. No branch, worktree, staging, commit, push, or unrelated cleanup was
performed.

## UI Projection Checkpoint — 2026-09-02

```text
DATE: 2026-09-02
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: CONNECTED RUNTIME USER-FACING PROJECTION
STATUS: IMPLEMENTED / LOCALLY PROVEN — INSTALLED ACCEPTANCE OPEN
REPOSITORY HEAD: 4be395a9dba52fa335151184bb84455931cd299b
BRANCH: main
```

Implemented in the existing Rust/Ratatui client:

- the welcome projection shows workspace identity, session identity, runtime
  connection state, and explicit read-only/mutation authorization posture;
- connected Tools, Processes, Receipts, and MCP panels identify their content
  as authoritative LBE projections;
- disconnected panels remain explicitly unavailable and do not claim live
  runtime truth;
- receipt empty-state rendering remains correct when only the projection status
  line is present;
- no provider backend, credential store, Python runtime, HTML server, or second
  authority was added.

Validation:

- Rust full suite: `201 passed, 0 failed`;
- `cargo check`: PASS;
- focused connected-panel and MCP projection tests: PASS;
- `git diff --check` for the affected Rust files: PASS.

Remaining limitation:

- `cargo fmt --check` continues to report pre-existing formatting differences
  across unrelated dirty-work regions;
- installed PTY/E2E acceptance, approval-enabled writable mutation, complete
  MCP execution ordering, and full installed P2/P3 acceptance remain open;
- the active machine gate remains OPEN and no phase advancement is claimed.

## Terminal, Headless, and Responsive Acceptance Checkpoint — 2026-09-02

```text
DATE: 2026-09-02
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: TERMINAL COMPATIBILITY / HEADLESS CONTRACT / RESPONSIVE UI
STATUS: IMPLEMENTED / LOCALLY PROVEN — EXTERNAL ACCEPTANCE OPEN
REPOSITORY HEAD: e29fe1e04c6894324ebf580e45bea34c2cf1feeb
BRANCH: main
```

Reconciled the existing Rust implementation with its roadmap contracts:

- `NO_COLOR` clears rendered styles after drawing;
- `LBE_ASCII` selects explicit ASCII-safe markers and logo tokens;
- Unicode-width-aware truncation protects long paths, model names, and wide
  characters;
- populated provider, model, doctor, and session panels render at the compact
  60×18 terminal size;
- `--no-tui`/`run` bypass alternate-screen initialization and expose structured
  headless result/event output with stderr diagnostics and meaningful exit codes;
- the minimum-size fallback remains explicit and truthful.

Validation:

- focused compatibility/headless/responsive tests: PASS;
- Rust full suite: PASS;
- `cargo check`: PASS;
- `git diff --check` for the affected files: PASS.

Remaining limitation:

- external PTY/ConPTY lifecycle smoke, installed live governed completion, and
  full P2/P3 acceptance remain open;
- the active machine gate remains OPEN.

## Cross-Workspace Provider Integration Checkpoint — 2026-09-02

```text
DATE: 2026-09-02
PHASE: P2/P3 — GOVERNED EXECUTION INTEGRATION
SLICE: LBE PROVIDER CATALOG / TUI ADAPTER RECONCILIATION
STATUS: IMPLEMENTED / LOCALLY PROVEN — LIVE PROVIDER ACCEPTANCE OPEN
SOURCE WORKSPACE HEAD: 5c3f24ca709b3b554eb24a75de5f787cb693a263
TUI WORKSPACE HEAD: 4be395a9dba52fa335151184bb84455931cd299b
BRANCH: main
```

Migrated from the canonical LBE runtime changes into the Rust client:

- provider-list and session-context decoding now accepts the registered LBE
  provider identities: `openai`, `openai-native`, `anthropic`, `gemini`,
  `vertex`, `bedrock`, `ollama`, `lmstudio`/`lm-studio`, `openrouter`,
  `opencode`, and `openai-compatible`;
- real provider discovery updates the adapter snapshot before downstream model
  selection;
- headless and interactive startup wait for the authoritative
  `ModelCatalogDiscovered` event before submitting a requested model;
- no provider transport, backend, credential, or LBE authority was copied into
  the TUI workspace.

Validation:

- Rust full suite: `202 passed, 0 failed`;
- all-registered-provider decoder regression: PASS;
- `cargo check`: PASS;
- `git diff --check` for the affected Rust files: PASS.

Remaining limitation:

- live authenticated execution for every provider, provider continuation,
  installed provider/model acceptance, and full installed P2/P3 acceptance
  remain unproven;
- the active machine gate remains OPEN.
