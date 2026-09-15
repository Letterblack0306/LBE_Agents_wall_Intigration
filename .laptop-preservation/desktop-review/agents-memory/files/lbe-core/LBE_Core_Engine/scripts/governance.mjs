#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_GENERATED_PREFIXES = [
    'release-public/',
    'release-exec/',
    'dist/',
    'node_modules/',
    'npm-pack-check/',
];

const DEFAULT_IGNORED_FILES = new Set([
    'release-public/docs/RELEASE_AUTHORITY.md',
]);

const SCOPE_ONLY_FILES = new Set([
    '.governance/ISSUE_LEDGER.json',
    'docs/CHANGELOG_AGENT.md',
    'AGENT_INDEX.md',
    'docs/00_INDEX.md',
]);

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

function execGitSync(args, cwd, opts = {}) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        timeout: opts.timeout ?? GIT_TIMEOUT_MS,
        maxBuffer: opts.maxBuffer ?? GIT_MAX_BUFFER,
        windowsHide: true,
        stdio: opts.stdio,
    });
}

function repoRootFrom(startDir) {
    try {
        return execGitSync(['rev-parse', '--show-toplevel'], startDir).trim();
    } catch {
        return startDir;
    }
}

export function workspaceRootFrom(metaUrl = import.meta.url) {
    return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

function toPosix(p) {
    return p.replaceAll(path.sep, '/').replaceAll('\\', '/');
}

function normalizeWorkspacePath(file, workspaceRoot = workspaceRootFrom(), repoRoot = repoRootFrom(workspaceRoot)) {
    let clean = String(file || '').trim().replace(/^"|"$/g, '');
    if (!clean) return '';
    clean = toPosix(clean);

    const workspaceRootPosix = toPosix(path.resolve(workspaceRoot));
    const repoRootPosix = toPosix(path.resolve(repoRoot));
    const workspaceName = toPosix(path.basename(workspaceRoot));
    const workspaceMarker = `/${workspaceName}/`;
    const markerIndex = clean.indexOf(workspaceMarker);
    if (markerIndex >= 0) clean = clean.slice(markerIndex + workspaceMarker.length);
    if (clean.startsWith(`${workspaceRootPosix}/`)) clean = clean.slice(workspaceRootPosix.length + 1);
    if (clean.startsWith(`${repoRootPosix}/${workspaceName}/`)) clean = clean.slice(`${repoRootPosix}/${workspaceName}/`.length);

    const prefixed = `${workspaceName}/`;
    if (clean.startsWith(prefixed)) clean = clean.slice(prefixed.length);

    if (path.isAbsolute(file)) {
        const rel = path.relative(workspaceRoot, file);
        if (rel.startsWith('..')) return '';
        clean = toPosix(rel);
    } else {
        const repoRel = path.relative(workspaceRoot, path.resolve(repoRoot, clean));
        if (!repoRel.startsWith('..') && !path.isAbsolute(repoRel)) clean = toPosix(repoRel);
    }

    return clean.replace(/^\.\//, '');
}

function isGovernedPath(file) {
    if (!file || file.startsWith('../')) return false;
    if (DEFAULT_IGNORED_FILES.has(file)) return false;
    return !DEFAULT_GENERATED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function gitLines(args, cwd) {
    try {
        return execGitSync(args, cwd)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    } catch {
        return [];
    }
}

export function getChangedFiles({ mode = 'worktree', workspaceRoot = workspaceRootFrom() } = {}) {
    const repoRoot = repoRootFrom(workspaceRoot);
    let raw = [];
    if (mode === 'staged') {
        raw = gitLines(['diff', '--cached', '--name-only'], workspaceRoot);
    } else if (mode === 'head') {
        raw = gitLines(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], workspaceRoot);
    } else {
        raw = [
            ...gitLines(['diff', '--name-only'], workspaceRoot),
            ...gitLines(['diff', '--cached', '--name-only'], workspaceRoot),
            ...gitLines(['ls-files', '--others', '--exclude-standard'], workspaceRoot),
        ];
    }

    return [...new Set(raw
        .map((file) => normalizeWorkspacePath(file, workspaceRoot, repoRoot))
        .filter(isGovernedPath))].sort();
}

function blocker(gate, extra) {
    return { gate, ...extra };
}

export function loadIssueLedger(workspaceRoot = workspaceRootFrom()) {
    const ledgerPath = path.join(workspaceRoot, '.governance', 'ISSUE_LEDGER.json');
    if (!fs.existsSync(ledgerPath)) return { ok: false, reason: 'missing', ledgerPath };
    try {
        const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
        if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.issues)) {
            return { ok: false, reason: 'invalid', ledgerPath };
        }
        return { ok: true, ledger, ledgerPath };
    } catch (error) {
        return { ok: false, reason: 'invalid', ledgerPath, error };
    }
}

