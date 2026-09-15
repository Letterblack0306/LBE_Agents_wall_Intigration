// src/core/trustedKeys.js
// Trusted key store loader and key resolution

import fs from 'fs';
import path from 'path';

const KEY_ID_PATTERN = /^[A-Za-z0-9:_-]{3,128}$/;

export function isValidKeyId(keyId) {
    return typeof keyId === 'string' && KEY_ID_PATTERN.test(keyId) && keyId !== 'default';
}

export function loadKeysStore(keysStorePath) {
    const resolvedPath = path.resolve(keysStorePath);
    if (!fs.existsSync(resolvedPath)) {
        return {
            ok: false,
            reason: 'KEY_STORE_MISSING',
            message: `Key store not found: ${resolvedPath}`,
            store: null
        };
    }

    try {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.trustedKeys !== 'object') {
            return {
                ok: false,
                reason: 'KEY_STORE_INVALID',
                message: `Invalid key store format: ${resolvedPath}`,
                store: null
            };
        }

        return {
            ok: true,
            reason: null,
            message: 'Key store loaded',
            store: parsed
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'KEY_STORE_INVALID_JSON',
            message: `Unable to parse key store: ${error.message}`,
            store: null
        };
    }
}

export function resolveTrustedPublicKey({ keyStore, keyId, requesterId, now = new Date() }) {
    if (!keyStore || typeof keyStore !== 'object') {
        return {
            ok: false,
            reason: 'KEY_STORE_UNAVAILABLE',
            message: 'Trusted key store is not available',
            publicKey: null
        };
    }

    if (!isValidKeyId(keyId)) {
        return {
            ok: false,
            reason: 'KEY_ID_INVALID',
            message: `Invalid keyId '${keyId}'. Use versioned key IDs like 'agent:gpt-v1-2026Q1'`,
            publicKey: null
        };
    }

    const keyConfig = keyStore.trustedKeys?.[keyId];
    if (!keyConfig) {
        return {
            ok: false,
            reason: 'KEY_NOT_TRUSTED',
            message: `Key '${keyId}' is not in trusted key store`,
            publicKey: null
        };
    }

    if (keyConfig.deprecated) {
        return {
            ok: false,
            reason: 'KEY_DEPRECATED',
            message: `Key '${keyId}' is deprecated`,
            publicKey: null
        };
    }

    if (keyConfig.requesterId && keyConfig.requesterId !== requesterId) {
        return {
            ok: false,
            reason: 'KEY_REQUESTER_MISMATCH',
            message: `Key '${keyId}' is not authorized for requester '${requesterId}'`,
            publicKey: null
        };
    }

    // Enforce lifecycle metadata. New schema fields are `notBefore` and `expiresAt`.
    // `validFrom` / `validUntil` remain supported as backward-compatible aliases.
    const notBeforeRaw = keyConfig.notBefore || keyConfig.validFrom;
    const expiresAtRaw = keyConfig.expiresAt || keyConfig.validUntil;
    if (typeof notBeforeRaw !== 'string' || typeof expiresAtRaw !== 'string') {
        return {
            ok: false,
            reason: 'KEY_LIFECYCLE_INVALID',
            message: `Key '${keyId}' must define lifecycle fields 'notBefore' and 'expiresAt'`,
            publicKey: null
        };
    }

    const notBefore = new Date(notBeforeRaw);
    const expiresAt = new Date(expiresAtRaw);
    if (Number.isNaN(notBefore.getTime()) || Number.isNaN(expiresAt.getTime())) {
        return {
            ok: false,
            reason: 'KEY_LIFECYCLE_INVALID',
            message: `Key '${keyId}' has invalid lifecycle timestamp(s)`,
            publicKey: null
        };
    }

    if (notBefore >= expiresAt) {
        return {
            ok: false,
            reason: 'KEY_LIFECYCLE_INVALID',
            message: `Key '${keyId}' has notBefore >= expiresAt`,
            publicKey: null
        };
    }

    if (now < notBefore) {
        return {
            ok: false,
            reason: 'KEY_NOT_YET_VALID',
            message: `Key '${keyId}' not valid until ${notBeforeRaw}`,
            publicKey: null
        };
    }

    if (now > expiresAt) {
        return {
            ok: false,
            reason: 'KEY_EXPIRED',
            message: `Key '${keyId}' expired on ${expiresAtRaw}`,
            publicKey: null
        };
    }

    if (!keyConfig.publicKey || typeof keyConfig.publicKey !== 'string') {
        return {
            ok: false,
            reason: 'KEY_CONFIG_INVALID',
            message: `Trusted key '${keyId}' is missing publicKey`,
            publicKey: null
        };
    }

    return {
        ok: true,
        reason: null,
        message: 'Trusted key resolved',
        publicKey: keyConfig.publicKey
    };
}
