import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SCOPE_STATUS = Object.freeze({
    SCOPE_REGISTERED: 'SCOPE_REGISTERED',
    NO_SCOPE_FOUND: 'NO_SCOPE_FOUND',
    REQUIRED_READING_MISSING: 'REQUIRED_READING_MISSING',
    INTENT_SCOPE_MISMATCH: 'INTENT_SCOPE_MISMATCH',
});

function lbeDir(workspaceRoot) {
    return path.join(workspaceRoot, '.lbe');
}

export function scopePaths(workspaceRoot) {
    const dir = lbeDir(workspaceRoot);
    return {
        lbeDir: dir,
        scope: path.join(dir, 'scope.json'),
        scopeRead: path.join(dir, 'scope-read.jsonl'),
        audit: path.join(dir, 'audit.jsonl'),
    };
}

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, record) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function appendJsonl(filePath, record) {
    ensureDir(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
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

function normalizeArray(value) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
}

function normalizePatterns(value) {
    return normalizeArray(value)
        .map((item) => String(item).trim().replace(/\\/g, '/'))
        .filter(Boolean);
}

function normalizeRequiredReading(value) {
    return normalizeArray(value).map((entry) => {
        if (typeof entry === 'string') return { path: entry.replace(/\\/g, '/'), required: true };
        return {
            path: String(entry?.path || '').trim().replace(/\\/g, '/'),
            required: entry?.required !== false,
        };
    }).filter((entry) => entry.path);
}

function assertRelativePath(filePath, fieldName) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    if (!normalized) throw new Error(`${fieldName}: path is required`);
    if (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
        throw new Error(`${fieldName}: absolute paths are not allowed`);
    }
    if (normalized.split('/').some((segment) => segment === '..')) {
        throw new Error(`${fieldName}: ../ traversal is not allowed`);
    }
    return normalized;
}

export function normalizeScope(scope) {
    if (!scope || typeof scope !== 'object') throw new TypeError('scope must be an object');
    const id = String(scope.id || '').trim();
    if (!id) throw new Error('scope.id is required');
    const requiredReading = normalizeRequiredReading(scope.requiredReading);
    for (const entry of requiredReading) assertRelativePath(entry.path, 'requiredReading');
    const allowedFiles = normalizePatterns(scope.allowedFiles);
    const forbiddenFiles = normalizePatterns(scope.forbiddenFiles);
    for (const pattern of [...allowedFiles, ...forbiddenFiles]) assertRelativePath(pattern.replace(/\*/g, 'x'), 'scope file pattern');
    return {
        version: scope.version || 1,
        id,
        objective: String(scope.objective || ''),
        requiredReading,
        allowedFiles,
        forbiddenFiles,
        requiredValidation: normalizeArray(scope.requiredValidation).map(String).filter(Boolean),
        forbiddenActions: normalizeArray(scope.forbiddenActions).map(String).filter(Boolean),
        registeredAt: scope.registeredAt || new Date().toISOString(),
    };
}

export function setActiveScopeFromFile(filePath, opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const inputPath = path.resolve(workspaceRoot, filePath);
    const scope = normalizeScope(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
    const paths = scopePaths(workspaceRoot);
    writeJson(paths.scope, scope);
    appendJsonl(paths.audit, {
        ts: new Date().toISOString(),
        kind: 'scope_contract',
        action: 'scope_set',
        status: SCOPE_STATUS.SCOPE_REGISTERED,
        scope_id: scope.id,
    });
    return { status: SCOPE_STATUS.SCOPE_REGISTERED, scope };
}

export function loadActiveScope(workspaceRoot) {
    const scopePath = scopePaths(workspaceRoot).scope;
    if (!fs.existsSync(scopePath)) return null;
    try { return normalizeScope(JSON.parse(fs.readFileSync(scopePath, 'utf8'))); }
    catch (_) { return null; }
}

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

export function readRequiredScopeDocuments(opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const scope = loadActiveScope(workspaceRoot);
    if (!scope) return { status: SCOPE_STATUS.NO_SCOPE_FOUND, receipts: [] };
    const paths = scopePaths(workspaceRoot);
    const receipts = [];
    for (const entry of scope.requiredReading.filter((item) => item.required !== false)) {
        const relPath = assertRelativePath(entry.path, 'requiredReading');
        const absPath = path.join(workspaceRoot, relPath);
        let content;
        try {
            content = fs.readFileSync(absPath, 'utf8');
        } catch (err) {
            const reason = err.code === 'ENOENT' ? 'FILE_NOT_FOUND'
                : err.code === 'EACCES' || err.code === 'EPERM' ? 'PERMISSION_DENIED'
                    : err.code === 'EISDIR' ? 'PATH_IS_DIRECTORY'
                        : 'READ_FAILED';
            const message = err.code === 'ENOENT' ? `Required reading file not found: ${relPath}`
                : err.code === 'EACCES' || err.code === 'EPERM' ? `Permission denied reading required file: ${relPath}`
                    : err.code === 'EISDIR' ? `Required reading path is a directory: ${relPath}`
                        : `Failed to read required file ${relPath}: ${err.message}`;
            return {
                status: SCOPE_STATUS.REQUIRED_READING_MISSING,
                scope,
                receipts,  // preserve receipts already accumulated
                blocker: {
                    code: `REQUIRED_READING_${reason}`,
                    path: relPath,
                    message
                }
            };
        }
        const receipt = {
            ts: new Date().toISOString(),
            scope_id: scope.id,
            path: relPath,
            sha256: sha256(content),
            bytes: Buffer.byteLength(content, 'utf8'),
        };
        appendJsonl(paths.scopeRead, receipt);
        receipts.push({ ...receipt, content });
    }
    appendJsonl(paths.audit, {
        ts: new Date().toISOString(),
        kind: 'scope_contract',
        action: 'scope_read',
        status: 'SCOPE_READING_RECORDED',
        scope_id: scope.id,
        count: receipts.length,
    });
    return { status: 'SCOPE_READING_RECORDED', scope, receipts };
}

export function requiredReadingMissing(workspaceRoot, scope) {
    if (!scope) return [];
    const required = scope.requiredReading.filter((entry) => entry.required !== false);
    if (required.length === 0) return [];
    const receipts = loadJsonl(scopePaths(workspaceRoot).scopeRead)
        .filter((receipt) => receipt.scope_id === scope.id);
    return required.filter((entry) => {
        const relPath = entry.path.replace(/\\/g, '/');
        return !receipts.some((receipt) => receipt.path === relPath);
    });
}

export function scopeStatus(opts = {}) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const scope = loadActiveScope(workspaceRoot);
    if (!scope) return { status: SCOPE_STATUS.NO_SCOPE_FOUND, scope: null, missingReading: [] };
    const missingReading = requiredReadingMissing(workspaceRoot, scope);
    return {
        status: missingReading.length > 0 ? SCOPE_STATUS.REQUIRED_READING_MISSING : 'SCOPE_READY',
        scope,
        missingReading,
    };
}
