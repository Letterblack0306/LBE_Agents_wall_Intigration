import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { intentCommand } from '../src/cli/commands/intent.js';
import { snapshotCommand } from '../src/cli/commands/snapshot.js';
import { proofCommand } from '../src/cli/commands/proof.js';
import { scopeCommand } from '../src/cli/commands/scope.js';
import { auditStatus, AUDIT_STATUS } from '../src/state/auditMode.js';

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-audit-mode-'));
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
    fs.writeFileSync(path.join(workspace, 'README.md'), 'scope reading\n');
    const scope = {
        version: 1,
        id: overrides.id || 'scope_test',
        objective: overrides.objective || 'test audit mode',
        requiredReading: overrides.requiredReading || [{ path: 'README.md', required: true }],
        allowedFiles: overrides.allowedFiles || ['src/**', 'app.js'],
        forbiddenFiles: overrides.forbiddenFiles || [],
        requiredValidation: overrides.requiredValidation || [],
        forbiddenActions: [],
    };
    fs.mkdirSync(path.join(workspace, '.lbe'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.lbe', 'scope-input.json'), JSON.stringify(scope, null, 2));
    await captureConsole(() => scopeCommand('set', { root: workspace, _: ['set', '.lbe/scope-input.json'] }));
    await captureConsole(() => scopeCommand('read', { root: workspace, _: ['read'] }));
    return scope;
}

test('audit mode clean intent with matching changes returns CLEAN', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        await setScope(workspace, { allowedFiles: ['src/**'] });
        await intentCommand('begin', { root: workspace, task: 'update app', 'allowed-files': 'src/**' });
        await snapshotCommand('before', { root: workspace });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v2\n');
        await snapshotCommand('after', { root: workspace });
        const { result } = await captureConsole(() => proofCommand({ root: workspace, json: true }));
        assert.equal(result.result, 'PASS');
        assert.equal(auditStatus({ root: workspace }).status, AUDIT_STATUS.CLEAN);
    } finally {
        cleanup(workspace);
    }
});

test('audit mode changed files without intent returns NO_INTENT_FOUND', async () => {
    const workspace = makeWorkspace();
    try {
        fs.writeFileSync(path.join(workspace, 'app.js'), 'v1\n');
        await setScope(workspace, { allowedFiles: ['app.js'] });
        await snapshotCommand('before', { root: workspace });
        fs.writeFileSync(path.join(workspace, 'app.js'), 'v2\n');
        await snapshotCommand('after', { root: workspace });
        await captureConsole(() => proofCommand({ root: workspace, json: true }));
        assert.equal(auditStatus({ root: workspace }).status, AUDIT_STATUS.NO_INTENT_FOUND);
    } finally {
        cleanup(workspace);
    }
});

test('audit mode outside declared scope returns MISMATCH_DETECTED', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"x"}\n');
        await setScope(workspace, { allowedFiles: ['src/**', 'package.json'] });
        await intentCommand('begin', { root: workspace, task: 'update source', 'allowed-files': 'src/**' });
        await snapshotCommand('before', { root: workspace });
        fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"changed"}\n');
        await snapshotCommand('after', { root: workspace });
        await captureConsole(() => proofCommand({ root: workspace, json: true }));
        assert.equal(auditStatus({ root: workspace }).status, AUDIT_STATUS.MISMATCH_DETECTED);
    } finally {
        cleanup(workspace);
    }
});

test('audit mode missing declared validation returns VALIDATION_MISSING', async () => {
    const workspace = makeWorkspace();
    try {
        fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v1\n');
        await setScope(workspace, { allowedFiles: ['src/**'], requiredValidation: ['npm test'] });
        await intentCommand('begin', { root: workspace, task: 'update app', 'allowed-files': 'src/**', validation: 'npm test' });
        await snapshotCommand('before', { root: workspace });
        fs.writeFileSync(path.join(workspace, 'src', 'app.js'), 'v2\n');
        await snapshotCommand('after', { root: workspace });
        await captureConsole(() => proofCommand({ root: workspace, json: true }));
        assert.equal(auditStatus({ root: workspace }).status, AUDIT_STATUS.VALIDATION_MISSING);
    } finally {
        cleanup(workspace);
    }
});
