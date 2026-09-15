#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = path.join(root, 'runtime', 'lbe_engine.wasm');

if (!fs.existsSync(wasmPath)) {
    console.error(`Missing compiled engine: ${path.relative(root, wasmPath)}`);
    console.error('Run: npm run build:engine');
    process.exit(1);
}

const bytes = fs.readFileSync(wasmPath);
const module = new WebAssembly.Module(bytes);
const instance = new WebAssembly.Instance(module, {});

if (typeof instance.exports.lbe_policy_decision !== 'function') {
    console.error('Compiled engine missing lbe_policy_decision export');
    process.exit(1);
}
if (typeof instance.exports.lbe_schema_decision !== 'function') {
    console.error('Compiled engine missing lbe_schema_decision export');
    process.exit(1);
}

const decision = instance.exports.lbe_policy_decision(1, 1, 1, 1, 0, 0, 1, 0, 0, 1);
if (decision !== 0) {
    console.error(`Compiled engine returned unexpected allow decision: ${decision}`);
    process.exit(1);
}

const schemaDecision = instance.exports.lbe_schema_decision(
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1
);
if (schemaDecision !== 0) {
    console.error(`Compiled engine returned unexpected schema decision: ${schemaDecision}`);
    process.exit(1);
}

console.log(`Compiled engine OK: ${path.relative(root, wasmPath)} (${bytes.length} bytes)`);
