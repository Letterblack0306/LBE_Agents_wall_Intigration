// src/core/index.js
// @letterblack/lbe-sdk — public SDK API
//
// Usage:
//   const lbe = createLBE({ secretKey, keyId, policyPath, ... })
//   const result = await lbe.execute({
//     actor: 'agent:codex',
//     intent: 'patch_file',
//     target: 'src/app.js',
//     content: '...new content...',
//     transaction: { validate: true, backup: true, rollbackOnFailure: true, audit: true }
//   })

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Resolve where LBE writes its runtime state.
// 'local'     (default) → ~/.lbe/workspaces/<workspace-id>/   no repo pollution
// 'workspace'           → <rootDir>/.lbe/                      committed, shared
// { adapter }           → pluggable external backend (future)
function resolveStateDir(rootDir, state) {
    const base = path.resolve(rootDir || process.cwd());
    if (!state || state === 'local') {
        const id = crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
        return path.join(os.homedir(), '.lbe', 'workspaces', id);
    }
    if (state === 'workspace') {
        return path.join(base, '.lbe');
    }
    if (state && typeof state === 'object' && state.adapter) {
        return null; // adapter owns its own persistence
    }
    throw new Error(`createLBE: unknown state option: ${JSON.stringify(state)}`);
}
import { signEd25519, generateKeyPair } from './signature.js';
import { validateCommand } from './validator.js';
import { NonceStore } from './nonceStore.js';
import { RequestRateLimiter } from './requestRateLimiter.js';
import { appendAudit } from './auditLog.js';
import { executeAdapter } from '../adapters/index.js';
import { verifyPolicySignature } from './policySignature.js';
import { validateAndUpdatePolicyVersionState } from './policyVersionGuard.js';
import { loadKeysStore } from './trustedKeys.js';
import { getApprovalManager } from './approval-token.js';
import { createBackup, restoreBackup } from './backup.js';
import { createLogger } from './logger.js';
import { deepFreeze } from './deepFreeze.js';
import { assertInvariants, InvariantGateError } from './invariants.js';
import { loadLocalPolicy, evaluateLocalPolicy, auditLocalPolicy, proposePolicyRule } from './localPolicy.js';

// Intent → command ID mapping
const INTENT_MAP = {
    patch_file:   'PATCH_FILE',
    write_file:   'WRITE_FILE',
    read_file:    'READ_FILE',
    delete_file:  'DELETE_FILE',
    run_shell:    'RUN_SHELL',
    echo:         'ECHO'
};

// Command ID → adapter mapping
const ADAPTER_MAP = {
    PATCH_FILE:  'file',
    WRITE_FILE:  'file',
    READ_FILE:   'file',
    DELETE_FILE: 'file',
    RUN_SHELL:   'shell',
    ECHO:        'noop'
};

// Risk levels that require approval when policy says so
const HIGH_RISK_LEVELS = new Set(['HIGH', 'CRITICAL']);

