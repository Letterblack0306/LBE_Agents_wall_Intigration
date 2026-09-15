# LBE Exec Correction Release Template

Use this template for any future `@letterblack/lbe-exec` correction release.
Keep Core and Exec decisions separate.

## Scope Lock

- Do not publish `@letterblack/lbe-exec` until local tarball smoke and registry smoke are both planned.
- Do not change `@letterblack/lbe-core` unless the active issue explicitly authorizes Core changes.
- Do not tag before npm publish succeeds and registry metadata verifies.
- Do not use `git add .`.
- Do not advertise a quarantined Exec version.

## Required Baseline

Run from the `LBE_Core_Engine` repository folder:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short
git fetch origin
git reset --hard origin/main
git status --short
```

Expected:

- Branch is `main`.
- Working tree is clean.
- Commands are not run from a parent folder that contains sibling verification checkouts.

## Build

```powershell
npm ci
npm run build:engine
$env:LBE_EXEC_PACKAGE_VERSION="<correction-version>"
npm run build:public-exec
node scripts/check-public-exec.mjs
node --check release-exec/dist/cli.js
node --check release-exec/dist/index.js
node --input-type=module -e "import('./release-exec/dist/index.js').then(m=>{if(typeof m.createLocalExecutor!=='function')throw new Error('missing createLocalExecutor'); console.log('createLocalExecutor export OK')})"
```

## Package Smoke

```powershell
Push-Location release-exec
npm pack --dry-run
npm pack
Pop-Location

$smokeRoot = Join-Path $env:TEMP "lbe-exec-<correction-version>-smoke"
Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
Set-Location $smokeRoot
npm init -y | Out-Null
npm install "<absolute-path-to-repo>\release-exec\letterblack-lbe-exec-<correction-version>.tgz"
npx --no-install lbe-exec --help
npx --no-install lbe-exec status
npx --no-install lbe-exec init
npx --no-install lbe-exec policy
node --input-type=module -e "import('@letterblack/lbe-exec').then(m=>{if(typeof m.createLocalExecutor!=='function')throw new Error('missing createLocalExecutor'); console.log('createLocalExecutor export OK')})"
```

## Commit And Push

Stage only the files in scope:

```powershell
git diff --check
git diff --name-status
git add -- <exact-files>
git diff --cached --summary
git diff --cached --name-status
git commit -m "fix(exec): <short correction>"
git push origin main
```

## Publish Gate

Verify the correction version is not already published:

```powershell
npm view @letterblack/lbe-exec@<correction-version> version dist.integrity dist.tarball --json
```

If npm returns metadata for that version, stop and choose a new correction version.
If npm returns `E404`, publish:

```powershell
Push-Location release-exec
npm publish --access public
Pop-Location
```

## Registry Verification

```powershell
npm view @letterblack/lbe-exec@<correction-version> version dist.integrity dist.tarball --json
npm view @letterblack/lbe-exec version --json
```

Then install from the registry:

```powershell
$smokeRoot = Join-Path $env:TEMP "lbe-exec-<correction-version>-registry-smoke"
Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
Set-Location $smokeRoot
npm init -y | Out-Null
npm install @letterblack/lbe-exec@<correction-version>
npx --no-install lbe-exec --help
npx --no-install lbe-exec status
npx --no-install lbe-exec init
npx --no-install lbe-exec policy
node --input-type=module -e "import('@letterblack/lbe-exec').then(m=>{if(typeof m.createLocalExecutor!=='function')throw new Error('missing createLocalExecutor'); console.log('createLocalExecutor export OK')})"
```

## Tag

If global tag signing blocks local tagging, do not wait indefinitely.
Use an explicit unsigned release tag only after publish and registry smoke succeed:

```powershell
git -c tag.gpgSign=false tag lbe-exec-v<correction-version> <published-commit>
git push origin lbe-exec-v<correction-version>
```

## Release State

After publish, registry metadata, registry smoke, and tag push all succeed:

- Update `docs/RELEASE_STATE.json`.
- Mark the corrected Exec version as `USER_RELEASE_ALLOWED`.
- Preserve the previous quarantined version and reason.
- Record the published commit and tag.
- Commit and push the release-state update.

## Final Report

Report only proven states:

- Package name and version.
- Published commit.
- Tag.
- Registry metadata result.
- Local tarball smoke result.
- Registry install smoke result.
- Core package unchanged: yes or no.
- Remaining blockers.
