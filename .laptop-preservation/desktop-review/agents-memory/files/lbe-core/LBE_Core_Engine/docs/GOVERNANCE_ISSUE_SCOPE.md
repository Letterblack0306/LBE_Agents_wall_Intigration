# Governance Issue Scope

The issue scope gate exists to prevent unrelated work from being mixed into a task by documenting extra files after the fact.

Missing from changelog = documentation failure.
Outside active issue scope = intent failure.
Both must pass.

## Active Issue

`.governance/ISSUE_LEDGER.json` declares one `activeIssue`. The active issue is the only source of truth for which files may change during the current task.

## allowedFiles

`allowedFiles` is the exact file list permitted for the active issue. A changed file is not valid just because it appears in `docs/CHANGELOG_AGENT.md`; it must also appear in `allowedFiles`.

## forbiddenFiles

`forbiddenFiles` is an explicit deny list. If a file appears there, the gate blocks it even if it also appears in documentation.

## scopeLocked

When `scopeLocked` is true, scope expansion must be its own documented change. Implementation files and expanded scope cannot be mixed into the same commit.

## Correct Workflow

1. Create or select an active issue.
2. Lock the intended file scope in `.governance/ISSUE_LEDGER.json`.
3. Make only changes inside `allowedFiles`.
4. Document the actual changed files in `docs/CHANGELOG_AGENT.md`.
5. Regenerate indexes with `npm run governance:index`.
6. Run `npm run governance:check`.

## When An Unrelated File Appears

Restore the file, create a separate issue, or get explicit user approval before expanding `allowedFiles`.

Do not add unrelated files to the changelog to evade the gate.

Create a separate issue for separate work.