function sha256obj(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function needsApproval(risk, requesterPolicy) {
    if (!requesterPolicy?.requireApproval) return false;
    const rule = requesterPolicy.requireApproval;
    if (rule === true) return true;
    if (Array.isArray(rule)) {
        return rule.includes(risk) || rule.includes('*') || (HIGH_RISK_LEVELS.has(risk) && rule.includes('HIGH+'));
    }
    return false;
}

export function createLBE(options = {}) {
    // Zero-config mode: rootDir provided, no secretKey → auto-generate everything.
    // Lets users call createLBE({ rootDir: process.cwd() }) with no ceremony.
    if (options.rootDir && !options.secretKey) {
        const kp = generateKeyPair();
        const _keyId = options.keyId || 'sdk-auto-key';
        options = {
            defaultActor: 'agent:sdk',
            logLevel: 'WARN',
            ...options,
            secretKey: kp.secretKey,
            keyId: _keyId,
            keyStore: options.keyStore || createKeyStore({ publicKey: kp.publicKey, keyId: _keyId }),
            policy: options.policy || {
                version: 1,
                default: 'DENY',
                requesters: {
                    'agent:sdk': {
                        allowCommands: ['write_file', 'read_file', 'patch_file', 'delete_file'],
                        allowAdapters: ['file'],
                        filesystem: {
                            roots: [options.rootDir],
                            denyPatterns: ['*.key', '*.env', '*.secret']
                        }
                    }
                }
            }
        };
    }

    const {
        secretKey,
        keyId = 'sdk-key-v1',
        sessionId: defaultSession,
        defaultActor = 'agent:sdk',
        // Inline objects — no files required. When provided, policy sig check is skipped.
        policy:   _inlinePolicy,
        keyStore: _inlineKeyStore,
        policyPath,
        keysStorePath,
        policySigPath,
        policyStatePath,
        nonceDbPath,
        rateLimitDbPath,
        auditLogPath,
        backupDir,
        allowUnsignedPolicy = false,
        state = 'local',
        rootDir: _rootDir,
        mode: requestedMode,
        logLevel = process.env.LBE_LOG_LEVEL || 'INFO',
        logSilent = process.env.LBE_LOG_SILENT === '1'
    } = options;

    const inlinePolicy   = _inlinePolicy   && typeof _inlinePolicy   === 'object' ? _inlinePolicy   : null;
    const inlineKeyStore = _inlineKeyStore && typeof _inlineKeyStore === 'object' ? _inlineKeyStore : null;

    // Single state directory for all runtime files — location determined by `state` option.
    // Explicit path overrides (nonceDbPath etc.) always win; state backend is the default only.
    const stateDir = resolveStateDir(_rootDir, state);
    const rootDir = path.resolve(_rootDir || process.cwd());
    const localMode = requestedMode || 'observe';

    const cfg = {
        secretKey,
        policy:       policyPath       || path.resolve('config/policy.default.json'),
        keys:         keysStorePath    || path.resolve('config/keys.json'),
        policySig:    policySigPath    || path.resolve('config/policy.sig.json'),
        policyState:  policyStatePath  || path.join(stateDir, 'policy.state.json'),
        nonceDb:      nonceDbPath      || path.join(stateDir, 'nonce.db.json'),
        rateLimit:    rateLimitDbPath  || path.join(stateDir, 'rate-limit.db.json'),
        auditLog:     auditLogPath     || path.join(stateDir, 'audit.log.jsonl'),
        backupDir:    backupDir        || path.join(stateDir, 'backups')
    };

    const log = createLogger({ level: logLevel, silent: logSilent });
    const logExec = log.scope('Executor');
    const logVal  = log.scope('Validator');
    const logPol  = log.scope('Policy');

    async function execute({
        actor,
        intent,
        target,
        content,
        args = [],
        transaction = {}
    }) {
        actor = actor || defaultActor;
        const tx = { validate: true, backup: true, rollbackOnFailure: true, audit: true, ...transaction };

        logExec.info(`execute() called`, { actor, intent, target });

        // Resolve intent to command/adapter
        const commandId = INTENT_MAP[intent] || intent.toUpperCase().replace(/-/g, '_');
        const adapterName = ADAPTER_MAP[commandId] || 'noop';

        // Load policy — inline object (no sig check) or from disk (sig checked)
        let policy;
        if (inlinePolicy) {
            policy = inlinePolicy;
            logPol.debug('Using inline policy', { version: policy.version });
        } else {
            try {
                policy = JSON.parse(fs.readFileSync(cfg.policy, 'utf8'));
                logPol.debug('Policy loaded from file', { version: policy.version });
            } catch (e) {
                logPol.error('Policy load failed', { error: e.message });
                return { ok: false, stage: 'policy_load', error: 'POLICY_LOAD_FAILED', message: e.message };
            }
        }

        // Local policy is evaluated by the controller before the legacy policy
        // pipeline. In observe mode it is audited but cannot block execution.
        let local;
        try {
            local = loadLocalPolicy(rootDir, localMode);
        } catch (e) {
            return { ok: false, stage: 'local_policy_load', error: 'LOCAL_POLICY_INVALID', message: e.message };
        }
        const localDecision = evaluateLocalPolicy(local.policy, rootDir, {
            target: target ? path.resolve(target) : null,
            command: intent === 'run_shell' ? args[0] : null
        });
        const localBlocked = local.policy.mode === 'enforce' && !localDecision.allowed;
        auditLocalPolicy(rootDir, {
            action: intent, actor: actor || defaultActor, target: target ? path.resolve(target) : null,
            command: intent === 'run_shell' ? args[0] : null,
            mode: local.policy.mode, decision: localBlocked ? 'deny' : 'allow',
            wouldDeny: !localDecision.allowed, ruleIds: localDecision.winningRules.map(r => r.id)
        });
        if (localBlocked) {
            return { ok: false, denied: true, stage: 'local_policy', error: localDecision.reason,
                message: `Blocked by local policy rule(s): ${localDecision.winningRules.map(r => r.id).join(', ')}` };
        }

        // Load keyStore — inline object or from disk
        let keyStore;
        if (inlineKeyStore) {
            keyStore = inlineKeyStore;
            logVal.debug('Using inline keyStore');
        } else {
            const keyStoreResult = loadKeysStore(cfg.keys);
            keyStore = keyStoreResult.ok ? keyStoreResult.store : null;
            logVal.debug('Keys loaded from file', { ok: keyStoreResult.ok });
        }

        // Deep freeze trust config — prevents runtime mutation of policy or keyStore
        deepFreeze(policy);
        if (keyStore) deepFreeze(keyStore);

        // Invariant gate — block early if foundational config is broken
        try {
            const inv = assertInvariants(cfg, policy, keyStore);
            logVal.debug('Invariant gate passed', inv.checks);
        } catch (e) {
            if (e instanceof InvariantGateError) {
                logVal.error('Invariant gate failed', { failures: e.failures });
                return { ok: false, stage: 'invariant_gate', error: 'INVARIANT_GATE_FAILED', message: e.message, checks: e.checks, failures: e.failures };
            }
            throw e;
        }

        // Policy signature + version guard — file-based only; inline policy is trusted as-is
        if (!inlinePolicy) {
            const sigCheck = verifyPolicySignature({
                policyObj: policy, keyStore, policySigPath: cfg.policySig, allowUnsigned: allowUnsignedPolicy
            });
            if (!sigCheck.ok) {
                logPol.error('Policy signature invalid', { reason: sigCheck.reason });
                return { ok: false, stage: 'policy_sig', error: sigCheck.reason, message: sigCheck.message };
            }

            const verCheck = validateAndUpdatePolicyVersionState({ policyObj: policy, statePath: cfg.policyState });
            if (!verCheck.ok) {
                logPol.error('Policy version guard failed', { reason: verCheck.reason });
                return { ok: false, stage: 'policy_version', error: verCheck.reason, message: verCheck.message };
            }
            logPol.debug('Policy signature and version valid');
        }

        // Build and sign proposal
        if (!secretKey) return { ok: false, stage: 'sign', error: 'NO_SECRET_KEY', message: 'createLBE requires secretKey' };

        const nowSec = Math.floor(Date.now() / 1000);
        const nonce = crypto.randomBytes(32).toString('hex');
        const sessionId = defaultSession || `sdk-${Date.now()}`;
        const uuid = crypto.randomUUID();
        logExec.debug('Proposal built', { commandId: uuid, commandId_str: commandId, adapter: adapterName });

        const body = {
            id: commandId,
            risk: ['DELETE_FILE'].includes(commandId) ? 'HIGH' : (['WRITE_FILE', 'PATCH_FILE'].includes(commandId) ? 'MEDIUM' : 'LOW'),
            commandId: uuid,
            requesterId: actor,
            sessionId,
            timestamp: nowSec,
            nonce,
            requires: ['policy', 'signature'],
            payload: {
                adapter: adapterName,
                action: intent.includes('_') ? intent.split('_')[0] : intent,
                // Always store absolute path so fileAdapter.resolvedTarget() doesn't
                // double-resolve a relative target through payload.cwd (the dirname).
                target: target ? path.resolve(target) : null,
                content: content || null,
                args,
                cwd: target ? path.dirname(path.resolve(target)) : process.cwd()
            }
        };

        const signed = signEd25519({ payloadObj: body, secretKeyB64: secretKey });
        if (signed.error) {
            logExec.error('Signing failed', { error: signed.error });
            return { ok: false, stage: 'sign', commandId: uuid, error: 'SIGN_FAILED', message: signed.error };
        }

        const proposal = { ...body, signature: { alg: 'ed25519', keyId, sig: signed.signature } };

        // Validate
        const nonceDb = new NonceStore(cfg.nonceDb);
        await nonceDb.load();
        const rateLimiter = new RequestRateLimiter(cfg.rateLimit);
        await rateLimiter.load();

        const validation = validateCommand({
            commandObj: proposal, keyStore, nonceDb, policy, rateLimiter,
            // Inline policy: skip version-state file check (user owns the policy object directly)
            policyStatePath: inlinePolicy ? null : cfg.policyState
        });

        const saveState = async () => {
            await nonceDb.save().catch(() => {});
            await rateLimiter.save().catch(() => {});
        };

        if (!validation.valid) {
            logVal.warn('Validation failed', { error: validation.errors[0]?.type, checks: validation.checks });
            await saveState();
            if (tx.audit) {
                appendAudit(cfg.auditLog, {
                    commandId: uuid, status: 'rejected', requesterId: actor,
                    payloadHash: sha256obj(proposal),
                    reason: validation.errors[0]?.type, intent
                });
            }
            return {
                ok: false, stage: 'validate', commandId: uuid,
                error: validation.errors[0]?.type,
                message: validation.errors[0]?.message,
                checks: validation.checks,
                operationLog: log.exportLogs()
            };
        }

        logVal.info('Validation passed', { risk: validation.risk, checks: validation.checks });

        const risk = validation.risk || 'LOW';
        const requesterPolicy = policy.requesters?.[actor];

        // Approval gate
        if (needsApproval(risk, requesterPolicy)) {
            logExec.warn('Approval required', { risk, commandId: uuid });
            await saveState();
            const mgr = getApprovalManager(cfg.policyState);
            const tokenId = mgr.createToken(uuid, { actor, intent, target, risk, commandId });
            return {
                ok: false, stage: 'approval_pending', commandId: uuid,
                approvalToken: tokenId, risk,
                message: `${risk} risk operation requires approval. Token: ${tokenId}`,
                operationLog: log.exportLogs()
            };
        }

        // Backup — fatal for write transactions (backup: true means "guard this write")
        let backup = null;
        if (tx.backup && target) {
            const isWriteAction = ['write', 'patch', 'delete'].includes(
                body?.payload?.action ?? intent.split('_')[0]
            );
            try {
                backup = createBackup(path.resolve(target), cfg.backupDir);
                logExec.debug('Backup created', { existed: backup.existed, path: backup.backupPath });
            } catch (e) {
                if (isWriteAction) {
                    logExec.error('Backup failed — aborting write transaction', { error: e.message });
                    await saveState();
                    return { ok: false, stage: 'backup', error: 'BACKUP_FAILED', message: e.message };
                }
                logExec.warn('Backup failed (non-fatal for read)', { error: e.message });
            }
        }

        // Execute
        logExec.info('Executing adapter', { adapter: adapterName, target });
        let execResult;
        try {
            execResult = await executeAdapter(adapterName, proposal, policy, requesterPolicy);
        } catch (e) {
            execResult = { adapter: adapterName, commandId: uuid, status: 'error', error: e.message, exitCode: 1 };
        }
        logExec.debug('Adapter returned', { status: execResult.status, exitCode: execResult.exitCode });

        const failed = execResult.status === 'error' || (execResult.exitCode !== 0 && execResult.exitCode !== undefined);

        // Post-execution validation
        let postValidation = null;
        if (tx.validate && target && !failed) {
            const writeActions = ['write', 'patch'];
            const action = body.payload.action;
            if (writeActions.includes(action)) {
                const exists = fs.existsSync(path.resolve(target));
                postValidation = { ok: exists, check: 'target_exists', target };
                if (!exists) {
                    logExec.error('Post-execution validation failed — target missing after write', { target });
                    execResult.status = 'error';
                } else {
                    logExec.debug('Post-execution validation passed');
                }
            }
        }

        // Rollback on failure
        let rollback = null;
        const shouldRollback = (failed || (postValidation && !postValidation.ok)) && tx.rollbackOnFailure && backup;
        if (shouldRollback) {
            try {
                rollback = restoreBackup(backup);
                logExec.warn('Rollback executed', rollback);
            } catch (e) {
                rollback = { restored: false, error: e.message };
                logExec.error('Rollback failed', { error: e.message });
            }
        }

        // Audit
        if (tx.audit) {
            appendAudit(cfg.auditLog, {
                commandId: uuid,
                status: rollback?.restored ? 'rolled_back' : (execResult.status || 'completed'),
                requesterId: actor,
                payloadHash: sha256obj(proposal),
                executionHash: sha256obj(execResult),
                adapter: adapterName,
                intent,
                riskLevel: risk,
                exitCode: execResult.exitCode || 0,
                rolledBack: rollback?.restored || false
            });
        }

        await saveState();

        const ok = !failed && (!postValidation || postValidation.ok);
        logExec.info('execute() complete', { ok, stage: ok ? 'executed' : 'failed', risk });

        return {
            ok,
            commandId: uuid,
            intent,
            actor,
            target,
            risk,
            stage: ok ? 'executed' : 'failed',
            status: execResult.status,
            output: execResult.output || null,
            exitCode: execResult.exitCode ?? 0,
            checks: validation.checks,
            backup: backup ? { path: backup.backupPath, existed: backup.existed, hash: backup.hash } : null,
            rollback,
            postValidation,
            operationLog: logLevel === 'DEBUG' ? log.exportLogs() : undefined
        };
    }

    return {
        mode: localMode,
        rootDir,
        execute,
        // Advisory only. This does not write lbe.policy.json.
        proposePolicyRule,
        exportLogs: () => log.exportLogs(),

        // Convenience methods — use the configured defaultActor, throw on failure.
        async writeFile(target, content) {
            const r = await execute({
                actor: defaultActor, intent: 'write_file', target, content,
                transaction: { backup: true, rollbackOnFailure: true, audit: true }
            });
            if (!r.ok) {
                const err = new Error(`LBE write failed [${r.error || r.stage}]${r.message ? ': ' + r.message : ''}`);
                err.lbeResult = r;
                throw err;
            }
            return r;
        },
        async readFile(target) {
            const r = await execute({
                actor: defaultActor, intent: 'read_file', target,
                transaction: { audit: true }
            });
            if (!r.ok) {
                const err = new Error(`LBE read failed [${r.error || r.stage}]${r.message ? ': ' + r.message : ''}`);
                err.lbeResult = r;
                throw err;
            }
            return r.output;
        }
    };
}

/**
 * sandbox(root, opts?) — the simplest entry point.
 *
 * Wraps a directory with a governed fs interface. All reads and writes are
 * confined to `root`. Options let users escalate protection as needed:
 *
 *   const fs = sandbox('./workspace');
 *   const fs = sandbox('./workspace', { audit: true });
 *   const fs = sandbox('./workspace', { audit: true, rollback: true });
 *
 * @param {string}  root          Directory to confine operations to.
 * @param {object}  [opts]
 * @param {boolean} [opts.audit]    Append a hash-chained audit log to <root>/.lbe/
 * @param {boolean} [opts.rollback] Back up files before writes; restore on failure.
 */
export function sandbox(root, opts = {}) {
    const { audit = false, rollback = false } = opts;

    const resolvedRoot = path.resolve(root);

    const lbe = createLBE({
        rootDir:   resolvedRoot,
        state:     opts.state || 'local',
        logSilent: true,
    });

    const resolveTarget = t =>
        path.isAbsolute(t) ? t : path.join(resolvedRoot, t);

    const tx = { backup: rollback, rollbackOnFailure: rollback, audit };

    function sbError(method, r) {
        const err = new Error(
            `sandbox.${method} blocked [${r.error}]${r.message ? ': ' + r.message : ''}`
        );
        err.lbeResult = r;
        return err;
    }

    return {
        async write(target, content) {
            const r = await lbe.execute({
                actor: 'agent:sdk', intent: 'write_file',
                target: resolveTarget(target), content, transaction: tx
            });
            if (!r.ok) throw sbError('write', r);
        },
        async read(target) {
            const r = await lbe.execute({
                actor: 'agent:sdk', intent: 'read_file',
                target: resolveTarget(target), transaction: { audit }
            });
            if (!r.ok) throw sbError('read', r);
            return r.output;
        },
        async patch(target, content) {
            const r = await lbe.execute({
                actor: 'agent:sdk', intent: 'patch_file',
                target: resolveTarget(target), content, transaction: tx
            });
            if (!r.ok) throw sbError('patch', r);
        },
        // Escape hatch — full execute() API when you need actor/intent control
        lbe
    };
}

// Re-export primitives for consumers who need them
export { validateCommand } from './validator.js';
export { appendAudit } from './auditLog.js';
export { createBackup, restoreBackup } from './backup.js';
export { signEd25519, verifyEd25519, generateKeyPair } from './signature.js';
export { createLogger } from './logger.js';
export { deepFreeze } from './deepFreeze.js';
export { checkInvariants, assertInvariants, InvariantGateError } from './invariants.js';
export { addLocalPolicyRule, loadLocalPolicy, evaluateLocalPolicy, proposePolicyRule } from './localPolicy.js';

/**
 * Build a keyStore object from a keypair — for use with the inline `keyStore` option.
 *
 * @example
 * const { secretKey, publicKey } = generateKeyPair();
 * const lbe = createLBE({
 *   secretKey, keyId: 'mykey',
 *   keyStore: createKeyStore({ publicKey, keyId: 'mykey' }),
 *   policy: { version: 1, default: 'DENY', requesters: { ... } }
 * });
 */
export function createKeyStore({ publicKey, keyId, validDays = 365 }) {
    const now     = new Date();
    const expires = new Date(now.getTime() + validDays * 24 * 3600 * 1000);
    return {
        defaultKeyId: keyId,
        trustedKeys: {
            [keyId]: {
                publicKey,
                notBefore: now.toISOString(),
                expiresAt: expires.toISOString()
            }
        }
    };
}
