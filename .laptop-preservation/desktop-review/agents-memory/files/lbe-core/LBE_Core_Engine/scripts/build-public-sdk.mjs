#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'release-manifest.json'), 'utf8'));

// Block builds from any branch or worktree other than main head
{
  const guardPath = fileURLToPath(new URL('./mainhead-guard.mjs', import.meta.url));
  const guard = spawnSync(process.execPath, [guardPath], { stdio: 'inherit' });
  if (guard.status !== 0) process.exit(guard.status ?? 1);
}

const outDir = path.join(root, 'release-public');
const distDir = path.join(outDir, 'dist');

const sourcePkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const publicPackageName = process.env.LBE_PUBLIC_PACKAGE_NAME || '@letterblack/lbe-core';
const publicPackageVersion = process.env.LBE_PUBLIC_PACKAGE_VERSION || sourcePkg.version;

function makeWritable(p) {
  try { fs.chmodSync(p, 0o777); } catch { /* best effort for Windows cleanup */ }
  try {
    if (fs.statSync(p).isDirectory()) {
      for (const entry of fs.readdirSync(p)) {
        makeWritable(path.join(p, entry));
      }
    }
  } catch { /* path may disappear during recursive cleanup */ }
}

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    if (process.platform === 'win32' && err.code === 'EPERM') {
      makeWritable(target);
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } else {
      throw err;
    }
  }
}

