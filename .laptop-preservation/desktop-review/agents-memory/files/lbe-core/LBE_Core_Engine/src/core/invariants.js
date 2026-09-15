// src/core/invariants.js
// Pre-execute invariant gate — blocks execution if foundational config is broken.
// Inspired by LB CEP Engine runtime-guards.js pattern.
//
// Called inside lbe.execute() after policy + keys are loaded, before any state mutation.
// Throws InvariantGateError immediately so callers get a hard, named failure
// instead of a silent downstream crash.

import fs from 'fs';
import path from 'path';
import { AVAILABLE_ADAPTERS } from '../adapters/index.js';

export class InvariantGateError extends Error {
    constructor(message, checks, failures) {
        super(message);
        this.name = 'InvariantGateError';
        this.checks = checks;
        this.failures = failures;
    }
}

export function checkInvariants(cfg, policy, keyStore) {
    const checks = {};
    const failures = [];

    // 1. Policy structure
    const policyOk = !!(
        policy &&
        typeof policy.version !== 'undefined' &&
        policy.requesters &&
        typeof policy.requesters === 'object' &&
        policy.default === 'DENY'
    );
    checks.policy_structure = policyOk;
    if (!policyOk) failures.push('Policy missing required fields: version, requesters, default=DENY');

    // 2. Trusted keys loaded
    const keysOk = !!(keyStore && typeof keyStore === 'object' && Object.keys(keyStore).length > 0);
    checks.keys_available = keysOk;
    if (!keysOk) failures.push('No trusted keys loaded — provide .lbe/config/keys.json');

    // 3. Audit log directory writable
    const auditDir = path.dirname(cfg.auditLog);
    checks.audit_log_writable = prepareRuntimeDir(auditDir);
    if (!checks.audit_log_writable) failures.push(`Audit log directory not writable: ${auditDir}`);

    // 4. Nonce DB directory writable
    const nonceDir = path.dirname(cfg.nonceDb);
    checks.nonce_db_writable = prepareRuntimeDir(nonceDir);
    if (!checks.nonce_db_writable) failures.push(`Nonce DB directory not writable: ${nonceDir}`);

    // 5. Rate-limit DB directory writable
    const rlDir = path.dirname(cfg.rateLimit);
    checks.rate_limit_writable = prepareRuntimeDir(rlDir);
    if (!checks.rate_limit_writable) failures.push(`Rate-limit DB directory not writable: ${rlDir}`);

    // 6. Policy adapter references — warn only, not a hard block.
    if (policy && policy.requesters) {
        const unknown = [];
        for (const [requesterId, req] of Object.entries(policy.requesters)) {
            for (const adapter of (req.allowAdapters || [])) {
                if (!AVAILABLE_ADAPTERS.includes(adapter)) {
                    unknown.push(`${requesterId}→${adapter}`);
                }
            }
        }
        checks.adapter_chain_valid = unknown.length === 0;
        checks.adapter_chain_warnings = unknown.length > 0 ? unknown : [];
        // Intentionally not pushed to failures so policies can be migrated safely.
    } else {
        checks.adapter_chain_valid = true;
        checks.adapter_chain_warnings = [];
    }

    // 7. Secret key present (passed by createLBE caller)
    checks.secret_key_present = !!(cfg.secretKey);
    if (!checks.secret_key_present) failures.push('secretKey not provided to createLBE()');

    return {
        ok: failures.length === 0,
        checks,
        failures
    };
}

export function assertInvariants(cfg, policy, keyStore) {
    const result = checkInvariants(cfg, policy, keyStore);
    if (!result.ok) {
        const count = result.failures.length;
        throw new InvariantGateError(
            `Invariant gate: ${count} violation${count === 1 ? '' : 's'} — ${result.failures.join(' | ')}`,
            result.checks,
            result.failures
        );
    }
    return result;
}

// Pure check — no side effects. Returns true if dir exists and is writable.
export function checkWritable(dir) {
    try {
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

// Ensures dir exists and is writable; creates it if missing.
// Used by checkInvariants() at runtime — acceptable side effect there.
export function prepareRuntimeDir(dir) {
    if (checkWritable(dir)) return true;
    try {
        fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch {
        return false;
    }
}
