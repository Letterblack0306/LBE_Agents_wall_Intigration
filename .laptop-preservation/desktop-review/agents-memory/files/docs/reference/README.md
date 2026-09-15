# LBE Guard Inspector Workspace Blueprint

This package defines the current architecture for a small, evidence-first **LBE Guard Inspector**.

It is not a general coding agent. Its primary job is to:

1. accept a user problem;
2. retrieve relevant rules, guards, patterns, proofs, and examples;
3. inspect the current workspace when required;
4. ask deterministic guards to evaluate the evidence;
5. route governed actions through LBE Core;
6. return an evidence-backed verdict;
7. optionally propose a new workspace-specific protection rule for user approval.

## Central invariant

```text
Model selects and interprets.
Retrieval supplies historical evidence.
Workspace tools supply current facts.
Guards detect.
LBE Core authorizes.
Validation proves.
The user approves new persistent constraints.
```

## Operating flow

```text
Rules / guards / patterns / proofs / examples
        ↓
Agents Memory Tool SQLite index
        ↓
Search / inspect tools
        ↓
Relevant evidence package
  ├─ indexed reference knowledge
  ├─ current workspace evidence
  └─ validation results
        ↓
Small LBE reasoning agent
        ↓
Guard selection and inspection requests
        ↓
Deterministic guard implementations
        ↓
LBE Core governance / authority decision
        ↓
Validation and proof
        ↓
PASS / FAIL / INSUFFICIENT_EVIDENCE / NOT_APPLICABLE
```

## Repository roles

- `Letterblack0306/LB_Guards_Rules`
  - reusable deterministic guards;
  - workspace-specific guard profiles;
  - rule and guard gallery.

- `Letterblack0306/LetterBlack-LBE-Core`
  - workspace identity and scope;
  - policy and capability checks;
  - approval and execution authority;
  - audit and proof boundary.

- Agents Memory Tool
  - indexes reference knowledge;
  - exposes search and inspection;
  - does not decide verdicts or authority.

## First implementation target

Build one read-only vertical slice:

```text
User problem
→ indexed search
→ evidence package
→ one existing deterministic guard
→ governed inspection
→ evidence-backed verdict
```

Do not integrate broad repair automation or permanent rule creation before this path is proven.
