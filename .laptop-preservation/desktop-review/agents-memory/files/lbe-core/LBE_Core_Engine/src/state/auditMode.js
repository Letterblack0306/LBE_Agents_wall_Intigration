import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceState } from './index.js';
import { registerIntent } from './intentRegistry.js';
import { indexFiles, diffIndex } from './fileIndex.js';
import { runProof, loadLatestProof } from './proofRunner.js';
import { loadActiveScope, requiredReadingMissing, SCOPE_STATUS } from './scopeContract.js';

export const AUDIT_STATUS = Object.freeze({
    NO_SCOPE_FOUND: 'NO_SCOPE_FOUND',
    SCOPE_REGISTERED: 'SCOPE_REGISTERED',
    REQUIRED_READING_MISSING: 'REQUIRED_READING_MISSING',
    INTENT_SCOPE_MISMATCH: 'INTENT_SCOPE_MISMATCH',
    INTENT_REGISTERED: 'INTENT_REGISTERED',
    NO_INTENT_FOUND: 'NO_INTENT_FOUND',
    MISMATCH_DETECTED: 'MISMATCH_DETECTED',
    CHANGED_OUTSIDE_SCOPE: 'CHANGED_OUTSIDE_SCOPE',
    FORBIDDEN_FILE_TOUCHED: 'FORBIDDEN_FILE_TOUCHED',
    PROOF_INCOMPLETE: 'PROOF_INCOMPLETE',
    VALIDATION_MISSING: 'VALIDATION_MISSING',
    CLEAN: 'CLEAN',
});

