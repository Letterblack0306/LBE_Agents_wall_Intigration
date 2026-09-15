'use strict';
// LBE Agent Bridge — CJS preload hook
// Load with: node --require @letterblack/lbe-core/hooks/register.cjs agent.js

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');

const ROOT_DIR = process.env.LBE_ROOT || process.cwd();
const MODE = process.env.LBE_MODE || 'observe';

// ── Central state (alpha5 dual-write) ────────────────────────────────────────
// Resolved once at preload. Failures are non-fatal — central write is best-effort.
// Policy authority stays in .lbe/policy.json; this only adds a mirror log.
var _centralState    = null;
var _appendCentral   = null;

// ── Policy loader (inline CJS — ESM cannot be require()'d synchronously) ────

function loadPolicy() {
    // .lbe/policy.json is canonical. Fall back to legacy lbe.policy.json in root.
    const policyPath = fs.existsSync(path.join(ROOT_DIR, '.lbe', 'policy.json'))
        ? path.join(ROOT_DIR, '.lbe', 'policy.json')
        : path.join(ROOT_DIR, 'lbe.policy.json');
    try {
        if (fs.existsSync(policyPath)) {
            return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
        }
    } catch (e) { /* fall through to default */ }
    return { version: 1, mode: MODE, workspace: ROOT_DIR, rules: [] };
}

function globToRegex(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$');
}

function evaluatePolicy(action) {
    const policy = loadPolicy();
    const mode = policy.mode || MODE;
    const rules = Array.isArray(policy.rules) ? policy.rules : [];

    if (action.path) {
        try {
            const abs = path.resolve(ROOT_DIR, action.path);
            const sep = path.sep;
            if (!abs.startsWith(ROOT_DIR + sep) && abs !== ROOT_DIR) {
                return { decision: 'deny', deny: true, reason: 'PATH_OUTSIDE_ROOT', matchedRules: ['path:outside_root'], mode, enforced: mode === 'enforce' };
            }
            const rel = path.relative(ROOT_DIR, abs).split(sep).join('/');
            const matched = rules.filter(r => r.type === 'path' && globToRegex(r.pattern).test(rel));
            const denied = matched.filter(r => r.effect === 'deny');
            const isDeny = denied.length > 0;
            return {
                decision: isDeny ? 'deny' : 'allow', deny: isDeny,
                matchedRules: (isDeny ? denied : matched.filter(r => r.effect === 'allow')).map(r => r.id),
                mode, enforced: mode === 'enforce',
            };
        } catch (e) {
            if (mode === 'enforce') {
                return { decision: 'deny', deny: true, reason: 'PATH_RESOLUTION_ERROR', matchedRules: [], mode, enforced: true };
            }
        }
    }

    if (action.cmd) {
        const matched = rules.filter(r => r.type === 'command' && globToRegex(r.pattern).test(String(action.cmd)));
        const denied = matched.filter(r => r.effect === 'deny');
        const isDeny = denied.length > 0;
        return {
            decision: isDeny ? 'deny' : 'allow', deny: isDeny,
            matchedRules: (isDeny ? denied : matched.filter(r => r.effect === 'allow')).map(r => r.id),
            mode, enforced: mode === 'enforce',
        };
    }

    return { decision: 'allow', deny: false, matchedRules: [], mode, enforced: mode === 'enforce' };
}

// ── Audit writer ──────────────────────────────────────────────────────────────
// fs.appendFileSync → fs.writeFileSync (Node.js internal) → would recurse.
// fs.openSync/writeSync/closeSync are low-level bindings — never call back into JS.
// Re-entrant guard prevents recursion from any code path we missed.

var _auditInFlight = false;

function auditEvent(entry) {
    if (_auditInFlight) return;
    _auditInFlight = true;
    try {
        var eventsPath = path.join(ROOT_DIR, '.lbe', 'events.jsonl');
        var dir = path.dirname(eventsPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        var line = JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...entry }) + '\n';
        // Use open/write/close directly — bypasses all JS wrappers including writeFileSync
        var fd = fs.openSync(eventsPath, 'a');
        try { fs.writeSync(fd, line); } finally { fs.closeSync(fd); }
    } catch (e) {
        console.warn('[lbe] audit write failed:', e.message);
    } finally {
        // Central dual-write — best-effort, always silent on failure.
        // _auditInFlight remains true here, preventing recursive audit from
        // any patched fs calls inside appendJsonlSync (e.g. lock cleanup).
        if (_centralState && _appendCentral) {
            try { _appendCentral.appendJsonlSync(_centralState.paths.events, entry); } catch (_) {}
        }
        _auditInFlight = false;
    }
}

