# 07 — Rules, Guards, and Profiles

## Definitions

### Rule

A declared requirement containing:

- trigger;
- rationale;
- required action;
- evidence requirement;
- severity;
- exceptions;
- auto-apply behavior.

### Deterministic guard

Executable implementation that checks a rule condition.

### Workspace profile

A workspace-specific set of enabled rules, exceptions, paths, ownership constraints, and guard configuration.

### Global reusable guard

A reviewed guard intended for compatible project types beyond one workspace.

## Promotion path

```text
Single verified finding
        ↓
Workspace-specific profile rule
        ↓
Repeated verified pattern across compatible projects
        ↓
Candidate reusable guard
        ↓
Review + validation + explicit approval
        ↓
Global guard
```

## Restrictions

- A reasoning model cannot silently create a rule.
- A single finding should not become a global guard.
- Proposed rules must include exact scope and provenance.
- New rules must be checked for equivalence and contradiction.
- Every applied profile change must be validated.
