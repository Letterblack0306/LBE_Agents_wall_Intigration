# LBE_Core_Engine — Governance Overview

Private source workspace for `@letterblack/lbe-core`.

## Workspace status

| Field | Value |
|---|---|
| Current version | See [`RELEASE_STATE.json`](RELEASE_STATE.json) — `currentVersion` |
| Release repo | `Letterblack0306/LetterBlack-Sentinel` |
| Publish authority | `Letterblack0306/LetterBlack-LBE-Core` only |
| Authoritative branch | `main` — primary worktree only |

## Release state model

`RELEASE_STATE.json` stores static release policy and package state only:

- package name
- current version
- version source
- release surface allowlist
- release surface denylist

Commit identity is not stored in `RELEASE_STATE.json`. A tracked file cannot
contain the final commit hash of the same commit without creating a
self-reference loop. Release commit, tag, remote, and npm alignment must be
verified dynamically during the release gate with Git and npm metadata:

- `git rev-parse HEAD`
- `git rev-parse vX.Y.Z^{}`
- remote `main` SHA
- remote tag peeled SHA
- npm metadata after publish

## Governance files

| File | Role |
|---|---|
| [`INDEX.md`](../INDEX.md) | Root workspace index — every tracked path must be listed |
| [`docs/INDEX.md`](INDEX.md) | Docs index — every doc under `docs/` must be listed |
| [`docs/RELEASE_STATE.json`](RELEASE_STATE.json) | Machine-readable static release policy/state validated by `release-gate` |
| [`docs/RELEASE_AUTHORITY.md`](RELEASE_AUTHORITY.md) | Release authority rules |
| [`docs/governance/mainhead.md`](governance/mainhead.md) | Branch and worktree authority |

## Guard scripts

| Script | npm command | When it runs |
|---|---|---|
| `scripts/workspace-index-guard.mjs` | `npm run guard:index` | pre-push hook, `release:gate` |
| `scripts/mainhead-guard.mjs` | `npm run guard:mainhead` | pre-commit hook, pre-push hook, `release:gate` |
| `scripts/release-gate.mjs` | `npm run release:gate` | required before any publish action |

## Release sequence

```
npm run release:gate      ← runs: guard:index + guard:mainhead + validate:all + pack dry-run
npm run verify:public-sdk
npm run verify:public-exec
# then: git commit, git tag, publish from release-*/
```

Do not run `npm publish` from the workspace root. See `RELEASE_AUTHORITY.md`.
