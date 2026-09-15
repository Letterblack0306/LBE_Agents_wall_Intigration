# LBE Scope Contract

`lbe.scope` is the Audit Mode task contract.

It does not block agent tools. It decides whether a task can be marked valid.

```text
scope contract
intent
before snapshot
agent work
after snapshot
proof
status
```

## Product Boundary

Correct claim:

```text
LBE makes agent work scope-bound, auditable, and provable.
```

Incorrect claim:

```text
LBE blocks every agent write and shell command.
```

Hard blocking remains Guard Mode work. Scope contracts are the bridge between documentation-only guidance and a later execution bridge.

## Files

```text
.lbe/
  scope.json
  scope-read.jsonl
  intent.jsonl
  audit.jsonl
  snapshots/
    before.json
    after.json
  proof/
    latest.json
```

`.lbe/scope.json` is the active task contract.

`.lbe/scope-read.jsonl` records read receipts for required reading. LBE can prove the file was read through the LBE command and hashed. It cannot prove the agent understood the document.

## Scope Shape

```json
{
  "version": 1,
  "id": "scope_0015_scope_contract",
  "objective": "Add lbe.scope as Audit Mode task contract.",
  "requiredReading": [
    { "path": "docs/LBE_EXECUTION_BOUNDARY_HANDOFF.md", "required": true },
    { "path": "ISSUE_LEDGER.md", "required": true }
  ],
  "allowedFiles": [
    "src/state/**",
    "src/cli/**",
    "test/cli-scope-contract.test.js",
    "docs/LBE_SCOPE_CONTRACT.md"
  ],
  "forbiddenFiles": [
    "package.json",
    "release-public/**",
    "release-exec/**"
  ],
  "requiredValidation": [
    "node --test test/cli-scope-contract.test.js",
    "npm run governance:check",
    "git diff --check"
  ],
  "forbiddenActions": [
    "publish",
    "tag",
    "push",
    "git add ."
  ]
}
```

## CLI

```powershell
lbe scope set .lbe/scope.json
lbe scope show
lbe scope read
lbe scope status
lbe intent begin --scope scope_0015_scope_contract --task "Add lbe.scope"
lbe snapshot before
lbe snapshot after
lbe proof
lbe status
```

## Status Labels

Normal user-facing output should use labels only:

```text
NO_SCOPE_FOUND
SCOPE_REGISTERED
REQUIRED_READING_MISSING
INTENT_SCOPE_MISMATCH
CHANGED_OUTSIDE_SCOPE
FORBIDDEN_FILE_TOUCHED
VALIDATION_MISSING
CLEAN
```

Private proof can retain exact paths and evidence under `.lbe/`.

## Proof Rules

Audit proof must check:

1. Active scope exists.
2. Intent references the active scope id.
3. Required reading receipts exist.
4. Changed files match `allowedFiles`.
5. `forbiddenFiles` were not touched.
6. Required validation was recorded.

If any check fails, LBE must not report `CLEAN`.

## Non-Goals

This issue does not add:

- server bridge
- MCP server
- adapter isolation
- shell interception
- OS sandbox
- release/tag/publish workflow changes
