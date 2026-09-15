'use strict';
// CJS-only JSONL append with O_EXCL file lock.
// Used by register.cjs at preload time — no ESM imports, no external dependencies.
//
// Design: best-effort, never throws, never spins.
//   - Lock acquired with O_EXCL (atomic on both POSIX and NTFS).
//   - If lock is fresh and held by another process → skip, return false.
//   - If lock is stale (older than LOCK_STALE_MS) → remove it, retry once.
//   - All errors are swallowed — audit logging must never crash the agent.

const fs   = require('fs');
const path = require('path');

const LOCK_STALE_MS = 5000; // locks older than 5s are from crashed processes

// Pre-patch unlink injected by register.cjs so lock removal never goes through
// the hook (which would trigger a patched fs.unlinkSync → decide → auditEvent
// cycle). register.cjs calls setNativeUnlink(origFs.unlinkSync) immediately
// after capturing origFs, before patching fs.
var _nativeUnlink = null;
function setNativeUnlink(fn) { _nativeUnlink = fn; }

/**
 * Appends a JSON record as a single JSONL line to filePath.
 * A `ts` field (Unix seconds) is injected if not already present.
 *
 * @param {string} filePath  Target JSONL file path.
 * @param {object} record    Plain object to append.
 * @returns {boolean}        true = written, false = skipped (lock busy or error).
 */
function appendJsonlSync(filePath, record) {
    const lockPath = filePath + '.lock';

    // ── Ensure directory exists ──────────────────────────────────────────────
    const dir = path.dirname(filePath);
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
        return false;
    }

    // ── Acquire lock (O_EXCL — atomic, fails immediately if held) ───────────
    var lockFd;
    try {
        lockFd = fs.openSync(lockPath, 'wx'); // O_WRONLY | O_CREAT | O_EXCL
    } catch (e) {
        if (e.code !== 'EEXIST') return false; // unexpected — skip

        // Lock file exists — check if stale
        try {
            var stat  = fs.statSync(lockPath);
            var ageMs = Date.now() - stat.mtimeMs;
            if (ageMs <= LOCK_STALE_MS) return false; // fresh lock — skip
        } catch (_) {
            return false; // can't stat — skip
        }

        // Stale lock — remove and retry once
        try { fs.unlinkSync(lockPath); } catch (_) { return false; }
        try {
            lockFd = fs.openSync(lockPath, 'wx');
        } catch (_) {
            return false; // still busy after cleanup — skip
        }
    }

    // ── Write JSONL line while holding lock ──────────────────────────────────
    try {
        var ts   = Math.floor(Date.now() / 1000);
        var line = JSON.stringify(Object.assign({ ts: ts }, record)) + '\n';
        var fd   = fs.openSync(filePath, 'a');
        try {
            fs.writeSync(fd, line);
        } finally {
            fs.closeSync(fd);
        }
        return true;
    } catch (_) {
        return false;
    } finally {
        // Always release lock — use native (pre-patch) unlink to avoid hook recursion
        try { fs.closeSync(lockFd); } catch (_) {}
        try { (_nativeUnlink || fs.unlinkSync)(lockPath); } catch (_) {}
    }
}

module.exports = { appendJsonlSync, setNativeUnlink };
