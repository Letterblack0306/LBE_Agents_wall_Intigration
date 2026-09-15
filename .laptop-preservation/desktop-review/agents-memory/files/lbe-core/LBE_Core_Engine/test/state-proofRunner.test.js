import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runProof, loadLatestProof } from '../src/state/proofRunner.js';
import { registerIntent } from '../src/state/intentRegistry.js';
import { registerTarget } from '../src/state/targetRegistry.js';
import { indexFiles } from '../src/state/fileIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDirs() {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-proof-state-'));
    const ws       = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-proof-ws-'));
    fs.mkdirSync(path.join(stateDir, 'file-index'), { recursive: true });
    fs.mkdirSync(path.join(stateDir, 'proof'),      { recursive: true });
    return { stateDir, ws };
}

function cleanup(...dirs) {
    for (const d of dirs) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
    }
}

// ── 1. PASS when changed files are inside allowed_files ───────────────────────

test('PASS when all changed files are inside allowed_files', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerIntent(stateDir, {
            task: 'update panel',
            allowed_files: ['src/settings/SettingsPanel.jsx'],
        });

        fs.mkdirSync(path.join(ws, 'src', 'settings'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'settings', 'SettingsPanel.jsx'), 'v1');
        indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
        fs.writeFileSync(path.join(ws, 'src', 'settings', 'SettingsPanel.jsx'), 'v2');
        indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));

        const proof = runProof(stateDir, ws);
        assert.equal(proof.result, 'PASS', `expected PASS, got ${proof.result}: ${JSON.stringify(proof.failures)}`);
        assert.equal(proof.failures.length, 0);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 2. FAIL when changed files are outside allowed_files ──────────────────────

test('FAIL when changed file is outside allowed_files', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerIntent(stateDir, {
            task: 'update panel',
            allowed_files: ['src/settings/SettingsPanel.jsx'],
        });

        fs.mkdirSync(path.join(ws, 'src', 'auth'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'auth', 'login.js'), 'v1');
        indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
        fs.writeFileSync(path.join(ws, 'src', 'auth', 'login.js'), 'v2');
        indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));

        const proof = runProof(stateDir, ws);
        assert.equal(proof.result, 'FAIL');
        assert.ok(proof.failures.some(f => f.reason === 'file_outside_allowed'));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 3. FAIL when forbidden_files changed ─────────────────────────────────────

test('FAIL when a forbidden file is changed', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerIntent(stateDir, {
            task: 'safe update',
            allowed_files: ['**/*.js'],
            forbidden_files: ['.env', '*.key'],
        });

        fs.writeFileSync(path.join(ws, 'app.js'),    'v1');
        fs.writeFileSync(path.join(ws, 'secret.key'), 'k1');
        indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
        fs.writeFileSync(path.join(ws, 'app.js'),    'v2');
        fs.writeFileSync(path.join(ws, 'secret.key'), 'k2');
        indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));

        const proof = runProof(stateDir, ws);
        assert.equal(proof.result, 'FAIL');
        assert.ok(proof.failures.some(f =>
            f.file === 'secret.key' &&
            (f.reason === 'forbidden_file_changed')
        ));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 4. WEAK_PROOF when target requires user confirmation ──────────────────────

