// E2E — v1.3.0 central proof chain
//
// Proves the full v1.3.0 flow:
//   intent → target → file-index before → hook write (spawnSync + NODE_OPTIONS)
//   → local .lbe/events.jsonl → central lbe-events.jsonl
//   → file-index after → runProof → proof/latest.json
//
// This test does NOT use mocks. Everything runs against real files on disk
// and real CJS module loading — same as production.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { resolveWorkspaceState } from '../src/state/index.js';
import { registerIntent }        from '../src/state/intentRegistry.js';
import { registerTarget }        from '../src/state/targetRegistry.js';
import { indexFiles }            from '../src/state/fileIndex.js';
import { runProof, loadLatestProof } from '../src/state/proofRunner.js';

const require   = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOOK     = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');
const HOOK_FWD = HOOK.replace(/\\/g, '/');
const HOOK_PATH = HOOK;
const INDEX_CJS = path.join(__dirname, '..', 'src', 'state', 'index.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpWorkspace() {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-e2e-'));
    fs.mkdirSync(path.join(ws, '.lbe'), { recursive: true });
    fs.writeFileSync(
        path.join(ws, '.lbe', 'policy.json'),
        JSON.stringify({ version: 1, mode: 'observe', workspace: ws, rules: [] })
    );
    return ws;
}

function cleanup(ws, stateDir) {
    try { fs.rmSync(ws,       { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(stateDir, { recursive: true, force: true }); } catch (_) {}
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((acc, l) => {
        try { acc.push(JSON.parse(l)); } catch (_) {}
        return acc;
    }, []);
}

// Runs an agent under the hook via spawnSync.
// The write is inside setImmediate so it fires after hook's own setImmediate
// (which inits _centralState), guaranteeing central dual-write.
function runHookedAgent(ws, code) {
    return spawnSync(process.execPath, ['-e', code], {
        encoding: 'utf8',
        cwd: ws,
        env: {
            ...process.env,
            NODE_OPTIONS: `--require "${HOOK_FWD}"`,
            LBE_ROOT: ws,
            LBE_MODE: 'observe',
        },
    });
}

// ── Scenario 1: PASS proof — full chain ───────────────────────────────────────

test('E2E PASS: intent → target → before-index → hook write → after-index → PASS proof', () => {
    const ws = tmpWorkspace();
    const { stateDir, paths } = resolveWorkspaceState(ws);
    try {
        // 1. Register intent
        registerIntent(stateDir, {
            task:          'add greeting module',
            reason:        'user requested new feature',
            allowed_files: ['src/greeting.js'],
            risk:          'low',
        });

        // 2. Register target (non-visual — no confirmation required)
        registerTarget(stateDir, {
            kind:          'file',
            label:         'greeting.js',
            component_file: 'src/greeting.js',
            target_source: 'dom_snapshot',
            confidence:    0.98,
        });

        // 3. Create workspace file structure + before index
        fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'other.js'), '// unchanged');
        indexFiles(ws, paths.fileIndexBefore);

        // 4. Run hook-protected write (setImmediate ensures central dual-write)
        const r = runHookedAgent(ws, `
            setImmediate(function () {
                require('fs').writeFileSync('src/greeting.js', 'module.exports = "hello";');
            });
        `);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);

        // 5. Verify local .lbe/events.jsonl was written
        const localEvents = path.join(ws, '.lbe', 'events.jsonl');
        assert.ok(fs.existsSync(localEvents), '.lbe/events.jsonl must exist after hook write');
        const localEntries = readJsonl(localEvents);
        assert.ok(localEntries.length > 0, '.lbe/events.jsonl must have at least one entry');
        assert.ok(
            localEntries.some(e => e.action === 'file_write'),
            '.lbe/events.jsonl must contain a file_write entry'
        );

        // 6. Verify central lbe-events.jsonl was written (best-effort dual-write)
        assert.ok(fs.existsSync(paths.events), `central lbe-events.jsonl must exist: ${paths.events}`);
        const centralEntries = readJsonl(paths.events);
        assert.ok(centralEntries.length > 0, 'central lbe-events.jsonl must have at least one entry');
        assert.ok(
            centralEntries.some(e => e.action === 'file_write'),
            'central lbe-events.jsonl must contain a file_write entry'
        );

        // 7. Create after index
        indexFiles(ws, paths.fileIndexAfter);

        // 8. Run proof
        const proof = runProof(stateDir, ws);

        // 9. Assert PASS
        assert.equal(proof.result, 'PASS', `expected PASS, got ${proof.result}: ${JSON.stringify(proof.failures)}`);
        assert.ok(Array.isArray(proof.files_changed), 'files_changed must be an array');
        assert.ok(proof.files_changed.includes('src/greeting.js'), 'src/greeting.js must be in files_changed');

        // 10. Assert proof/latest.json exists
        assert.ok(fs.existsSync(paths.proofLatest), 'proof/latest.json must exist');
        const loaded = loadLatestProof(stateDir);
        assert.equal(loaded.result, 'PASS');

    } finally {
        cleanup(ws, stateDir);
    }
});

// ── Scenario 2: WEAK_PROOF — visual_inference target ─────────────────────────

