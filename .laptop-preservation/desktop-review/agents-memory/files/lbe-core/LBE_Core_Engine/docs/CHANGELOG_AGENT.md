# Agent Changelog

## Change ID: 20260712-lbe-core-1-3-42-release-prep

Status: IN_PROGRESS

Intent:
Prepare `@letterblack/lbe-core@1.3.42` as the next valid patch release after confirming `v1.3.41` is historical and does not contain the approved release-hygiene fix.

Reason:
`v1.3.41` already exists in git and npm as older published bits. The approved fix must move forward as a new patch version through the repo-approved guarded release workflow.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* CHANGELOG.md
* ISSUE_LEDGER.md
* README.md
* RELEASE_SCOPE.md
* Release-README.md
* docs/00_INDEX.md
* docs/CHANGELOG_AGENT.md
* docs/RELEASE_STATE.json
* package-lock.json
* package.json
* release-public/README.md
* release-public/dist/cli.js
* release-public/dist/index.js
* release-public/package.json
* release-public/types.d.ts
* test/cli-tui.test.js

Validation result:

* PASS: `npm view @letterblack/lbe-core@1.3.42 version --json` returned not found
* PASS: `npm run version:sync:fix`
* PASS: `npm run build:public-sdk`
* PENDING: focused syntax, lint, CLI proof, tests, validate:all, pack proof, governance check

---

## Change ID: 20260711-runtime-validation-classification-correction

Status: OPEN

Intent:
Correct runtime validation classification: Runtime API health + non-tool handoff proof, NOT PWA websocket/chat loop proof.

Reason:
Runtime health check validated endpoints (agent/health, /api/runtime/config, chat-handoff ignore path, LBE development-warning status) but did not prove PWA behavior, WebSocket relay roundtrip, browser client integration, or tool command dispatch. Branch fix/pwa-websocket-events was not found locally or remotely.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md

Validation result:

* PASS: Runtime health check validated (agent health, runtime config, chat handoff ignore path, LBE development-warning status)
* BLOCKED: PWA/WebSocket branch validation (source not found - fix/pwa-websocket-events)
* NOTE: Do not claim PWA/WEBSOCKET BRANCH PROOF when only RUNTIME API HEALTH PROOF exists

---

## Change ID: 20260710-lbe-exec-1-3-42-release-closeout-template

Status: IN_PROGRESS

Intent:
Record `@letterblack/lbe-exec@1.3.42` correction release completion and add a reusable correction release template for future changes.

Reason:
The correction release was published, registry metadata verified, registry install smoke passed, and the release tag was pushed. The follow-up template captures the proven flow for future changes without changing runtime or package behavior.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/INDEX.md
* docs/LBE_EXEC_CORRECTION_RELEASE_TEMPLATE.md
* docs/RELEASE_STATE.json
* release/exec-README.md

Validation result:

* PASS: local tarball smoke for `@letterblack/lbe-exec@1.3.42`
* PASS: npm registry metadata for `@letterblack/lbe-exec@1.3.42`
* PASS: registry install smoke for `@letterblack/lbe-exec@1.3.42`
* PASS: tag `lbe-exec-v1.3.42` pushed
* PENDING: npm run governance:check
* PENDING: npm run audit:public-docs
* PENDING: git diff --check

---

## Change ID: 20260710-v1-3-41-release-completion

Status: IN_PROGRESS

Intent:
v1.3.41 release completion - sync version across all surfaces, rebuild release-public artifacts, validate release gates, commit and tag.

Reason:
Clean release completion for v1.3.41 with proper governance scope.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* CHANGELOG.md
* Release-README.md
* docs/CHANGELOG_AGENT.md
* docs/RELEASE_STATE.json
* package.json
* package-lock.json
* release-exec/package.json
* release-public/package.json
* release-public/README.md
* release-public/dist/cli.js
* release-public/dist/index.js
* release-public/types.d.ts
* test/cli-tui.test.js

Validation result:

* PASS: version-sync: ALL PASSED
* PASS: build:public-sdk: OK
* PASS: npm run check:readme-approval
* PENDING: npm run release:check

---

## Change ID: 20260709-release-workspace-clearance-scope

Status: SCOPE_REGISTERED

Intent:
Register ISSUE-0042 as the active release workspace clearance and dead-file removal scope before any cleanup, deletion, quarantine move, validation, visual proof, release verification, or package smoke work.

