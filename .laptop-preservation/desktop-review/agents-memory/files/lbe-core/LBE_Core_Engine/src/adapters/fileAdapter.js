// src/adapters/fileAdapter.js
// Safe file read/write/patch/delete with path-containment and auto-backup

import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from '../core/atomicWrite.js';
import { createBackup, restoreBackup } from '../core/backup.js';

const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB

function resolvedTarget(target, cwd) {
    if (!target) return null;
    return path.isAbsolute(target) ? path.resolve(target) : path.resolve(cwd || process.cwd(), target);
}

function isUnderRoot(targetPath, roots) {
    const norm = resolvePhysicalPath(targetPath);
    return roots.some(r => {
        const root = resolvePhysicalPath(r);
        return norm === root || norm.startsWith(root + path.sep);
    });
}

// Resolve symlinks even for a target that does not exist yet. Without this,
// <root>/link/outside.txt passes lexical containment and writes outside root.
function resolvePhysicalPath(candidate) {
    let current = path.resolve(candidate);
    const suffix = [];
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) break;
        suffix.unshift(path.basename(current));
        current = parent;
    }
    try { current = fs.realpathSync(current); } catch { /* lexical fallback */ }
    return path.join(current, ...suffix);
}

function matchesDenyPattern(str, patterns) {
    for (const pattern of (patterns || [])) {
        const rx = new RegExp(
            '^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/\\\\]*') + '$'
        );
        if (rx.test(str)) return pattern;
    }
    return null;
}

function blocked(cmd, code, message, exitCode = 2) {
    return {
        adapter: 'file',
        commandId: cmd.commandId,
        status: 'blocked',
        errorCode: code,
        error: message,
        exitCode
    };
}

function fail(cmd, code, message, backup = null, exitCode = 1) {
    return {
        adapter: 'file',
        commandId: cmd.commandId,
        status: 'error',
        errorCode: code,
        error: message,
        backup: backup ? summariseBackup(backup) : null,
        exitCode
    };
}

function summariseBackup(b) {
    return b ? { path: b.backupPath, existed: b.existed, hash: b.hash, createdAt: b.createdAt } : null;
}

export async function fileAdapter(cmd, policy, requester) {
    const payload = cmd.payload;
    const action = payload.action;
    const cwd = payload.cwd || process.cwd();
    const target = resolvedTarget(payload.target, cwd);

    if (!action) return blocked(cmd, 'FILE_NO_ACTION', 'payload.action is required');
    if (!target && action !== 'noop') return blocked(cmd, 'FILE_NO_TARGET', 'payload.target is required');

    // Path containment
    const roots = requester?.filesystem?.roots || [];
    if (roots.length === 0) return blocked(cmd, 'FILE_NO_ROOTS', 'No filesystem roots defined for requester');
    if (!isUnderRoot(target, roots)) return blocked(cmd, 'FILE_OUTSIDE_ROOT', `'${target}' is outside allowed roots`);

    // Deny patterns
    const denied = matchesDenyPattern(target, requester?.filesystem?.denyPatterns);
    if (denied) return blocked(cmd, 'FILE_PATH_DENIED', `'${target}' matches deny pattern: ${denied}`);

    switch (action) {
        case 'read':   return doRead(cmd, target);
        case 'write':  return doWrite(cmd, target, payload);
        case 'patch':  return doPatch(cmd, target, payload);
        case 'delete': return doDelete(cmd, target);
        default:       return blocked(cmd, 'FILE_UNKNOWN_ACTION', `Unknown action: '${action}'`);
    }
}

function doRead(cmd, target) {
    if (!fs.existsSync(target)) return fail(cmd, 'FILE_NOT_FOUND', `Not found: ${target}`);
    try {
        const stat = fs.statSync(target);
        if (stat.size > MAX_READ_BYTES) return fail(cmd, 'FILE_TOO_LARGE', 'File exceeds 10 MB read limit');
        const content = fs.readFileSync(target, 'utf8');
        return {
            adapter: 'file', action: 'read',
            commandId: cmd.commandId,
            status: 'completed',
            target,
            output: content,
            bytesRead: stat.size,
            exitCode: 0
        };
    } catch (e) {
        return fail(cmd, 'FILE_READ_ERROR', e.message);
    }
}

function doWrite(cmd, target, payload) {
    const content = payload.content;
    if (content === undefined || content === null) {
        return fail(cmd, 'FILE_MISSING_CONTENT', 'payload.content is required for write');
    }
    const backup = tryBackup(target);
    try {
        atomicWriteFileSync(target, content, { encoding: 'utf8' });
        return {
            adapter: 'file', action: 'write',
            commandId: cmd.commandId,
            status: 'completed',
            target,
            backup: summariseBackup(backup),
            output: `Wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${target}`,
            exitCode: 0
        };
    } catch (e) {
        restoreBackup(backup);
        return fail(cmd, 'FILE_WRITE_ERROR', e.message, backup);
    }
}

function doPatch(cmd, target, payload) {
    const content = payload.content;
    if (content === undefined || content === null) {
        return fail(cmd, 'FILE_MISSING_CONTENT', 'payload.content is required for patch');
    }
    const backup = tryBackup(target);
    try {
        atomicWriteFileSync(target, content, { encoding: 'utf8' });
        return {
            adapter: 'file', action: 'patch',
            commandId: cmd.commandId,
            status: 'completed',
            target,
            backup: summariseBackup(backup),
            output: `Patched ${target} (${Buffer.byteLength(content, 'utf8')} bytes)`,
            exitCode: 0
        };
    } catch (e) {
        restoreBackup(backup);
        return fail(cmd, 'FILE_PATCH_ERROR', e.message, backup);
    }
}

function doDelete(cmd, target) {
    if (!fs.existsSync(target)) return fail(cmd, 'FILE_NOT_FOUND', `Not found: ${target}`);
    const backup = tryBackup(target);
    try {
        fs.unlinkSync(target);
        return {
            adapter: 'file', action: 'delete',
            commandId: cmd.commandId,
            status: 'completed',
            target,
            backup: summariseBackup(backup),
            output: `Deleted ${target}`,
            exitCode: 0
        };
    } catch (e) {
        restoreBackup(backup);
        return fail(cmd, 'FILE_DELETE_ERROR', e.message, backup);
    }
}

function tryBackup(target) {
    try {
        return createBackup(target);
    } catch {
        return null;
    }
}
