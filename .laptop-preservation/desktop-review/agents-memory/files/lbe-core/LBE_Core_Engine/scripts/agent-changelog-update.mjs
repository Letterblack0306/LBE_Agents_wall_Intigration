#!/usr/bin/env node
// agent-changelog-update.mjs — auto-update docs/CHANGELOG_AGENT.md changed files list
// Usage: node scripts/agent-changelog-update.mjs
// Reads git diff changed files, appends them to the current IN_PROGRESS entry.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG_AGENT_PATH = path.join(ROOT, 'docs', 'CHANGELOG_AGENT.md');

// -- Get changed files --
let changedFiles = [];
try {
  // Tracked modified + untracked
  const diffOut = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const untrackedOut = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const deletedOut = execSync('git diff --name-only --diff-filter=D', { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  
  const modified = diffOut ? diffOut.split('\n') : [];
  const untracked = untrackedOut ? untrackedOut.split('\n') : [];
  const deleted = deletedOut ? deletedOut.split('\n') : [];
  
  changedFiles = [
    ...modified.map(f => `* ${f}`),
    ...untracked.map(f => `* ${f} (NEW)`),
    ...deleted.map(f => `* ${f} (DELETED)`),
  ];
} catch (e) {
  console.error('Failed to read git diff:', e.message);
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log('No changed files detected.');
  process.exit(0);
}

console.log(`Changed files detected: ${changedFiles.length}\n`);

// -- Read current CHANGELOG_AGENT.md --
let content = '';
try { content = fs.readFileSync(CHANGELOG_AGENT_PATH, 'utf8'); } catch {
  console.error('docs/CHANGELOG_AGENT.md not found');
  process.exit(1);
}

// -- Find the current IN_PROGRESS entry --
const inProgressMatch = content.match(/## Change ID: ([^\n]+)\n\nStatus: IN_PROGRESS/);
if (!inProgressMatch) {
  console.log('No IN_PROGRESS change entry found. Creating one.');
  
  // Create a new change entry
  const dateId = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const changeId = `${dateId}-auto-update`;
  
  const newEntry = [
    '',
    `## Change ID: ${changeId}`,
    '',
    'Status: IN_PROGRESS',
    '',
    'Intent:',
    '[Describe the change here]',
    '',
    'Reason:',
    '[Why this change was needed]',
    '',
    'Files actually changed:',
    ...changedFiles,
    '',
    'Validation result:',
    '[Fill in after validation]',
    '',
    '---',
    '',
  ].join('\n');
  
  // Insert after the # Agent Changelog header
  content = content.replace(/(# Agent Changelog\n)/, '$1' + newEntry);
  fs.writeFileSync(CHANGELOG_AGENT_PATH, content);
  console.log(`Created new change entry: ${changeId}`);
  console.log(`File list: ${changedFiles.length} files`);
} else {
  // Update existing IN_PROGRESS entry's Files actually changed section
  const changeId = inProgressMatch[1];
  
  // Find the "Files actually changed:" block
  const filesSection = /(Files actually changed:)\n([\s\S]*?)(?=\n## |\nValidation result:|\n---\n|$)/;
  const match = content.match(filesSection);
  
  if (match) {
    // Replace the file list
    const newSection = `Files actually changed:\n${changedFiles.join('\n')}`;
    content = content.replace(match[0], newSection);
    console.log(`Updated "Files actually changed" for change: ${changeId}`);
    console.log(`File list: ${changedFiles.length} files`);
  } else {
    console.log(`IN_PROGRESS entry found (${changeId}) but no "Files actually changed" section. Appending.`);
    const insertAfter = `## Change ID: ${changeId}\n\nStatus: IN_PROGRESS`;
    const idx = content.indexOf(insertAfter) + insertAfter.length;
    // Find the next section after Reason
    const reasonMatch = content.slice(idx).match(/Reason:\n[^\n]*\n/);
    if (reasonMatch) {
      const insertPos = idx + reasonMatch.index + reasonMatch[0].length;
      content = content.slice(0, insertPos) + `\nFiles actually changed:\n${changedFiles.join('\n')}\n` + content.slice(insertPos);
    }
    console.log(`Appended file list to change: ${changeId}`);
  }
  
  fs.writeFileSync(CHANGELOG_AGENT_PATH, content);
}

console.log('\ndocs/CHANGELOG_AGENT.md updated successfully.');
for (const f of changedFiles) console.log(`  ${f}`);