function localPaths(workspaceRoot) {
    const lbeDir = path.join(workspaceRoot, '.lbe');
    return {
        lbeDir,
        intent: path.join(lbeDir, 'intent.jsonl'),
        audit: path.join(lbeDir, 'audit.jsonl'),
        proofLatest: path.join(lbeDir, 'proof', 'latest.json'),
        snapshotBefore: path.join(lbeDir, 'snapshots', 'before.json'),
        snapshotAfter: path.join(lbeDir, 'snapshots', 'after.json'),
    };
}

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonl(filePath, record) {
    ensureDir(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function writeJson(filePath, record) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function loadJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((acc, line) => {
        try { acc.push(JSON.parse(line)); } catch (_) { /* ignore malformed evidence */ }
        return acc;
    }, []);
}

function latestIntent(workspaceRoot, stateDir) {
    const central = loadJsonl(path.join(stateDir, 'intent.jsonl'));
    if (central.length > 0) return central[central.length - 1];
    const local = loadJsonl(localPaths(workspaceRoot).intent);
    return local[local.length - 1] || null;
}

function listOption(value) {
    if (value === undefined || value === null || value === true) return [];
    if (Array.isArray(value)) return value.flatMap(listOption);
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function changedFiles(paths) {
    const before = paths.fileIndexBefore || paths.snapshotBefore;
    const after = paths.fileIndexAfter || paths.snapshotAfter;
    const diff = diffIndex(before, after);
    return [...diff.added, ...diff.removed, ...diff.changed].sort();
}

function matchesGlob(filePath, pattern) {
    const normalized = filePath.replace(/\\/g, '/');
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$');
    return regex.test(normalized);
}

function intentScopeViolation(intent, changed) {
    const forbidden = Array.isArray(intent?.forbidden_files) ? intent.forbidden_files : [];
    const allowed = Array.isArray(intent?.allowed_files) ? intent.allowed_files : [];
    if (changed.some((file) => forbidden.some((pattern) => matchesGlob(file, pattern)))) {
        return AUDIT_STATUS.FORBIDDEN_FILE_TOUCHED;
    }
    if (allowed.length > 0 && changed.some((file) => !allowed.some((pattern) => matchesGlob(file, pattern)))) {
        return AUDIT_STATUS.MISMATCH_DETECTED;
    }
    return null;
}

function scopeFileViolation(scope, changed) {
    const forbidden = Array.isArray(scope?.forbiddenFiles) ? scope.forbiddenFiles : [];
    const allowed = Array.isArray(scope?.allowedFiles) ? scope.allowedFiles : [];
    if (changed.some((file) => forbidden.some((pattern) => matchesGlob(file, pattern)))) {
        return AUDIT_STATUS.FORBIDDEN_FILE_TOUCHED;
    }
    if (allowed.length > 0 && changed.some((file) => !allowed.some((pattern) => matchesGlob(file, pattern)))) {
        return AUDIT_STATUS.CHANGED_OUTSIDE_SCOPE;
    }
    return null;
}

export function beginAuditIntent(opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir, paths: cp } = resolveWorkspaceState(workspaceRoot);
    const scope = loadActiveScope(workspaceRoot);
    if (!scope) {
        appendJsonl(cp.events, {
            ts: new Date().toISOString(),
            kind: 'audit_mode',
            action: 'intent_begin',
            status: SCOPE_STATUS.NO_SCOPE_FOUND,
        });
        return { status: SCOPE_STATUS.NO_SCOPE_FOUND, intent: null, stateDir };
    }
    const requestedScope = opts.scope || opts['scope-id'] || scope.id;
    if (requestedScope !== scope.id) {
        appendJsonl(cp.events, {
            ts: new Date().toISOString(),
            kind: 'audit_mode',
            action: 'intent_begin',
            status: SCOPE_STATUS.INTENT_SCOPE_MISMATCH,
            requested_scope_id: requestedScope,
            active_scope_id: scope.id,
        });
        return { status: SCOPE_STATUS.INTENT_SCOPE_MISMATCH, intent: null, stateDir, scope };
    }
    const validationRequired = listOption(opts.validation || opts['validation-required']);
    const allowedFiles = listOption(opts['allowed-files'] || opts.allowed);
    const forbiddenFiles = listOption(opts['forbidden-files'] || opts.forbidden);
    const intentInput = {
        task: opts.task || opts.intent || '',
        reason: opts.reason || '',
        allowed_files: allowedFiles.length > 0 ? allowedFiles : scope.allowedFiles,
        forbidden_files: forbiddenFiles.length > 0 ? forbiddenFiles : scope.forbiddenFiles,
        declared_targets: listOption(opts.targets),
        scope_id: scope.id,
        risk: opts.risk || 'unknown',
    };
    const record = {
        ...registerIntent(stateDir, intentInput),
        validation_required: validationRequired.length > 0 ? validationRequired : scope.requiredValidation,
        status: AUDIT_STATUS.INTENT_REGISTERED,
    };
    appendJsonl(cp.intent, record);
    appendJsonl(cp.events, {
        ts: new Date().toISOString(),
        kind: 'audit_mode',
        action: 'intent_begin',
        status: AUDIT_STATUS.INTENT_REGISTERED,
        intent_id: record.intent_id,
        scope_id: scope.id,
    });
    return { status: AUDIT_STATUS.INTENT_REGISTERED, intent: record, scope, stateDir };
}

export function snapshotAuditWorkspace(phase, opts = {}) {
    if (!['before', 'after'].includes(phase)) {
        throw new Error('snapshot phase must be "before" or "after"');
    }
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir, paths: cp } = resolveWorkspaceState(workspaceRoot);
    const centralOutput = phase === 'before' ? cp.fileIndexBefore : cp.fileIndexAfter;
    const index = indexFiles(workspaceRoot, centralOutput);
    appendJsonl(cp.events, {
        ts: new Date().toISOString(),
        kind: 'audit_mode',
        action: `snapshot_${phase}`,
        status: phase === 'before' ? 'SNAPSHOT_BEFORE' : 'SNAPSHOT_AFTER',
        file_count: Object.keys(index.files || {}).length,
    });
    return { status: phase === 'before' ? 'SNAPSHOT_BEFORE' : 'SNAPSHOT_AFTER', phase, fileCount: Object.keys(index.files || {}).length, stateDir };
}

function validationMissing(intent, scope, workspaceRoot) {
    const intentRequired = Array.isArray(intent?.validation_required) ? intent.validation_required : [];
    const scopeRequired = Array.isArray(scope?.requiredValidation) ? scope.requiredValidation : [];
    const required = intentRequired.length > 0 ? intentRequired : scopeRequired;
    if (required.length === 0) return false;
    const { stateDir } = resolveWorkspaceState(workspaceRoot);
    const centralLog = path.join(stateDir, 'validation.jsonl');
    const localLog = path.join(localPaths(workspaceRoot).lbeDir, 'validation.jsonl');
    const central = loadJsonl(centralLog);
    if (central.length > 0) return false;
    return loadJsonl(localLog).length === 0;
}

