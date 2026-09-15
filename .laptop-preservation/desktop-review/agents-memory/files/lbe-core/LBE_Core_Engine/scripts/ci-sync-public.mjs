#!/usr/bin/env node
/**
 * Sync release-public/ (whitelist only) to the public LetterBlack-Sentinel repo.
 * Used by both GitHub Actions (ci) and the local publish.mjs script.
 *
 * Required env:
 *   PUBLIC_REPO_TOKEN — PAT with repo write access to LetterBlack-Sentinel
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'release-manifest.json'), 'utf8'));
const releaseDir = path.join(root, 'release-public');

let token = process.env.PUBLIC_REPO_TOKEN;
if (!token) {
    const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', shell: process.platform === 'win32' });
    token = (r.stdout || '').trim();
    if (!token) {
        console.error('[ci-sync-public] HARD STOP: PUBLIC_REPO_TOKEN not set and `gh auth token` returned nothing');
        process.exit(1);
    }
    console.log('[ci-sync-public] using gh auth token as fallback');
}

const PUBLIC_REPO = `https://x-access-token:${token}@github.com/Letterblack0306/LetterBlack-Sentinel.git`;

// Only these files go to the public repo — driven by release-manifest.json
const WHITELIST = manifest.publicRepoFiles;

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const targetVersion = process.env.PUBLIC_PACKAGE_VERSION || version;

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
    if (r.status !== 0) {
        console.error(`[ci-sync-public] HARD STOP: ${cmd} ${args.join(' ')} failed`);
        process.exit(r.status ?? 1);
    }
}

function runOut(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
    return (r.stdout || '').trim();
}

function copyEntry(src, dest) {
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyEntry(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log(`[ci-sync-public] syncing v${targetVersion} to LetterBlack-Sentinel…`);

run(process.execPath, [path.join(root, 'scripts', 'check-readme-approval.mjs')], { cwd: root });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-sentinel-'));
try {
    run('git', ['clone', '--depth=1', PUBLIC_REPO, tmpDir]);

    // Wipe everything except .git
    for (const entry of fs.readdirSync(tmpDir)) {
        if (entry === '.git') continue;
        fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
    }

    // Copy whitelisted files only
    for (const name of WHITELIST) {
        copyEntry(path.join(releaseDir, name), path.join(tmpDir, name));
    }

    // Guard: Verify copied public README contains the required intro line
    const copiedReadmePath = path.join(tmpDir, 'README.md');
    if (!fs.existsSync(copiedReadmePath)) {
        console.error('[ci-sync-public] HARD STOP: Copied public README is missing');
        process.exit(1);
    }
    const readmeContent = fs.readFileSync(copiedReadmePath, 'utf8');
    if (!readmeContent.includes('LBE exists for that moment. It sits between the agent and your system')) {
        console.error('[ci-sync-public] HARD STOP: Copied public README does not contain the required intro line');
        process.exit(1);
    }

    const copiedPkgPath = path.join(tmpDir, 'package.json');
    if (fs.existsSync(copiedPkgPath)) {
        const copiedPkg = JSON.parse(fs.readFileSync(copiedPkgPath, 'utf8'));
        copiedPkg.version = targetVersion;
        fs.writeFileSync(copiedPkgPath, `${JSON.stringify(copiedPkg, null, 2)}\n`);
    }

    // Set git identity (needed in CI)
    run('git', ['config', 'user.name', 'letterblack-release[bot]'], { cwd: tmpDir });
    run('git', ['config', 'user.email', 'letterblack-release[bot]@users.noreply.github.com'], { cwd: tmpDir });

    run('git', ['add', '-A', '--force'], { cwd: tmpDir });

    const status = runOut('git', ['status', '--porcelain'], { cwd: tmpDir });
    if (!status) {
        console.log('[ci-sync-public] public repo already up to date');
    } else {
        const msgFile = path.join(tmpDir, '_msg.txt');
        fs.writeFileSync(msgFile, `release: v${version}`);
        run('git', ['commit', '-F', msgFile], { cwd: tmpDir });
        run('git', ['push', 'origin', 'main'], { cwd: tmpDir });
        console.log(`[ci-sync-public] pushed v${version} to LetterBlack-Sentinel`);
    }
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}
