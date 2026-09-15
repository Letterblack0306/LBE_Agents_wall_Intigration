# LetterBlack LBE — Workspace Instructions

This document covers every aspect of the private workspace:
structure, development, testing, build, release, and governance.

---

## What this is

**LBE (Local-first execution Governance Engine)** puts a deterministic
validation gate between what an AI agent proposes and what the host system
actually executes. Every action — file write, shell command, anything — passes
a 7-gate pipeline before execution. Nothing runs unless the gate passes.

There are two published packages and one private source workspace:

| Package | npm | What it is |
|---|---|---|
| `@letterblack/lbe-sdk` | published | WASM runtime + CLI only. Raw `execute()` function, no controller. |
| `@letterblack/lbe-exec` | published | Full in-process controller. `createLocalExecutor()`, policy, audit, sandbox. |
| `letterblack-lbe-core` | private | This workspace. Source for both packages. Never published. |

---

## Workspace layout

```
letterblack-sentinel/
│
├── assets/                     Visual assets (source of truth — built into both packages)
│   ├── lbe-gates.png           Gate sequence diagram (Request → Policy → Identity → Scope → Action)
│   ├── story-allow.png         Happy-path storyboard (6 panels)
│   ├── story-deny.png          Deny-path storyboard (6 panels)
│   └── runtime-boundary.svg    WASM boundary diagram
│
├── src/
│   ├── core/                   Private controller internals
│   │   ├── validator.js        7-gate orchestrator — extracts flags, calls WASM
│   │   ├── localPolicy.js      lbe.policy.json read/write, deny-wins evaluation
│   │   ├── auditLog.js         SHA-256 hash-chained JSONL append
│   │   ├── signature.js        Ed25519 sign/verify (tweetnacl)
│   │   ├── atomicWrite.js      Write-then-rename for all state files
│   │   ├── policyEngine.js     Deployment policy evaluation
│   │   ├── policySignature.js  Policy signing and tamper detection
│   │   ├── policyVersionGuard.js  Version bump / rollback protection
│   │   ├── nonceStore.js       Single-use nonce registry
│   │   ├── requestRateLimiter.js  Per-requester rate limiting
│   │   ├── invariants.js       Invariant gate (key present? policy signed?)
│   │   ├── backup.js           Pre-write backup and restore
│   │   ├── trustedKeys.js      Key store management
│   │   ├── integrity.js        Workspace integrity manifest
│   │   ├── workspaceScanner.js Workspace file enumeration
│   │   ├── schema.js           Request schema constants
│   │   ├── logger.js           Structured logger
│   │   ├── deepFreeze.js       Freeze policy/config objects
│   │   └── approval-token.js   Short-lived approval tokens
│   │
│   ├── adapters/               Execution adapters (decide nothing, only execute)
│   │   ├── fileAdapter.js      read / write / patch / delete inside rootDir
│   │   ├── shellAdapter.js     run an allowlisted shell command
│   │   ├── noopAdapter.js      dry-run / observer sink
│   │   └── index.js            Adapter router
│   │
│   ├── exec/
│   │   └── localExecutor.js    createLocalExecutor() — in-process controller
│   │                           (source for @letterblack/lbe-exec)
│   │
│   └── cli/
│       ├── parseArgs.js        Argument parser
│       └── commands/           One file per CLI command
│           ├── init.js         npx lbe init
│           ├── policyMode.js   npx lbe observe / enforce
│           ├── policyAdd.js    npx lbe policy add
│           ├── run.js          npx lbe execute
│           ├── dryrun.js       npx lbe dryrun
│           ├── verify.js       npx lbe verify
│           ├── health.js       npx lbe health
│           ├── auditVerify.js  npx lbe audit-verify
│           ├── integrityCheck.js  npx lbe integrity-check
│           └── policySign.js   npx lbe policy-sign
│
├── exec/
│   └── index.js                Public entrypoint for @letterblack/lbe-exec
│
├── runtime/
│   ├── lbe_engine.wasm         Compiled WASM binary (output of build:engine)
│   └── engine.js               JS WASM loader — exposes validate_pipeline etc.
│
├── native/
│   └── lbe-engine/             Rust crate — compiled to lbe_engine.wasm
│       ├── Cargo.toml          crate-type = cdylib, publish = false
│       └── src/lib.rs          All governance decision logic lives here
│
├── bin/
│   └── lbe.js                  CLI entry (private — never ships in public packages)
│
├── config/
│   ├── policy.default.json     Default policy template (ships in lbe-sdk)
│   └── identity.config.json    Workspace identity config (private)
│
├── test/
│   ├── local-executor.test.js  40 tests — observe/enforce/deny-wins/sandbox/audit
│   ├── local-policy.test.js    Policy file read/write/evaluate
│   ├── public-api.test.js      WASM execute() contract
│   ├── security-invariants.test.js  Key lifecycle, policy signature, version guard
│   ├── invariant-backup.test.js  Backup and rollback
│   └── shell-adapter.test.js   Shell metacharacter safety
│
├── scripts/
│   ├── build-engine.js         cargo build → runtime/lbe_engine.wasm
│   ├── build-public-sdk.mjs    Builds release-public/ (@letterblack/lbe-sdk)
│   ├── build-public-exec.mjs   Builds release-exec/ (@letterblack/lbe-exec)
│   ├── check-public-artifact.mjs  Validates release-public/ before publish
│   ├── check-public-exec.mjs   Validates release-exec/ before publish
│   ├── mainhead-guard.mjs      Blocks commits/pushes from non-main branches
│   └── install-git-hooks.mjs   Installs pre-commit and pre-push hooks
│
├── docs/
│   ├── decisions/
│   │   ├── ADR-001-remove-mcp-execution-surface.md
│   │   ├── ADR-002-remove-http-server-surface.md
│   │   └── ADR-003-sdk-only-product-boundary.md
│   └── governance/
│       └── mainhead.md         Branch authority rules
│
├── release/                    README and type templates (source for builds)
│   ├── README.md               Template for @letterblack/lbe-sdk README
│   ├── exec-README.md          Template for @letterblack/lbe-exec README
│   └── exec-types.d.ts         Type declarations for @letterblack/lbe-exec
│
├── release-public/             Built artifact — @letterblack/lbe-sdk (never edit directly)
├── release-exec/               Built artifact — @letterblack/lbe-exec (never edit directly)
│
├── types.d.ts                  Private full type declarations
├── index.js                    Private package entry
├── package.json                Private workspace package (letterblack-lbe-core)
├── CHANGELOG.md
└── WORKSPACE.md                This file
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20.9.0 | Runtime and test runner |
| Rust / cargo | stable | Compile WASM engine |
| rustup target | `wasm32-unknown-unknown` | WASM build target (auto-added by build:engine) |
| npm | any | Package management and publish |

```bash
npm install
npm run hooks:install   # installs pre-commit and pre-push git hooks — do this once after clone
```

---

## Development commands

### Daily workflow

```bash
npm test                # run all 40 tests
npm run lint            # ESLint on src/ and bin/
npm run validate:all    # mainhead guard + engine check + lint + test (full gate)
```

### WASM engine

```bash
npm run build:engine    # compile native/lbe-engine → runtime/lbe_engine.wasm
npm run engine:check    # verify the WASM binary loads and exports the expected functions
```

Only needed when `native/lbe-engine/src/lib.rs` changes. The compiled binary
`runtime/lbe_engine.wasm` is committed and ships in both packages.

### CLI (local development)

```bash
node bin/lbe.js init            # create lbe.policy.json in observer mode
node bin/lbe.js status          # mode, rule count, audit entry count
node bin/lbe.js policy          # list rules
node bin/lbe.js observe         # switch to observer mode
node bin/lbe.js enforce         # switch to enforcement mode
node bin/lbe.js health --json true
node bin/lbe.js audit-verify
```

Or via npm aliases: `npm run init`, `npm run verify`, `npm run health`.

---

## Test suite

**40 tests, 0 failures.** Run with `npm test` (uses native Node.js test runner).

| File | Coverage |
|---|---|
| `local-executor.test.js` | observe mode, enforce mode, deny-wins, sandbox, advisory vs controller split, shell allowlist, symlink escape, dryRun, audit |
| `local-policy.test.js` | policy load/write/evaluate, deny-wins, observer/enforce defaults |
| `public-api.test.js` | raw WASM `execute()` input/output contract |
| `security-invariants.test.js` | Ed25519 key lifecycle, policy signature tamper, version rollback guard |
| `invariant-backup.test.js` | backup creation, restore on failure, atomic write |
| `shell-adapter.test.js` | metacharacter arguments treated as data, not shell syntax |

---

## Architecture — the 7-gate pipeline

Every request to `execute()` passes these gates in order. A failure at any
gate returns a structured deny — the remaining gates are not evaluated.

```
[1] Schema         — required fields, structural validity
[2] Timestamp      — permitted clock-skew window (±10 minutes)
[3] Key lifecycle  — trusted key, active, not expired
[4] Signature      — Ed25519 signature verified against key store
[5] Rate limit     — per-requester sliding-window limit
[6] Nonce          — single-use commandId replay protection
[7] Policy         — configured authorization decision (deny-wins)
```

The WASM engine (`runtime/lbe_engine.wasm`) owns all gate decisions.
`src/core/validator.js` extracts boolean flag sets from the command object
and calls the WASM functions. The JS layer does IO; the Rust layer decides.

### Local policy layer (lbe-exec only)

Before the 7-gate pipeline runs, `createLocalExecutor()` evaluates
`lbe.policy.json`. This is a separate, simpler rule ledger:

- Rules have `effect: 'allow' | 'deny'`, `type: 'path' | 'command'`, `pattern`
- **Deny always wins** over allow regardless of rule order
- Only the host application writes rules (`addRule()`). Agents may only call
  `proposeRule()` which returns a proposal object — it never writes to disk.

### Observer vs enforce mode

| Mode | Gates run | Audit written | Mutations |
|---|---|---|---|
| `observe` | yes | yes | **no** — short-circuits before adapter |
| `enforce` | yes | yes | yes — adapter executes on pass |

Default when no `lbe.policy.json` exists: **enforce**.
`npx lbe init` creates `lbe.policy.json` in **observe** mode.

### Project-root sandbox

All file operations are constrained to `rootDir`. The check resolves
symlinks before comparing paths (`physicalPath()`), so symlink escapes and
`../` traversal are blocked before policy is consulted.

---

## Key security properties

| Property | Implementation |
|---|---|
| Ed25519 signatures | Every proposal signed; WASM verifies before any gate runs |
| Nonce replay protection | Each `commandId` is single-use |
| Rate limiting | Per-requester sliding window, configurable |
| Timestamp skew guard | Rejects proposals outside ±10 minutes |
| Policy signature verification | Policy file is signed; tampering fails the invariant gate |
| Immutable audit trail | SHA-256 hash-chained JSONL; deletion or edit is detectable |
| Atomic writes | All state files use write-then-rename; no partial state |
| Project-root sandbox | Symlink-safe path resolution in `physicalPath()` |
| Deny-wins conflict resolution | When allow + deny both match, deny always takes precedence |

---

## Build system

### @letterblack/lbe-sdk

```bash
npm run build:public-sdk        # → release-public/
npm run verify:public-sdk       # build + validate + npm pack --dry-run
```

What the build does:
1. Bundles `index.js` and `bin/lbe.js` with esbuild → `release-public/dist/`
2. Copies `runtime/lbe_engine.wasm` and generates `wasm.lock.json`
3. Copies `assets/` from workspace root → `release-public/assets/`
4. Copies root `README.md` → `release-public/README.md` (single source, no template)
5. Copies `config/policy.default.json` and `types.d.ts`
6. Writes `release-public/package.json` from workspace `package.json`

The validator (`check-public-artifact.mjs`) confirms:
- No `src/`, `test/`, `scripts/`, `keys/`, `data/` paths in the artifact
- No private path markers in the bundled JS
- WASM SHA-256 matches `wasm.lock.json`
- All required files present

### @letterblack/lbe-exec

```bash
npm run build:public-exec       # → release-exec/
npm run verify:public-exec      # build + validate + npm pack --dry-run
```

What the build does:
1. Bundles `exec/index.js` with esbuild → `release-exec/dist/index.js`
   (external: tweetnacl, json-canonicalize — these are runtime dependencies)
2. Copies `runtime/lbe_engine.wasm` and generates `wasm.lock.json`
3. Copies `assets/` from workspace root → `release-exec/assets/`
4. Copies `release/exec-README.md` → `release-exec/README.md`
5. Copies `release/exec-types.d.ts` → `release-exec/types.d.ts`
6. Writes `release-exec/package.json` from workspace `package.json`

The validator (`check-public-exec.mjs`) confirms:
- No private paths or markers in the bundle
- WASM SHA-256 matches `wasm.lock.json`
- All required files present

### What never ships

Neither package contains: `src/`, `test/`, `scripts/`, `keys/`, `data/`,
`node_modules/`, source maps, or private adapters.

---

## Release process

Both packages are published from their respective `release-*/` directories.
**Never publish from the workspace root.**

### Full release checklist

```bash
# 1. All gates pass
npm run validate:all