function activeIssueFrom(ledger) {
    return ledger.issues.find((issue) => issue.id === ledger.activeIssue);
}

function readLedgerAtHead(workspaceRoot) {
    try {
        const text = execGitSync(['show', 'HEAD:LBE_Core_Engine/.governance/ISSUE_LEDGER.json'], workspaceRoot, {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return JSON.parse(text);
    } catch {
        try {
            const text = execGitSync(['show', 'HEAD:.governance/ISSUE_LEDGER.json'], workspaceRoot, {
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            return JSON.parse(text);
        } catch {
            return null;
        }
    }
}

function allowedFilesExpanded(previousIssue, currentIssue) {
    if (!previousIssue || !currentIssue) return false;
    const prev = new Set(previousIssue.allowedFiles || []);
    return (currentIssue.allowedFiles || []).some((file) => !prev.has(file));
}

function validateScopeLock(changedFiles, issue, workspaceRoot) {
    if (!issue.scopeLocked || !changedFiles.includes('.governance/ISSUE_LEDGER.json')) return null;
    const previousLedger = readLedgerAtHead(workspaceRoot);
    const previousIssue = previousLedger?.issues?.find((entry) => entry.id === issue.id);
    if (!allowedFilesExpanded(previousIssue, issue)) return null;
    const onlyScopeFiles = changedFiles.every((file) => SCOPE_ONLY_FILES.has(file));
    if (onlyScopeFiles) return null;
    return blocker('ISSUE_SCOPE_LOCKED', {
        message: 'Active issue scope is locked. Scope expansion must be a separate documented change before implementation.',
    });
}

export function validateIssueScope(changedFiles, { workspaceRoot = workspaceRootFrom() } = {}) {
    const governedFiles = [...new Set(changedFiles.map((file) => normalizeWorkspacePath(file, workspaceRoot)).filter(isGovernedPath))];
    if (governedFiles.length === 0) return { ok: true, issue: null, blockers: [] };

    const loaded = loadIssueLedger(workspaceRoot);
    if (!loaded.ok && loaded.reason === 'missing') {
        return { ok: false, blockers: [blocker('ISSUE_LEDGER_MISSING', {
            message: 'Changed source files require .governance/ISSUE_LEDGER.json.',
            fix: 'Create an active issue ledger before changing governed files.',
        })] };
    }
    if (!loaded.ok) {
        return { ok: false, blockers: [blocker('ISSUE_LEDGER_INVALID', {
            message: 'Issue ledger is missing required structure or is invalid JSON.',
            fix: 'Fix .governance/ISSUE_LEDGER.json before continuing.',
        })] };
    }

    const issue = activeIssueFrom(loaded.ledger);
    if (!issue) {
        return { ok: false, blockers: [blocker('ACTIVE_ISSUE_MISSING', {
            issue: loaded.ledger.activeIssue,
            message: 'Active issue is not present in .governance/ISSUE_LEDGER.json.',
            fix: 'Set activeIssue to an existing issue entry.',
        })] };
    }

    const allowed = new Set(issue.allowedFiles || []);
    const forbidden = new Set(issue.forbiddenFiles || []);
    const blockers = [];

    for (const file of governedFiles) {
        if (forbidden.has(file)) {
            blockers.push(blocker('ISSUE_SCOPE_FORBIDDEN_FILE', {
                issue: issue.id,
                file,
                message: 'Changed file is forbidden by the active issue scope.',
                fix: 'Restore the file or create a separate approved issue.',
            }));
        } else if (!allowed.has(file)) {
            blockers.push(blocker('ISSUE_SCOPE_VIOLATION', {
                issue: issue.id,
                file,
                message: 'Changed file is outside the active issue scope.',
                fix: 'Restore the file, create a separate issue, or get explicit user approval before expanding allowedFiles.',
            }));
        }
    }

    const locked = validateScopeLock(governedFiles, issue, workspaceRoot);
    if (locked) blockers.push(locked);

    return { ok: blockers.length === 0, issue: issue.id, blockers };
}

function readTextIfExists(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function validateCoverage(changedFiles, workspaceRoot) {
    const changelog = readTextIfExists(path.join(workspaceRoot, 'docs', 'CHANGELOG_AGENT.md'));
    const index = readTextIfExists(path.join(workspaceRoot, 'AGENT_INDEX.md'));
    const blockers = [];
    for (const file of changedFiles) {
        if (!changelog.includes(file)) {
            blockers.push(blocker('CHANGELOG_COVERAGE_MISSING', {
                file,
                message: 'Changed file is missing from docs/CHANGELOG_AGENT.md.',
            }));
        }
        if (!index.includes(file)) {
            blockers.push(blocker('AGENT_INDEX_COVERAGE_MISSING', {
                file,
                message: 'Changed file is missing from AGENT_INDEX.md.',
            }));
        }
    }
    return blockers;
}

export function runGovernanceCheck({ mode = 'worktree', workspaceRoot = workspaceRootFrom() } = {}) {
    const changedFiles = getChangedFiles({ mode, workspaceRoot });
    const scope = validateIssueScope(changedFiles, { workspaceRoot });
    const blockers = [...(scope.blockers || [])];
    if (scope.ok) blockers.push(...validateCoverage(changedFiles, workspaceRoot));
    return {
        ok: blockers.length === 0,
        changedFiles,
        issue: scope.issue,
        blockers,
    };
}

function writeGeneratedIndexes(workspaceRoot) {
    const ledger = loadIssueLedger(workspaceRoot);
    const issue = ledger.ok ? activeIssueFrom(ledger.ledger) : null;
    const files = issue?.allowedFiles || [];
    const agentIndex = [
        '# Agent Index',
        '',
        'Generated by `npm run governance:index`.',
        '',
        '## Active Issue',
        '',
        issue ? `- ${issue.id}: ${issue.intent}` : '- none',
        '',
        '## Governed Files',
        '',
        ...files.map((file) => `- ${file}`),
        '',
    ].join('\n');
    fs.writeFileSync(path.join(workspaceRoot, 'AGENT_INDEX.md'), agentIndex);

    const docsIndex = [
        '# Documentation Index',
        '',
        'Generated by `npm run governance:index`.',
        '',
        '## Governance',
        '',
        '- docs/GOVERNANCE_ISSUE_SCOPE.md',
        '- docs/CHANGELOG_AGENT.md',
        '- AGENT_INDEX.md',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', '00_INDEX.md'), docsIndex);
}

function printResult(result) {
    if (result.ok) {
        console.log(`[governance] PASS: ${result.changedFiles.length} changed files allowed by active issue scope`);
        return;
    }
    console.error('[governance] BLOCKED');
    for (const item of result.blockers) console.error(JSON.stringify(item));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const command = process.argv[2] || 'check';
    const workspaceRoot = workspaceRootFrom();
    if (command === 'index') {
        writeGeneratedIndexes(workspaceRoot);
        console.log('[governance:index] wrote AGENT_INDEX.md and docs/00_INDEX.md');
        process.exit(0);
    }
    const mode = command === 'staged' ? 'staged' : command === 'head' ? 'head' : 'worktree';
    const result = runGovernanceCheck({ mode, workspaceRoot });
    printResult(result);
    process.exit(result.ok ? 0 : 1);
}
