// src/cli/commands/integrityCheck.js
// Controller integrity commands

import path from 'path';
import { performIntegrityCheck, writeIntegrityManifest } from '../../core/integrity.js';

function toBoolean(value, defaultValue = false) {
    if (value === undefined) return defaultValue;
    if (value === true || value === false) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return defaultValue;
}

export async function integrityCheckCommand(opts) {
    const strict = toBoolean(opts.strict, false) || toBoolean(opts['integrity-strict'], false);
    const manifestPath = opts.manifest
        ? path.resolve(opts.manifest)
        : path.resolve(opts['integrity-manifest'] || '.lbe/config/integrity.manifest.json');
    const jsonOutput = toBoolean(opts.json, true);

    const result = await performIntegrityCheck({
        manifestPath,
        strict
    });

    if (jsonOutput) {
        console.log(JSON.stringify({
            ok: result.valid,
            valid: result.valid,
            skipped: result.skipped === true,
            strict,
            manifestPath,
            checkedFiles: result.checkedFiles,
            mismatches: result.mismatches || [],
            missing: result.missing || [],
            reason: result.reason || null,
            message: result.message
        }, null, 2));
    } else {
        console.log(result.message);
    }

    process.exit(result.valid ? 0 : 8);
}

export async function integrityGenerateCommand(opts) {
    const outputPath = path.resolve(opts.out || opts.output || opts.manifest || '.lbe/config/integrity.manifest.json');
    const result = writeIntegrityManifest({ outputPath });
    console.log(JSON.stringify({
        ok: true,
        outputPath: result.outputPath,
        fileCount: result.fileCount
    }, null, 2));
    process.exit(0);
}
