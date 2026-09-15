#!/usr/bin/env node
/**
 * Full release pipeline:
 *  1. mainhead-guard (blocks non-main worktrees/branches)
 *  2. Build both packages
 *  3. Check both artifacts
 *  4. npm publish the public release package + @letterblack/lbe-exec
 *  5. Push release-public/ contents to public LetterBlack-Sentinel repo
 *  6. git tag + push
 */
import { spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const CHILD_TIMEOUT_MS = 120_000;
const CHILD_MAX_BUFFER = 20 * 1024 * 1024;

// node scripts must NOT use shell:true — paths with spaces (C:\Program Files\...)
// get split by cmd.exe. shell:true is only needed for npm/git (.cmd wrappers on Windows).
function runNode(scriptPath, args = [], opts = {}) {
    const r = spawnSync(process.execPath, [scriptPath, ...args], {
        stdio: 'inherit',
        timeout: opts.timeout ?? CHILD_TIMEOUT_MS,
        windowsHide: true,
        ...opts,
    });
    if (r.status !== 0) {
        console.error(`\n[publish] FAILED: node ${scriptPath}`);
        process.exit(r.status ?? 1);
    }
}

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        stdio: 'inherit',
        shell: isWindows,   // npm/git are .cmd files on Windows — needs shell:true
        timeout: opts.timeout ?? CHILD_TIMEOUT_MS,
        windowsHide: true,
        ...opts,
    });
    if (r.status !== 0) {
        console.error(`\n[publish] FAILED: ${cmd} ${args.join(' ')}`);
        process.exit(r.status ?? 1);
    }
}

function runOut(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        encoding: 'utf8',
        shell: isWindows,
        timeout: opts.timeout ?? CHILD_TIMEOUT_MS,
        maxBuffer: opts.maxBuffer ?? CHILD_MAX_BUFFER,
        windowsHide: true,
        ...opts,
    });
    if (r.status !== 0) {
        console.error(`\n[publish] FAILED: ${cmd} ${args.join(' ')}\n${r.stderr}`);
        process.exit(r.status ?? 1);
    }
    return r.stdout.trim();
}

// ── 1. Guard ─────────────────────────────────────────────────────────────────
{
    const guardPath = fileURLToPath(new URL('./mainhead-guard.mjs', import.meta.url));
    runNode(guardPath);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// Block publishing the raw core package — only release-public/ and release-exec/ may publish
{
    const ALLOWED_PUBLISH_NAMES = ['@letterblack/lbe-core', '@letterblack/lbe-exec'];
    const sdkPkg  = JSON.parse(fs.readFileSync(path.join(root, 'release-public', 'package.json'), 'utf8'));
    const execPkg = JSON.parse(fs.readFileSync(path.join(root, 'release-exec',   'package.json'), 'utf8'));
    for (const p of [sdkPkg, execPkg]) {
        if (!ALLOWED_PUBLISH_NAMES.includes(p.name)) {
            console.error(`[publish] BLOCKED: unexpected package name "${p.name}" — only ${ALLOWED_PUBLISH_NAMES.join(', ')} may be published`);
            process.exit(1);
        }
        if (p.private) {
            console.error(`[publish] BLOCKED: "${p.name}" is marked private — refusing to publish`);
            process.exit(1);
        }
    }
    if (pkg.private !== true) {
        console.error(`[publish] BLOCKED: root package.json must have "private": true to prevent accidental core publish`);
        process.exit(1);
    }
}
console.log(`\n[publish] releasing v${version}\n`);

// ── 2. Build ──────────────────────────────────────────────────────────────────
runNode(path.join(__dirname, 'build-public-sdk.mjs'));
runNode(path.join(__dirname, 'build-public-exec.mjs'));

// ── 3. Check ──────────────────────────────────────────────────────────────────
runNode(path.join(__dirname, 'check-public-artifact.mjs'));
runNode(path.join(__dirname, 'check-public-exec.mjs'));

// ── 4. npm publish ────────────────────────────────────────────────────────────
console.log('\n[publish] publishing to npm…');
run('npm', ['publish', '--access', 'public'], { cwd: path.join(root, 'release-public') });
run('npm', ['publish', '--access', 'public'], { cwd: path.join(root, 'release-exec') });
console.log('[publish] npm done');

// ── 5. Push release-public/ to public LetterBlack-Sentinel repo ───────────────
console.log('\n[publish] syncing to public GitHub repo…');
runNode(path.join(__dirname, 'ci-sync-public.mjs'));

// ── 6. Tag in private repo ────────────────────────────────────────────────────
console.log('\n[publish] tagging…');
run('git', ['tag', `v${version}`], { cwd: root });
run('git', ['push', 'origin', `v${version}`], { cwd: root });

console.log(`\n[publish] v${version} released ✓`);
console.log(`  npm:    https://www.npmjs.com/package/@letterblack/lbe-core`);
console.log(`  npm:    https://www.npmjs.com/package/@letterblack/lbe-exec`);
console.log(`  github: https://github.com/Letterblack0306/LetterBlack-Sentinel`);
