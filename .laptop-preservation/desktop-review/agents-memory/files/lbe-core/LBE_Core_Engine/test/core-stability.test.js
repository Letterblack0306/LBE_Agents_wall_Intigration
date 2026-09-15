import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createLBE, generateKeyPair } from '../src/core/index.js';
import { NonceStore } from '../src/core/nonceStore.js';
import { getCheckpointStore } from '../src/core/checkpoint-store.js';
import { dryrunCommand } from '../src/cli/commands/dryrun.js';
import { runCommand } from '../src/cli/commands/run.js';
import { signEd25519 } from '../src/core/signature.js';
import { validateCommand } from '../src/core/validator.js';
import { appendAudit } from '../src/core/auditLog.js';

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-core-stability-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function writeJson(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

async function invokeCli(fn, opts) {
    const stdout = [];
    const stderr = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode = 0;

    console.log = (...args) => stdout.push(args.join(' '));
    console.error = (...args) => stderr.push(args.join(' '));
    process.exit = (code = 0) => {
        exitCode = code;
        throw Object.assign(new Error(`process.exit(${code})`), { code: 'TEST_PROCESS_EXIT', exitCode: code });
    };

    try {
        await fn(opts);
    } catch (error) {
        if (error.code !== 'TEST_PROCESS_EXIT') throw error;
    } finally {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
    }

    return {
        exitCode,
        stdout: stdout.join('\n').trim(),
        stderr: stderr.join('\n').trim()
    };
}

test('getCheckpointStore returns same instance for same resolved dbPath and distinct instances for different paths', t => {
    const root = sandbox(t);
    const dbPathA = path.join(root, 'data', 'checkpoints-a.json');
    const dbPathB = path.join(root, 'data', 'checkpoints-b.json');

    const storeA1 = getCheckpointStore(dbPathA);
    const storeA2 = getCheckpointStore(path.resolve(dbPathA));
    const storeB = getCheckpointStore(dbPathB);

    assert.equal(storeA1, storeA2);
    assert.notEqual(storeA1, storeB);
    assert.equal(storeA2.dbPath, path.resolve(dbPathA));
    assert.equal(storeB.dbPath, path.resolve(dbPathB));
});

test('dryrun does not persist or advance policy state', async t => {
    const root = sandbox(t);
    const policyPath = path.join(root, 'policy.json');
    const statePath = path.join(root, 'policy.state.json');
    const proposalPath = path.join(root, 'proposal.json');

    const policy = {
        version: '1',
        createdAt: new Date().toISOString(),
        default: 'DENY',
        requesters: {
            'agent:test': {
                allowCommands: ['WRITE_FILE'],
                allowAdapters: ['file'],
                filesystem: { roots: [root], denyPatterns: [] }
            }
        },
        security: { maxPolicyCreatedAtSkewSec: 3600 }
    };
    writeJson(policyPath, policy);
    writeJson(statePath, { schemaVersion: '1', lastAccepted: { version: '0', createdAt: new Date(Date.now() - 3600 * 1000).toISOString() }, updatedAt: new Date(Date.now() - 3600 * 1000).toISOString() });

    const keyPair = generateKeyPair();
    const proposal = {
        id: 'WRITE_FILE',
        risk: 'LOW',
        commandId: crypto.randomUUID(),
        requesterId: 'agent:test',
        sessionId: 'session-1',
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomBytes(16).toString('hex'),
        requires: ['policy', 'signature'],
        payload: {
            adapter: 'file',
            action: 'write',
            target: path.join(root, 'output.txt'),
            content: 'draft',
            cwd: root
        }
    };
    const signed = signEd25519({ payloadObj: proposal, secretKeyB64: keyPair.secretKey });
    proposal.signature = { alg: 'ed25519', keyId: 'test-key', sig: signed.signature };
    writeJson(proposalPath, proposal);

    const result = await invokeCli(dryrunCommand, {
        in: proposalPath,
        policy: policyPath,
        'keys-store': path.join(root, '.lbe', 'config', 'keys.json'),
        'policy-sig': path.join(root, '.lbe', 'config', 'policy.sig.json'),
        'policy-unsigned-ok': 'true',
        'pub-key': keyPair.publicKey,
        'policy-state': statePath
    });

    assert.equal(result.exitCode, 0, `dryrun should succeed; stderr=${result.stderr}`);
    assert.ok(result.stdout.includes('valid_simulated'));
    const persisted = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(persisted);
    assert.equal(state.lastAccepted.version, '0', 'Policy state file must not be advanced by dryrun');
});

test('validateCommand rejects pub-key fallback when trusted key store exists', t => {
    const root = sandbox(t);
    const { publicKey, secretKey } = generateKeyPair();
    const keyId = 'test-key';
    const keyStore = { trustedKeys: {} };
    const policy = {
        version: '1',
        default: 'DENY',
        requesters: {
            'agent:test': {
                allowCommands: ['WRITE_FILE'],
                allowAdapters: ['file'],
                filesystem: { roots: [root], denyPatterns: [] }
            }
        },
        security: { maxClockSkewSec: 600 }
    };
    const proposal = {
        id: 'WRITE_FILE',
        risk: 'LOW',
        commandId: crypto.randomUUID(),
        requesterId: 'agent:test',
        sessionId: 'session-1',
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomBytes(16).toString('hex'),
        requires: ['policy', 'signature'],
        payload: {
            adapter: 'file',
            action: 'write',
            target: path.join(root, 'output.txt'),
            content: 'draft',
            cwd: root
        }
    };
    const signed = signEd25519({ payloadObj: proposal, secretKeyB64: secretKey });
    proposal.signature = { alg: 'ed25519', keyId, sig: signed.signature };

    const result = validateCommand({ commandObj: proposal, pubKeyB64: publicKey, keyStore, nonceDb: { entries: [] }, policy });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.type === 'KEY_NOT_TRUSTED'));
});

