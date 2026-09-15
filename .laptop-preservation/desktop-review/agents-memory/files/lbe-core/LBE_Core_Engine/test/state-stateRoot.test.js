import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Import the module under test.
// We test stateRoot() by importing it normally AND by probing env-var paths
// through the exported function with temporary env overrides.
import { stateRoot } from '../src/state/stateRoot.js';
import { resolveWorkspaceState } from '../src/state/index.js';

// ── stateRoot env-var tests ───────────────────────────────────────────────────
// We can only directly test the branch that matches process.platform.
// For the other branches we verify the fallback logic by importing the function
// and comparing against the expected path construction using os.homedir().

test('stateRoot returns a non-empty absolute path', () => {
    const root = stateRoot();
    assert.ok(root.length > 0, 'must return a path');
    assert.ok(path.isAbsolute(root), 'must be absolute');
});

test('stateRoot contains LetterBlack/Sentinel suffix', () => {
    const root = stateRoot();
    // Normalise separators for comparison.
    const normalised = root.split(path.sep).join('/');
    assert.ok(
        normalised.includes('LetterBlack/Sentinel'),
        `expected LetterBlack/Sentinel in "${root}"`
    );
});

if (process.platform === 'win32') {
    test('Windows: stateRoot uses LOCALAPPDATA when set', () => {
        const saved = process.env.LOCALAPPDATA;
        try {
            process.env.LOCALAPPDATA = 'C:\\FakeAppData';
            // Re-evaluate by calling the raw logic (stateRoot is pure — reads env at call time).
            const root = stateRoot();
            assert.ok(root.startsWith('C:\\FakeAppData'), `expected FakeAppData prefix, got "${root}"`);
        } finally {
            if (saved === undefined) delete process.env.LOCALAPPDATA;
            else process.env.LOCALAPPDATA = saved;
        }
    });

    test('Windows: stateRoot falls back to homedir/AppData/Local when LOCALAPPDATA unset', () => {
        const saved = process.env.LOCALAPPDATA;
        try {
            delete process.env.LOCALAPPDATA;
            const root = stateRoot();
            const expected = path.join(os.homedir(), 'AppData', 'Local', 'LetterBlack', 'Sentinel');
            assert.equal(root, expected);
        } finally {
            if (saved !== undefined) process.env.LOCALAPPDATA = saved;
        }
    });
}

if (process.platform === 'linux') {
    test('Linux: stateRoot uses XDG_DATA_HOME when set', () => {
        const saved = process.env.XDG_DATA_HOME;
        try {
            process.env.XDG_DATA_HOME = '/fake/xdg';
            const root = stateRoot();
            assert.ok(root.startsWith('/fake/xdg'), `expected /fake/xdg prefix, got "${root}"`);
        } finally {
            if (saved === undefined) delete process.env.XDG_DATA_HOME;
            else process.env.XDG_DATA_HOME = saved;
        }
    });

    test('Linux: stateRoot falls back to homedir/.local/share when XDG_DATA_HOME unset', () => {
        const saved = process.env.XDG_DATA_HOME;
        try {
            delete process.env.XDG_DATA_HOME;
            const root = stateRoot();
            const expected = path.join(os.homedir(), '.local', 'share', 'LetterBlack', 'Sentinel');
            assert.equal(root, expected);
        } finally {
            if (saved !== undefined) process.env.XDG_DATA_HOME = saved;
        }
    });
}

if (process.platform === 'darwin') {
    test('macOS: stateRoot uses HOME for Application Support path', () => {
        const saved = process.env.HOME;
        try {
            process.env.HOME = '/fake/home';
            const root = stateRoot();
            assert.ok(
                root.startsWith('/fake/home'),
                `expected /fake/home prefix, got "${root}"`
            );
            assert.ok(root.includes('Application Support'), 'must include Application Support');
        } finally {
            if (saved === undefined) delete process.env.HOME;
            else process.env.HOME = saved;
        }
    });
}

// ── resolveWorkspaceState ────────────────────────────────────────────────────

function makeTmpDir() {
    const dir = path.join(os.tmpdir(), 'lbe-state-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

test('resolveWorkspaceState returns stateDir, workspaceId, and paths', () => {
    const workspace = makeTmpDir();
    try {
        const result = resolveWorkspaceState(workspace);
        assert.ok(typeof result.stateDir === 'string', 'stateDir must be string');
        assert.ok(typeof result.workspaceId === 'string', 'workspaceId must be string');
        assert.ok(typeof result.paths === 'object', 'paths must be object');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('resolveWorkspaceState creates the state directory on disk', () => {
    const workspace = makeTmpDir();
    try {
        const { stateDir } = resolveWorkspaceState(workspace);
        assert.ok(fs.existsSync(stateDir), 'stateDir must exist after resolve');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('resolveWorkspaceState creates file-index/ and proof/ subdirectories', () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        assert.ok(fs.existsSync(paths.fileIndexDir), 'file-index/ must exist');
        assert.ok(fs.existsSync(paths.proofDir),     'proof/ must exist');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('resolveWorkspaceState is idempotent — safe to call twice', () => {
    const workspace = makeTmpDir();
    try {
        assert.doesNotThrow(() => {
            resolveWorkspaceState(workspace);
            resolveWorkspaceState(workspace);
        });
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('resolveWorkspaceState returns all expected path keys', () => {
    const workspace = makeTmpDir();
    try {
        const { paths } = resolveWorkspaceState(workspace);
        const expected = [
            'workspace', 'events', 'intent', 'targetRegistry',
            'fileIndexDir', 'fileIndexBefore', 'fileIndexAfter',
            'proofDir', 'proofLatest',
        ];
        for (const key of expected) {
            assert.ok(key in paths, `paths must contain key "${key}"`);
            assert.ok(typeof paths[key] === 'string', `paths.${key} must be a string`);
        }
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('resolveWorkspaceState paths are all under stateDir', () => {
    const workspace = makeTmpDir();
    try {
        const { stateDir, paths } = resolveWorkspaceState(workspace);
        for (const [key, p] of Object.entries(paths)) {
            assert.ok(
                p.startsWith(stateDir),
                `paths.${key} ("${p}") must be under stateDir ("${stateDir}")`
            );
        }
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('same workspace root → same stateDir on repeated calls', () => {
    const workspace = makeTmpDir();
    try {
        const a = resolveWorkspaceState(workspace);
        const b = resolveWorkspaceState(workspace);
        assert.equal(a.stateDir, b.stateDir);
        assert.equal(a.workspaceId, b.workspaceId);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test('different workspace roots → different stateDirs', () => {
    const w1 = makeTmpDir();
    const w2 = makeTmpDir();
    try {
        const a = resolveWorkspaceState(w1);
        const b = resolveWorkspaceState(w2);
        assert.notEqual(a.stateDir, b.stateDir);
        assert.notEqual(a.workspaceId, b.workspaceId);
    } finally {
        fs.rmSync(w1, { recursive: true, force: true });
        fs.rmSync(w2, { recursive: true, force: true });
    }
});
