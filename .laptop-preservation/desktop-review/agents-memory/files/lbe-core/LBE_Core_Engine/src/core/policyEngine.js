// src/core/policyEngine.js
// Deny-by-default policy evaluation engine

import path from 'path';
import { evaluatePolicyDecision } from '../../runtime/engine.js';

function isUnderRoot(p, roots) {
    if (!roots || roots.length === 0) return false;

    const norm = path.resolve(p);
    return roots.some(r => {
        const resolvedRoot = path.resolve(r);
        return norm === resolvedRoot || norm.startsWith(resolvedRoot + path.sep);
    });
}

function matchPattern(str, pattern) {
    // Simple glob pattern matching for deny patterns
    // Supports ** and * wildcards
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
}

export function evaluatePolicy(policy, cmd) {
    const policyConfigured = !!(policy && !(policy.default === 'DENY' && !policy.requesters));
    const requester = policy?.requesters?.[cmd.requesterId];
    const requesterConfigured = !!requester;

    // Check command is allowed — case-insensitive so policy can use 'write_file' or 'WRITE_FILE'
    const cmdIdNorm = cmd.id.toLowerCase();
    const commandAllowed = requester?.allowCommands?.some(c => c.toLowerCase() === cmdIdNorm) || false;

    // Check adapter is allowed
    const adapterAllowed = requester?.allowAdapters?.includes(cmd.payload?.adapter) || false;

    // Filesystem root enforcement
    let filesystemRequired = false;
    let filesystemRootsDefined = false;
    let filesystemOk = true;
    let pathDenied = false;
    let deniedPattern = null;
    if (cmd.payload?.cwd) {
        filesystemRequired = true;
        const roots = requester?.filesystem?.roots || [];
        filesystemRootsDefined = roots.length > 0;
        filesystemOk = filesystemRootsDefined && isUnderRoot(cmd.payload.cwd, roots);

        // Check deny patterns
        const denyPatterns = requester?.filesystem?.denyPatterns || [];
        for (const pattern of denyPatterns) {
            if (matchPattern(cmd.payload.cwd, pattern)) {
                pathDenied = true;
                deniedPattern = pattern;
                break;
            }
        }
    }

    // Shell command enforcement
    let shellRequired = false;
    let shellCommandOk = true;
    let shellDenied = false;
    if (cmd.id === 'RUN_SHELL') {
        shellRequired = true;
        const allow = requester?.exec?.allowCmds || [];
        const deny = requester?.exec?.denyCmds || [];
        const c = cmd.payload?.cmd;
        shellDenied = deny.includes(c);
        shellCommandOk = !shellDenied && (allow.length === 0 || allow.includes(c));
    }

    const decision = evaluatePolicyDecision({
        policyConfigured,
        requesterConfigured,
        commandAllowed,
        adapterAllowed,
        filesystemRequired,
        filesystemRootsDefined,
        filesystemOk,
        pathDenied,
        shellRequired,
        shellCommandOk
    });

    if (decision.allowed) return decision;
    if (decision.reason === 'REQUESTER_NOT_ALLOWED') {
        return { ...decision, message: `Requester '${cmd.requesterId}' not in policy` };
    }
    if (decision.reason === 'COMMAND_NOT_ALLOWED') {
        return { ...decision, message: `Command '${cmd.id}' not allowed for requester` };
    }
    if (decision.reason === 'ADAPTER_NOT_ALLOWED') {
        return { ...decision, message: `Adapter '${cmd.payload?.adapter}' not allowed` };
    }
    if (decision.reason === 'CWD_OUTSIDE_ALLOWED_ROOT') {
        return { ...decision, message: `Path '${cmd.payload.cwd}' not under allowed roots` };
    }
    if (decision.reason === 'PATH_DENIED_BY_PATTERN') {
        return { ...decision, message: `Path '${cmd.payload.cwd}' matches deny pattern: ${deniedPattern}` };
    }
    if (decision.reason === 'SHELL_CMD_DENIED') {
        const c = cmd.payload?.cmd;
        return {
            ...decision,
            reason: shellDenied ? 'SHELL_CMD_DENIED' : 'SHELL_CMD_NOT_ALLOWLISTED',
            message: shellDenied ? `Shell command '${c}' is explicitly denied` : `Shell command '${c}' not in allowlist`
        };
    }
    return decision;
}

export function riskLevel(cmd) {
    // Simple risk scoring
    if (cmd.payload?.cmd === 'rm') return 'CRITICAL';
    if (['delete', 'destroy', 'remove'].some(w => cmd.id.toLowerCase().includes(w))) return 'HIGH';
    if (['write', 'create', 'update'].some(w => cmd.id.toLowerCase().includes(w))) return 'MEDIUM';
    return 'LOW';
}
