import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'lbe.js');

function tempWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-cli-tui-'));
}

test('lbe with no arguments shows the logo', () => {
    const workspace = tempWorkspace();
    const result = spawnSync(process.execPath, [cli], {
        cwd: workspace,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /LetterBlack Sentinel/);
    assert.ok(result.stdout.includes('\u2550'), 'logo should contain double-line border characters');
    assert.match(result.stdout, /Local Execution Governance/);
    assert.match(result.stdout, /Non-interactive shell detected/);
    assert.equal(result.stderr, '');
});

test('help command shows usage without TUI menu', () => {
    const workspace = tempWorkspace();
    const result = spawnSync(process.execPath, [cli, 'help'], {
        cwd: workspace,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Menu options:/);
    assert.doesNotMatch(result.stdout, /Select an action:/);
});

test('version flag works', () => {
    const result = spawnSync(process.execPath, [cli, '--version'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /LBE v/);
});

test('scope command still works as direct command', () => {
    const workspace = tempWorkspace();
    const result = spawnSync(process.execPath, [cli, 'scope'], {
        cwd: workspace,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /NO_SCOPE_FOUND/);
});

test('intent command still works as direct command', () => {
    const workspace = tempWorkspace();
    const result = spawnSync(process.execPath, [cli, 'intent'], {
        cwd: workspace,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /NO_INTENT_FOUND/);
});

test('generated public CLI version flag works', () => {
    const build = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-public-sdk.mjs')], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', MAINHEAD_GUARD_CI_VALIDATE: '1' },
    });

    assert.equal(build.status, 0, build.stderr || build.stdout);

    const publicCli = path.join(repoRoot, 'release-public', 'dist', 'cli.js');
    const result = spawnSync(process.execPath, [publicCli, '--version'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '1.3.42');
    assert.equal(result.stderr, '');
});
