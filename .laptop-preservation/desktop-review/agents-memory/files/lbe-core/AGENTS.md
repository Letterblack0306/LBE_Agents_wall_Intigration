# LBE Agent Workspace Contract

## Authoritative workspace

`G:\Developments\42_LBE_Core_Clean`

The synced `G:` workspace is the working source of truth. GitHub is the remote reference and collaboration surface.

## Current product goal

Prove that an agent cannot mutate a governed workspace except through an LBE-authorized, payload-bound, auditable execution.

## Required startup sequence

Before changing anything:

1. Read `tasks/ACTIVE_TASK.json`.
2. Read only the files listed in `requiredContext` plus direct dependencies needed to understand them.
3. Inspect the current Git diff.
4. Confirm the requested work fits `allowedFiles` and does not enter `forbiddenAreas`.
5. Do not modify files until the active task scope is established.

## Task modes

- `INSPECT`: read-only; no writes.
- `VERIFY`: evidence only; no source changes.
- `IMPLEMENT`: change only `allowedFiles`.
- `REPAIR`: change only the named defect inside `allowedFiles`.
- `RELEASE`: prohibited unless explicitly assigned by the user.

## Non-negotiable rules

- Exactly one active task.
- No change outside `allowedFiles`.
- Findings and historical notes do not authorize implementation.
- Do not restore a feature marked `REMOVED` without explicit user approval.
- Agents propose. Controller decides. Adapters execute.
- Agents must not receive direct filesystem, shell, adapter, controller-internal, or generic execution handles.
- Tests passing does not prove the execution boundary.
- Documentation is not authorization.
- Installation is not enforcement.
- Policy presence is not policy use.
- Validation is not execution.
- Execution is not completion.
- Do not commit, push, tag, publish, stage, or release unless the active task explicitly authorizes it.
- Do not expand into TUI, MCP, cloud, Railway, shell adapters, marketing, or unrelated architecture unless explicitly assigned.

## Stop conditions

Return `BLOCKED` and stop when:

- a required change is outside `allowedFiles`;
- a forbidden area must be touched;
- the active architecture conflicts with the task;
- credentials or external access are required;
- the same failure remains after the allowed repair limit;
- user input is genuinely required to choose between materially different outcomes.

Do not ask whether to continue when the next action is already authorized and remains inside scope.

## Completion contract

Return structured evidence containing:

- task ID;
- terminal state: `COMPLETE`, `BLOCKED`, or `FAILED`;
- files read;
- files changed;
- validation commands and results;
- acceptance criteria and evidence;
- bypass result;
- actual Git diff files;
- unresolved blockers.

Mark `COMPLETE` only when every acceptance criterion passes and the actual diff is contained entirely within the approved scope.
