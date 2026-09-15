# Release Playbook — `@letterblack/lbe-core`

## Architecture Overview

```
+-------------------------------------------------------------+
—                    RELEASE PIPELINE                          —
—                                                              —
—  Local ? CI Gate ? Tag ? Release Workflow ? npm + Mirror    —
—                                                              —
—  Gate:  release-hygiene.mjs  (structured blockers)          —
—  CI:    release-check.yml    (push/PR/tag trigger)          —
—  Deploy: release.yml         (tag trigger, npm publish)     —
+-------------------------------------------------------------+
```

---

## 1. Pre-Release Checklist (Local)

Run these from the repo root before considering a tag.

### 1.1 Version Alignment

```powershell
node -e "const p=require('./package.json');const pp=require('./release-public/package.json');const ep=require('./release-exec/package.json');console.log('root:',p.version,'public:',pp.version,'exec:',ep.version,'ALIGNED:',p.version===pp.version&&pp.version===ep.version)"
```

**Expected:** All three must match (e.g., `1.3.40`).

### 1.2 Release Hygiene Quick Check

```powershell
node scripts/release-hygiene.mjs --quick
```

**Expected:** `ALL GATES PASSED — RELEASE AUTHORIZED` (or structured blockers with clear fixes).

The quick check skips `validate:all` (tests). It validates:
- **VERSION** — package.json alignment, docs contain version, dist headers, **asset version scan** (no stale `vX.Y.Z` in SVG/PNG assets)
- **FILES** — `build:public-sdk`, `check-artifact`, `verify-pack-proof`, `npm pack --dry-run`
- **DOCS** — forbidden content markers in README files
- **CLI** — `help`, `status`, `proof` commands work, all menu handlers present
- **GIT** — whitespace check, clean working tree

### 1.3 Full Validation

```powershell
npm run validate:all
```

This runs:
1. `node scripts/mainhead-guard.mjs --release` — branch authority (accepts detached HEAD if commit == origin/main)
2. `node scripts/release-authority-guards.mjs` — release authority boundaries
3. `npm run engine:check` — WASM engine integrity
4. `npm run test:release` — 205 tests, ~16 seconds, deterministic (excludes hanging `security-invariants`)

### 1.4 Proof

```powershell
npm run proof
```

**Expected:** `12 tests ? 12 passed`

### 1.5 Governance

```powershell
npm run governance:check
npm run governance:index
```

**Expected:** `[governance] PASS` — all changed files must belong to the active issue scope.

### 1.6 Public Documentation Audit

```powershell
npm run audit:public-docs
```

**Expected:** `Public documentation audit passed.`

## 2. Test Script Reference

| Script | Scope | Time | Use Case |
|--------|-------|------|----------|
| `npm test` | All 30 files | hangs | Avoid — includes `security-invariants` (concurrent file-lock hang on Windows) |
| `npm run test:unit` | 29 files (incl. invariant-backup) | ~16s | Development |
| `npm run test:release` | 28 files (excl. invariant-backup, security-invariants) | ~16s | **Release validation** |
| `npm run test:slow` | Only `security-invariants.test.js` | 120s timeout | Isolated slow/hanging test |

---

## 3. GitHub Actions CI Pipeline

### 3.1 Release Hygiene Check (`release-check.yml`)

**Triggers:** `push` to `main`, `pull_request` to `main`, `tags v*.*.*`, `workflow_dispatch`

```yaml
working-directory: LBE_Core_Engine
steps:
  - checkout@v4
  - setup-node@v4  (node 20)
  - npm ci
  - npm run release:check    # FULL: VERSION -> FILES -> DOCS -> CLI -> TESTS -> GIT
```

**Success mode:** Exit 0, `ALL GATES PASSED — RELEASE AUTHORIZED`
**Failure mode:** Exit 1, structured `AGENT_BLOCKERS_JSON` with id/severity/stage/file/expected/found/meaning/fix

### 3.2 Release Authority (`release.yml`)

**Triggers:** Tag push `v*.*.*`, `workflow_dispatch` (with `mode` and `tag` inputs)

