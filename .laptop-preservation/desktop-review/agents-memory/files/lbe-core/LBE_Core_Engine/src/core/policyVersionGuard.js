// src/core/policyVersionGuard.js
// Policy version monotonicity and timestamp guard

import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite.js';

function parsePolicyVersion(version) {
    if (typeof version === 'number' && Number.isFinite(version)) {
        return { ok: true, kind: 'int', parts: [Math.floor(version)], raw: String(version) };
    }
    if (typeof version !== 'string' || !version.trim()) {
        return { ok: false, reason: 'POLICY_VERSION_INVALID', message: 'Policy version is required' };
    }

    const trimmed = version.trim();
    if (/^\d+$/.test(trimmed)) {
        return { ok: true, kind: 'int', parts: [Number(trimmed)], raw: trimmed };
    }

    const semver = trimmed.replace(/^v/i, '');
    if (/^\d+(\.\d+){0,2}$/.test(semver)) {
        const parsed = semver.split('.').map((n) => Number(n));
        while (parsed.length < 3) {
            parsed.push(0);
        }
        return { ok: true, kind: 'semver', parts: parsed, raw: trimmed };
    }

    return {
        ok: false,
        reason: 'POLICY_VERSION_INVALID',
        message: `Unsupported policy version format '${version}' (use integer or semver)`
    };
}

function compareVersions(a, b) {
    const len = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < len; i++) {
        const av = a.parts[i] ?? 0;
        const bv = b.parts[i] ?? 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function parseCreatedAt(createdAt) {
    if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
        // Accept epoch seconds (or ms, if obviously too large).
        const sec = createdAt > 1e12 ? Math.floor(createdAt / 1000) : Math.floor(createdAt);
        return { ok: true, epochSec: sec };
    }

    if (typeof createdAt !== 'string' || !createdAt.trim()) {
        return {
            ok: false,
            reason: 'POLICY_CREATED_AT_INVALID',
            message: 'Policy createdAt is required'
        };
    }

    const ts = Date.parse(createdAt);
    if (Number.isNaN(ts)) {
        return {
            ok: false,
            reason: 'POLICY_CREATED_AT_INVALID',
            message: `Invalid policy createdAt '${createdAt}'`
        };
    }

    return { ok: true, epochSec: Math.floor(ts / 1000) };
}

function loadPolicyState(statePath) {
    if (!fs.existsSync(statePath)) {
        return {
            schemaVersion: '1',
            lastAccepted: null,
            updatedAt: null
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Policy state file has invalid structure');
        }
        return {
            schemaVersion: String(parsed.schemaVersion || '1'),
            lastAccepted: parsed.lastAccepted && typeof parsed.lastAccepted === 'object'
                ? parsed.lastAccepted
                : null,
            updatedAt: parsed.updatedAt || null
        };
    } catch (err) {
        throw new Error(`Policy state at ${statePath} is corrupt or unreadable: ${err.message}`);
    }
}

function savePolicyState(statePath, stateObj) {
    const payload = JSON.stringify(stateObj, null, 2);
    atomicWriteFileSync(statePath, payload, { encoding: 'utf8' });
}

export function validateAndUpdatePolicyVersionState({
    policyObj,
    statePath = path.resolve('.lbe/data/policy.state.json'),
    maxCreatedAtSkewSec = 31536000,
    nowSec = Math.floor(Date.now() / 1000),
    persist = true
}) {
    const version = parsePolicyVersion(policyObj?.version);
    if (!version.ok) {
        return {
            ok: false,
            reason: version.reason,
            message: version.message,
            updated: false
        };
    }

    const createdAt = parseCreatedAt(policyObj?.createdAt);
    if (!createdAt.ok) {
        return {
            ok: false,
            reason: createdAt.reason,
            message: createdAt.message,
            updated: false
        };
    }

    const skew = Math.abs(nowSec - createdAt.epochSec);
    const allowedSkew = Number.isFinite(maxCreatedAtSkewSec) && maxCreatedAtSkewSec > 0
        ? Math.floor(maxCreatedAtSkewSec)
        : 31536000;
    if (skew > allowedSkew) {
        return {
            ok: false,
            reason: 'POLICY_CREATED_AT_SKEW_EXCEEDED',
            message: `Policy createdAt skew ${skew}s exceeds allowed ${allowedSkew}s`,
            updated: false
        };
    }

    let state;
    try {
        state = loadPolicyState(statePath);
    } catch (err) {
        return {
            ok: false,
            reason: 'POLICY_STATE_CORRUPT',
            message: err.message,
            updated: false
        };
    }
    const previous = state.lastAccepted;
    let previousVersion = null;
    let previousCreatedAt = null;
    let versionCompare = 0;

    if (previous) {
        previousVersion = parsePolicyVersion(previous.version);
        previousCreatedAt = parseCreatedAt(previous.createdAt);

        if (previousVersion.ok && previousCreatedAt.ok) {
            versionCompare = compareVersions(version, previousVersion);
            if (versionCompare < 0) {
                return {
                    ok: false,
                    reason: 'POLICY_VERSION_REGRESSION',
                    message: `Policy version regression: current '${version.raw}' < last '${previousVersion.raw}'`,
                    updated: false
                };
            }

            if (versionCompare === 0 && createdAt.epochSec < previousCreatedAt.epochSec) {
                return {
                    ok: false,
                    reason: 'POLICY_CREATED_AT_REGRESSION',
                    message: `Policy createdAt regression: current '${policyObj.createdAt}' < last '${previous.createdAt}'`,
                    updated: false
                };
            }

            if (versionCompare > 0 && createdAt.epochSec < previousCreatedAt.epochSec) {
                return {
                    ok: false,
                    reason: 'POLICY_CREATED_AT_REGRESSION',
                    message: `Policy createdAt must be monotonic when version increases`,
                    updated: false
                };
            }
        }
    }

    const shouldUpdate = !previous
        || !previousVersion?.ok
        || !previousCreatedAt?.ok
        || versionCompare > 0
        || (versionCompare === 0 && createdAt.epochSec > previousCreatedAt.epochSec);

    if (persist && shouldUpdate) {
        const nextState = {
            schemaVersion: '1',
            lastAccepted: {
                version: policyObj.version,
                createdAt: policyObj.createdAt,
                environment: policyObj.environment || null
            },
            updatedAt: new Date().toISOString()
        };
        savePolicyState(statePath, nextState);
    }

    return {
        ok: true,
        reason: null,
        message: 'Policy version guard passed',
        updated: shouldUpdate
    };
}
