# 10 — Workspace Inspection

## Purpose

Collect current facts from a selected workspace under strict boundaries.

## Read operations

- list bounded files;
- read exact sections;
- inspect manifests and package metadata;
- search symbols;
- compute hashes;
- compare checkpoint files;
- inspect active workspace policy;
- run approved read-only checks.

## Boundary rules

- remain inside the resolved workspace root;
- reject traversal outside root;
- identify repository and branch where relevant;
- distinguish production, generated, archive, backup, vendor, and experiment files;
- never select duplicate basenames without path and hash evidence.

## Write operations

Disabled by default.

When the user approves a workspace-profile change:

- produce an exact diff first;
- state rationale and scope;
- record provenance;
- use version control or backup;
- validate the applied rule;
- report rollback instructions.

## Protected checkpoints

A protected feature remains:

- visible;
- verified;
- unchanged;
- out of scope.

It is reactivated only when:

- a new intent conflicts with it;
- a dependency crosses into it;
- a bound file hash changes;
- a newer user intent supersedes it;
- validation traces the current defect into it.
