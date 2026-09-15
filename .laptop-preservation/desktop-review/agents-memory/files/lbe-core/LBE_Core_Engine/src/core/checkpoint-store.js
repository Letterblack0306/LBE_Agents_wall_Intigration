// src/core/checkpoint-store.js
// Persistent storage for active workflow states and locks

import path from 'path';
import { atomicWriteFileSync, readJSONSafe } from './atomicWrite.js';

export class CheckpointStore {
    constructor(dbPath) {
        this.dbPath = dbPath || path.resolve('.lbe/data/checkpoints.db.json');
        this.store = { checkpoints: {}, tokens: {} };
        this._load();
    }

    _load() {
        const data = readJSONSafe(this.dbPath);
        if (data) {
            this.store = data;
            // Ensure defaults
            this.store.checkpoints = this.store.checkpoints || {};
            this.store.tokens = this.store.tokens || {};
        }
    }

    _save() {
        const jsonStr = JSON.stringify(this.store, null, 2);
        atomicWriteFileSync(this.dbPath, jsonStr, { encoding: 'utf8' });
    }

    // --- Checkpoint Management ---

    saveCheckpoint(jobId, state) {
        this.store.checkpoints[jobId] = {
            jobId,
            ...state,
            updatedAt: Date.now()
        };
        this._save();
    }

    getCheckpoint(jobId) {
        return this.store.checkpoints[jobId] || null;
    }

    getAllCheckpoints() {
        return Object.values(this.store.checkpoints);
    }

    removeCheckpoint(jobId) {
        if (this.store.checkpoints[jobId]) {
            delete this.store.checkpoints[jobId];
            this._save();
            return true;
        }
        return false;
    }

    // --- Approval Token Management ---

    saveToken(tokenId, tokenData) {
        this.store.tokens[tokenId] = {
            tokenId,
            ...tokenData,
            createdAt: Date.now()
        };
        this._save();
    }

    getToken(tokenId) {
        return this.store.tokens[tokenId] || null;
    }

    getAllTokens() {
        return Object.values(this.store.tokens);
    }

    removeToken(tokenId) {
        if (this.store.tokens[tokenId]) {
            delete this.store.tokens[tokenId];
            this._save();
            return true;
        }
        return false;
    }
}

// Singleton instance for default usage
let instance = null;

export function getCheckpointStore(dbPath) {
    if (!instance) {
        instance = new CheckpointStore(dbPath);
    }
    return instance;
}
