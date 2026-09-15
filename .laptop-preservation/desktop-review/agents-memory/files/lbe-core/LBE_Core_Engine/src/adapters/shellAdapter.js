// src/adapters/shellAdapter.js
// Safe shell command execution adapter with strict allowlisting

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function physicalPath(candidate) {
    try { return fs.realpathSync(path.resolve(candidate)); } catch { return path.resolve(candidate); }
}

function normalizeArgs(args) {
    if (args === undefined) return { ok: true, args: [] };
    if (!Array.isArray(args)) {
        return { ok: false, error: 'payload.args must be an array' };
    }

    const normalized = [];
    for (const arg of args) {
        if (typeof arg !== 'string' && typeof arg !== 'number' && typeof arg !== 'boolean') {
            return { ok: false, error: 'payload.args may only contain string, number, or boolean values' };
        }
        normalized.push(String(arg));
    }
    return { ok: true, args: normalized };
}

export async function shellAdapter(cmd, policy, requester) {
    const payload = cmd.payload;
    const timeout = Math.min(Math.max(Number(payload.timeoutMs) || 30000, 1), 30000);
    const maxOutputSize = Math.min(Math.max(Number(payload.maxOutputBytes) || 1024 * 1024, 1024), 1024 * 1024);

    // Validate adapter match
    if (payload.adapter !== 'shell') {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            status: 'error',
            error: 'Adapter mismatch',
            exitCode: 1
        };
    }

    // Validate command and cwd against policy
    const allowedCmds = requester?.exec?.allowCmds || [];
    const deniedCmds = requester?.exec?.denyCmds || [];

    if (deniedCmds.includes(payload.cmd)) {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            status: 'blocked',
            error: `Command '${payload.cmd}' is denied`,
            exitCode: 2
        };
    }

    if (allowedCmds.length > 0 && !allowedCmds.includes(payload.cmd)) {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            status: 'blocked',
            error: `Command '${payload.cmd}' not in allowlist`,
            exitCode: 2
        };
    }

    // Validate cwd
    const roots = requester?.filesystem?.roots || [];
    const cwdAllow = roots.some(r => {
        const resolvedRoot = physicalPath(r);
        const norm = physicalPath(payload.cwd);
        return norm === resolvedRoot || norm.startsWith(resolvedRoot + path.sep);
    });

    if (!cwdAllow) {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            status: 'blocked',
            error: `CWD '${payload.cwd}' not authorized`,
            exitCode: 2
        };
    }

    const argCheck = normalizeArgs(payload.args);
    if (!argCheck.ok) {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            status: 'blocked',
            error: argCheck.error,
            exitCode: 2
        };
    }

    // Execute directly with argv. shell:false keeps metacharacters as data.
    try {
        const result = spawnSync(payload.cmd, argCheck.args, {
            cwd: payload.cwd,
            timeout,
            encoding: 'utf8',
            maxBuffer: maxOutputSize,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false
        });

        if (result.error) {
            throw result.error;
        }

        const output = `${result.stdout || ''}${result.stderr || ''}`;
        const exitCode = result.status ?? 1;
        if (exitCode !== 0) {
            return {
                adapter: 'shell',
                commandId: cmd.commandId,
                command: payload.cmd,
                status: 'error',
                error: output.substring(0, maxOutputSize) || `Command exited with code ${exitCode}`,
                exitCode,
                timestamp: new Date().toISOString()
            };
        }

        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            command: payload.cmd,
            status: 'completed',
            output: output.substring(0, maxOutputSize),
            exitCode: 0,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        return {
            adapter: 'shell',
            commandId: cmd.commandId,
            command: payload.cmd,
            status: 'error',
            error: err.message,
            exitCode: err.status || 1,
            timestamp: new Date().toISOString()
        };
    }
}
