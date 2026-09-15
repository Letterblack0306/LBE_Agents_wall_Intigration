// src/core/approval-token.js
// Manage asynchronous approval tokens for gated workflows

import crypto from 'crypto';
import { getCheckpointStore } from './checkpoint-store.js';

export class ApprovalManager {
    constructor(storePath) {
        this.store = getCheckpointStore(storePath);
        // Pending approval callbacks, to be re-bound or triggered
        this._pendingResolvers = new Map();
    }

    /**
     * Create a new approval token and persist it
     * @param {string} jobId The workflow or job ID awaiting approval
     * @param {object} context Contextual data for the approver
     */
    createToken(jobId, context = {}) {
        const tokenId = crypto.randomBytes(16).toString('hex');
        
        const tokenData = {
            jobId,
            context,
            status: 'pending',
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };

        this.store.saveToken(tokenId, tokenData);
        return tokenId;
    }

    /**
     * Rehydrate an approval wait into memory.
     * This allows a resumed workflow to await a previously created token.
     * @param {string} tokenId The token to await
     * @returns {Promise} Resolves when approved, rejects when denied or expired
     */
    awaitApproval(tokenId) {
        const token = this.store.getToken(tokenId);
        if (!token) {
            return Promise.reject(new Error(`Approval token ${tokenId} not found`));
        }

        if (token.status !== 'pending') {
            return Promise.reject(new Error(`Approval token ${tokenId} is no longer pending (status: ${token.status})`));
        }

        if (Date.now() > token.expiresAt) {
            this.store.removeToken(tokenId);
            return Promise.reject(new Error(`Approval token ${tokenId} expired`));
        }

        return new Promise((resolve, reject) => {
            this._pendingResolvers.set(tokenId, { resolve, reject });
        });
    }

    /**
     * Approve a pending token
     */
    approve(tokenId, approverData = {}) {
        const token = this.store.getToken(tokenId);
        if (!token) throw new Error('Token not found');
        if (token.status !== 'pending') throw new Error('Token not pending');

        // Update persistence
        this.store.saveToken(tokenId, { ...token, status: 'approved', approverData, resolvedAt: Date.now() });

        // Trigger in-memory resolver if listening
        const resolver = this._pendingResolvers.get(tokenId);
        if (resolver) {
            resolver.resolve({ approved: true, approverData });
            this._pendingResolvers.delete(tokenId);
        }

        // Token can optionally be removed from store, but keeping it as 'approved' leaves an audit trail
        return true;
    }

    /**
     * Deny a pending token
     */
    deny(tokenId, reason = 'Manually denied') {
        const token = this.store.getToken(tokenId);
        if (!token) throw new Error('Token not found');
        if (token.status !== 'pending') throw new Error('Token not pending');

        // Update persistence
        this.store.saveToken(tokenId, { ...token, status: 'denied', reason, resolvedAt: Date.now() });

        // Trigger in-memory resolver if listening
        const resolver = this._pendingResolvers.get(tokenId);
        if (resolver) {
            resolver.reject(new Error(`Approval denied: ${reason}`));
            this._pendingResolvers.delete(tokenId);
        }

        return true;
    }
}

// Singleton instance
let instance = null;

export function getApprovalManager(storePath) {
    if (!instance) {
        instance = new ApprovalManager(storePath);
    }
    return instance;
}