test('WEAK_PROOF when target requires_user_confirmation is true', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        registerIntent(stateDir, {
            task: 'visual update',
            allowed_files: ['src/ui/Canvas.jsx'],
        });
        registerTarget(stateDir, {
            kind:                       'canvas',
            target_source:              'visual_inference',
            requires_user_confirmation: false, // will be forced to true
        });

        fs.mkdirSync(path.join(ws, 'src', 'ui'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'ui', 'Canvas.jsx'), 'v1');
        indexFiles(ws, path.join(stateDir, 'file-index', 'before.json'));
        fs.writeFileSync(path.join(ws, 'src', 'ui', 'Canvas.jsx'), 'v2');
        indexFiles(ws, path.join(stateDir, 'file-index', 'after.json'));

        const proof = runProof(stateDir, ws);
        assert.equal(proof.result, 'WEAK_PROOF', `expected WEAK_PROOF, got ${proof.result}`);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 5. hook profile selected for register.cjs changes ────────────────────────

test('hook profile selected when register.cjs is in changed files', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        // Write file indexes that include a register.cjs change
        const beforeFiles = { 'src/hooks/register.cjs': { sha256: 'aaa', size: 100, mtimeMs: 1 } };
        const afterFiles  = { 'src/hooks/register.cjs': { sha256: 'bbb', size: 200, mtimeMs: 2 } };
        fs.writeFileSync(
            path.join(stateDir, 'file-index', 'before.json'),
            JSON.stringify({ format: 1, ts: new Date().toISOString(), workspace: ws, files: beforeFiles })
        );
        fs.writeFileSync(
            path.join(stateDir, 'file-index', 'after.json'),
            JSON.stringify({ format: 1, ts: new Date().toISOString(), workspace: ws, files: afterFiles })
        );

        const proof = runProof(stateDir, ws);
        assert.equal(proof.profile, 'hook', `expected hook profile, got ${proof.profile}`);
        assert.ok(proof.checks_run.includes('npm_run_proof'));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 6. docs profile selected for markdown-only changes ───────────────────────

test('docs profile selected for markdown-only changed files', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const beforeFiles = { 'README.md': { sha256: 'aaa', size: 100, mtimeMs: 1 } };
        const afterFiles  = { 'README.md': { sha256: 'bbb', size: 200, mtimeMs: 2 } };
        fs.writeFileSync(
            path.join(stateDir, 'file-index', 'before.json'),
            JSON.stringify({ format: 1, ts: new Date().toISOString(), workspace: ws, files: beforeFiles })
        );
        fs.writeFileSync(
            path.join(stateDir, 'file-index', 'after.json'),
            JSON.stringify({ format: 1, ts: new Date().toISOString(), workspace: ws, files: afterFiles })
        );

        const proof = runProof(stateDir, ws);
        assert.equal(proof.profile, 'docs', `expected docs profile, got ${proof.profile}`);
        assert.ok(proof.checks_run.includes('diff'));
        assert.ok(proof.checks_run.includes('forbidden_clean'));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 7. missing file index falls safely ───────────────────────────────────────

test('runProof does not crash when file index is missing', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        // No file indexes written — should not throw
        assert.doesNotThrow(() => {
            const proof = runProof(stateDir, ws);
            assert.ok(typeof proof.result === 'string');
        });
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 8. malformed logs do not crash ───────────────────────────────────────────

test('malformed lbe-events.jsonl does not crash runProof', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        fs.writeFileSync(
            path.join(stateDir, 'lbe-events.jsonl'),
            'INVALID_JSON\n{"action":"file_write","path":"/x.txt"}\nALSO_BAD\n',
            'utf8'
        );
        assert.doesNotThrow(() => runProof(stateDir, ws));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 9. loadLatestProof returns null when no proof exists ─────────────────────

test('loadLatestProof returns null when proof directory is empty', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        assert.equal(loadLatestProof(stateDir), null);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 10. loadLatestProof returns the written proof ─────────────────────────────

test('loadLatestProof returns proof written by runProof', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const written = runProof(stateDir, ws);
        const loaded  = loadLatestProof(stateDir);
        assert.ok(loaded !== null);
        assert.equal(loaded.result, written.result);
        assert.equal(loaded.profile, written.profile);
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 11. proof output shape ────────────────────────────────────────────────────

test('proof record has required format, ts, result, profile, checks_run, failures', () => {
    const { stateDir, ws } = tmpDirs();
    try {
        const proof = runProof(stateDir, ws);
        assert.equal(proof.format, 1);
        assert.ok(typeof proof.ts === 'string');
        assert.ok(['PASS', 'FAIL', 'WEAK_PROOF'].includes(proof.result));
        assert.ok(typeof proof.profile === 'string');
        assert.ok(Array.isArray(proof.checks_run));
        assert.ok(Array.isArray(proof.failures));
        assert.ok(Array.isArray(proof.files_changed));
    } finally {
        cleanup(stateDir, ws);
    }
});

// ── 12. no hook mutation ──────────────────────────────────────────────────────

test('proofRunner does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const { stateDir, ws } = tmpDirs();
    try {
        runProof(stateDir, ws);
    } finally {
        cleanup(stateDir, ws);
    }
    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), before,
        'register.cjs must be byte-identical after proofRunner use');
});
