import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    scanExtractedPackage,
    verifyPackedArtifact,
} from '../scripts/verify-pack-proof.mjs';

function withTempPackage(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-pack-proof-test-'));
    const packageDir = path.join(root, 'package');
    fs.mkdirSync(packageDir, { recursive: true });

    try {
        return run(packageDir, root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

const manifest = Object.freeze({
    forbiddenNpmPackedPaths: ['src/', 'scripts/', '*.map', '.env'],
    forbiddenTextMarkers: ['secretKey', 'executeAdapter'],
});

test('scanExtractedPackage accepts a clean extracted package', () => {
    withTempPackage((packageDir) => {
        fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(packageDir, 'dist', 'index.js'), 'export const ready = true;\n');
        fs.writeFileSync(path.join(packageDir, 'README.md'), '# Package\n');

        const result = scanExtractedPackage(packageDir, manifest);

        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.files.sort(), ['README.md', 'dist/index.js']);
    });
});

test('scanExtractedPackage rejects forbidden paths from extracted tarball content', () => {
    withTempPackage((packageDir) => {
        fs.mkdirSync(path.join(packageDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(packageDir, 'src', 'private.js'), 'export {};\n');
        fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(packageDir, 'dist', 'index.js.map'), '{}');

        const result = scanExtractedPackage(packageDir, manifest);

        assert.ok(result.failures.some((failure) => failure.includes('forbidden [src/]')));
        assert.ok(result.failures.some((failure) => failure.includes('forbidden [*.map]')));
    });
});

test('scanExtractedPackage scans extracted bytes rather than a clean source tree', () => {
    withTempPackage((packageDir) => {
        fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
        fs.writeFileSync(
            path.join(packageDir, 'dist', 'index.js'),
            'export const leaked = "executeAdapter";\n',
        );

        const result = scanExtractedPackage(packageDir, manifest);

        assert.ok(
            result.failures.includes(
                'forbidden marker [executeAdapter] found in packed file: dist/index.js',
            ),
        );
    });
});

test('scanExtractedPackage rejects operating-system metadata', () => {
    withTempPackage((packageDir) => {
        fs.writeFileSync(path.join(packageDir, '.DS_Store'), 'metadata');

        const result = scanExtractedPackage(packageDir, manifest);

        assert.ok(result.failures.includes('OS metadata packed: .DS_Store'));
    });
});

test('verifyPackedArtifact packs, extracts, scans, and cleans its working artifacts', () => {
    withTempPackage((packageDir, root) => {
        const tempRoot = path.join(root, 'verification-temp');
        const manifestFile = path.join(root, 'release-manifest.json');

        fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
        fs.mkdirSync(tempRoot, { recursive: true });
        fs.writeFileSync(
            path.join(packageDir, 'package.json'),
            JSON.stringify({
                name: 'lbe-pack-proof-fixture',
                version: '1.0.0',
                type: 'module',
                files: ['dist/'],
            }, null, 2),
        );
        fs.writeFileSync(path.join(packageDir, 'dist', 'index.js'), 'export const ready = true;\n');
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

        const result = verifyPackedArtifact({
            packageDir,
            manifestFile,
            tempRoot,
        });

        assert.deepEqual(result.failures, []);
        assert.ok(result.files.includes('dist/index.js'));
        assert.ok(result.files.includes('package.json'));
        assert.deepEqual(fs.readdirSync(tempRoot), []);
    });
});
