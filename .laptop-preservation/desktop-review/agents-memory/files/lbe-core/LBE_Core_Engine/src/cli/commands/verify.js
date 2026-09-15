// src/cli/commands/verify.js
// Validate a proposal without executing

import fs from 'fs';
import path from 'path';
import { validateCommand } from '../../core/validator.js';
import { NonceStore } from '../../core/nonceStore.js';
import { loadKeysStore } from '../../core/trustedKeys.js';
import { verifyPolicySignature } from '../../core/policySignature.js';
import { validateAndUpdatePolicyVersionState } from '../../core/policyVersionGuard.js';

export async function verifyCommand(opts) {
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
        persist: false  // verify is read-only — no state mutation
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
    const result = validateCommand({
        commandObj: proposal,
        pubKeyB64: pubKey,
        keyStore,
        nonceDb,
        policy
    });

    // Output structured result
    const output = {
        status: result.valid ? 'valid' : 'invalid',
        commandId: proposal.commandId || 'N/A',
        checks: result.checks,
        errors: result.errors || [],
        risk: result.risk || 'UNKNOWN'
    };

    console.log(JSON.stringify(output, null, 2));

    // Exit with appropriate code
    if (!result.valid) {
        // Determine which validation failed for exit code
        if (result.checks.schema === false) process.exit(5);       // Schema error
        if (result.checks.signature === false) process.exit(3);    // Signature error
        if (result.checks.nonce === false) process.exit(4);        // Replay detected
        if (result.checks.timestamp === false) process.exit(6);    // Clock skew
        if (result.checks.rateLimit === false) process.exit(7);    // Rate limited
        if (result.checks.policy === false) process.exit(2);       // Policy blocked
        process.exit(9);                                            // Generic error
    }

    process.exit(0);
}