class LBEPermissionError extends Error {
    constructor(decision, action) {
        const target = action.path || action.cmd || 'unknown';
        super('[LBE:' + decision.mode + '] DENIED ' + action.action + ' on ' + target);
        this.name = 'LBEPermissionError';
        this.code = 'LBE_PERMISSION_DENIED';
        this.lbeDecision = decision;
    }
}

// ── Originals — captured BEFORE any patch is applied ────────────────────────

const origFs = {
    writeFile:     fs.writeFile.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    rm:            fs.rm     ? fs.rm.bind(fs)     : null,
    rmSync:        fs.rmSync ? fs.rmSync.bind(fs) : null,
    unlink:        fs.unlink.bind(fs),
    unlinkSync:    fs.unlinkSync.bind(fs),
    rename:        fs.rename.bind(fs),
    renameSync:    fs.renameSync.bind(fs),
};

const origPromises = {
    writeFile: fs.promises.writeFile.bind(fs.promises),
    rm:        fs.promises.rm     ? fs.promises.rm.bind(fs.promises)     : null,
    unlink:    fs.promises.unlink.bind(fs.promises),
    rename:    fs.promises.rename.bind(fs.promises),
};

const cp = require('child_process');
const origCp = {
    spawn:     cp.spawn.bind(cp),
    spawnSync: cp.spawnSync.bind(cp),
    exec:      cp.exec.bind(cp),
    execSync:  cp.execSync.bind(cp),
};

// ── Denied spawn stub — EventEmitter-compatible ───────────────────────────────

function makeFailedChildProcess(err) {
    const emitter = new EventEmitter();
    emitter.pid        = null;
    emitter.killed     = false;
    emitter.exitCode   = 1;
    emitter.signalCode = null;
    emitter.stdout     = new Readable({ read() {} });
    emitter.stderr     = new Readable({ read() {} });
    emitter.stdin      = { write() { return false; }, end() {}, destroy() {} };
    emitter.kill       = () => false;
    emitter.ref        = () => emitter;
    emitter.unref      = () => emitter;
    process.nextTick(function () {
        emitter.stdout.push(null);
        emitter.stderr.push(null);
        emitter.emit('error', err);
        emitter.emit('close', 1, null);
        emitter.emit('exit', 1, null);
    });
    return emitter;
}

// ── Decision + pre-block audit ────────────────────────────────────────────────

function decide(action) {
    var decision;
    try {
        decision = evaluatePolicy(action);
    } catch (e) {
        if (MODE === 'enforce') {
            var failErr = new LBEPermissionError({ mode: 'enforce', enforced: true }, action);
            try { auditEvent({ action: action.action, path: action.path, cmd: action.cmd, actor: 'agent:lbe-hooks', decision: 'deny', mode: 'enforce', enforced: true, executed: false, matched_rules: [], error: e.message }); } catch (_) {}
            return { blocked: true, error: failErr };
        }
        console.warn('[lbe] policy evaluation failed (observe mode, allowing):', e.message);
        return { blocked: false, decision: { decision: 'allow', deny: false, matchedRules: [], mode: 'observe', enforced: false } };
    }

    if (decision.deny && decision.enforced) {
        var err = new LBEPermissionError(decision, action);
        try { auditEvent({ action: action.action, path: action.path, cmd: action.cmd, actor: 'agent:lbe-hooks', decision: 'deny', mode: decision.mode, enforced: true, executed: false, matched_rules: decision.matchedRules }); } catch (_) {}
        return { blocked: true, error: err };
    }

    return { blocked: false, decision: decision };
}

function postAudit(action, decision, executed, extra) {
    try {
        auditEvent(Object.assign({ action: action.action, path: action.path, cmd: action.cmd, actor: 'agent:lbe-hooks', decision: decision.decision, mode: decision.mode, enforced: decision.enforced, executed: executed, matched_rules: decision.matchedRules }, extra || {}));
    } catch (e) {
        console.warn('[lbe] post-action audit failed (result unaffected):', e.message);
    }
}

// ── Patch fs callbacks ────────────────────────────────────────────────────────

