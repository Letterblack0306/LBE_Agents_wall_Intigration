import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { openStateCommand } from '../src/cli/commands/openState.js';

function makeTmpDir() {
    const dir = path.join(os.tmpdir(), 'lbe-open-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// All open-state tests set LBE_NO_OPEN=1 so explorer/open/xdg-open is never
// spawned during automated runs. The path is still resolved and returned.

test('openStateCommand returns stateDir without throwing', async () => {
    const workspace = makeTmpDir();
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        const result = await openStateCommand({ root: workspace });
        assert.ok(typeof result.stateDir === 'string', 'stateDir must be string');
        assert.ok(path.isAbsolute(result.stateDir), 'stateDir must be absolute');
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('openStateCommand returns opened:false when LBE_NO_OPEN=1', async () => {
    const workspace = makeTmpDir();
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        const result = await openStateCommand({ root: workspace });
        assert.equal(result.opened, false, 'opened must be false when LBE_NO_OPEN=1');
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('openStateCommand stateDir is inside central Sentinel store', async () => {
    const workspace = makeTmpDir();
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        const result = await openStateCommand({ root: workspace });
        assert.ok(
            result.stateDir.includes('LetterBlack') && result.stateDir.includes('Sentinel'),
            `stateDir must be inside LetterBlack/Sentinel, got: ${result.stateDir}`
        );
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('openStateCommand stateDir exists on disk after call', async () => {
    const workspace = makeTmpDir();
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        const result = await openStateCommand({ root: workspace });
        assert.ok(fs.existsSync(result.stateDir), 'stateDir must exist after command runs');
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('openStateCommand same workspace → same stateDir', async () => {
    const workspace = makeTmpDir();
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        const a = await openStateCommand({ root: workspace });
        const b = await openStateCommand({ root: workspace });
        assert.equal(a.stateDir, b.stateDir, 'same workspace must resolve to same stateDir');
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('openStateCommand uses process.cwd() when --root not provided', async () => {
    const savedEnv = process.env.LBE_NO_OPEN;
    process.env.LBE_NO_OPEN = '1';
    try {
        await assert.doesNotReject(openStateCommand({}));
    } finally {
        if (savedEnv === undefined) delete process.env.LBE_NO_OPEN;
        else process.env.LBE_NO_OPEN = savedEnv;
    }
});
