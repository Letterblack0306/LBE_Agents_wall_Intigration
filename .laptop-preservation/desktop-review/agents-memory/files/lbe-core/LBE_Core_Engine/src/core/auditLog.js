// src/core/auditLog.js
// Immutable append-only audit log with hash chaining
// Atomic writes with race condition protection

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteFileSync, withFileLock } from './atomicWrite.js';

function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function malformedAuditLineMessage(line, index, err) {
    const preview = String(line).slice(0, 500);
    return `Warning: Could not parse audit log line ${index + 1} (length=${String(line).length}): ${err.message}; preview=${preview}`;
}

function auditCorruptError(logPath, reason) {
    const err = new Error(`Audit log corrupt at ${logPath}: ${reason}`);
    err.code = 'AUDIT_LOG_CORRUPT';
    return err;
}

export function loadAuditLog(logPath) {
    try {
        if (!fs.existsSync(logPath)) {
            return { entries: [] };
        }
        const content = fs.readFileSync(logPath, 'utf8').trim();
        if (!content) return { entries: [] };

        const lines = content.split('\n');
        const entries = lines.map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (err) {
                console.warn(malformedAuditLineMessage(line, index, err));
                return null;
            }
        }).filter(e => e !== null);

        return { entries };
    } catch (err) {
        console.warn(`Warning: Could not load audit log at ${logPath}:`, err.message);
        return { entries: [] };
    }
}

export function getLastHash(logPath) {
    try {
        if (!fs.existsSync(logPath)) return { hash: 'GENESIS', corruptTail: false, corruptLineIndex: null };

        const content = fs.readFileSync(logPath, 'utf8').trim();
        if (!content) return { hash: 'GENESIS', corruptTail: false, corruptLineIndex: null };

        const lines = content.split('\n').filter(Boolean);
        let corruptTail = false;
        let corruptLineIndex = null;
        for (let index = lines.length - 1; index >= 0; index--) {
            const line = lines[index];
            try {
                const entry = JSON.parse(line);
                if (!entry.hash) {
                    corruptTail = true;
                    corruptLineIndex ??= index;
                    continue;
                }
                return { hash: entry.hash, corruptTail, corruptLineIndex };
            } catch {
                corruptTail = true;
                corruptLineIndex ??= index;
                continue;
            }
        }

        return { hash: 'GENESIS', corruptTail, corruptLineIndex };
    } catch (err) {
        throw auditCorruptError(logPath, err.message);
    }
}

export function appendAudit(logPath, entry) {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // ISSUE_005-followup: hold the file lock across read-prevHash + compute + write,
    // otherwise concurrent appendAudit() calls can both observe the same prevHash
    // and produce two records pointing at the same parent, breaking the chain.
    // We do the append inline (not via atomicAppendFileSync) to avoid re-acquiring
    // the same O_EXCL lock and deadlocking.
    let result;
    withFileLock(logPath, () => {
        const prevHashResult = getLastHash(logPath);
        const prevHash = prevHashResult.hash;
        const record = {
            ...entry,
            prevHash,
            timestamp: new Date().toISOString()
        };

        // Remove hash field if present, to calculate fresh
        delete record.hash;

        const recordStr = JSON.stringify(record);
        const hash = sha256(recordStr);

        const final = JSON.stringify({ ...record, hash });

        let existingContent = '';
        if (fs.existsSync(logPath)) {
            existingContent = fs.readFileSync(logPath, 'utf8');
        }
        try {
            atomicWriteFileSync(logPath, existingContent + final + '\n', { encoding: 'utf8' });
        } catch (err) {
            throw new Error(`Audit log write failed: ${err.message}`);
        }

        result = {
            success: true,
            hash,
            prevHash,
            corruptTail: prevHashResult.corruptTail,
            corruptLineIndex: prevHashResult.corruptLineIndex,
            message: prevHashResult.corruptTail
                ? `Audit log had a malformed trailing record at line ${prevHashResult.corruptLineIndex + 1}; appended new entry after last valid record.`
                : 'Audit entry appended'
        };
    });
    return result;
}

export function verifyAuditLogIntegrity(logPath, options = {}) {
    const failFast = options.failFast !== false;
    const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
        ? Math.floor(options.maxEntries)
        : null;

    const response = {
        ok: true,
        file: path.resolve(logPath),
        entries: 0,
        valid: true,
        firstInvalidIndex: null,
        reason: null,
        errors: [],
        message: 'Audit log verified'
    };

    try {
        if (!fs.existsSync(logPath)) {
            response.message = 'Audit log file not found (treated as empty)';
            return response;
        }

        const raw = fs.readFileSync(logPath, 'utf8').trim();
        if (!raw) {
            response.message = 'Empty audit log';
            return response;
        }

        const allLines = raw.split('\n');
        const lines = maxEntries ? allLines.slice(0, maxEntries) : allLines;
        response.entries = lines.length;

        let expectedPrevHash = 'GENESIS';

        for (let i = 0; i < lines.length; i++) {
            let entry;
            try {
                entry = JSON.parse(lines[i]);
            } catch {
                const errObj = {
                    index: i,
                    reason: 'INVALID_JSON_LINE',
                    message: `Line ${i} is not valid JSON`
                };
                response.valid = false;
                response.ok = false;
                response.firstInvalidIndex ??= i;
                response.reason ??= errObj.reason;
                response.errors.push(errObj);
                if (failFast) break;
                continue;
            }

            if (entry.prevHash !== expectedPrevHash) {
                const errObj = {
                    index: i,
                    reason: 'PREV_HASH_MISMATCH',
                    message: `Expected prevHash '${expectedPrevHash}', got '${entry.prevHash}'`
                };
                response.valid = false;
                response.ok = false;
                response.firstInvalidIndex ??= i;
                response.reason ??= errObj.reason;
                response.errors.push(errObj);
                if (failFast) break;
            }

            const recordCopy = { ...entry };
            const recordHash = recordCopy.hash;
            delete recordCopy.hash;

            const expectedHash = sha256(JSON.stringify(recordCopy));
            if (recordHash !== expectedHash) {
                const errObj = {
                    index: i,
                    reason: 'HASH_MISMATCH',
                    message: `Expected hash '${expectedHash}', got '${recordHash}'`
                };
                response.valid = false;
                response.ok = false;
                response.firstInvalidIndex ??= i;
                response.reason ??= errObj.reason;
                response.errors.push(errObj);
                if (failFast) break;
            }

            expectedPrevHash = recordHash;
        }

        response.message = response.valid
            ? `Audit log verified: ${response.entries} entries`
            : `Audit log integrity failed at index ${response.firstInvalidIndex}`;

        return response;
    } catch (err) {
        return {
            ok: false,
            file: path.resolve(logPath),
            entries: 0,
            valid: false,
            firstInvalidIndex: null,
            reason: 'AUDIT_VERIFY_ERROR',
            errors: [{ index: null, reason: 'AUDIT_VERIFY_ERROR', message: err.message }],
            message: `Integrity check failed: ${err.message}`
        };
    }
}
