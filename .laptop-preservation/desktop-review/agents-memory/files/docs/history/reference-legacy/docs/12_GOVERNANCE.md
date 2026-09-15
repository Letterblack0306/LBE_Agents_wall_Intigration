# 12 — Governance

## Default posture

Read-only until explicit authorization or an active governing policy grants a specific write.

## LBE Core boundary

LBE Core owns:

- workspace identity;
- task scope;
- policy;
- capability;
- approval requirements;
- execution authority;
- audit;
- completion proof.

## Command classes

- safe read-only;
- controlled validation;
- write/build;
- destructive.

Only allowed classes may execute automatically.

## Rule proposal governance

A rule proposal must include:

- target workspace;
- proposed rule ID;
- trigger;
- rationale;
- scope;
- required action;
- evidence;
- severity;
- exceptions;
- equivalent-rule check;
- exact diff;
- validation plan;
- rollback plan;
- provenance.

The system must request user approval before applying it.

## Secret and network policy

- redact credentials;
- do not store raw environment values;
- do not print secrets;
- external network access must be explicit;
- approved local services may be used according to policy.

## Completion policy

No success claim without matching evidence and validation.
