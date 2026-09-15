import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { migrateLegacyEvents } from '../src/state/migration.js';
import { resolveWorkspaceState } from '../src/state/index.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-migration-'));
    const workspace = path.join(root, 'workspace');
    const stateDir = path.join(root, 'state');
    fs.mkdirSync(path.join(workspace, '.lbe'), { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    return { root, workspace, stateDir, legacyPath: path.join(workspace, '.lbe', 'events.jsonl') };
}

function lines(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
}

test('missing legacy events is a no-op', () => {
    const f = fixture();
    try {
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(result.attempted, false);
        assert.equal(fs.existsSync(result.markerPath), false);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('valid legacy events are copied into the central log', () => {
    const f = fixture();
    const source = '{"action":"write","ts":1}\n{"action":"remove","ts":2}\n';
    try {
        fs.writeFileSync(f.legacyPath, source);
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(result.imported_count, 2);
        assert.deepEqual(lines(path.join(f.stateDir, 'lbe-events.jsonl')), source.trim().split('\n'));
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('legacy source is not deleted or modified', () => {
    const f = fixture();
    const source = '{"action":"write"}\n';
    try {
        fs.writeFileSync(f.legacyPath, source);
        migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(fs.existsSync(f.legacyPath), true);
        assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), source);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('second migration is idempotent', () => {
    const f = fixture();
    try {
        fs.writeFileSync(f.legacyPath, '{"action":"write"}\n');
        migrateLegacyEvents(f.workspace, f.stateDir);
        const second = migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(second.imported_count, 0);
        assert.equal(lines(path.join(f.stateDir, 'lbe-events.jsonl')).length, 1);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('existing central duplicates are not imported again', () => {
    const f = fixture();
    const event = '{"action":"write","ts":1}';
    try {
        fs.writeFileSync(f.legacyPath, event + '\n');
        fs.writeFileSync(path.join(f.stateDir, 'lbe-events.jsonl'), event + '\n');
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(result.imported_count, 0);
        assert.equal(result.skipped_duplicate_count, 1);
        assert.deepEqual(lines(path.join(f.stateDir, 'lbe-events.jsonl')), [event]);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('malformed lines go to migration-invalid.jsonl', () => {
    const f = fixture();
    try {
        fs.writeFileSync(f.legacyPath, '{"ok":true}\nnot-json\n');
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        assert.equal(result.invalid_count, 1);
        assert.equal(lines(path.join(f.stateDir, 'lbe-events.jsonl')).length, 1);
        const [invalid] = lines(result.invalidPath).map(JSON.parse);
        assert.equal(invalid.line, 'not-json');
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('migration marker is written', () => {
    const f = fixture();
    const source = '{"action":"write"}\n';
    try {
        fs.writeFileSync(f.legacyPath, source);
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        const marker = JSON.parse(fs.readFileSync(result.markerPath, 'utf8'));
        assert.equal(marker.format, 1);
        assert.equal(marker.source, '.lbe/events.jsonl');
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('marker source_sha256 is stable', () => {
    const f = fixture();
    const source = '{"action":"write"}\n';
    try {
        fs.writeFileSync(f.legacyPath, source);
        const result = migrateLegacyEvents(f.workspace, f.stateDir);
        const marker = JSON.parse(fs.readFileSync(result.markerPath, 'utf8'));
        assert.equal(marker.source_sha256, crypto.createHash('sha256').update(source).digest('hex'));
        assert.equal(migrateLegacyEvents(f.workspace, f.stateDir).attempted, true);
        assert.equal(JSON.parse(fs.readFileSync(result.markerPath, 'utf8')).source_sha256, marker.source_sha256);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('ESM resolver triggers migration', () => {
    const f = fixture();
    const saved = process.env.LOCALAPPDATA;
    try {
        process.env.LOCALAPPDATA = path.join(f.root, 'appdata');
        fs.writeFileSync(f.legacyPath, '{"action":"write"}\n');
        const resolved = resolveWorkspaceState(f.workspace);
        assert.equal(lines(resolved.paths.events).length, 1);
        assert.ok(fs.existsSync(path.join(resolved.stateDir, 'migration', 'events-v1.json')));
    } finally {
        if (saved === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = saved;
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('CJS resolver does not trigger migration', () => {
    const f = fixture();
    const saved = process.env.LOCALAPPDATA;
    try {
        process.env.LOCALAPPDATA = path.join(f.root, 'appdata');
        fs.writeFileSync(f.legacyPath, '{"action":"write"}\n');
        const { resolveWorkspaceStateSyncCjs } = require('../src/state/index.cjs');
        const resolved = resolveWorkspaceStateSyncCjs(f.workspace);
        assert.equal(fs.existsSync(resolved.paths.events), false);
        assert.equal(fs.existsSync(path.join(resolved.stateDir, 'migration', 'events-v1.json')), false);
    } finally {
        if (saved === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = saved;
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('migration does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const f = fixture();
    try { fs.writeFileSync(f.legacyPath, '{"action":"write"}\n'); migrateLegacyEvents(f.workspace, f.stateDir); }
    finally { fs.rmSync(f.root, { recursive: true, force: true }); }
    assert.equal(fs.readFileSync(HOOK_PATH, 'utf8'), before);
});
