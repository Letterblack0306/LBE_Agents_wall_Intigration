import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FORMAT = 1;

// Directories always excluded from indexing
const IGNORE_DIRS = new Set([
    '.git', 'node_modules', 'dist', 'coverage', '.lbe',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hash of a file's contents.
 *
 * @param {string} filePath  Absolute path to the file.
 * @returns {string}         Hex digest.
 */
export function hashFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Recursively walks a directory, yielding relative posix paths and stats.
 * Skips IGNORE_DIRS entries and any symlinks.
 */
function* walk(root, rel = '') {
    const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const entryRel = rel ? rel + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            yield* walk(root, entryRel);
        } else if (entry.isFile()) {
            yield entryRel;
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Indexes all files under workspaceRoot and writes the result to outputPath.
 *
 * @param {string} workspaceRoot  Absolute workspace root to index.
 * @param {string} outputPath     Where to write the JSON index file.
 * @param {object} [opts]         Reserved for future use.
 * @returns {object}              The index object that was written.
 */
export function indexFiles(workspaceRoot, outputPath, _opts = {}) {
    if (!workspaceRoot || typeof workspaceRoot !== 'string') {
        throw new TypeError('workspaceRoot must be a non-empty string');
    }
    if (!outputPath || typeof outputPath !== 'string') {
        throw new TypeError('outputPath must be a non-empty string');
    }

    const absRoot    = path.resolve(workspaceRoot);
    const absOutput  = path.resolve(outputPath);
    const outputNorm = absOutput.replace(/\\/g, '/');
    const rootNorm   = absRoot.replace(/\\/g, '/');

    // Reject output paths inside the indexed tree — the output file itself
    // would be included in the next index, creating a self-referential loop.
    if (outputNorm.startsWith(rootNorm + '/') || outputNorm === rootNorm) {
        // Allow if output is under an ignored directory (e.g. .lbe/)
        const relOutput = path.relative(absRoot, absOutput).replace(/\\/g, '/');
        const firstSeg  = relOutput.split('/')[0];
        if (!IGNORE_DIRS.has(firstSeg)) {
            throw new Error(
                `outputPath "${outputPath}" is inside the indexed tree. ` +
                'Place the output in an excluded directory (e.g. .lbe/) or outside the root.'
            );
        }
    }

    const files = {};
    for (const relPath of walk(absRoot)) {
        const absPath = path.join(absRoot, relPath);
        const stat    = fs.statSync(absPath);
        files[relPath] = {
            sha256:  hashFile(absPath),
            size:    stat.size,
            mtimeMs: stat.mtimeMs,
        };
    }

    const index = {
        format:    FORMAT,
        ts:        new Date().toISOString(),
        workspace: absRoot.replace(/\\/g, '/'),
        files,
    };

    const outDir = path.dirname(absOutput);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(absOutput, JSON.stringify(index, null, 2) + '\n', 'utf8');
    return index;
}

/**
 * Computes the diff between two file index snapshots.
 *
 * @param {string} beforePath  Path to the before JSON index.
 * @param {string} afterPath   Path to the after JSON index.
 * @returns {object}           { added, removed, changed, unchanged }
 */
export function diffIndex(beforePath, afterPath) {
    function loadIndex(p) {
        if (!p || !fs.existsSync(p)) return { files: {} };
        try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
        catch (_) { return { files: {} }; }
    }

    const before = loadIndex(beforePath);
    const after  = loadIndex(afterPath);

    const beforeFiles = before.files || {};
    const afterFiles  = after.files  || {};

    const added    = [];
    const removed  = [];
    const changed  = [];
    const unchanged = [];

    const allKeys = new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)]);
    for (const k of allKeys) {
        const b = beforeFiles[k];
        const a = afterFiles[k];
        if (!b)                        { added.push(k); }
        else if (!a)                   { removed.push(k); }
        else if (b.sha256 !== a.sha256){ changed.push(k); }
        else                           { unchanged.push(k); }
    }

    return { added, removed, changed, unchanged };
}
