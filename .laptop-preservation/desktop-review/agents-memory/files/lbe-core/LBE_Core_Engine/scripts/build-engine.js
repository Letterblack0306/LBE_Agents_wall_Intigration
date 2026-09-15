#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = path.join(root, 'native', 'lbe-engine');
const outDir = path.join(root, 'runtime');
const builtWasm = path.join(crateDir, 'target', 'wasm32-unknown-unknown', 'release', 'lbe_engine.wasm');
const finalWasm = path.join(outDir, 'lbe_engine.wasm');

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd || root,
        stdio: 'inherit',
        shell: false
    });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

run('rustup', ['target', 'add', 'wasm32-unknown-unknown']);
run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: crateDir });

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(builtWasm, finalWasm);

const size = fs.statSync(finalWasm).size;
console.log(`Built ${path.relative(root, finalWasm)} (${size} bytes)`);
