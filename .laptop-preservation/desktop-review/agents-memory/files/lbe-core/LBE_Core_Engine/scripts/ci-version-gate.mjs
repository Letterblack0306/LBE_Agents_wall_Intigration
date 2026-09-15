#!/usr/bin/env node
/**
 * CI Gate 3 — Version gate.
 *
 * Checks whether the current package.json version is already published on npm.
 *
 * If ALREADY published → write SHOULD_PUBLISH=false to GITHUB_ENV and exit 0.
 *   All downstream publish steps are skipped. No auto-bump. No new release.
 *   This is the normal path for CI-only fixes pushed to main.
 *
 * If NOT yet published → write SHOULD_PUBLISH=true to GITHUB_ENV and exit 0.
 *   The pipeline continues to build, validate, and publish.
 *   This is the intentional-release path: developer bumped package.json
 *   version before pushing.
 *
 * No npm auth needed — npm view of public packages is unauthenticated.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

function npmPublishedVersion(name) {
    const r = spawnSync('npm', ['view', name, 'version', '--registry', 'https://registry.npmjs.org'], {
        encoding: 'utf8',
    });
    return (r.stdout || '').trim();
}

console.log(`[ci-version-gate] checking v${version} against npm registry…`);

const coreVer = npmPublishedVersion('@letterblack/lbe-core');

console.log(`[ci-version-gate]   lbe-core on npm : ${coreVer || '(not published)'}`);

function setEnv(key, value) {
    if (process.env.GITHUB_ENV) {
        fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
    }
    process.env[key] = value;
}

if (coreVer === version) {
    console.log(`[ci-version-gate] v${version} already on npm — skipping publish`);
    console.log('[ci-version-gate] To release a new version, bump package.json version and push.');
    setEnv('SHOULD_PUBLISH', 'false');
} else {
    console.log(`[ci-version-gate] v${version} not yet published — pipeline will build and publish`);
    setEnv('SHOULD_PUBLISH', 'true');
}

console.log(`[ci-version-gate] SHOULD_PUBLISH=${process.env.SHOULD_PUBLISH}`);
