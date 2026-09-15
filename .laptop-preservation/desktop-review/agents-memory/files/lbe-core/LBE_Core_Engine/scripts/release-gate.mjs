#!/usr/bin/env node
// @owner letterblack-governance
//
// Master pre-release gate. Must pass before any publish action.
// Run via: npm run release:gate
//
// Gate sequence:
//   1. workspace-index-guard  — index completeness
//   2. mainhead-guard         — branch and worktree authority
//   3. validate:all           — mainhead + engine:check + lint + test
//   4. npm pack --dry-run     — release surface denylist check
//
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHILD_TIMEOUT_MS = 120_000;
const CHILD_MAX_BUFFER = 20 * 1024 * 1024;
const fail = (msg) => { console.error(`\n[release-gate] BLOCKED: ${msg}`); process.exit(1); };
const pass = (msg) => console.log(`[release-gate] PASS: ${msg}`);
const step = (msg) => console.log(`\n[release-gate] ── ${msg}`);

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: root,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd),
    timeout: opts.timeout ?? CHILD_TIMEOUT_MS,
    maxBuffer: opts.maxBuffer ?? CHILD_MAX_BUFFER,
    windowsHide: true,
    ...opts,
  });
  if (result.error) {
    fail(`${cmd} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(' ')} exited non-zero`);
  }
}

function runNpm(...args) {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args);
}

function parseNpmPackJson(output) {
  try {
    return JSON.parse(output);
  } catch {}

  const arrayStart = output.indexOf('[\n  {');
  const compactArrayStart = output.indexOf('[{');
  const start = arrayStart >= 0 ? arrayStart : compactArrayStart;
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) {
    fail('npm pack --dry-run output is not valid JSON');
  }

  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    fail('npm pack --dry-run output is not valid JSON');
  }
}

// ---------------------------------------------------------------------------
// Load denylist from machine-readable release state
// ---------------------------------------------------------------------------
const statePath = path.join(root, 'docs', 'RELEASE_STATE.json');
if (!fs.existsSync(statePath)) fail('docs/RELEASE_STATE.json is missing — cannot verify release surface');
const releaseState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const DENYLIST = releaseState.releaseSurfaceDenylist ?? [];
if (DENYLIST.length === 0) fail('releaseSurfaceDenylist is empty in docs/RELEASE_STATE.json');

// ---------------------------------------------------------------------------
// Gate 1: workspace index guard
// ---------------------------------------------------------------------------
step('Gate 1 — workspace index guard');
run(process.execPath, [path.join(root, 'scripts', 'workspace-index-guard.mjs')]);
pass('workspace index guard');

// ---------------------------------------------------------------------------
// Gate 2: mainhead guard (branch + worktree authority)
// ---------------------------------------------------------------------------
step('Gate 2 — mainhead guard');
run(process.execPath, [path.join(root, 'scripts', 'mainhead-guard.mjs')]);
pass('mainhead guard');

// ---------------------------------------------------------------------------
// Gate 3: validate:all (mainhead + engine:check + lint + test)
// ---------------------------------------------------------------------------
step('Gate 3 — validate:all');
runNpm('run', 'validate:all');
pass('validate:all');

// ---------------------------------------------------------------------------
// Gate 4: npm pack --dry-run denylist check
// ---------------------------------------------------------------------------
step('Gate 4 — npm pack --dry-run (release surface denylist)');

let packOutput;
try {
  packOutput = execSync(
    (process.platform === 'win32' ? 'npm.cmd' : 'npm') + ' pack --dry-run --json',
    { cwd: root, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_MAX_BUFFER, windowsHide: true }
  );
} catch (e) {
  fail(`npm pack --dry-run failed: ${e.message}`);
}

const packJson = parseNpmPackJson(packOutput);

const packEntry = Array.isArray(packJson) ? packJson[0] : packJson;
const packedFiles = (packEntry?.files ?? []).map(f => (typeof f === 'string' ? f : f.path));

const violations = [];
for (const file of packedFiles) {
  const normalized = file.replace(/^\.\//, '').replace(/\\/g, '/');
  for (const denied of DENYLIST) {
    const deniedNorm = denied.replace(/\/$/, '');
    if (normalized === deniedNorm || normalized.startsWith(deniedNorm + '/')) {
      violations.push({ file: normalized, deniedBy: denied });
    }
  }
}

if (violations.length > 0) {
  console.error('[release-gate] Pack contains denied files:');
  for (const v of violations) console.error(`  ${v.file}  ← denied by "${v.deniedBy}"`);
  fail(`${violations.length} denied path(s) found in npm pack output`);
}

pass(`pack clean — ${packedFiles.length} files, 0 denylist violations`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n[release-gate] ══════════════════════════════════════════');
console.log('[release-gate] ALL GATES PASSED — safe to build release artifacts');
console.log('[release-gate] Next: npm run verify:public-sdk && npm run verify:public-exec');
console.log('[release-gate] ══════════════════════════════════════════');

// Print final pack file list for audit trail
console.log('\n[release-gate] Pack file list:');
for (const f of packedFiles) console.log(`  ${f}`);
