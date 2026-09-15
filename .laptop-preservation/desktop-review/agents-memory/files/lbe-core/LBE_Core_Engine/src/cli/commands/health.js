// src/cli/commands/health.js
// Deployment health check command

import fs from 'fs';
import path from 'path';
import { performIntegrityCheck } from '../../core/integrity.js';

function toBoolean(value, defaultValue) {
    if (value === undefined) return defaultValue;
    if (value === true || value === false) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return defaultValue;
}

function addCheck(checks, name, ok, message) {
    checks[name] = { ok, message };
}

function canReadFile(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function checkDataWritable(dataDir) {
    const marker = path.join(dataDir, `.healthcheck-${Date.now()}`);
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(marker, 'ok', 'utf8');
        fs.unlinkSync(marker);
        return { ok: true, message: 'Data directory writable' };
    } catch (error) {
        return { ok: false, message: `Data directory not writable: ${error.message}` };
    }
}

export async function healthCommand(opts) {
    const jsonOutput = toBoolean(opts.json, true);
    const policyPath = path.resolve(opts.config || opts.policy || '.lbe/config/policy.default.json');
    const policySigPath = path.resolve(opts['policy-sig'] || '.lbe/config/policy.sig.json');
    const keysStorePath = path.resolve(opts['keys-store'] || '.lbe/config/keys.json');
    const dataDir = path.resolve(opts['data-dir'] || '.lbe/data');
    const auditPath = path.resolve(opts.audit || path.join(dataDir, 'audit.log.jsonl'));
    const noncePath = path.resolve(opts['nonce-db'] || path.join(dataDir, 'nonce.db.json'));
    const ratePath = path.resolve(opts['rate-db'] || path.join(dataDir, 'rate-limit.db.json'));
    const policyStatePath = path.resolve(opts['policy-state'] || path.join(dataDir, 'policy.state.json'));
    const integrityStrict = toBoolean(opts['integrity-strict'], false);
    const integrityManifestPath = path.resolve(opts['integrity-manifest'] || '.lbe/config/integrity.manifest.json');

    const checks = {};

    addCheck(
        checks,
        'policy',
        fs.existsSync(policyPath) && canReadFile(policyPath),
        fs.existsSync(policyPath)
            ? `Policy file readable: ${policyPath}`
            : `Policy file missing: ${policyPath}`
    );

    addCheck(
        checks,
        'policySignature',
        fs.existsSync(policySigPath) && canReadFile(policySigPath),
        fs.existsSync(policySigPath)
            ? `Policy signature readable: ${policySigPath}`
            : `Policy signature missing: ${policySigPath}`
    );

    addCheck(
        checks,
        'trustedKeys',
        fs.existsSync(keysStorePath) && canReadFile(keysStorePath),
        fs.existsSync(keysStorePath)
            ? `Trusted keys readable: ${keysStorePath}`
            : `Trusted keys missing: ${keysStorePath}`
    );

    addCheck(
        checks,
        'auditLog',
        fs.existsSync(auditPath) && canReadFile(auditPath),
        fs.existsSync(auditPath)
            ? `Audit log readable: ${auditPath}`
            : `Audit log missing: ${auditPath}`
    );

    addCheck(
        checks,
        'nonceDb',
        fs.existsSync(noncePath) && canReadFile(noncePath),
        fs.existsSync(noncePath)
            ? `Nonce DB readable: ${noncePath}`
            : `Nonce DB missing: ${noncePath}`
    );

    addCheck(
        checks,
        'rateLimitDb',
        fs.existsSync(ratePath) && canReadFile(ratePath),
        fs.existsSync(ratePath)
            ? `Rate-limit DB readable: ${ratePath}`
            : `Rate-limit DB missing: ${ratePath}`
    );

    addCheck(
        checks,
        'policyState',
        fs.existsSync(policyStatePath) && canReadFile(policyStatePath),
        fs.existsSync(policyStatePath)
            ? `Policy state readable: ${policyStatePath}`
            : `Policy state missing: ${policyStatePath}`
    );

    const writable = checkDataWritable(dataDir);
    addCheck(checks, 'dataWritable', writable.ok, writable.message);

    if (integrityStrict) {
        const integrity = await performIntegrityCheck({
            strict: true,
            manifestPath: integrityManifestPath
        });
        addCheck(
            checks,
            'integrity',
            integrity.valid,
            integrity.valid
                ? integrity.message
                : `${integrity.reason}: ${integrity.message}`
        );
    }

    const allOk = Object.values(checks).every((c) => c.ok === true);
    const output = {
        ok: allOk,
        status: allOk ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks
    };

    if (jsonOutput) {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(`${output.status.toUpperCase()}: ${Object.keys(checks).length} checks`);
    }

    process.exit(allOk ? 0 : 8);
}
