// src/core/signature.js
// Ed25519 signature verification using tweetnacl

import nacl from 'tweetnacl';
import { canonicalize } from 'json-canonicalize';

export function bytesFromBase64(b64) {
    return Buffer.from(b64, 'base64');
}

export function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

export function verifyEd25519({ payloadObj, sigB64, pubKeyB64 }) {
    try {
        // Canonicalize the payload (excluding signature field)
        const msg = Buffer.from(canonicalize(payloadObj), 'utf8');
        const sig = bytesFromBase64(sigB64);
        const pub = bytesFromBase64(pubKeyB64);

        const isValid = nacl.sign.detached.verify(
            new Uint8Array(msg),
            new Uint8Array(sig),
            new Uint8Array(pub)
        );

        return {
            valid: isValid,
            message: isValid ? 'Signature verified' : 'Signature verification failed'
        };
    } catch (err) {
        return {
            valid: false,
            message: `Signature verification error: ${err.message}`
        };
    }
}

export function generateKeyPair() {
    const keyPair = nacl.sign.keyPair();
    return {
        publicKey: toBase64(keyPair.publicKey),
        secretKey: toBase64(keyPair.secretKey)
    };
}

export function signEd25519({ payloadObj, secretKeyB64 }) {
    try {
        const msg = Buffer.from(canonicalize(payloadObj), 'utf8');
        const secretKey = bytesFromBase64(secretKeyB64);
        const sig = nacl.sign.detached(new Uint8Array(msg), new Uint8Array(secretKey));
        return {
            signature: toBase64(sig),
            error: null
        };
    } catch (err) {
        return {
            signature: null,
            error: `Signing failed: ${err.message}`
        };
    }
}
