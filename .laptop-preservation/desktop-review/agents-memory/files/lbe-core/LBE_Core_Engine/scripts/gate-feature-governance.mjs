#!/usr/bin/env node
import { fail, pass, readJson } from './governance-utils.mjs';

const allowedStates = new Set(['ACTIVE', 'PLANNED', 'DEPRECATED', 'REMOVED', 'BLOCKED', 'UNKNOWN']);
const blockers = [];

for (const file of ['FEATURE_LEDGER.json', '.governance/FEATURE_LEDGER.json']) {
  const ledger = readJson(file);
  if (ledger.version !== 1 || !Array.isArray(ledger.features)) {
    blockers.push(`${file} must have version 1 and a features array.`);
    continue;
  }
  for (const feature of ledger.features) {
    if (!feature.id) blockers.push(`${file} contains a feature without id.`);
    if (!allowedStates.has(feature.state)) blockers.push(`${file}:${feature.id} has invalid state ${feature.state}.`);
  }
}

if (blockers.length > 0) fail('gate:feature-governance', blockers);
pass('gate:feature-governance', 'feature ledgers are valid');