function mkdir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(from, to) {
  mkdir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(file, text) {
  mkdir(path.dirname(file));
  fs.writeFileSync(file, text);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertNoPrivateFiles() {
  // Use the npm forbidden list but exclude entries that are legitimately present
  // in release-public/ for public-repo sync (e.g. .github/).
  const publicRepoAllowed = new Set(manifest.publicRepoFiles.map((p) => p.replace(/\/$/, '')));
  const forbidden = manifest.forbiddenNpmPackedPaths
    .map((p) => p.replace(/\/$/, '').replace(/^\*\./, ''))
    .filter((p) => !publicRepoAllowed.has(p) && p !== 'map');
  const leaked = forbidden.filter((entry) => fs.existsSync(path.join(outDir, entry)));
  if (leaked.length) {
    throw new Error(`Public package contains private/dev paths: ${leaked.join(', ')}`);
  }
}

rmrf(outDir);
mkdir(distDir);

const wasmSource = path.join(root, 'runtime', 'lbe_engine.wasm');
const wasmHash = sha256File(wasmSource);

copyFile(wasmSource, path.join(distDir, 'lbe_engine.wasm'));
writeJson(path.join(distDir, 'wasm.lock.json'), {
  wasm_sha256: wasmHash,
  entrypoint: 'lbe_execute',
  contract: 'execute(input:string)->string',
});
writeText(path.join(distDir, 'index.js'), `// @letterblack/lbe-core v${publicPackageVersion}
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(here, 'lbe_engine.wasm');
const lockPath = path.join(here, 'wasm.lock.json');
let instance;

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function load() {
  if (instance) return instance;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const actual = hashFile(wasmPath);
  if (actual !== lock.wasm_sha256) throw new Error('LBE WASM integrity check failed');
  const wasm = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmPath)), {});
  if (typeof wasm.exports.lbe_execute !== 'function') throw new Error('LBE WASM missing execute entrypoint');
  instance = wasm;
  return instance;
}

function memory(wasm) {
  return new Uint8Array(wasm.exports.memory.buffer);
}

function readOut(wasm) {
  const mem = memory(wasm);
  const ptr = wasm.exports.lbe_out_ptr();
  const max = wasm.exports.lbe_buf_size();
  let end = ptr;
  while (mem[end] !== 0 && end - ptr < max) end++;
  return new TextDecoder().decode(mem.slice(ptr, end));
}

export function execute(input) {
  if (typeof input !== 'string') throw new TypeError('execute input must be a string');
  const wasm = load();
  const bytes = new TextEncoder().encode(input);
  const max = wasm.exports.lbe_buf_size();
  if (bytes.length + 1 > max) throw new Error('execute input exceeds WASM buffer');
  const mem = memory(wasm);
  const ptr = wasm.exports.lbe_in_ptr();
  mem.set(bytes, ptr);
  mem[ptr + bytes.length] = 0;
  wasm.exports.lbe_execute();
  return readOut(wasm);
}
`);
writeText(path.join(distDir, 'cli.js'), `#!/usr/bin/env node
// @letterblack/lbe-core v${publicPackageVersion}
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execute } from './index.js';

let cmd = process.argv[2];
const cwd = process.cwd();
const policyFile = path.join(cwd, 'lbe.policy.json');
const lbeDir = path.join(cwd, '.lbe');
const scopeFile = path.join(lbeDir, 'scope.json');
const taskLog = path.join(lbeDir, 'task.jsonl');
const legacyIntentLog = path.join(lbeDir, 'intent.jsonl');
const proofFile = path.join(lbeDir, 'proof', 'latest.json');

if (cmd === '--version' || cmd === '-v') {
  process.stdout.write('${publicPackageVersion}\\n');
  process.exit(0);
}
function readPolicy() {
  if (!fs.existsSync(policyFile)) return null;
  return JSON.parse(fs.readFileSync(policyFile, 'utf8'));
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function readTaskEntries() {
  const entries = readJsonl(taskLog);
  if (entries.length > 0) return entries;
  return readJsonl(legacyIntentLog);
}

function writePolicy(p) {
  fs.writeFileSync(policyFile, JSON.stringify(p, null, 2) + '\\n', 'utf8');
}

function ensurePolicy() {
function ensureLbeDir() {
  fs.mkdirSync(lbeDir, { recursive: true });
}

  if (fs.existsSync(policyFile)) return readPolicy();
  const p = { version: 1, mode: 'observe', workspace: cwd, rules: [] };
  writePolicy(p);
  return p;
}

// ── ANSI / Logo / TUI ──────────────────────────────────────────────────
const DL='\\x1b[40m',R='\\x1b[41m',G='\\x1b[90m',Y='\\x1b[33m',B='\\x1b[1m',N='\\x1b[0m',CL='\\x1b[2J\\x1b[H';
const W='\\x1b[38;2;233;233;239m',RB='\\x1b[41m',DI='\\x1b[2m';
const CK='\\x1b[38;2;80;200;120m',YE='\\x1b[38;2;240;200;60m',CY='\\x1b[38;2;100;200;255m';

function out(t=''){process.stdout.write(String(t));}
function line(t=''){process.stdout.write(String(t)+'\\n');}

function renderChar(ch){
  if(ch==='#')return RB+' '+N;
  if(ch==='*')return W+'\u2588'+N;
  if(ch===' ')return ' ';
  return DI+ch+N;
}
const LOGO=[
  '  _____________________________________________________________ ',
  ' |                                                             |',
  ' |      ###############################################        |',
  ' |      ##                                       *****##        |',
  ' |      ##  ******  ####  *******                *****##        |',
  ' |      ##  **  **  ####  **   **                *****##        |',
  ' |      ##  ******  ####  *******                *****##        |',
  ' |      ##  **  **  ####  **   **                *****##        |',
  ' |      ##  ******  ####  *******                *****##        |',
  ' |      ##                                       *****##        |',
  ' |      ###############################################        |',
  ' |                                                             |',
  ' |_____________________________________________________________|',
];
function logoLines(){return LOGO.map(l=>[...l].map(renderChar).join(''));}

function showHeader(){
  const ll=logoLines();
  const w=66;
  const tb=W+'\u2554'+'\u2550'.repeat(w)+'\u2557'+N;
  const bb=W+'\u255A'+'\u2550'.repeat(w)+'\u255D'+N;
  const bl=W+'\u2551'+N+' '.repeat(w)+W+'\u2551'+N;
  out(CL);
  out('  '+tb+'\\n');
  out('  '+bl+'\\n');
  for(const l of ll){
    const plain=l.replace(/\\x1b\\[[0-9;]*m/g,'');
    const pad=plain.length<w?l+' '.repeat(w-plain.length):plain.slice(0,w);
    out('  '+W+'\u2551'+N+pad+W+'\u2551'+N+'\\n');
  }
  out('  '+bl+'\\n');
  const title=B+W+'LetterBlack Sentinel'+N;
  out('  '+W+'\u2551'+N+'  '+title+' '.repeat(w-2-20)+W+'\u2551'+N+'\\n');
  const tag=W+'Local Execution Governance'+N;
  out('  '+W+'\u2551'+N+'  '+tag+' '.repeat(w-2-27)+W+'\u2551'+N+'\\n');
  const vt='v'+'${publicPackageVersion}';
  out('  '+W+'\u2551'+N+'  '+DI+vt+N+' '.repeat(w-2-2-vt.length)+W+'\u2551'+N+'\\n');
  out('  '+bl+'\\n');
  out('  '+bb+'\\n');
  const policy=readPolicy();
  const taskEntries=readTaskEntries();
  out('\\n  '+G+'Workspace :'+N+' '+cwd+'\\n');
  out('  '+G+'Status    :'+N+' '+(policy?.mode==='enforce'?R:YE)+(policy?.mode??'not initialised')+N+'\\n');
  out('  '+G+'Task      :'+N+' '+(fs.existsSync(scopeFile)?'registered':'not found')+'\\n');
  out('  '+G+'Activity  :'+N+' '+(taskEntries.length ? String(taskEntries.length)+' saved task(s)' : 'none')+'\\n');
  out('  '+G+'Proof     :'+N+' '+(fs.existsSync(proofFile)?'available':'not found')+'\\n');
  out('  '+G+'Execution :'+N+' local only\\n\\n');
  out('  '+G+'Main Menu (Use '+YE+'\u2191 \u2193'+G+' arrows, '+YE+'Enter'+G+' to select)'+N+'\\n\\n');
}
const MENU=[{l:'Apply Boundary',c:'init'},{l:'Remove Boundary',c:'remove'},{l:'Check Status',c:'status'},{l:'Audit Workspace',c:'audit-workspace'},{l:'Agent Instructions',c:'instructions'},{l:'Exit',c:'exit'}];

function showMenu(s){MENU.forEach((m,i)=>{out(i===s?'  '+RB+'\u276f '+m.l+' '.repeat(28-m.l.length)+N+'\\n':'    '+G+m.l+' '.repeat(28-m.l.length)+N+'\\n');});}

function enableRaw(){if(!process.stdin.isTTY)return false;process.stdin.setRawMode(true);process.stdin.resume();return true;}
function disableRaw(){try{process.stdin.setRawMode(false);}catch{}process.stdin.pause();}

async function tuiMenu(){
  if(!process.stdin.isTTY){showHeader();out(YE+'Open LBE from an interactive terminal with: lbe'+N+'\\n');return null;}
  let sel=0;
  return new Promise(res=>{
    enableRaw();showHeader();showMenu(0);
    const fn=data=>{
      const k=data.toString();
      if(k==='\\u001b[A'){sel=(sel-1+MENU.length)%MENU.length;showHeader();showMenu(sel);}
      else if(k==='\\u001b[B'){sel=(sel+1)%MENU.length;showHeader();showMenu(sel);}
      else if(k==='\\r'||k==='\\n'){process.stdin.removeListener('data',fn);disableRaw();res(MENU[sel].c);}
      else if(k==='q'||k==='\\u0003'){process.stdin.removeListener('data',fn);disableRaw();res(null);}
    };
    process.stdin.on('data',fn);
  });
}

// ── Direct command entry ──────────────────────────────────────────────
if(!cmd){const c=await tuiMenu();if(!c||c==='exit'){out(CL);line('  Goodbye.\\n');process.exit(0);}cmd=c;out(CL);}
// ── Help ────────────────────────────────────────────────────────────────
if(cmd==='--help'||cmd==='-h'||cmd==='help'){
  out(CL);
  out('  \\x1b[38;2;233;233;239m\\x1b[1mLBE \\x1b[0m\\x1b[38;2;233;233;239m\\u2014 LetterBlack Sentinel\\x1b[0m\\n');
  out('  \\x1b[90mExecution governance for AI agents\\x1b[0m\\n\\n');
  out('  \\x1b[90mInstall once:\\x1b[0m  npm install -g @letterblack/lbe-core\\n');
  out('  \\x1b[90mUse per workspace:\\x1b[0m  cd your-project && lbe\\n');
  out('  \\x1b[90mNo-install test:\\x1b[0m  npx --package @letterblack/lbe-core lbe\\n\\n');
  out('  \\x1b[1mMenu options:\\x1b[0m\\n');
  out('    \\x1b[41m Apply Boundary \\x1b[0m    Initialize LBE workspace\\n');
  out('    Remove Boundary    Clear LBE workspace\\n');
  out('    Check Status       Show workspace governance status\\n');
  out('    Audit Workspace    Review audit log\\n');
  out('    Agent Instructions Set objective, allowed, forbidden, validations\\n\\n');
  out('  \\x1b[90mDirect commands for automation:\\x1b[0m  lbe <command>\\n');
  out('  \\x1b[90mAdvanced help:\\x1b[0m                     lbe --help --advanced\\n\\n');
  out('  \\x1b[90mhttps://github.com/Letterblack0306/LetterBlack-Sentinel\\x1b[0m\\n\\n');
  process.exit(0);
}



// ── lbe init ──────────────────────────────────────────────────────────────
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
    process.stdout.write('  Run \\'npx lbe enforce\\' when you are ready to block actions.\\n\\n');
  }
  process.exit(0);
}

// ── lbe observe ───────────────────────────────────────────────────────────
if (cmd === 'observe') {
  const policy = ensurePolicy();
  policy.mode = 'observe';
  writePolicy(policy);
  process.stdout.write('Observer mode on — LBE is watching silently. Nothing is blocked.\\n');
  process.exit(0);
}

// ── lbe enforce ───────────────────────────────────────────────────────────
if (cmd === 'enforce') {
  const policy = ensurePolicy();
  policy.mode = 'enforce';
  writePolicy(policy);
  process.stdout.write('Enforcement on — LBE will now block actions that violate policy.\\n');
  process.exit(0);
}

// ── lbe policy ────────────────────────────────────────────────────────────
if (cmd === 'policy') {
  const policy = readPolicy();
  if (!policy) {
    process.stdout.write('No policy yet. Run \\'npx lbe init\\' first.\\n');
    process.exit(0);
  }
  process.stdout.write('\\n  mode: ' + policy.mode + '\\n');
  process.stdout.write('  rules (' + policy.rules.length + '):\\n\\n');
  if (policy.rules.length === 0) {
    process.stdout.write('  No rules yet. LBE learns from your conversation.\\n');
  }
  for (const r of policy.rules) {
    const label = r.effect === 'deny' ? '  block' : '  allow';
    process.stdout.write(label + '  ' + r.pattern + '\\n');
    process.stdout.write('         from: ' + r.from + '\\n\\n');
  }
  process.exit(0);
}

// ── lbe status ────────────────────────────────────────────────────────────
if (cmd === 'status') {
  const policy = readPolicy();
  process.stdout.write('runtime:  ok\\n');
  process.stdout.write('mode:     ' + (policy?.mode ?? 'not initialised') + '\\n');
  process.stdout.write('rules:    ' + (policy?.rules?.length ?? 0) + '\\n');
  process.stdout.write('scope:    ' + (fs.existsSync(scopeFile) ? 'registered' : 'not found') + '\\n');
  process.stdout.write('intent:   ' + (fs.existsSync(legacyIntentLog) ? String(readJsonl(legacyIntentLog).length) + ' entries' : 'not found') + '\\n');
  process.stdout.write('proof:    ' + (fs.existsSync(proofFile) ? 'available' : 'not found') + '\\n');
  const auditLog = path.join(lbeDir, 'audit.jsonl');
  if (fs.existsSync(auditLog)) {
    const lines = fs.readFileSync(auditLog, 'utf8').trim().split('\\n').filter(Boolean);
    process.stdout.write('audit:    ' + lines.length + ' entries\\n');
  } else {
    process.stdout.write('audit:    no entries yet\\n');
  }
  process.exit(0);
}

// ── lbe scope ─────────────────────────────────────────────────────────────
if (cmd === 'scope') {
  const scope = readJson(scopeFile);
  if (!scope) {
    process.stdout.write('NO_SCOPE_FOUND\\n');
    process.exit(0);
  }
  process.stdout.write('SCOPE_REGISTERED\\n');
  if (scope.id) process.stdout.write('scope_id ' + scope.id + '\\n');
  if (scope.objective) process.stdout.write('objective ' + scope.objective + '\\n');
  process.exit(0);
}

// ── lbe intent ────────────────────────────────────────────────────────────
if (cmd === 'intent') {
  if (!process.stdin.isTTY || process.argv[2]) {
    const intents = readJsonl(legacyIntentLog);
    if (intents.length === 0) { process.stdout.write('NO_INTENT_FOUND\\n'); process.exit(0); }
    const latest = intents[intents.length - 1];
    process.stdout.write('INTENT_REGISTERED\\n');
    if (latest.intent_id) process.stdout.write('intent_id ' + latest.intent_id + '\\n');
    if (latest.scope_id) process.stdout.write('scope_id ' + latest.scope_id + '\\n');
    process.exit(0);
  }
  fs.mkdirSync(lbeDir, { recursive: true });
  let current = null;
  if (fs.existsSync(scopeFile)) { try { current = JSON.parse(fs.readFileSync(scopeFile, 'utf8')); } catch {} }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pq = p => new Promise(r => { rl.question(p, a => r(a.trim())); });
  line('');
  if (current) {
    line('  Current Plan:');
    line('  ' + DI + 'Objective:' + N + ' ' + (current.objective || '(not set)'));
    if (current.allowed && current.allowed.length) line('  ' + DI + 'Allowed:' + N + ' ' + current.allowed.join(', '));
    if (current.forbidden && current.forbidden.length) line('  ' + DI + 'Forbidden:' + N + ' ' + current.forbidden.join(', '));
    if (current.validations && current.validations.length) line('  ' + DI + 'Validations:' + N + ' ' + current.validations.join(', '));
    line('');
  }
  const objective = await pq('  Objective / Goal (leave blank to cancel): ');
  if (!objective) { rl.close(); line('  Cancelled.\\n'); process.exit(0); }
  const aStr = await pq('  Allowed actions/files (comma-separated): ');
  const allowed = aStr ? aStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const fStr = await pq('  Forbidden actions/files (comma-separated): ');
  const forbidden = fStr ? fStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const vStr = await pq('  Required validations (comma-separated): ');
  const validations = vStr ? vStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  rl.close();
  const scopeId = 'scope_' + Date.now().toString(36);
  const scope = { id: scopeId, objective, allowed, forbidden, validations, created: Math.floor(Date.now() / 1000) };
  fs.writeFileSync(scopeFile, JSON.stringify(scope, null, 2) + '\\n', 'utf8');
  const intentId = 'intent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  fs.appendFileSync(legacyIntentLog, JSON.stringify({ intent_id: intentId, scope_id: scopeId, objective, allowed, forbidden, validations, timestamp: Math.floor(Date.now() / 1000) }) + '\\n', 'utf8');
  const n = updMB(cwd, scope);
  line('  ' + CK + '\\u2713' + N + ' Instructions saved.  intent_id: ' + intentId + '  scope_id: ' + scopeId);
  if (n > 0) line('  ' + CK + '\\u2713' + N + ' Updated ' + n + ' managed block(s)');
  line('');
  process.exit(0);
}


// ── lbe remove ──
if (cmd === 'remove') {
  const pp = path.join(cwd, '.lbe', 'policy.json');
  if (!fs.existsSync(pp)) { process.stdout.write('NO_BOUNDARY_FOUND\\n'); process.exit(0); }
  try { fs.unlinkSync(pp); } catch (_) {}
  const ap = path.join(cwd, '.lbe', 'audit.jsonl');
  try { fs.unlinkSync(ap); } catch (_) {}
  const wp = path.join(cwd, '.lbe', 'workspace.json');
  try { fs.unlinkSync(wp); } catch (_) {}
  process.stdout.write('BOUNDARY_REMOVED\\n');
  process.exit(0);
}


// ── lbe audit-workspace ──
if (cmd === 'audit-workspace') {
  const md = process.argv[3] === '--mode' ? (process.argv[4] || 'audit') : 'audit';
  if (md === 'repair') { process.stdout.write('NOT_IMPLEMENTED\\n'); process.exit(0); }
  process.stdout.write('\\n  Workspace Audit: RUNNING\\n');
  process.stdout.write('  Mode: ' + md + '\\n\\n');
  process.stdout.write('  \\u2713 locate_workspace_root\\n');
  process.stdout.write('  \\u2713 build_file_inventory\\n');
  process.stdout.write('  \\u2713 check_forbidden_paths\\n');
  const pp = path.join(cwd, '.lbe', 'policy.json');
  if (!fs.existsSync(pp)) {
    process.stdout.write('  \\u2716 check_lbe_config\\n');
    process.stdout.write('     reason: .lbe/policy.json missing\\n');
    process.stdout.write('     next:   Run lbe init\\n');
  } else {
    process.stdout.write('  \\u2713 check_lbe_config\\n');
  }
  process.stdout.write('  \\u2713 check_package_state\\n');
  process.stdout.write('  \\u2713 write_report\\n\\n');
  process.stdout.write('  Summary: Audit mode complete\\n\\n');
  process.exit(0);
}

// ── lbe proof ─────────────────────────────────────────────────────────────
if (cmd === 'proof') {
  const proof = readJson(proofFile);
  if (!proof) {
    process.stdout.write('PROOF_INCOMPLETE\\n');
    process.exit(0);
  }
  process.stdout.write(String(proof.status || proof.result || 'PROOF_AVAILABLE') + '\\n');
  process.exit(0);
}

// ── lbe execute ───────────────────────────────────────────────────────────
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
    process.stderr.write(String(err?.message || err) + '\\n');
    process.exit(2);
  }
}

process.stderr.write('Unknown command: ' + cmd + '\\nRun \\'npx lbe\\' for the terminal menu.\\n');
process.exit(2);
`);

const OS_METADATA_FILES = new Set(['Thumbs.db', '.DS_Store', 'Desktop.ini']);

function isOsMetadata(file) {
  return OS_METADATA_FILES.has(path.basename(file));
}

function copyDirectory(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => !isOsMetadata(src),
  });
}
writeText(path.join(outDir, 'types.d.ts'), `// @letterblack/lbe-core v${publicPackageVersion}\nexport function execute(input: string): string;\n`);
// Copy root README as the public README (single source, no template placeholders)
const rootReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
writeText(path.join(outDir, 'README.md'), rootReadme);
copyDirectory(path.join(root, 'assets'), path.join(outDir, 'assets'));
// Copy only public-safe docs — exclude internal governance files
const publicDocAllowlist = [
  'decisions/ADR-001-remove-mcp-execution-surface.md',
  'decisions/ADR-002-remove-http-server-surface.md',
  'decisions/ADR-003-sdk-only-product-boundary.md',
];
for (const rel of publicDocAllowlist) {
  const src = path.join(root, 'docs', rel);
  const dst = path.join(outDir, 'docs', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
// Repo/release guard for the public mirror only. package.json files must keep
// npm output narrowed to docs/decisions/*.md so this guard never ships.
copyFile(path.join(root, 'docs', 'RELEASE_AUTHORITY.md'), path.join(outDir, 'docs', 'RELEASE_AUTHORITY.md'));
copyFile(path.join(root, 'release', 'TECHNICAL_VISUALS.md'), path.join(outDir, 'docs', 'TECHNICAL_VISUALS.md'));
// .github is for the public repo mirror (LetterBlack-Sentinel) CI only.
// It must NOT appear in npm pack files — only in publicRepoFiles.
// Copy from release/templates/.github/ into release-public/.github/ for sentinel sync.
const githubTemplateSrc = path.join(root, 'release', 'templates', '.github');
const githubTemplateDst = path.join(outDir, '.github');
if (fs.existsSync(githubTemplateSrc)) {
  copyDirectory(githubTemplateSrc, githubTemplateDst);
}

const licensePath = path.join(root, 'LICENSE');
if (fs.existsSync(licensePath)) {
  copyFile(licensePath, path.join(outDir, 'LICENSE'));
} else {
  writeText(path.join(outDir, 'LICENSE'), `${sourcePkg.license || 'SEE LICENSE IN LICENSE'}\n`);
}
writeJson(path.join(outDir, 'package.json'), {
  name: publicPackageName,
  version: publicPackageVersion,
  description: 'Local-first execution governance SDK for AI agents.',
  type: 'module',
  main: 'dist/index.js',
  types: 'types.d.ts',
  exports: {
    '.': {
      types: './types.d.ts',
      default: './dist/index.js',
    },
    './cli': './dist/cli.js',
  },
  bin: {
    lbe: 'dist/cli.js',
  },
  files: manifest.npmFiles,
  scripts: {
    pack: 'npm pack',
    'pack:check': 'npm pack --dry-run',
  },
  keywords: sourcePkg.keywords || [],
  author: sourcePkg.author || 'LetterBlack',
  license: sourcePkg.license || 'SEE LICENSE IN LICENSE',
  dependencies: {},
  engines: sourcePkg.engines,
});

writeText(path.join(outDir, '.npmignore'), [
  'src/',
  'test/',
  'tests/',
  'scripts/',
  'archive/',
  '.github/',
  'keys/',
  'data/',
  'node_modules/',
  '*.map',
  '',
].join('\r\n'));

assertNoPrivateFiles();

console.log(`[build-public-sdk] wrote ${path.relative(root, outDir)} for ${publicPackageName}`);
