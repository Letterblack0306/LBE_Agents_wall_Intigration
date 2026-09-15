# 16 — Roadmap

## Phase 0 — Preserve current retrieval

- Keep the Agents Memory Tool index read-only.
- Record current search behavior.
- Verify exact paths, hashes, snippets, line numbers, and exclusions.

## Phase 1 — Typed contracts

Implement and test:

- task record;
- evidence package;
- guard request;
- guard result;
- rule proposal.

## Phase 2 — One read-only vertical slice

Use one existing CEP problem and one real deterministic guard:

```text
user problem
→ search
→ evidence package
→ guard request
→ guard execution
→ LBE decision context
→ verdict
```

## Phase 3 — Workspace resolution

- resolve repository identity;
- detect duplicate-file ambiguity;
- classify production versus generated/archive/backup;
- attach current hashes.

## Phase 4 — Guard catalog integration

- expose existing `LB_Guards_Rules` guard metadata;
- bind workspace profiles;
- prevent model-invented guard IDs.

## Phase 5 — Small reasoning agent

- connect a small instruction model;
- allow selection and explanation only;
- keep verdict generation deterministic;
- keep writes disabled.

## Phase 6 — Rule proposal flow

- equivalence check;
- exact workspace-profile diff;
- user approval;
- governed application;
- activation validation;
- provenance recording.

## Phase 7 — Protected checkpoints

Add verified checkpoint visibility and evidence-backed reactivation.

## Phase 8 — Wider guard coverage

Expand only from observed failures and validated use cases.

## Phase 9 — Optional governed repair

Add bounded repair behavior only after inspection reliability is proven.
