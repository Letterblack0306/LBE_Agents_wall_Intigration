// src/cli/tui.js — LBE Terminal UI (arrow-key navigated menu)
// Normal users see menu items from public-strings.js (single source of truth)
// Advanced CLI commands remain available for CI/automation.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { renderHeader, RED, RED_BG, WHITE, BOLD, DIM, RESET } from './logo.js';
import { MENU_ITEMS } from './public-strings.js';
import * as F from './tui-flows.js';

const YELLOW = '\x1b[38;2;240;200;60m';
const GREEN = '\x1b[38;2;80;200;120m';
const CYAN = '\x1b[38;2;100;200;255m';
const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';

F.setColors(GREEN, YELLOW, CYAN, RED, BOLD, DIM, WHITE, RESET);

function line(t) { process.stdout.write((t || '') + '\n'); }
function cls() { process.stdout.write('\x1b[2J\x1b[H'); }

function policyMode(r) {
    const p = path.join(r, '.lbe', 'policy.json');
    if (!fs.existsSync(p)) return 'not initialized';
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).mode || 'unknown'; }
    catch { return 'unreadable'; }
}
function proofState(r) {
    const p = path.join(r, '.lbe', 'proof', 'latest.json');
    if (!fs.existsSync(p)) return undefined;
    try { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return d.status || d.result || undefined; }
    catch { return undefined; }
}
function isBA(r) { return fs.existsSync(path.join(r, '.lbe', 'policy.json')); }
function hasAI(r) { return fs.existsSync(path.join(r, '.lbe', 'AGENT_CONTRACT.md')); }
function hasAL(r) { return fs.existsSync(path.join(r, '.lbe', 'audit.jsonl')); }
function hasCI(r) {
    const p = path.join(r, '.lbe', 'agent-instructions.json');
    if (!fs.existsSync(p)) return false;
    try { const c = JSON.parse(fs.readFileSync(p, 'utf8')); return !!c.customInstructionFile && fs.existsSync(path.resolve(r, c.customInstructionFile)); }
    catch { return false; }
}
function lPR(r) { const p = proofState(r); return p || 'none'; }

// ─── Raw terminal helpers ──────────────────────────────────────────────────────

function enableRaw() {
    if (!process.stdin.isTTY) return false;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    return true;
}
function disableRaw() {
    // eslint-disable-next-line no-empty
    try { process.stdin.setRawMode(false); } catch (_) {}
    process.stdin.pause();
}
function readKey() {
    return new Promise(resolve => {
        const fn = data => { process.stdin.removeListener('data', fn); resolve(data); };
        process.stdin.on('data', fn);
    });
}
function pressEnter() {
    return new Promise(resolve => {
        if (!process.stdin.isTTY) { resolve(); return; }
        process.stdout.write('  ' + DIM + 'Press Enter to continue...' + RESET);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('', () => { rl.close(); resolve(); });
    });
}

// ─── Arrow-key menu ───────────────────────────────────────────────────────────

async function renderMenu(items, startIdx) {
    if (!process.stdin.isTTY) return -1;
    enableRaw();
    let sel = startIdx || 0;
    const n = items.length;

    function draw() {
        for (let i = 0; i < n; i++) {
            const isExit = (items[i] === 'Exit');
            if (i === sel) {
                // Active item: red background, dark text, ❯ prefix
                process.stdout.write(' ' + RED_BG + '❯ ' + items[i] + ' ' + RESET + '\n');
            } else if (isExit) {
                // Exit always dim
                process.stdout.write('   ' + DIM + items[i] + RESET + '\n');
            } else {
                process.stdout.write('   ' + DIM + items[i] + RESET + '\n');
            }
        }
    }

    process.stdout.write('\n'); draw();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const k = await readKey();
        if (k === '\x1b[A' || k === 'k') { sel = (sel - 1 + n) % n; process.stdout.write('\x1b[' + n + 'A'); draw(); }
        else if (k === '\x1b[B' || k === 'j') { sel = (sel + 1) % n; process.stdout.write('\x1b[' + n + 'A'); draw(); }
        else if (k === '\r' || k === '\n') {
            disableRaw(); process.stdout.write('\x1b[' + n + 'A');
            for (let i = 0; i < n; i++) process.stdout.write('\x1b[2K\r');
            process.stdout.write('\n'); return sel;
        } else if (k === '\x1b' || k === 'q') {
            disableRaw(); process.stdout.write('\x1b[' + n + 'A');
            for (let i = 0; i < n; i++) process.stdout.write('\x1b[2K\r');
            process.stdout.write('\n'); return -1;
        }
    }
}

// ─── Text prompts ─────────────────────────────────────────────────────────────

