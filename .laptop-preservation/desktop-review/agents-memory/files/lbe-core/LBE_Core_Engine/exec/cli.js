#!/usr/bin/env node
// CLI for @letterblack/lbe-exec
import fs from 'fs';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { initCommand } from '../src/cli/commands/init.js';
import { policyModeCommand } from '../src/cli/commands/policyMode.js';

const [, , cmd, ...rest] = process.argv;
const opts = Object.fromEntries(
    rest.flatMap((v, i, a) => v.startsWith('--') ? [[v.slice(2), a[i + 1] ?? true]] : [])
);
const positional = rest.filter(v => !v.startsWith('--') && rest[rest.indexOf(v) - 1]?.startsWith('--') === false);

const __dir = path.dirname(fileURLToPath(import.meta.url));

function loadPolicy() {
    const cwd = process.cwd();
    // .lbe/policy.json is canonical; fall back to legacy lbe.policy.json in root.
    const p = fs.existsSync(path.join(cwd, '.lbe', 'policy.json'))
        ? path.join(cwd, '.lbe', 'policy.json')
        : path.join(cwd, 'lbe.policy.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function countAudit() {
    const p = path.join(process.cwd(), '.lbe', 'audit.jsonl');
    if (!fs.existsSync(p)) return 0;
    return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length;
}

function findHookPath() {
    return path.resolve(__dir, '../hooks/register.cjs');
}

// ── init helpers — non-destructive script injection ──────────────────────────

function detectNodeScripts(scripts) {
    const pattern = /(?:^|\s)node\s+(\S+)/;
    return Object.entries(scripts || {}).filter(([name, cmd]) => {
        if (name.includes(':lbe') || name.startsWith('lbe')) return false;
        return pattern.test(cmd);
    });
}

function extractNodeArgs(cmd) {
    const match = cmd.match(/(?:^|\s)node\s+(.+)/);
    return match ? match[1].trim() : null;
}

function injectScripts(wrapScript) {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) return [];
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const added = [];

    if (wrapScript) {
        // --wrap <name>: destructive rewrite of that one script
        const original = scripts[wrapScript];
        if (!original) { console.error(`No script named "${wrapScript}" found.`); return []; }
        const args = extractNodeArgs(original);
        if (!args) { console.error(`Script "${wrapScript}" does not look like a node script.`); return []; }
        scripts[wrapScript] = `lbe-exec run-node --mode observe ${args}`;
        added.push(wrapScript);
    } else {
        // Non-destructive: add :lbe variants alongside each node script
        const candidates = detectNodeScripts(scripts);
        for (const [name, scriptCmd] of candidates) {
            const args = extractNodeArgs(scriptCmd);
            if (!args) continue;
            const lbeName = name + ':lbe';
            const lbeEnforceName = name + ':lbe:enforce';
            if (!scripts[lbeName]) {
                scripts[lbeName] = `lbe-exec run-node --mode observe ${args}`;
                added.push(lbeName);
            }
            if (!scripts[lbeEnforceName]) {
                scripts[lbeEnforceName] = `lbe-exec run-node --mode enforce ${args}`;
                added.push(lbeEnforceName);
            }
        }
    }

    // Always add lbe:status and lbe:audit if not present
    if (!scripts['lbe:status']) { scripts['lbe:status'] = 'lbe-exec status'; added.push('lbe:status'); }
    if (!scripts['lbe:audit'])  { scripts['lbe:audit']  = 'lbe-exec audit';  added.push('lbe:audit'); }

    if (added.length) {
        pkg.scripts = scripts;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        for (const s of added) console.log(`  added: ${s}`);
    }
    return added;
}

// ── Commands ──────────────────────────────────────────────────────────────────

