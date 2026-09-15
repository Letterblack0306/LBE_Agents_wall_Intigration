import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createLocalExecutor } from '../exec/index.js';

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-exec-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

test('dryRun validates a host-signed request without writing state', async (t) => {
    const root = sandbox(t);
    const lbe = createLocalExecutor({ rootDir: root });
    const result = await lbe.dryRun({ actor: 'agent:codex', intent: 'write_file', target: 'report.md', content: 'draft' });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.executed, false);
    assert.equal(fs.existsSync(path.join(root, 'report.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.lbe/audit.jsonl')), false);
    assert.equal(fs.existsSync(path.join(root, 'lbe.policy.json')), false);
});

test('executor signs locally, writes inside root, and appends audit', async (t) => {
    const root = sandbox(t);
    const lbe = createLocalExecutor({ rootDir: root });
    const result = await lbe.execute({ actor: 'agent:codex', intent: 'write_file', target: 'report.md', content: 'approved' });
    assert.equal(result.ok, true);
    assert.equal(result.executed, true);
    assert.equal(fs.readFileSync(path.join(root, 'report.md'), 'utf8'), 'approved');
    assert.equal(fs.existsSync(path.join(root, '.lbe/audit.jsonl')), true);
});

test('enforced deny blocks host-signed execution and dry-run reports denial', async (t) => {
    const root = sandbox(t);
    const lbe = createLocalExecutor({ rootDir: root, mode: 'enforce' });
    lbe.policy.addRule({ effect: 'deny', type: 'path', pattern: '**/.env*', from: 'user: never edit env' });
    const preview = await lbe.dryRun({ intent: 'write_file', target: '.env', content: 'x' });
    const result = await lbe.execute({ intent: 'write_file', target: '.env', content: 'x' });
    assert.equal(preview.ok, false);
    assert.equal(preview.dryRun, true);
    assert.equal(result.ok, false);
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
});

test('shell execution requires an explicit command allowlist', async (t) => {
    const root = sandbox(t);
    const lbe = createLocalExecutor({ rootDir: root });
    const result = await lbe.dryRun({ intent: 'run_shell', command: { cmd: process.execPath, args: ['--version'] } });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'SHELL_NOT_ALLOWLISTED');
});
