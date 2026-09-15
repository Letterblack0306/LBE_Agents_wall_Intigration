import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const INTENT_FILE = 'intent.jsonl';

// ── Validation ────────────────────────────────────────────────────────────────

function validateFilePaths(paths, fieldName) {
    if (!Array.isArray(paths)) return;
    for (const p of paths) {
        if (typeof p !== 'string') continue;
        const normalized = p.replace(/\\/g, '/');
        const isAbsolute = path.isAbsolute(p) || path.win32.isAbsolute(p) || path.win32.isAbsolute(normalized);
        if (isAbsolute) {
            throw new Error(`${fieldName}: absolute paths are not allowed: "${p}"`);
        }
        if (normalized.split('/').some(seg => seg === '..')) {
            throw new Error(`${fieldName}: ../ traversal is not allowed: "${p}"`);
        }
    }
}

function normalizeFilePaths(paths) {
    if (!Array.isArray(paths)) return paths;
    return paths.map(p => (typeof p === 'string' ? p.replace(/\\/g, '/') : p));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registers an intent record, appending it to stateDir/intent.jsonl.
 *
 * @param {string} stateDir  Central workspace state directory.
 * @param {object} intent    Intent record (task, reason, allowed_files, …).
 * @returns {object}         The stored record (with generated intent_id and ts).
 */
export function registerIntent(stateDir, intent) {
    if (!stateDir || typeof stateDir !== 'string') {
        throw new TypeError('stateDir must be a non-empty string');
    }
    if (!intent || typeof intent !== 'object') {
        throw new TypeError('intent must be a plain object');
    }

    validateFilePaths(intent.allowed_files,   'allowed_files');
    validateFilePaths(intent.forbidden_files, 'forbidden_files');

    const record = {
        intent_id:        intent.intent_id || ('i_' + crypto.randomBytes(8).toString('hex')),
        ts:               intent.ts        || new Date().toISOString(),
        task:             intent.task              ?? '',
        reason:           intent.reason            ?? '',
        allowed_files:    normalizeFilePaths(intent.allowed_files    ?? []),
        forbidden_files:  normalizeFilePaths(intent.forbidden_files  ?? []),
        declared_targets: intent.declared_targets  ?? [],
        scope_id:         intent.scope_id          ?? null,
        risk:             intent.risk              ?? 'unknown',
    };

    const filePath = path.join(stateDir, INTENT_FILE);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
    return record;
}

/**
 * Loads all intent records from stateDir/intent.jsonl.
 * Malformed lines are silently skipped.
 *
 * @param {string} stateDir  Central workspace state directory.
 * @returns {object[]}       Array of parsed intent records (may be empty).
 */
export function loadIntents(stateDir) {
    const filePath = path.join(stateDir, INTENT_FILE);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((acc, line) => {
        try { acc.push(JSON.parse(line)); } catch (_) { /* ignore */ }
        return acc;
    }, []);
}
