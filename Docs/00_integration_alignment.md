# LBE TUI / Agent Wall Integration Alignment

Status: **PHASE 0 â€” DOCUMENTATION ALIGNMENT â€” CLOSED / PROVEN**

Updated: 2026-08-30

Phase 0 is complete in the TUI repository. It changed documentation and removed
one confirmed backup artifact only; it did not copy or modify LBE runtime code,
raw proof, state, credentials, or machine governance.

This document is the TUI repository's integration map. It explains where the
two repositories meet and prevents the interface workspace from becoming a
second LBE runtime.

## Repository ownership

```text
C:\LBE-TUI-Lab
  = Rust/Ratatui interaction, rendering, projections, client contracts,
    mock behavior, and integration tests

C:\Agents-Memory-Tool-v6-integration
  = LBE Python runtime and CLI authority: governance, sessions, providers,
    authorization, governed execution, evidence, receipts, persistence,
    validation, completion truth, machine gates, and raw acceptance proof
```

The backend workspace is the Python/CLI product authority. Its primary control
surfaces include:

```text
C:\Agents-Memory-Tool-v6-integration\lbe_guard_inspector\cli.py
    = thin Python CLI control plane

C:\Agents-Memory-Tool-v6-integration\lbe_guard_inspector\product_entry.py
    = product-level Python entrypoint and command composition

C:\Agents-Memory-Tool-v6-integration\server.py
    = backend service entrypoint
```

The Python CLI delegates to existing LBE runtime owners; it must not become a
second session, provider, authorization, execution, evidence, receipt, or
completion authority. The Rust TUI invokes or bridges to these LBE-owned Python
surfaces and only renders their authoritative projections.

The TUI calls the runtime only through the wrapper boundary:

```text
Ratatui TUI
    -> WrapperClient / LbeWrapper
    -> LBE / Agent Wall runtime
    -> governed result, evidence, receipt, or persisted event
    -> TUI projection
```

The TUI must not become a second authorization owner, execution owner,
provider credential store, persistence authority, evidence authority, receipt
authority, or direct command executor.

The optional `documentation_companion_plugin/` is a vendored documentation
projection component only. It may consume LBE-owned identifiers and lifecycle
events to render derived Markdown when explicitly invoked, but it is not wired
into the active runtime and owns none of the authorities listed above.

## Runtime modes

The TUI exposes three conversational modes: **Runtime**, **Plan**, and
**Audit**. All three are agent-mediated; mode selection changes the agent's
focus and allowed workflow, not the user's need to operate tools or commands.

### Runtime

Runtime is the broad workspace-aware mode. The agent reasons about the user's
request, uses what it knows about the workspace, selects available capabilities,
interprets results, and replans. LBE determines the applicable policy,
authorization, capability boundary, execution path, evidence, receipt,
persistence, and completion truth.

```text
user request
    -> agent reasoning and capability selection
    -> LBE policy and authorization
    -> governed operation
    -> evidence / ToolReceipt / result
    -> agent continuation or completion
```

The conversation is the normal user interface. Users are not expected to issue
LBE tool or process commands directly, and the TUI does not grant access by
exposing a button or slash command. Slash commands and projection panels may
remain available as optional developer/agent diagnostics and contract-test
surfaces; they are not a replacement for agent-mediated access control.

### Plan

Plan is also broad and conversational. The agent investigates the workspace,
reasons about possible approaches, and produces a proposal without executing
the proposed work.

### Audit

Audit is a narrower conversational mode focused on workspace rules. The agent
looks for the applicable rules, guards, audit targets, and current evidence,
reasons specifically against those constraints, and explains the findings in the
conversation. It is strictly read-only. The user does not need to issue
inspection commands, and the agent's reasoning never becomes an unsupported
compliance verdict.

```text
audit request
    -> workspace identity
    -> agent finds relevant audit targets and evidence
    -> bounded read-only inspection through the governed audit path
    -> agent reasoning and evidence-backed finding
    -> PASS / FAIL / INSUFFICIENT_EVIDENCE / NOT_APPLICABLE
    -> stop
```

Audit mode does not modify files, create guards, execute arbitrary commands, or
bypass LBE authorization and evidence rules. Any slash command or panel exposed
by the TUI is optional diagnostic scaffolding, not the audit workflow.

## Integration sequence

```text
P0  deterministic TUI wrapper invariants       CLOSED / PROVEN
P1  read-only RealLbeWrapper attachment        PASS
P2  governed workspace tools and operations    ACTIVE NEXT SLICE
P3  permissions, policy, and sandbox           GATED WITH P2
P4  provider and reasoning-agent loop          LOCKED UNTIL P2/P3 PASS
P5  IDE workflow and review surfaces           LOCKED UNTIL GOVERNED PATH
P6+ persistence and advanced workspace         LOCKED
```

The current LBE machine gate is authoritative for implementation permission.
At the 2026-08-30 reconciliation, it identifies:

```text
active_slice = TUI_P2_P3_GOVERNED_EXECUTION_INTEGRATION
status       = OPEN
next_phase_locked = true
```

