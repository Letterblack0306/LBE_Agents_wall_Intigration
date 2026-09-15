import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createLBE, sandbox, addLocalPolicyRule } from '../index.js';

function dir(t) {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-local-policy-'));
    t.after(() => fs.rmSync(value, { recursive: true, force: true }));
    return value;
}

test('local policy observes a deny but permits it until enforcement', async (t) => {
    const root = dir(t);
    addLocalPolicyRule(root, { effect: 'deny', type: 'path', pattern: '**/.env*', from: 'user: do not edit env' });
    const lbe = createLBE({ rootDir: root, mode: 'observe' });
    const result = await lbe.execute({ intent: 'write_file', target: path.join(root, '.env'), content: 'x' });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(root, '.lbe/audit.jsonl')), true);
});

test('local policy enforces deny over an allow conflict', async (t) => {
    const root = dir(t);
    addLocalPolicyRule(root, { effect: 'allow', type: 'path', pattern: 'output/**', from: 'observer: normal output' });
    addLocalPolicyRule(root, { effect: 'deny', type: 'path', pattern: 'output/**', from: 'user: stop output writes' }, 'enforce');
    const lbe = createLBE({ rootDir: root, mode: 'enforce' });
    const result = await lbe.execute({ intent: 'write_file', target: path.join(root, 'output', 'a.txt'), content: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'LOCAL_POLICY_DENY');
    assert.equal(fs.existsSync(path.join(root, 'output', 'a.txt')), false);
});

test('sandbox blocks a symlink escape from the project root', async (t) => {
    const root = dir(t);
    const outside = dir(t);
    const link = path.join(root, 'escape');
    try { fs.symlinkSync(outside, link, 'junction'); } catch { t.skip('symlinks unavailable'); return; }
    const sb = sandbox(root);
    await assert.rejects(() => sb.write('escape/blocked.txt', 'x'), /sandbox\.write blocked/);
    assert.equal(fs.existsSync(path.join(outside, 'blocked.txt')), false);
});