Reason:
Repo-wide cleanup was blocked because the active issue was ISSUE-0040, which only authorizes encoding hygiene. Release-readiness cleanup needs an explicit governance scope before dead files, private history, placeholder frontend modules, or stale metadata references can be removed.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* AGENT_TASK_MAP.md
* Chathistory/ChatGPT stage 0 older.md
* Chathistory/ChatGPT stage 1.md
* Chathistory/ChatGPT stage 2.md
* Chathistory/ChatGPT stage 3.md
* Chathistory/ChatGPT stage 4.md
* Chathistory/ChatGPT stage 5.md
* Chathistory/initial start of the project historical.md

Validation result:

* PASS: npm run governance:check
* PASS: npm run validate:docs
* PASS: npm run audit:public-docs
* PASS: node bin/lbe.js audit-workspace --json true
* PASS: npm test, 205 tests
* PASS: git diff --check
* BLOCKED: npm run verify:pack-proof refuses to run build:public-sdk on branch chore/repo-dead-file-cleanup
* BLOCKED: npm run release:check reports branch/main-head and dirty-tree blockers before final release verification

---

## Change ID: 20260707-encoding-hygiene

Status: VALIDATED

Intent:
UTF-8 encoding hygiene cleanup across the repo. Fixes Windows-1252 byte corruption in 7 tracked files, adds encoding audit script, .gitattributes, and release gate encoding check.

Reason:
Multiple files had Windows-1252 bytes (0x80-0x9F range) stored as raw bytes instead of proper UTF-8, causing U+FFFD replacement characters and garbled display. Added automated detection to prevent recurrence.

Files actually changed:

* .gitattributes (NEW)
* CHANGELOG.md
* docs/RELEASE_PLAYBOOK.md
* docs/RELEASE_STATE.json
* package.json
* scripts/agent-changelog-update.mjs
* scripts/changelog-generate.mjs
* scripts/ci-sync-public.mjs
* scripts/encoding-audit.mjs (NEW)
* scripts/release-hygiene.mjs
* scripts/release-quick.mjs
* scripts/version-sync.mjs

Validation result:

* encoding-audit: PASS (199 files scanned, 0 corrupted)
* audit:public-docs: PASS
* proof: 12/12 passed
* diff-check: clean

---

## Change ID: 20260706-release-hygiene-blocker-fix

Status: VALIDATED

Intent:
Fix release-hygiene.mjs B() runtime crash by replacing all legacy B() calls with structured block() calls.

Reason:
The release gate defined structured block() but still called undefined B() helper in 15+ locations, causing runtime crash instead of structured blocker output.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/00_INDEX.md
* scripts/release-hygiene.mjs

Validation result:

