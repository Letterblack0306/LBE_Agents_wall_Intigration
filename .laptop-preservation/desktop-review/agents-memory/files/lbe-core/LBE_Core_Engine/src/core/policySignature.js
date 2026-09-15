// src/core/policySignature.js
// Policy signature signing and verification utilities

import fs from 'fs';
import path from 'path';
import { signEd25519, verifyEd25519 } from './signature.js';
import { resolveTrustedPublicKey } from './trustedKeys.js';

export function createPolicySignatureEnvelope({ policyObj, secretKeyB64, keyId }) {
    const signResult = signEd25519({
        payloadObj: policyObj,
        secretKeyB64
    });

    if (signResult.error) {
        return {
            ok: false,
            reason: 'POLICY_SIGNATURE_CREATE_FAILED',
            message: signResult.error,
            envelope: null
        };
    }

    return {
        ok: true,
        reason: null,
        message: 'Policy signature created',
        envelope: {
            alg: 'ed25519',
            keyId,
            sig: signResult.signature,
            createdAt: Math.floor(Date.now() / 1000)
        }
    };
}

export function verifyPolicySignature({
    policyObj,
    keyStore,
    policySigPath = './.lbe/config/policy.sig.json',
    allowUnsigned = false
}) {
    const sigPathResolved = path.resolve(policySigPath);

    if (!fs.existsSync(sigPathResolved)) {
        if (allowUnsigned) {
            return {
                ok: true,
                skipped: true,
                reason: 'POLICY_SIGNATURE_SKIPPED',
                message: `Policy signature not found: ${sigPathResolved} (allowed by flag)`
            };
        }
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNATURE_MISSING',
            message: `Policy signature file not found: ${sigPathResolved}`
        };
    }

    let envelope;
    try {
        envelope = JSON.parse(fs.readFileSync(sigPathResolved, 'utf-8'));
    } catch (error) {
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNATURE_INVALID',
            message: `Unable to parse policy signature file: ${error.message}`
        };
    }

    if (!envelope || envelope.alg !== 'ed25519' || typeof envelope.keyId !== 'string' || typeof envelope.sig !== 'string') {
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNATURE_INVALID',
            message: 'Policy signature envelope must include {alg, keyId, sig}'
        };
    }

    if (!keyStore) {
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNER_KEY_STORE_UNAVAILABLE',
            message: 'Trusted key store is required for policy signature verification'
        };
    }

    const trustedKey = resolveTrustedPublicKey({
        keyStore,
        keyId: envelope.keyId,
        requesterId: undefined
    });

    if (!trustedKey.ok) {
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNER_NOT_TRUSTED',
            message: trustedKey.message
        };
    }

    const verification = verifyEd25519({
        payloadObj: policyObj,
        sigB64: envelope.sig,
        pubKeyB64: trustedKey.publicKey
    });

    if (!verification.valid) {
        return {
            ok: false,
            skipped: false,
            reason: 'POLICY_SIGNATURE_INVALID',
            message: verification.message
        };
    }

    return {
        ok: true,
        skipped: false,
        reason: null,
        message: 'Policy signature verified',
        keyId: envelope.keyId
    };
}
