# Validation Gates

## Gate 1 - Workspace contract

Required:
- WORKSPACE_CONTRACT.md exists
- RELEASE_SCOPE.md exists
- FEATURE_LEDGER.json exists
- REMOVED_FEATURES.json exists
- AGENTS.md exists

Fail if:
- release scope is missing
- feature state is UNKNOWN for changed area
- removed feature appears again

## Gate 2 - Code validation

Run:

```powershell
npm run lint
npm test
npm run validate:all
```

Pass condition:
- lint passes
- tests pass
- validate:all passes

## Gate 3 - LBE execution proof

Run a controlled test workspace.

Required proof:
- `.lbe/observe.jsonl` contains entries after observe run
- `.lbe/audit.jsonl` contains deny entry after enforce run
- denied file remains unchanged

Fail condition:
- no audit/observe entry means LBE bypass, and release fails

## Gate 4 - Package proof

Run:

```powershell
npm pack --dry-run
```

Pass condition:
- package contains only public release files
- no private source-only docs
- no keys
- no internal roadmap
- no test fixtures unless intentional
- no CEP/AI/Brew-specific leaked modules

## Gate 5 - Git proof

Run:

```powershell
git status --short
git diff --stat
git diff --name-status
```

Pass condition:
- only approved files changed
- no unrelated generated files staged
- no git add .
