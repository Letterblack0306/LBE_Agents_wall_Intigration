// src/core/integrity.js
// Runtime integrity self-check for tamper detection

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sha256File(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
        return null;
    }
}

export function generateIntegrityManifest(rootDir = path.join(__dirname, '../..')) {
    const manifest = {};

    const criticalFiles = [
        'src/core/signature.js',
        'src/core/validator.js',
        'src/core/policyEngine.js',
        'src/core/nonceStore.js',
        'src/core/auditLog.js',
        'src/core/schema.js',
        'bin/lbe.js'
    ];

    for (const file of criticalFiles) {
        const filePath = path.join(rootDir, file);
        const hash = sha256File(filePath);
        if (hash) {
            manifest[file] = hash;
        }
    }

    return manifest;
}

export function verifyIntegrity(manifest, rootDir = path.join(__dirname, '../..')) {
    const results = {
        valid: true,
        mismatches: [],
        missing: [],
        checkedFiles: 0
    };

    for (const [file, expectedHash] of Object.entries(manifest)) {
        const filePath = path.join(rootDir, file);

        if (!fs.existsSync(filePath)) {
            results.valid = false;
            results.missing.push(file);
            continue;
        }

        const actualHash = sha256File(filePath);
        results.checkedFiles++;

        if (actualHash !== expectedHash) {
            results.valid = false;
            results.mismatches.push({
                file,
                expected: expectedHash,
                actual: actualHash
            });
        }
    }

    return results;
}

export async function performIntegrityCheck(options = {}) {
    // Backward-compatible call shape: performIntegrityCheck(manifestPath)
    const opts = (typeof options === 'string' || options === null)
        ? { manifestPath: options }
        : options;

    const rootDir = opts.rootDir || path.join(__dirname, '../..');
    const strict = opts.strict === true;
    const manifestPath = opts.manifestPath || path.join(rootDir, '.lbe/config/integrity.manifest.json');

    if (!fs.existsSync(manifestPath)) {
        if (strict) {
            return {
                valid: false,
                skipped: false,
                reason: 'INTEGRITY_MANIFEST_MISSING',
                message: `Integrity manifest not found: ${manifestPath}`,
                checkedFiles: 0,
                mismatches: [],
                missing: []
            };
        }
        return {
            valid: true,
            skipped: true,
            reason: null,
            message: 'Integrity manifest not found - check skipped',
            checkedFiles: 0,
            mismatches: [],
            missing: []
        };
    }

    try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);
        const result = verifyIntegrity(manifest, rootDir);
        return {
            ...result,
            skipped: false,
            reason: result.valid ? null : 'INTEGRITY_CHECK_FAILED',
            message: result.valid
                ? `Integrity check passed (${result.checkedFiles} files verified)`
                : 'Runtime integrity check failed - system may be tampered'
        };
    } catch (err) {
        return {
            valid: false,
            skipped: false,
            reason: 'INTEGRITY_CHECK_ERROR',
            message: `Integrity check error: ${err.message}`,
            checkedFiles: 0,
            mismatches: [],
            missing: []
        };
    }
}

export function writeIntegrityManifest({
    outputPath = path.join(__dirname, '../../.lbe/config/integrity.manifest.json'),
    rootDir = path.join(__dirname, '../..')
} = {}) {
    const manifest = generateIntegrityManifest(rootDir);
    const output = JSON.stringify(manifest, null, 2);
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, output);
    return {
        outputPath,
        fileCount: Object.keys(manifest).length,
        manifest
    };
}

// CLI command to generate manifest
export function generateManifestCommand() {
    const result = writeIntegrityManifest();
    console.log('Generated integrity manifest:');
    console.log(JSON.stringify(result.manifest, null, 2));
    console.log(`\n✅ Manifest saved to: ${result.outputPath}`);
    console.log('\n🔒 Keep this manifest secure and version-controlled.');
    console.log('   Re-generate after legitimate code updates.');
}
