# 14 — Memory and Protected Checkpoints

## Memory types

### Indexed reference memory

Rules, patterns, examples, historical mistakes, chats, and project Q&A.

### Workspace memory

Current architecture, entry points, constraints, profiles, and known risks.

### Verified proof memory

Evidence that a specific check or repair passed.

### Protected checkpoint memory

Verified intent and feature state that must remain visible but quiet during unrelated work.

### Rule memory

Approved workspace rules and reviewed global guards.

## Protected attention model

```text
Passed checkpoint
→ remain visible
→ do not analyze
→ do not modify
→ reactivate only on evidence-backed conflict
```

## Reactivation triggers

- intent conflict;
- dependency crossing;
- bound hash change;
- explicit superseding user intent;
- validation traces failure into the checkpoint.

## Write gate

Memory may be promoted only when:

- evidence is clear;
- required validation passed;
- sensitive data is redacted;
- source and authority are recorded;
- the knowledge is not overgeneralized;
- user approval exists where persistent policy changes are involved.
