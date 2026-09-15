# Workspace Index — LBE_Core_Engine

Every tracked root-level path in this workspace must appear in this table.
`scripts/workspace-index-guard.mjs` fails the release gate if any path is missing.

To add a file or directory: add a row here before committing.
Classification must be one of: `source` | `release-facing` | `generated` | `internal` | `guard`.

<!-- index-start -->
| Path | Classification | Purpose |
|---|---|---|
| .eslintrc.cjs | internal | ESLint configuration |
| .agents/ | internal | Local agent workspace metadata |
| .codex/ | internal | Local Codex workspace metadata |
| .governance/ | guard | Machine-readable governance ledgers and registries |
| .gitignore | internal | Git ignore rules |
| .githooks/ | internal | Versioned git hook scripts (installed via hooks:install) |
| .github/ | internal | CI workflow definitions |
| .npmignore | internal | npm pack exclusion rules |
| AGENTS.md | guard | Root agent operating rules |
| AGENT_INDEX.md | guard | Active issue governed-file index |
| CHANGELOG.md | release-facing | Public release changelog |
| FEATURE_LEDGER.json | guard | Root feature state ledger |
| INDEX.md | guard | This file — workspace index, checked by workspace-index-guard |
| ISSUE_LEDGER.md | guard | Human-readable issue ledger |
| LICENSE | release-facing | Package license |
| README.md | release-facing | Public-facing package README |
| RELEASE_SCOPE.md | guard | Release scope authority |
| RELEASE_WORKSPACE_RULES.md | internal | Workspace release authority rules |
| Release-README.md | internal | Legacy release README template |
| REMOVED_FEATURES.json | guard | Removed-feature authority ledger |
| VALIDATION_GATES.md | guard | Validation gate authority |
| WORKSPACE_CONTRACT.md | guard | Workspace product contract |
| WORKSPACE.md | internal | Workspace developer guide |
| _proof.mjs | internal | 12-gate proof test runner |
| apps/ | internal | Isolated demo applications, including the public demo API |
| assets/ | release-facing | Visual assets copied into release packages |
| bin/ | source | CLI entry point (private — never ships in public packages) |
| config/ | internal | Workspace identity and policy templates |
| dist/ | generated | Built hook artifacts (esbuild output) |
| docs/ | internal | Governance documents — see docs/INDEX.md |
| exec/ | source | Public entrypoint source for @letterblack/lbe-exec |
| examples/ | internal | Public-safe examples and templates for local-only configuration flows |
| index.js | source | Private package entry |
| lbe.policy.json | internal | Local policy file |
| native/ | source | Rust crate compiled to lbe_engine.wasm |
| package-lock.json | generated | npm lockfile |
| package.json | source | Workspace package manifest and scripts |
| release/ | internal | README and type declaration templates for release builds |
| release-exec/ | generated | Built @letterblack/lbe-exec artifact (output of build:public-exec) |
| release-public/ | generated | Built @letterblack/lbe-sdk artifact (output of build:public-sdk) |
| runtime/ | source | WASM binary and JS loader |
| scripts/ | internal | Build, guard, and release automation scripts |
| src/ | source | Private implementation (core, adapters, CLI) |
| test/ | source | Test suite — 40 tests, 0 failures required |
| types.d.ts | release-facing | Full TypeScript declarations |
| types.internal.d.ts | internal | Internal TypeScript declarations |
<!-- index-end -->

## Excluded from index check

These paths are runtime-generated, transient, or explicitly not tracked — the guard skips them:

- `node_modules/` — npm dependencies
- `.lbe/` — runtime policy and audit state
- `data/` — runtime data directory
- `lbe.audit.jsonl` — runtime audit log
- `*.tgz` — local pack artifacts

## Pointer to doc index

Doc structure is governed separately: see [`docs/INDEX.md`](docs/INDEX.md).
Release state is machine-readable: see [`docs/RELEASE_STATE.json`](docs/RELEASE_STATE.json).
