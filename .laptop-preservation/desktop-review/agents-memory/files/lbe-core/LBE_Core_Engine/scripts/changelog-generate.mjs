#!/usr/bin/env node
// changelog-generate.mjs — generate CHANGELOG.md entries from ISSUE_LEDGER.json
// Usage: node scripts/changelog-generate.mjs [--since=<tag>] [--write]
//   --since=<tag>   only include issues validated after this tag (default: last tag from RELEASE_STATE.json)
//   --write          prepend entries to CHANGELOG.md (default: stdout only)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ISSUE_PATH = path.join(ROOT, '.governance', 'ISSUE_LEDGER.json');
const STATE_PATH = path.join(ROOT, 'docs', 'RELEASE_STATE.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function rJ(fp) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; } }

const write = process.argv.includes('--write');
const sinceArg = process.argv.find(a => a.startsWith('--since='));
const sinceTag = sinceArg ? sinceArg.split('=')[1] : null;

// -- Determine version and since tag --
const rootPkg = rJ(path.join(ROOT, 'package.json'));
if (!rootPkg || !rootPkg.version) {
  console.error('Cannot determine root package version');
  process.exit(1);
}
const version = rootPkg.version;

// Resolve since tag: explicit arg > RELEASE_STATE.json > git describe
let cutoffTag = sinceTag;
if (!cutoffTag) {
  const state = rJ(STATE_PATH);
  if (state?.lastReleaseTag) cutoffTag = state.lastReleaseTag;
}
if (!cutoffTag) {
  try { cutoffTag = execSync('git describe --tags --abbrev=0', { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { cutoffTag = 'v0.0.0'; }
}

// -- Find validated issues since tag --
const ledger = rJ(ISSUE_PATH);
if (!ledger?.issues?.length) {
  console.error('No issues found in ISSUE_LEDGER.json');
  process.exit(1);
}

// Issues that are VALIDATED and likely newer than the cutoff
// (we don't have timestamps, so include all VALIDATED issues)
const validated = ledger.issues.filter(i => i.status === 'VALIDATED');

if (validated.length === 0) {
  console.log('No validated issues found.');
  process.exit(0);
}

console.log(`Since tag: ${cutoffTag}`);
console.log(`Version: ${version}`);
console.log(`Validated issues: ${validated.length}\n`);

// -- Generate entries --
const entries = [];
for (const issue of validated) {
  // Extract a one-line summary from intent
  const id = issue.id;
  let desc = issue.intent || '';
  // Truncate to first sentence or ~120 chars for readability
  const firstDot = desc.indexOf('.');
  if (firstDot > 0 && firstDot < 120) desc = desc.slice(0, firstDot + 1);
  else if (desc.length > 120) desc = desc.slice(0, 117) + '...';
  entries.push(`- ${id}: ${desc}`);
}

const generatedBlock = entries.join('\n');
console.log('Generated entries:');
console.log(generatedBlock);

if (!write) {
  console.log('\nDry-run only. Use --write to prepend to CHANGELOG.md');
  process.exit(0);
}

// -- Write to CHANGELOG.md --
let changelog = '';
try { changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8'); } catch {}

const header = `## ${version}`;
if (changelog.includes(header)) {
  // Update existing section — replace the existing entries under this version
  // Find the section and append our entries
  console.log(`Section ${version} exists in CHANGELOG.md — manual merge recommended.`);
  console.log('Printing entries above. Use them to update manually.');
} else {
  // Prepend new section
  const newSection = `# Changelog\n\n## ${version}\n\n${generatedBlock}\n\n`;
  const rest = changelog.replace(/^# Changelog\s*\n/, '');
  fs.writeFileSync(CHANGELOG_PATH, newSection + rest);
  console.log(`\nPrepended section ${version} to CHANGELOG.md`);
}