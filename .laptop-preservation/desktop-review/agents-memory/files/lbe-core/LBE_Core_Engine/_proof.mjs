// Proof matrix for LBE preload hook
// Run with: node _proof.mjs
// All tests use isolated temp dirs. No shared state.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(ROOT, 'src', 'hooks', 'register.cjs');
const HOOK_FWD = HOOK.replace(/\\/g, '/');

let passed = 0, failed = 0;

function result(name, ok, detail = '') {
    const mark = ok ? '✓' : '✗';
    console.log(`  ${mark}  ${name}${detail ? '  — ' + detail : ''}`);
    if (ok) passed++; else failed++;
}

function tmpDir(policy = null) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-proof-'));
    fs.mkdirSync(path.join(d, '.lbe'), { recursive: true });
    fs.writeFileSync(path.join(d, '.lbe', 'policy.json'),
        JSON.stringify(policy || { version: 1, mode: 'observe', workspace: d, rules: [] }));
    return d;
}

function runNode(dir, code, mode = 'observe') {
    return spawnSync(process.execPath, ['-e', code], {
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_OPTIONS: `--require "${HOOK_FWD}"`,
            LBE_ROOT: dir,
            LBE_MODE: mode,
        },
        cwd: dir,
    });
}

function auditEntries(dir) {
    const f = path.join(dir, '.lbe', 'events.jsonl');
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

// ── 1. fs.writeFile (callback) ──────────────────────────────────────────────
{
    const dir = tmpDir();
    const r = runNode(dir, `
        const fs = require('fs');
        fs.writeFile('out.txt', 'hello', err => { if (err) process.exit(1); });
    `);
    const entries = auditEntries(dir);
    const wrote = fs.existsSync(path.join(dir, 'out.txt'));
    const logged = entries.some(e => e.action === 'file_write');
    result('fs.writeFile', wrote && logged && r.status === 0,
        wrote ? (logged ? 'file written + logged' : 'file written, NOT logged') : 'file not written');
}

// ── 2. fs.promises.writeFile ────────────────────────────────────────────────
{
    const dir = tmpDir();
    const r = runNode(dir, `
        const fs = require('fs');
        (async () => {
            await fs.promises.writeFile('out2.txt', 'async');
        })().catch(() => process.exit(1));
    `);
    // Give async time to flush
    const entries = auditEntries(dir);
    const wrote = fs.existsSync(path.join(dir, 'out2.txt'));
    const logged = entries.some(e => e.action === 'file_write');
    result('fs.promises.writeFile', wrote && logged && r.status === 0,
        wrote ? (logged ? 'file written + logged' : 'file written, NOT logged') : 'file not written');
}

// ── 3. fs.rm ────────────────────────────────────────────────────────────────
{
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'del.txt'), 'x');
    const r = runNode(dir, `
        const fs = require('fs');
        fs.rm('del.txt', err => { if (err) process.exit(1); });
    `);
    const entries = auditEntries(dir);
    const deleted = !fs.existsSync(path.join(dir, 'del.txt'));
    const logged = entries.some(e => e.action === 'file_delete');
    result('fs.rm', deleted && logged && r.status === 0,
        deleted ? (logged ? 'file deleted + logged' : 'file deleted, NOT logged') : 'file not deleted');
}

// ── 4. fs.rename ────────────────────────────────────────────────────────────
{
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    const r = runNode(dir, `
        const fs = require('fs');
        fs.rename('a.txt', 'b.txt', err => { if (err) process.exit(1); });
    `);
    const entries = auditEntries(dir);
    const renamed = !fs.existsSync(path.join(dir, 'a.txt')) && fs.existsSync(path.join(dir, 'b.txt'));
    const logged = entries.some(e => e.action === 'file_rename');
    result('fs.rename', renamed && logged && r.status === 0,
        renamed ? (logged ? 'renamed + logged' : 'renamed, NOT logged') : 'rename failed');
}

// ── 5. child_process.spawn ──────────────────────────────────────────────────
{
    const dir = tmpDir();
    const r = runNode(dir, `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, ['--version']);
        let out = '';
        child.stdout.on('data', d => out += d);
        child.on('close', code => {
            if (code !== 0) process.exit(1);
        });
    `);
    const entries = auditEntries(dir);
    const logged = entries.some(e => e.action === 'run_shell');
    result('spawn', r.status === 0 && logged,
        logged ? 'spawn logged' : 'spawn NOT logged');
}

// ── 6. child_process.exec ───────────────────────────────────────────────────
{
    const dir = tmpDir();
    // execSync is synchronous — quote path for Windows spaces
    const r = runNode(dir, `
        const { execSync } = require('child_process');
        execSync('"' + process.execPath + '" --version');
    `);
    const entries = auditEntries(dir);
    const logged = entries.some(e => e.action === 'run_shell');
    result('exec / execSync', r.status === 0 && logged,
        logged ? 'execSync logged' : 'execSync NOT logged');
}

