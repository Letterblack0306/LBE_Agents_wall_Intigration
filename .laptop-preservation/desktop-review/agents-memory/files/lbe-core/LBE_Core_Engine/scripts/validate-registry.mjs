#!/usr/bin/env node
import { existsRelative, fail, pass, readJson } from './governance-utils.mjs';

const blockers = [];
const registry = readJson('.governance/ENHANCEMENT_REGISTRY.json');

if (registry.version !== 1 || !Array.isArray(registry.enhancements)) {
  blockers.push('.governance/ENHANCEMENT_REGISTRY.json must have version 1 and enhancements array.');
}

for (const item of registry.enhancements || []) {
  if (!item.id) blockers.push('enhancement entry missing id.');
  if (!item.issue) blockers.push(`${item.id} missing issue.`);
  if (!Array.isArray(item.featureImpact)) blockers.push(`${item.id} missing featureImpact array.`);
  if (!item.sourceLifecycleRegistry || !existsRelative(item.sourceLifecycleRegistry)) {
    blockers.push(`${item.id} sourceLifecycleRegistry is missing or does not exist.`);
  }
  for (const doc of item.docsRequired || []) {
    if (!existsRelative(doc)) blockers.push(`${item.id} required doc is missing: ${doc}`);
  }
}

if (blockers.length > 0) fail('validate:registry', blockers);
pass('validate:registry', 'enhancement registry contract is valid');

