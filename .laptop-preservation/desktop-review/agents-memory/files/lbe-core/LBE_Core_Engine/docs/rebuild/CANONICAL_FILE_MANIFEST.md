# Canonical File Manifest — Clean-Room Release Reset

This manifest prevents agent guessing. Use it with `docs/rebuild/RELEASE_RESET_DIRECTIVE.md`.

## Release decision

Next clean release ships one package only:

```text
@letterblack/lbe-core
bin: lbe
```

`@letterblack/lbe-exec` is deferred. Do not generate or publish it in this reset.

## Files to keep as architecture foundation

Do not rewrite these unless tests prove a defect:

```text
src/state/stateRoot.js
src/state/workspaceId.js
src/state/workspaceRegistry.js
src/state/index.js
src/state/targetRegistry.js
src/state/intentRegistry.js
src/state/fileIndex.js
src/state/auditMode.js
src/state/proofRunner.js
src/state/blockerRegistry.js
src/state/migration.js
src/core/workspaceScanner.js
```

Allowed touch in foundation layer:

```text
src/state/scopeContract.js
```

Reason: required-reading missing files must return structured status, not raw fs crash.

## Files to normalize/rebuild

### CLI entry and public text

```text
src/cli/main.js
src/cli/parseArgs.js
src/cli/public-strings.js
src/cli/tui.js
src/cli/tui-flows.js
```

Rules:

```text
- public-strings.js is the only public label/help source
- main.js must route every command shown in help
- TUI must call shared command/init logic
- no duplicated .lbe bootstrap logic in TUI
```

### CLI commands

```text
src/cli/commands/init.js
src/cli/commands/status.js
src/cli/commands/logs.js
src/cli/commands/openState.js
src/cli/commands/proof.js
src/cli/commands/verify.js
src/cli/commands/dryrun.js
src/cli/commands/run.js
src/cli/commands/auditWorkspace.js
src/cli/commands/intent.js
src/cli/commands/scope.js
src/cli/commands/snapshot.js
src/cli/commands/auditVerify.js
src/cli/commands/health.js
src/cli/commands/integrityCheck.js
src/cli/commands/policySign.js
src/cli/commands/policyMode.js
src/cli/commands/policyAdd.js
src/cli/commands/assertConsumer.js
```

Rules:

```text
- verify and dryrun are read-only
- run may mutate nonce/rate/audit state
- every hard failure returns structured JSON
- no stale root-level config paths unless intentionally migrated
- no `@letterblack/lbe-exec` references
```

### Local executor

```text
src/exec/localExecutor.js
src/hooks/register.cjs
src/hooks/appendCentral.cjs
```

Rules:

```text
- API imports from @letterblack/lbe-core only
- observer mode does not execute target action; it may write audit evidence
- no persistent replay claim unless persistent nonce storage is used
- rollback result must match actual behavior
```

### WASM engine

```text
native/lbe-engine/src/lib.rs
```

Rules:

```text
- deterministic validation kernel claim only
- no overclaim that all auth/security decisions live in WASM
- packed pipeline comment must match actual input length
- output must be null-terminated safely
```

### Build/release generation

```text
scripts/build-public-sdk.mjs
scripts/check-public-artifact.mjs
release/README.md
release/types.d.ts
release-public/package.json
release-public/README.md
release-public/types.d.ts
release-public/dist/cli.js
```

Rules:

```text
- release-public files are generated, not hand-patched
- generated CLI must pass node --check
- generated package must contain no src/scripts/tests/native/.github/release-exec
```

### GitHub workflows

```text
.github/workflows/release-check.yml
.github/workflows/release-prepare.yml
.github/workflows/release-publish.yml
```

Rules:

```text
release-check:
- validate only
- no tag
- no npm publish
- no Sentinel sync

release-prepare:
- manual version input
- build release-public
- npm pack dry-run
- fresh install smoke
- may create draft release only after artifact smoke
- no npm publish

release-publish:
- protected environment
- human approval
- core package only
- tag before npm publish
- publish @letterblack/lbe-core only
- verify npm registry after publish
```

## Files to delete or quarantine for this reset

Do not include in release-public or Sentinel:

```text
release-exec/
exec/
any @letterblack/lbe-exec README/types/package docs
```

If the source repo still needs them for future work, move them to a deferred branch or leave them unreferenced by release-public. Do not let them influence core package generation.

## Public string denylist

The following strings must not appear in `release-public/`, root public README, or Sentinel mirror:

```text
@letterblack/lbe-exec
lbe-exec
release-exec
Used in production
After Effects
all governance decisions
automatic rollback
persistent replay protection
enterprise dashboard
hosted control plane
```

Allowed only in internal docs or negative tests.

## Pull instructions for the agent

```powershell
cd <local-workspace-root>
git clone https://github.com/Letterblack0306/LetterBlack-LBE-Core.git LBE_Core_Engine_CleanRoom
cd LBE_Core_Engine_CleanRoom\LBE_Core_Engine
git checkout clean-room/release-reset-plan
```

Then read, in order:

```text
docs/rebuild/RELEASE_RESET_DIRECTIVE.md
docs/rebuild/CANONICAL_FILE_MANIFEST.md
```

Then create the actual implementation branch locally:

```powershell
git checkout -b clean-room/release-reset-implementation
```

Do not implement directly on the planning branch.
