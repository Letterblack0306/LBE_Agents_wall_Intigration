#!/usr/bin/env node
// release-quick.mjs — fast pre-release gate (<10s, no slow tests)
// Usage: node scripts/release-quick.mjs
// Runs all quick checks that don't require test execution.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const TIMEOUT = 30_000;

const results = [];
let allPass = true;

function run(scriptPath, label) {
  process.stdout.write(`  ${label}... `);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: TIMEOUT,
    windowsHide: true,
  });
  const passed = r.status === 0;
  const out = (r.stdout?.toString() || '').trim().split('\n').slice(-3).join(' | ');
  const err = (r.stderr?.toString() || '').trim().split('\n').slice(-3).join(' | ');
  results.push({ label, passed, out: out || err, status: r.status });
  if (passed) { console.log('PASS'); } else { console.log('FAIL'); allPass = false; }
  return passed;
}

function runNpm(args, label) {
  process.stdout.write(`  ${label}... `);
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['run', ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: TIMEOUT,
    windowsHide: true,
    shell: isWin,
  });
  const passed = r.status === 0;
  const out = (r.stdout?.toString() || '').trim().split('\n').slice(-3).join(' | ');
  const err = (r.stderr?.toString() || '').trim().split('\n').slice(-3).join(' | ');
  results.push({ label, passed, out: out || err, status: r.status });
  if (passed) { console.log('PASS'); } else { console.log('FAIL'); allPass = false; }
  return passed;
}

console.log('\n--- RELEASE QUICK GATE ---\n');

// Gate 1: Version alignment
const versionScript = path.join(ROOT, 'scripts', 'version-sync.mjs');
run(versionScript, '1. Version Sync');

// Gate 2: Governance scope + index coverage
const govScript = path.join(ROOT, 'scripts', 'governance.mjs');
const r2 = spawnSync(process.execPath, [govScript, 'check'], {
  cwd: ROOT, stdio: 'pipe', timeout: TIMEOUT, windowsHide: true,
});
const govPassed = r2.status === 0;
results.push({ label: '2. Governance Check', passed: govPassed, out: (r2.stdout?.toString() || r2.stderr?.toString() || '').trim(), status: r2.status });
process.stdout.write('  2. Governance Check... ');
if (govPassed) { console.log('PASS'); } else { console.log('FAIL'); allPass = false; }

// Gate 3: Public doc audit
const auditScript = path.join(ROOT, 'scripts', 'audit-public-docs.mjs');
run(auditScript, '3. Public Doc Audit');

// Gate 4: README approval check
const readmeScript = path.join(ROOT, 'scripts', 'check-readme-approval.mjs');
run(readmeScript, '4. README Approval');

// Gate 5: Feature governance
const featGov = path.join(ROOT, 'scripts', 'gate-feature-governance.mjs');
run(featGov, '5. Feature Governance');

// Gate 6: Workspace index guard
const idxGuard = path.join(ROOT, 'scripts', 'workspace-index-guard.mjs');
run(idxGuard, '6. Workspace Index');

// -- Summary --
console.log('\n' + '='.repeat(60));
console.log('  RELEASE QUICK GATE SUMMARY');
console.log('='.repeat(60));
let passed = 0, failed = 0;
for (const r of results) {
  const icon = r.passed ? '?' : '?';
  console.log(`  ${icon} ${r.label}`);
  if (r.passed) passed++; else failed++;
}
console.log('='.repeat(60));
console.log(`  ${passed}/${results.length} passed, ${failed} failed`);

if (allPass) {
  console.log('\n  QUICK GATE PASSED — safe to run full release:check\n');
  process.exit(0);
} else {
  console.error('\n  QUICK GATE BLOCKED — fix failures before release:check\n');
  process.exit(1);
}