fs.writeFile = function lbeWriteFile(filePath, data, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    var action = { action: 'file_write', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { process.nextTick(function () { callback(check.error); }); return; }
    function done(err) {
        postAudit(action, check.decision, !err, err ? { error: err.message } : null);
        callback(err);
    }
    if (options !== undefined) { origFs.writeFile(filePath, data, options, done); }
    else { origFs.writeFile(filePath, data, done); }
};

fs.writeFileSync = function lbeWriteFileSync(filePath, data, options) {
    var action = { action: 'file_write', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = options !== undefined ? origFs.writeFileSync(filePath, data, options) : origFs.writeFileSync(filePath, data);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

if (origFs.rm) {
    fs.rm = function lbeRm(filePath, options, callback) {
        if (typeof options === 'function') { callback = options; options = undefined; }
        var action = { action: 'file_delete', path: String(filePath) };
        var check = decide(action);
        if (check.blocked) { process.nextTick(function () { callback(check.error); }); return; }
        function done(err) {
            postAudit(action, check.decision, !err, err ? { error: err.message } : null);
            callback(err);
        }
        if (options !== undefined) { origFs.rm(filePath, options, done); }
        else { origFs.rm(filePath, done); }
    };
}

if (origFs.rmSync) {
    fs.rmSync = function lbeRmSync(filePath, options) {
        var action = { action: 'file_delete', path: String(filePath) };
        var check = decide(action);
        if (check.blocked) { throw check.error; }
        try {
            var result = options !== undefined ? origFs.rmSync(filePath, options) : origFs.rmSync(filePath);
            postAudit(action, check.decision, true);
            return result;
        } catch (e) {
            postAudit(action, check.decision, false, { error: e.message });
            throw e;
        }
    };
}

fs.unlink = function lbeUnlink(filePath, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    var action = { action: 'file_delete', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { process.nextTick(function () { callback(check.error); }); return; }
    origFs.unlink(filePath, function done(err) {
        postAudit(action, check.decision, !err, err ? { error: err.message } : null);
        callback(err);
    });
};

fs.unlinkSync = function lbeUnlinkSync(filePath) {
    var action = { action: 'file_delete', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = origFs.unlinkSync(filePath);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

fs.rename = function lbeRename(oldPath, newPath, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    var action = { action: 'file_rename', path: String(oldPath), dest: String(newPath) };
    var check = decide(action);
    if (check.blocked) { process.nextTick(function () { callback(check.error); }); return; }
    origFs.rename(oldPath, newPath, function done(err) {
        postAudit(action, check.decision, !err, err ? { error: err.message } : null);
        callback(err);
    });
};

fs.renameSync = function lbeRenameSync(oldPath, newPath) {
    var action = { action: 'file_rename', path: String(oldPath), dest: String(newPath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = origFs.renameSync(oldPath, newPath);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

// ── Patch fs.promises ─────────────────────────────────────────────────────────

fs.promises.writeFile = async function lbePromisesWriteFile(filePath, data, options) {
    var action = { action: 'file_write', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = options !== undefined
            ? await origPromises.writeFile(filePath, data, options)
            : await origPromises.writeFile(filePath, data);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

if (origPromises.rm) {
    fs.promises.rm = async function lbePromisesRm(filePath, options) {
        var action = { action: 'file_delete', path: String(filePath) };
        var check = decide(action);
        if (check.blocked) { throw check.error; }
        try {
            var result = options !== undefined
                ? await origPromises.rm(filePath, options)
                : await origPromises.rm(filePath);
            postAudit(action, check.decision, true);
            return result;
        } catch (e) {
            postAudit(action, check.decision, false, { error: e.message });
            throw e;
        }
    };
}

fs.promises.unlink = async function lbePromisesUnlink(filePath) {
    var action = { action: 'file_delete', path: String(filePath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = await origPromises.unlink(filePath);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

fs.promises.rename = async function lbePromisesRename(oldPath, newPath) {
    var action = { action: 'file_rename', path: String(oldPath), dest: String(newPath) };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = await origPromises.rename(oldPath, newPath);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

// ── Patch child_process ───────────────────────────────────────────────────────

cp.spawn = function lbeSpawn(cmd, args, options) {
    if (args && !Array.isArray(args)) { options = args; args = []; }
    var cwd = options && options.cwd ? String(options.cwd) : ROOT_DIR;
    var shell = !!(options && options.shell);
    var action = { action: 'run_shell', cmd: String(cmd), args: args || [], cwd: cwd, shell: shell };
    var check = decide(action);
    if (check.blocked) { return makeFailedChildProcess(check.error); }
    var child = origCp.spawn(cmd, args || [], options || {});
    child.on('close', function (code) { postAudit(action, check.decision, code === 0, { exit_code: code }); });
    return child;
};

cp.spawnSync = function lbeSpawnSync(cmd, args, options) {
    if (args && !Array.isArray(args)) { options = args; args = []; }
    var cwd = options && options.cwd ? String(options.cwd) : ROOT_DIR;
    var shell = !!(options && options.shell);
    var action = { action: 'run_shell', cmd: String(cmd), args: args || [], cwd: cwd, shell: shell };
    var check = decide(action);
    if (check.blocked) {
        return { pid: 0, output: [null, Buffer.alloc(0), Buffer.alloc(0)], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 1, signal: null, error: check.error };
    }
    var result = origCp.spawnSync(cmd, args || [], options || {});
    postAudit(action, check.decision, result.status === 0, { exit_code: result.status });
    return result;
};

cp.exec = function lbeExec(command, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    var cwd = options && options.cwd ? String(options.cwd) : ROOT_DIR;
    var action = { action: 'run_shell', cmd: String(command), args: [], cwd: cwd, shell: true };
    var check = decide(action);
    if (check.blocked) {
        process.nextTick(function () { if (callback) callback(check.error, '', ''); });
        return makeFailedChildProcess(check.error);
    }
    var cb = function done(err, stdout, stderr) {
        postAudit(action, check.decision, !err, err ? { error: err.message } : null);
        if (callback) callback(err, stdout, stderr);
    };
    return options !== undefined ? origCp.exec(command, options, cb) : origCp.exec(command, cb);
};

cp.execSync = function lbeExecSync(command, options) {
    var cwd = options && options.cwd ? String(options.cwd) : ROOT_DIR;
    var action = { action: 'run_shell', cmd: String(command), args: [], cwd: cwd, shell: true };
    var check = decide(action);
    if (check.blocked) { throw check.error; }
    try {
        var result = options !== undefined ? origCp.execSync(command, options) : origCp.execSync(command);
        postAudit(action, check.decision, true);
        return result;
    } catch (e) {
        postAudit(action, check.decision, false, { error: e.message });
        throw e;
    }
};

// ── Write hook-status.json (uses origFs — captured before patching) ───────────

process.env.LBE_HOOK_ACTIVE = '1';

try {
    var statusDir = path.join(ROOT_DIR, '.lbe', 'runtime');
    if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });
    var status = {
        active: true,
        pid: process.pid,
        started_at: new Date().toISOString(),
        mode: MODE,
        root: ROOT_DIR,
        patched: {
            'fs.writeFile': true,
            'fs.writeFileSync': true,
            'fs.rm': !!origFs.rm,
            'fs.rmSync': !!origFs.rmSync,
            'fs.unlink': true,
            'fs.unlinkSync': true,
            'fs.rename': true,
            'fs.renameSync': true,
            'fs.promises.writeFile': true,
            'fs.promises.rm': !!origPromises.rm,
            'fs.promises.unlink': true,
            'fs.promises.rename': true,
            'child_process.spawn': true,
            'child_process.spawnSync': true,
            'child_process.exec': true,
            'child_process.execSync': true,
        }
    };
    // Use original writeFileSync (pre-patch) to avoid triggering our own hook
    origFs.writeFileSync(path.join(statusDir, 'hook-status.json'), JSON.stringify(status, null, 2) + '\n', 'utf8');
} catch (e) {
    console.warn('[lbe] could not write hook-status.json:', e.message);
}

// ── Banner ────────────────────────────────────────────────────────────────────

if (MODE === 'observe') {
    process.stderr.write('[lbe] OBSERVE mode — no actions blocked, all writes logged to .lbe/events.jsonl\n');
} else if (MODE === 'enforce') {
    process.stderr.write('[lbe] ENFORCE mode — policy denials will block execution\n');
}

// ── Central state init (deferred) ────────────────────────────────────────────
// Runs after hook-status.json is written so module loads don't delay it.
// origFs.unlinkSync is captured above and remains pre-patch for the process lifetime.
// Best-effort: synchronous agent writes before this fires miss the central log.
setImmediate(function () {
    try {
        var _stateIdx         = require('../state/index.cjs');
        var _appendCentralMod = require('../state/appendCentral.cjs');
        _appendCentralMod.setNativeUnlink(origFs.unlinkSync);
        var _centralDir = _stateIdx.workspaceStateDir(_stateIdx.stateRoot(), _stateIdx.workspaceId(ROOT_DIR));
        _centralState   = { paths: { events: path.join(_centralDir, 'lbe-events.jsonl') } };
        _appendCentral  = _appendCentralMod;
    } catch (e) {
        if (process.env.LBE_DEBUG) console.warn('[lbe] central state init failed:', e.message);
    }
});
