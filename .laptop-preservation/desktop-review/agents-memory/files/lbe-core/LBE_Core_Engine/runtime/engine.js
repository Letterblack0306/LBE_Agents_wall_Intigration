// Runtime boundary for the compiled governance engine.
// All governance decisions route through here — the WASM module owns the logic.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(runtimeDir, 'lbe_engine.wasm');

// ── Result tables (error code → message) ─────────────────────────────────────
// These map WASM integer codes to human-readable reasons for the JS surface.

const POLICY_MESSAGES = {
    0: { allowed: true,  reason: null,                          message: 'Policy check passed' },
    1: { allowed: false, reason: 'POLICY_NOT_CONFIGURED',       message: 'No policy configured' },
    2: { allowed: false, reason: 'REQUESTER_NOT_ALLOWED',       message: 'Requester not in policy' },
    3: { allowed: false, reason: 'COMMAND_NOT_ALLOWED',         message: 'Command not allowed for requester' },
    4: { allowed: false, reason: 'ADAPTER_NOT_ALLOWED',         message: 'Adapter not allowed' },
    5: { allowed: false, reason: 'NO_FILESYSTEM_ROOTS_DEFINED', message: 'No filesystem roots defined for requester' },
    6: { allowed: false, reason: 'CWD_OUTSIDE_ALLOWED_ROOT',    message: 'Path not under allowed roots' },
    7: { allowed: false, reason: 'PATH_DENIED_BY_PATTERN',      message: 'Path matches deny pattern' },
    8: { allowed: false, reason: 'SHELL_CMD_DENIED',            message: 'Shell command not allowed' },
};

const SCHEMA_MESSAGES = {
    0:  { valid: true,  error: null },
    1:  { valid: false, error: 'Missing required field: id' },
    2:  { valid: false, error: 'Missing required field: commandId' },
    3:  { valid: false, error: 'Missing required field: requesterId' },
    4:  { valid: false, error: 'Missing required field: sessionId' },
    5:  { valid: false, error: 'Missing required field: timestamp' },
    6:  { valid: false, error: 'Missing required field: nonce' },
    7:  { valid: false, error: 'Missing required field: requires' },
    8:  { valid: false, error: 'Missing required field: payload' },
    9:  { valid: false, error: 'Missing required field: signature' },
    10: { valid: false, error: "Field 'id' is invalid" },
    11: { valid: false, error: "Field 'commandId' is invalid" },
    12: { valid: false, error: "Field 'requesterId' is invalid" },
    13: { valid: false, error: "Field 'sessionId' is invalid" },
    14: { valid: false, error: "Field 'timestamp' is invalid" },
    15: { valid: false, error: "Field 'nonce' is invalid" },
    16: { valid: false, error: "Field 'requires' is invalid" },
    17: { valid: false, error: 'payload: missing required field: adapter' },
    18: { valid: false, error: "payload: field 'adapter' is invalid" },
    19: { valid: false, error: 'signature: missing required field: alg' },
    20: { valid: false, error: 'signature: missing required field: keyId' },
    21: { valid: false, error: 'signature: missing required field: sig' },
    22: { valid: false, error: "signature: field 'alg' must be ed25519" },
    23: { valid: false, error: "signature: field 'sig' is invalid" },
    24: { valid: false, error: "Field 'risk' is invalid" },
};

const KEY_REASONS = {
    1: 'KEY_ID_INVALID',
    2: 'KEY_NOT_TRUSTED',
    3: 'KEY_DEPRECATED',
    4: 'KEY_REQUESTER_MISMATCH',
    5: 'KEY_LIFECYCLE_INVALID',
    6: 'KEY_NOT_YET_VALID',
    7: 'KEY_EXPIRED',
};

const PIPELINE_STAGES = {
    0: 'schema',
    1: 'timestamp',
    2: 'key',
    3: 'signature',
    4: 'rate_limit',
    5: 'nonce',
    6: 'policy',
    255: 'ok',
};

const RISK_LABELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const COMMAND_TYPE = { ECHO: 0, READ_FILE: 1, WRITE_FILE: 2, PATCH_FILE: 3, DELETE_FILE: 4, RUN_SHELL: 5 };

