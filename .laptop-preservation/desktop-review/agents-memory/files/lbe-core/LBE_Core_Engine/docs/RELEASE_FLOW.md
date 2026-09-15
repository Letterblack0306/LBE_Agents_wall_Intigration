# LBE Core Engine Playbook: Release & Public Mirror Sync

This document establishes the official step-by-step operating playbook for executing releases, packaging verification, NPM registry publication, and public mirror synchronization. All future agents must follow this playbook strictly to maintain clean boundaries, secure licensing, and flawless repository synchronization.

---

## 1. Core Architecture and Philosophy
LBE operates under a strict, non-negotiable security-first local execution boundary:
*   **Agent proposes** actions (file writes, shell commands, etc.) as intents.
*   **Controller validates** the proposed JSON payload against the local `lbe.policy.json` rules.
*   **Adapters execute** the approved actions only.
*   **UI/Host informs** the user.
*   **Audit log proves** all execution, leaving a cryptographically linked, tamper-evident record.

---

## 2. Product Boundaries
LBE separates the repository into distinct scopes:
1.  **Private Source/Engine Core (`LetterBlack-LBE-Core`)**: Contains the full test suite, Rust compiler code for the WASM engine, diagnostic utilities, private keys, and build scripts.
2.  **Public SDK/Binary (`@letterblack/lbe-core` on npm)**: Shipped strictly as a lightweight, local-first SDK/CLI from the `release-public/` subdirectory. Excludes source files, tests, experimental CEP/AI code, or local state.
3.  **Public Mirror Repository (`LetterBlack-Sentinel` on GitHub)**: Contains a whitelisted mirror of the active public SDK files to enable community inspection and lightweight public CI verification.

---

## 3. Step-by-Step Release & Sync Playbook

### Step 3.1: Pre-Release Audit & Issue Setup
1.  Verify the repository branch is `main` and is aligned with `origin/main`.
2.  Open or select an active `ISSUE-XXXX` under `.governance/ISSUE_LEDGER.json`.
3.  Lock down allowed implementation files inside the issue's `"allowedFiles"` array.

### Step 3.2: Package Metadata & Licensing Verification
1.  Confirm that the root `LICENSE` file contains the official Proprietary License text.
2.  Verify that root `package.json`'s `"license"` field is set to `"Proprietary"`.
3.  Verify that `release/README.md` (which generates the public `README.md`) only advertises active public CLI subcommands. For `v1.3.36`, the release smoke surface includes `status`, `scope`, `intent`, and `proof`.
4.  Show the README diff before release and require manual claim review before publish or public mirror sync:
    ```bash
    git diff -- release/README.md release-public/README.md
    npm run check:readme-approval
    ```
    The approval marker is `.governance/PUBLIC_README_APPROVAL.json`.
    It must match the SHA-256 of `release-public/README.md`, the current package version, and record who approved the public-facing copy.

README authority rules:
- Treat `release-public/README.md` as manually reviewed public-facing copy.
- Build and sync scripts may copy the approved README, but must not rewrite product claims automatically.
- Any README change must be inspected by a human before npm publish or public mirror sync.
- Do not expose internal validation mechanics, backend process, or defensive architecture notes in the main README.
- Keep detailed mechanics in `docs/`, not the README front page.

### Step 3.3: Rebuild the Release Artifacts
Run the local compilation and SDK packager script:
```bash
npm run build:public-sdk
```
This script populates the `release-public/` directory with the compiled files, copying the correct license, types, assets, and public documentation.

### Step 3.4: Automated Artifact Validation Checks
Execute the full suite of validation gates to confirm zero leaks and perfect integrity:
```bash
# Check for forbidden text markers, leaked folders, or unapproved licenses
node scripts/check-public-artifact.mjs

# Ensure public README copy has a matching manual approval marker
npm run check:readme-approval

# Verify the dry-run package matches exactly the 18 approved files
npm run verify:pack-proof

# Run the complete programmatic LBE test suite
npm test

# Check public documentation wording
npm run audit:public-docs
```

### Step 3.5: NPM Publish Readiness Check
Before executing any actual NPM publication, navigate to the generated directory and dry-run pack:
```bash
cd release-public
npm pack --dry-run --json
```
*   **Pass Condition**: The output JSON must show the approved public file set. For `v1.3.36`, the verified public package contains **19** files and only whitelisted public files.
*   **Registry Check**: Confirm the target version is absent from the NPM registry:
    ```bash
    npm view @letterblack/lbe-core@<VERSION> version
    ```
    *This must return a 404 (Not Found).*

### Step 3.6: Executing the NPM Publish
Only after all readiness checks are 100% green, publish the package to NPM from `release-public/`:
```bash
npm publish --access public
```

After publish, verify the registry version and run a fresh registry install smoke:

```bash
npm view @letterblack/lbe-core@<VERSION> version
npm view @letterblack/lbe-core@<VERSION> gitHead
```

If npm does not expose `gitHead`, record the result as `UNKNOWN / unavailable`. Do not republish or move tags only to recover missing registry metadata. Continue with fresh install smoke and record the caveat.

