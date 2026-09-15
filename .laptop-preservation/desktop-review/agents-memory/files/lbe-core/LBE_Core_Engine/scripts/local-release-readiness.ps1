param(
  [string]$Root = "Z:\Core_Control",
  [string]$Repo = "https://github.com/Letterblack0306/LetterBlack-LBE-Core.git",
  [string]$Branch = "chore/activate-root-release-workflows",
  [string]$CloneName = "release-workflow-verify",
  [string]$SmokeName = "release-workflow-smoke"
)

$ErrorActionPreference = "Stop"

$Clone = Join-Path $Root $CloneName
$Smoke = Join-Path $Root $SmokeName

Write-Host "== LBE workflow branch release-readiness verification =="
Write-Host "Repo=$Repo"
Write-Host "Branch=$Branch"

Set-Location $Root

Remove-Item -Recurse -Force $Clone -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $Smoke -ErrorAction SilentlyContinue

git clone --branch $Branch --single-branch $Repo $Clone

Set-Location $Clone

$Head = git rev-parse HEAD
Write-Host "HEAD=$Head"

Write-Host "---CHANGED_FILES_AGAINST_ORIGIN_MAIN---"
git fetch origin main
git diff --name-status origin/main...HEAD

$Changed = git diff --name-only origin/main...HEAD
$Allowed = @(
  ".github/workflows/lbe-release-check.yml",
  ".github/workflows/lbe-release-prepare.yml",
  ".github/workflows/lbe-release-publish.yml",
  "LBE_Core_Engine/scripts/local-release-readiness.ps1"
)

$Unexpected = @()
foreach ($Path in $Changed) {
  if ($Allowed -notcontains $Path) {
    $Unexpected += $Path
  }
}

if ($Unexpected.Count -gt 0) {
  Write-Host "Unexpected changed files:"
  $Unexpected | ForEach-Object { Write-Host " - $_" }
  throw "Branch contains files outside workflow-safety scope."
}

git diff --check origin/main...HEAD

Set-Location (Join-Path $Clone "LBE_Core_Engine")

npm ci
npm run release:check
npm run build:engine
npm run build:public-sdk
node --check release-public/dist/cli.js
node scripts/check-public-artifact.mjs
npm run audit:encoding
npm run audit:public-docs

Set-Location (Join-Path $Clone "LBE_Core_Engine\release-public")

npm pack --dry-run --json
npm pack

$Tgz = Get-ChildItem *.tgz | Select-Object -First 1
if (-not $Tgz) {
  throw "No tarball created."
}

Write-Host "TARBALL=$($Tgz.FullName)"

New-Item -ItemType Directory -Path $Smoke | Out-Null
Set-Location $Smoke

npm init -y
npm install $Tgz.FullName

Write-Host "---SMOKE_VERSION---"
npx lbe --version

Write-Host "---SMOKE_INIT---"
npx lbe init

Write-Host "---SMOKE_STATUS---"
npx lbe status

Write-Host "---SMOKE_PROOF---"
$npxProof = npx lbe proof
Write-Host $npxProof

Set-Location (Join-Path $Clone "LBE_Core_Engine")

$Status = git status --short
Write-Host "---GIT_STATUS---"
Write-Host $Status

if ($Status.Trim().Length -ne 0) {
  throw "Release readiness failed: workflow verification clone became dirty."
}

Write-Host "WORKFLOW_BRANCH_READY_CHECK=PASS"
Write-Host "HEAD=$Head"
Write-Host "TARBALL=$($Tgz.Name)"