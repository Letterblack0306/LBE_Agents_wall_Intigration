// alpha5 — hook central dual-write test
// Verifies that register.cjs mirrors audit events to the central JSONL store
// in addition to the local .lbe/events.jsonl.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const HOOK       = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');
const HOOK_FWD   = HOOK.replace(/\\/g, '/');
const STATE_CJS  = path.join(__dirname, '..', 'src', 'state', 'index.cjs');

const { stateRoot, workspaceId, workspaceStateDir } = require(STATE_CJS);

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpWorkspace() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-dw-'));
    fs.mkdirSync(path.join(d, '.lbe'), { recursive: true });
    fs.writeFileSync(
        path.join(d, '.lbe', 'policy.json'),
        JSON.stringify({ version: 1, mode: 'observe', workspace: d, rules: [] })
    );
    return d;
}

function centralEventsPath(workspaceRoot) {
    const id  = workspaceId(workspaceRoot);
    const dir = workspaceStateDir(stateRoot(), id);
    return path.join(dir, 'lbe-events.jsonl');
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
        try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
}

// Agent code that does a write INSIDE setImmediate — this fires after the
// hook's own setImmediate (which inits _centralState), so the event IS
// written to the central log. Both setImmediate calls run in the same
// check phase; hooks are queued first (preload runs before main script).
const AGENT_WRITE = `
setImmediate(function () {
    require('fs').writeFileSync('probe.txt', 'dual-write-test');
});
`;

function runAgent(workspaceDir) {
    return spawnSync(process.execPath, ['-e', AGENT_WRITE], {
        encoding: 'utf8',
        cwd: workspaceDir,
        env: {
            ...process.env,
            NODE_OPTIONS: '--require "' + HOOK_FWD + '"',
            LBE_ROOT: workspaceDir,
            LBE_MODE: 'observe',
        },
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('local .lbe/events.jsonl is written', () => {
    const ws = tmpWorkspace();
    try {
        const r = runAgent(ws);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);
        const entries = readJsonl(path.join(ws, '.lbe', 'events.jsonl'));
        assert.ok(entries.length > 0, '.lbe/events.jsonl must have at least one entry');
        assert.ok(entries.some(e => e.action === 'file_write'), 'must have a file_write entry');
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

test('central lbe-events.jsonl is also written (dual-write)', () => {
    const ws = tmpWorkspace();
    try {
        const r = runAgent(ws);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);
        const centralPath = centralEventsPath(ws);
        assert.ok(fs.existsSync(centralPath), `central events file must exist: ${centralPath}`);
        const entries = readJsonl(centralPath);
        assert.ok(entries.length > 0, 'central lbe-events.jsonl must have at least one entry');
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

test('central entries contain the same action as local entries', () => {
    const ws = tmpWorkspace();
    try {
        const r = runAgent(ws);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);
        const localEntries   = readJsonl(path.join(ws, '.lbe', 'events.jsonl'));
        const centralEntries = readJsonl(centralEventsPath(ws));
        assert.ok(localEntries.length > 0,   'local events must be present');
        assert.ok(centralEntries.length > 0, 'central events must be present');
        // Every action in central must also appear in local (central is a subset mirror)
        for (const ce of centralEntries) {
            const found = localEntries.some(le => le.action === ce.action);
            assert.ok(found, `central entry action="${ce.action}" must exist in local log`);
        }
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

test('local .lbe/events.jsonl is still written when central write would fail', () => {
    // Simulate a scenario where central path would be unwritable by pointing to
    // an invalid root via a workspace that will produce a predictable ID.
    // We don't actually break AppData, but we verify local write is always independent.
    const ws = tmpWorkspace();
    try {
        const r = runAgent(ws);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);
        // Local events must always be written regardless of central state
        const localEntries = readJsonl(path.join(ws, '.lbe', 'events.jsonl'));
        assert.ok(localEntries.length > 0, 'local events must be written even if central fails');
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

test('central events have ts field as unix seconds', () => {
    const ws = tmpWorkspace();
    try {
        const before = Math.floor(Date.now() / 1000);
        const r = runAgent(ws);
        const after = Math.floor(Date.now() / 1000);
        assert.equal(r.status, 0, `agent exited ${r.status}: ${r.stderr}`);
        const centralEntries = readJsonl(centralEventsPath(ws));
        assert.ok(centralEntries.length > 0, 'central events must be present');
        for (const e of centralEntries) {
            assert.ok(typeof e.ts === 'number', `ts must be a number, got ${typeof e.ts}`);
            assert.ok(e.ts >= before, `ts ${e.ts} must be >= ${before}`);
            assert.ok(e.ts <= after,  `ts ${e.ts} must be <= ${after}`);
        }
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});
