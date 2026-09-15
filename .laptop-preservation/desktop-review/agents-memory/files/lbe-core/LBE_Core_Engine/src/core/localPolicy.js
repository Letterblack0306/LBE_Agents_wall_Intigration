// Project-local policy layer. This is intentionally separate from the signed
// deployment policy: it is a small, auditable controller-owned rule ledger.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { appendAudit } from './auditLog.js';
import { atomicWriteFileSync } from './atomicWrite.js';

export const POLICY_FILE = '.lbe/policy.json';
export const AUDIT_FILE = '.lbe/audit.jsonl';

function glob(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // **/ also matches no directory, so **/.env* covers a root-level .env.
    return new RegExp('^' + escaped.replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
}

function relative(root, value) {
    const rel = path.relative(root, path.resolve(value));
    return rel.split(path.sep).join('/');
}

export function localPolicyPaths(rootDir) {
    const root = path.resolve(rootDir || process.cwd());
    return { root, policyPath: path.join(root, POLICY_FILE), auditPath: path.join(root, AUDIT_FILE) };
}

export function loadLocalPolicy(rootDir, mode = 'observe') {
    const paths = localPolicyPaths(rootDir);
    if (!fs.existsSync(paths.policyPath)) {
        return { ...paths, policy: { version: 1, mode, workspace: paths.root, rules: [] } };
    }
    const policy = JSON.parse(fs.readFileSync(paths.policyPath, 'utf8'));
    if (policy?.version !== 1 || !['observe', 'enforce'].includes(policy.mode) || !Array.isArray(policy.rules)) {
        throw new Error(`Invalid ${POLICY_FILE}`);
    }
    return { ...paths, policy };
}

// Controller-only persistence primitive. Agents should use proposePolicyRule()
// and pass the proposal to a controller/operator instead of calling this.
export function writeLocalPolicy(rootDir, policy) {
    const { policyPath, root } = localPolicyPaths(rootDir);
    const next = { ...policy, version: 1, workspace: root, rules: Array.isArray(policy.rules) ? policy.rules : [] };
    atomicWriteFileSync(policyPath, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8' });
    return next;
}

export function addLocalPolicyRule(rootDir, rule, mode) {
    if (!rule || !['allow', 'deny'].includes(rule.effect) || !['path', 'command'].includes(rule.type)
        || typeof rule.pattern !== 'string' || !rule.pattern || typeof rule.from !== 'string' || !rule.from) {
        throw new Error('Rule requires effect, type, pattern, and from');
    }
    const loaded = loadLocalPolicy(rootDir, mode);
    const entry = { id: rule.id || crypto.randomUUID(), effect: rule.effect, type: rule.type,
        pattern: rule.pattern, from: rule.from, at: rule.at || new Date().toISOString() };
    writeLocalPolicy(loaded.root, { ...loaded.policy, mode: mode || loaded.policy.mode, rules: [...loaded.policy.rules, entry] });
    return { id: entry.id, added: true, rule: entry };
}

export function proposePolicyRule(rule) {
    return { ...rule, proposed: true, at: new Date().toISOString() };
}

export function evaluateLocalPolicy(policy, rootDir, { target, command } = {}) {
    const root = path.resolve(rootDir);
    const candidates = [];
    if (target) candidates.push({ type: 'path', value: relative(root, target) });
    if (command) candidates.push({ type: 'command', value: command });
    const matched = policy.rules.filter(rule => candidates.some(c => c.type === rule.type && glob(rule.pattern).test(c.value)));
    // Deny is independent of creation order and always has priority over allow.
    const denied = matched.filter(rule => rule.effect === 'deny');
    return { allowed: denied.length === 0, matched, winningRules: denied.length ? denied : matched.filter(r => r.effect === 'allow'), reason: denied.length ? 'LOCAL_POLICY_DENY' : null };
}

export function auditLocalPolicy(rootDir, entry) {
    const { auditPath } = localPolicyPaths(rootDir);
    appendAudit(auditPath, { kind: 'local_policy', timestamp: new Date().toISOString(), ...entry });
}