test('appendAudit reports malformed trailing record metadata without silencing corruption', t => {
    const root = sandbox(t);
    const auditPath = path.join(root, '.lbe', 'data', 'audit.log.jsonl');
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    const validRecord = { commandId: 'valid-1', prevHash: 'GENESIS', timestamp: new Date().toISOString(), hash: 'hash1' };
    fs.writeFileSync(auditPath, JSON.stringify(validRecord) + '\nINVALID_JSON_LINE\n', 'utf8');

    const result = appendAudit(auditPath, { commandId: 'valid-2', status: 'ok' });

    assert.equal(result.success, true);
    assert.equal(result.corruptTail, true);
    assert.equal(result.corruptLineIndex, 1);
    assert.ok(result.message.includes('malformed trailing record'));
    const content = fs.readFileSync(auditPath, 'utf8');
    assert.ok(content.includes('INVALID_JSON_LINE'));
});

test('createLBE.execute returns nonce_persist when nonce persistence fails', async t => {
    const root = sandbox(t);
    const { secretKey, publicKey } = generateKeyPair();
    const keyId = 'test-key';
    const policy = {
        version: 1,
        default: 'DENY',
        requesters: {
            'agent:x': {
                allowCommands: ['ECHO'],
                allowAdapters: ['noop'],
                filesystem: { roots: [root], denyPatterns: [] }
            }
        },
        security: { maxClockSkewSec: 600 }
    };

    const keyStore = { defaultKeyId: keyId, trustedKeys: { [keyId]: { publicKey, notBefore: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), deprecated: false } } };
    const lbe = createLBE({
        rootDir: root,
        secretKey,
        keyId,
        keyStore,
        policy,
        logSilent: true,
        nonceDbPath: path.join(root, '.lbe', 'data', 'nonce.db.json'),
        rateLimitDbPath: path.join(root, '.lbe', 'data', 'rate-limit.db.json')
    });

    const originalSave = NonceStore.prototype.save;
    NonceStore.prototype.save = async function () {
        throw new Error('simulated save failure');
    };
    t.after(() => {
        NonceStore.prototype.save = originalSave;
    });

    const result = await lbe.execute({ actor: 'agent:x', intent: 'echo', transaction: { audit: false } });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'nonce_persist');
    assert.equal(result.error, 'NONCE_SAVE_FAILED');
});

