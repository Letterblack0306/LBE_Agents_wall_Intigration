#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'release-manifest.json'), 'utf8'));
const outDir = path.join(root, 'release-public');
const distDir = path.join(outDir, 'dist');
const OS_METADATA_FILES = new Set(['Thumbs.db', '.DS_Store', 'Desktop.ini']);

function fail(message) {
    console.error(`[check-public-artifact] ${message}`);
    process.exit(1);
}

function runReadmeApprovalCheck() {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-readme-approval.mjs')], {
        cwd: root,
        stdio: 'inherit',
    });
    if (result.status !== 0) fail('README manual approval gate failed');
}

function walk(dir) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else found.push(full);
    }
    return found;
}

if (!fs.existsSync(distDir)) fail('missing release-public/dist');

// Tree-scan: forbidden paths in release-public/ dir.
// Exclude entries that are intentionally present for public-repo sync (publicRepoFiles).
const publicRepoAllowed = new Set(manifest.publicRepoFiles.map((p) => p.replace(/\/$/, '')));
const forbiddenPaths = manifest.forbiddenNpmPackedPaths
    .map((p) => p.replace(/\/$/, '').replace(/^\*\./, ''))
    .filter((p) => !publicRepoAllowed.has(p) && p !== 'map' && !p.startsWith('.env'));

for (const item of forbiddenPaths) {
    if (fs.existsSync(path.join(outDir, item))) {
        fail(`forbidden path leaked into release-public tree: ${item}`);
    }
}
// .env check separately (startsWith match)
for (const file of fs.readdirSync(outDir)) {
    if (file === '.env' || file.startsWith('.env.')) {
        fail(`env file leaked: ${file}`);
    }
}

const files = walk(outDir);
for (const file of files) {
    const rel = path.relative(outDir, file).replaceAll(path.sep, '/');
    if (OS_METADATA_FILES.has(path.basename(rel))) fail(`OS metadata leaked: ${rel}`);
    if (rel.endsWith('.map')) fail(`source map leaked: ${rel}`);
    if (rel.includes('/src/') || rel.startsWith('src/')) fail(`source path leaked: ${rel}`);
}

const wasmPath = path.join(distDir, 'lbe_engine.wasm');
const lockPath = path.join(distDir, 'wasm.lock.json');
if (!fs.existsSync(wasmPath)) fail('missing dist/lbe_engine.wasm');
if (!fs.existsSync(lockPath)) fail('missing dist/wasm.lock.json');

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const actualHash = crypto.createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
if (lock.wasm_sha256 !== actualHash) fail('WASM hash lock mismatch');
if (lock.entrypoint !== 'lbe_execute') fail('WASM lock does not require lbe_execute');

const wasm = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmPath)), {});
if (typeof wasm.exports.lbe_execute !== 'function') fail('WASM missing lbe_execute export');

const jsFiles = files.filter((file) => file.endsWith('.js'));

for (const file of jsFiles) {
    const rel = path.relative(outDir, file).replaceAll(path.sep, '/');
    const text = fs.readFileSync(file, 'utf8');
    for (const marker of manifest.forbiddenTextMarkers) {
        if (text.includes(marker)) {
            fail(`forbidden text marker "${marker}" in ${rel}`);
        }
    }
    // Internal path references that aren't in the text marker list
    for (const leaked of ['../src/', '../bin/', '../runtime/', 'payload.adapter']) {
        if (text.includes(leaked)) {
            fail(`internal path reference "${leaked}" in ${rel}`);
        }
    }
}

// Validate LICENSE content
const licenseFile = path.join(outDir, 'LICENSE');
if (!fs.existsSync(licenseFile)) fail('missing LICENSE');
const licenseText = fs.readFileSync(licenseFile, 'utf8');
const forbiddenLicensePlaceholders = ['SEE LICENSE IN LICENSE', 'TODO', 'TBD', 'placeholder', 'coming soon'];
for (const phrase of forbiddenLicensePlaceholders) {
    if (licenseText.includes(phrase)) {
        fail(`LICENSE contains invalid placeholder: "${phrase}"`);
    }
}

// Validate README content
const readmeFile = path.join(outDir, 'README.md');
if (!fs.existsSync(readmeFile)) fail('missing README.md');
const readmeText = fs.readFileSync(readmeFile, 'utf8');
const requiredReadmeCommands = [
    'npx --package @letterblack/lbe-core lbe',
    'npx --package @letterblack/lbe-core lbe init',
    'npx --package @letterblack/lbe-core lbe status',
    'npx --package @letterblack/lbe-core lbe proof',
];
for (const cmd of requiredReadmeCommands) {
    if (!readmeText.includes(cmd)) {
        fail(`README.md is missing supported CLI command: "${cmd}"`);
    }
}

const bareNpxCommandLines = readmeText
    .split(/\r?\n/)
    .filter((line) => {
        const trimmed = line.trim();
        return /^npx\s+lbe(\s|$)/.test(trimmed) && !trimmed.includes('--package');
    });
if (bareNpxCommandLines.length) {
    fail(`README.md contains unsupported bare npx command: "${bareNpxCommandLines[0].trim()}"`);
}

runReadmeApprovalCheck();

console.log(`[check-public-artifact] clean (${files.length} files, wasm ${fs.statSync(wasmPath).size} bytes)`);
