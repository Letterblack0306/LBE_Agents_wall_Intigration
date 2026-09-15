// Trusted, in-process execution controller. Agents submit simple requests;
// this controller creates the timestamp/nonce/signature envelope locally.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateKeyPair, signEd25519 } from '../core/signature.js';
import { validateCommand } from '../core/validator.js';
import { executeAdapter } from '../adapters/index.js';
import { appendAudit, verifyAuditLogIntegrity } from '../core/auditLog.js';
import { addLocalPolicyRule, auditLocalPolicy, evaluateLocalPolicy, loadLocalPolicy, proposePolicyRule } from '../core/localPolicy.js';

const INTENTS = {
    read_file: { id: 'READ_FILE', adapter: 'file', action: 'read' },
    write_file: { id: 'WRITE_FILE', adapter: 'file', action: 'write' },
    patch_file: { id: 'PATCH_FILE', adapter: 'file', action: 'patch' },
    delete_file: { id: 'DELETE_FILE', adapter: 'file', action: 'delete' },
    run_shell: { id: 'RUN_SHELL', adapter: 'shell', action: 'run' }
};

const MUTATIONS = new Set(['write_file', 'patch_file', 'delete_file']);

function error(code, message, recoverable = false) {
    return { ok: false, decision: 'deny', executed: false, dryRun: false, error: { code, message, recoverable } };
}

function commandPolicy(rootDir, actor, shell = {}) {
    const now = new Date();
    const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    return {
        version: 1,
        default: 'DENY',
        requesters: {
            [actor]: {
                allowCommands: Object.values(INTENTS).map(item => item.id),
                allowAdapters: ['file', 'shell'],
                filesystem: { roots: [rootDir], denyPatterns: [] },
                exec: { allowCmds: shell.allowCommands || [], denyCmds: shell.denyCommands || [] },
                rateLimit: { windowSec: 60, maxRequests: shell.maxRequests || 60 }
            }
        },
        security: { maxClockSkewSec: 600, defaultRateLimit: { windowSec: 60, maxRequests: 60 } },
        _keyWindow: { notBefore: now.toISOString(), expiresAt: expires.toISOString() }
    };
}

function physicalPath(candidate) {
    let current = path.resolve(candidate);
    const suffix = [];
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) break;
        suffix.unshift(path.basename(current));
        current = parent;
    }
    try { current = fs.realpathSync(current); } catch { /* lexical fallback */ }
    return path.join(current, ...suffix);
}

function underRoot(candidate, root) {
    const target = physicalPath(candidate);
    const resolvedRoot = physicalPath(root);
    return target === resolvedRoot || target.startsWith(resolvedRoot + path.sep);
}