```bash
npm init -y
npm install @letterblack/lbe-core@<VERSION>
npx lbe status
npx lbe scope
npx lbe intent
npx lbe proof
```

### Step 3.7: Public Mirror Sync (Handling Global Ignores)
We mirror the whitelisted public package to `LetterBlack-Sentinel` on GitHub.
*   **The Challenge**: Many development environments globally ignore folders like `dist/` or `build/` (via `~/.gitignore_global`). Standard `git add -A` inside the sync script would silently ignore the compiled `dist/` directory, causing the public mirror validation workflows to fail.
*   **The Fix**: Use the `--force` flag on `git add` in the sync process:
    ```bash
    git add -A --force
    ```
*   **Execution**: Run the sync script, which automatically handles the secure force-add and push:
    ```bash
    node scripts/ci-sync-public.mjs
    ```
    The sync script must run the README approval gate before copying `release-public/README.md` into the mirror. If the README changed and `.governance/PUBLIC_README_APPROVAL.json` does not match, sync must stop.
*   **Guard Verification**: Run the public sync guard from the source release workspace:
    ```bash
    node scripts/ci-guard-public-sync.mjs
    ```
    This guard must clone/read the entire public mirror after sync and compare it
    against the local `release-public/` output. Public sync is not complete
    unless:
    - every whitelisted public file exists in the mirror,
    - no extra public files exist outside the whitelist output,
    - every mirrored file's SHA-256 matches the matching `release-public/` file,
    - `package.json` name and version match the source release package.
*   **Direct Mirror Verification**: Clone `Letterblack0306/LetterBlack-Sentinel` and verify:
    ```bash
    node -e "const p=require('./package.json'); console.log(p.name, p.version)"
    npm pack --dry-run --json
    node dist/cli.js status
    node dist/cli.js scope
    node dist/cli.js intent
    node dist/cli.js proof
    ```
*   **Pass Condition**: the mirror package name is `@letterblack/lbe-core`, the version matches the released version, dry-run pack shows the approved public file set, and the CLI smoke commands run successfully.
*   **CI Verification**: Verify on GitHub that the `Validate Package Shape` and `Dry-run pack and check contents` jobs pass successfully on the mirror.

For `v1.3.36`, the public mirror sync commit is:

```text
1ffaf7f291e91506f5262a316fa53ddddf65710e release: v1.3.36
```

The final release state is:

```text
npm package:        1.3.36 published
source repo:        1.3.36
public mirror:      1.3.36
public sync commit: 1ffaf7f release: v1.3.36
repo state:         clean/aligned
npm republish:      not needed
tag movement:       not needed
```

### Step 3.8: Tagging & Finalizing the Release
Annotate and push the matching release tag to tie GitHub commit, Git tag, and NPM package together:
```bash
# Tag the exact verified build commit
git tag -a v<VERSION> <COMMIT_SHA> -m "release: @letterblack/lbe-core v<VERSION>"

# Push the tag only
git push origin v<VERSION>
```

### Step 3.9: Restoring Governance State
Harden the repository's governance locks post-release:
1.  Restore `"scopeLocked": true` in `.governance/ISSUE_LEDGER.json`.
2.  Set the issue status to `"VALIDATED_PENDING_COMMIT"` or `"CLOSED"`.
3.  Regenerate index files and perform a final check:
    ```bash
    npm run governance:index
    npm run governance:check
    ```
4.  Stage and commit only the governance log files, then push:
    ```bash
    git add .governance/ISSUE_LEDGER.json AGENT_INDEX.md ISSUE_LEDGER.md docs/CHANGELOG_AGENT.md
    git commit -m "chore(governance): close release issue after synchronization"
    git push origin main
    ```

---

## 4. Troubleshooting Reference
*   **Missing `dist/` on Mirror**: Verify that the sync script `scripts/ci-sync-public.mjs` executes `git add -A --force`. Without `--force`, machines with global ignores will drop build folders.
*   **WASM Integrity Lock Mismatch**: If the WASM check fails, ensure `runtime/lbe_engine.wasm` has been rebuilt via `npm run build:engine` and its SHA matches the `wasm.lock.json` hash inside `release-public/dist/`.
*   **Scope Lock Failures**: If the governance check fails with `ISSUE_SCOPE_LOCKED`, ensure that you are not trying to expand `allowedFiles` in the same commit as implementation changes. Separate metadata changes (indexes, ledger, changelog) into a prior scope-only commit if needed, or temporarily toggle `scopeLocked` to `false` if performing a single unified hotfix commit.

## 5. Current Release Status

`v1.3.36` is complete from all three release surfaces:

```text
source -> npm -> public GitHub mirror
```

Status:

```text
npm package:        1.3.36 published
source repo:        1.3.36
public mirror:      1.3.36
public sync commit: 1ffaf7f release: v1.3.36
repo state:         clean/aligned
npm gitHead proof:  unavailable from npm metadata
```

Do not republish, retag, or move `v1.3.36`. Start the next release or feature from clean `main`.
