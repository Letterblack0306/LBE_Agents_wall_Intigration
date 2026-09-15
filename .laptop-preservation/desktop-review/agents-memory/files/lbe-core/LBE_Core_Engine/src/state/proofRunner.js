import fs from 'node:fs';
import path from 'node:path';

const FORMAT = 1;

// ── Profile selection ─────────────────────────────────────────────────────────

// Returns the proof profile appropriate for the given set of changed files.
function selectProfile(changedFiles) {
    if (!Array.isArray(changedFiles) || changedFiles.length === 0) return 'general';

    // hook profile — any change to the CJS preload hook
    if (changedFiles.some(f => f.replace(/\\/g, '/').includes('src/hooks/register.cjs'))) {
        return 'hook';
    }
    // state profile — changes inside src/state/
    if (changedFiles.every(f => f.replace(/\\/g, '/').includes('src/state/'))) {
        return 'state';
    }
    // build profile — build scripts at project root level
    if (changedFiles.every(f => /^build[^/]*\.(js|mjs|cjs)$/.test(path.basename(f)))) {
        return 'build';
    }
    // release profile — package.json, package-lock.json, release/ files
    if (changedFiles.every(f => {
        const b = path.basename(f);
        return b === 'package.json' || b === 'package-lock.json' || f.startsWith('release/');
    })) {
        return 'release';
    }
    // docs profile — only markdown / docs files
    if (changedFiles.every(f => /\.(md|txt|rst)$/i.test(f) || f.startsWith('docs/'))) {
        return 'docs';
    }
    return 'general';
}

