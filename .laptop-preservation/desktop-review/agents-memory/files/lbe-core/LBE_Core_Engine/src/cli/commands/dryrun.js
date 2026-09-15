// src/cli/commands/dryrun.js
// Validate proposal and simulate execution

import fs from 'fs';
import path from 'path';
import { validateCommand } from '../../core/validator.js';
import { NonceStore } from '../../core/nonceStore.js';
import { executeAdapter } from '../../adapters/index.js';
import { loadKeysStore } from '../../core/trustedKeys.js';
import { verifyPolicySignature } from '../../core/policySignature.js';
import { validateAndUpdatePolicyVersionState } from '../../core/policyVersionGuard.js';

export async function dryrunCommand(opts) {
    const { in: inFile } = opts;
    const config = opts.config || opts.policy;
    const pubKey = opts['pub-key'];
    const keysStorePath = opts['keys-store'] || path.resolve('.lbe/config/keys.json');
    const policySigPath = opts['policy-sig'] || path.resolve('.lbe/config/policy.sig.json');
    const policyStatePath = opts['policy-state'] || path.resolve('.lbe/data/policy.state.json');
    const allowUnsignedPolicy = opts['policy-unsigned-ok'] === true || String(opts['policy-unsigned-ok']).toLowerCase() === 'true';
    // Validate required arguments
    if (!inFile) {
        console.error('Error: --in <file> is required');
        process.exit(1);
    }

    // Read proposal file
    let proposal;
    try {
        const filePath = path.resolve(inFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        proposal = JSON.parse(content);
    } catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INVALID_PROPOSAL_FILE',
            message: error.message
        }));
        process.exit(5);
    }

    // Load policy
    let policy;
    try {
        const policyPath = config || path.resolve('.lbe/config/policy.default.json');
        if (!fs.existsSync(policyPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'MISSING_POLICY',
                message: `Policy file not found: ${policyPath}`
            }));
            process.exit(1);
        }
        const policyContent = fs.readFileSync(policyPath, 'utf-8');
        policy = JSON.parse(policyContent);
    } catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INVALID_POLICY',
            message: error.message
        }));
        process.exit(1);
    }

    // Load key store (preferred) with legacy pub-key fallback
    const keyStoreResult = loadKeysStore(keysStorePath);
    const keyStore = keyStoreResult.ok ? keyStoreResult.store : null;

    // Preflight: policy signature verification (strict by default)
    const policySigCheck = verifyPolicySignature({
        policyObj: policy,
        keyStore,
        policySigPath,
        allowUnsigned: allowUnsignedPolicy
    });
    if (!policySigCheck.ok) {
        console.error(JSON.stringify({
            status: 'error',
            error: policySigCheck.reason,
            message: policySigCheck.message
        }, null, 2));
        process.exit(8);
    }

    const versionCheck = validateAndUpdatePolicyVersionState({
        policyObj: policy,
        statePath: policyStatePath,
        maxCreatedAtSkewSec: policy?.security?.maxPolicyCreatedAtSkewSec,
        persist: false
    });
    if (!versionCheck.ok) {
        console.error(JSON.stringify({
            status: 'error',
            error: versionCheck.reason,
            message: versionCheck.message
        }, null, 2));
        process.exit(8);
    }

    // Load nonce store
    const nonceDb = new NonceStore(path.resolve('.lbe/data/nonce.db.json'));
    await nonceDb.load();

    if (!keyStore && !pubKey) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'MISSING_KEY_MATERIAL',
            message: `${keyStoreResult.message}. Provide --pub-key/--pub-key-file or create .lbe/config/keys.json`
        }));
        process.exit(1);
    }

    // Validate command
    const validateResult = validateCommand({
        commandObj: proposal,
        pubKeyB64: pubKey,
        keyStore,
        nonceDb,
        policy
    });

    if (!validateResult.valid) {
        const output = {
            status: 'invalid',
            commandId: proposal.commandId || 'N/A',
            checks: validateResult.checks,
            errors: validateResult.errors || [],
            executionResult: null
        };
        console.log(JSON.stringify(output, null, 2));

        if (validateResult.checks.schema === false) process.exit(5);
        if (validateResult.checks.signature === false) process.exit(3);
        if (validateResult.checks.nonce === false) process.exit(4);
        if (validateResult.checks.timestamp === false) process.exit(6);
        if (validateResult.checks.rateLimit === false) process.exit(7);
        if (validateResult.checks.policy === false) process.exit(2);
        process.exit(9);
    }

    // Simulate execution with noop adapter
    let executionResult;
    try {
        const requesterPolicy = policy.requesters?.[proposal.requesterId];
        executionResult = await executeAdapter(
            'noop',
            proposal,
            policy,
            requesterPolicy
        );
    } catch (error) {
        executionResult = {
            adapter: 'noop',
            status: 'error',
            error: error.message
        };
    }

    // Output structured result
    const output = {
        status: 'valid_simulated',
        commandId: proposal.commandId || 'N/A',
        checks: validateResult.checks,
        risk: validateResult.risk || 'UNKNOWN',
        executionResult: {
            adapter: executionResult.adapter,
            status: executionResult.status,
            output: executionResult.output || executionResult.error || '',
            exitCode: executionResult.exitCode || 0,
            note: 'This is a simulation using noop adapter. No actual execution occurred.'
        }
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
}