* PASS: node --check scripts/release-hygiene.mjs
* PASS: No B( calls remain in release-hygiene.mjs
* PASS: Structured blockers produced correctly
* PASS: npm run governance:index regenerated

---

## Change ID: 20260706-release-alignment-fix

Status: VALIDATED

Intent:
Align all release artifacts to v1.3.37 and fix CLI menu lint/test errors.

Reason:
Previous release artifacts were mismatched: RELEASE_SCOPE.md referenced v1.3.32,
release-exec/package.json was stuck at 1.2.20, while root and release-public were
at 1.3.37. Additionally, CLI source files had lint errors (empty catch blocks,
no-constant-condition, undefined variables) and tests were stale after logo/help
text updates.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* RELEASE_SCOPE.md
* docs/CHANGELOG_AGENT.md
* release-exec/package.json
* src/audit/workspaceAuditChain.js
* src/cli/logo.js
* src/cli/tui-flows.js
* CHANGELOG.md
* docs/RELEASE_PLAYBOOK.md
* docs/RELEASE_STATE.json
* .githooks/pre-commit
* scripts/version-sync.mjs (NEW)
* scripts/release-quick.mjs (NEW)
* scripts/changelog-generate.mjs (NEW)
* scripts/agent-changelog-update.mjs (NEW)
* src/cli/tui.js
* test/cli-tui.test.js
* test/cli-audit-workspace.test.js

Validation result:

* PASS: `npx eslint src/cli/tui.js src/cli/logo.js src/cli/tui-flows.js` (0 errors)
* PASS: `node --test test/cli-tui.test.js test/cli-init-message.test.js test/cli-audit-workspace.test.js` (17/17)
* PASS: `npm run verify:pack-proof` (20 files, clean)
* PASS: `npm run proof` (12/12)
* PASS: `npm run governance:index` regenerated
* PASS: version alignment: root=1.3.37, public=1.3.37, exec=1.3.37
* PASS: `git diff --check` (no whitespace errors)
* NOTE: release-exec bumped 1.2.20 -> 1.3.37
* NOTE: RELEASE_SCOPE.md bumped v1.3.32 -> v1.3.37

---

## Change ID: 20260703-one-command-terminal-menu

# Agent Changelog

## Change ID: 20260703-one-command-terminal-menu

Status: VALIDATED_PENDING_COMMIT

Intent:
Implement a real one-command terminal menu so users can start from `lbe`
without relying on scattered commands or README-only TUI claims.

Reason:
LBE needs a concrete terminal entrypoint before the public docs can claim a
terminal-first workflow. The source CLI, generated public CLI, and README must
all agree on the actual user path.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/LBE_TUI_PRODUCT_DIRECTION.md
* release/README.md
* release-public/README.md
* scripts/build-public-sdk.mjs
* src/cli/main.js
* src/cli/tui.js
* src/cli/commands/init.js
* src/cli/commands/intent.js
* src/cli/commands/scope.js
* test/cli-init-message.test.js
* test/cli-tui.test.js

Validation result:

* PASS: `node --test test/cli-tui.test.js test/cli-init-message.test.js`
* PASS: `node bin/lbe.js`, terminal menu shown
* PASS: `node bin/lbe.js scope`, `NO_SCOPE_FOUND`
* PASS: `node bin/lbe.js intent`, `NO_INTENT_FOUND`
* PASS: `npm run build:public-sdk`
* PASS: `node release-public/dist/cli.js`, generated public terminal menu shown
* PASS: `node release-public/dist/cli.js scope`, `NO_SCOPE_FOUND`
* PASS: `node release-public/dist/cli.js intent`, `NO_INTENT_FOUND`
* PASS: `node release-public/dist/cli.js proof`, `PROOF_INCOMPLETE`
* PASS: `npm run check:readme-approval`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run verify:pack-proof`
* PASS: `npm run audit:public-docs`
* PASS: `npm run validate:docs`
* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm test`, 224 tests
* PASS: `npm run validate:all`
* PASS: fresh local tarball install smoke; `npx lbe` showed terminal menu and
  `npx lbe scope/intent/proof` returned `NO_SCOPE_FOUND`, `NO_INTENT_FOUND`,
  and `PROOF_INCOMPLETE`

---

## Change ID: 20260702-public-mirror-full-parity-guard

Status: VALIDATED_PENDING_COMMIT

Intent:
Require full public mirror verification after public-facing changes and public
sync.

Reason:
The public mirror can look current if only `README.md` changed while package,
dist, types, assets, or docs remain stale. The guard must read the entire
whitelisted public mirror and compare it against `release-public/`, not just
check root entries and package version.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/RELEASE_FLOW.md
* scripts/ci-guard-public-sync.mjs

Validation result:

* PASS: `node --check scripts/ci-guard-public-sync.mjs`
* PASS: `node scripts/ci-guard-public-sync.mjs`, 22-file public mirror parity
* PASS: `npm run governance:check`
* PASS: `npm run validate:docs`
* PASS: `git diff --check`

---

## Change ID: 20260702-public-readme-approval-sync-repair

Status: VALIDATED_PENDING_COMMIT

Intent:
Record approval for the already-updated public README beta/TUI positioning and
unblock normal public mirror sync.

Reason:
The README was updated upstream, but the manual README approval marker still
pointed to the previous generated README hash. The public sync and artifact
checks correctly refused to proceed until the reviewed README hash was recorded.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md

Validation result:

* PASS: `npm run check:readme-approval`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run governance:check`
* PASS: `git diff --check`

---

## Change ID: 20260702-tui-product-direction

Status: VALIDATED_PENDING_COMMIT

Intent:
Document the branded terminal-first TUI direction and wireframe before any
dashboard or TUI implementation work.

Reason:
LBE is local-first and SDK/CLI-centered. A terminal UI is the correct next
product experience because it keeps users in one terminal, shows live
local/cloud state, and preserves the rule that execution authority remains
local. The dashboard and hosted-service surfaces remain blocked for this lane.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/LBE_TUI_PRODUCT_DIRECTION.md

Validation result:

* PASS: `npm run validate:docs`
* PASS: `npm run governance:check`
* PASS: `npm run gate:workspace-structure`
* PASS: `git diff --check`

---

## Change ID: 20260702-sdk-reference-notes

Status: VALIDATED_PENDING_COMMIT

Intent:
Add a docs-only future SDK reference note using OpenAI SDK repositories as
structure references.

Reason:
Future LBE Cloud client work should learn from mature SDK structure patterns:
contract-first API shape, typed clients, examples, API reference docs,
environment-based auth, and strict separation between cloud client code and
local execution authority.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/SDK_REFERENCE_NOTES.md

Validation result:

* PASS: `npm run validate:docs`
* PASS: `npm run governance:check`
* PASS: `npm run gate:workspace-structure`
* PASS: `git diff --check`

---

## Change ID: 20260702-letterblack-user-enterprise-bundle

Status: VALIDATED_PENDING_COMMIT

Intent:
Create the real private `letterblack_user` enterprise-user bundle for the
LetterBlack workspace and track only public-safe documentation/template files.

Reason:
`letterblack_user` is the first controlled enterprise-user profile for
LetterBlack's own workspace. It must use the existing `.lbe/` source of truth,
keep execution authority local, and avoid secrets or hosted execution.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/LBE_ENTERPRISE_USER_PROFILE.md
* examples/policy-bundles/letterblack_user.example.json

Private ignored local files created:

* .lbe/users/letterblack_user.json
* .lbe/bundles/letterblack_user.policy.json
* .lbe/runtime/letterblack_user.connection.json

Validation result:

* PASS: JSON parse for created private and example files
* PASS: `userId` equals `letterblack_user`
* PASS: `profileType` equals `enterprise_user`
* PASS: hosted execution is false
* PASS: local execution authority is true
* PASS: protected paths are active
* PASS: command denylist is active
* PASS: live `/health` checked, 200
* PASS: live `/v1/info` checked, 200
* PASS: `/v1/run` remains blocked/unavailable, 404
* PASS: no secrets/local paths in created bundle/template/doc files
* PASS: `npm run governance:check`
* PASS: `npm run gate:workspace-structure`
* PASS: `npm run validate:docs`
* PASS: `git diff --check`
* BLOCKER: live `/v1/connect` returned 404 `NOT_FOUND`; `letterblack_user` is not marked API connected

---

## Change ID: 20260702-local-first-api-connection

Status: VALIDATED_PENDING_COMMIT

Intent:
Correct the public API architecture to authenticated local-first connection mode.

Reason:
`api.letterblack.net/u/{userId}` would imply server-owned user workspaces. The
correct model is an authenticated connection channel where local `.lbe/` or
`lbe.json` remains authoritative and the hosted API only observes connection
status and optional proof/event summaries.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/API_PUBLIC_CONTRACT.md
* apps/public-api/api-server.js
* apps/public-api/README.md

Validation result:

* PASS: `node --check apps/public-api/api-server.js`
* PASS: `npm run validate:docs`
* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: local authenticated API smoke for `/v1/connect`, `/v1/me`, `/v1/me/workspaces`, `/v1/workspaces/:workspaceId/ping`, `/proof`, and `/events`
* PASS: unauthenticated connection rejected with `AUTH_REQUIRED`
* PASS: secret-like connection payload rejected
* PASS: `/v1/run` blocked with `ROUTE_NOT_AVAILABLE`
* PASS: `npm test`, 221 tests

---

## Change ID: 20260702-fresh-demo-api

Status: VALIDATED_PENDING_COMMIT

Intent:
Create a fresh demo-only public API setup and document the temporary hosted API exception without restoring stale hosted execution.

Reason:
The old Railway/API surface came from historical `letterblack-sentinel/` files and was removed by `bc1bbafc`. The new public surface must be demo-only, isolated from the SDK release surface, and must not expose real filesystem or shell execution.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/API_PUBLIC_CONTRACT.md
* docs/decisions/ADR-003-sdk-only-product-boundary.md
* apps/public-api/api-server.js
* apps/public-api/Dockerfile
* apps/public-api/railway.json
* apps/public-api/README.md

Validation result:

* PASS: old API source location confirmed in historical `letterblack-sentinel/` paths
* PASS: no current stale API source files exist in HEAD to remove
* PASS: local demo API route smoke for `/health`, `/v1/info`, `/v1/demo/verify`, `/v1/demo/dryrun`, `/v1/demo/proof/:id`
* PASS: `/v1/run` blocked with `ROUTE_NOT_AVAILABLE`
* PASS: `npm test`
* PASS: governance baseline JSON/JSONL validation
* PASS: `node --check apps/public-api/api-server.js`
* PASS: `npm run validate:docs`
* PASS: `npm run gate:workspace-structure`
* PASS: `npm run governance:check`
* PASS: `git diff --check`

---

## Change ID: 20260702-public-sync-guard

Status: VALIDATED_PENDING_COMMIT

Intent:
Secure public mirror synchronization and add intro block alignment to public README.

Reason:
Public sync needs to guarantee that the authoritative README changes (containing "AI agents are getting stronger. Their execution layer is not.") are correctly propagated and guarded in CI/CD.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* release/README.md
* scripts/ci-sync-public.mjs

Validation result:

* PASS: `git diff --check`
* PASS: `npm run governance:check`
* PASS: `npm run build:public-sdk`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run audit:public-docs`
* PASS: `npm run proof`

---

## Change ID: 20260702-v137-reliability-release

Status: RELEASED_WITH_GITHEAD_VERIFICATION_GAP

Intent:
Prepare and release `v1.3.37` for ISSUE-0022 reliability hardening without moving `v1.3.36` or republishing `@letterblack/lbe-core@1.3.36`.

Reason:
The reliability hardening commit is validated on `main`, but `1.3.36` already exists on npm and the `v1.3.36` tag already belongs to the prior release. The safe release path is a forward version.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/RELEASE_FLOW.md
* docs/RELEASE_STATE.json
* .githooks/pre-commit
* scripts/version-sync.mjs (NEW)
* scripts/release-quick.mjs (NEW)
* scripts/changelog-generate.mjs (NEW)
* scripts/agent-changelog-update.mjs (NEW)
* CHANGELOG.md
* package.json
* package-lock.json
* release/README.md
* release-public/README.md
* release-public/package.json
* release-public/types.d.ts
* release-public/dist/index.js
* release-public/dist/cli.js
* release-public/dist/lbe_engine.wasm
* release-public/dist/wasm.lock.json
* release-public/assets/
* release-public/docs/

Validation result:

* PASS: `git diff --check`
* PASS: `npm run validate:all`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run verify:pack-proof`
* PASS: `npm run release:gate`
* PASS: fresh generated public tarball install smoke with `npx lbe status`, `npx lbe scope`, `npx lbe intent`, and `npx lbe proof`
* PASS: `v1.3.37` tag pushed
* PASS: `main` pushed
* PASS: npm publish from `release-public`
* PASS: `npm view @letterblack/lbe-core@1.3.37 version` returned `1.3.37`
* PASS: fresh registry install smoke with `npx lbe status`, `npx lbe scope`, `npx lbe intent`, and `npx lbe proof`
* CAVEAT: npm `gitHead` metadata was unavailable/empty; do not republish or move tags for this metadata gap

---

## Change ID: 20260702-reliability-gates-audit-hardening

Status: VALIDATED_PENDING_COMMIT

Intent:
Harden reliability gates and audit failure handling without changing package version or release artifacts.

Reason:
Child process gates need bounded timeouts, audit append must fail closed when the previous hash is corrupt, lock sleeps should not burn CPU, failed execution should not silently exit 0, and assert-consumer should stop immediately on failure.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* README.md
* docs/CLI_EXIT_CODES.md
* scripts/governance.mjs
* scripts/publish.mjs
* scripts/release-gate.mjs
* src/cli/commands/assertConsumer.js
* src/cli/commands/run.js
* src/core/atomicWrite.js
* src/core/auditLog.js
* test/cli-assert-consumer.test.js

Validation result:

* PASS: `git diff --check`
* PASS: `npm run build:engine`
* PASS: `npm test`
* PASS: `npm run audit:public-docs`
* PASS: `npm run proof`
* PASS: `npm run governance:check`
* NOTE: `npm run release:gate` required registering `docs/CLI_EXIT_CODES.md` in `docs/INDEX.md`, aligning release-gate npm execution with the bounded Windows spawn wrapper, and parsing npm pack JSON through lifecycle logs

---

## Change ID: 20260701-public-readme-home

Status: VALIDATED_PENDING_COMMIT

Intent:
Redesign the public README with a GitHub-safe public home page, one simple workflow diagram, and detailed visuals moved to technical docs.

Reason:
The main README should make install, scope-aware proof, and host decision support clear quickly. Detailed gate and story visuals belong in technical docs for reviewers.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* release/README.md
* release/TECHNICAL_VISUALS.md
* release-public/README.md
* release-public/assets/lbe-github-hero.svg
* release-public/assets/lbe-proof-status.svg
* release-public/assets/lbe-scenarios.svg
* release-public/assets/lbe-simple-flow.svg
* release-public/docs/TECHNICAL_VISUALS.md
* scripts/build-public-sdk.mjs
* scripts/check-public-artifact.mjs

Validation result:

* PASS: `npm run build:public-sdk`
* PASS: `npm run check:readme-approval`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm run audit:public-docs`
* PASS: `npm run verify:pack-proof`

---

## Change ID: 20260701-readme-approval-gate

Status: VALIDATED_PENDING_COMMIT

Intent:
Require manual README review before npm publish or public mirror sync.

Reason:
The public README is release-facing product copy. Release and sync scripts must not publish or mirror unreviewed README claim changes just because build output changed.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/PUBLIC_README_APPROVAL.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/RELEASE_FLOW.md
* RELEASE_WORKSPACE_RULES.md
* package.json
* scripts/check-public-artifact.mjs
* scripts/check-readme-approval.mjs
* scripts/ci-sync-public.mjs

Validation result:

* PASS: `npm run check:readme-approval`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm run audit:public-docs`

---

## Change ID: 20260701-readme-badge-rendering

Status: VALIDATED_PENDING_COMMIT

Intent:
Fix README badge rendering only by replacing raw HTML badges with Markdown badges.

Reason:
The public README top badge area uses raw HTML `<img>` tags that can render awkwardly or overflow in some GitHub/mobile/browser views.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* release/README.md
* release-public/README.md

Validation result:

* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm run audit:public-docs`

---

## Change ID: 20260701-v136-release-record

Status: VALIDATED_PENDING_COMMIT

Intent:
Record the completed `v1.3.36` release state and npm `gitHead` metadata caveat in release governance docs.

Reason:
The package was released and verified from the registry, then synced to the public GitHub mirror. npm metadata did not expose `gitHead`. Release docs also still referenced stale package counts and pre-`scope`/`intent`/`proof` public CLI guidance.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/RELEASE_FLOW.md
* docs/RELEASE_STATE.json
* .githooks/pre-commit
* scripts/version-sync.mjs (NEW)
* scripts/release-quick.mjs (NEW)
* scripts/changelog-generate.mjs (NEW)
* scripts/agent-changelog-update.mjs (NEW)
* RELEASE_WORKSPACE_RULES.md

Validation result:

* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm run validate:docs`

---

## Change ID: 20260701-governance-authority-registration-path

Status: VALIDATED_PENDING_COMMIT

Intent:
Repair governance authority and enhancement registration validation without changing runtime behavior.

Reason:
Fast validation must not pass while deeper governance gates still block source registration. Governance docs need one active index, source orphan detection needs a declared lifecycle registry, and valid enhancements need one canonical registration path.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/FEATURE_LEDGER.json
* .governance/SOURCE_LIFECYCLE.json
* .governance/ENHANCEMENT_REGISTRY.json
* AGENT_INDEX.md
* INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/governance/AGENTS.md
* docs/governance/DOC_INDEX.json
* docs/governance/ENHANCEMENT_REGISTRATION.md
* package.json
* scripts/governance.mjs
* scripts/governance-utils.mjs
* scripts/validate-docs.mjs
* scripts/gate-feature-governance.mjs
* scripts/gate-src-orphan-detection.mjs
* scripts/validate-registry.mjs
* scripts/gate-changelog.mjs
* scripts/agent-preflight.mjs

Validation result:

* PASS: `npm run gate:workspace-structure`
* PASS: `npm run validate:docs`
* PASS: `npm run gate:feature-governance`
* PASS: `npm run gate:src-orphan-detection`
* PASS: `npm run validate:registry`
* PASS: `npm run gate:changelog`
* PASS: `npm run validate:fast`

---

## Change ID: 20260701-release-testability

Status: VALIDATED_PENDING_COMMIT

Intent:
Make the repo release-testable by fixing current broad-suite package/public API/runtime blockers.

Reason:
`npm test` fails before release validation can pass because the root public API export is stale and package runtime verification expects files not produced by the runtime build. Fresh public tarball smoke also requires the public CLI to expose read-only `scope`, `intent`, and `proof` status surfaces.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/LBE_EXECUTION_BOUNDARY_HANDOFF.md
* docs/RELEASE_FLOW.md
* index.js
* runtime/engine.js
* scripts/build-package-runtime.mjs
* scripts/build-public-sdk.mjs
* package.json

Validation result:

* PASS: `npm test`
* PASS: `npm run governance:check`
* PASS: `git diff --check`
* PASS: `npm run build:public-sdk`
* PASS: `node scripts/check-public-artifact.mjs`
* PASS: `npm run verify:pack-proof`
* PASS: `npm run audit:public-docs`
* PASS: fresh public tarball install smoke with `npx lbe status`, `npx lbe scope`, `npx lbe intent`, and `npx lbe proof`

---

## Change ID: 20260701-lbe-scope-contract

Status: VALIDATED

Intent:
Add `lbe.scope` as the required Audit Mode task contract.

Reason:
Scope contracts are the intermediate bridge between README guidance and later Guard Mode. They do not block direct tools, but they prevent LBE from marking work clean unless the task has an active scope, required reading receipts, matching intent scope, allowed file changes, and required validation evidence.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/LBE_SCOPE_CONTRACT.md
* src/cli/main.js
* src/cli/parseArgs.js
* src/cli/commands/intent.js
* src/cli/commands/proof.js
* src/cli/commands/scope.js
* src/cli/commands/status.js
* src/state/auditMode.js
* src/state/intentRegistry.js
* src/state/scopeContract.js
* test/cli-scope-contract.test.js
* test/cli-audit-mode.test.js

Validation result:

* npm run governance:index: PASSED
* node --test test/cli-scope-contract.test.js: PASSED
* node --test test/cli-audit-mode.test.js: PASSED
* node --test test/cli-proof.test.js: PASSED
* node --test test/cli-status.test.js: PASSED
* npx eslint changed scope-contract files: PASSED
* live local CLI scope smoke: PASSED
  * scope set: SCOPE_REGISTERED
  * scope read: SCOPE_READING_RECORDED
  * proof/status after allowed source change: CLEAN
* npm run governance:check: PASSED
* git diff --check: PASSED, with Git line-ending warnings only
* npm test: FAILED on broader existing package/public API issues outside this scope:
  * `runtime/engine.js` does not provide an `execute` export for root `index.js`
  * package runtime verification still expects missing `dist/state/index.cjs`
  * affected failing tests: `test/local-policy.test.js`, `test/package-runtime.test.js`, `test/public-api.test.js`

---

## Change ID: 20260701-audit-mode-v1

Status: TARGETED_VALIDATED_FULL_SUITE_BLOCKED

Intent:
Implement LBE Audit Mode v1 after documenting the closed execution loop plan.

Reason:
The next product milestone should prove intent discipline without claiming system-wide blocking. Audit Mode needs intent begin, before/after snapshots, proof/status labels, private `.lbe/` evidence, and focused tests before Guard Mode work begins.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/LBE_EXECUTION_BOUNDARY_HANDOFF.md
* bin/lbe.js
* src/cli/main.js
* src/cli/parseArgs.js
* src/cli/commands/intent.js
* src/cli/commands/snapshot.js
* src/cli/commands/proof.js
* src/cli/commands/status.js
* src/state/auditMode.js
* test/cli-audit-mode.test.js

Validation result:

* npm run governance:index: PASSED
* node --test test/cli-audit-mode.test.js: PASSED
* node --test test/cli-proof.test.js: PASSED
* node --test test/cli-status.test.js: PASSED
* npx eslint changed Audit Mode files: PASSED
* npm run governance:check: PASSED
* git diff --check: PASSED, with Git line-ending warnings only
* live local CLI scenario proof: PASSED
  * matching allowed source change: CLEAN
  * package.json changed outside forbidden scope: CHANGED_OUTSIDE_SCOPE
  * package.json changed outside declared allowed scope: MISMATCH_DETECTED
  * changed file with no intent and before/after baseline: NO_INTENT_FOUND
* npm test: FAILED on pre-existing broader suite issues outside this Audit Mode scope:
  * public API/runtime export failure: `runtime/engine.js` does not provide `execute`
  * package runtime/security tests missing built `dist/cli/lbe.js` or temp `.lbe/config/*` fixtures
  * existing lint debt remains outside changed files

---

## Change ID: 20260701-lbe-execution-boundary-handoff

Status: VALIDATED

Intent:
Document the LBE audit/enforcement discussion, missing execution bridge, anonymous user-facing intent layer, and next implementation layers for future agents.

Reason:
Future agents need a repo-local explanation of what is missing, what needs to be added, how audit mode differs from enforce mode, and how user-facing warning labels should hide private audit details.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* docs/INDEX.md
* docs/LBE_EXECUTION_BOUNDARY_HANDOFF.md

Validation result:

* npm run governance:index: PASSED
* npm run governance:check: PASSED
* git diff --check: PASSED, with Git line-ending warnings only
* git status --short: PASSED, only documented ISSUE-0013 files changed

---

## Change ID: 20260630-issue-0012-correction

Status: VALIDATED

Intent:
Audit public package content, fix missing/weak legal license and CLI documentation, and extend validation gates for version 1.3.35.

Reason:
Correct invalid placeholder LICENSE file and remove unsupported CLI commands advertised in README.md.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* LICENSE
* package.json
* release/README.md
* scripts/check-public-artifact.mjs
* scripts/ci-sync-public.mjs
* docs/RELEASE_FLOW.md
* assets/banner.png

Validation result:

* npm run governance:check: PASSED
* npm run build:public-sdk: PASSED
* node scripts/check-public-artifact.mjs: PASSED (clean, 21 files)
* npm run verify:pack-proof: PASSED (exactly 18 approved files, clean)
* npm run proof: PASSED (12/12 matrix tests)
* git status --short: PASSED (only allowed files modified)

---

## Change ID: 20260630-issue-0009-cleanup

Status: VALIDATED

Intent:
Clean only safe generated artifacts after the completed 1.3.34 release.

Reason:
Remove untracked ignored folders/files generated during build/packing steps to maintain a clean repository structure.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md

Validation result:

* npm run governance:check: PASSED
* npm run build:public-sdk: PASSED
* node scripts/check-public-artifact.mjs: PASSED (clean, 21 files)
* npm run proof: PASSED (12/12)
* git status --short: PASSED (only allowed governance files modified, and untracked "../Updateed path yet to apply/")

---

## Change ID: 20260630-exec-readme-positioning

Status: VALIDATED

Intent:
Remove unsupported release positioning from source docs so release-wide public scans remain clean.

Reason:
`release/exec-README.md` contains forbidden external-use positioning in a release source document.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/CHANGELOG_AGENT.md
* docs/00_INDEX.md
* release/exec-README.md

Validation result:

* npm run governance:check: PASSED
* npm run audit:public-docs: PASSED
* npm run proof: PASSED
* npm run build:engine: PASSED with existing Rust warnings
* npm run build:public-sdk: PASSED
* node scripts/check-public-artifact.mjs: PASSED
* npm run verify:pack-proof: PASSED, 18 approved files
* cd release-public; npm pack --dry-run --json: PASSED, 18 approved files
* forbidden release-positioning claim scan: PASSED, no matches
* git diff --check: PASSED

## Change ID: 20260630-os-metadata-package-boundary

Status: VALIDATED

Intent:
Remove OS metadata files from the public npm package boundary and make validation block them permanently.

Reason:
`npm pack --dry-run --json` for `@letterblack/lbe-core@1.3.34` included ignored local `assets/Thumbs.db`, increasing the approved package boundary from 18 files to 19.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/00_INDEX.md
* docs/CHANGELOG_AGENT.md
* release/release-manifest.json
* scripts/build-public-sdk.mjs
* scripts/check-public-artifact.mjs
* scripts/verify-pack-proof.mjs

Validation result:

* npm run governance:check: PASSED
* npm run build:engine: PASSED with existing Rust warnings
* npm run build:public-sdk: PASSED
* node scripts/check-public-artifact.mjs: PASSED
* npm run verify:pack-proof: PASSED, 18 approved files
* npm run audit:public-docs: PASSED
* npm run proof: PASSED
* cd release-public; npm pack --dry-run --json: PASSED, 18 approved files
* node -e package/version check: PASSED, @letterblack/lbe-core 1.3.34
* OS metadata scan: PASSED, no Thumbs.db or .DS_Store in release-public
* git diff --check: PASSED

## Change ID: 20260630-release-governance-1-3-34

Status: VALIDATED

Intent:
Correct stale release governance metadata and prepare correction release `1.3.34`.

Reason:
`1.3.33` was tagged, pushed, and published while `docs/RELEASE_STATE.json` still pointed at an old verified commit, omitted `currentVersion`, and allowed broad `docs/` instead of the approved public ADR boundary.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* AGENT_INDEX.md
* ISSUE_LEDGER.md
* docs/00_INDEX.md
* docs/CHANGELOG_AGENT.md
* docs/README.md
* docs/RELEASE_STATE.json
* .githooks/pre-commit
* scripts/version-sync.mjs (NEW)
* scripts/release-quick.mjs (NEW)
* scripts/changelog-generate.mjs (NEW)
* scripts/agent-changelog-update.mjs (NEW)
* package.json
* release-public/package.json
* release-public/types.d.ts

Validation result:

* npm run governance:check: PASSED
* npm run build:engine: PASSED with existing Rust warnings
* npm run build:public-sdk: PASSED
* node scripts/check-public-artifact.mjs: PASSED
* npm run verify:pack-proof: PASSED
* npm run audit:public-docs: PASSED
* npm run proof: PASSED
* cd release-public; npm pack --dry-run --json: PASSED, 18 approved files
* forbidden release-positioning claim scan: PASSED, no matches
* git diff --check: PASSED

## Change ID: 20260630-issue-scope-gate

Status: VALIDATED

Intent:
Add deterministic active issue file-scope governance.

Reason:
Prevent agents from mechanically adding unrelated files to changelog entries to satisfy governance while mixing unrelated work.

Files actually changed:

* .governance/ISSUE_LEDGER.json
* .governance/FEATURE_LEDGER.json
* scripts/governance.mjs
* scripts/enforce-agent-governance.js
* scripts/test-issue-scope-gate.js
* docs/GOVERNANCE_ISSUE_SCOPE.md
* docs/CHANGELOG_AGENT.md
* AGENT_INDEX.md
* docs/00_INDEX.md
* package.json

Validation result:

* node scripts/test-issue-scope-gate.js: PASSED
* npm run governance:check: PASSED
* git diff --check: PASSED
