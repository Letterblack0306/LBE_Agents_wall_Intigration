// src/core/schema.js
// Command schema validation via compiled runtime decision.

import { evaluateSchemaDecision } from '../../runtime/engine.js';

export const COMMAND_SCHEMA = {
    type: 'object',
    required: [
        'id',
        'commandId',
        'requesterId',
        'sessionId',
        'timestamp',
        'nonce',
        'requires',
        'payload',
        'signature'
    ],
    properties: {
        id: {
            type: 'string',
            pattern: '^[A-Z_]+$',
            minLength: 1,
            maxLength: 50
        },
        commandId: {
            type: 'string',
            pattern: '^[a-f0-9\\-]+$',
            minLength: 36,
            maxLength: 36
        },
        requesterId: {
            type: 'string',
            minLength: 3,
            maxLength: 100
        },
        sessionId: {
            type: 'string',
            minLength: 3
        },
        timestamp: {
            type: 'number',
            minimum: 1000000000
        },
        nonce: {
            type: 'string',
            minLength: 32,
            maxLength: 128
        },
        requires: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1
        },
        risk: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        },
        payload: {
            type: 'object',
            required: ['adapter'],
            properties: {
                adapter: { type: 'string' },
                cmd: { type: 'string' },
                args: { type: 'array' },
                cwd: { type: 'string' }
            }
        },
        signature: {
            type: 'object',
            required: ['alg', 'keyId', 'sig'],
            properties: {
                alg: { type: 'string', enum: ['ed25519'] },
                keyId: { type: 'string' },
                sig: { type: 'string', minLength: 10 }
            }
        }
    }
};

export function validateSchema(obj, _schema) {
    const has = field => obj && Object.prototype.hasOwnProperty.call(obj, field);
    const isString = value => typeof value === 'string';
    const matches = (value, rx) => isString(value) && rx.test(value);
    const payload = obj?.payload;
    const signature = obj?.signature;

    const decision = evaluateSchemaDecision({
        hasId: has('id'),
        idValid: matches(obj?.id, /^[A-Z_]+$/) && obj.id.length >= 1 && obj.id.length <= 50,
        hasCommandId: has('commandId'),
        commandIdValid: matches(obj?.commandId, /^[a-f0-9-]+$/) && obj.commandId.length === 36,
        hasRequesterId: has('requesterId'),
        requesterIdValid: isString(obj?.requesterId) && obj.requesterId.length >= 3 && obj.requesterId.length <= 100,
        hasSessionId: has('sessionId'),
        sessionIdValid: isString(obj?.sessionId) && obj.sessionId.length >= 3,
        hasTimestamp: has('timestamp'),
        timestampValid: typeof obj?.timestamp === 'number' && obj.timestamp >= 1000000000,
        hasNonce: has('nonce'),
        nonceValid: isString(obj?.nonce) && obj.nonce.length >= 32 && obj.nonce.length <= 128,
        hasRequires: has('requires'),
        requiresValid: Array.isArray(obj?.requires) && obj.requires.length >= 1 && obj.requires.every(isString),
        hasPayload: has('payload') && typeof payload === 'object' && payload !== null && !Array.isArray(payload),
        hasPayloadAdapter: payload && Object.prototype.hasOwnProperty.call(payload, 'adapter'),
        payloadAdapterValid: isString(payload?.adapter),
        hasSignature: has('signature') && typeof signature === 'object' && signature !== null && !Array.isArray(signature),
        hasSignatureAlg: signature && Object.prototype.hasOwnProperty.call(signature, 'alg'),
        signatureAlgValid: signature?.alg === 'ed25519',
        hasSignatureKeyId: signature && Object.prototype.hasOwnProperty.call(signature, 'keyId'),
        hasSignatureSig: signature && Object.prototype.hasOwnProperty.call(signature, 'sig'),
        signatureSigValid: isString(signature?.sig) && signature.sig.length >= 10,
        hasRisk: has('risk'),
        riskValid: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(obj?.risk)
    });
    const errors = decision.valid ? [] : [decision.error];
    return {
        valid: errors.length === 0,
        errors
    };
}