# 2. Version bump — update in package.json (single source of truth)
#    Build scripts read this version for both release packages.

# 3. Build and validate both artifacts
npm run verify:public-sdk
npm run verify:public-exec

# 4. Commit and push to main
git add -p
git commit -m "release: vX.Y.Z"
git push

# 5. Tag
git tag vX.Y.Z
git push --tags

# 6. Publish (from release directories, not workspace root)
cd release-public && npm publish
cd ../release-exec && npm publish
```

**Version is set once** in `package.json` at the workspace root.
Both build scripts read `sourcePackage.version` from there — no manual
sync needed between the two release `package.json` files.

### Auth

```bash
npm login     # or set NPM_TOKEN environment variable
# registry: https://registry.npmjs.org/
```

### Current published versions

| Package | Version |
|---|---|
| `@letterblack/lbe-sdk` | 1.2.3 |
| `@letterblack/lbe-exec` | 1.2.3 |

---

## Branch governance

`main` is the only authoritative branch. The pre-commit and pre-push hooks
run `scripts/mainhead-guard.mjs` and will block any commit or push from a
non-main branch or linked worktree.

Rules:
- Never commit from a feature branch — commit directly to `main`
- Never use `--no-verify` to skip hooks — fix the underlying issue
- Never publish from a branch, tag, or worktree other than `main`
- The `mainhead-guard` check is also run at the start of the build scripts

Install the hooks once after cloning:

```bash
npm run hooks:install
```

---

## README authoring

Source files (edit these — never edit the built outputs directly):

| Source | Builds into |
|---|---|
| Root `README.md` | `release-public/README.md` (copied directly; single source) |
| `release/exec-README.md` | `release-exec/README.md` |
| `release/exec-types.d.ts` | `release-exec/types.d.ts` |
| `types.d.ts` | private package only |

Images live in `assets/` at the workspace root and are copied into both
release packages during build. Reference them in READMEs as `assets/<file>`.

---

## What is not in scope

LBE governs actions routed through its runtime. It does not provide:

- Kernel-level process isolation
- Network egress control
- Multi-tenant workload separation
- A hosted control plane, daemon, or HTTP API
- An MCP server surface (see ADR-001)

See `docs/decisions/` for the rationale behind each removed surface.