test('createLBE.execute exposes approval_pending and approval_required honestly', async t => {
    const root = sandbox(t);
    const { secretKey, publicKey } = generateKeyPair();
    const keyId = 'test-key';
    const policy = {
        version: 1,
        default: 'DENY',
        requesters: {
            'agent:x': {
                allowCommands: ['WRITE_FILE'],
                allowAdapters: ['file'],
                filesystem: { roots: [root], denyPatterns: [] },
                requireApproval: true
            }
        },
        security: { maxClockSkewSec: 600 }
    };

    const keyStore = { defaultKeyId: keyId, trustedKeys: { [keyId]: { publicKey, notBefore: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), deprecated: false } } };
    const lbe = createLBE({
        rootDir: root,
        secretKey,
        keyId,
        keyStore,
        policy,
        logSilent: true,
        nonceDbPath: path.join(root, '.lbe', 'data', 'nonce.db.json'),
        rateLimitDbPath: path.join(root, '.lbe', 'data', 'rate-limit.db.json')
    });

    const result = await lbe.execute({ actor: 'agent:x', intent: 'write_file', target: path.join(root, 'out.txt'), content: 'hello', transaction: { audit: false } });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'approval_pending');
    assert.equal(result.status, 'approval_pending');
    assert.equal(result.approvalPending, true);
    assert.equal(result.approvalRequired, true);
    assert.ok(typeof result.approvalToken === 'string');
});

test('runCommand exits with code 11 and approval_pending output when approval is required', async t => {
    const root = sandbox(t);
    const proposalPath = path.join(root, 'proposal.json');
    const policyPath = path.join(root, 'policy.json');
    const statePath = path.join(root, 'policy.state.json');
    const keyPair = generateKeyPair();

    const policy = {
        version: 1,
        createdAt: new Date().toISOString(),
        default: 'DENY',
        requesters: {
            'agent:test': {
                allowCommands: ['WRITE_FILE'],
                allowAdapters: ['file'],
                filesystem: { roots: [root], denyPatterns: [] },
                requireApproval: true
            }
        },
        security: { maxPolicyCreatedAtSkewSec: 3600 }
    };
    writeJson(policyPath, policy);
    writeJson(statePath, { schemaVersion: '1', lastAccepted: { version: '1', createdAt: new Date(Date.now() - 3600 * 1000).toISOString() }, updatedAt: new Date(Date.now() - 3600 * 1000).toISOString() });

    const proposal = {
        id: 'WRITE_FILE',
        risk: 'MEDIUM',
        commandId: crypto.randomUUID(),
        requesterId: 'agent:test',
        sessionId: 'session-1',
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomBytes(16).toString('hex'),
        requires: ['policy', 'signature'],
        payload: {
            adapter: 'file',
            action: 'write',
            target: path.join(root, 'approval.txt'),
            content: 'pending',
            cwd: root
        }
    };
    const signed = signEd25519({ payloadObj: proposal, secretKeyB64: keyPair.secretKey });
    proposal.signature = { alg: 'ed25519', keyId: 'test-key', sig: signed.signature };
    writeJson(proposalPath, proposal);

    const result = await invokeCli(runCommand, {
        in: proposalPath,
        policy: policyPath,
        'keys-store': path.join(root, '.lbe', 'config', 'keys.json'),
        'policy-sig': path.join(root, '.lbe', 'config', 'policy.sig.json'),
        'policy-unsigned-ok': 'true',
        'pub-key': keyPair.publicKey,
        'policy-state': statePath
    });

    assert.equal(result.exitCode, 11);
    assert.ok(result.stdout.includes('approval_pending'));
    assert.ok(result.stdout.includes('approvalToken'));
});
