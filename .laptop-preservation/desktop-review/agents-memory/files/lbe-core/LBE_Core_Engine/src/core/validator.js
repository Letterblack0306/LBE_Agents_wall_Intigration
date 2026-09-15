// src/core/validator.js
// Validation orchestrator — extracts flags from the command object and
// delegates all decision logic to the compiled WASM engine.

import { verifyEd25519 } from './signature.js';
import { validateAndUpdatePolicyVersionState } from './policyVersionGuard.js';
import {
    runValidationPipeline,
    checkNonce,
    checkRateLimit,
    classifyRisk,
} from '../../runtime/engine.js';
import path from 'path';

// ── Schema flag extraction ────────────────────────────────────────────────────
// Converts a raw command object into the boolean flag set the WASM pipeline
// expects for schema gate evaluation.

function extractSchemaFlags(cmd) {
    const has = k => cmd != null && Object.prototype.hasOwnProperty.call(cmd, k);
    const isStr = v => typeof v === 'string';
    const p = cmd?.payload;
    const sig = cmd?.signature;

    return {
        hasId: has('id'),
        idValid: isStr(cmd?.id) && /^[A-Z_]+$/.test(cmd.id) && cmd.id.length >= 1 && cmd.id.length <= 50,
        hasCommandId: has('commandId'),
        commandIdValid: isStr(cmd?.commandId) && /^[a-f0-9-]+$/.test(cmd.commandId) && cmd.commandId.length === 36,
        hasRequesterId: has('requesterId'),
        requesterIdValid: isStr(cmd?.requesterId) && cmd.requesterId.length >= 3 && cmd.requesterId.length <= 100,
        hasSessionId: has('sessionId'),
        sessionIdValid: isStr(cmd?.sessionId) && cmd.sessionId.length >= 3,
        hasTimestamp: has('timestamp'),
        timestampValid: typeof cmd?.timestamp === 'number' && cmd.timestamp >= 1e9,
        hasNonce: has('nonce'),
        nonceValid: isStr(cmd?.nonce) && cmd.nonce.length >= 32 && cmd.nonce.length <= 128,
        hasRequires: has('requires'),
        requiresValid: Array.isArray(cmd?.requires) && cmd.requires.length >= 1 && cmd.requires.every(isStr),
        hasPayload: has('payload') && typeof p === 'object' && p !== null && !Array.isArray(p),
        hasPayloadAdapter: p != null && Object.prototype.hasOwnProperty.call(p, 'adapter'),
        payloadAdapterValid: isStr(p?.adapter),
        hasSignature: has('signature') && typeof sig === 'object' && sig !== null && !Array.isArray(sig),
        hasSignatureAlg: sig != null && Object.prototype.hasOwnProperty.call(sig, 'alg'),
        signatureAlgValid: sig?.alg === 'ed25519',
        hasSignatureKeyId: sig != null && Object.prototype.hasOwnProperty.call(sig, 'keyId'),
        hasSignatureSig: sig != null && Object.prototype.hasOwnProperty.call(sig, 'sig'),
        signatureSigValid: isStr(sig?.sig) && sig.sig.length >= 10,
        hasRisk: has('risk'),
        riskValid: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(cmd?.risk),
    };
}

// ── Policy flag extraction ────────────────────────────────────────────────────

function extractPolicyFlags(policy, cmd) {
    const hasPolicy = !!(policy && policy.default === 'DENY' && policy.requesters && typeof policy.requesters === 'object');
    const rp = policy?.requesters?.[cmd.requesterId];
    const cmdId = cmd.id?.toLowerCase() ?? '';

    const commandAllowed = !!(rp?.allowCommands?.some(c => c.toLowerCase() === cmdId));
    const adapterAllowed = !!(rp?.allowAdapters?.includes(cmd.payload?.adapter));
    const filesystemRequired = !!(cmd.payload?.cwd);

    let filesystemRootsDefined = false;
    let filesystemOk = false;
    let pathDenied = false;

    if (filesystemRequired) {
        const roots = rp?.filesystem?.roots ?? [];
        filesystemRootsDefined = roots.length > 0;
        if (filesystemRootsDefined) {
            const cwd = path.resolve(cmd.payload.cwd);
            filesystemOk = roots.some(r => {
                const rr = path.resolve(r);
                return cwd === rr || cwd.startsWith(rr + path.sep);
            });
            const denyPatterns = rp?.filesystem?.denyPatterns ?? [];
            pathDenied = denyPatterns.some(pattern => {
                const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
                return re.test(cwd);
            });
        }
    }

    let shellRequired = false;
    let shellCommandOk = true;

    if (cmd.id === 'RUN_SHELL') {
        shellRequired = true;
        const allowCmds = rp?.exec?.allowCmds ?? [];
        const denyCmds = rp?.exec?.denyCmds ?? [];
        const shellCmd = cmd.payload?.cmd;
        if (denyCmds.includes(shellCmd)) {
            shellCommandOk = false;
        } else {
            shellCommandOk = allowCmds.length === 0 || allowCmds.includes(shellCmd);
        }
    }

    return {
        policyConfigured: hasPolicy,
        requesterConfigured: !!(rp),
        commandAllowed,
        adapterAllowed,
        filesystemRequired,
        filesystemRootsDefined,
        filesystemOk,
        pathDenied,
        shellRequired,
        shellCommandOk,
    };
}

