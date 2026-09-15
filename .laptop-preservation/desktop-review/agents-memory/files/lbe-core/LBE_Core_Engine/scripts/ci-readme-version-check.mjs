#!/usr/bin/env node
/**
 * CI Gate 6 — README version consistency check.
 *
 * Hard stops if:
 *  1. release-public/package.json version != source package.json version
 *  2. Any public-core README contains @letterblack/lbe-core@X.Y.Z,
 *     @letterblack/lbe-sdk@X.Y.Z, or @letterblack/lbe-exec@X.Y.Z where
 *     X.Y.Z does not equal the current version
 *
 * When this fails the agent (or developer) must update the README
 * to reference the correct version before the pipeline can continue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
    console.error(`\n[ci-readme-version-check] HARD STOP: ${msg}`);
    console.error('[ci-readme-version-check] Update the README or package.json to fix the mismatch.\n');
    process.exit(1);
}

const pkg     = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// ── 1. Built public artifact package.json version must match source ──────────
const sdkPkg  = JSON.parse(fs.readFileSync(path.join(root, 'release-public/package.json'), 'utf8'));

if (sdkPkg.version  !== version) fail(`release-public/package.json is v${sdkPkg.version} but source package.json is v${version}`);

// ── 2. Public READMEs must not contain stale @pkg@X.Y.Z version pins ────────
const readmePaths = [
    path.join(root, 'release/README.md'),
    path.join(root, 'release-public/README.md'),
];

const PIN_PATTERN = /@letterblack\/lbe-(?:core|sdk|exec)@(\d+\.\d+\.\d+)/g;

for (const file of readmePaths) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    PIN_PATTERN.lastIndex = 0;
    let match;
    while ((match = PIN_PATTERN.exec(content)) !== null) {
        if (match[1] !== version) {
            fail(
                `${path.relative(root, file)} pins "${match[0]}" but current version is v${version}.\n` +
                `  Update the README install example to @${match[0].split('@')[1]}@${version}`
            );
        }
    }
}

console.log(`[ci-readme-version-check] PASS — all artifacts and READMEs consistent at v${version}`);