function promptInput(q, def) {
    return new Promise(r => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('  ' + CYAN + '?' + RESET + ' ' + BOLD + q + RESET + ' ', a => { rl.close(); r(a.trim() || (def || '')); });
    });
}
function promptConfirm(q, defYes) {
    const d = defYes !== false;
    return new Promise(r => {
        const h = d ? 'Y/n' : 'y/N';
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('  ' + CYAN + '?' + RESET + ' ' + BOLD + q + RESET + ' ' + DIM + '(' + h + ')' + RESET + ' ', a => {
            rl.close();
            const x = a.trim().toLowerCase();
            if (x === '') r(d);
            else r(x === 'y' || x === 'yes');
        });
    });
}

// ─── Branded header ────────────────────────────────────────────────────────────

function showHeader(opts) {
    cls();
    renderHeader(opts).forEach(l => line(l));
    line('');
    const mode = policyMode(opts.root);
    const b = isBA(opts.root);
    // Clean status area matching mockup
    line('  ' + DIM + 'Workspace' + RESET + ' : ' + WHITE + opts.root + RESET);
    if (b) {
        line('  ' + DIM + 'Boundary' + RESET + '  : ' + GREEN + mode + RESET);
    } else {
        line('  ' + DIM + 'Boundary' + RESET + '  : ' + YELLOW + 'Not Applied' + RESET);
    }
    line('');
}

// ─── Workspace Detection ───────────────────────────────────────────────────────

async function resolveWorkspace(version, defRoot) {
    cls();
    renderHeader({ version }).forEach(l => line(l));
    line('');
    line('  ' + BOLD + WHITE + 'Workspace Detection' + RESET);
    line('  ' + DIM + '─────────────────────────────────────────────────────' + RESET);
    line('');
    line('  Current directory: ' + CYAN + defRoot + RESET);
    line(isBA(defRoot) ? '  ' + GREEN + '\u2713' + RESET + ' Boundary ' + policyMode(defRoot) : '  ' + YELLOW + '\u25CB' + RESET + ' No boundary applied yet');
    line('');
    if (!await promptConfirm('Is this your workspace?', true)) {
        line('');
        const cp = await promptInput('Enter workspace path (type or paste path)');
        const r = path.resolve(cp || defRoot);
        if (!fs.existsSync(r)) {
            line('  ' + RED + '\u2716' + RESET + ' Path does not exist: ' + r);
            line('  ' + DIM + 'Falling back to current directory.' + RESET);
            line(''); await pressEnter(); return defRoot;
        }
        line('  ' + GREEN + '\u2713' + RESET + ' Workspace set to: ' + CYAN + r + RESET);
        line(''); await pressEnter(); return r;
    }
    line('  ' + GREEN + '\u2713' + RESET + ' Using current workspace.');
    line(''); await pressEnter(); return defRoot;
}

// ─── Main Menu ─────────────────────────────────────────────────────────────────

// MENU_ITEMS imported from public-strings.js — single source of truth

async function mainMenu(version, root) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        showHeader({ version, root });
        line('  ' + BOLD + WHITE + 'LBE Menu' + RESET);
        line('  ' + DIM + '─────────────────────────────────────────────────────' + RESET);
        line('');
        line('  ' + DIM + 'Use arrows, Enter to select, Esc/q to quit' + RESET);
        line('');
        const c = await renderMenu(MENU_ITEMS);
        if (c < 0) { line('  ' + DIM + 'Exiting...' + RESET + '\n'); return { status: 'TUI_EXIT' }; }
        line('');
        const flows = [F.applyBoundary, F.removeBoundary, F.checkStatus, F.auditWorkspace, F.agentInstructionsFlow];
        if (c < 5) await flows[c](version, root);
        else { line('  ' + DIM + 'Exiting...' + RESET + '\n'); return { status: 'TUI_EXIT' }; }
    }
}

// ─── Set helpers for flows module ─────────────────────────────────────────────

F.setHelpers({ line, promptConfirm, promptInput, pressEnter, showHeader, renderMenu, policyMode, isBA, hasAL, hasAI, hasCI, lPR });

// ─── Public entrypoint ─────────────────────────────────────────────────────────
export async function runTui({ version, root = process.cwd() } = {}) {
    if (!process.stdin.isTTY) {
        renderHeader({ version }).forEach(l => line(l));
        line('');
        line('  ' + YELLOW + 'Non-interactive shell detected.' + RESET);
        line('  ' + YELLOW + 'Use: lbe <command>' + RESET);
        line('  ' + YELLOW + 'Run: lbe help' + RESET);
        line('');
        return { status: 'TUI_NON_INTERACTIVE' };
    }

    process.stdout.write(HIDE);
    try {
        const r = await resolveWorkspace(version, root);
        return await mainMenu(version, r);
    } finally {
        process.stdout.write(SHOW);
        disableRaw();
    }
}