const FORBIDDEN_CONTENT = [
    /\beval\s*\(/i, /\bFunction\s*\(/i, /\bexec\s*\(/i,
    /\brequire\s*\(/, /\bimport\s*\(/, /\bchild_process\b/,
    /\b__proto__\b/, /\bconstructor\s*\[/, /evalScript/i,
];

function scanContent(value, fieldName) {
    if (typeof value !== 'string') return null;
    for (const pattern of FORBIDDEN_CONTENT) {
        if (pattern.test(value)) {
            return error('PAYLOAD_CONTENT_REJECTED', `Forbidden pattern in ${fieldName}: ${pattern}`);
        }
    }
    return null;
}

function normalize(rootDir, request, shell = {}) {
    if (!request || typeof request !== 'object') return { error: error('REQUEST_INVALID', 'request must be an object') };
    const detail = INTENTS[request.intent];
    if (!detail) return { error: error('INTENT_UNSUPPORTED', `Unsupported intent '${request.intent}'`) };
    const actor = typeof request.actor === 'string' && request.actor ? request.actor : 'agent:local';
    let target = null;
    if (detail.adapter === 'file') {
        if (typeof request.target !== 'string' || !request.target) return { error: error('TARGET_REQUIRED', 'target is required for file intents') };
        target = path.resolve(rootDir, request.target);
        if (!underRoot(target, rootDir)) return { error: error('PATH_OUTSIDE_ROOT', 'target is outside project root') };
        if (['write_file', 'patch_file'].includes(request.intent) && typeof request.content !== 'string') {
            return { error: error('CONTENT_REQUIRED', 'content is required for write and patch') };
        }
        const contentScan = scanContent(request.content, 'content');
        if (contentScan) return { error: contentScan };
    }
    let command = null;
    if (detail.adapter === 'shell') {
        command = request.command;
        if (!command || typeof command.cmd !== 'string' || !Array.isArray(command.args) || command.args.some(arg => typeof arg !== 'string')) {
            return { error: error('COMMAND_INVALID', 'command requires cmd and string args') };
        }
        const cwd = path.resolve(rootDir, command.cwd || '.');
        if (!underRoot(cwd, rootDir)) return { error: error('CWD_OUTSIDE_ROOT', 'command cwd is outside project root') };
        if (!Array.isArray(shell.allowCommands) || !shell.allowCommands.includes(command.cmd)) {
            return { error: error('SHELL_NOT_ALLOWLISTED', `command '${command.cmd}' is not explicitly allowlisted`) };
        }
        if (shell.denyCommands?.includes(command.cmd)) return { error: error('SHELL_DENIED', `command '${command.cmd}' is denied`) };
        command = { ...command, cwd, timeoutMs: Math.min(Math.max(command.timeoutMs || 30000, 1), 30000), maxOutputBytes: Math.min(Math.max(command.maxOutputBytes || 1024 * 1024, 1024), 1024 * 1024) };
    }
    return { actor, detail, target, command, request };
}

function envelope(normalized, keyId, secretKey) {
    const { actor, detail, target, command, request } = normalized;
    const body = {
        id: detail.id,
        risk: MUTATIONS.has(request.intent) ? 'MEDIUM' : 'LOW',
        commandId: crypto.randomUUID(),
        requesterId: actor,
        sessionId: 'local-host',
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomBytes(32).toString('hex'),
        requires: ['policy', 'signature'],
        payload: {
            adapter: detail.adapter,
            action: detail.action,
            target,
            content: request.content,
            cmd: command?.cmd,
            args: command?.args,
            timeoutMs: command?.timeoutMs,
            maxOutputBytes: command?.maxOutputBytes,
            cwd: command?.cwd || (target ? path.dirname(target) : process.cwd())
        }
    };
    const signed = signEd25519({ payloadObj: body, secretKeyB64: secretKey });
    if (signed.error) throw new Error(signed.error);
    return { ...body, signature: { alg: 'ed25519', keyId, sig: signed.signature } };
}

export function createLocalExecutor(options = {}) {
    const rootDir = path.resolve(options.rootDir || process.cwd());
    const keyId = options.keyId || 'host:local-exec';
    const keyPair = options.keyPair || generateKeyPair();
    const shell = options.shell || {};

    function prepare(request, { recordNonce = false } = {}) {
        const normalized = normalize(rootDir, request, shell);
        if (normalized.error) return normalized;
        // When no mode is passed and no policy file exists, default to enforce.
        // Observe mode activates only when explicitly set via options.mode or via
        // npx lbe init which writes lbe.policy.json with mode:'observe'.
        const local = loadLocalPolicy(rootDir, options.mode || 'enforce');
        const localDecision = evaluateLocalPolicy(local.policy, rootDir, { target: normalized.target, command: normalized.command?.cmd });
        const localBlocked = local.policy.mode === 'enforce' && !localDecision.allowed;
        if (localBlocked) return { error: error('LOCAL_POLICY_DENY', `Blocked by rule(s): ${localDecision.winningRules.map(rule => rule.id).join(', ')}`), local, localDecision, normalized };
        const policy = commandPolicy(rootDir, normalized.actor, shell);
        const keyStore = { defaultKeyId: keyId, trustedKeys: { [keyId]: { publicKey: keyPair.publicKey, notBefore: policy._keyWindow.notBefore, expiresAt: policy._keyWindow.expiresAt, deprecated: false } } };
        delete policy._keyWindow;
        const proposal = envelope(normalized, keyId, keyPair.secretKey);
        const nonceDb = { entries: [] };
        const validation = validateCommand({ commandObj: proposal, keyStore, nonceDb: recordNonce ? nonceDb : { entries: [] }, policy });
        if (!validation.valid) return { error: error(validation.errors[0]?.type || 'VALIDATION_FAILED', validation.errors[0]?.message || 'Validation failed'), local, localDecision, normalized, proposal, policy, validation };
        return { local, localDecision, normalized, proposal, policy, validation };
    }

    // Sync decision path — for CJS preload hooks that cannot await.
    // Uses local policy only (no WASM, no nonce, no signature).
    function evaluateSync(action) {
        const local = loadLocalPolicy(rootDir, options.mode || 'observe');
        const mode = local.policy.mode;
        let target = null;
        let command = null;
        if (action.path) {
            try {
                target = path.resolve(rootDir, action.path);
                if (!underRoot(target, rootDir)) {
                    return { decision: 'deny', deny: true, matchedRules: ['path:outside_root'], mode, enforced: mode === 'enforce', reason: 'PATH_OUTSIDE_ROOT' };
                }
            } catch (e) { /* ignore resolution errors, fall through to policy check */ }
        }
        if (action.cmd) command = action.cmd;
        const localDecision = evaluateLocalPolicy(local.policy, rootDir, { target, command });
        const isDeny = !localDecision.allowed;
        return {
            decision: isDeny ? 'deny' : 'allow',
            deny: isDeny,
            matchedRules: localDecision.winningRules.map(r => r.id),
            mode,
            enforced: mode === 'enforce',
        };
    }

    // Sync audit write to unified event log.
    // Uses openSync/writeSync/closeSync to bypass JS wrappers and avoid recursion
    // if the CJS preload hook has patched fs.writeFileSync in this process.
    function auditSync(entry) {
        const eventsPath = path.join(rootDir, '.lbe', 'events.jsonl');
        const dir = path.dirname(eventsPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const line = JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...entry }) + '\n';
        const fd = fs.openSync(eventsPath, 'a');
        try { fs.writeSync(fd, line); } finally { fs.closeSync(fd); }
    }

    async function dryRun(request) {
        const prepared = prepare(request);
        if (prepared.error) return { ...prepared.error, dryRun: true };
        return {
            ok: true,
            decision: prepared.local.policy.mode === 'observe' ? 'observe' : 'allow',
            executed: false,
            dryRun: true,
            matchedRules: prepared.localDecision.winningRules.map(rule => rule.id),
            rollback: { available: MUTATIONS.has(prepared.normalized.request.intent), performed: false }
        };
    }

    async function execute(request) {
        const prepared = prepare(request, { recordNonce: true });
        if (prepared.error) {
            auditLocalPolicy(rootDir, { action: request?.intent, actor: request?.actor || 'agent:local', decision: 'deny', error: prepared.error.error.code });
            return prepared.error;
        }
        // Observer mode: validate and audit but never mutate state.
        if (prepared.local.policy.mode === 'observe') {
            appendAudit(path.join(rootDir, '.lbe/audit.jsonl'), {
                kind: 'local_execution', commandId: prepared.proposal.commandId, requesterId: prepared.normalized.actor,
                intent: prepared.normalized.request.intent, decision: 'observe', status: 'observed'
            });
            return {
                ok: true, decision: 'observe', executed: false, dryRun: false,
                matchedRules: prepared.localDecision.winningRules.map(r => r.id),
                rollback: { available: false, performed: false }
            };
        }
        const requester = prepared.policy.requesters[prepared.normalized.actor];
        const adapterResult = await executeAdapter(prepared.normalized.detail.adapter, prepared.proposal, prepared.policy, requester);
        const ok = adapterResult.status === 'completed';
        const audit = appendAudit(path.join(rootDir, '.lbe/audit.jsonl'), {
            kind: 'local_execution', commandId: prepared.proposal.commandId, requesterId: prepared.normalized.actor,
            intent: prepared.normalized.request.intent, decision: ok ? 'allow' : 'deny', status: adapterResult.status
        });
        return {
            ok,
            decision: ok ? 'allow' : 'deny',
            executed: ok,
            dryRun: false,
            matchedRules: prepared.localDecision.winningRules.map(rule => rule.id),
            auditId: audit.hash,
            rollback: { available: MUTATIONS.has(prepared.normalized.request.intent), performed: false, backupId: adapterResult.backup?.hash },
            ...(ok ? {} : { error: { code: adapterResult.errorCode || 'EXECUTION_FAILED', message: adapterResult.error || 'Execution failed', recoverable: true } })
        };
    }

    // Convenience methods — agents use these; internals stay hidden
    const writeFile  = (target, content)        => execute({ intent: 'write_file',  target, content });
    const readFile   = (target)                  => execute({ intent: 'read_file',   target });
    const patchFile  = (target, content)         => execute({ intent: 'patch_file',  target, content });
    const deleteFile = (target)                  => execute({ intent: 'delete_file', target });
    const runShell   = (cmd, args = [], opts = {}) =>
        execute({ intent: 'run_shell', command: { cmd, args, ...opts } });

    return {
        rootDir,
        // High-level API — use these
        writeFile,
        readFile,
        patchFile,
        deleteFile,
        runShell,
        // Low-level API — for advanced use
        validate: async request => {
            const preview = await dryRun(request);
            return { ...preview, dryRun: false, executed: false };
        },
        dryRun,
        execute,
        policy: {
            read: () => loadLocalPolicy(rootDir, options.mode || 'enforce').policy,
            proposeRule: proposePolicyRule,
            addRule: rule => addLocalPolicyRule(rootDir, rule, options.mode || 'enforce')
        },
        audit: { verify: () => verifyAuditLogIntegrity(path.join(rootDir, '.lbe/audit.jsonl')) },
        evaluateSync,
        auditSync,
    };
}