// ── 7. observe mode — writes still execute ──────────────────────────────────
{
    const dir = tmpDir();
    const r = runNode(dir, `
        require('fs').writeFileSync('observe.txt', 'x');
    `, 'observe');
    const entries = auditEntries(dir);
    const wrote = fs.existsSync(path.join(dir, 'observe.txt'));
    const e = entries.find(e => e.action === 'file_write');
    const enforced = e && e.enforced === false;
    result('observe mode (write executes)', wrote && enforced,
        wrote ? (enforced ? 'executed=true, enforced=false' : 'wrong enforced flag') : 'file not written');
}

// ── 8. enforce mode — deny rule blocks write ─────────────────────────────────
{
    const dir = tmpDir();
    // Overwrite policy with deny-all enforce rule
    fs.writeFileSync(path.join(dir, '.lbe', 'policy.json'), JSON.stringify({
        version: 1, mode: 'enforce', workspace: dir,
        rules: [{ id: 'r1', effect: 'deny', type: 'path', pattern: '**', from: 'test' }]
    }));
    const r = runNode(dir, `
        try { require('fs').writeFileSync('blocked.txt', 'x'); }
        catch(e) { /* expected */ }
    `, 'enforce');
    const entries = auditEntries(dir);
    const notWritten = !fs.existsSync(path.join(dir, 'blocked.txt'));
    const e = entries.find(e => e.decision === 'deny');
    result('enforce mode (deny blocks)', notWritten && !!e,
        notWritten ? (e ? 'blocked + logged' : 'blocked, NOT logged') : 'file was written (not blocked)');
}

// ── 9. no recursion — one write = one audit entry ───────────────────────────
{
    const dir = tmpDir();
    const r = runNode(dir, `
        require('fs').writeFileSync('single.txt', 'x');
    `);
    const entries = auditEntries(dir).filter(e => e.action === 'file_write' && e.path && e.path.endsWith('single.txt'));
    result('no recursion', entries.length === 1,
        `${entries.length} audit entries for 1 writeFileSync (expected 1)`);
}

// ── 10. status PID detection ────────────────────────────────────────────────
{
    const dir = tmpDir();
    // Start a background node process with the hook
    const child = spawn(process.execPath, ['-e', `
        // keep alive for 3 seconds
        setTimeout(() => {}, 3000);
    `], {
        env: { ...process.env, NODE_OPTIONS: `--require "${HOOK_FWD}"`, LBE_ROOT: dir, LBE_MODE: 'observe' },
        cwd: dir,
        stdio: 'ignore',
        detached: false,
    });

    // Wait briefly for hook to write status file
    await new Promise(r => setTimeout(r, 800));

    const statusFile = path.join(dir, '.lbe', 'runtime', 'hook-status.json');
    let pidAlive = false;
    let statusOk = false;
    if (fs.existsSync(statusFile)) {
        const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        statusOk = true;
        try { process.kill(s.pid, 0); pidAlive = true; } catch (_) {}
    }

    result('status PID (alive)', statusOk && pidAlive,
        statusOk ? (pidAlive ? `PID ${JSON.parse(fs.readFileSync(statusFile,'utf8')).pid} alive` : 'PID dead') : 'hook-status.json missing');

    child.kill();
    await new Promise(r => setTimeout(r, 300));

    // After kill, PID should be gone
    let pidGone = false;
    if (fs.existsSync(statusFile)) {
        const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        try { process.kill(s.pid, 0); } catch (_) { pidGone = true; }
    }
    result('status PID (stale after kill)', statusOk && pidGone,
        pidGone ? 'PID correctly gone' : 'PID still appears alive');
}

// ── 11. clean workspace ──────────────────────────────────────────────────────
{
    const dir = tmpDir();
    runNode(dir, `require('fs').writeFileSync('x.txt','x');`);

    const rootFiles = fs.readdirSync(dir);
    const lbeFiles = fs.existsSync(path.join(dir, '.lbe')) ? fs.readdirSync(path.join(dir, '.lbe')) : [];
    const badRootFiles = rootFiles.filter(f =>
        f !== '.lbe' && f !== 'x.txt' &&
        (f.startsWith('lbe') || f === 'CLAUDE.md' || f.startsWith('_lbe'))
    );
    result('clean workspace', badRootFiles.length === 0,
        badRootFiles.length ? 'unexpected root files: ' + badRootFiles.join(', ') : 'no LBE pollution in root');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests  ✓ ${passed} passed  ${failed > 0 ? '✗ ' + failed + ' failed' : ''}`);
if (failed > 0) process.exit(1);
