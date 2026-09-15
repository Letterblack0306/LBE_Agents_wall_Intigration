import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TARGET_FILE = 'target_registry.jsonl';

// Kinds that require user confirmation regardless of caller's setting
const CONFIRMATION_REQUIRED_KINDS = new Set([
    'canvas', 'video', 'image',
]);

// Source strategies that require user confirmation
const CONFIRMATION_REQUIRED_SOURCES = new Set([
    'visual_inference',
]);

// ── Validation ────────────────────────────────────────────────────────────────

function validateComponentFile(filePath) {
    if (filePath === undefined || filePath === null) return;
    if (typeof filePath !== 'string') {
        throw new TypeError('component_file must be a string');
    }
    const normalized = filePath.replace(/\\/g, '/');
    const isAbsolute = path.isAbsolute(filePath) || path.win32.isAbsolute(filePath) || path.win32.isAbsolute(normalized);
    if (isAbsolute) {
        throw new Error(`component_file: absolute paths are not allowed: "${filePath}"`);
    }
    if (normalized.split('/').some(seg => seg === '..')) {
        throw new Error(`component_file: ../ traversal is not allowed: "${filePath}"`);
    }
}

function validateConfidence(confidence) {
    if (confidence === undefined || confidence === null) return;
    if (typeof confidence !== 'number' || isNaN(confidence)) {
        throw new TypeError('confidence must be a number');
    }
    if (confidence < 0 || confidence > 1) {
        throw new RangeError(`confidence must be 0..1, got ${confidence}`);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registers a target record, appending it to stateDir/target_registry.jsonl.
 *
 * @param {string} stateDir  Central workspace state directory.
 * @param {object} target    Target record (kind, label, selector, …).
 * @returns {object}         The stored record (with generated target_id and ts).
 */
export function registerTarget(stateDir, target) {
    if (!stateDir || typeof stateDir !== 'string') {
        throw new TypeError('stateDir must be a non-empty string');
    }
    if (!target || typeof target !== 'object') {
        throw new TypeError('target must be a plain object');
    }

    validateComponentFile(target.component_file);
    validateConfidence(target.confidence);

    // Enforce confirmation requirement for visual_inference or visual kinds
    const requiresConfirmation =
        target.requires_user_confirmation === true ||
        CONFIRMATION_REQUIRED_SOURCES.has(target.target_source) ||
        CONFIRMATION_REQUIRED_KINDS.has(target.kind);

    const record = {
        target_id:                 target.target_id || ('t_' + crypto.randomBytes(8).toString('hex')),
        ts:                        target.ts        || new Date().toISOString(),
        kind:                      target.kind                    ?? 'unknown',
        label:                     target.label                   ?? '',
        screen:                    target.screen                  ?? '',
        selector:                  target.selector                ?? '',
        component_file:            target.component_file          ?? null,
        bbox:                      target.bbox                    ?? null,
        evidence:                  target.evidence                ?? [],
        target_source:             target.target_source           ?? 'unknown',
        confidence:                target.confidence              ?? null,
        requires_user_confirmation: requiresConfirmation,
    };

    const filePath = path.join(stateDir, TARGET_FILE);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
    return record;
}

/**
 * Loads all target records from stateDir/target_registry.jsonl.
 * Malformed lines are silently skipped.
 *
 * @param {string} stateDir  Central workspace state directory.
 * @returns {object[]}       Array of parsed target records (may be empty).
 */
export function loadTargets(stateDir) {
    const filePath = path.join(stateDir, TARGET_FILE);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((acc, line) => {
        try { acc.push(JSON.parse(line)); } catch (_) { /* ignore */ }
        return acc;
    }, []);
}
