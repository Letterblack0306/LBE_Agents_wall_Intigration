#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvalPath = path.join(root, '.governance', 'PUBLIC_README_APPROVAL.json');
const packagePath = path.join(root, 'package.json');

function fail(message) {
    console.error(`[check-readme-approval] HARD STOP: ${message}`);
    process.exit(1);
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        fail(`cannot read valid JSON from ${path.relative(root, file)}: ${error.message}`);
    }
}

if (!fs.existsSync(approvalPath)) fail('missing .governance/PUBLIC_README_APPROVAL.json');

const approval = readJson(approvalPath);
const pkg = readJson(packagePath);

if (approval.version !== 1) fail('README approval marker must use version 1');
if (approval.approved !== true) fail('README approval marker is not approved');
if (!approval.approvedBy) fail('README approval marker must record approvedBy');
if (!approval.approvedAt) fail('README approval marker must record approvedAt');
if (approval.packageVersion !== pkg.version) {
    fail(`README approval packageVersion ${approval.packageVersion} does not match package.json ${pkg.version}`);
}

const readmeRel = approval.readmePath || 'release-public/README.md';
const readmePath = path.join(root, readmeRel);
if (!fs.existsSync(readmePath)) fail(`approved README path is missing: ${readmeRel}`);

const readmeRaw = fs.readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n'); // normalize line endings
const actualHash = crypto.createHash('sha256').update(readmeRaw).digest('hex');
if (approval.sha256 !== actualHash) {
    fail(`README changed without matching manual approval marker: ${readmeRel}`);
}

const requiredRules = [
    'manually reviewed public-facing copy',
    'must not rewrite product claims automatically',
    'inspected by a human before npm publish or public mirror sync',
    'Do not expose internal validation mechanics',
    'Keep detailed mechanics in docs'
];
const rulesText = Array.isArray(approval.rules) ? approval.rules.join('\n') : '';
for (const rule of requiredRules) {
    if (!rulesText.includes(rule)) fail(`README approval marker missing rule: ${rule}`);
}

console.log(`[check-readme-approval] PASS: ${readmeRel} approved for ${pkg.version}`);

