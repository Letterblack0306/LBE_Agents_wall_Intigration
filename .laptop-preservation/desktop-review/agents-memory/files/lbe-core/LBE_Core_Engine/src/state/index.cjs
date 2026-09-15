'use strict';
// CJS state resolver — minimal subset for register.cjs preload use.
//
// ESM modules cannot be require()'d synchronously. This file duplicates the
// pure path-computation functions inline so register.cjs has no ESM dependency.
//
// Rule: this file must remain pure CJS. No import(), no top-level await.
// Policy authority: .lbe/policy.json remains authoritative. This file resolves
// central state paths only — it does not read or write policy.

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ── Inline mirrors of ESM functions (pure, no side effects) ─────────────────

function canonicalWorkspacePath(workspaceRoot) {
    var resolved;
    try {
        resolved = fs.realpathSync.native(workspaceRoot);
    } catch (_) {
        resolved = path.resolve(workspaceRoot);
    }
    var normalised = path.normalize(resolved);
    return process.platform === 'win32' ? normalised.toLowerCase() : normalised;
}

function workspaceId(workspaceRoot) {
    return crypto.createHash('sha256').update(canonicalWorkspacePath(workspaceRoot)).digest('hex');
}

function stateRoot() {
    var home = os.homedir();

    if (process.platform === 'win32') {
        var localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        return path.join(localAppData, 'LetterBlack', 'Sentinel');
    }

    if (process.platform === 'darwin') {
        var appSupport = process.env.HOME
            ? path.join(process.env.HOME, 'Library', 'Application Support')
            : path.join(home, 'Library', 'Application Support');
        return path.join(appSupport, 'LetterBlack', 'Sentinel');
    }

    // Linux / other POSIX
    var xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    return path.join(xdgData, 'LetterBlack', 'Sentinel');
}

function workspaceStateDir(root, id) {
    return path.join(root, 'workspaces', id.slice(0, 2), id.slice(2, 4), id.slice(4, 6), id);
}

function buildPaths(dir) {
    return {
        workspace:       path.join(dir, 'workspace.json'),
        events:          path.join(dir, 'lbe-events.jsonl'),
        intent:          path.join(dir, 'intent.jsonl'),
        targetRegistry:  path.join(dir, 'target_registry.jsonl'),
        fileIndexDir:    path.join(dir, 'file-index'),
        fileIndexBefore: path.join(dir, 'file-index', 'before.json'),
        fileIndexAfter:  path.join(dir, 'file-index', 'after.json'),
        proofDir:        path.join(dir, 'proof'),
        proofLatest:     path.join(dir, 'proof', 'latest.json'),
    };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves (and creates) the central state directory for a workspace.
 * Safe to call at preload time — only mkdirSync, no registry or audit writes.
 *
 * @param {string} workspaceRoot  Absolute path to the workspace root.
 * @returns {{ stateDir: string, workspaceId: string, paths: object }}
 */
function resolveWorkspaceStateSyncCjs(workspaceRoot) {
    var root = stateRoot();
    var id   = workspaceId(workspaceRoot);
    var dir  = workspaceStateDir(root, id);

    fs.mkdirSync(dir,                           { recursive: true });
    fs.mkdirSync(path.join(dir, 'file-index'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'proof'),      { recursive: true });

    return {
        stateDir:    dir,
        workspaceId: id,
        paths:       buildPaths(dir),
    };
}

module.exports = {
    resolveWorkspaceStateSyncCjs,
    stateRoot,
    workspaceId,
    workspaceStateDir,
};
