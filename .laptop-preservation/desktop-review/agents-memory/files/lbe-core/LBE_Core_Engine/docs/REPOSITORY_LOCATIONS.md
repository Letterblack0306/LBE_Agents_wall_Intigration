# Repository Locations

Do not guess workspace paths. This document defines the canonical local filesystem paths for all repositories in the LBE ecosystem.

## Canonical paths

| Role | Local path | GitHub repo |
|---|---|---|
| Private source / build authority | `Z:\Core_Control\LBE_Core_Engine` | `Letterblack0306/LetterBlack-LBE-Core` |
| Public release / consumer-facing | `H:\LetterBlack-Sentinel` | `Letterblack0306/LetterBlack-Sentinel` |

## Rules

1. **Private source repo** (`Z:\Core_Control\LBE_Core_Engine`) — Use for:
   - Source code changes, generators, tests, and build logic
   - Internal governance docs, ADRs, release flow
   - `.lbe/` state, audit logs, policy files
   - Pre-release validation and workspace audit
   - Publishing `@letterblack/lbe-core` to npm
   - Creating GitHub releases and tags

2. **Public release repo** (`H:\LetterBlack-Sentinel`) — Use for:
   - Public-facing README, docs, and npm package surface
   - Final public artifact checks (`npm pack --dry-run`, smoke tests)
   - Community inspection and public CI verification
   - Must not contain publish workflows, release creation, or tag creation

3. **Do not**:
   - Initialize a new git repo unless explicitly approved
   - Recreate commits manually in the public repo
   - Copy private source internals into the public repo unless explicitly listed as public
   - Copy secrets, `.lbe` state, audit logs, local paths, test scratch, `node_modules`, or private governance notes into the public repo

## Sync direction

Generated public output flows **one way**: from the private source build into the public repo.

```
Z:\Core_Control\LBE_Core_Engine (source)
    → npm run build:public-sdk
    → release-public/
    → sync script copies to H:\LetterBlack-Sentinel
```

The public repo never pushes changes back into the private source.

## Before editing docs

Confirm whether the doc belongs to:
- **Source docs** (`Z:\Core_Control\LBE_Core_Engine\docs\`) — internal governance, ADRs, release playbook, changelog
- **Public docs** (`H:\LetterBlack-Sentinel\docs\` or `README.md`) — consumer-facing technical visuals, install guide, API reference

If a path is unclear, stop and ask. Do not infer from old conversation history.
