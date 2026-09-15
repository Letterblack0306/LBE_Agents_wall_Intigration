// src/core/atomicWrite.js
// Atomic file writing (write to temp → rename) + cross-process advisory lock

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// withFileLock — zero-dependency cross-process advisory lock (ISSUE_005).
//
// Race fixed: read-modify-write sequences (e.g. atomicAppendFileSync,
// NonceStore.save) could lose updates if two processes interleaved their
// read and write phases. The atomic rename only protected against torn
// writes, not against lost updates.
//
// Mechanism: open <target>.lock with O_EXCL ('wx'). EEXIST → spin with
// jittered backoff. Stale locks (older than staleMs) are forcibly removed.
// Lock file content is "pid:<owner>:<acquiredAt>" for forensic debugging.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_LOCK_OPTS = {
    timeoutMs: 5000,    // total wait before giving up
    pollMs: 15,         // base poll interval (jittered)
    staleMs: 30_000     // lock files older than this are presumed orphaned
};

function _lockPathFor(targetPath) {
    return targetPath + '.lock';
}

function _tryAcquire(lockPath) {
    try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, `pid:${process.pid}:${Date.now()}`);
        fs.closeSync(fd);
        return true;
    } catch (err) {
        // EEXIST: another holder owns the lock.
        // EPERM/EBUSY/EACCES: Windows transient state during unlink/create
        // race — treat as "not acquired right now, retry".
        if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
            return false;
        }
        throw err;
    }
}

function _removeIfStale(lockPath, staleMs) {
    try {
        const stat = fs.statSync(lockPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > staleMs) {
            try { fs.unlinkSync(lockPath); } catch { /* lost the race; OK */ }
        }
    } catch { /* lock vanished; OK */ }
}

function _sleepSync(ms) {
    // Synchronous sleep so this lock works inside *Sync APIs.
    const waitMs = Math.max(1, Math.floor(ms));
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
        return;
    } catch {
        // SharedArrayBuffer unavailable. Avoid a multi-second spin loop.
    }

    const code = `setTimeout(() => {}, ${JSON.stringify(waitMs)})`;
    const slept = spawnSync(process.execPath, ['-e', code], {
        stdio: 'ignore',
        timeout: waitMs + 1000,
        windowsHide: true,
    });
    if (!slept.error) return;

    // Last-resort bounded fallback: never burn CPU for the full lock timeout.
    const end = Date.now() + Math.min(waitMs, 5);
    while (Date.now() < end) {}
}

export function withFileLock(targetPath, optsOrFn, maybeFn) {
    const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn;
    const opts = typeof optsOrFn === 'function' ? {} : (optsOrFn || {});
    const { timeoutMs, pollMs, staleMs } = { ...DEFAULT_LOCK_OPTS, ...opts };

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const lockPath = _lockPathFor(targetPath);
    const deadline = Date.now() + timeoutMs;
    let acquired = false;

    while (!acquired) {
        acquired = _tryAcquire(lockPath);
        if (acquired) break;
        if (Date.now() >= deadline) {
            _removeIfStale(lockPath, staleMs);
            // Final attempt after stale cleanup.
            acquired = _tryAcquire(lockPath);
            if (acquired) break;
            const err = new Error(`withFileLock: timeout acquiring ${lockPath} after ${timeoutMs}ms`);
            err.code = 'ELOCKTIMEOUT';
            throw err;
        }
        _removeIfStale(lockPath, staleMs);
        const jitter = Math.floor(Math.random() * pollMs);
        _sleepSync(pollMs + jitter);
    }

    try {
        return fn();
    } finally {
        try { fs.unlinkSync(lockPath); } catch { /* already gone; OK */ }
    }
}

export function atomicWriteFileSync(filePath, data, options = {}) {
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Create temp file in same directory (required for atomic rename)
    const tempFile = path.join(dir, `.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);

    try {
        // Write to temp file
        fs.writeFileSync(tempFile, data, options);

        // Atomic rename (POSIX atomic operation)
        fs.renameSync(tempFile, filePath);
    } catch (error) {
        // Clean up temp file on error
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        throw error;
    }
}

export function atomicAppendFileSync(filePath, data, options = {}) {
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // ISSUE_005 fix: serialise read-modify-write across processes via lockfile
    // so concurrent appenders (audit log, nonce DB) cannot lose updates.
    withFileLock(filePath, () => {
        let existingContent = '';
        if (fs.existsSync(filePath)) {
            existingContent = fs.readFileSync(filePath, options.encoding || 'utf8');
        }
        const combinedData = existingContent + data;
        atomicWriteFileSync(filePath, combinedData, options);
    });
}

/**
 * Atomically write JSON data
 */
export async function atomicWriteJSON(filePath, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    atomicWriteFileSync(filePath, jsonStr, { encoding: 'utf8' });
}

/**
 * Safely read JSON file (returns null on error)
 */
export function readJSONSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error(`[atomicWrite] Failed to read JSON from ${filePath}:`, e.message);
        return null;
    }
}
