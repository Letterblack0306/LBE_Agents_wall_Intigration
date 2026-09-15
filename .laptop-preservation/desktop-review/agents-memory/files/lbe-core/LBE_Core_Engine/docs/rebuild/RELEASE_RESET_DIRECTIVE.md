# LBE Clean-Room Release Reset Directive

Status: planning branch only. Do not publish from this branch.

## Why this exists

The current workspace has too many local/remote mismatches, generated artifact defects, duplicated CLI/TUI behavior, package-surface contamination, and over-strong security claims. Do not continue file-by-file patching. Rebuild the public release surface from a clean branch and make every generated artifact come from one documented source.

## Non-negotiable product decision

For the next clean release, ship **one public package only**:

```text
@letterblack/lbe-core
CLI: lbe
Public repo/mirror: LetterBlack-Sentinel
```

Do **not** ship `@letterblack/lbe-exec` in this release. Do not mention `lbe-exec`, `npx lbe-exec`, `createLocalExecutor from @letterblack/lbe-exec`, or `LocalExecutor` in `release-public/`, Sentinel, or the root public README.

The high-level executor API may exist inside `@letterblack/lbe-core`, but it must be documented as:

```js
import { createLocalExecutor } from '@letterblack/lbe-core';
```

If a separate `@letterblack/lbe-exec` package is wanted later, it must be done in a separate branch and separate release workflow after this core release is green.

## Branch workflow

Use a clean branch. Do not work on dirty `main`.

```powershell
cd <local-repo-root>\LBE_Core_Engine
git fetch origin
git checkout main
git pull --ff-only
git checkout -b clean-room/release-reset
```

If local dirty work exists, do not delete it. Quarantine it first:

```powershell
git checkout -b quarantine/pre-clean-room-drift
git add -A
git commit -m "chore: quarantine pre clean-room drift"
git checkout main
git pull --ff-only
git checkout -b clean-room/release-reset
```

## Operating rule for the agent

You are not fixing old files one by one. You are rebuilding the release surface from canonical contracts.

Do not:

- publish
- tag
- push to main
- edit generated `release-public/dist/cli.js` directly
- copy `release-exec` docs/types into `release-public`
- claim automatic rollback unless implemented and tested
- claim persistent replay protection unless persistent nonce storage is used
- claim all governance decisions are enforced inside WASM
- leave dead commands in help
- let TUI and direct CLI create different `.lbe/` shapes

Do:

- define one canonical package boundary
- make CLI/TUI call the same command functions
- generate release artifacts from source
- smoke-test the generated package in a fresh temp project
- report exact pass/fail evidence

## Canonical package boundary

Public package:

```json
{
  "name": "@letterblack/lbe-core",
  "bin": { "lbe": "dist/cli.js" },
  "main": "dist/index.js",
  "types": "types.d.ts"
}
```

NPM package may include only:

```text
dist/
assets/
docs/decisions/*.md
types.d.ts
README.md
LICENSE
package.json
```

NPM package must not include:

```text
src/
test/
tests/
scripts/
native/
.github/
release-public/
release-exec/
keys/
.env
package-lock.json
```

## Public truth claims

Allowed public claim:

```text
LBE is a local execution boundary for AI agents. It validates, audits, and controls agent-requested file and shell actions before execution.
```

Allowed WASM claim:

```text
LBE includes a deterministic WASM validation kernel for ordered policy decisions, replay checks, rate checks, audit hashing, rollback decisions, and risk classification.
```

Forbidden claims unless implemented and tested:

```text
All governance/auth/security decisions are enforced inside WASM.
Automatic rollback is performed for every failed write.
Persistent replay protection exists for every local executor call.
Used in production inside LetterBlack for After Effects.
Enterprise governance / hosted control plane.
```

## Architecture to keep

Keep these concepts:

```text
Agent proposes -> LBE validates -> LBE executes or blocks -> LBE writes evidence -> proof/status/logs summarize state
```

Keep central state, but simplify public docs:

```text
Normal users use:
- lbe status
- lbe logs
- lbe proof

Advanced users may inspect raw .lbe/ files.
```

Do not expose five competing audit paths in the basic README.

## Mandatory rewrite targets

Rewrite or normalize these source areas under one contract:

```text
src/cli/main.js
src/cli/parseArgs.js
src/cli/public-strings.js
src/cli/tui.js
src/cli/tui-flows.js
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
src/exec/localExecutor.js
src/state/scopeContract.js
src/state/auditMode.js
src/state/proofRunner.js
native/lbe-engine/src/lib.rs
scripts/build-public-sdk.mjs
scripts/check-public-artifact.mjs
release/README.md
release/types.d.ts
release-public/package.json
.github/workflows/release-check.yml
.github/workflows/release-prepare.yml
.github/workflows/release-publish.yml
```

If a listed file does not exist, create it only if it belongs to the single-package boundary. Do not recreate `release-exec` for this release.

## Required behavioral corrections

