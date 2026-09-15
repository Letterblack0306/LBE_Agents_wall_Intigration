import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { logsCommand } from '../src/cli/commands/logs.js';
import { resolveWorkspaceState } from '../src/state/index.js';

function makeTmpDir() {
    const dir = path.join(os.tmpdir(), 'lbe-logs-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function makeEvents(n) {
    return Array.from({ length: n }, (_, i) => JSON.stringify({
        ts: 1700000000 + i,
        action: 'file_write',
        decision: 'allow',
        path: `/tmp/file-${i}.txt`,
    })).join('\n') + '\n';
}

test('logsCommand returns missing:true when lbe-events.jsonl absent', async () => {
    const workspace = makeTmpDir();
    try {
        const result = await logsCommand({ root: workspace });
        assert.equal(result.missing, true, 'missing must be true for fresh workspace');
        assert.equal(result.count, 0);
        assert.deepEqual(result.entries, []);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('logsCommand returns missing:false and entries when file exists', async () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        fs.writeFileSync(paths.events, makeEvents(5));
        const result = await logsCommand({ root: workspace });
        assert.equal(result.missing, false);
        assert.equal(result.count, 5);
        assert.equal(result.entries.length, 5);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('logsCommand respects --limit and returns only tail', async () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        fs.writeFileSync(paths.events, makeEvents(30));
        const result = await logsCommand({ root: workspace, limit: '5' });
        assert.equal(result.count, 30, 'count must reflect total entries in file');
        assert.equal(result.entries.length, 5, 'entries must be limited to 5');
        // Tail: last 5 of 30 → ts 1700000025 through 1700000029
        assert.equal(result.entries[0].ts, 1700000025);
        assert.equal(result.entries[4].ts, 1700000029);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('logsCommand default limit is 20', async () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        fs.writeFileSync(paths.events, makeEvents(25));
        const result = await logsCommand({ root: workspace });
        assert.equal(result.entries.length, 20, 'default limit must be 20');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('logsCommand skips malformed JSONL lines without throwing', async () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        const mixed = '{"ts":1,"action":"file_write","decision":"allow"}\nNOT_JSON\n{"ts":2,"action":"file_write","decision":"deny"}\n';
        fs.writeFileSync(paths.events, mixed);
        const result = await logsCommand({ root: workspace });
        assert.equal(result.count, 2, 'malformed lines must be skipped');
        assert.equal(result.missing, false);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('logsCommand returns eventsPath pointing into central state', async () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        fs.writeFileSync(paths.events, makeEvents(1));
        const result = await logsCommand({ root: workspace });
        assert.ok(result.eventsPath.includes('LetterBlack'), 'eventsPath must be in central store');
        assert.ok(result.eventsPath.endsWith('lbe-events.jsonl'));
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});
