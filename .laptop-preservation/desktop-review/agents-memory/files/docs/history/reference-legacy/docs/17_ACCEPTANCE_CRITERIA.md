# 17 — Acceptance Criteria

## Retrieval

- Returns ranked, deduplicated evidence.
- Preserves exact paths, hashes, snippets, and valid line ranges.
- Distinguishes current, archive, backup, generated, experimental, and reference records.
- Never modifies indexed source data.

## Workspace resolution

- Selects the correct workspace.
- Never resolves duplicate basenames without path and hash.
- Cannot escape the configured root.
- Reports ambiguity instead of guessing.

## Evidence package

- Separates indexed knowledge, current workspace facts, and validation.
- Preserves authority and verification metadata.
- Includes contradictions and missing evidence.

## Reasoning agent

- Selects only registered guards.
- Distinguishes evidence from inference.
- Cannot produce an unsupported verdict.
- Stops on insufficient evidence.

## Deterministic guards

- Return structured, reproducible results.
- Bind findings to evidence.
- Distinguish `PASS`, `FAIL`, `INSUFFICIENT_EVIDENCE`, and `NOT_APPLICABLE`.

## Governance

- Read-only by default.
- LBE Core owns authorization.
- Secrets are redacted.
- Destructive actions require explicit approval.
- No success claim without proof.

## Rule proposal

- Checks for an equivalent existing rule.
- Proposes a workspace rule before a global guard.
- Produces an exact diff.
- Requires user approval.
- Validates activation after application.
- Records provenance and rollback.

## User experience

The user can state a problem in ordinary language and receive:

- the relevant guard;
- why it applies;
- what evidence was checked;
- the deterministic verdict;
- what is missing, when evidence is insufficient;
- an optional workspace-protection proposal.
