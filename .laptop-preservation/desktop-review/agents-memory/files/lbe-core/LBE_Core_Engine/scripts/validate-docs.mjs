#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { existsRelative, fail, pass, readJson, workspaceRoot } from './governance-utils.mjs';

const blockers = [];
const agentsPath = 'docs/governance/AGENTS.md';
const indexPath = 'docs/governance/DOC_INDEX.json';

if (!existsRelative(agentsPath)) blockers.push(`${agentsPath} is missing.`);
if (!existsRelative(indexPath)) blockers.push(`${indexPath} is missing.`);

if (blockers.length === 0) {
  const agents = fs.readFileSync(path.join(workspaceRoot, agentsPath), 'utf8');
  if (!agents.includes(indexPath)) blockers.push(`${agentsPath} must reference ${indexPath}.`);
  if (agents.includes('docs/agents/DOC_INDEX.json') && !agents.includes('not an active authority')) {
    blockers.push(`${agentsPath} references docs/agents/DOC_INDEX.json as an active authority.`);
  }

  const index = readJson(indexPath);
  if (index.activeIndex !== indexPath) blockers.push(`${indexPath} activeIndex must be ${indexPath}.`);
  for (const item of [...(index.documents || []), ...(index.registries || [])]) {
    if (item.state === 'active' && !existsRelative(item.path)) {
      blockers.push(`Active governance reference is missing: ${item.path}`);
    }
  }
}

if (blockers.length > 0) fail('validate:docs', blockers);
pass('validate:docs', 'governance authority references exist');

