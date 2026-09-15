# 15 — Execution Modes

## Inspect mode

Read-only. Returns guard applicability, evidence, and verdict.

## Explain mode

Explains existing guard results and their evidence without changing the workspace.

## Propose-rule mode

Produces a workspace-specific rule/profile proposal and exact diff. Does not apply it.

## Apply-profile mode

Applies an explicitly approved workspace-profile rule through LBE Core and validates activation.

## Repair mode

Not part of the first vertical slice.

A future repair mode may propose and execute changes only after:

- workspace identity is proven;
- guard result is established;
- scope is bounded;
- user authorization exists;
- LBE Core allows the action;
- validation is available.

## Recommended default

Start every task in `inspect` mode.
