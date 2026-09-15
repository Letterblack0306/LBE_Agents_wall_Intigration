# 05 — Tool Registry

## Purpose

Provide a typed list of real capabilities. The reasoning agent must never guess which tools exist.

## Required tool fields

- tool ID;
- description;
- input schema;
- output schema;
- read/write classification;
- network behavior;
- risk level;
- timeout;
- retry policy;
- preconditions;
- failure modes;
- evidence produced.

## Initial tools

| Tool | Purpose | Default |
|---|---|---|
| `workspace.resolve` | Resolve workspace identity | Read-only |
| `memory.search` | Search indexed rules, guards, patterns, proofs, examples | Read-only |
| `memory.fetch` | Fetch exact indexed records | Read-only |
| `workspace.tree` | Inspect bounded file tree | Read-only |
| `workspace.read` | Read exact current files | Read-only |
| `workspace.hash` | Compute current hashes | Read-only |
| `workspace.compare` | Compare selected files or checkpoints | Read-only |
| `guard.catalog` | List applicable deterministic guards | Read-only |
| `guard.inspect` | Execute an approved deterministic guard | Controlled read-only execution |
| `validation.run` | Run approved validation | Controlled execution |
| `lbe.decide` | Evaluate authority and policy | Governed |
| `rule.check_equivalent` | Detect equivalent existing rules | Read-only |
| `rule.propose_profile` | Produce profile-rule proposal and diff | Read-only |
| `rule.apply_profile` | Apply approved workspace rule | Disabled by default |
| `memory.write_verified` | Store verified reusable knowledge | Validation-gated |

## Core schemas

- `evidence_package.schema.json`
- `guard_request.schema.json`
- `guard_result.schema.json`
- `rule_proposal.schema.json`
- `task_record.schema.json`
