import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { proofCommand } from '../src/cli/commands/proof.js';
import { runProof } from '../src/state/proofRunner.js';
import { registerIntent } from '../src/state/intentRegistry.js';
import { registerTarget } from '../src/state/targetRegistry.js';
import { indexFiles } from '../src/state/fileIndex.js';
import { resolveWorkspaceState } from '../src/state/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDirs() {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-cliproof-ws-'));
    // Minimal .lbe so resolveWorkspaceState doesn't create excess dirs
    fs.mkdirSync(path.join(ws, '.lbe'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.lbe', 'policy.json'),
        JSON.stringify({ version: 1, mode: 'observe', workspace: ws, rules: [] }));
    // Resolve the SAME stateDir that proofCommand will use
    const { stateDir } = resolveWorkspaceState(ws);
    return { stateDir, ws };
}

function cleanup(stateDir, ws) {
    try { fs.rmSync(ws,       { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(stateDir, { recursive: true, force: true }); } catch (_) {}
}

// Capture console.log output
function captureConsole(fn) {
    const lines = [];
    const orig  = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try { return { result: fn(), lines }; }
    finally { console.log = orig; }
}
async function captureConsoleAsync(fn) {
    const lines = [];
    const orig  = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try { const result = await fn(); return { result, lines }; }
    finally { console.log = orig; }
}

// ── 1. No proof yet → returns found: false ───────────────────────────────────

test('proofCommand returns found:false when no proof exists', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const result = await proofCommand({ root: ws });
        assert.equal(result.found, false);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 2. No proof → human output says no proof found ───────────────────────────

test('proofCommand prints no-proof message when proof is missing', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws }));
        assert.ok(lines.some(l => /no proof/i.test(l)), `Expected "no proof" in output: ${lines.join('\n')}`);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 3. No proof --json → JSON with found:false ────────────────────────────────

test('proofCommand --json returns JSON found:false when no proof', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws, json: true }));
        const out = JSON.parse(lines.join(''));
        assert.equal(out.found, false);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── Helper: produce a PASS proof in a workspace's central state ───────────────

function buildPassProof(stateDir, ws) {
    registerIntent(stateDir, {
        task: 'test proof',
        allowed_files: ['app.js'],
    });
    fs.writeFileSync(path.join(ws, 'app.js'), 'v1');
    indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
    fs.writeFileSync(path.join(ws, 'app.js'), 'v2');
    indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));
    return runProof(stateDir, ws);
}

// ── 4. Proof exists → human output shows result and profile ──────────────────

test('proofCommand prints result and profile for existing proof', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        buildPassProof(stateDir, ws);
        const { result, lines } = await captureConsoleAsync(() => proofCommand({ root: ws }));
        assert.equal(result.found, true);
        assert.ok(result.result === 'PASS' || result.result === 'FAIL' || result.result === 'WEAK_PROOF');
        assert.ok(lines.some(l => /PASS|FAIL|WEAK_PROOF/.test(l)), 'output must show result');
        assert.ok(lines.some(l => /profile|general|docs|hook/.test(l.toLowerCase())), 'output must show profile');
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 5. --json flag → raw JSON proof ──────────────────────────────────────────

test('proofCommand --json outputs parseable JSON with proof fields', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        buildPassProof(stateDir, ws);
        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws, json: true }));
        const json = JSON.parse(lines.join(''));
        assert.ok(typeof json.result  === 'string');
        assert.ok(typeof json.profile === 'string');
        assert.ok(Array.isArray(json.checks_run));
        assert.ok(Array.isArray(json.failures));
        assert.ok(Array.isArray(json.files_changed));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 6. --public flag → redacted output, no full paths ────────────────────────

test('proofCommand --public omits full paths and raw file lists', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        buildPassProof(stateDir, ws);
        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws, public: true }));
        const json = JSON.parse(lines.join(''));
        assert.ok(typeof json.result     === 'string', 'must have result');
        assert.ok(typeof json.profile    === 'string', 'must have profile');
        assert.ok(Array.isArray(json.checks), 'must have checks array');
        // Must NOT expose raw file list or intent/target IDs
        assert.ok(!('files_changed' in json), 'files_changed must be redacted');
        assert.ok(!('intent_id'    in json), 'intent_id must be redacted');
        assert.ok(!('target_id'    in json), 'target_id must be redacted');
        assert.ok(!('failures'     in json), 'raw failures must be redacted');
        // allow_deny must be present
        assert.ok('allow_deny' in json, 'must have allow_deny');
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 7. --public with target info → target_type and target_label exposed ───────

test('proofCommand --public includes target_type and target_label when target exists', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerTarget(stateDir, {
            kind:             'button',
            label:            'Save',
            component_file:   'src/settings/SettingsPanel.jsx',
            target_source:    'accessibility_tree',
            confidence:       0.95,
        });
        buildPassProof(stateDir, ws);
        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws, public: true }));
        const json = JSON.parse(lines.join(''));
        assert.equal(json.target_type,  'button');
        assert.equal(json.target_label, 'Save');
        assert.equal(json.target_file,  'src/settings/SettingsPanel.jsx');
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 8. --public with FAIL → failure_reasons present, no raw paths ─────────────

test('proofCommand --public shows failure_reasons without file paths on FAIL', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerIntent(stateDir, {
            task: 'limited',
            allowed_files: ['only_this.js'],
            forbidden_files: ['bad.key'],
        });
        fs.writeFileSync(path.join(ws, 'other.js'), 'v1');
        fs.writeFileSync(path.join(ws, 'bad.key'),  'k1');
        indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
        fs.writeFileSync(path.join(ws, 'other.js'), 'v2');
        fs.writeFileSync(path.join(ws, 'bad.key'),  'k2');
        indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));
        runProof(stateDir, ws);

        const { lines } = await captureConsoleAsync(() => proofCommand({ root: ws, public: true }));
        const json = JSON.parse(lines.join(''));
        assert.equal(json.result,     'FAIL');
        assert.equal(json.allow_deny, 'deny');
        assert.ok(Array.isArray(json.failure_reasons));
        // failure_reasons must NOT contain file paths
        for (const fr of json.failure_reasons) {
            assert.ok(!('file' in fr), 'file path must not appear in public failure_reasons');
        }
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 9. proofCommand returns result and profile in return value ─────────────────

test('proofCommand return value includes result and profile', async () => {
    const { stateDir, ws } = tmpDirs();
    try {
        buildPassProof(stateDir, ws);
        const ret = await proofCommand({ root: ws });
        assert.ok('result'  in ret, 'return value must have result');
        assert.ok('profile' in ret, 'return value must have profile');
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 10. register.cjs is not modified ─────────────────────────────────────────

test('proofCommand does not modify register.cjs', async () => {
    const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const { stateDir, ws } = tmpDirs();
    try {
        buildPassProof(stateDir, ws);
        await proofCommand({ root: ws });
        await proofCommand({ root: ws, json: true });
        await proofCommand({ root: ws, public: true });
    } finally {
        cleanup(stateDir, ws);
    }
    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), before,
        'register.cjs must be byte-identical after proofCommand use');
});
