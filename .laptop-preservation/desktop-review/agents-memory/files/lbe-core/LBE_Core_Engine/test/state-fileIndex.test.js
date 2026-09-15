import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { indexFiles, diffIndex, hashFile } from '../src/state/fileIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-idx-'));
}

// ── hashFile ─────────────────────────────────────────────────────────────────

test('hashFile produces consistent SHA-256 hex for known content', () => {
    const dir  = tmpDir();
    const file = path.join(dir, 'known.txt');
    try {
        fs.writeFileSync(file, 'hello world', 'utf8');
        const expected = crypto.createHash('sha256').update('hello world').digest('hex');
        assert.equal(hashFile(file), expected);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('hashFile is deterministic across calls', () => {
    const dir  = tmpDir();
    const file = path.join(dir, 'det.txt');
    try {
        fs.writeFileSync(file, 'deterministic content', 'utf8');
        assert.equal(hashFile(file), hashFile(file));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ── indexFiles basic ──────────────────────────────────────────────────────────

test('indexFiles writes a parseable JSON index', () => {
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'before.json');
    try {
        fs.writeFileSync(path.join(ws, 'a.txt'), 'aaa');
        const idx = indexFiles(ws, out);
        assert.equal(idx.format, 1);
        assert.ok(typeof idx.ts === 'string');
        assert.ok(typeof idx.workspace === 'string');
        assert.ok(typeof idx.files === 'object');
        assert.ok(fs.existsSync(out));
        const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert.deepEqual(Object.keys(parsed.files).sort(), Object.keys(idx.files).sort());
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
});

test('indexFiles includes sha256, size, mtimeMs per file', () => {
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'idx.json');
    try {
        const content = 'probe content';
        fs.writeFileSync(path.join(ws, 'probe.txt'), content);
        const idx = indexFiles(ws, out);
        const entry = idx.files['probe.txt'];
        assert.ok(entry, 'probe.txt must be in index');
        assert.equal(typeof entry.sha256,  'string');
        assert.equal(typeof entry.size,    'number');
        assert.equal(typeof entry.mtimeMs, 'number');
        const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
        assert.equal(entry.sha256, expectedHash);
        assert.equal(entry.size, Buffer.byteLength(content));
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
});

// ── indexFiles ignores ────────────────────────────────────────────────────────

test('indexFiles ignores node_modules/', () => {
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'idx.json');
    try {
        fs.mkdirSync(path.join(ws, 'node_modules', 'pkg'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'node_modules', 'pkg', 'index.js'), 'x');
        fs.writeFileSync(path.join(ws, 'real.js'), 'y');
        const idx = indexFiles(ws, out);
        assert.ok(!Object.keys(idx.files).some(k => k.startsWith('node_modules')),
            'node_modules must be excluded');
        assert.ok('real.js' in idx.files);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
});

test('indexFiles ignores .git/', () => {
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'idx.json');
    try {
        fs.mkdirSync(path.join(ws, '.git'), { recursive: true });
        fs.writeFileSync(path.join(ws, '.git', 'HEAD'), 'ref: refs/heads/main');
        fs.writeFileSync(path.join(ws, 'src.js'), 'z');
        const idx = indexFiles(ws, out);
        assert.ok(!Object.keys(idx.files).some(k => k.startsWith('.git')));
        assert.ok('src.js' in idx.files);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
});

test('indexFiles ignores .lbe/ directory', () => {
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'idx.json');
    try {
        fs.mkdirSync(path.join(ws, '.lbe'), { recursive: true });
        fs.writeFileSync(path.join(ws, '.lbe', 'events.jsonl'), '{}');
        fs.writeFileSync(path.join(ws, 'main.js'), 'code');
        const idx = indexFiles(ws, out);
        assert.ok(!Object.keys(idx.files).some(k => k.startsWith('.lbe')));
        assert.ok('main.js' in idx.files);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
});

// ── outputPath inside tree ────────────────────────────────────────────────────

test('outputPath inside indexed tree (not in ignored dir) is rejected', () => {
    const ws  = tmpDir();
    const out = path.join(ws, 'src', 'index.json'); // inside ws, not ignored
    try {
        fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
        fs.writeFileSync(path.join(ws, 'src', 'code.js'), 'x');
        assert.throws(
            () => indexFiles(ws, out),
            /inside the indexed tree/
        );
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

test('outputPath inside .lbe/ (ignored dir) is allowed', () => {
    const ws  = tmpDir();
    const out = path.join(ws, '.lbe', 'file-index', 'before.json');
    try {
        fs.writeFileSync(path.join(ws, 'app.js'), 'hello');
        assert.doesNotThrow(() => indexFiles(ws, out));
        assert.ok(fs.existsSync(out));
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
    }
});

// ── diffIndex ─────────────────────────────────────────────────────────────────

test('diffIndex detects added file', () => {
    const ws    = tmpDir();
    const outB  = path.join(tmpDir(), 'before.json');
    const outA  = path.join(tmpDir(), 'after.json');
    try {
        fs.writeFileSync(path.join(ws, 'existing.txt'), 'x');
        indexFiles(ws, outB);
        fs.writeFileSync(path.join(ws, 'new.txt'), 'y');
        indexFiles(ws, outA);
        const diff = diffIndex(outB, outA);
        assert.ok(diff.added.includes('new.txt'), 'new.txt must be in added');
        assert.ok(!diff.removed.includes('existing.txt'));
        assert.ok(diff.unchanged.includes('existing.txt'));
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outB), { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(path.dirname(outA), { recursive: true, force: true }); } catch (_) {}
    }
});

test('diffIndex detects removed file', () => {
    const ws   = tmpDir();
    const outB = path.join(tmpDir(), 'before.json');
    const outA = path.join(tmpDir(), 'after.json');
    try {
        fs.writeFileSync(path.join(ws, 'keep.txt'), 'k');
        fs.writeFileSync(path.join(ws, 'gone.txt'), 'g');
        indexFiles(ws, outB);
        fs.unlinkSync(path.join(ws, 'gone.txt'));
        indexFiles(ws, outA);
        const diff = diffIndex(outB, outA);
        assert.ok(diff.removed.includes('gone.txt'), 'gone.txt must be in removed');
        assert.ok(diff.unchanged.includes('keep.txt'));
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outB), { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(path.dirname(outA), { recursive: true, force: true }); } catch (_) {}
    }
});

test('diffIndex detects changed file', () => {
    const ws   = tmpDir();
    const outB = path.join(tmpDir(), 'before.json');
    const outA = path.join(tmpDir(), 'after.json');
    const file = path.join(ws, 'mut.txt');
    try {
        fs.writeFileSync(file, 'original');
        indexFiles(ws, outB);
        fs.writeFileSync(file, 'modified');
        indexFiles(ws, outA);
        const diff = diffIndex(outB, outA);
        assert.ok(diff.changed.includes('mut.txt'), 'mut.txt must be in changed');
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outB), { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(path.dirname(outA), { recursive: true, force: true }); } catch (_) {}
    }
});

test('diffIndex unchanged_count correct for untouched files', () => {
    const ws   = tmpDir();
    const outB = path.join(tmpDir(), 'before.json');
    const outA = path.join(tmpDir(), 'after.json');
    try {
        fs.writeFileSync(path.join(ws, 'a.txt'), 'a');
        fs.writeFileSync(path.join(ws, 'b.txt'), 'b');
        indexFiles(ws, outB);
        indexFiles(ws, outA);
        const diff = diffIndex(outB, outA);
        assert.equal(diff.unchanged.length, 2);
        assert.equal(diff.added.length, 0);
        assert.equal(diff.removed.length, 0);
        assert.equal(diff.changed.length, 0);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outB), { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(path.dirname(outA), { recursive: true, force: true }); } catch (_) {}
    }
});

test('diffIndex handles missing before path safely', () => {
    const ws   = tmpDir();
    const outA = path.join(tmpDir(), 'after.json');
    try {
        fs.writeFileSync(path.join(ws, 'x.txt'), 'x');
        indexFiles(ws, outA);
        const diff = diffIndex('/nonexistent/before.json', outA);
        // All files are "added" relative to an empty before
        assert.ok(diff.added.includes('x.txt'));
        assert.equal(diff.removed.length, 0);
        assert.equal(diff.changed.length, 0);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outA), { recursive: true, force: true }); } catch (_) {}
    }
});

test('diffIndex handles missing after path safely', () => {
    const ws   = tmpDir();
    const outB = path.join(tmpDir(), 'before.json');
    try {
        fs.writeFileSync(path.join(ws, 'y.txt'), 'y');
        indexFiles(ws, outB);
        const diff = diffIndex(outB, '/nonexistent/after.json');
        // All files are "removed" relative to an empty after
        assert.ok(diff.removed.includes('y.txt'));
        assert.equal(diff.added.length, 0);
        assert.equal(diff.changed.length, 0);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(outB), { recursive: true, force: true }); } catch (_) {}
    }
});

// ── no hook mutation ──────────────────────────────────────────────────────────

test('fileIndex does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const ws  = tmpDir();
    const out = path.join(tmpDir(), 'idx.json');
    try {
        fs.writeFileSync(path.join(ws, 'f.txt'), 'x');
        indexFiles(ws, out);
    } finally {
        fs.rmSync(ws, { recursive: true, force: true });
        try { fs.rmSync(path.dirname(out), { recursive: true, force: true }); } catch (_) {}
    }
    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), before,
        'register.cjs must be byte-identical after fileIndex use');
});