1. CLI/TUI consistency

- `lbe init` and TUI Apply Boundary must call the same initializer.
- Remove Boundary must not crash.
- TUI must not duplicate its own `.lbe/` bootstrap logic.
- Help must not list commands that `main.js` cannot route.
- Advanced help hint must be `lbe --help --advanced`.

2. Package identity

- No `@letterblack/lbe-exec` in public core README/types/artifacts.
- No `npx lbe-exec` in public core docs.
- Only CLI name is `lbe`.

3. Read-only commands

- `verify` must not mutate policy state, nonce DB, rate DB, audit log, or proof.
- `dryrun` must not mutate policy state, nonce DB, rate DB, audit log, or proof.
- `run` may mutate nonce/rate/audit state.

4. Persistence failures

- If nonce/rate/audit persistence fails after validation touched state, fail hard with structured output.
- Do not swallow persistence errors in security-sensitive paths.

5. Local executor truth

- If rollback is not actually performed, do not return or document it as performed.
- If replay protection is not persistent, do not claim it is persistent.
- Observer mode wording: it does not execute target action; it may write audit evidence.

6. Scope/read blockers

- Missing required-reading file must return a structured blocker, not a raw crash.

7. WASM truth

- Correct protocol comments.
- Do not overclaim `lbe_execute()` if it only checks field presence.
- Add output null-termination/truncation safety.
- Add tests for spoofed nested JSON if `lbe_execute()` stays public.

## Required tests

Add or update tests proving:

```text
CLI:
- node --check every CLI command file
- `lbe --help` works
- `lbe --help --advanced` works
- no dead command appears in advanced help
- `lbe init` creates one canonical .lbe shape
- TUI Apply Boundary uses same init implementation
- Remove Boundary does not crash

Read-only:
- verify does not mutate policy.state.json
- dryrun does not mutate policy.state.json
- dryrun does not mutate nonce/rate/audit/proof files

Run:
- approval output is `approval_pending`, includes approvalPending and approvalRequired, exits 11
- nonce/rate persistence failure exits hard

Package:
- release-public has no lbe-exec strings
- release-public package name is @letterblack/lbe-core
- release-public bin is lbe -> dist/cli.js
- npm pack dry-run excludes forbidden paths

WASM:
- packed validation pipeline passes/fails in documented order
- invalid key fails before signature
- replay nonce fails before policy
- output is null-terminated

Docs:
- README has no unsupported production/After Effects claim
- README does not expose raw audit internals as the basic path
- README does not claim automatic rollback unless test proves it
```

## Validation commands

Run from repo root:

```powershell
cd <local-repo-root>\LBE_Core_Engine

node --check src/cli/main.js
node --check src/cli/parseArgs.js
node --check src/cli/public-strings.js
node --check src/cli/tui.js
node --check src/cli/tui-flows.js
node --check src/cli/commands/init.js
node --check src/cli/commands/status.js
node --check src/cli/commands/verify.js
node --check src/cli/commands/dryrun.js
node --check src/cli/commands/run.js
node --check src/exec/localExecutor.js
node --check src/state/scopeContract.js
node --check src/state/auditMode.js
node --check src/state/proofRunner.js

cargo test --manifest-path native/lbe-engine/Cargo.toml
cargo build --target wasm32-unknown-unknown --release --manifest-path native/lbe-engine/Cargo.toml

npm run build:engine
npm run build:public-sdk
node --check release-public/dist/cli.js
node scripts/check-public-artifact.mjs
npm run audit:encoding
npm run audit:public-docs
npm run proof
```

Fresh install smoke:

```powershell
$SMOKE = Join-Path $env:TEMP "lbe-clean-room-smoke"
Remove-Item -Recurse -Force $SMOKE -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $SMOKE | Out-Null
cd $SMOKE
npm init -y
npm install <local-repo-root>\LBE_Core_Engine\release-public
npx lbe --help
npx lbe --help --advanced
npx lbe init --yes
npx lbe status
npx lbe audit-workspace --json
npx lbe proof --public
```

Package scan:

```powershell
cd <local-repo-root>\LBE_Core_Engine\release-public
npm pack --dry-run --json
cd ..
rg -n "@letterblack/lbe-exec|lbe-exec|release-exec|Used in production|After Effects|all governance decisions|automatic rollback|persistent replay" release-public README.md release README.md
```

Expected `rg` result: no forbidden matches except test fixtures explicitly named as negative tests.

## Final report format

Return only:

```text
clean branch: <name>
package boundary clean: YES/NO
CLI/TUI unified: YES/NO
read-only commands non-mutating: YES/NO
run persistence hard-fail: YES/NO
local executor truth corrected: YES/NO
scope missing-file structured: YES/NO
WASM claims corrected: YES/NO
release-public rebuilt: YES/NO
fresh install smoke passed: YES/NO
npm pack clean: YES/NO
public docs clean: YES/NO
ready for PR: YES/NO
blockers:
- ...
```
