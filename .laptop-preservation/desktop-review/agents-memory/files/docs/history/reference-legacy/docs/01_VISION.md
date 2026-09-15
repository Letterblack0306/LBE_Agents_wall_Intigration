# 01 — Vision

## Objective

Build a small Guard Inspector that behaves like a disciplined security and quality reviewer for software workspaces.

The user should be able to say:

> Why is this feature failing?

or:

> Check whether this workspace follows the relevant rules.

The system should locate relevant knowledge, inspect only necessary evidence, select applicable deterministic guards, and return a truthful verdict.

## Primary outcomes

- `PASS`
- `FAIL`
- `INSUFFICIENT_EVIDENCE`
- `NOT_APPLICABLE`

These outcomes are produced by deterministic guard execution and governance context, not by model opinion.

## Non-goals

- General autonomous coding.
- Training a new foundation model.
- Treating indexed history as current truth.
- Allowing the model to invent guard verdicts.
- Silent creation of permanent workspace policy.
- Broad workspace scanning without a task-driven reason.
- Reopening verified protected features without evidence-backed conflict.

## Design principles

1. Evidence before interpretation.
2. Current workspace facts outrank historical similarity.
3. The model selects; deterministic guards decide conditions.
4. LBE Core owns execution authority.
5. Read-only is the default.
6. Permanent constraints require explicit user approval.
7. A local finding becomes a workspace rule before it can become a global guard.
8. Verified checkpoints remain visible but quiet until a conflict trigger appears.
