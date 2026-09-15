#!/usr/bin/env node
// version-sync.mjs — version cascade + doc verification
// Usage: node scripts/version-sync.mjs [--check] [--fix]
//   --check  verify only, exit 1 if mismatch (default)
//   --fix    sync release-public/ and release-exec/ package.json to root version

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rp = (...p) => path.join(ROOT, ...p);
const rJ = (fp) => { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; } };
const rT = (fp) => { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } };

const mode = process.argv.includes('--fix') ? 'fix' : 'check';
const blockers = [];
let allPass = true;

function block(id, msg) {
  blockers.push({ id, message: msg });
  allPass = false;
}

function pass(id, msg) {
  console.log(`  [PASS] ${id}: ${msg}`);
}

// -- 1. Root version --
const rootPkg = rJ(rp('package.json'));
if (!rootPkg || !rootPkg.version) {
  block('ROOT_MISSING', 'Root package.json missing or no version');
  console.error(JSON.stringify(blockers, null, 2));
  process.exit(1);
}
const v = rootPkg.version;
console.log(`version-sync: root = ${v} (mode: ${mode})`);

// -- 2. Sub-package sync --
for (const [label, fp] of [
  ['release-public/package.json', rp('release-public', 'package.json')],
  ['release-exec/package.json', rp('release-exec', 'package.json')],
]) {
  const p = rJ(fp);
  if (!p) { block(label, `${label} missing or invalid JSON`); continue; }
  if (p.version !== v) {
    if (mode === 'fix') {
      p.version = v;
      fs.writeFileSync(fp, JSON.stringify(p, null, 2) + '\n');
      pass(label, `synced ${p.version} ? ${v}`);
    } else {
      block(label, `${label} version mismatch: ${p.version} ? ${v}`);
    }
  } else {
    pass(label, `${v} aligned`);
  }
}

// -- 3. Doc references --
const docChecks = [
  ['RELEASE_SCOPE.md', rT(rp('RELEASE_SCOPE.md')), 'v' + v, 'RELEASE_SCOPE'],
  ['CHANGELOG.md', rT(rp('CHANGELOG.md')), v, 'CHANGELOG'],
  ['Release-README.md', rT(rp('Release-README.md')), v, 'RELEASE_README'],
];
for (const [label, content, pattern, id] of docChecks) {
  if (!content) { block(id, `${label} is empty or missing`); continue; }
  if (!content.includes(pattern)) {
    block(id, `${label} does not contain version reference "${pattern}"`);
  } else {
    pass(id, `${label} references ${v}`);
  }
}

// -- 4. Report --
if (allPass) {
  console.log(`\nversion-sync: ALL PASSED — version ${v} aligned across all surfaces\n`);
  process.exit(0);
} else {
  console.error(`\nversion-sync: BLOCKED — ${blockers.length} blocker(s)\n`);
  for (const b of blockers) console.error(`  BLOCKER ${b.id}: ${b.message}`);
  console.error('\nRun: npm run version:sync:fix  to auto-sync sub-packages\n');
  process.exit(1);
}