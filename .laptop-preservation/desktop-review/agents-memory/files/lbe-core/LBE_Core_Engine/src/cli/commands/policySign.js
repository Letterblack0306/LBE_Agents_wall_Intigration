// src/cli/commands/policySign.js
// Sign policy.json and write signature envelope

import fs from 'fs';
import path from 'path';
import { createPolicySignatureEnvelope } from '../../core/policySignature.js';

export async function policySignCommand(opts) {
    const policyPath = path.resolve(opts.config || opts.policy || '.lbe/config/policy.default.json');
    const sigPath = path.resolve(opts['policy-sig'] || '.lbe/config/policy.sig.json');
    const secretKeyPath = path.resolve(opts['secret-key-file'] || '.lbe/keys/secret.key');
    const keyId = String(opts['policy-key-id'] || 'policy-signer-v1-2026Q1');

    if (!fs.existsSync(policyPath)) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'POLICY_FILE_MISSING',
            message: `Policy file not found: ${policyPath}`
        }, null, 2));
        process.exit(1);
    }

    if (!fs.existsSync(secretKeyPath)) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'SECRET_KEY_MISSING',
            message: `Secret key file not found: ${secretKeyPath}`
        }, null, 2));
        process.exit(1);
    }

    const policyObj = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    if (typeof policyObj.version === 'undefined' || typeof policyObj.createdAt === 'undefined') {
        console.error(JSON.stringify({
            status: 'error',
            error: 'POLICY_VERSION_METADATA_MISSING',
            message: 'Policy must include version and createdAt before signing'
        }, null, 2));
        process.exit(8);
    }

    const secretKeyB64 = fs.readFileSync(secretKeyPath, 'utf8').trim();
    const signResult = createPolicySignatureEnvelope({
        policyObj,
        secretKeyB64,
        keyId
    });

    if (!signResult.ok) {
        console.error(JSON.stringify({
            status: 'error',
            error: signResult.reason || 'POLICY_SIGN_FAILED',
            message: signResult.message
        }, null, 2));
        process.exit(8);
    }

    const outDir = path.dirname(sigPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(sigPath, JSON.stringify(signResult.envelope, null, 2));

    console.log(JSON.stringify({
        status: 'ok',
        message: 'Policy signature written',
        policy: policyPath,
        policySig: sigPath,
        keyId
    }, null, 2));
    process.exit(0);
}
