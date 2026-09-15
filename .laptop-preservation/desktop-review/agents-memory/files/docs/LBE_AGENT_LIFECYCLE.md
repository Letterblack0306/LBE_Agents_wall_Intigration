# LBE Agent Lifecycle

Status: **Live operational document** - the complete end-to-end flow of an LBE agent turn.

> Read this after `README.md` and before Vision / Architecture. It tells **how a task actually
> flows through LBE**: who reasons, who authorizes, who executes, and who decides it is done.

## Central invariant

> **LBE governs an agent's capabilities and consequences; it does not prescribe the agent's
> reasoning procedure.**

The agent/LLM reasons; LBE owns authority. Capabilities (Guard Inspector, governed tools, etc.)
sit **on top of** the LBE boundary - they are never parallel authority owners.

## Ownership split (canonical)

```text
Agent / provider owns:                LBE owns:
- reasoning                           - workspace / session identity
- investigation strategy              - mode / policy
- hypothesis formation                - authorization
- capability / tool selection         - capability boundaries
- replanning after results            - governed execution
- interpretation                      - operation identity / ToolReceipt
- communication                       - evidence provenance
                                      - persistence
                                      - deterministic validation / completion truth
```

## The operational flow

Each step states **who owns it**. The pattern is always: the agent proposes, LBE gates; LBE proves, the agent interprets.

```text
1. intake
     agent receives the task; LBE creates a task record
     (user problem, target workspace when applicable, expected outcome, mode, write-permission state)

2. workspace identity resolution   [LBE]
     LBE confirms the correct workspace; stops on ambiguity
     files are never selected by basename alone - path + hash + classification required

3. knowledge / evidence retrieval [retrieval = history, not truth]
     retrieval supplies ranked evidence and current workspace facts
     current workspace/runtime evidence OUTRANKS memory/reference history

4. agent selects a capability     [agent reasoning]
     the agent chooses among registered LBE capabilities (e.g. guard.inspect)
     capability selection is owned by the agent; it is NOT prescribed by LBE

5. authorization                  [LBE - mandatory]
     R6C deterministic authorization runs before any governed execution
     only registered, governed tools may execute

6. governed execution             [LBE]
     R6E governed tool orchestration + ToolReceipt
     operation IDs / receipts prevent unintended duplicate execution

7. provider continuation          [agent]
     the agent reasons again over receipts and evidence
     continuation consumes receipts but owns NO execution authority

8. validation / completion        [LBE - deterministic truth]
     completion belongs to deterministic LBE validation, not provider prose
     missing validation never converts to PASS

9. persistence                    [LBE]
     session / turn / item / evidence / checkpoint state is LBE-owned and durable
```

## Properties maintained at every step

- **Provider/model changes never change LBE authority.**
- **Current evidence outranks memory.**
- **Once an operation executes, its Receipt and evidence are persisted** before the agent interprets the result.
- **CLI / TUI / API surfaces are control / projection layers only** - they render the observed receipt, evidence, diff, failure, or blocked result; they never become duplicate authority owners.
- **Capabilities are repositioned, not discarded** - e.g. `LBERequestController` becomes a bounded/specialist investigation capability (`guard.inspect`); Guard Inspector remains a deterministic capability available to an agent.

## Where protected checkpoints fit

Passed checkpoints remain:

```text
visible -> verified -> unchanged -> out of scope while unrelated work proceeds
```

They are reactivated only on an evidence-backed trigger: a conflicting intent, a dependency crossing into them, a bound hash change, an explicit superseding user intent, or validation tracing the current defect into them.

## Stop conditions

The lifecycle stops with `INSUFFICIENT_EVIDENCE` (never a fabricated verdict) when:

- the workspace is ambiguous;
- required files are missing;
- retrieved evidence conflicts without a current-source resolution;
- the selected capability cannot run;
- validation required for the verdict is unavailable.

## Authority top to bottom

```text
current validation
> current workspace / Git / runtime evidence
> active machine gate         (.lbe/governance/implementation-gates.json)
> machine-declared active plan
> canonical design / plan
> verified historical records
> reference knowledge
> model inference
```

## Cross-references

- `docs/README.md` - entry point and documentation routing.
- `docs/IMPLEMENTATION_PLAN.md` section 1 (product goal) and 15 (architecture correction).
- `docs/design/AGENT_AGENCY_LBE_AUTHORITY_SEPARATION.md` - accepted ownership boundary.
- `docs/design/AGENT_LIFECYCLE_PHASES.md` - the product-level lifecycle (phases, owners, IDE
  surfaces, and reuse/wrap/own); this document is the operational turn flow within it.
- `.lbe/governance/implementation-gates.json` - authoritative active-slice authorization.
- `docs/CURRENT_STATUS.md` - concise present-tense state snapshot.

This document is the owner of the **operational flow**. Do not restate this flow elsewhere; link here. Live code, the machine gate, and runtime evidence outrank this document.