**Steps:**
1. **Resolve release ref** — extract tag/version from trigger
2. **Checkout** — checkout at tag commit
3. **Verify tag alignment** — tag commit == HEAD
4. **Setup Node.js 20** + npm registry
5. **Install dependencies** — `npm install` in `LBE_Core_Engine`
6. **[Gate] Validate metadata and docs** — package name, version, CHANGELOG, Release-README, RELEASE_STATE
7. **[Gate] Release packaging gate** — `build:engine`, `build:public-sdk`, `check-artifact`, `verify-pack-proof`, `audit:public-docs`, `npm test`
8. **[Gate] Final npm pack proof** — checks packed files against `forbiddenNpmPackedPaths` (skipping `publicRepoFiles` directories)
9. **Publish `@letterblack/lbe-core`** — `npm publish --access public` from `release-public/`
10. **Publish `@letterblack/lbe-exec`** — separate exec package
11. **Verify npm alignment** — poll npm for gitHead match (5 retries, 15s apart)
12. **Sync public mirror** — `node scripts/ci-sync-public.mjs` -> `LetterBlack-Sentinel`
13. **[Gate] Fresh install smoke test** — install from npm, run `init`, `status`, `proof --public`
14. **Create GitHub Release** — `gh release create`
15. **Final release summary**

---

## 4. Tagging Procedure

### 4.1 Confirm CI is Green

Check https://github.com/Letterblack0306/LetterBlack-LBE-Core/actions — look for **Release Hygiene Check** green on latest `main`.

### 4.2 Commit Everything

```powershell
cd <repo-root>
git status --short    # must be clean (only tracked changes, no surprises)
```

### 4.3 Tag

```powershell
git tag -a v1.3.XX -m "Release v1.3.XX"
git push origin v1.3.XX
```

**Critical:** After pushing the tag, do NOT push additional commits to main. The release workflow checks out the tag commit. If main moves ahead of the tag, `mainhead-guard --release` will block with:
```
release commit <tag-sha> is not main HEAD <newer-sha>
```

### 4.4 Manual Trigger (if tag push does not auto-fire)

```powershell
$env:GITHUB_TOKEN = "<token>"
gh workflow run release.yml -R Letterblack0306/LetterBlack-LBE-Core --ref main -f mode=release -f tag=v1.3.XX
```

### 4.5 Re-Tagging (if release fails and you need to fix)

```powershell
# Delete remote tag, re-tag on latest HEAD, push
git push origin :refs/tags/v1.3.XX
git tag -d v1.3.XX
git tag -a v1.3.XX -m "Release v1.3.XX" HEAD
git push origin v1.3.XX

# Tag force-push does NOT re-trigger the workflow.
# Use manual dispatch:
gh workflow run release.yml -R Letterblack0306/LetterBlack-LBE-Core --ref main -f mode=release -f tag=v1.3.XX
```

**Note:** If the previous release run already published to npm, the re-run will fail at npm publish with E403 ("cannot publish over previously published versions"). This is harmless — it means the package was already shipped.

---

## 5. Common Pitfalls and Fixes

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `B()` calls in release-hygiene.mjs | `ReferenceError: B is not defined` | All blockers must use `block(id, severity, stage, ...)` |
| `package-lock.json` gitignored | CI: `npm ci` fails with "lockfileVersion" | Remove from `.gitignore`, commit `package-lock.json` |
| Dist header check before build | VERSION fails on clean checkout | `if (!t) continue` — skip missing dist files |
| README approval hash mismatch | Linux LF vs Windows CRLF | `check-readme-approval.mjs` normalizes `\r\n` to `\n` before hashing |
| `mainhead-guard` blocks detached HEAD | `validate:all` fails on CI | Use `--release` flag in `validate:all` script |
| `fs.mkdtempSync` without `XXXXXX` suffix | `cli-audit-workspace.test.js` fails on Linux | Add `XXXXXX` suffix, ensure parent `.lbe/` dir exists |
| Temp file leaked to working tree | `governance:check` blocks `.validate-all-output.txt` | Do not write diagnostic files to repo root |
| `RELEASE_STATE.json` has `currentVersion` field | Release gate blocks with "must not hardcode currentVersion" | Remove the `currentVersion` field entirely |
| `assets/runtime-boundary.svg` matches `runtime/` forbid | Pack proof fails | Release workflow now skips files under `publicRepoFiles` directories |
| Stale version in `assets/banner.svg` | `V_ASSET_STALE_VERSION` blocks | Make assets version-independent or update version string |
| Tag on wrong/old commit | `mainhead-guard` blocks release workflow | Delete remote tag, re-tag on latest main HEAD |
| Force-pushing tag does not re-trigger | No new release workflow run | Use `gh workflow run release.yml` with `workflow_dispatch` |
| npm publish E403 on re-run | "cannot publish over previously published versions" | Harmless — package already shipped; rest of workflow continues |

---

## 6. Structured Blocker Format

Every blocker in `release-hygiene.mjs` follows this schema:

