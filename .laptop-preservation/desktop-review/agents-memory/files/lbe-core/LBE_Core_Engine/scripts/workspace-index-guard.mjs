#!/usr/bin/env node
// @owner letterblack-governance
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`[workspace-index-guard] BLOCKED: ${msg}`); process.exit(1); };
const warn = (msg) => console.warn(`[workspace-index-guard] WARN: ${msg}`);

// Paths excluded from the root index check (runtime-generated or intentionally untracked)
const ROOT_EXCLUDE = new Set([
  'node_modules',
  '.lbe',
  'data',
  'lbe.audit.jsonl',
  '.git',
]);
const ROOT_EXCLUDE_SUFFIX = ['.tgz'];

// ---------------------------------------------------------------------------
// Parse a markdown index table between sentinel comments
// Returns a Set of path strings (trimmed, lowercased for comparison)
// ---------------------------------------------------------------------------
function parseIndexTable(content, startTag, endTag) {
  const start = content.indexOf(startTag);
  const end = content.indexOf(endTag);
  if (start === -1 || end === -1 || end <= start) return null;

  const block = content.slice(start + startTag.length, end);
  const paths = new Set();

  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 1) continue;
    const p = cols[0];
    // Skip header row and separator row
    if (p === 'Path' || p.startsWith('---')) continue;
    paths.add(p);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// 1. Root index check
// ---------------------------------------------------------------------------
function checkRootIndex() {
  const indexPath = path.join(root, 'INDEX.md');
  if (!fs.existsSync(indexPath)) fail('INDEX.md is missing from workspace root');

  const content = fs.readFileSync(indexPath, 'utf8');
  const registered = parseIndexTable(content, '<!-- index-start -->', '<!-- index-end -->');
  if (!registered) fail('INDEX.md is missing <!-- index-start --> / <!-- index-end --> sentinels');

  // Normalize: strip trailing slash for comparison
  const normalize = (p) => p.replace(/\/$/, '');
  const registeredNorm = new Set([...registered].map(normalize));

  const entries = fs.readdirSync(root);
  const unregistered = [];

  for (const entry of entries) {
    if (ROOT_EXCLUDE.has(entry)) continue;
    if (ROOT_EXCLUDE_SUFFIX.some(s => entry.endsWith(s))) continue;
    if (!registeredNorm.has(normalize(entry)) && !registeredNorm.has(normalize(entry) + '/')) {
      unregistered.push(entry);
    }
  }

  if (unregistered.length > 0) {
    fail(
      `These root paths are not registered in INDEX.md:\n` +
      unregistered.map(u => `  - ${u}`).join('\n') +
      `\n\nAdd them to INDEX.md before committing.`
    );
  }

  console.log(`[workspace-index-guard] PASS: root INDEX.md covers all ${entries.length - ROOT_EXCLUDE.size} tracked paths`);
}

// ---------------------------------------------------------------------------
// 2. Docs index check
// ---------------------------------------------------------------------------
function checkDocsIndex() {
  const docsIndexPath = path.join(root, 'docs', 'INDEX.md');
  if (!fs.existsSync(docsIndexPath)) fail('docs/INDEX.md is missing');

  const content = fs.readFileSync(docsIndexPath, 'utf8');
  const registered = parseIndexTable(content, '<!-- docs-index-start -->', '<!-- docs-index-end -->');
  if (!registered) fail('docs/INDEX.md is missing <!-- docs-index-start --> / <!-- docs-index-end --> sentinels');

  // Collect all actual docs files recursively
  function scanDocs(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        scanDocs(full, results);
      } else {
        results.push(rel);
      }
    }
    return results;
  }

  const docsDir = path.join(root, 'docs');
  if (!fs.existsSync(docsDir)) {
    warn('docs/ directory does not exist — skipping docs index check');
    return;
  }

  const actualDocs = scanDocs(docsDir);
  const unregistered = actualDocs.filter(p => !registered.has(p));

  if (unregistered.length > 0) {
    fail(
      `These docs files are not registered in docs/INDEX.md:\n` +
      unregistered.map(u => `  - ${u}`).join('\n') +
      `\n\nAdd them to docs/INDEX.md before committing.`
    );
  }

  console.log(`[workspace-index-guard] PASS: docs/INDEX.md covers all ${actualDocs.length} docs files`);
}

// ---------------------------------------------------------------------------
// 3. Release surface denylist check (reads from docs/RELEASE_STATE.json)
// ---------------------------------------------------------------------------
function checkReleaseDenylist() {
  const statePath = path.join(root, 'docs', 'RELEASE_STATE.json');
  if (!fs.existsSync(statePath)) {
    warn('docs/RELEASE_STATE.json missing — skipping denylist check');
    return;
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const denylist = state.releaseSurfaceDenylist ?? [];
  if (denylist.length === 0) {
    warn('releaseSurfaceDenylist is empty in RELEASE_STATE.json');
    return;
  }

  // Check that denylist entries do NOT appear as tracked root-level paths
  // (i.e., they are properly excluded). This is a sanity check that the
  // denylist is coherent with the workspace layout — it does not scan
  // release repo output here (that is done by release-gate.mjs).
  const violations = denylist.filter(denied => {
    const deniedPath = path.join(root, denied.replace(/\/$/, ''));
    return fs.existsSync(deniedPath);
  });

  if (violations.length > 0) {
    // These paths exist in the workspace (expected) but are denied from release output.
    // This is informational — not a block — the actual release pack check is in release-gate.mjs.
    console.log(`[workspace-index-guard] INFO: ${violations.length} source-only paths confirmed present and excluded from release surface`);
  }

  console.log(`[workspace-index-guard] PASS: release denylist loaded (${denylist.length} entries)`);
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------
checkRootIndex();
checkDocsIndex();
checkReleaseDenylist();
console.log('[workspace-index-guard] ALL CHECKS PASSED');