This document does not authorize implementation by itself. The active LBE
machine gate and acceptance plan remain the authorization source.

## Proof and reference policy

Raw runtime proof stays in the LBE repository, including machine gates,
databases, receipts, command hashes, environment bindings, and acceptance
outputs. The TUI repository records only bounded references to that proof and
the exact TUI revision tested.

P1 live read-only proof is recorded locally in:

```text
Docs/34_p1_live_readonly_acceptance.md
Docs/35_p1_live_acceptance_evidence_record.md
```

Those documents do not prove governed mutation, provider generation, command
execution, or complete IDE integration.

## Batch rule

Bring contracts and implementation in bounded batches only when their phase is
active. Do not copy the LBE runtime, raw proof, state directories, credentials,
or parallel authority code into this repository.

For every future batch:

1. identify the existing LBE owner;
2. identify the smallest TUI projection or adapter contract needed;
3. confirm the active machine-gated slice;
4. implement only the TUI-side change;
5. validate against the LBE owner;
6. record the tested revisions and proof references;
7. preserve mock, unavailable, blocked, and insufficient-evidence labels.

## Canonical references

- LBE runtime lifecycle: `C:\Agents-Memory-Tool-v6-integration\docs\LBE_AGENT_LIFECYCLE.md`
- LBE current status: `C:\Agents-Memory-Tool-v6-integration\docs\CURRENT_STATUS.md`
- LBE active machine gate: `C:\Agents-Memory-Tool-v6-integration\.lbe\governance\implementation-gates.json`
- TUI implementation sequence: `Docs/33_real_cli_ide_implementation_plan.md`
- TUI modular status: `Docs/STATUS.md`

The LBE repository remains authoritative when this reference document and live
runtime evidence disagree.


## Cross-workspace status (2026-08-31)


## Provider reuse and TUI integration boundary (2026-09-02)

The TUI is created and integrated in this workspace. Its provider responsibility is
limited to discovery, display, selection, submission through LBE, and projection of
the returned provider/runtime state. The TUI must not implement provider transports,
hold provider credentials, maintain an independent provider registry, or bypass LBE.

The approved reuse direction is:

```text
Cline / OpenCode provider and agent-loop mechanics
        -> LBE-owned provider adapter
        -> LBE provider registry and runtime contracts
        -> LBE authorization / session / receipt / evidence / completion authority
        -> C:\LBE-TUI-Lab real bridge
        -> provider picker and visible runtime projection
```

Cline and OpenCode are reuse/reference sources, not parallel runtime authorities.
Existing evidence identifies Cline provider gateway mechanics under `@cline/llms`,
provider/model resolution under `@cline/agents` and `@cline/shared`, and local Cline
reference material at
`C:\Agents-Memory-Tool-v6-integration\unused-in-repo\cline-cli-reference-copy-2026-08-27`.
The exact OpenCode repository, revision, source symbol, license/provenance record,
dependency pin, and tested adapter import path are recorded as follows:

- repository: `anomalyco/opencode`
- pinned source review: `dc4449df0d52199704ea4989a5a993ebbc605612`
- installed runtime: OpenCode `1.18.25`
- adapter path: canonical `Cline AgentRuntime` worker -> LBE
  `cline_reasoning_provider.py`

The immutable `pravesh0306/LBE_Presistent_Agent_wall@v2.0.2` release reference
contains provider adapter work for:

```text
openai-compatible
openai
anthropic
gemini
openai-native
vertex
bedrock
ollama
lmstudio
openrouter
opencode
```

Those provider implementations belong at the LBE backend/runtime boundary. They
must not be copied into this TUI repository or recreated here. The current dirty LBE
checkout and the v2.0.2 release are separate evidence sources and must not be
conflated. Provider existence in the release reference does not by itself prove
production readiness or current canonical-runtime registration.

The bounded reconciliation required before provider integration is accepted is:

1. freeze the exact Cline and OpenCode source revisions;
2. compare those sources with the v2.0.2 provider adapters;
3. identify reused mechanics versus LBE-native adapter glue;
4. reconcile only the required provider implementation, dependency, and test chain
   into the canonical LBE backend workspace;
5. register the adapted providers through LBE's active provider registry;
6. preserve LBE authorization, workspace, session, receipt, evidence, validation,
   and completion ownership;
7. update the TUI real catalog bridge to accept only provider IDs returned by LBE;
8. project unavailable, unauthenticated, failed, and ready states truthfully; and
9. run focused provider tests and configured live checks without copying the release
   repository wholesale.

Current status classification:

```text
provider reuse direction             CONFIRMED
TUI ownership as integration layer   CONFIRMED
complete canonical provider wiring  PROVEN — registry and adapter composition
all provider IDs accepted by TUI     PROVEN — 11 registered IDs decoded
exact OpenCode provenance           PROVEN — pinned revision and installed 1.18.25
clean release production readiness  NOT PROVEN
```

This section records the integration boundary and current reconciliation result. It does
not authorize provider implementation in the TUI, provider transport duplication,
runtime-state copying, or a claim that live authenticated execution for every provider
is complete.