// ── WASM instance (lazy singleton) ────────────────────────────────────────────

let _instance = null;

function wasm() {
    if (_instance) return _instance;
    if (!fs.existsSync(wasmPath)) throw new Error(`LBE engine missing: ${wasmPath}`);
    const bytes = fs.readFileSync(wasmPath);
    _instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
    return _instance;
}

function memory() {
    return new Uint8Array(wasm().exports.memory.buffer);
}

function inPtr()  { return wasm().exports.lbe_in_ptr(); }
function outPtr() { return wasm().exports.lbe_out_ptr(); }
function bufSize(){ return wasm().exports.lbe_buf_size(); }

// Write a UTF-8 string + null terminator into the WASM input buffer.
function writeIn(str) {
    const enc = new TextEncoder().encode(str);
    const mem = memory();
    const ptr = inPtr();
    mem.set(enc, ptr);
    mem[ptr + enc.length] = 0;
}

// Read a null-terminated UTF-8 string from the WASM output buffer.
function readOut() {
    const mem = memory();
    const ptr = outPtr();
    let end = ptr;
    while (mem[end] !== 0 && end - ptr < bufSize()) end++;
    return new TextDecoder().decode(mem.slice(ptr, end));
}

// Write raw bytes + null to input buffer (for audit hash — two segments).
function writeInBinary(a, b) {
    const mem = memory();
    const ptr = inPtr();
    let pos = ptr;
    for (let i = 0; i < a.length; i++) mem[pos++] = a[i];
    mem[pos++] = 0;
    for (let i = 0; i < b.length; i++) mem[pos++] = b[i];
    mem[pos] = 0;
}

// Write 48 u32 values (pipeline input struct) to input buffer.
function writePipelineInput(fields) {
    const mem = memory();
    const ptr = inPtr();
    const view = new DataView(mem.buffer, ptr);
    fields.forEach((v, i) => view.setUint32(i * 4, v >>> 0, true));
}

// Read 2 u32 values (pipeline output struct) from output buffer.
function readPipelineOutput() {
    const mem = memory();
    const ptr = outPtr();
    const view = new DataView(mem.buffer, ptr);
    return { stage: view.getUint32(0, true), code: view.getUint32(4, true) };
}

// ── Public engine API ─────────────────────────────────────────────────────────

export function execute(input) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const enc = new TextEncoder().encode(input);
    if (enc.length + 1 > bufSize()) throw new Error('input exceeds runtime buffer');
    writeIn(input);
    wasm().exports.lbe_execute();
    return readOut();
}

export function getRuntimeInfo() {
    return { mode: 'wasm', available: fs.existsSync(wasmPath), wasmPath, localFirst: true };
}

export async function loadWasmEngine() {
    return { ok: true, mode: 'wasm', version: wasm().exports.lbe_engine_version() };
}

/**
 * runValidationPipeline — full 4-gate validation in WASM.
 *
 * @param {object} flags  All pre-extracted flags for each gate.
 * @returns {{ stage, stageLabel, code, ok, policyResult, keyReason, schemaError }}
 */
