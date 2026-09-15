#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateIssueScope, runGovernanceCheck } from './governance.mjs';

function makeTempWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-issue-scope-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Issue Scope Test'], { cwd: dir });
    fs.mkdirSync(path.join(dir, '.governance'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'CHANGELOG_AGENT.md'), 'src/allowed.js\nAGENT_INDEX.md\n');
    fs.writeFileSync(path.join(dir, 'AGENT_INDEX.md'), 'src/allowed.js\nAGENT_INDEX.md\n');
    return dir;
}

function writeLedger(dir, overrides = {}) {
    const issue = {
        id: 'ISSUE-1',
        status: 'IN_PROGRESS',
        intent: 'test issue',
        scopeLocked: false,
        allowedFiles: ['src/allowed.js', 'AGENT_INDEX.md', 'docs/CHANGELOG_AGENT.md'],
        forbiddenFiles: [],
        ...overrides.issue,
    };
    const ledger = {
        version: 1,
        activeIssue: 'ISSUE-1',
        issues: [issue],
        ...overrides.ledger,
    };
    fs.writeFileSync(path.join(dir, '.governance', 'ISSUE_LEDGER.json'), JSON.stringify(ledger, null, 2));
}

function gates(result) {
    return new Set((result.blockers || []).map((item) => item.gate));
}

function commitAll(dir) {
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: dir, stdio: 'ignore' });
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir);
    assert.equal(validateIssueScope(['src/allowed.js'], { workspaceRoot: dir }).ok, true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir);
    assert.equal(validateIssueScope(['AGENT_INDEX.md'], { workspaceRoot: dir }).ok, true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir);
    const result = validateIssueScope(['src/outside.js'], { workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_SCOPE_VIOLATION'), true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir, { issue: { forbiddenFiles: ['src/blocked.js'] } });
    const result = validateIssueScope(['src/blocked.js'], { workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_SCOPE_FORBIDDEN_FILE'), true);
}

{
    const dir = makeTempWorkspace();
    const result = validateIssueScope(['src/allowed.js'], { workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_LEDGER_MISSING'), true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir, { ledger: { activeIssue: 'ISSUE-MISSING' } });
    const result = validateIssueScope(['src/allowed.js'], { workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ACTIVE_ISSUE_MISSING'), true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir);
    fs.writeFileSync(path.join(dir, 'docs', 'CHANGELOG_AGENT.md'), 'src/unrelated.js\n');
    fs.writeFileSync(path.join(dir, 'AGENT_INDEX.md'), 'src/unrelated.js\n');
    fs.writeFileSync(path.join(dir, 'src', 'unrelated.js'), 'x\n');
    const result = runGovernanceCheck({ workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_SCOPE_VIOLATION'), true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir);
    commitAll(dir);
    fs.writeFileSync(path.join(dir, 'src', 'outside.js'), 'x\n');
    execFileSync('git', ['add', 'src/outside.js'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'outside'], { cwd: dir, stdio: 'ignore' });
    const result = runGovernanceCheck({ mode: 'head', workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_SCOPE_VIOLATION'), true);
}

{
    const dir = makeTempWorkspace();
    writeLedger(dir, { issue: { scopeLocked: true } });
    commitAll(dir);
    writeLedger(dir, { issue: { scopeLocked: true, allowedFiles: ['src/allowed.js', 'src/new.js', 'AGENT_INDEX.md', 'docs/CHANGELOG_AGENT.md'] } });
    fs.writeFileSync(path.join(dir, 'src', 'allowed.js'), 'x\n');
    const result = runGovernanceCheck({ workspaceRoot: dir });
    assert.equal(result.ok, false);
    assert.equal(gates(result).has('ISSUE_SCOPE_LOCKED'), true);
}

console.log('issue scope gate tests passed');