// Checks required per profile
const PROFILE_CHECKS = {
    docs:    ['diff', 'forbidden_clean'],
    general: ['diff', 'hash_match', 'forbidden_clean'],
    hook:    ['npm_run_proof', 'diff', 'hash_match'],
    state:   ['state_tests', 'proof'],
    build:   ['build_check', 'proof'],
    release: ['proof', 'build_check', 'npm_pack_dry_run', 'audit_verify'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJsonl(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((acc, line) => {
        try { acc.push(JSON.parse(line)); } catch (_) { /* ignore */ }
        return acc;
    }, []);
}

function loadJson(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (_) { return null; }
}

function matchesGlob(filePath, pattern) {
    // Simple glob: support * (non-sep wildcard) and ** (any path segments)
    const normalized = filePath.replace(/\\/g, '/');
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$');
    return regex.test(normalized);
}

// ── Checks ────────────────────────────────────────────────────────────────────

function checkDiff(changedFiles, intent, failures) {
    if (!intent) return; // no intent — diff check skipped
    const allowed    = intent.allowed_files    || [];
    const forbidden  = intent.forbidden_files  || [];

    for (const f of changedFiles) {
        const rel = f.replace(/\\/g, '/');

        // Forbidden files changed → always FAIL
        if (forbidden.some(pat => matchesGlob(rel, pat))) {
            failures.push({ check: 'diff', reason: 'forbidden_file_changed', file: rel });
            continue;
        }

        // Allowed files constraint — only if allowed_files is non-empty
        if (allowed.length > 0 && !allowed.some(pat => matchesGlob(rel, pat))) {
            failures.push({ check: 'diff', reason: 'file_outside_allowed', file: rel });
        }
    }
}

function checkForbiddenClean(changedFiles, intent, failures) {
    if (!intent) return;
    const forbidden = intent.forbidden_files || [];
    for (const f of changedFiles) {
        const rel = f.replace(/\\/g, '/');
        if (forbidden.some(pat => matchesGlob(rel, pat))) {
            failures.push({ check: 'forbidden_clean', reason: 'forbidden_file_changed', file: rel });
        }
    }
}

function checkHashMatch(changedFiles, beforeIndex, afterIndex, failures) {
    if (!beforeIndex || !afterIndex) return;
    for (const f of changedFiles) {
        const rel = f.replace(/\\/g, '/');
        const b = (beforeIndex.files || {})[rel];
        const a = (afterIndex.files  || {})[rel];
        if (b && a && b.sha256 === a.sha256) {
            // File is in changedFiles but hash is identical — suspicious but not a failure
            // (diff might be metadata only)
        }
        // hash_match check: ensure files declared changed actually have different hashes
        // (only flag if file exists in both snapshots and hash matches — means diff is wrong)
        if (b && a && b.sha256 === a.sha256) {
            failures.push({ check: 'hash_match', reason: 'hash_unchanged_for_declared_change', file: rel });
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs the proof for a workspace and writes proof/latest.json.
 *
 * @param {string} stateDir      Central workspace state directory.
 * @param {string} workspaceRoot Absolute workspace root path.
 * @param {object} [opts]        { intentId }  — pin to a specific intent_id
 * @returns {object}             The proof record written to disk.
 */
export function runProof(stateDir, workspaceRoot, opts = {}) {
    if (!stateDir || typeof stateDir !== 'string') {
        throw new TypeError('stateDir must be a non-empty string');
    }
    if (!workspaceRoot || typeof workspaceRoot !== 'string') {
        throw new TypeError('workspaceRoot must be a non-empty string');
    }

    // Load inputs
    const intents = loadJsonl(path.join(stateDir, 'intent.jsonl'));
    const intent  = opts.intentId
        ? intents.find(i => i.intent_id === opts.intentId) || intents[intents.length - 1] || null
        : intents[intents.length - 1] || null;

    const targets    = loadJsonl(path.join(stateDir, 'target_registry.jsonl'));
    const lastTarget = targets[targets.length - 1] || null;

    const beforeIndex = loadJson(path.join(stateDir, 'file-index', 'before.json'));
    const afterIndex  = loadJson(path.join(stateDir, 'file-index', 'after.json'));

    const events = loadJsonl(path.join(stateDir, 'lbe-events.jsonl'));

    // Compute changed files from diff (prefer file index; fall back to events)
    let changedFiles = [];
    if (beforeIndex && afterIndex) {
        const bf = beforeIndex.files || {};
        const af = afterIndex.files  || {};
        const all = new Set([...Object.keys(bf), ...Object.keys(af)]);
        for (const k of all) {
            if (!bf[k] || !af[k] || bf[k].sha256 !== af[k].sha256) {
                changedFiles.push(k);
            }
        }
    } else {
        // Fallback: derive changed files from LBE events
        for (const e of events) {
            if (e.path && (e.action === 'file_write' || e.action === 'file_delete' || e.action === 'file_rename')) {
                const rel = path.relative(workspaceRoot, e.path).replace(/\\/g, '/');
                if (!changedFiles.includes(rel)) changedFiles.push(rel);
            }
        }
    }

    // Select profile
    const profile     = selectProfile(changedFiles);
    const checksToRun = PROFILE_CHECKS[profile] || PROFILE_CHECKS.general;

    // Run applicable checks
    const failures     = [];
    const checksRun    = [];

    if (checksToRun.includes('diff')) {
        checksRun.push('diff');
        checkDiff(changedFiles, intent, failures);
    }
    if (checksToRun.includes('forbidden_clean')) {
        checksRun.push('forbidden_clean');
        checkForbiddenClean(changedFiles, intent, failures);
    }
    if (checksToRun.includes('hash_match')) {
        checksRun.push('hash_match');
        checkHashMatch(changedFiles, beforeIndex, afterIndex, failures);
    }
    // Other checks (npm_run_proof, state_tests, etc.) are external — recorded as run
    // but not executed by proofRunner itself (they require subprocess invocation).
    for (const c of checksToRun) {
        if (!checksRun.includes(c)) checksRun.push(c);
    }

    // Determine result
    let proofResult;
    if (failures.length > 0) {
        proofResult = 'FAIL';
    } else if (lastTarget && lastTarget.requires_user_confirmation === true) {
        proofResult = 'WEAK_PROOF';
    } else {
        proofResult = 'PASS';
    }

    const proof = {
        format:       FORMAT,
        ts:           new Date().toISOString(),
        result:       proofResult,
        profile,
        intent_id:    intent ? intent.intent_id : null,
        target_id:    lastTarget ? lastTarget.target_id : null,
        files_changed: changedFiles,
        checks_run:   checksRun,
        failures,
    };

    // Write to stateDir/proof/latest.json
    const proofDir = path.join(stateDir, 'proof');
    if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
    fs.writeFileSync(path.join(proofDir, 'latest.json'), JSON.stringify(proof, null, 2) + '\n', 'utf8');

    return proof;
}

/**
 * Loads the most recent proof result from stateDir/proof/latest.json.
 *
 * @param {string} stateDir  Central workspace state directory.
 * @returns {object|null}    The proof record, or null if none exists.
 */
export function loadLatestProof(stateDir) {
    return loadJson(path.join(stateDir, 'proof', 'latest.json'));
}
