import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWorkspace, listWorkspaces } from '../src/state/workspaceRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

function tempRegistry() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-workspace-registry-'));
    return { dir, registryPath: path.join(dir, 'registry.json') };
}

test('missing registry lists no workspaces', () => {
    const { dir, registryPath } = tempRegistry();
    try { assert.deepEqual(listWorkspaces(registryPath), []); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('register creates registry.json with basename alias', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        registerWorkspace(registryPath, 'id-one', 'Z:/Core_Control/letterblack-sentinel');
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        assert.equal(registry.format, 1);
        assert.equal(registry.workspaces['id-one'].alias, 'letterblack-sentinel');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('repeat registration preserves first_seen', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        const first = registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        const second = registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        assert.equal(second.first_seen, first.first_seen);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('repeat registration updates last_active', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        const original = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        original.workspaces['id-one'].last_active = '2000-01-01T00:00:00.000Z';
        fs.writeFileSync(registryPath, JSON.stringify(original));
        const second = registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        assert.notEqual(second.last_active, '2000-01-01T00:00:00.000Z');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('two workspaces are listed', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        registerWorkspace(registryPath, 'id-two', 'Z:/ws/two');
        assert.deepEqual(listWorkspaces(registryPath).map(({ workspaceId }) => workspaceId).sort(), ['id-one', 'id-two']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('corrupt registry does not crash', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        fs.writeFileSync(registryPath, '{not json');
        assert.doesNotThrow(() => listWorkspaces(registryPath));
        assert.deepEqual(listWorkspaces(registryPath), []);
        assert.doesNotThrow(() => registerWorkspace(registryPath, 'id-one', 'Z:/ws/one'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('updates leave valid JSON and no temporary file behind', () => {
    const { dir, registryPath } = tempRegistry();
    try {
        registerWorkspace(registryPath, 'id-one', 'Z:/ws/one');
        registerWorkspace(registryPath, 'id-two', 'Z:/ws/two');
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(registryPath, 'utf8')));
        assert.equal(fs.readdirSync(dir).some(name => name.startsWith('.tmp-')), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('workspace registry does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const { dir, registryPath } = tempRegistry();
    try { registerWorkspace(registryPath, 'id-one', 'Z:/ws/one'); listWorkspaces(registryPath); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), before);
});
