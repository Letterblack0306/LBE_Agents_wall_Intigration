import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { statusCommand } from '../src/cli/commands/status.js';

function makeTmpDir() {
    const dir = path.join(os.tmpdir(), 'lbe-status-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

test('statusCommand returns workspaceId and stateDir', async () => {
    const workspace = makeTmpDir();
    try {
        const result = await statusCommand({ root: workspace });
        assert.ok(typeof result.workspaceId === 'string', 'workspaceId must be string');
        assert.match(result.workspaceId, /^[0-9a-f]{64}$/, 'workspaceId must be 64-char hex');
        assert.ok(typeof result.stateDir === 'string', 'stateDir must be string');
        assert.ok(path.isAbsolute(result.stateDir), 'stateDir must be absolute');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand reports no proof when proof/latest.json absent', async () => {
    const workspace = makeTmpDir();
    try {
        const result = await statusCommand({ root: workspace });
        assert.equal(result.hasProof, false, 'hasProof must be false for fresh workspace');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand reports no events when lbe-events.jsonl absent', async () => {
    const workspace = makeTmpDir();
    try {
        const result = await statusCommand({ root: workspace });
        assert.equal(result.hasEvents, false, 'hasEvents must be false for fresh workspace');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand detects hasProof when proof/latest.json exists', async () => {
    const workspace = makeTmpDir();
    try {
        // Run once to create stateDir
        const first = await statusCommand({ root: workspace });
        // Write a fake proof file
        fs.writeFileSync(first.stateDir + '/proof/latest.json', JSON.stringify({ result: 'PASS' }));
        const second = await statusCommand({ root: workspace });
        assert.equal(second.hasProof, true, 'hasProof must be true when proof/latest.json exists');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand detects hasEvents when lbe-events.jsonl exists', async () => {
    const workspace = makeTmpDir();
    try {
        const first = await statusCommand({ root: workspace });
        fs.writeFileSync(first.stateDir + '/lbe-events.jsonl', JSON.stringify({ ts: 1, action: 'file_write', decision: 'allow' }) + '\n');
        const second = await statusCommand({ root: workspace });
        assert.equal(second.hasEvents, true, 'hasEvents must be true when lbe-events.jsonl exists');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand reads policyMode from .lbe/policy.json', async () => {
    const workspace = makeTmpDir();
    try {
        const lbeDir = path.join(workspace, '.lbe');
        fs.mkdirSync(lbeDir, { recursive: true });
        fs.writeFileSync(path.join(lbeDir, 'policy.json'), JSON.stringify({ version: 1, mode: 'enforce', rules: [] }));
        const result = await statusCommand({ root: workspace });
        assert.equal(result.policyMode, 'enforce', 'policyMode must reflect .lbe/policy.json');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand reports policy not found when .lbe/policy.json absent', async () => {
    const workspace = makeTmpDir();
    try {
        const result = await statusCommand({ root: workspace });
        assert.equal(result.policySource, 'not found', 'policySource must be "not found" when policy absent');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('statusCommand uses process.cwd() when --root not provided', async () => {
    // Just verify it does not throw when called without opts.root
    await assert.doesNotReject(statusCommand({}));
});
