# 19 — First Vertical Slice

## Goal

Prove the complete read-only Guard Inspector path with one real problem and one existing guard.

## Recommended case

CEP error:

```text
Provided callback is not a function
```

## Required implementation

### Input

```json
{
  "problem": "Provided callback is not a function",
  "workspace_root": "G:/Developments/TargetCEP",
  "mode": "inspect"
}
```

### Steps

1. Resolve workspace identity.
2. Search the SQLite index using the exact phrase and semantic terms.
3. Exclude archive, build, backup, and `.cep-dev` copies unless specifically required.
4. Retrieve exact evidence records.
5. Inspect current callback callers.
6. Build `evidence_package`.
7. Select one registered callback guard.
8. Execute the deterministic guard.
9. Run the narrow validation required by that guard.
10. Return a structured `guard_result`.
11. Produce a human explanation from the structured result.

## Proof requirements

The test must demonstrate:

- correct workspace selection;
- correct duplicate-file handling;
- exact paths;
- valid hashes;
- valid line numbers;
- no unsupported inference;
- deterministic verdict;
- no write;
- no permanent memory promotion.

## Status

Implemented and tested.

- `lbe_guard_inspector/evidence_service.py` builds the `evidence_package`.
- `audit_controller.run_rule()` executes the registered deterministic guard.
- `lbe_guard_inspector/guard_runner.py` orchestrates evidence packaging, guard execution, workspace corroboration, and `guard_result` production.
- `lbe_guard_inspector/guard_inspector.py` applies the evidence-bound verdict policy.
- `POST /guard-run` exposes the complete slice.

All proof requirements are covered by the pytest suite (48 passed). The slice produces deterministic, read-only `guard_result` verdicts and never writes to the workspace or promotes memory.


## Completion condition

The slice is complete only when the same inputs and workspace state produce the same guard result.
