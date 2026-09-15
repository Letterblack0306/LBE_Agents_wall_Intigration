# Post-Merge Reconciliation Gate

This file exists to prevent PR/main mismatch loops during clean release work.

## Core Rule

Historical chat is context only.

Current evidence is:

1. `origin/main`
2. fresh clone state
3. generated release artifact
4. fresh install smoke
5. `npm pack --dry-run --json`
6. GitHub PR/branch/tag/npm state

Do not treat local logs, agent summaries, or stale PR state as release proof.

## PR/Main Mismatch Rule

If a PR remains open but the equivalent content was rebased and pushed to `main`, do not keep trying to merge that PR.

Instead:

1. Verify `origin/main` from a fresh clone.
2. Verify the expected files and package identity.
3. Run the release-check equivalent from fresh `main`.
4. Run fresh install smoke.
5. Confirm package boundary.
6. Comment on the stale PR with the verified `main` SHA.
7. Close the stale PR as superseded.

## Clean Release Gate

A clean release cannot proceed until all pass:

- fresh clone from `origin/main`
- working tree clean
- `@letterblack/lbe-core` package identity
- CLI binary is `lbe`
- generated CLI parses with `node --check`
- release-public artifact scan passes
- fresh install smoke passes
- npm pack boundary is clean
- forbidden public claims scan passes
- no tag created yet
- no npm publish yet

## Forbidden Assumptions

Do not assume:

- PR closed means content is correct
- PR open means content is absent from main
- local commit SHA equals GitHub merge SHA
- generated files are source of truth
- README claims prove runtime behavior
- installed package files prove LBE execution happened

## Required Status Labels

Use separate labels:

- LOCAL CLAIMED
- LOCAL VERIFIED
- REMOTE VERIFIED
- MAIN VERIFIED
- NPM VERIFIED
- RELEASE READY

Never collapse these into "done."