export function runValidationPipeline(flags) {
    // Pack the 49-field input struct into IN_BUF as little-endian u32 values.
    // Order must match lib.rs lbe_validate_pipeline documentation.
    writePipelineInput([
        // Schema flags [0..24]
        flags.hasId          ? 1 : 0, flags.idValid          ? 1 : 0,
        flags.hasCommandId   ? 1 : 0, flags.commandIdValid   ? 1 : 0,
        flags.hasRequesterId ? 1 : 0, flags.requesterIdValid ? 1 : 0,
        flags.hasSessionId   ? 1 : 0, flags.sessionIdValid   ? 1 : 0,
        flags.hasTimestamp   ? 1 : 0, flags.timestampValid   ? 1 : 0,
        flags.hasNonce       ? 1 : 0, flags.nonceValid       ? 1 : 0,
        flags.hasRequires    ? 1 : 0, flags.requiresValid    ? 1 : 0,
        flags.hasPayload     ? 1 : 0,
        flags.hasPayloadAdapter   ? 1 : 0, flags.payloadAdapterValid  ? 1 : 0,
        flags.hasSignature        ? 1 : 0,
        flags.hasSignatureAlg     ? 1 : 0, flags.signatureAlgValid    ? 1 : 0,
        flags.hasSignatureKeyId   ? 1 : 0,
        flags.hasSignatureSig     ? 1 : 0, flags.signatureSigValid    ? 1 : 0,
        flags.hasRisk ? 1 : 0, flags.riskValid ? 1 : 0,
        // Timestamp [25..27]
        flags.cmdTimestamp >>> 0, flags.nowSec >>> 0, flags.maxClockSkewSec >>> 0,
        // Key lifecycle [28..34]
        flags.keyIdFormatValid      ? 1 : 0,
        flags.keyFound              ? 1 : 0,
        flags.keyNotDeprecated      ? 1 : 0,
        flags.keyRequesterMatches   ? 1 : 0,
        flags.keyNotBeforeOk        ? 1 : 0,
        flags.keyNotExpired         ? 1 : 0,
        flags.keyLifecycleFieldsPresent ? 1 : 0,
        // Signature [35]
        flags.signatureValid ? 1 : 0,
        // Rate limit [36..37]
        flags.rateLimitOk ? 1 : 0, flags.rateLimitRetryAfterSec >>> 0,
        // Nonce [38]
        flags.nonceOk ? 1 : 0,
        // Policy [39..48]
        flags.policyConfigured     ? 1 : 0,
        flags.requesterConfigured  ? 1 : 0,
        flags.commandAllowed       ? 1 : 0,
        flags.adapterAllowed       ? 1 : 0,
        flags.filesystemRequired   ? 1 : 0,
        flags.filesystemRootsDefined ? 1 : 0,
        flags.filesystemOk         ? 1 : 0,
        flags.pathDenied           ? 1 : 0,
        flags.shellRequired        ? 1 : 0,
        flags.shellCommandOk       ? 1 : 0,
    ]);

    wasm().exports.lbe_validate_pipeline();
    const { stage, code } = readPipelineOutput();
    const ok = stage === 255;

    return {
        ok,
        stage,
        stageLabel:  PIPELINE_STAGES[stage] || 'unknown',
        code,
        schemaError: stage === 0 ? (SCHEMA_MESSAGES[code]?.error || 'Schema invalid') : null,
        keyReason:   stage === 2 ? (KEY_REASONS[code] || 'KEY_ERROR') : null,
        policyResult:stage === 6 ? { ...(POLICY_MESSAGES[code] || POLICY_MESSAGES[1]), code } : null,
        retryAfterSec: stage === 4 ? code : 0,
        skewSec:     stage === 1 ? code : 0,
    };
}

/**
 * checkNonce — delegates nonce deduplication to WASM.
 * Returns { ok, updatedEntriesText } where updatedEntriesText is the new serialised
 * nonce DB to persist (null when replay detected).
 */
export function checkNonce({ ttlSec, nowSec, newKey, existingEntries }) {
    const lines = [`${ttlSec}:${nowSec}`, newKey, ...existingEntries].join('\n') + '\n';
    writeIn(lines);
    const isReplay = wasm().exports.lbe_nonce_check() !== 0;
    if (isReplay) return { ok: false, updatedEntriesText: null };
    const out = readOut();
    // Strip leading "OK\n"
    return { ok: true, updatedEntriesText: out.startsWith('OK\n') ? out.slice(3) : out };
}

/**
 * checkRateLimit — delegates rate-limit sliding-window logic to WASM.
 * Returns { ok, retryAfterSec, updatedEntriesText }.
 */
