#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, readJson, workspaceRoot } from './governance-utils.mjs';

const changelogPath = path.join(workspaceRoot, 'docs/CHANGELOG_AGENT.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');
const registry = readJson('.governance/ENHANCEMENT_REGISTRY.json');
const blockers = [];

for (const item of registry.enhancements || []) {
  if (!item.changelogRequired) continue;
  if (!changelog.includes(item.id) && !changelog.includes(item.issue)) {
    blockers.push(`docs/CHANGELOG_AGENT.md must mention ${item.id} or ${item.issue}.`);
  }
  for (const doc of item.docsRequired || []) {
    if (!changelog.includes(doc)) blockers.push(`docs/CHANGELOG_AGENT.md must mention required doc ${doc}.`);
  }
}

if (blockers.length > 0) fail('gate:changelog', blockers);
pass('gate:changelog', 'enhancement changelog coverage exists');

