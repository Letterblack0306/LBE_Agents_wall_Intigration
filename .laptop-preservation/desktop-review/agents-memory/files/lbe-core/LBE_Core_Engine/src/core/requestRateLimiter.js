// src/core/requestRateLimiter.js
// Per-requester rate limiting with persistent backing store

import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite.js';

export class RequestRateLimiter {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = { entries: [] };
    }

    async load() {
        try {
            if (!fs.existsSync(this.dbPath)) {
                this.db = { entries: [] };
                return;
            }
            const data = fs.readFileSync(this.dbPath, 'utf8');
            this.db = JSON.parse(data);
            if (!Array.isArray(this.db.entries)) {
                this.db = { entries: [] };
            }
        } catch {
            this.db = { entries: [] };
        }
    }

    async save() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        atomicWriteFileSync(this.dbPath, JSON.stringify(this.db, null, 2), { encoding: 'utf8' });
    }

    checkAndRecord({ requesterId, nowSec, windowSec, maxRequests }) {
        const now = Number.isFinite(nowSec) ? nowSec : Math.floor(Date.now() / 1000);
        const window = Number.isFinite(windowSec) && windowSec > 0 ? windowSec : 60;
        const limit = Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 30;

        const cutoff = now - window;
        this.db.entries = this.db.entries.filter((entry) => entry.timestamp >= cutoff);

        const requesterEntries = this.db.entries.filter((entry) => entry.requesterId === requesterId);
        if (requesterEntries.length >= limit) {
            const oldest = requesterEntries.sort((a, b) => a.timestamp - b.timestamp)[0];
            const retryAfterSec = Math.max(1, window - (now - oldest.timestamp));
            return {
                ok: false,
                reason: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded for '${requesterId}' (${limit}/${window}s)`,
                retryAfterSec
            };
        }

        this.db.entries.push({ requesterId, timestamp: now });
        return {
            ok: true,
            reason: null,
            message: 'Rate limit check passed',
            retryAfterSec: 0
        };
    }
}