export function checkRateLimit({ windowSec, maxRequests, nowSec, requesterId, existingEntries }) {
    const lines = [
        `${windowSec}:${maxRequests}:${nowSec}`,
        requesterId,
        ...existingEntries,
    ].join('\n') + '\n';
    writeIn(lines);
    const exceeded = wasm().exports.lbe_rate_check() !== 0;
    const out = readOut();
    if (exceeded) {
        const retryAfterSec = parseInt(out.match(/^EXCEEDED:(\d+)/)?.[1] ?? '1', 10);
        const entriesText = out.replace(/^EXCEEDED:\d+\n/, '');
        return { ok: false, retryAfterSec, updatedEntriesText: entriesText };
    }
    return { ok: true, retryAfterSec: 0, updatedEntriesText: out.startsWith('OK\n') ? out.slice(3) : out };
}

/**
 * computeAuditHash — SHA-256 of (prevHash || entryJson) computed in WASM.
 */
export function computeAuditHash(prevHash, entryJson) {
    const enc = new TextEncoder();
    writeInBinary(enc.encode(prevHash), enc.encode(entryJson));
    wasm().exports.lbe_audit_hash();
    return readOut().slice(0, 64); // 64-char hex string
}

/**
 * classifyRisk — risk level via WASM.
 * commandId: one of ECHO, READ_FILE, WRITE_FILE, PATCH_FILE, DELETE_FILE, RUN_SHELL
 */
export function classifyRisk(commandId, shellCmdIsRm = false) {
    const typeCode = COMMAND_TYPE[commandId] ?? 0;
    const code = wasm().exports.lbe_classify_risk(typeCode, shellCmdIsRm ? 1 : 0);
    return RISK_LABELS[code] ?? 'LOW';
}

/**
 * shouldRollback — rollback decision via WASM.
 */
export function shouldRollback({ execFailed, postCheckFailed, backupExists, rollbackEnabled }) {
    return wasm().exports.lbe_rollback_decision(
        execFailed     ? 1 : 0,
        postCheckFailed ? 1 : 0,
        backupExists   ? 1 : 0,
        rollbackEnabled ? 1 : 0
    ) === 1;
}

// ── Legacy scalar exports (back-compat) ───────────────────────────────────────

export function evaluatePolicyDecision(input) {
    const code = wasm().exports.lbe_policy_decision(
        input.policyConfigured    ? 1 : 0, input.requesterConfigured ? 1 : 0,
        input.commandAllowed      ? 1 : 0, input.adapterAllowed      ? 1 : 0,
        input.filesystemRequired  ? 1 : 0, input.filesystemRootsDefined ? 1 : 0,
        input.filesystemOk        ? 1 : 0, input.pathDenied          ? 1 : 0,
        input.shellRequired       ? 1 : 0, input.shellCommandOk      ? 1 : 0
    );
    return { ...(POLICY_MESSAGES[code] || POLICY_MESSAGES[1]), code };
}

export function evaluateSchemaDecision(input) {
    const code = wasm().exports.lbe_schema_decision(
        input.hasId             ? 1 : 0, input.idValid             ? 1 : 0,
        input.hasCommandId      ? 1 : 0, input.commandIdValid      ? 1 : 0,
        input.hasRequesterId    ? 1 : 0, input.requesterIdValid    ? 1 : 0,
        input.hasSessionId      ? 1 : 0, input.sessionIdValid      ? 1 : 0,
        input.hasTimestamp      ? 1 : 0, input.timestampValid      ? 1 : 0,
        input.hasNonce          ? 1 : 0, input.nonceValid          ? 1 : 0,
        input.hasRequires       ? 1 : 0, input.requiresValid       ? 1 : 0,
        input.hasPayload        ? 1 : 0,
        input.hasPayloadAdapter ? 1 : 0, input.payloadAdapterValid ? 1 : 0,
        input.hasSignature      ? 1 : 0, input.hasSignatureAlg     ? 1 : 0,
        input.signatureAlgValid ? 1 : 0, input.hasSignatureKeyId   ? 1 : 0,
        input.hasSignatureSig   ? 1 : 0, input.signatureSigValid   ? 1 : 0,
        input.hasRisk           ? 1 : 0, input.riskValid           ? 1 : 0
    );
    return { ...(SCHEMA_MESSAGES[code] || SCHEMA_MESSAGES[10]), code };
}