// ── Key lifecycle flag extraction ─────────────────────────────────────────────

function extractKeyFlags(keyStore, keyId, requesterId, pubKeyB64, now = new Date()) {
    const KEY_ID_RE = /^[A-Za-z0-9:_-]{3,128}$/;
    const keyIdFormatValid = KEY_ID_RE.test(keyId) && keyId !== 'default';
    if (!keyIdFormatValid) {
        return {
            keyIdFormatValid,
            keyFound: false,
            keyNotDeprecated: false,
            keyRequesterMatches: false,
            keyNotBeforeOk: false,
            keyNotExpired: false,
            keyLifecycleFieldsPresent: false,
            publicKey: null,
        };
    }

    const entry = keyStore?.trustedKeys?.[keyId];
    if (!keyStore) {
        const hasFallbackPubKey = Boolean(pubKeyB64);
        return {
            keyIdFormatValid,
            keyFound: hasFallbackPubKey,
            keyNotDeprecated: hasFallbackPubKey,
            keyRequesterMatches: hasFallbackPubKey,
            keyNotBeforeOk: hasFallbackPubKey,
            keyNotExpired: hasFallbackPubKey,
            keyLifecycleFieldsPresent: hasFallbackPubKey,
            publicKey: pubKeyB64 || null,
        };
    }

    if (!entry) {
        return {
            keyIdFormatValid,
            keyFound: false,
            keyNotDeprecated: false,
            keyRequesterMatches: false,
            keyNotBeforeOk: false,
            keyNotExpired: false,
            keyLifecycleFieldsPresent: false,
            publicKey: null,
        };
    }

    const keyFound = true;
    const keyNotDeprecated = !entry.deprecated;
    const keyRequesterMatches = !entry.requesterId || entry.requesterId === requesterId;

    const notBefore = entry.notBefore || entry.validFrom;
    const expiresAt = entry.expiresAt || entry.validUntil;
    const keyLifecycleFieldsPresent = typeof notBefore === 'string' && typeof expiresAt === 'string';

    let keyNotBeforeOk = false;
    let keyNotExpired = false;
    if (keyLifecycleFieldsPresent) {
        const nb = new Date(notBefore);
        const exp = new Date(expiresAt);
        if (!isNaN(nb.getTime()) && !isNaN(exp.getTime()) && nb < exp) {
            keyNotBeforeOk = now >= nb;
            keyNotExpired = now < exp;
        }
    }

    return {
        keyIdFormatValid, keyFound, keyNotDeprecated, keyRequesterMatches,
        keyNotBeforeOk, keyNotExpired, keyLifecycleFieldsPresent,
        publicKey: entry.publicKey ?? null,
    };
}

// ── Nonce/rate-limit helper: convert DB object ↔ text lines ──────────────────

function nonceEntriesToText(db) {
    return (db?.entries ?? []).map(e => `${e.key}:${e.timestamp}`);
}

function textToNonceEntries(text) {
    return text.split('\n').filter(Boolean).map(line => {
        const lastColon = line.lastIndexOf(':');
        return {
            key: line.slice(0, lastColon),
            timestamp: parseInt(line.slice(lastColon + 1), 10) || 0,
        };
    });
}

function rateEntriesToText(db) {
    return (db?.entries ?? []).map(e => `${e.requesterId}:${e.timestamp}`);
}

function textToRateEntries(text) {
    return text.split('\n').filter(Boolean).map(line => {
        const lastColon = line.lastIndexOf(':');
        return {
            requesterId: line.slice(0, lastColon),
            timestamp: parseInt(line.slice(lastColon + 1), 10) || 0,
        };
    });
}

// ── Main validator ────────────────────────────────────────────────────────────

