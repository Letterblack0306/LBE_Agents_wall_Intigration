// src/cli/commands/auditVerify.js
// Verify audit log hash-chain integrity

import path from 'path';
import { verifyAuditLogIntegrity } from '../../core/auditLog.js';

function toBoolean(value, defaultValue) {
    if (value === undefined) return defaultValue;
    if (value === true || value === false) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return defaultValue;
}

export async function auditVerifyCommand(opts) {
    const auditPath = opts.audit ? path.resolve(opts.audit) : path.resolve('.lbe/data/audit.log.jsonl');
    const failFast = toBoolean(opts['fail-fast'], true);
    const jsonOutput = toBoolean(opts.json, true);
    const maxEntries = Number.isFinite(Number(opts.max)) ? Number(opts.max) : undefined;

    const result = verifyAuditLogIntegrity(auditPath, { failFast, maxEntries });

    if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
        console.log(`OK: ${result.file}`);
        console.log(`Entries: ${result.entries}`);
    } else {
        console.log(`FAIL: ${result.file}`);
        console.log(`First invalid index: ${result.firstInvalidIndex}`);
        console.log(`Reason: ${result.reason}`);
    }

    process.exit(result.valid ? 0 : 8);
}