test('E2E WEAK_PROOF: visual_inference target forces WEAK_PROOF result', () => {
    const ws = tmpWorkspace();
    const { stateDir, paths } = resolveWorkspaceState(ws);
    try {
        // Register intent allowing the file
        registerIntent(stateDir, {
            task:          'update canvas component',
            allowed_files: ['src/Canvas.jsx'],
        });

        // Register visual_inference target — must force requires_user_confirmation:true
        const target = registerTarget(stateDir, {
            kind:                       'canvas',
            label:                      'MainCanvas',
            component_file:             'src/Canvas.jsx',
            target_source:              'visual_inference',
            confidence:                 0.72,
            requires_user_confirmation: false, // will be forced to true
        });
        assert.equal(target.requires_user_confirmation, true,
            'visual_inference must force requires_user_confirmation:true');

        // Create before index, run hook write, create after index
        fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'Canvas.jsx'), '<canvas v1 />');
        indexFiles(ws, paths.fileIndexBefore);

        runHookedAgent(ws, `
            setImmediate(function () {
                require('fs').writeFileSync('src/Canvas.jsx', '<canvas v2 />');
            });
        `);

        indexFiles(ws, paths.fileIndexAfter);

        // Run proof — must be WEAK_PROOF
        const proof = runProof(stateDir, ws);
        assert.equal(proof.result, 'WEAK_PROOF',
            `expected WEAK_PROOF, got ${proof.result}: ${JSON.stringify(proof.failures)}`);
        assert.equal(proof.failures.length, 0, 'WEAK_PROOF must have no hard failures');

    } finally {
        cleanup(ws, stateDir);
    }
});

// ── Scenario 3: Public redaction proof ────────────────────────────────────────

test('E2E public redaction: --public output omits private fields', async () => {
    const ws = tmpWorkspace();
    const { stateDir, paths } = resolveWorkspaceState(ws);
    try {
        registerIntent(stateDir, {
            task:          'update settings panel',
            allowed_files: ['src/settings/SettingsPanel.jsx'],
        });
        registerTarget(stateDir, {
            kind:           'button',
            label:          'Save',
            component_file: 'src/settings/SettingsPanel.jsx',
            target_source:  'accessibility_tree',
            confidence:     0.95,
        });

        fs.mkdirSync(path.join(ws, 'src', 'settings'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'settings', 'SettingsPanel.jsx'), 'v1');
        indexFiles(ws, paths.fileIndexBefore);

        runHookedAgent(ws, `
            setImmediate(function () {
                require('fs').writeFileSync('src/settings/SettingsPanel.jsx', 'v2');
            });
        `);

        indexFiles(ws, paths.fileIndexAfter);
        runProof(stateDir, ws);

        // Call proofCommand with --public
        const { proofCommand } = await import('../src/cli/commands/proof.js');
        const output = [];
        const origLog = console.log;
        console.log = (...args) => output.push(args.join(' '));
        try {
            await proofCommand({ root: ws, public: true });
        } finally {
            console.log = origLog;
        }

        const pub = JSON.parse(output.join(''));

        // Must include safe fields
        assert.ok(typeof pub.result      === 'string',  'result must be present');
        assert.ok(typeof pub.profile     === 'string',  'profile must be present');
        assert.ok(Array.isArray(pub.checks),            'checks must be present');
        assert.ok(typeof pub.allow_deny  === 'string',  'allow_deny must be present');
        assert.equal(pub.target_type,  'button', 'target_type must be button');
        assert.equal(pub.target_label, 'Save',   'target_label must be Save');
        assert.equal(pub.target_file,  'src/settings/SettingsPanel.jsx');

        // Must NOT expose private fields
        assert.ok(!('files_changed' in pub), 'files_changed must be redacted');
        assert.ok(!('intent_id'     in pub), 'intent_id must be redacted');
        assert.ok(!('target_id'     in pub), 'target_id must be redacted');
        assert.ok(!('failures'      in pub), 'raw failures must be redacted');

        // Must not contain machine username or full AppData paths
        const pubStr = JSON.stringify(pub);
        const username = os.userInfo().username;
        assert.ok(!pubStr.includes(username), 'public output must not contain machine username');

    } finally {
        cleanup(ws, stateDir);
    }
});

// ── Scenario 4: register.cjs and index.cjs remain untouched ──────────────────

test('E2E: register.cjs and index.cjs are not modified by the full chain', async () => {
    const hookBefore = fs.readFileSync(HOOK_PATH, 'utf8');
    const cjsBefore  = fs.readFileSync(INDEX_CJS, 'utf8');

    const ws = tmpWorkspace();
    const { stateDir, paths } = resolveWorkspaceState(ws);
    try {
        registerIntent(stateDir, { task: 'immutability check', allowed_files: ['x.txt'] });
        registerTarget(stateDir, { kind: 'file', component_file: 'x.txt', target_source: 'dom_snapshot', confidence: 0.9 });

        fs.writeFileSync(path.join(ws, 'x.txt'), 'v1');
        indexFiles(ws, paths.fileIndexBefore);
        runHookedAgent(ws, `setImmediate(function(){ require('fs').writeFileSync('x.txt','v2'); });`);
        indexFiles(ws, paths.fileIndexAfter);
        runProof(stateDir, ws);

        const { proofCommand } = await import('../src/cli/commands/proof.js');
        const orig = console.log; console.log = () => {};
        try { await proofCommand({ root: ws, public: true }); } finally { console.log = orig; }

    } finally {
        cleanup(ws, stateDir);
    }

    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), hookBefore,
        'register.cjs must be byte-identical after full E2E chain');
    assert.equal(fs.readFileSync(INDEX_CJS, 'utf8'), cjsBefore,
        'index.cjs must be byte-identical after full E2E chain');
});
