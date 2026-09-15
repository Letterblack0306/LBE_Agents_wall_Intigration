import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { statusCommand } from '../src/cli/commands/status.js';
import { registerWorkspace } from '../src/state/workspaceRegistry.js';

function tempRegistry() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-status-all-'));
    return { dir, registryPath: path.join(dir, 'registry.json') };
}

async function captureOutput(fn) {
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try { return { result: await fn(), output: lines.join('\n') }; }
    finally { console.log = original; }
}

test('status --all prints no known workspaces for a missing registry', async () => {
    const { dir, registryPath } = tempRegistry();
    try {
        const { output } = await captureOutput(() => statusCommand({ all: true, registryPath }));
        assert.match(output, /No known workspaces yet/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status --all prints two known workspaces', async () => {
    const { dir, registryPath } = tempRegistry();
    try {
        registerWorkspace(registryPath, 'a'.repeat(64), 'Z:/ws/alpha');
        registerWorkspace(registryPath, 'b'.repeat(64), 'Z:/ws/beta');
        const { output } = await captureOutput(() => statusCommand({ all: true, registryPath }));
        assert.match(output, /alpha/);
        assert.match(output, /beta/);
        assert.match(output, /a{64}/);
        assert.match(output, /last_active/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status --all handles a corrupt registry safely', async () => {
    const { dir, registryPath } = tempRegistry();
    try {
        fs.writeFileSync(registryPath, 'broken');
        const { result, output } = await captureOutput(() => statusCommand({ all: true, registryPath }));
        assert.equal(result.registryReadable, false);
        assert.match(output, /Workspace registry unreadable/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status --all does not resolve or initialize the current workspace', async () => {
    const { dir, registryPath } = tempRegistry();
    try {
        await captureOutput(() => statusCommand({ all: true, registryPath }));
        assert.equal(fs.readdirSync(dir).length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
