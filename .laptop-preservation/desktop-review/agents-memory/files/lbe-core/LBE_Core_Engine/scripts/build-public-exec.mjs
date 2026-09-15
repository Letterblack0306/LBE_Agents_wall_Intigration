#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

// Block builds from any branch or worktree other than main head
{
    const guardPath = fileURLToPath(new URL('./mainhead-guard.mjs', import.meta.url));
    const guard = spawnSync(process.execPath, [guardPath], { stdio: 'inherit' });
    if (guard.status !== 0) process.exit(guard.status ?? 1);
}

// Proof gate — 12/12 must pass before any build artifact is produced
{
    const proofPath = fileURLToPath(new URL('../_proof.mjs', import.meta.url));
    const proof = spawnSync(process.execPath, [proofPath], { stdio: 'inherit' });
    if (proof.status !== 0) {
        console.error('[build-public-exec] BLOCKED: proof gate failed. Run: node _proof.mjs');
        process.exit(1);
    }
    console.log('[build-public-exec] proof gate passed');
}

function normalizeCliShebang(filePath) {
    let text = fs.readFileSync(filePath, 'utf8');
    // Remove BOM and any misplaced shebangs (esbuild banner can land after preamble).
    text = text.replace(/^﻿/, '');
    text = text.replace(/^#![^\n]*\n?/gm, '');
    // Shebang must be byte 0, line 1.
    text = `#!/usr/bin/env node\n${text.trimStart()}`;
    fs.writeFileSync(filePath, text, 'utf8');
    try { fs.chmodSync(filePath, 0o755); } catch { /* Windows may ignore chmod */ }
    const verify = fs.readFileSync(filePath, 'utf8');
    if (!verify.startsWith('#!/usr/bin/env node\n')) {
        throw new Error('dist/cli.js shebang is not at byte 0');
    }
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`[build-public-exec] missing required package file: ${path.relative(out, filePath)}`);
    }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'release-exec');
const dist = path.join(out, 'dist');
const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseState = readJsonIfExists(path.join(root, 'docs', 'RELEASE_STATE.json'));
const execVersion = process.env.LBE_EXEC_PACKAGE_VERSION
    || releaseState?.exec?.nextCorrectionVersion
    || sourcePackage.version;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(out, 'hooks'), { recursive: true });
// Bundle + minify the preload hook so implementation is not inspectable.
// Must stay CJS for --require. Node builtins are external (not bundled in).
await esbuild.build({
    entryPoints: [path.join(root, 'src', 'hooks', 'register.cjs')],
    bundle: true, platform: 'node', format: 'cjs', minify: true,
    outfile: path.join(out, 'hooks', 'register.cjs'),
    external: ['fs', 'path', 'events', 'child_process', 'node:*'],
});
await esbuild.build({ entryPoints: [path.join(root, 'exec', 'index.js')], bundle: true, platform: 'node', format: 'esm', minify: true, outfile: path.join(dist, 'index.js'), external: ['node:*', 'fs', 'path', 'crypto', 'child_process', 'url', 'tweetnacl', 'json-canonicalize'] });
await esbuild.build({ entryPoints: [path.join(root, 'exec', 'cli.js')], bundle: true, platform: 'node', format: 'esm', minify: true, outfile: path.join(dist, 'cli.js'), external: ['node:*', 'fs', 'path', 'crypto', 'child_process', 'url', 'readline', 'tweetnacl', 'json-canonicalize'] });
normalizeCliShebang(path.join(dist, 'cli.js'));
const cliSyntax = spawnSync(process.execPath, ['--check', path.join(dist, 'cli.js')], { stdio: 'inherit' });
if (cliSyntax.status !== 0) process.exit(cliSyntax.status ?? 1);
const wasm = path.join(root, 'runtime', 'lbe_engine.wasm');
fs.copyFileSync(wasm, path.join(dist, 'lbe_engine.wasm'));
fs.writeFileSync(path.join(dist, 'wasm.lock.json'), JSON.stringify({ wasm_sha256: hash(wasm), entrypoint: 'lbe_execute' }, null, 2) + '\n');
const assetsOut = path.join(out, 'assets');
fs.mkdirSync(assetsOut, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'assets'))) {
    fs.copyFileSync(path.join(root, 'assets', f), path.join(assetsOut, f));
}
fs.copyFileSync(path.join(root, 'release', 'exec-README.md'), path.join(out, 'README.md'));
fs.copyFileSync(path.join(root, 'release', 'exec-types.d.ts'), path.join(out, 'types.d.ts'));
fs.copyFileSync(path.join(root, 'release', 'TRUST.md'), path.join(out, 'TRUST.md'));
const license = path.join(root, 'LICENSE');
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(out, 'LICENSE'));
else fs.writeFileSync(path.join(out, 'LICENSE'), `${sourcePackage.license || 'SEE LICENSE IN LICENSE'}\n`);
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
    name: '@letterblack/lbe-exec',
    version: execVersion,
    description: 'Local host-signed execution layer for LetterBlack LBE.',
    type: 'module',
    main: 'dist/index.js',
    types: 'types.d.ts',
    exports: {
        '.': { types: './types.d.ts', default: './dist/index.js' },
        './hooks/register.cjs': './hooks/register.cjs',
    },
    bin: { 'lbe-exec': 'dist/cli.js' },
    files: ['dist/', 'hooks/', 'assets/', 'README.md', 'TRUST.md', 'types.d.ts', 'LICENSE'],
    dependencies: { tweetnacl: sourcePackage.dependencies.tweetnacl, 'json-canonicalize': sourcePackage.dependencies['json-canonicalize'] },
    license: sourcePackage.license,
    engines: sourcePackage.engines,
}, null, 2) + '\n');

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
    requireFile(path.join(out, file));
}

const generatedPackage = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
if (generatedPackage.version !== execVersion) {
    throw new Error(`[build-public-exec] package version mismatch: ${generatedPackage.version} !== ${execVersion}`);
}
if (generatedPackage.bin?.['lbe-exec'] !== 'dist/cli.js') {
    throw new Error('[build-public-exec] bin.lbe-exec must point to dist/cli.js');
}
if (generatedPackage.exports?.['.']?.default !== './dist/index.js') {
    throw new Error('[build-public-exec] exports["."].default must point to ./dist/index.js');
}

console.log(`[build-public-exec] wrote release-exec @letterblack/lbe-exec@${execVersion}`);