export function validateCommand({
    commandObj,
    pubKeyB64,
    keyStore,
    nonceDb,
    policy,
    rateLimiter,
    policyStatePath,
}) {
    const result = {
        valid: false,
        commandId: commandObj?.commandId,
        checks: {},
        errors: [],
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const now = new Date();
    const maxClockSkewSec = Number.isFinite(policy?.security?.maxClockSkewSec)
        ? policy.security.maxClockSkewSec
        : 600;

    // Policy version guard — runs before the main pipeline (meta-check on policy itself)
    if (policyStatePath && policy?.version !== undefined) {
        try {
            const vCheck = validateAndUpdatePolicyVersionState({ policyObj: policy, statePath: policyStatePath });
            result.checks.policyVersion = vCheck.ok;
            if (!vCheck.ok) {
                result.errors.push({ type: 'POLICY_VERSION_INVALID', message: vCheck.message });
                return result;
            }
        } catch {
            result.checks.policyVersion = true;
        }
    } else {
        result.checks.policyVersion = true;
    }

    // ── Flag extraction (JS — field parsing only) ─────────────────────────────
    const schemaFlags = extractSchemaFlags(commandObj);
    const keyId = commandObj?.signature?.keyId;
    const keyFlags = extractKeyFlags(keyStore, keyId, commandObj?.requesterId, pubKeyB64, now);

    // Signature verification — Ed25519 stays in JS (well-known algorithm, tweetnacl)
    let signatureValid = false;
    let effectivePubKey = keyFlags.publicKey;
    if (!effectivePubKey && pubKeyB64) effectivePubKey = pubKeyB64;
    if (effectivePubKey && (!keyStore || !keyStore.trustedKeys?.[keyId])) {
        // Use fallback public key only when no matching trusted key entry exists.
        const bodyWithoutSig = { ...commandObj };
        delete bodyWithoutSig.signature;
        const sigCheck = verifyEd25519({
            payloadObj: bodyWithoutSig,
            sigB64: commandObj?.signature?.sig,
            pubKeyB64: effectivePubKey,
        });
        signatureValid = sigCheck.valid;
    } else if (effectivePubKey && keyStore && keyStore.trustedKeys?.[keyId]) {
        const bodyWithoutSig = { ...commandObj };
        delete bodyWithoutSig.signature;
        const sigCheck = verifyEd25519({
            payloadObj: bodyWithoutSig,
            sigB64: commandObj?.signature?.sig,
            pubKeyB64: effectivePubKey,
        });
        signatureValid = sigCheck.valid;
    }

    // Rate limit — WASM logic, state serialised through JS for disk IO
    let rateLimitOk = true;
    let rateLimitRetryAfterSec = 0;
    if (signatureValid && rateLimiter && typeof rateLimiter.db !== 'undefined') {
        const rateCfg = policy?.requesters?.[commandObj.requesterId]?.rateLimit || {};
        const dfltCfg = policy?.security?.defaultRateLimit || {};
        const windowSec = rateCfg.windowSec ?? dfltCfg.windowSec ?? 60;
        const maxRequests = rateCfg.maxRequests ?? dfltCfg.maxRequests ?? 30;
        const rateResult = checkRateLimit({
            windowSec, maxRequests, nowSec,
            requesterId: commandObj.requesterId,
            existingEntries: rateEntriesToText(rateLimiter.db),
        });
        rateLimitOk = rateResult.ok;
        rateLimitRetryAfterSec = rateResult.retryAfterSec;
        if (rateResult.ok) {
            rateLimiter.db.entries = textToRateEntries(rateResult.updatedEntriesText);
        }
    } else if (signatureValid && rateLimiter && typeof rateLimiter.checkAndRecord === 'function') {
        const rateCfg = policy?.requesters?.[commandObj.requesterId]?.rateLimit || {};
        const dfltCfg = policy?.security?.defaultRateLimit || {};
        const rateCheck = rateLimiter.checkAndRecord({
            requesterId: commandObj.requesterId, nowSec,
            windowSec: rateCfg.windowSec ?? dfltCfg.windowSec ?? 60,
            maxRequests: rateCfg.maxRequests ?? dfltCfg.maxRequests ?? 30,
        });
        rateLimitOk = rateCheck.ok;
        rateLimitRetryAfterSec = rateCheck.retryAfterSec ?? 0;
    }

    // Nonce check — WASM logic, state serialised through JS for disk IO
    let nonceOk = true;
    const nonceKey = `${commandObj?.requesterId}|${commandObj?.sessionId}|${commandObj?.nonce}`;
    const ttlSec = 3600;

    if (signatureValid && rateLimitOk && nonceDb) {
        if (typeof nonceDb.checkAndRecord === 'function') {
            // NonceStore instance — delegate to WASM via db property if available, else class method
            if (nonceDb.db) {
                const nonceResult = checkNonce({
                    ttlSec, nowSec, newKey: nonceKey,
                    existingEntries: nonceEntriesToText(nonceDb.db),
                });
                nonceOk = nonceResult.ok;
                if (nonceResult.ok) {
                    nonceDb.db.entries = textToNonceEntries(nonceResult.updatedEntriesText);
                }
            } else {
                const r = nonceDb.checkAndRecord({
                    requesterId: commandObj.requesterId,
                    sessionId: commandObj.sessionId,
                    nonce: commandObj.nonce,
                });
                nonceOk = r.ok;
            }
        } else {
            // Plain object (legacy path)
            const nonceResult = checkNonce({
                ttlSec, nowSec, newKey: nonceKey,
                existingEntries: nonceEntriesToText(nonceDb),
            });
            nonceOk = nonceResult.ok;
            if (nonceResult.ok) {
                nonceDb.entries = textToNonceEntries(nonceResult.updatedEntriesText);
            }
        }
    }

    // Policy flags
    const policyFlags = extractPolicyFlags(policy, commandObj ?? {});

    // ── WASM pipeline: all decisions ──────────────────────────────────────────
    const pipeline = runValidationPipeline({
        ...schemaFlags,
        cmdTimestamp: commandObj?.timestamp ?? 0,
        nowSec,
        maxClockSkewSec,
        ...keyFlags,
        signatureValid,
        rateLimitOk,
        rateLimitRetryAfterSec,
        nonceOk,
        ...policyFlags,
    });

    // Populate checks only for stages that were actually evaluated.
    // Stages not yet reached remain undefined — the CLI uses `=== false` guards,
    // so undefined naturally falls through to the next check (undefined !== false).
    //
    // Stage map: 0=schema 1=timestamp 2=key 3=signature 4=rate 5=nonce 6=policy 255=ok
    const s = pipeline.stage;

    // schema is always evaluated first
    result.checks.schema = s !== 0;
    if (s >= 1) result.checks.timestamp = s !== 1;
    if (s >= 2) result.checks.keyId = s !== 2;
    // Key lifecycle failure (s=2) maps to signature=false — CLI exits 3 for both key and sig errors
    if (s >= 2) result.checks.signature = (s !== 2 && s !== 3);
    if (s >= 4) result.checks.rateLimit = s !== 4;
    if (s >= 5) result.checks.nonce = s !== 5;
    if (s >= 6 || pipeline.ok) result.checks.policy = s !== 6;

    if (!pipeline.ok) {
        const stage = pipeline.stageLabel;

        if (stage === 'schema') {
            result.errors.push({ type: 'SCHEMA_ERROR', message: pipeline.schemaError || 'Schema invalid' });
        } else if (stage === 'timestamp') {
            result.errors.push({ type: 'TIMESTAMP_SKEW_EXCEEDED', message: `Command timestamp skew ${pipeline.skewSec}s exceeds allowed ${maxClockSkewSec}s` });
        } else if (stage === 'key') {
            const reason = pipeline.keyReason || 'KEY_ERROR';
            const msgs = {
                KEY_ID_INVALID: `Invalid keyId '${keyId}'`,
                KEY_NOT_TRUSTED: `Key '${keyId}' is not in trusted key store`,
                KEY_DEPRECATED: `Key '${keyId}' is deprecated`,
                KEY_REQUESTER_MISMATCH: `Key '${keyId}' is not authorized for requester '${commandObj?.requesterId}'`,
                KEY_LIFECYCLE_INVALID: `Key '${keyId}' must define notBefore and expiresAt`,
                KEY_NOT_YET_VALID: `Key '${keyId}' is not yet valid`,
                KEY_EXPIRED: `Key '${keyId}' has expired`,
            };
            result.errors.push({ type: reason, message: msgs[reason] || reason });
        } else if (stage === 'signature') {
            result.errors.push({ type: 'SIGNATURE_INVALID', message: effectivePubKey ? 'Signature verification failed' : 'No public key available' });
        } else if (stage === 'rate_limit') {
            result.errors.push({ type: 'RATE_LIMIT_EXCEEDED', message: `Rate limit exceeded. Retry after ${pipeline.retryAfterSec}s` });
        } else if (stage === 'nonce') {
            result.errors.push({ type: 'REPLAY_NONCE', message: 'Nonce has already been used' });
        } else if (stage === 'policy' && pipeline.policyResult) {
            result.errors.push({ type: pipeline.policyResult.reason, message: pipeline.policyResult.message });
        } else {
            result.errors.push({ type: 'VALIDATION_FAILED', message: `Failed at stage: ${stage}` });
        }

        return result;
    }

    // All gates passed
    result.valid = true;
    result.risk = classifyRisk(commandObj.id, commandObj.payload?.cmd === 'rm');
    result.message = 'Command validation successful';
    return result;
}

export function makeValidationReport(validation) {
    return {
        success: validation.valid,
        commandId: validation.commandId,
        checks: validation.checks,
        risk: validation.risk,
        errors: validation.errors,
        timestamp: new Date().toISOString(),
    };
}
