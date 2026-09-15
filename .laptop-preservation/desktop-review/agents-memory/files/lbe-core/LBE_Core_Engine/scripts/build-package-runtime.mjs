#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const cliOut = path.join(distDir, 'cli');
const hooksOut = path.join(distDir, 'hooks');
const stateOut = path.join(distDir, 'state');
const runtimeDir = path.join(root, 'runtime');

function rmrf(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

function mkdir(target) {
    fs.mkdirSync(target, { recursive: true });
}

function copyFile(from, to) {
    mkdir(path.dirname(to));
    fs.copyFileSync(from, to);
}

function writeText(to, content) {
    mkdir(path.dirname(to));
    fs.writeFileSync(to, content, 'utf8');
}

rmrf(distDir);
mkdir(cliOut);
mkdir(hooksOut);
mkdir(stateOut);

// Public-safe CLI: only the commands exposed in the public release.
// No internal symbols, no crypto identifiers, no source path comments.
// WASM is loaded from the same directory as this file (dist/cli/).
writeText(path.join(cliOut, 'lbe.js'), `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(here, 'lbe_engine.wasm');

let _instance;
function load() {
  if (_instance) return _instance;
  const buf = fs.readFileSync(wasmPath);
  const mod = new WebAssembly.Module(buf);
  const inst = new WebAssembly.Instance(mod, {});
  if (typeof inst.exports.lbe_execute !== 'function')
    throw new Error('LBE runtime: missing execute entrypoint');
  _instance = inst;
  return _instance;
}

function mem(inst) { return new Uint8Array(inst.exports.memory.buffer); }

function readOut(inst) {
  const m = mem(inst);
  const ptr = inst.exports.lbe_out_ptr();
  const max = inst.exports.lbe_buf_size();
  let end = ptr;
  while (m[end] !== 0 && end - ptr < max) end++;
  return new TextDecoder().decode(m.slice(ptr, end));
}

function execute(input) {
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  const inst = load();
  const bytes = new TextEncoder().encode(input);
  const max = inst.exports.lbe_buf_size();
  if (bytes.length + 1 > max) throw new Error('input exceeds runtime buffer');
  const m = mem(inst);
  const ptr = inst.exports.lbe_in_ptr();
  m.set(bytes, ptr);
  m[ptr + bytes.length] = 0;
  inst.exports.lbe_execute();
  return readOut(inst);
}

const cmd = process.argv[2];
const cwd = process.cwd();
const policyFile = path.join(cwd, 'lbe.policy.json');
const lbeDir = path.join(cwd, '.lbe');

function readPolicy() {
  if (!fs.existsSync(policyFile)) return null;
  return JSON.parse(fs.readFileSync(policyFile, 'utf8'));
}
function writePolicy(p) {
  fs.writeFileSync(policyFile, JSON.stringify(p, null, 2) + '\\n', 'utf8');
}
function ensurePolicy() {
  if (fs.existsSync(policyFile)) return readPolicy();
  const p = { version: 1, mode: 'observe', workspace: cwd, rules: [] };
  writePolicy(p);
  return p;
}

if (cmd === 'init') {
  fs.mkdirSync(lbeDir, { recursive: true });
  const policy = ensurePolicy();
  const isNew = policy.rules.length === 0 && policy.mode === 'observe';
  process.stdout.write('\\n  LBE initialised.\\n\\n');
  process.stdout.write('  mode:      ' + policy.mode + '\\n');
  process.stdout.write('  policy:    lbe.policy.json\\n');
  process.stdout.write('  audit log: .lbe/audit.jsonl\\n\\n');
  if (isNew) {
    process.stdout.write('  Observer mode is on — LBE is watching but not blocking.\\n');
    process.stdout.write("  Run 'npx lbe enforce' when you are ready to block actions.\\n\\n");
  }
  process.exit(0);
}

if (cmd === 'observe') {
  const policy = ensurePolicy();
  policy.mode = 'observe';
  writePolicy(policy);
  process.stdout.write('Observer mode on — LBE is watching silently. Nothing is blocked.\\n');
  process.exit(0);
}

if (cmd === 'enforce') {
  const policy = ensurePolicy();
  policy.mode = 'enforce';
  writePolicy(policy);
  process.stdout.write('Enforcement on — LBE will now block actions that violate policy.\\n');
  process.exit(0);
}

if (cmd === 'policy') {
  const policy = readPolicy();
  if (!policy) {
    process.stdout.write("No policy yet. Run 'npx lbe init' first.\\n");
    process.exit(0);
  }
  process.stdout.write('\\n  mode: ' + policy.mode + '\\n');
  process.stdout.write('  rules (' + policy.rules.length + '):\\n\\n');
  if (policy.rules.length === 0)
    process.stdout.write('  No rules yet. LBE learns from your conversation.\\n');
  for (const r of policy.rules) {
    const label = r.effect === 'deny' ? '  block' : '  allow';
    process.stdout.write(label + '  ' + r.pattern + '\\n');
    process.stdout.write('         from: ' + r.from + '\\n\\n');
  }
  process.exit(0);
}

if (cmd === 'status') {
  const policy = readPolicy();
  process.stdout.write('runtime:  ok\\n');
  process.stdout.write('mode:     ' + (policy?.mode ?? 'not initialised') + '\\n');
  process.stdout.write('rules:    ' + (policy?.rules?.length ?? 0) + '\\n');
  const auditLog = path.join(lbeDir, 'audit.jsonl');
  if (fs.existsSync(auditLog)) {
    const lines = fs.readFileSync(auditLog, 'utf8').trim().split('\\n').filter(Boolean);
    process.stdout.write('audit:    ' + lines.length + ' entries\\n');
  } else {
    process.stdout.write('audit:    no entries yet\\n');
  }
  process.exit(0);
}

if (cmd === 'execute') {
  async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  }
  let input = '';
  const inputFlag = process.argv.indexOf('--input');
  if (inputFlag >= 0) {
    const file = process.argv[inputFlag + 1];
    if (!file) { process.stderr.write('--input requires a file path\\n'); process.exit(2); }
    input = fs.readFileSync(file, 'utf8');
  } else {
    input = await readStdin();
  }
  try {
    const output = execute(input);
    process.stdout.write(output + '\\n');
    const parsed = JSON.parse(output);
    if (parsed?.result?.type === 'allowed') process.exit(0);
    if (parsed?.result?.type === 'denied') process.exit(1);
    process.exit(2);
  } catch (err) {
    process.stderr.write(String(err?.message ?? err) + '\\n');
    process.exit(2);
  }
}

if (!cmd) {
  process.stdout.write('\\nUsage:\\n');
  process.stdout.write('  npx lbe init       Set up LBE in this project\\n');
  process.stdout.write('  npx lbe status     Show current mode and rule count\\n');
  process.stdout.write('  npx lbe policy     List all rules\\n');
  process.stdout.write('  npx lbe observe    Switch to observer mode (watch, never block)\\n');
  process.stdout.write('  npx lbe enforce    Switch to enforcement mode (block violations)\\n');
  process.stdout.write('  npx lbe execute    Run a raw JSON request (advanced)\\n\\n');
  process.exit(0);
}

process.stderr.write('Unknown command: ' + cmd + "\\nRun 'npx lbe' for usage.\\n");
process.exit(2);
`);

await esbuild.build({
    entryPoints: [path.join(root, 'src', 'cli', 'main.js')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: path.join(cliOut, 'lbe.js'),
    banner: { js: '#!/usr/bin/env node' },
    external: ['fs', 'path', 'url', 'os', 'crypto', 'child_process', 'tweetnacl', 'json-canonicalize'],
    minify: true,
    legalComments: 'none',
    sourcemap: false,
});

// Minify + mangle the hook and its state dependencies into a single CJS bundle.
// register.cjs requires ../state/index.cjs and ../state/appendCentral.cjs at
// runtime — bundling inlines both so no readable state/ files ship separately.
// legalComments:'none' + minify strips all source-path comments and identifiers.
await esbuild.build({
    entryPoints: [path.join(root, 'src', 'hooks', 'register.cjs')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(hooksOut, 'register.cjs'),
    external: ['fs', 'path', 'events', 'stream', 'os', 'crypto', 'child_process'],
    minify: true,
    legalComments: 'none',
    sourcemap: false,
    // Mangle internal state-module export properties so they don't appear
    // as readable names in the bundled output. These names only exist within
    // this bundle — they don't appear on any external (Node.js built-in) API.
    mangleProps: /^(workspaceStateDir|stateRoot|workspaceId|setNativeUnlink|appendJsonlSync|resolveWorkspaceStateSyncCjs)$/,
});

const engineWasm = path.join(runtimeDir, 'lbe_engine.wasm');
if (!fs.existsSync(engineWasm)) {
    throw new Error(`Missing runtime engine artifact: ${engineWasm}`);
}
copyFile(engineWasm, path.join(cliOut, 'lbe_engine.wasm'));
copyFile(path.join(root, 'src', 'state', 'index.cjs'), path.join(stateOut, 'index.cjs'));
copyFile(path.join(root, 'src', 'state', 'appendCentral.cjs'), path.join(stateOut, 'appendCentral.cjs'));

console.log('[build-package-runtime] wrote dist/ runtime boundary (public CLI + mangled hook bundle)');
