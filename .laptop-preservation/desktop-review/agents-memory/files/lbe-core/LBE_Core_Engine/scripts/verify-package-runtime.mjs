#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function quoteCmdArg(arg) {
    const text = String(arg);
    if (!/[ \t"&<>|^]/.test(text)) return text;
    return `"${text.replace(/"/g, '\\"')}"`;
}

function run(command, args, options = {}) {
    if (process.platform === 'win32' && (command === 'npm' || command === 'npx')) {
        const script = [command, ...args].map(quoteCmdArg).join(' ');
        return spawnSync('cmd', ['/d', '/s', '/c', script], {
            cwd: options.cwd || root,
            encoding: 'utf8',
            env: { ...process.env, ...options.env },
        });
    }

    return spawnSync(command, args, {
        cwd: options.cwd || root,
        encoding: 'utf8',
        env: { ...process.env, ...options.env },
    });
}

function fail(message) {
    throw new Error(message);
}

function mustContain(list, expected, label) {
    for (const item of expected) {
        if (!list.includes(item)) {
            fail(`missing ${label}: ${item}`);
        }
    }
}

function mustNotContain(list, forbidden, label) {
    for (const item of forbidden) {
        if (list.some((entry) => entry.includes(item))) {
            fail(`forbidden ${label} present: ${item}`);
        }
    }
}

export async function verifyPackageRuntime() {
    const build = run(process.execPath, [path.join(root, 'scripts', 'build-package-runtime.mjs')]);
    if (build.status !== 0) {
        fail(`build-package-runtime failed:\n${build.stdout}\n${build.stderr}`);
    }

    const pack = run('npm', ['pack', '--json']);
    if (pack.status !== 0) {
        fail(`npm pack --json failed:\n${pack.stdout}\n${pack.stderr}`);
    }

    const packStdout = pack.stdout.trim();
    const packJsonText = packStdout.includes('\n[')
        ? packStdout.slice(packStdout.indexOf('\n[') + 1).trim()
        : packStdout;
    const packInfo = JSON.parse(packJsonText);
    const tarballName = packInfo?.[0]?.filename;
    if (!tarballName) fail('npm pack --json did not return a tarball filename');

    const tarballPath = path.join(root, tarballName);
    // Use npm pack's own file list instead of shelling to tar, which cannot
    // resolve Windows drive-letter paths (Z:\...) when the tar binary is POSIX.
    const packFiles = packInfo?.[0]?.files;
    if (!Array.isArray(packFiles) || packFiles.length === 0) {
        fail('npm pack --json did not return a files array');
    }
    const tarLines = packFiles.map((f) => f.path);

    mustContain(tarLines, [
        'bin/lbe.js',
        'dist/cli/lbe.js',
        'dist/hooks/register.cjs',
        'dist/state/index.cjs',
        'dist/state/appendCentral.cjs',
        'package.json',
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
    ], 'tarball content');

    mustNotContain(tarLines, ['src/core/'], 'source core path');

    const binText = fs.readFileSync(path.join(root, 'bin', 'lbe.js'), 'utf8');
    if (!binText.includes('dist/cli/lbe.js')) {
        fail('bin/lbe.js must resolve the packaged dist CLI boundary');
    }
    if (binText.includes('src/core/')) {
        fail('bin/lbe.js still exposes src/core');
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-package-runtime-'));
    try {
        const init = run('npm', ['init', '-y'], { cwd: tempRoot });
        if (init.status !== 0) {
            fail(`npm init failed:\n${init.stdout}\n${init.stderr}`);
        }

        const install = run('npm', ['install', tarballPath], { cwd: tempRoot });
        if (install.status !== 0) {
            fail(`npm install tarball failed:\n${install.stdout}\n${install.stderr}`);
        }

        const initRun = run('npx', ['lbe', 'init'], { cwd: tempRoot });
        if (initRun.status !== 0) {
            fail(`npx lbe init failed:\n${initRun.stdout}\n${initRun.stderr}`);
        }

        const statusRun = run('npx', ['lbe', 'status'], { cwd: tempRoot });
        if (statusRun.status !== 0) {
            fail(`npx lbe status failed:\n${statusRun.stdout}\n${statusRun.stderr}`);
        }

        const proofRun = run('npx', ['lbe', 'proof', '--public'], { cwd: tempRoot });
        if (proofRun.status !== 0) {
            fail(`npx lbe proof --public failed:\n${proofRun.stdout}\n${proofRun.stderr}`);
        }
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    return { tarballPath, tarLines };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    verifyPackageRuntime().then((result) => {
        console.log(JSON.stringify(result, null, 2));
    }).catch((error) => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
