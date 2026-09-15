#!/usr/bin/env node
// Main-head governance guard.
//
// Default rule:
// - Local source/release builds must run from the authoritative main worktree.
//
// CI exception:
// - GitHub Actions may build from pull_request refs only when the workflow
//   explicitly sets MAINHEAD_GUARD_CI_VALIDATE=1.
// - This is validation-only. It does not authorize tag, publish, or release.
//
// Release mode:
// - MAINHEAD_GUARD_RELEASE=1 still requires the checked-out commit to match
//   origin/main unless GitHub Actions is already running on main.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function env(name) {
    return process.env[name] || '';
}

function fail(message) {
    console.error(`[mainhead-guard] BLOCKED: ${message}`);
    console.error('[mainhead-guard] Only main or explicit CI validation mode may build release artifacts.');
    process.exit(1);
}

function pass(message) {
    console.log(`[mainhead-guard] PASS: ${message}`);
    process.exit(0);
}

try {
    const branch = git('branch', '--show-current');
    const releaseMode = process.argv.includes('--release') || env('MAINHEAD_GUARD_RELEASE') === '1';

    const isGitHubActions = env('GITHUB_ACTIONS') === 'true';
    const eventName = env('GITHUB_EVENT_NAME');
    const refName = env('GITHUB_REF_NAME');
    const ciValidate = env('MAINHEAD_GUARD_CI_VALIDATE') === '1';

    // Normal local/main worktree.
    if (branch === 'main') {
        // Continue to linked-worktree check below.
    } else if (isGitHubActions && eventName === 'pull_request' && ciValidate) {
        pass('GitHub Actions pull_request validation mode');
    } else if (isGitHubActions && refName === 'main' && (eventName === 'push' || eventName === 'workflow_dispatch')) {
        pass(`GitHub Actions ${eventName} on main`);
    } else if (releaseMode) {
        const head = git('rev-parse', 'HEAD');
        const mainHead = git('rev-parse', 'refs/remotes/origin/main');
        if (head !== mainHead) {
            fail(`release commit ${head} is not main HEAD ${mainHead}`);
        }
        pass('release mode at origin/main HEAD');
    } else {
        fail(`current branch is '${branch || 'detached HEAD'}', expected main`);
    }

    const gitDir = path.resolve(git('rev-parse', '--git-dir'));
    const commonDir = path.resolve(git('rev-parse', '--git-common-dir'));
    // In a linked worktree git-dir is .git/worktrees/<name>, while common-dir
    // stays at the primary repository's .git directory.
    const gitDirStat = fs.statSync(gitDir);
    const commonDirStat = fs.statSync(commonDir);
    if (gitDirStat.dev !== commonDirStat.dev || gitDirStat.ino !== commonDirStat.ino) {
        fail('linked Git worktree detected');
    }

    pass('primary local main worktree');
} catch (error) {
    if (error?.status === 1) process.exit(1);
    console.error(`[mainhead-guard] BLOCKED: unable to establish main-head authority: ${error.message}`);
    process.exit(1);
}
