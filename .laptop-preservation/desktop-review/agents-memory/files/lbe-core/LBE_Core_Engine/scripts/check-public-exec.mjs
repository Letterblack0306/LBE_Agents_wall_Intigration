#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'release-exec');
const fail = message => { console.error(`[check-public-exec] ${message}`); process.exit(1); };

for (const name of ['src', 'test', 'tests', 'scripts', 'keys', 'data', 'node_modules', '.github']) {
    if (fs.existsSync(path.join(out, name))) fail(`forbidden path: ${name}`);
}

for (const file of [
    'dist/index.js',
    'dist/cli.js',
    'dist/lbe_engine.wasm',
    'dist/wasm.lock.json',
    'hooks/register.cjs',
    'README.md',
    'TRUST.md',
    'types.d.ts',
    'package.json',
    'LICENSE',
]) {
    if (!fs.existsSync(path.join(out, file))) fail(`missing ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
if (pkg.name !== '@letterblack/lbe-exec') fail(`wrong package name: ${pkg.name}`);
if (pkg.main !== 'dist/index.js') fail(`wrong main: ${pkg.main}`);
if (pkg.bin?.['lbe-exec'] !== 'dist/cli.js') fail('bin.lbe-exec must point to dist/cli.js');
if (pkg.exports?.['.']?.default !== './dist/index.js') fail('exports["."].default must point to ./dist/index.js');

const lock = JSON.parse(fs.readFileSync(path.join(out, 'dist/wasm.lock.json'), 'utf8'));
const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(out, 'dist/lbe_engine.wasm'))).digest('hex');
if (lock.wasm_sha256 !== actual) fail('WASM hash mismatch');

const cliSyntax = spawnSync(process.execPath, ['--check', path.join(out, 'dist', 'cli.js')], { stdio: 'inherit' });
if (cliSyntax.status !== 0) fail('dist/cli.js syntax check failed');

const indexText = fs.readFileSync(path.join(out, 'dist/index.js'), 'utf8');
const cliText = fs.readFileSync(path.join(out, 'dist/cli.js'), 'utf8');
const hookText = fs.readFileSync(path.join(out, 'hooks/register.cjs'), 'utf8');
for (const marker of ['../src/', '../bin/', '../scripts/', 'release-public/']) {
    if (indexText.includes(marker)) fail(`private marker in dist/index.js: ${marker}`);
    if (cliText.includes(marker)) fail(`private marker in dist/cli.js: ${marker}`);
    if (hookText.includes(marker)) fail(`private marker in hooks/register.cjs: ${marker}`);
}

// Verify hooks/register.cjs uses child_process (expected) and has no private path markers.
if (!hookText.includes('child_process')) fail('hooks/register.cjs missing child_process reference');
if (!hookText.includes('LBE_HOOK_ACTIVE')) fail('hooks/register.cjs missing LBE_HOOK_ACTIVE marker');

console.log('[check-public-exec] clean');
