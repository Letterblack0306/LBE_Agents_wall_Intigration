#!/usr/bin/env node
/**
 * Validate the public LetterBlack-Sentinel repo after a sync step.
 *
 * This guard checks that the public repo contains only the approved release
 * whitelist at the repository root and that package.json reflects the target
 * release version.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'release-manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.PUBLIC_PACKAGE_VERSION || pkg.version;
const token = process.env.PUBLIC_REPO_TOKEN || (() => {
    const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', shell: process.platform === 'win32' });
    return (r.stdout || '').trim();
})();

if (!token) {
    console.error('[ci-guard-public-sync] HARD STOP: PUBLIC_REPO_TOKEN not set and `gh auth token` returned nothing');
    process.exit(1);
}

const publicRepo = `https://x-access-token:${token}@github.com/Letterblack0306/LetterBlack-Sentinel.git`;
const whitelist = new Set(manifest.publicRepoFiles);

function toPosix(file) {
    return file.split(path.sep).join('/');
}

function listFiles(baseDir) {
    const files = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === '.git') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                files.push(toPosix(path.relative(baseDir, full)));
            } else {
                fail(`unsupported filesystem entry in public mirror: ${toPosix(path.relative(baseDir, full))}`);
            }
        }
    }
    walk(baseDir);
    return files.sort();
}

function listWhitelistedSourceFiles() {
    const files = [];
    for (const entry of manifest.publicRepoFiles) {
        const source = path.join(root, 'release-public', entry);
        if (!fs.existsSync(source)) {
            fail(`release-public is missing whitelisted entry: ${entry}`);
        }
        const stat = fs.statSync(source);
        if (stat.isDirectory()) {
            for (const file of listFiles(source)) {
                files.push(`${entry}/${file}`);
            }
        } else if (stat.isFile()) {
            files.push(entry);
        } else {
            fail(`unsupported release-public whitelist entry: ${entry}`);
        }
    }
    return files.sort();
}

function gitCleanHash(repoDir, fileRelativeToRepo, repoRelativePath) {
    const result = spawnSync('git', ['hash-object', `--path=${repoRelativePath}`, fileRelativeToRepo], {
        cwd: repoDir,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        fail(`git hash-object failed for ${repoRelativePath}${stderr ? `: ${stderr}` : ''}`);
    }
    return (result.stdout || '').trim();
}

function assertFileParity(publicDir) {
    const expectedFiles = listWhitelistedSourceFiles();
    const actualFiles = listFiles(publicDir);
    const expectedSet = new Set(expectedFiles);
    const actualSet = new Set(actualFiles);

    const missing = expectedFiles.filter((file) => !actualSet.has(file));
    if (missing.length > 0) {
        fail(`public mirror missing files from release-public: ${missing.join(', ')}`);
    }

    const extra = actualFiles.filter((file) => !expectedSet.has(file));
    if (extra.length > 0) {
        fail(`public mirror contains files not in release-public whitelist output: ${extra.join(', ')}`);
    }

    const mismatched = [];
    for (const file of expectedFiles) {
        const sourcePath = `release-public/${file}`;
        const sourceHash = gitCleanHash(root, sourcePath, sourcePath);
        const publicHash = gitCleanHash(publicDir, file, file);
        if (sourceHash !== publicHash) {
            mismatched.push(file);
        }
    }
    if (mismatched.length > 0) {
        fail(`public mirror file content differs from release-public: ${mismatched.join(', ')}`);
    }

    console.log(`[ci-guard-public-sync] public repo file parity: PASS (${expectedFiles.length} files)`);
}

function fail(message) {
    console.error(`[ci-guard-public-sync] HARD STOP: ${message}`);
    process.exit(1);
}

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        const stdout = (result.stdout || '').trim();
        fail(`${cmd} ${args.join(' ')} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`);
    }
    return (result.stdout || '').trim();
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-public-guard-'));
try {
    run('git', ['clone', '--depth=1', publicRepo, tmpDir]);

    const entries = fs.readdirSync(tmpDir).filter((entry) => entry !== '.git').sort();
    const unexpected = entries.filter((entry) => !whitelist.has(entry));
    if (unexpected.length > 0) {
        fail(`unexpected root entries: ${unexpected.join(', ')}`);
    }

    const missing = [...whitelist].filter((entry) => !fs.existsSync(path.join(tmpDir, entry)));
    if (missing.length > 0) {
        fail(`missing required root entries: ${missing.join(', ')}`);
    }

    const copiedPkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    if (copiedPkg.name !== '@letterblack/lbe-core') {
        fail(`package.json has wrong name: ${copiedPkg.name}`);
    }
    if (copiedPkg.version !== version) {
        fail(`package.json version ${copiedPkg.version} does not match expected ${version}`);
    }

    const disallowedRoots = manifest.forbiddenNpmPackedPaths
        .map((p) => p.replace(/\/$/, '').replace(/^\*\./, ''))
        .filter((p) => !whitelist.has(p) && p !== 'map' && !p.startsWith('.env'));
    for (const name of disallowedRoots) {
        if (fs.existsSync(path.join(tmpDir, name))) {
            fail(`forbidden path leaked into public repo: ${name}`);
        }
    }

    assertFileParity(tmpDir);

    console.log(`[ci-guard-public-sync] public repo clean for v${version}`);
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}
