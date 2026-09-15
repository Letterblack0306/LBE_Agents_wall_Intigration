# 11 — Validation and Verdicts

## Verdicts

### `PASS`

The applicable deterministic guard ran successfully and found the required condition satisfied.

### `FAIL`

The applicable deterministic guard found a concrete violation supported by evidence.

### `INSUFFICIENT_EVIDENCE`

The guard could not reach a reliable result because required evidence or validation is missing, ambiguous, or contradictory.

### `NOT_APPLICABLE`

The guard trigger or project scope does not apply.

## Verdict ownership

The reasoning model may explain a verdict. It may not invent one.

A verdict must reference:

- guard ID and version;
- workspace ID when relevant;
- evidence references;
- check execution result;
- validation result;
- LBE governance state;
- timestamp.

## Fast-fail order

1. resolve workspace;
2. confirm required files;
3. parse manifests/configuration;
4. run syntax or structural checks;
5. validate imports and entry points;
6. reproduce the narrow condition;
7. run the selected deterministic guard;
8. perform required project validation;
9. synthesize verdict.

## Missing validation

Never convert missing validation into `PASS`.
