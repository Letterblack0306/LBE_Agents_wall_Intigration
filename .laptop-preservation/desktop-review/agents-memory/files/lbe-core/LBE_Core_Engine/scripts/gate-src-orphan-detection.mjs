#!/usr/bin/env node
import { fail, listFiles, matchPattern, pass, readJson } from './governance-utils.mjs';

const lifecycle = readJson('.governance/SOURCE_LIFECYCLE.json');
const allowedStates = new Set(['active', 'loaded-by', 'experimental', 'deferred', 'removed', 'generated', 'ignored']);
const blockers = [];

if (lifecycle.version !== 1 || !Array.isArray(lifecycle.entries)) {
  blockers.push('.governance/SOURCE_LIFECYCLE.json must have version 1 and entries array.');
}

for (const entry of lifecycle.entries || []) {
  if (!entry.path) blockers.push('source lifecycle entry missing path.');
  if (!allowedStates.has(entry.state)) blockers.push(`${entry.path} has invalid lifecycle state ${entry.state}.`);
  if (entry.state === 'loaded-by' && !entry.loadedBy) blockers.push(`${entry.path} uses loaded-by without loadedBy.`);
}

const sourceFiles = listFiles('src', (file) => /\.(cjs|mjs|js|ts)$/.test(file));
for (const file of sourceFiles) {
  const matches = (lifecycle.entries || []).filter((entry) => matchPattern(file, entry.path));
  if (matches.length === 0) blockers.push(`${file} is not declared in .governance/SOURCE_LIFECYCLE.json.`);
  if (matches.length > 1) blockers.push(`${file} matches multiple source lifecycle entries.`);
}

if (blockers.length > 0) fail('gate:src-orphan-detection', blockers);
pass('gate:src-orphan-detection', `${sourceFiles.length} source files declared by lifecycle registry`);

