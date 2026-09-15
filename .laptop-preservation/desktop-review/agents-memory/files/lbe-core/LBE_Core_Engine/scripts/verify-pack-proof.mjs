#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const releasePublicDir = path.join(root, 'release-public');
const manifestPath = path.join(root, 'release', 'release-manifest.json');

const TEXT_EXTS = new Set(['.js', '.cjs', '.mjs', '.json', '.md', '.ts', '.yml', '.yaml', '.txt']);
const OS_METADATA_FILES = new Set(['Thumbs.db', '.DS_Store', 'Desktop.ini']);

function normalizeRelativePath(value) {
    return value.replaceAll(path.sep, '/').replace(/^package\//, '');
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        shell: process.platform === 'win32',
        ...options,
    });

    if (result.error) {
        throw new Error(`${command} failed to start: ${result.error.message}`);
    }

    if (result.status !== 0) {
        const details = (result.stderr || result.stdout || '').trim();
        throw new Error(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
    }

    return result;
}

function listFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(fullPath));
        else if (entry.isFile()) files.push(fullPath);
    }
    return files;
}

function matchesForbiddenPath(relativePath, forbiddenPattern) {
    const normalized = normalizeRelativePath(relativePath);
    const clean = forbiddenPattern.replace(/\/$/, '');

    if (clean.startsWith('*.')) {
        return normalized.endsWith(clean.slice(1));
    }

    return normalized === clean
        || normalized.startsWith(`${clean}/`)
        || normalized.includes(`/${clean}/`);
}

export function scanExtractedPackage(packageDir, manifest) {
    if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
        throw new Error(`extracted package directory is missing: ${packageDir}`);
    }

    const failures = [];
    const files = listFiles(packageDir);

    for (const fullPath of files) {
        const relativePath = normalizeRelativePath(path.relative(packageDir, fullPath));
        const baseName = path.basename(relativePath);

        if (OS_METADATA_FILES.has(baseName)) {
            failures.push(`OS metadata packed: ${relativePath}`);
        }

        for (const forbiddenPattern of manifest.forbiddenNpmPackedPaths || []) {
            if (matchesForbiddenPath(relativePath, forbiddenPattern)) {
                failures.push(`forbidden [${forbiddenPattern}] matched packed file: ${relativePath}`);
            }
        }

        const extension = path.extname(relativePath).toLowerCase();
        if (!TEXT_EXTS.has(extension)) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        for (const marker of manifest.forbiddenTextMarkers || []) {
            if (content.includes(marker)) {
                failures.push(`forbidden marker [${marker}] found in packed file: ${relativePath}`);
            }
        }
    }

    return {
        failures,
        files: files.map((fullPath) => normalizeRelativePath(path.relative(packageDir, fullPath))),
    };
}

function parsePackResult(stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        throw new Error('failed to parse npm pack --json output');
    }

    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!result || typeof result.filename !== 'string' || !result.filename.endsWith('.tgz')) {
        throw new Error('npm pack --json did not return a tarball filename');
    }

    return result;
}

export function verifyPackedArtifact({
    packageDir = releasePublicDir,
    manifestFile = manifestPath,
    tempRoot = os.tmpdir(),
} = {}) {
    if (!fs.existsSync(packageDir)) {
        throw new Error(`release package directory does not exist: ${packageDir}`);
    }
    if (!fs.existsSync(manifestFile)) {
        throw new Error(`release manifest does not exist: ${manifestFile}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const workingDir = fs.mkdtempSync(path.join(tempRoot, 'lbe-pack-proof-'));
    const extractDir = path.join(workingDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        const packResult = run('npm', ['pack', '--json', '--pack-destination', workingDir], {
            cwd: packageDir,
        });
        const packMetadata = parsePackResult(packResult.stdout);
        const tarballPath = path.join(workingDir, packMetadata.filename);

        if (!fs.existsSync(tarballPath)) {
            throw new Error(`npm pack reported a tarball that does not exist: ${tarballPath}`);
        }

        run('tar', ['-xzf', tarballPath, '-C', extractDir]);

        const extractedPackageDir = path.join(extractDir, 'package');
        const scan = scanExtractedPackage(extractedPackageDir, manifest);
        if (scan.failures.length > 0) {
            throw new Error(scan.failures.join('\n'));
        }

        return {
            filename: packMetadata.filename,
            integrity: packMetadata.integrity || null,
            shasum: packMetadata.shasum || null,
            size: packMetadata.size || fs.statSync(tarballPath).size,
            unpackedSize: packMetadata.unpackedSize || null,
            files: scan.files,
        };
    } finally {
        fs.rmSync(workingDir, { recursive: true, force: true });
    }
}

function main() {
    try {
        const result = verifyPackedArtifact();
        console.log(`[verify-pack-proof] extracted and scanned ${result.files.length} files from ${result.filename}`);
        console.log(`[verify-pack-proof] packed bytes: ${result.size}`);
        if (result.unpackedSize !== null) {
            console.log(`[verify-pack-proof] unpacked bytes: ${result.unpackedSize}`);
        }
        if (result.integrity) console.log(`[verify-pack-proof] integrity: ${result.integrity}`);
        if (result.shasum) console.log(`[verify-pack-proof] shasum: ${result.shasum}`);
        console.log('[verify-pack-proof] actual tarball path and text checks: PASS');
    } catch (error) {
        console.error(`[verify-pack-proof] HARD STOP: ${error.message}`);
        process.exitCode = 1;
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
