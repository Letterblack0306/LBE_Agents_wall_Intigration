import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { registerIntent, loadIntents } from '../src/state/intentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

function tmpState() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-intent-'));
    return d;
}

// ── 1. missing intent.jsonl → loadIntents returns [] ─────────────────────────

test('missing intent.jsonl returns empty array', () => {
    const stateDir = tmpState();
    try {
        const result = loadIntents(stateDir);
        assert.deepEqual(result, []);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 2. registerIntent writes one JSONL record ─────────────────────────────────

test('registerIntent writes one parseable JSONL record', () => {
    const stateDir = tmpState();
    try {
        registerIntent(stateDir, { task: 'move Save button', reason: 'user requested' });
        const filePath = path.join(stateDir, 'intent.jsonl');
        assert.ok(fs.existsSync(filePath), 'intent.jsonl must exist after register');
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        const lines = raw.split('\n');
        assert.equal(lines.length, 1, 'must have exactly one line');
        const record = JSON.parse(lines[0]);
        assert.equal(record.task, 'move Save button');
        assert.equal(record.reason, 'user requested');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 3. multiple intents preserve append order ─────────────────────────────────

test('multiple registerIntent calls preserve append order', () => {
    const stateDir = tmpState();
    try {
        registerIntent(stateDir, { task: 'first' });
        registerIntent(stateDir, { task: 'second' });
        registerIntent(stateDir, { task: 'third' });
        const intents = loadIntents(stateDir);
        assert.equal(intents.length, 3);
        assert.equal(intents[0].task, 'first');
        assert.equal(intents[1].task, 'second');
        assert.equal(intents[2].task, 'third');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 4. generated intent_id exists when not supplied ───────────────────────────

test('generated intent_id is present and prefixed with i_', () => {
    const stateDir = tmpState();
    try {
        const record = registerIntent(stateDir, { task: 'auto id test' });
        assert.ok(typeof record.intent_id === 'string', 'intent_id must be a string');
        assert.ok(record.intent_id.startsWith('i_'), 'intent_id must start with i_');
        assert.ok(record.intent_id.length > 3, 'intent_id must not be empty beyond prefix');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 5. supplied intent_id preserved when valid ────────────────────────────────

test('supplied intent_id is preserved in record', () => {
    const stateDir = tmpState();
    const customId = 'i_custom_abc123';
    try {
        const record = registerIntent(stateDir, { task: 'custom id', intent_id: customId });
        assert.equal(record.intent_id, customId);
        const [loaded] = loadIntents(stateDir);
        assert.equal(loaded.intent_id, customId);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 6. absolute allowed_files rejected ───────────────────────────────────────

test('absolute path in allowed_files is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerIntent(stateDir, {
                task: 'bad files',
                allowed_files: ['/etc/passwd'],
            }),
            /absolute paths are not allowed/,
            'must throw for absolute paths'
        );
        // Nothing written to disk
        assert.ok(!fs.existsSync(path.join(stateDir, 'intent.jsonl')), 'intent.jsonl must not be written on rejection');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('Windows-style absolute path in allowed_files is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerIntent(stateDir, {
                task: 'bad files win',
                allowed_files: ['C:\\Windows\\System32\\cmd.exe'],
            }),
            /absolute paths are not allowed/
        );
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 7. ../ traversal rejected ─────────────────────────────────────────────────

test('../ traversal in allowed_files is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerIntent(stateDir, {
                task: 'traversal',
                allowed_files: ['../secret.key'],
            }),
            /traversal is not allowed/
        );
        assert.ok(!fs.existsSync(path.join(stateDir, 'intent.jsonl')));
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('../ traversal in forbidden_files is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerIntent(stateDir, {
                task: 'forbidden traversal',
                forbidden_files: ['../../other.key'],
            }),
            /traversal is not allowed/
        );
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 8. malformed JSONL line does not crash loadIntents ────────────────────────

test('malformed JSONL line is skipped without crashing', () => {
    const stateDir = tmpState();
    const filePath = path.join(stateDir, 'intent.jsonl');
    try {
        // Write a valid line, a malformed line, and another valid line
        fs.writeFileSync(filePath, [
            JSON.stringify({ intent_id: 'i_first', task: 'a' }),
            'NOT_VALID_JSON{{{{',
            JSON.stringify({ intent_id: 'i_second', task: 'b' }),
        ].join('\n') + '\n', 'utf8');

        const intents = loadIntents(stateDir);
        assert.equal(intents.length, 2, 'must return 2 valid records, skipping malformed line');
        assert.equal(intents[0].intent_id, 'i_first');
        assert.equal(intents[1].intent_id, 'i_second');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 9. intent record includes ts ─────────────────────────────────────────────

test('registered intent includes ts as ISO 8601 string', () => {
    const stateDir = tmpState();
    try {
        const before = new Date().toISOString();
        const record = registerIntent(stateDir, { task: 'ts test' });
        const after = new Date().toISOString();
        assert.ok(typeof record.ts === 'string', 'ts must be a string');
        assert.ok(record.ts >= before, 'ts must be >= time before call');
        assert.ok(record.ts <= after,  'ts must be <= time after call');
        // Must be parseable as a date
        assert.ok(!isNaN(Date.parse(record.ts)), 'ts must be a valid ISO 8601 date');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 10. no hook / register.cjs mutation ──────────────────────────────────────

test('intentRegistry does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    // Import and use the module — should have no side effect on register.cjs
    const stateDir = tmpState();
    try {
        registerIntent(stateDir, { task: 'side effect test' });
        loadIntents(stateDir);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
    const after = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.equal(before, after, 'register.cjs must be byte-identical after intentRegistry use');
});
