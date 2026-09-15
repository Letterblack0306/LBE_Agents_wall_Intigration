import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scopeCommand } from '../src/cli/commands/scope.js';
import { intentCommand } from '../src/cli/commands/intent.js';
import { snapshotCommand } from '../src/cli/commands/snapshot.js';
import { proofCommand } from '../src/cli/commands/proof.js';
import { auditStatus, AUDIT_STATUS } from '../src/state/auditMode.js';

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-scope-contract-'));
}

function cleanup(workspace) {
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) { /* best-effort temp cleanup */ }
}

async function captureConsole(fn) {
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
        const result = await fn();
        return { result, lines };
    } finally {
        console.log = orig;
    }
}

async function setScope(workspace, overrides = {}) {
    fs.writeFileSync(path.join(workspace, 'README.md'), 'required scope reading\n');
    const scope = {
        version: 1,
        id: overrides.id || 'scope_contract_test',
        objective: 'scope contract test',
        requiredReading: overrides.requiredReading || [{ path: 'README.md', required: true }],
        allowedFiles: overrides.allowedFiles || ['src/**'],
        forbiddenFiles: overrides.forbiddenFiles || [],
        requiredValidation: overrides.requiredValidation || [],
        forbiddenActions: [],
    };
    fs.mkdirSync(path.join(workspace, '.lbe'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.lbe', 'scope-input.json'), JSON.stringify(scope, null, 2));
    await captureConsole(() => scopeCommand('set', { root: workspace, _: ['set', '.lbe/scope-input.json'] }));
    if (overrides.read !== false) {
        await captureConsole(() => scopeCommand('read', { root: workspace, _: ['read'] }));
    }
    return scope;
}

async function runProofCycle(workspace, mutate) {
    await snapshotCommand('before', { root: workspace });
    mutate();
    await snapshotCommand('after', { root: workspace });
    await captureConsole(() => proofCommand({ root: workspace, json: true }));
    return auditStatus({ root: workspace }).status;
}

test('missing scope returns NO_SCOPE_FOUND', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        await snapshotCommand('before', { root: workspace });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v2\n');
        await snapshotCommand('after', { root: workspace });
        await captureConsole(() => proofCommand({ root: workspace, json: true }));
        assert.equal(auditStatus({ root: workspace }).status, AUDIT_STATUS.NO_SCOPE_FOUND);
    } finally {
        cleanup(workspace);
    }
});

test('scope exists but required reading missing returns REQUIRED_READING_MISSING', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        await setScope(workspace, { read: false });
        await intentCommand('begin', { root: workspace, task: 'update source', scope: 'scope_contract_test' });
        const status = await runProofCycle(workspace, () => {
            fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v2\n');
        });
        assert.equal(status, AUDIT_STATUS.REQUIRED_READING_MISSING);
    } finally {
        cleanup(workspace);
    }
});

test('intent references wrong scope returns INTENT_SCOPE_MISMATCH', async () => {
    const workspace = makeWorkspace();
    try {
        await setScope(workspace);
        const result = await intentCommand('begin', { root: workspace, task: 'wrong scope', scope: 'scope_other' });
        assert.equal(result.status, AUDIT_STATUS.INTENT_SCOPE_MISMATCH);
    } finally {
        cleanup(workspace);
    }
});

test('changed file outside allowed files returns CHANGED_OUTSIDE_SCOPE', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"x"}\n');
        await setScope(workspace, { allowedFiles: ['src/**'] });
        await intentCommand('begin', { root: workspace, task: 'source only', scope: 'scope_contract_test' });
        const status = await runProofCycle(workspace, () => {
            fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"changed"}\n');
        });
        assert.equal(status, AUDIT_STATUS.CHANGED_OUTSIDE_SCOPE);
    } finally {
        cleanup(workspace);
    }
});

test('forbidden file touched returns FORBIDDEN_FILE_TOUCHED', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"x"}\n');
        await setScope(workspace, { allowedFiles: ['src/**', 'package.json'], forbiddenFiles: ['package.json'] });
        await intentCommand('begin', { root: workspace, task: 'source only', scope: 'scope_contract_test' });
        const status = await runProofCycle(workspace, () => {
            fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"changed"}\n');
        });
        assert.equal(status, AUDIT_STATUS.FORBIDDEN_FILE_TOUCHED);
    } finally {
        cleanup(workspace);
    }
});

test('all scope checks pass returns CLEAN', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        await setScope(workspace, { allowedFiles: ['src/**'] });
        await intentCommand('begin', { root: workspace, task: 'source only', scope: 'scope_contract_test' });
        const status = await runProofCycle(workspace, () => {
            fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v2\n');
        });
        assert.equal(status, AUDIT_STATUS.CLEAN);
    } finally {
        cleanup(workspace);
    }
});