```js
block(
  id,              // unique ID (e.g., V_DIST_HEADER_MISMATCH)
  severity,        // BLOCKER
  stage,           // VERSION | FILES | DOCS | CLI | TESTS | GIT
  file,            // affected file or artifact name
  expected,        // what was expected
  found,           // what was found (include error details for debugging)
  meaning,         // human-readable explanation
  intentRequired,  // what remediation is needed
  fix,             // array of suggested fix steps
  forbidden,       // array of forbidden actions
  decisionOptions  // array of decision paths
);
```

**Failure output** includes:
1. Human-readable report with each blocker
2. `AGENT_BLOCKERS_JSON` — machine-readable JSON array for programmatic consumption

**Key blocker IDs defined:**

| Section | IDs |
|---------|-----|
| VERSION | `V_MISSING_ROOT_PKG`, `V_NO_VERSION`, `V_SUB_PKG_MISSING`, `V_VERSION_MISMATCH`, `V_RELEASE_EXEC_MISMATCH`, `V_DOC_MISSING`, `V_DOC_VERSION_MISSING`, `V_DIST_HEADER_MISMATCH`, `V_ASSET_STALE_VERSION` |
| FILES | `F_BUILD_PUBLIC_SDK_FAILED`, `F_CHECK_ARTIFACT_FAILED`, `F_VERIFY_PACK_PROOF_FAILED`, `F_FORBIDDEN_IN_PACK`, `F_PACK_FAILED`, `F_DIST_MISSING` |
| DOCS | `D_FORBIDDEN_README`, `D_FORBIDDEN_PUBLIC_README`, `D_MISSING_PKG_NAME`, `D_MISSING_NPX_LBE` |
| CLI | `C_CLI_JS_MISSING`, `C_CLI_BROKEN`, `C_MISSING_HANDLER` |
| TESTS | `T_VALIDATE_TIMEOUT`, `T_VALIDATE_FAILED`, `T_PROOF_FAILED`, `T_GOVERNANCE_FAILED` |
| GIT | `G_DIFF_FAILED`, `G_DIRTY_TREE`, `G_STATUS_FAILED` |

---

## 7. Governance Model

Every change must belong to an active issue registered in `.governance/ISSUE_LEDGER.json`:

```json
{
  "activeIssue": "ISSUE-00XX",
  "issues": [{
    "id": "ISSUE-00XX",
    "status": "OPEN",
    "intent": "What this issue fixes",
    "scopeLocked": true,
    "allowedFiles": ["file1.js", "file2.json"],
    "forbiddenFiles": [],
    "notes": ["Rules for this issue"]
  }]
}
```

Run after changing `ISSUE_LEDGER.md`:
```powershell
npm run governance:index    # regenerates AGENT_INDEX.md and docs/00_INDEX.md
npm run governance:check    # validates all changed files are in scope
```

---

## 8. Release Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Source | `<private-repo-root>/LBE_Core_Engine` | Private build authority |
| npm package | `release-public/` ? npm | `@letterblack/lbe-core` |
| exec package | `release-exec/` ? npm | `@letterblack/lbe-exec` |
| Public mirror | `LetterBlack-Sentinel` | Public-facing GitHub repo |
| Release manifest | `release/release-manifest.json` | npmFiles, forbiddenNpmPackedPaths, publicRepoFiles |
| README approval | `.governance/PUBLIC_README_APPROVAL.json` | README content SHA-256 lock |
| Release state | `docs/RELEASE_STATE.json` | Package identity, surface allow/deny lists |
| Issue ledger | `.governance/ISSUE_LEDGER.json` | Active issue scope enforcement |

---

## 9. Quick Reference Commands

```powershell
# === Pre-flight ===
node scripts/release-hygiene.mjs --quick
npm run validate:all
npm run proof
npm run governance:check
npm run audit:public-docs

# === Full gate (local, ~45s) ===
npm run release:check

# === CI trigger ===
gh workflow run release-check.yml -R Letterblack0306/LetterBlack-LBE-Core --ref main

# === Tag and release ===
git tag -a v1.3.XX -m "Release v1.3.XX"
git push origin v1.3.XX

# === Manual release dispatch ===
gh workflow run release.yml -R Letterblack0306/LetterBlack-LBE-Core --ref main -f mode=release -f tag=v1.3.XX

# === Post-release verification ===
npm view @letterblack/lbe-core version
npx @letterblack/lbe-core@1.3.XX status
```

---

*Last updated: 2026-07-06 â Release v1.3.40*
