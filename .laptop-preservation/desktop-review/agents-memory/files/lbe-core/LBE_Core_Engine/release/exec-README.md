# @letterblack/lbe-exec

`@letterblack/lbe-exec@1.3.41` is quarantined and must not be distributed.

The corrected package line is `@letterblack/lbe-exec@1.3.42`. Publish it only after the generated package contains the required runtime files and fresh-install smoke passes.

---

## Role

`@letterblack/lbe-exec` is the in-process execution controller for hosts that want LBE to handle governed file writes and shell commands directly.

Agent or host code should call high-level executor methods such as `lbe.writeFile()` or `lbe.runShell()` instead of knowing the low-level request envelope.

No cloud service. No daemon.

---

## Install

After `1.3.42` is published and smoke-verified:

```bash
npm install @letterblack/lbe-exec
```

CLI smoke commands:

```bash
npx lbe-exec --help
npx lbe-exec status
npx lbe-exec init
npx lbe-exec policy
```

Do not install or advertise `@letterblack/lbe-exec@1.3.41`.

---

## Quick start

```js
import { createLocalExecutor } from '@letterblack/lbe-exec';

const lbe = createLocalExecutor({ rootDir: process.cwd() });

await lbe.writeFile('output/report.md', content);
await lbe.readFile('src/config.json');
await lbe.patchFile('src/index.js', patch);
await lbe.deleteFile('tmp/scratch.txt');
await lbe.runShell('node', ['scripts/build.js']);
```

Expected result shape:

```js
{ ok: true,  decision: 'allow', executed: true,  auditId: '...' }
{ ok: false, decision: 'deny',  executed: false, error: { code, message } }
```

No knowledge of the pipeline, request format, or policy internals should be required by the host application.

---

## Options

```js
const lbe = createLocalExecutor({
  rootDir: process.cwd(),
  mode: 'observe',
  shell: {
    allowCommands: ['node', 'npm'],
    denyCommands: ['rm', 'curl'],
    maxRequests: 20
  }
});
```

---

## Policy management model

Only the host application writes policy. Agents may propose a rule; the proposal is returned as a plain object for the host to review. Until the host explicitly accepts and writes it, the proposal has no effect.

```js
const proposal = lbe.policy.proposeRule({
  effect: 'deny',
  type: 'path',
  pattern: 'secrets/**',
  from: 'agent: these files should not be modified'
});

lbe.policy.addRule(proposal);
const policy = lbe.policy.read();
lbe.audit.verify();
```

---

## Required package contents

```text
dist/index.js               In-process executor — createLocalExecutor()
dist/cli.js                 Local CLI — npx lbe-exec
hooks/register.cjs          Optional hook registration entry
assets/                     Public diagrams only
types.d.ts                  TypeScript declarations
README.md                   Public package README
LICENSE                     Package license
```

Source code, tests, keys, and runtime state must not be included.

---

## Validation before publish

```bash
npm run build:engine
npm run build:public-exec
node scripts/check-public-exec.mjs
cd release-exec
npm pack --dry-run --json
npm pack
```

Fresh install smoke:

```bash
mkdir %TEMP%\lbe-exec-1342-smoke
cd /d %TEMP%\lbe-exec-1342-smoke
npm init -y
npm install <absolute-path-to-tarball>\letterblack-lbe-exec-1.3.42.tgz
npx lbe-exec --help
npx lbe-exec status
npx lbe-exec init
npx lbe-exec policy
node --input-type=module -e "import('@letterblack/lbe-exec').then(m=>{if(typeof m.createLocalExecutor!=='function')throw new Error('missing createLocalExecutor'); console.log('createLocalExecutor export OK')})"
```

---

## Limits

This package governs actions routed through its executor. It does not provide kernel-level process isolation, network-egress control, multi-tenant separation, or a hosted control plane.

For the user-ready local SDK/CLI boundary, use `@letterblack/lbe-core`.
