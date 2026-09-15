# @letterblack/lbe-core

**Release 1.3.42**

LBE is local execution control for AI agents. It evaluates file and shell
actions routed through its execution boundary, records local evidence, and
returns an allow/deny outcome before the governed action runs.

This release documents the decision-only package. If you need the in-process
controller that performs governed file and shell operations, that is a separate
legacy/internal surface.

## Install and start

```bash
npm install -g @letterblack/lbe-core
lbe init
lbe status
lbe logs
lbe proof --public
lbe open-state
```

No-install form:

```bash
npx --package @letterblack/lbe-core lbe init
npx --package @letterblack/lbe-core lbe status
npx --package @letterblack/lbe-core lbe logs
npx --package @letterblack/lbe-core lbe proof --public
npx --package @letterblack/lbe-core lbe open-state
```

`init` creates project policy material. `status` shows the local central state
for the current workspace; `logs` reads its event history; `proof` shows the
latest proof result; and `open-state` opens the central state folder.

## Local state and proof

LBE keeps state locally in a central per-user state folder. Each workspace has
a stable workspace ID and its own event log. In v1.3, an existing
`.lbe/events.jsonl` remains local fallback truth and is imported into central
state once; the source file is preserved.

Proof combines an intent, optional target, file index, LBE events, and
`proof/latest.json`. Use `lbe proof --public` for a redacted proof summary.
Non-inspectable targets can produce `WEAK_PROOF` rather than a stronger claim.

## CLI reference

| Command | Purpose |
|---|---|
| `lbe init` | Create project-local policy and key state |
| `lbe status` | Show workspace ID and central state paths |
| `lbe logs` | Read the central event history |
| `lbe open-state` | Open the local central state folder |
| `lbe proof` | Show the latest proof result |
| `lbe proof --public` | Show a redacted proof summary |

For no-install execution, prefix any command with:

```bash
npx --package @letterblack/lbe-core
```

Example:

```bash
npx --package @letterblack/lbe-core lbe proof --public
```

## What ships

```
bin/lbe.js                   CLI entrypoint
dist/cli/lbe.js              Packaged CLI runtime
dist/hooks/register.cjs      Packaged hook bridge
dist/state/index.cjs         Packaged central-state resolver
dist/state/appendCentral.cjs Packaged central event appender
```

Source code, controller implementation, adapters, tests, keys, and runtime
state are not included.

## Limits

Only actions routed through LBE are controlled. Central writes are best-effort,
logs remain local, and LBE does not provide process isolation or network
egress control.