export function classifyAuditStatus(workspaceRoot, proof = null) {
    const { stateDir, paths: cp } = resolveWorkspaceState(workspaceRoot);
    const hasBefore = fs.existsSync(cp.fileIndexBefore) || fs.existsSync(path.join(stateDir, 'file-index', 'before.json'));
    const hasAfter = fs.existsSync(cp.fileIndexAfter) || fs.existsSync(path.join(stateDir, 'file-index', 'after.json'));
    const intent = latestIntent(workspaceRoot, stateDir);
    const scope = loadActiveScope(workspaceRoot);

    if (!scope) return { status: AUDIT_STATUS.NO_SCOPE_FOUND, intent, scope, changedFiles: [] };
    if (!hasBefore || !hasAfter) return { status: AUDIT_STATUS.PROOF_INCOMPLETE, intent, changedFiles: [] };

    const changed = changedFiles(cp);
    if (intent && intent.scope_id !== scope.id) {
        return { status: AUDIT_STATUS.INTENT_SCOPE_MISMATCH, intent, scope, changedFiles: changed };
    }
    const missingReading = requiredReadingMissing(workspaceRoot, scope);
    if (missingReading.length > 0) {
        return { status: AUDIT_STATUS.REQUIRED_READING_MISSING, intent, scope, changedFiles: changed, missingReading };
    }
    if (!intent && changed.length > 0) return { status: AUDIT_STATUS.NO_INTENT_FOUND, intent, changedFiles: changed };
    if (!intent && changed.length === 0) return { status: AUDIT_STATUS.CLEAN, intent, changedFiles: changed };
    if (validationMissing(intent, scope, workspaceRoot)) return { status: AUDIT_STATUS.VALIDATION_MISSING, intent, scope, changedFiles: changed };
    const scopeStatus = scopeFileViolation(scope, changed);
    if (scopeStatus) return { status: scopeStatus, intent, scope, changedFiles: changed };
    const directScopeStatus = intentScopeViolation(intent, changed);
    if (directScopeStatus) return { status: directScopeStatus, intent, changedFiles: changed };

    const activeProof = proof || loadLatestProof(stateDir);
    if (!activeProof) return { status: AUDIT_STATUS.PROOF_INCOMPLETE, intent, changedFiles: changed };
    const failures = activeProof.failures || [];
    if (failures.some((failure) => failure.reason === 'forbidden_file_changed')) {
        return { status: AUDIT_STATUS.FORBIDDEN_FILE_TOUCHED, intent, scope, changedFiles: changed, proof: activeProof };
    }
    if (failures.length > 0 || activeProof.result === 'FAIL') {
        return { status: AUDIT_STATUS.MISMATCH_DETECTED, intent, changedFiles: changed, proof: activeProof };
    }
    return { status: AUDIT_STATUS.CLEAN, intent, changedFiles: changed, proof: activeProof };
}

export function runAuditProof(opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir, paths: cp } = resolveWorkspaceState(workspaceRoot);
    const proof = runProof(stateDir, workspaceRoot, opts.intentId ? { intentId: opts.intentId } : {});
    const classified = classifyAuditStatus(workspaceRoot, proof);
    const output = {
        ...proof,
        user_status: classified.status,
        scope_id: classified.scope?.id || null,
        changed_count: classified.changedFiles.length,
        missing_required_reading: classified.missingReading?.map((entry) => entry.path) || [],
    };
    writeJson(cp.proofLatest, output);
    appendJsonl(cp.events, {
        ts: new Date().toISOString(),
        kind: 'audit_mode',
        action: 'proof',
        status: classified.status,
        intent_id: output.intent_id,
        changed_count: output.changed_count,
    });
    return { status: classified.status, proof: output, changedFiles: classified.changedFiles, stateDir };
}

export function auditStatus(opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir } = resolveWorkspaceState(workspaceRoot);
    const proof = loadLatestProof(stateDir);
    const classified = classifyAuditStatus(workspaceRoot, proof);
    return { ...classified, stateDir };
}
