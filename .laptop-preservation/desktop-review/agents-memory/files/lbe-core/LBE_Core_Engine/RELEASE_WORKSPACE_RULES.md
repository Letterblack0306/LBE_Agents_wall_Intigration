# LBE Release Workspace Rules

This file defines what can and cannot be used as LBE release proof.

## Release authority boundary

Only the designated LBE release workspace may certify LBE release safety.

A downstream project, integration lab, copied repository, downloaded folder, worktree, or consumer app is not release authority for LBE.

Consumer projects may prove only their own integration behavior with the installed LBE package.

They must not claim:

- LBE release-ready
- LBE published
- full LBE proof passed
- npm/GitHub release alignment
- package release correctness

## Consumer dependency rule

Other projects must consume LBE as an installed package dependency from the public registry.

Allowed consumer model:

```bash
npm install @letterblack/lbe-core
npx lbe init
npx lbe status
npx lbe proof --public
```

Do not use a copied LBE source tree as the authority for consumer projects.

Do not point consumer projects at LBE through:

- `file:`
- `link:`
- `workspace:`
- `git+`
- `github:`
- local relative paths
- local absolute paths
- symlinked `node_modules` packages

## assert-consumer rule

`npx lbe assert-consumer` is a downstream consumer-safety guard.

It answers:

- Is this project using `@letterblack/lbe-core` as an installed dependency?
- Is this project accidentally pointing at a copied source tree, workspace link, git dependency, local path, or symlink?

It must always report consumer status only.

It is not release proof.

It is not package provenance proof.

It is not a substitute for:

- full test suite
- `npm run proof`
- package runtime verification
- packed tarball inspection
- npm `gitHead` check, or an explicit `UNAVAILABLE_FROM_NPM` caveat when npm metadata does not expose it
- GitHub tag alignment
- GitHub Release verification
- fresh install smoke from the registry

Expected classification for a valid consumer project:

```txt
consumer-project-using-installed-registry-dependency
releaseClaimsAllowed: false
```

If a project passes `assert-consumer`, the only valid conclusion is:

```txt
This project consumes LBE from an installed package dependency.
This does not certify LBE release safety.
```

## Release workflow stale-guard

The release workflow is the authority for public repo sync and release automation.

Agents must not manually patch the public `Letterblack-Sentinel` repo to make it look released.

If the public repo is stale, the correct fix is:

1. inspect the release workflow
2. verify it targets the current package: `@letterblack/lbe-core`
3. repair stale workflow steps
4. run the workflow or its explicit `sync-public-only` mode
5. verify public repo, tag, GitHub Release, npm `gitHead`, and fresh install smoke

## Blocked stale workflow patterns

Stop immediately if the workflow still treats these as the current release packages:

```txt
@letterblack/lbe-sdk
@letterblack/lbe-exec
```

These may appear only as legacy/deprecated notes, not active publish/sync/release jobs.

## Required workflow gates

The workflow must include:

```txt
node --test
npm run proof
npm run audit:public-docs
npm run verify:package-runtime
npm pack --dry-run
npm gitHead verification or explicit unavailable-metadata caveat
GitHub tag target verification
fresh npm install smoke
public repo sync
sync-public-only mode for already-published versions
```

## README authority rule

`release-public/README.md` is manually reviewed public-facing copy.

Release, publish, and public mirror sync must fail if the README changed and `.governance/PUBLIC_README_APPROVAL.json` does not match the current `release-public/README.md` SHA-256 and package version.

Required behavior:

```txt
show README diff before release
require README claim review
record approval in .governance/PUBLIC_README_APPROVAL.json
run npm run check:readme-approval before npm publish
run npm run check:readme-approval before public mirror sync
```

README content rules:

```txt
do not expose internal validation mechanics in the main README
do not expose backend process details in the main README
do not expose defensive architecture notes in the main README
keep detailed mechanics in docs/
```

## Hard stop message

If the workflow is stale, report exactly:

```txt
RELEASE WORKFLOW STALE — BLOCKED
Do not publish manually.
Do not sync the public repo manually.
Fix workflow first.
```

## Agent report format

Before touching release automation, report:

```txt
Release workflow classification:
- Workflow path:
- Active package target:
- Old package targets present: yes/no
- sync-public-only mode present: yes/no
- npm gitHead verification present: yes/no
- fresh install smoke present: yes/no
- public repo sync present: yes/no
- release workflow allowed: yes/no
```

## Hard stop conditions

Stop and report if:

- a consumer project is used to certify an LBE release
- focused integration tests are used as release proof
- a copied/lab workspace is treated as package authority
- local path, git, workspace, or symlink dependencies are used for LBE in a consumer project
- release claims are made without npm/GitHub/package provenance checks

## Known release record

`v1.3.36` status:

```txt
release status: RELEASED
source repo: 1.3.36
npm package: 1.3.36
public mirror: 1.3.36
public sync commit: 1ffaf7f release: v1.3.36
registry install: VERIFIED
CLI smoke: VERIFIED
repo state: CLEAN / ALIGNED
gitHead proof: UNAVAILABLE FROM NPM
```

This is not a failed release. Do not republish, retag, move `v1.3.36`, or re-sync the public mirror only because npm did not expose `gitHead`.

The completed release path was:

```txt
source repo -> npm registry -> public GitHub mirror
```

Public mirror verification for `v1.3.36` required:

```txt
node scripts/ci-sync-public.mjs
node scripts/ci-guard-public-sync.mjs
clone Letterblack0306/LetterBlack-Sentinel
verify package.json is @letterblack/lbe-core 1.3.36
npm pack --dry-run --json
node dist/cli.js status
node dist/cli.js scope
node dist/cli.js intent
node dist/cli.js proof
```

## Agent report format

Before making any LBE-related release claim, report:

```txt
Workspace classification:
- Path:
- Type: LBE release workspace / consumer project / local lab / copied workspace / unknown
- npm run proof available: yes/no
- full suite exit code:
- release claims allowed: yes/no
```

If the workspace is a consumer project, local lab, copied workspace, or unknown, release claims are not allowed.
