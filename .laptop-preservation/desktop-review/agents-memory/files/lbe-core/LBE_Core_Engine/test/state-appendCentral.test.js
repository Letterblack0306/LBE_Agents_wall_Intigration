import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// appendCentral.cjs is CJS — import via createRequire
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { appendJsonlSync } = require('../src/state/appendCentral.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'helpers', 'central-append-worker.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile() {
    return path.join(os.tmpdir(), 'lbe-append-test-' + crypto.randomBytes(4).toString('hex') + '.jsonl');
}

function readLines(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
        try { return JSON.parse(line); } catch (_) { return null; }
    });
}

function spawnWorker(filePath, count, id) {
    return new Promise((resolve, reject) => {
        // No shell:true — process.execPath may contain spaces (C:\Program Files\...)
        const child = spawn(process.execPath, [WORKER, filePath, String(count), id], {
            stdio: 'pipe',
        });
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${id} exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

// ── Single append ────────────────────────────────────────────────────────────

test('appendJsonlSync writes one parseable line', () => {
    const file = tmpFile();
    try {
        const wrote = appendJsonlSync(file, { action: 'test', value: 42 });
        assert.equal(wrote, true, 'must return true on success');
        const lines = readLines(file);
        assert.equal(lines.length, 1);
        assert.ok(lines[0] !== null, 'line must be parseable JSON');
        assert.equal(lines[0].action, 'test');
        assert.equal(lines[0].value, 42);
        assert.ok(typeof lines[0].ts === 'number', 'ts must be injected');
    } finally {
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

test('appendJsonlSync injects ts as unix seconds', () => {
    const file = tmpFile();
    const before = Math.floor(Date.now() / 1000);
    try {
        appendJsonlSync(file, { x: 1 });
        const after = Math.floor(Date.now() / 1000);
        const [entry] = readLines(file);
        assert.ok(entry.ts >= before, 'ts must be >= time before call');
        assert.ok(entry.ts <= after,  'ts must be <= time after call');
    } finally {
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

// ── Repeated appends ─────────────────────────────────────────────────────────

test('repeated appends all land in correct order', () => {
    const file = tmpFile();
    const N = 10;
    try {
        for (let i = 0; i < N; i++) {
            appendJsonlSync(file, { seq: i });
        }
        const lines = readLines(file);
        assert.equal(lines.length, N, `must have ${N} entries`);
        for (let i = 0; i < N; i++) {
            assert.ok(lines[i] !== null, `line ${i} must be valid JSON`);
            assert.equal(lines[i].seq, i, `seq must be ${i}`);
        }
    } finally {
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

test('every appended line is parseable JSON (no partial writes)', () => {
    const file = tmpFile();
    const N = 50;
    try {
        for (let i = 0; i < N; i++) {
            appendJsonlSync(file, { i, data: 'x'.repeat(64) });
        }
        const raw = fs.readFileSync(file, 'utf8');
        const lines = raw.trim().split('\n');
        assert.equal(lines.length, N);
        for (const line of lines) {
            assert.doesNotThrow(() => JSON.parse(line), `line must parse: ${line.slice(0, 40)}`);
        }
    } finally {
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

// ── Concurrent appends ───────────────────────────────────────────────────────

test('concurrent appends from 5 processes — no corrupted lines', async () => {
    const file = tmpFile();
    const WORKERS = 5;
    const PER_WORKER = 20;
    try {
        // Spawn all workers in parallel
        await Promise.all(
            Array.from({ length: WORKERS }, (_, i) =>
                spawnWorker(file, PER_WORKER, `w${i}`)
            )
        );

        const lines = readLines(file);
        // Best-effort: some writes may be skipped under contention.
        // Acceptance: all written lines parseable, at least 1 record present.
        assert.ok(lines.length > 0, 'at least one record must be written');
        for (const line of lines) {
            assert.ok(line !== null, 'every written line must be valid JSON');
            assert.equal(typeof line.worker, 'string', 'worker field must be present');
            assert.equal(typeof line.index,  'number', 'index field must be present');
        }
    } finally {
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

// ── Lock timeout / stale lock cleanup ────────────────────────────────────────

test('stale lock (older than 5s) is removed and write succeeds', () => {
    const file  = tmpFile();
    const lockPath = file + '.lock';
    try {
        // Create a lock file and backdate its mtime by 10 seconds
        fs.writeFileSync(lockPath, '');
        const staleTime = new Date(Date.now() - 10_000);
        fs.utimesSync(lockPath, staleTime, staleTime);

        // appendJsonlSync should detect the stale lock, remove it, and succeed
        const wrote = appendJsonlSync(file, { stale_test: true });
        assert.equal(wrote, true, 'must return true after cleaning stale lock');
        assert.ok(!fs.existsSync(lockPath), 'lock file must be removed after write');
        const lines = readLines(file);
        assert.equal(lines.length, 1);
        assert.equal(lines[0].stale_test, true);
    } finally {
        try { fs.unlinkSync(file); }   catch (_) {}
        try { fs.unlinkSync(lockPath); } catch (_) {}
    }
});

test('fresh lock held by another holder → write skipped, returns false', () => {
    const file     = tmpFile();
    const lockPath = file + '.lock';
    let lockFd;
    try {
        // Hold the lock open (O_EXCL)
        lockFd = fs.openSync(lockPath, 'wx');

        const wrote = appendJsonlSync(file, { should: 'skip' });
        assert.equal(wrote, false, 'must return false when lock is fresh and held');
        assert.ok(!fs.existsSync(file), 'target file must not be created when write is skipped');
    } finally {
        try { if (lockFd !== undefined) fs.closeSync(lockFd); } catch (_) {}
        try { fs.unlinkSync(lockPath); } catch (_) {}
        try { fs.unlinkSync(file); } catch (_) {}
    }
});

// ── index.cjs — CJS resolver ─────────────────────────────────────────────────

test('index.cjs resolveWorkspaceStateSyncCjs returns stateDir and paths', () => {
    const { resolveWorkspaceStateSyncCjs } = require('../src/state/index.cjs');
    const workspace = path.join(os.tmpdir(), 'lbe-cjs-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(workspace, { recursive: true });
    try {
        const result = resolveWorkspaceStateSyncCjs(workspace);
        assert.ok(typeof result.stateDir === 'string', 'stateDir must be string');
        assert.match(result.workspaceId, /^[0-9a-f]{64}$/, 'workspaceId must be 64-char hex');
        assert.ok(fs.existsSync(result.stateDir), 'stateDir must exist on disk');
        assert.ok(fs.existsSync(result.paths.fileIndexDir), 'file-index/ must exist');
        assert.ok(fs.existsSync(result.paths.proofDir),     'proof/ must exist');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('index.cjs resolveWorkspaceStateSyncCjs is idempotent', () => {
    const { resolveWorkspaceStateSyncCjs } = require('../src/state/index.cjs');
    const workspace = path.join(os.tmpdir(), 'lbe-cjs-idem-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(workspace, { recursive: true });
    try {
        assert.doesNotThrow(() => {
            resolveWorkspaceStateSyncCjs(workspace);
            resolveWorkspaceStateSyncCjs(workspace);
        });
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('index.cjs workspaceId matches ESM workspaceId for same path', async () => {
    const { workspaceId: cjsId } = require('../src/state/index.cjs');
    const { workspaceId: esmId } = await import('../src/state/workspaceId.js');
    const workspace = path.join(os.tmpdir(), 'lbe-cjs-match-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(workspace, { recursive: true });
    try {
        assert.equal(
            cjsId(workspace),
            esmId(workspace),
            'CJS and ESM workspaceId must produce identical results for the same path'
        );
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});
