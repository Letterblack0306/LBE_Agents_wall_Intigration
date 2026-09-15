#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = (msg) => { console.error("[GUARD FAILED] $" + msg); process.exit(1); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mirrorRoot = path.join(root, 'release-public');

// 1. release-authority-doc-guard
if (!fs.existsSync(path.join(root, 'docs', 'RELEASE_AUTHORITY.md'))) fail('Core missing docs/RELEASE_AUTHORITY.md');
if (!fs.existsSync(path.join(root, 'docs', 'RELEASE_STATE.json'))) fail('Core missing docs/RELEASE_STATE.json');

// 2. package-layout-authority-guard
const corePkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const mirrorPkg = JSON.parse(fs.readFileSync(path.join(mirrorRoot, 'package.json'), 'utf8'));

if (corePkg.main !== 'index.js') fail('Core package.json main must be index.js');
if (corePkg.bin.lbe !== 'bin/lbe.js') fail('Core package.json bin must be bin/lbe.js');
if (mirrorPkg.main !== 'dist/index.js') fail('Mirror package.json main must be dist/index.js');
if (mirrorPkg.bin.lbe !== 'dist/cli.js') fail('Mirror package.json bin must be dist/cli.js');

// 3. duplicate-release-authority-guard & public-mirror-publish-guard
const coreWorkflowPath = path.join(root, '.github', 'workflows', 'release.yml');
if (fs.existsSync(coreWorkflowPath)) {
    const coreWorkflow = fs.readFileSync(coreWorkflowPath, 'utf8');
    if (!coreWorkflow.includes('npm publish')) fail('Core release workflow missing npm publish command');
}

const mirrorWorkflowDir = path.join(mirrorRoot, '.github', 'workflows');
if (fs.existsSync(mirrorWorkflowDir)) {
    for (const file of fs.readdirSync(mirrorWorkflowDir)) {
        if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
        const content = fs.readFileSync(path.join(mirrorWorkflowDir, file), 'utf8');
        
        if (content.includes('npm publish')) fail("Mirror workflow $" + file + " contains forbidden 'npm publish'");
        if (content.includes('NPM_TOKEN')) fail("Mirror workflow $" + file + " contains forbidden 'NPM_TOKEN'");
        if (content.includes('gh release create')) fail("Mirror workflow $" + file + " contains forbidden 'gh release create'");
        if (content.includes('gh release upload')) fail("Mirror workflow $" + file + " contains forbidden 'gh release upload'");
        if (content.includes('on: push:\n    tags:')) fail("Mirror workflow $" + file + " contains forbidden 'push tags' trigger");
    }
}

console.log('[mainhead-guard] PASS: Release authority boundaries are strictly enforced.');
