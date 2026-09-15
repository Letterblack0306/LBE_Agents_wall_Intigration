// test/invariant-backup.test.js
// Tests:
//   1. Invariant gate blocks execute() when secretKey is missing
//   2. Invariant gate blocks execute() when policy default is not DENY
//   3. checkWritable() is pure (no side effects)
//   4. prepareRuntimeDir() creates dir when missing
//   5. Backup failure is fatal for write transactions

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkInvariants, checkWritable, prepareRuntimeDir, InvariantGateError, assertInvariants } from '../src/core/invariants.js';
import { createKeyStore, createLBE, generateKeyPair } from '../src/core/index.js';

function makeSandbox(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-inv-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function goodCfg(dir) {
    return {
        secretKey: 'present',
        auditLog:  path.join(dir, 'data/audit.log.jsonl'),
        nonceDb:   path.join(dir, 'data/nonce.db.json'),
        rateLimit: path.join(dir, 'data/rate-limit.db.json')
    };
}

const goodPolicy = { version: 3, requesters: { 'agent:x': { allowAdapters: ['noop'] } }, default: 'DENY' };
const goodKeys   = { 'key-1': { publicKey: 'abc' } };

// ── Invariant gate: missing secretKey ────────────────────────────────────────

test('invariant gate: null secretKey is a hard failure', t => {
    const dir = makeSandbox(t);
    const cfg = { ...goodCfg(dir), secretKey: null };
    const result = checkInvariants(cfg, goodPolicy, goodKeys);
    assert.equal(result.ok, false);
    assert.equal(result.checks.secret_key_present, false);
    assert.ok(result.failures.some(f => f.includes('secretKey')));
});

test('invariant gate: assertInvariants throws InvariantGateError on bad secretKey', t => {
    const dir = makeSandbox(t);
    const cfg = { ...goodCfg(dir), secretKey: '' };
    assert.throws(
        () => assertInvariants(cfg, goodPolicy, goodKeys),
        e => e instanceof InvariantGateError && e.failures.length > 0
    );
});

// ── Invariant gate: bad policy ────────────────────────────────────────────────

test('invariant gate: policy with default=ALLOW blocks execution', t => {
    const dir = makeSandbox(t);
    const result = checkInvariants(goodCfg(dir), { ...goodPolicy, default: 'ALLOW' }, goodKeys);
    assert.equal(result.ok, false);
    assert.equal(result.checks.policy_structure, false);
});

test('invariant gate: null keyStore is a hard failure', t => {
    const dir = makeSandbox(t);
    const result = checkInvariants(goodCfg(dir), goodPolicy, null);
    assert.equal(result.ok, false);
    assert.equal(result.checks.keys_available, false);
});

// ── checkWritable: pure, no side effects ─────────────────────────────────────

test('checkWritable returns false for non-existent dir without creating it', t => {
    const dir = makeSandbox(t);
    const ghost = path.join(dir, 'does-not-exist');
    const result = checkWritable(ghost);
    assert.equal(result, false);
    assert.equal(fs.existsSync(ghost), false, 'checkWritable must not create the directory');
});

test('checkWritable returns true for an existing writable dir', t => {
    const dir = makeSandbox(t);
    assert.equal(checkWritable(dir), true);
});

// ── prepareRuntimeDir: creates missing dir ────────────────────────────────────

test('prepareRuntimeDir creates directory and returns true', t => {
    const dir = makeSandbox(t);
    const target = path.join(dir, 'runtime/nested');
    assert.equal(fs.existsSync(target), false);
    const result = prepareRuntimeDir(target);
    assert.equal(result, true);
    assert.ok(fs.existsSync(target));
});

// ── SDK: invariant gate blocks execute() ─────────────────────────────────────

test('SDK execute() returns stage=invariant_gate when secretKey is null', async t => {
    const lbe = createLBE({ secretKey: null, keyId: 'none', logSilent: true });
    const result = await lbe.execute({ actor: 'agent:x', intent: 'echo', transaction: {} });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'invariant_gate');
    assert.ok(Array.isArray(result.failures) && result.failures.length > 0);
});

// ── Backup failure is fatal for write transactions ────────────────────────────

test('execute() with backup:true returns stage=backup when backup dir is unwritable', async t => {
    const dir = makeSandbox(t);

    // Target must be within policy filesystem.roots (letterblack-sentinel directory).
    const dataDir = path.resolve('data');
    fs.mkdirSync(dataDir, { recursive: true });
    const targetFile = path.join(dataDir, 'backup-test-target.txt');
    const originalContent = `backup-test-sentinel-${Date.now()}\n`;
    fs.writeFileSync(targetFile, originalContent);
    t.after(() => {
        try { fs.unlinkSync(targetFile); } catch {}
        try { fs.rmdirSync(dataDir); } catch {}
    });

    // Point backupDir at a file path — fs.mkdirSync on a file path will throw
    const blockedBackupDir = path.join(dir, 'backup-blocker');
    fs.writeFileSync(blockedBackupDir, 'I am a file, not a dir');

    const { secretKey, publicKey } = generateKeyPair();
    const keyId = 'backup-test-key';
    const policy = {
        version: 1,
        default: 'DENY',
        requesters: {
            'agent:gpt': {
                allowCommands: ['write_file'],
                allowAdapters: ['file'],
                filesystem: { roots: [dataDir], denyPatterns: [] }
            }
        }
    };

    const lbe = createLBE({
        secretKey,
        keyId,
        keyStore: createKeyStore({ publicKey, keyId }),
        policy,
        logSilent: true,
        nonceDbPath: path.join(dir, 'nonce.db.json'),
        rateLimitDbPath: path.join(dir, 'rate-limit.db.json'),
        backupDir: blockedBackupDir   // file path — createBackup will throw ENOTDIR
    });

    const result = await lbe.execute({
        actor: 'agent:gpt',
        intent: 'write_file',
        target: targetFile,
        content: 'replaced\n',
        transaction: { backup: true, rollbackOnFailure: true, audit: false }
    });

    assert.equal(result.ok, false, 'Write with failed backup must not succeed');
    assert.equal(result.stage, 'backup', `Expected stage=backup, got stage=${result.stage}`);
    assert.equal(result.error, 'BACKUP_FAILED');

    // Original file must be untouched — execution was aborted before adapter ran
    const content = fs.readFileSync(targetFile, 'utf8');
    assert.equal(content, originalContent, 'Target must not have been modified when backup fails');
});
