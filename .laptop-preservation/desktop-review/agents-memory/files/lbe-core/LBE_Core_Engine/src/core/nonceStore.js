// src/core/nonceStore.js
// Nonce replay protection with TTL
// Race condition protection via atomic writes

import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite.js';

export class NonceStore {
    constructor(dbPath, ttlSec = 3600) {
        this.dbPath = dbPath;
        this.ttlSec = ttlSec;
        this.db = { entries: [] };
    }

    async load() {
        if (!fs.existsSync(this.dbPath)) {
            this.db = { entries: [] };
            return;
        }
        try {
            const data = fs.readFileSync(this.dbPath, 'utf8');
            this.db = JSON.parse(data);
            this.prune();
        } catch (err) {
            throw new Error(`Nonce DB at ${this.dbPath} is corrupt or unreadable: ${err.message}`);
        }
    }

    async save() {
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Atomic write to prevent corruption on concurrent access
            atomicWriteFileSync(this.dbPath, JSON.stringify(this.db, null, 2), { encoding: 'utf8' });
        } catch (err) {
            throw new Error(`Failed to save nonce DB: ${err.message}`);
        }
    }

    checkAndRecord({ requesterId, sessionId, nonce }) {
        const now = Math.floor(Date.now() / 1000);

        // Clean expired entries
        this.db.entries = this.db.entries.filter(e => (now - e.timestamp) <= this.ttlSec);

        const key = `${requesterId}|${sessionId}|${nonce}`;

        // Check for replay
        if (this.db.entries.some(e => e.key === key)) {
            return {
                ok: false,
                reason: 'REPLAY_NONCE',
                message: 'Nonce has already been used'
            };
        }

        // Record new nonce
        this.db.entries.push({ key, timestamp: now });

        return {
            ok: true,
            reason: null,
            message: 'Nonce accepted'
        };
    }

    prune() {
        const now = Math.floor(Date.now() / 1000);
        const before = this.db.entries.length;
        this.db.entries = this.db.entries.filter(e => (now - e.timestamp) <= this.ttlSec);
        const after = this.db.entries.length;
        return {
            prunedCount: before - after,
            remainingCount: after
        };
    }
}

// Legacy function exports for backward compatibility
export function loadNonceDB(dbPath) {
    if (!fs.existsSync(dbPath)) {
        return { entries: [] };
    }
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        throw new Error(`Nonce DB at ${dbPath} is corrupt or unreadable: ${err.message}`);
    }
}

export function saveNonceDB(dbPath, db) {
    try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Atomic write to prevent corruption
        atomicWriteFileSync(dbPath, JSON.stringify(db, null, 2), { encoding: 'utf8' });
    } catch (err) {
        throw new Error(`Failed to save nonce DB: ${err.message}`);
    }
}

export function checkAndRecordNonce(db, { requesterId, sessionId, nonce, timestamp }, ttlSec = 3600) {
    const now = Math.floor(Date.now() / 1000);

    // Clean expired entries
    db.entries = db.entries.filter(e => (now - e.timestamp) <= ttlSec);

    const key = `${requesterId}|${sessionId}|${nonce}`;

    // Check for replay
    if (db.entries.some(e => e.key === key)) {
        return {
            ok: false,
            reason: 'REPLAY_NONCE',
            message: 'Nonce has already been used'
        };
    }

    // Record new nonce
    db.entries.push({ key, timestamp });

    return {
        ok: true,
        reason: null,
        message: 'Nonce accepted'
    };
}

export function pruneExpiredNonces(db, ttlSec = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const before = db.entries.length;
    db.entries = db.entries.filter(e => (now - e.timestamp) <= ttlSec);
    const after = db.entries.length;
    return {
        prunedCount: before - after,
        remainingCount: after
    };
}
