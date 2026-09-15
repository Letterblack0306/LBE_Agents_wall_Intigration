import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { canonicalWorkspacePath, workspaceId, workspaceStateDir } from '../src/state/workspaceId.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir() {
    const dir = path.join(os.tmpdir(), 'lbe-wsid-test-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// ── canonicalWorkspacePath ────────────────────────────────────────────────────

test('same real path → same canonical form', () => {
    const dir = makeTmpDir();
    try {
        const a = canonicalWorkspacePath(dir);
        const b = canonicalWorkspacePath(dir);
        assert.equal(a, b);
    } finally {
        fs.rmdirSync(dir);
    }
});

test('path with trailing separator → same canonical as without', () => {
    const dir = makeTmpDir();
    try {
        const a = canonicalWorkspacePath(dir);
        const b = canonicalWorkspacePath(dir + path.sep);
        // path.normalize strips trailing separator
        assert.equal(a, b);
    } finally {
        fs.rmdirSync(dir);
    }
});

test('non-existent path does not throw — returns deterministic value', () => {
    const phantom = path.join(os.tmpdir(), 'lbe-phantom-' + crypto.randomBytes(8).toString('hex'));
    assert.doesNotThrow(() => canonicalWorkspacePath(phantom));
    const a = canonicalWorkspacePath(phantom);
    const b = canonicalWorkspacePath(phantom);
    assert.equal(a, b, 'non-existent path must be deterministic');
});

test('different real paths → different canonical forms', () => {
    const dir1 = makeTmpDir();
    const dir2 = makeTmpDir();
    try {
        assert.notEqual(canonicalWorkspacePath(dir1), canonicalWorkspacePath(dir2));
    } finally {
        fs.rmdirSync(dir1);
        fs.rmdirSync(dir2);
    }
});

if (process.platform === 'win32') {
    test('Windows: different case → same canonical form', () => {
        const dir = makeTmpDir();
        try {
            const a = canonicalWorkspacePath(dir.toUpperCase());
            const b = canonicalWorkspacePath(dir.toLowerCase());
            assert.equal(a, b, 'Windows canonical path must be case-insensitive');
        } finally {
            fs.rmdirSync(dir);
        }
    });

    test('Windows: canonical form is lowercase', () => {
        const dir = makeTmpDir();
        try {
            const canon = canonicalWorkspacePath(dir.toUpperCase());
            assert.equal(canon, canon.toLowerCase(), 'canonical path must be all lowercase on Windows');
        } finally {
            fs.rmdirSync(dir);
        }
    });
} else {
    test('non-Windows: different case → different canonical forms', () => {
        // Verifies the design intent: no lowercasing on case-sensitive volumes.
        // Uses a non-existent path so we don't rely on realpathSync.native.
        const base = path.join(os.tmpdir(), 'lbe-case-probe-' + crypto.randomBytes(4).toString('hex'));
        const lower = base + '/myproject';
        const upper = base + '/MyProject';
        const a = canonicalWorkspacePath(lower);
        const b = canonicalWorkspacePath(upper);
        assert.notEqual(a, b, 'case-sensitive platform: different case must produce different canonical paths');
    });
}

// ── workspaceId ───────────────────────────────────────────────────────────────

test('workspaceId returns 64-char hex string', () => {
    const dir = makeTmpDir();
    try {
        const id = workspaceId(dir);
        assert.match(id, /^[0-9a-f]{64}$/, 'must be 64 lowercase hex chars');
    } finally {
        fs.rmdirSync(dir);
    }
});

test('workspaceId is deterministic for same path', () => {
    const dir = makeTmpDir();
    try {
        assert.equal(workspaceId(dir), workspaceId(dir));
    } finally {
        fs.rmdirSync(dir);
    }
});

test('workspaceId differs for different paths', () => {
    const dir1 = makeTmpDir();
    const dir2 = makeTmpDir();
    try {
        assert.notEqual(workspaceId(dir1), workspaceId(dir2));
    } finally {
        fs.rmdirSync(dir1);
        fs.rmdirSync(dir2);
    }
});

// ── workspaceStateDir ─────────────────────────────────────────────────────────

test('workspaceStateDir has correct shard structure', () => {
    const stateRoot = path.join(os.tmpdir(), 'sentinel-test');
    const id = 'e25c93ab0011223344556677889900aabbccddeeff00112233445566778899aa';
    const dir = workspaceStateDir(stateRoot, id);

    assert.ok(dir.includes(path.join('workspaces', 'e2', '5c', '93', id)), 'shard path must be workspaces/<xx>/<xx>/<xx>/<id>');
    assert.ok(dir.startsWith(stateRoot), 'must be rooted at stateRoot');
});

test('workspaceStateDir ends with the full id', () => {
    const id = workspaceId(process.cwd());
    const dir = workspaceStateDir('/fake/root', id);
    assert.ok(dir.endsWith(id), 'final path segment must be the full workspace id');
});