switch (cmd) {

    case 'run-node': {
        // npx lbe-exec run-node [--mode observe|enforce] ./agent.js [...scriptArgs]
        const mode = opts.mode || 'observe';
        if (!['observe', 'enforce'].includes(mode)) {
            console.error('--mode must be observe or enforce'); process.exit(1);
        }
        // Find the first non-flag positional argument as the script
        const scriptIdx = rest.findIndex((v, i) => !v.startsWith('--') && (i === 0 || !rest[i - 1].startsWith('--')));
        if (scriptIdx === -1) {
            console.error('Usage: lbe-exec run-node [--mode observe|enforce] <script> [...args]'); process.exit(1);
        }
        const scriptAndArgs = rest.slice(scriptIdx);
        const hookPath = findHookPath();
        if (!fs.existsSync(hookPath)) {
            console.error('Hook not found: ' + hookPath + '\nRun: npm install @letterblack/lbe-exec'); process.exit(1);
        }
        const child = spawn(process.execPath, ['--require', hookPath, ...scriptAndArgs], {
            stdio: 'inherit',
            env: { ...process.env, LBE_MODE: mode, LBE_ROOT: process.cwd() },
        });
        child.on('close', code => process.exit(code ?? 0));
        break;
    }

    case 'npm': {
        // npx lbe-exec npm <...args>  — sets NODE_OPTIONS for hook preload
        console.error('[lbe] Note: Use "lbe-exec run-node" for reliable hook preload.');
        console.error('[lbe] NODE_OPTIONS --require may not fire for all npm lifecycle hooks.\n');
        const hookPath = findHookPath();
        if (!fs.existsSync(hookPath)) {
            console.error('Hook not found: ' + hookPath); process.exit(1);
        }
        const existing = process.env.NODE_OPTIONS || '';
        // Forward slashes: NODE_OPTIONS parser treats backslashes as escapes.
        const hookPathFwd = hookPath.replace(/\\/g, '/');
        const hookFlag = '--require "' + hookPathFwd + '"';
        const nodeOptions = existing.includes(hookPathFwd) ? existing : (existing + ' ' + hookFlag).trim();
        const npmArgs = rest.filter(v => !v.startsWith('--mode') && v !== opts.mode);
        const child = spawn('npm', npmArgs, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, NODE_OPTIONS: nodeOptions, LBE_MODE: opts.mode || 'observe', LBE_ROOT: process.cwd() },
        });
        child.on('close', code => process.exit(code ?? 0));
        break;
    }

    case 'status': {
        const root = process.cwd();
        console.log('── LBE Status ───────────────────────────────────');
        console.log('workspace:   ' + root);

        // 1. Hook file path
        const hookPath = findHookPath();
        console.log('hook file:   ' + hookPath + (fs.existsSync(hookPath) ? ' (found)' : ' (MISSING)'));

        // 2. LBE_ROOT from env (set when running inside lbe-exec shell)
        const lbeRoot = process.env.LBE_ROOT || '';
        console.log('LBE_ROOT:    ' + (lbeRoot || '(not set)'));

        // 3. NODE_OPTIONS contains hook
        const nodeOpts = process.env.NODE_OPTIONS || '';
        const hookInPath = nodeOpts.includes('register.cjs');
        console.log('NODE_OPTIONS contains hook: ' + (hookInPath ? 'yes' : 'no'));

        // 4. Audit log
        const eventsFile = path.join(root, '.lbe', 'events.jsonl');
        const auditExists = fs.existsSync(eventsFile);
        console.log('audit log:   ' + (auditExists ? eventsFile : '(none yet)'));

        // 5. Last audit event
        if (auditExists) {
            try {
                const lines = fs.readFileSync(eventsFile, 'utf8').split('\n').filter(l => l.trim());
                if (lines.length) {
                    const last = JSON.parse(lines[lines.length - 1]);
                    const ts = new Date((last.ts || 0) * 1000).toISOString().replace('T', ' ').slice(0, 19);
                    const target = last.path || last.cmd || '?';
                    console.log('last event:  ' + ts + '  ' + last.action + '  ' + target +
                        '  → ' + (last.decision || '?'));
                } else {
                    console.log('last event:  (none)');
                }
            } catch (_) { console.log('last event:  (unreadable)'); }
        }

        // 6. Hook process status (from hook-status.json written by register.cjs)
        const statusFile = path.join(root, '.lbe', 'runtime', 'hook-status.json');
        if (fs.existsSync(statusFile)) {
            let h;
            try { h = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch (_) {}
            if (h) {
                let pidAlive = false;
                try { process.kill(h.pid, 0); pidAlive = true; } catch (_) {}
                console.log('\nhook process: ' + (pidAlive ? 'ACTIVE' : 'stale (process exited)'));
                console.log('hook pid:     ' + h.pid + (pidAlive ? ' (alive)' : ' (gone)'));
                console.log('hook mode:    ' + h.mode);
                console.log('hook started: ' + h.started_at);
                if (h.patched) {
                    console.log('\nPatched functions:');
                    for (const [fn, active] of Object.entries(h.patched)) {
                        console.log('  ' + (active ? '✓' : '–') + ' ' + fn);
                    }
                }
            }
        } else {
            console.log('\nhook process: inactive — run: lbe-exec run-node ./agent.js');
            console.log('              or: lbe-exec activate  then  lbe-exec shell');
        }
        break;
    }

    case 'audit': {
        const eventsPath = path.join(process.cwd(), '.lbe', 'events.jsonl');
        if (!fs.existsSync(eventsPath)) {
            console.log('No events log found. Run an agent with: npx lbe-exec run-node ./agent.js');
            break;
        }
        const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(l => l.trim());
        if (!lines.length) { console.log('No events recorded yet.'); break; }
        console.log('── LBE Event Log (' + lines.length + ' entries) ──────────────────');
        for (const line of lines) {
            try {
                const e = JSON.parse(line);
                const ts = new Date(e.ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
                const target = e.path || e.cmd || '?';
                const status = e.enforced && e.decision === 'deny' ? 'BLOCKED' :
                               e.decision === 'deny' ? 'WOULD-BLOCK' : 'allowed';
                console.log(`${ts}  [${e.mode}] ${e.action}  ${target}  → ${status}`);
            } catch (_) { /* skip malformed lines */ }
        }
        break;
    }

    case 'init':
        initCommand(opts)
            .then(() => {
                // Inject :lbe script variants after normal init
                const added = injectScripts(opts.wrap || null);
                if (added.length) {
                    console.log('\n✓ Added LBE script variants to package.json');
                    console.log('  Run your agent through LBE:  npm run <name>:lbe');
                } else {
                    console.log('\nNo node agent scripts detected in package.json.');
                    console.log('Use: npx lbe-exec run-node [--mode observe|enforce] ./your-agent.js');
                }
            })
            .catch(e => { console.error(e.message); process.exit(1); });
        break;

    case 'activate': {
        // Write workspace-local activation record only.
        // No global env changes. No registry writes.
        // Scope: Node.js processes only. Python/Go/native binaries are NOT governed.
        const hookPath = findHookPath();
        if (!fs.existsSync(hookPath)) {
            console.error('Hook not found: ' + hookPath);
            console.error('Run: npm install @letterblack/lbe-exec');
            process.exit(1);
        }
        const mode = opts.mode || 'observe';
        const root = process.cwd();
        const lbeDir = path.join(root, '.lbe');
        fs.mkdirSync(lbeDir, { recursive: true });
        fs.writeFileSync(path.join(lbeDir, 'activation.json'), JSON.stringify({
            activated: true,
            activatedAt: new Date().toISOString(),
            hookPath,
            mode,
            root,
        }, null, 2) + '\n');
        console.log('── LBE workspace activated ───────────────────────');
        console.log('workspace: ' + root);
        console.log('hook:      ' + hookPath);
        console.log('mode:      ' + mode);
        console.log('\nNext: open a governed shell session:');
        console.log('  lbe-exec shell');
        console.log('\nAny Node.js agent run inside that shell is intercepted.');
        console.log('Python, Go, native binaries, and PowerShell are NOT governed.');
        break;
    }

    case 'shell': {
        // Spawn an interactive shell with NODE_OPTIONS pre-loaded.
        // Every node/npm/npx command inside inherits the governance hook.
        // Scope: Node.js only. Exits when the user types "exit".
        const activationFile = path.join(process.cwd(), '.lbe', 'activation.json');
        let activation = null;
        if (fs.existsSync(activationFile)) {
            try { activation = JSON.parse(fs.readFileSync(activationFile, 'utf8')); } catch (_) {}
        }
        const hookPath = (activation && activation.hookPath) || findHookPath();
        if (!fs.existsSync(hookPath)) {
            console.error('Hook not found. Run: lbe-exec activate');
            process.exit(1);
        }
        const mode = opts.mode || (activation && activation.mode) || 'observe';
        const root = (activation && activation.root) || process.cwd();
        // Node.js NODE_OPTIONS parser treats backslashes as escapes — use forward slashes on all platforms.
        const hookPathFwd = hookPath.replace(/\\/g, '/');
        const nodeOpts = '--require "' + hookPathFwd + '"';
        const shellEnv = { ...process.env, NODE_OPTIONS: nodeOpts, LBE_ROOT: root, LBE_MODE: mode };

        console.log('[lbe] Opening governed shell — mode: ' + mode);
        console.log('[lbe] NODE_OPTIONS set. Node.js agents are intercepted.');
        console.log('[lbe] Python / Go / native binaries are NOT governed.');
        console.log('[lbe] Type "exit" to close.\n');

        let shellProc;
        if (process.platform === 'win32') {
            const banner = [
                `$env:NODE_OPTIONS='--require "${hookPathFwd}"'`,
                `$env:LBE_ROOT='${root}'`,
                `$env:LBE_MODE='${mode}'`,
                `Write-Host '[lbe] Shell armed — mode: ${mode}' -ForegroundColor Green`,
            ].join('; ');
            shellProc = spawn('powershell.exe', ['-NoExit', '-Command', banner],
                { stdio: 'inherit', env: shellEnv });
        } else {
            const sh = process.env.SHELL || '/bin/bash';
            shellProc = spawn(sh, [], { stdio: 'inherit', env: shellEnv });
        }
        shellProc.on('close', code => {
            console.log('\n[lbe] Governed shell closed.');
            process.exit(code ?? 0);
        });
        break;
    }

    case 'deactivate': {
        const root = process.cwd();
        const files = [
            path.join(root, '.lbe', 'activation.json'),
            path.join(root, '.lbe', 'runtime', 'hook-status.json'),
        ];
        let removed = 0;
        for (const f of files) { if (fs.existsSync(f)) { fs.unlinkSync(f); removed++; } }
        if (removed) {
            console.log('✓ LBE deactivated — workspace activation files removed.');
        } else {
            console.log('Nothing to deactivate (workspace was not activated).');
        }
        console.log('Close any open "lbe-exec shell" sessions to fully disarm.');
        break;
    }

    case 'observe':
    case 'enforce':
        policyModeCommand(cmd, opts).catch(e => { console.error(e.message); process.exit(1); });
        break;

    case 'policy': {
        const policy = loadPolicy();
        if (!policy) { console.log('No policy found. Run: npx lbe-exec init'); break; }
        if (!policy.rules?.length) { console.log('No rules defined.'); break; }
        for (const r of policy.rules) {
            console.log(`[${r.effect.toUpperCase()}] ${r.type}:${r.pattern}  — ${r.from || ''}  (${r.id || '?'})`);
        }
        break;
    }

    case 'execute': {
        import('../src/exec/localExecutor.js').then(async ({ createLocalExecutor }) => {
            const lbe = createLocalExecutor({ rootDir: process.cwd() });
            let raw = '';
            if (opts.input) {
                raw = fs.readFileSync(path.resolve(opts.input), 'utf8');
            } else {
                for await (const chunk of process.stdin) raw += chunk;
            }
            const request = JSON.parse(raw);
            const result = await lbe.execute(request);
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.ok ? 0 : result.decision === 'deny' ? 1 : 2);
        }).catch(e => { console.error(e.message); process.exit(2); });
        break;
    }

    case 'integrate': {
        // Create tool-specific instruction files — only when user explicitly asks.
        // Default init never touches these locations.
        const tool = rest[0];
        const root = process.cwd();
        const contract = '.lbe/AGENT_CONTRACT.md';
        const blurb = [
            'This workspace uses LBE execution governance.',
            'Run Node agents through:  npx lbe-exec run-node ./agent.js',
            'Governance state lives in .lbe/ — do not create LBE files outside it.',
            `Full contract: ${contract}`,
        ].join('\n');

        const integrations = {
            claude: {
                file: 'CLAUDE.md',
                marker: '<!-- lbe-governance -->',
                content: `<!-- lbe-governance -->\n## LBE Governance\n\n${blurb}\n<!-- /lbe-governance -->`,
            },
            copilot: {
                file: '.github/copilot-instructions.md',
                marker: 'lbe-governance',
                content: `<!-- lbe-governance -->\n## LBE Governance\n\n${blurb}\n<!-- /lbe-governance -->`,
            },
            cursor: {
                file: '.cursor/rules',
                marker: 'lbe-governance',
                content: `# lbe-governance\n\n${blurb}`,
            },
            gemini: {
                file: 'GEMINI.md',
                marker: 'lbe-governance',
                content: `<!-- lbe-governance -->\n## LBE Governance\n\n${blurb}\n<!-- /lbe-governance -->`,
            },
        };

        const known = Object.keys(integrations).join(', ');
        if (!tool || !integrations[tool]) {
            console.log('Usage: lbe-exec integrate <tool>');
            console.log('Available: ' + known);
            break;
        }

        const { file, marker, content } = integrations[tool];
        const filePath = path.join(root, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath, 'utf8');
            if (existing.includes(marker)) {
                console.log('Already integrated: ' + file);
                break;
            }
            fs.appendFileSync(filePath, '\n\n' + content + '\n');
            console.log('✓ Appended LBE section to ' + file);
        } else {
            fs.writeFileSync(filePath, content + '\n');
            console.log('✓ Created ' + file);
        }
        console.log('  Agents reading that file will see LBE instructions.');
        break;
    }

    default:
        console.log('Usage: lbe-exec <command>\n');
        console.log('  init                Bootstrap governance — policy, keys, agent files');
        console.log('  run-node            Run a Node.js agent under LBE governance');
        console.log('    [--mode observe|enforce] <script> [...args]');
        console.log('  npm                 Wrap npm command with LBE hook (via NODE_OPTIONS)');
        console.log('    [...npm-args]');
        console.log('  status              Show workspace, mode, hook state, patched functions');
        console.log('  audit               Show unified event log (.lbe/events.jsonl)');
        console.log('  policy              List active policy rules');
        console.log('  activate            Write workspace activation record (Node.js only)');
        console.log('    [--mode observe|enforce]');
        console.log('  shell               Open a governed terminal (NODE_OPTIONS pre-set)');
        console.log('    [--mode observe|enforce]');
        console.log('  deactivate          Remove workspace activation files');
        console.log('  integrate           Create tool-specific instruction file (opt-in)');
        console.log('    claude | copilot | cursor | gemini');
        console.log('  observe             Switch to observer mode (log only, nothing blocked)');
        console.log('  enforce             Switch to enforcement mode (violations blocked)');
        console.log('  execute             Send a JSON request from stdin or --input file');
        console.log('\nCLI: npx lbe-exec <command>');
        if (cmd && cmd !== '--help' && cmd !== 'help') {
            console.error('\nUnknown command: ' + cmd);
            process.exit(1);
        }
}
