import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { registerTarget, loadTargets } from '../src/state/targetRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'register.cjs');

function tmpState() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-target-'));
}

// ── 1. missing target_registry.jsonl → loadTargets returns [] ────────────────

test('missing target_registry.jsonl returns empty array', () => {
    const stateDir = tmpState();
    try {
        assert.deepEqual(loadTargets(stateDir), []);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 2. registerTarget writes one parseable JSONL record ───────────────────────

test('registerTarget writes one parseable JSONL record', () => {
    const stateDir = tmpState();
    try {
        registerTarget(stateDir, { kind: 'button', label: 'Save' });
        const filePath = path.join(stateDir, 'target_registry.jsonl');
        assert.ok(fs.existsSync(filePath), 'target_registry.jsonl must exist');
        const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
        assert.equal(lines.length, 1);
        const record = JSON.parse(lines[0]);
        assert.equal(record.kind, 'button');
        assert.equal(record.label, 'Save');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 3. multiple targets preserve append order ─────────────────────────────────

test('multiple registerTarget calls preserve append order', () => {
    const stateDir = tmpState();
    try {
        registerTarget(stateDir, { label: 'first' });
        registerTarget(stateDir, { label: 'second' });
        registerTarget(stateDir, { label: 'third' });
        const targets = loadTargets(stateDir);
        assert.equal(targets.length, 3);
        assert.equal(targets[0].label, 'first');
        assert.equal(targets[1].label, 'second');
        assert.equal(targets[2].label, 'third');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 4. generated target_id prefixed with t_ ───────────────────────────────────

test('generated target_id is present and prefixed with t_', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, { kind: 'input' });
        assert.ok(record.target_id.startsWith('t_'), 'target_id must start with t_');
        assert.ok(record.target_id.length > 3);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 5. supplied target_id preserved ──────────────────────────────────────────

test('supplied target_id is preserved in record', () => {
    const stateDir = tmpState();
    const customId = 't_custom_xyz';
    try {
        const record = registerTarget(stateDir, { target_id: customId, kind: 'link' });
        assert.equal(record.target_id, customId);
        assert.equal(loadTargets(stateDir)[0].target_id, customId);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 6. visual_inference → requires_user_confirmation: true ───────────────────

test('visual_inference source forces requires_user_confirmation to true', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, {
            kind: 'button',
            target_source: 'visual_inference',
            requires_user_confirmation: false,
        });
        assert.equal(record.requires_user_confirmation, true,
            'visual_inference must force requires_user_confirmation:true');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 7. canvas / video / image kinds → requires_user_confirmation: true ────────

test('canvas kind forces requires_user_confirmation to true', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, { kind: 'canvas' });
        assert.equal(record.requires_user_confirmation, true);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('video kind forces requires_user_confirmation to true', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, { kind: 'video' });
        assert.equal(record.requires_user_confirmation, true);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('image kind forces requires_user_confirmation to true', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, { kind: 'image' });
        assert.equal(record.requires_user_confirmation, true);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('button with accessibility_tree source does NOT force confirmation', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, {
            kind: 'button',
            target_source: 'accessibility_tree',
            requires_user_confirmation: false,
        });
        assert.equal(record.requires_user_confirmation, false,
            'non-visual source must not force confirmation');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 8. confidence must be 0..1 ────────────────────────────────────────────────

test('confidence 0.0 is valid', () => {
    const stateDir = tmpState();
    try {
        assert.doesNotThrow(() => registerTarget(stateDir, { confidence: 0 }));
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('confidence 1.0 is valid', () => {
    const stateDir = tmpState();
    try {
        assert.doesNotThrow(() => registerTarget(stateDir, { confidence: 1 }));
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('confidence above 1 is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerTarget(stateDir, { confidence: 1.01 }),
            /confidence must be 0\.\.1/
        );
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('confidence below 0 is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerTarget(stateDir, { confidence: -0.1 }),
            /confidence must be 0\.\.1/
        );
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 9. component_file — relative only, no absolute, no ../ ───────────────────

test('relative component_file is accepted', () => {
    const stateDir = tmpState();
    try {
        const record = registerTarget(stateDir, {
            component_file: 'src/settings/SettingsPanel.jsx',
        });
        assert.equal(record.component_file, 'src/settings/SettingsPanel.jsx');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('absolute component_file is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerTarget(stateDir, { component_file: '/etc/passwd' }),
            /absolute paths are not allowed/
        );
        assert.ok(!fs.existsSync(path.join(stateDir, 'target_registry.jsonl')));
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('Windows absolute component_file is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerTarget(stateDir, { component_file: 'C:\\Windows\\file.js' }),
            /absolute paths are not allowed/
        );
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('../ traversal in component_file is rejected', () => {
    const stateDir = tmpState();
    try {
        assert.throws(
            () => registerTarget(stateDir, { component_file: '../secret.key' }),
            /traversal is not allowed/
        );
        assert.ok(!fs.existsSync(path.join(stateDir, 'target_registry.jsonl')));
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 10. malformed JSONL does not crash loadTargets ────────────────────────────

test('malformed JSONL line is skipped without crashing', () => {
    const stateDir = tmpState();
    const filePath = path.join(stateDir, 'target_registry.jsonl');
    try {
        fs.writeFileSync(filePath, [
            JSON.stringify({ target_id: 't_first',  kind: 'button' }),
            'NOT}VALID{JSON',
            JSON.stringify({ target_id: 't_second', kind: 'input' }),
        ].join('\n') + '\n', 'utf8');
        const targets = loadTargets(stateDir);
        assert.equal(targets.length, 2);
        assert.equal(targets[0].target_id, 't_first');
        assert.equal(targets[1].target_id, 't_second');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 11. record includes ts ────────────────────────────────────────────────────

test('registered target includes ts as ISO 8601 string', () => {
    const stateDir = tmpState();
    try {
        const before = new Date().toISOString();
        const record = registerTarget(stateDir, { kind: 'link' });
        const after  = new Date().toISOString();
        assert.ok(typeof record.ts === 'string');
        assert.ok(record.ts >= before);
        assert.ok(record.ts <= after);
        assert.ok(!isNaN(Date.parse(record.ts)), 'ts must be a valid ISO date');
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 12. full example record round-trips correctly ─────────────────────────────

test('full target record round-trips through JSONL correctly', () => {
    const stateDir = tmpState();
    try {
        registerTarget(stateDir, {
            kind:                      'button',
            label:                     'Save',
            screen:                    'Settings',
            selector:                  "[aria-label='Save']",
            component_file:            'src/settings/SettingsPanel.jsx',
            bbox:                      [812, 542, 96, 36],
            evidence:                  ['accessibility_snapshot', 'dom_snapshot'],
            target_source:             'accessibility_tree',
            confidence:                0.94,
            requires_user_confirmation: false,
        });
        const [t] = loadTargets(stateDir);
        assert.equal(t.kind, 'button');
        assert.equal(t.label, 'Save');
        assert.equal(t.confidence, 0.94);
        assert.deepEqual(t.bbox, [812, 542, 96, 36]);
        assert.equal(t.requires_user_confirmation, false);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

// ── 13. no hook/register.cjs mutation ────────────────────────────────────────

test('targetRegistry does not modify register.cjs', () => {
    const before = fs.readFileSync(HOOK_PATH, 'utf8');
    const stateDir = tmpState();
    try {
        registerTarget(stateDir, { kind: 'button' });
        loadTargets(stateDir);
    } finally {
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
    const after = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.equal(before, after, 'register.cjs must be byte-identical after targetRegistry use');
});
