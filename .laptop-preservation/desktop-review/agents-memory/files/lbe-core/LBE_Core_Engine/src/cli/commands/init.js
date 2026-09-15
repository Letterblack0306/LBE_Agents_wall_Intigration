// src/cli/commands/init.js
// Initialize LBE in a workspace:
//   1. Scan project → generate workspace contract (semantics + enforcement)
//   2. Show compact summary → ask once
//   3. Write lbe.workspace.json
//   4. Set up crypto infrastructure silently

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { generateKeyPair } from '../../core/signature.js';
import { createPolicySignatureEnvelope } from '../../core/policySignature.js';
import { scanWorkspace, formatSummary } from '../../core/workspaceScanner.js';

// ─── Interactive prompt ───────────────────────────────────────────────────────

function ask(question) {
    // Non-interactive (CI / pipe) — default accept
    if (!process.stdin.isTTY) return Promise.resolve('y');
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()); });
    });
}

// ─── Strict / relaxed adjustments ────────────────────────────────────────────

function applyStrict(enforcement) {
    // Strict: move approval items to deny, add common risky patterns
    return {
        ...enforcement,
        deny: [...new Set([...enforcement.deny, ...enforcement.approval, '*.json', 'config/**'])],
        approval: [],
    };
}

function applyRelaxed(enforcement) {
    // Relaxed: drop approval requirement, everything not denied is allowed
    return { ...enforcement, approval: [] };
}

// ─── Crypto setup (silent — infrastructure only) ──────────────────────────────

function setupCrypto(cwd) {
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const defaultKeyId = 'agent:gpt-v1-2026Q1';
    const signerKeyId = 'policy-signer-v1-2026Q1';

    // All LBE infrastructure lives under .lbe/ — nothing pollutes the project root
    const lbeDir = path.join(cwd, '.lbe');
    for (const d of ['config', 'keys', 'data']) {
        fs.mkdirSync(path.join(lbeDir, d), { recursive: true });
    }

    // Data stores
    const dataFiles = {
        '.lbe/data/nonce.db.json': JSON.stringify({ entries: [] }, null, 2),
        '.lbe/data/rate-limit.db.json': JSON.stringify({ entries: [] }, null, 2),
        '.lbe/data/policy.state.json': JSON.stringify({ schemaVersion: '1', lastAccepted: null, updatedAt: null }, null, 2),
        '.lbe/data/audit.log.jsonl': '',
    };
    for (const [rel, content] of Object.entries(dataFiles)) {
        const p = path.join(cwd, rel);
        if (!fs.existsSync(p)) fs.writeFileSync(p, content);
    }

    // Keypair
    const keyDir = path.join(lbeDir, 'keys');
    const pubPath = path.join(keyDir, 'public.key');
    const secPath = path.join(keyDir, 'secret.key');
    let publicKeyB64, secretKeyB64;
    if (fs.existsSync(pubPath) && fs.existsSync(secPath)) {
        publicKeyB64 = fs.readFileSync(pubPath, 'utf8').trim();
        secretKeyB64 = fs.readFileSync(secPath, 'utf8').trim();
    } else {
        const kp = generateKeyPair();
        publicKeyB64 = kp.publicKey;
        secretKeyB64 = kp.secretKey;
        fs.writeFileSync(pubPath, publicKeyB64);
        fs.writeFileSync(secPath, secretKeyB64, { mode: 0o600 });
    }

    // Keys store
    const keysPath = path.join(lbeDir, 'config/keys.json');
    const keysStore = fs.existsSync(keysPath)
        ? JSON.parse(fs.readFileSync(keysPath, 'utf8'))
        : { schemaVersion: '1', defaultKeyId, trustedKeys: {} };

    for (const keyId of [defaultKeyId, signerKeyId]) {
        if (!keysStore.trustedKeys[keyId]) {
            keysStore.trustedKeys[keyId] = {
                publicKey: publicKeyB64,
                notBefore: nowIso,
                expiresAt,
                validFrom: nowIso,
                validUntil: expiresAt,
                deprecated: false,
            };
        }
    }
    keysStore.defaultKeyId = defaultKeyId;
    fs.writeFileSync(keysPath, JSON.stringify(keysStore, null, 2));

    // Policy
    const policyPath = path.join(lbeDir, 'config/policy.default.json');
    let policyObj;
    if (fs.existsSync(policyPath)) {
        policyObj = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    } else {
        policyObj = {
            default: 'DENY',
            version: '1.0.0',
            createdAt: nowIso,
            security: {
                maxClockSkewSec: 600,
                maxPolicyCreatedAtSkewSec: 31536000,
                defaultRateLimit: { windowSec: 60, maxRequests: 30 }
            },
            requesters: {
                'agent:gpt': {
                    allowAdapters: ['noop', 'shell'],
                    allowCommands: ['RUN_SHELL'],
                    rateLimit: { windowSec: 60, maxRequests: 30 },
                    filesystem: { roots: [cwd], denyPatterns: ['**/.git/**', '**/secrets/**', '**/*.key'] },
                    exec: { allowCmds: ['ls', 'node', 'python', 'echo'], denyCmds: ['rm', 'chmod', 'chown', 'curl', 'wget', 'su', 'sudo'] }
                }
            }
        };
        fs.writeFileSync(policyPath, JSON.stringify(policyObj, null, 2));
    }

    // Policy signature
    const sigResult = createPolicySignatureEnvelope({ policyObj, secretKeyB64, keyId: signerKeyId });
    if (sigResult.ok) {
        fs.writeFileSync(path.join(lbeDir, 'config/policy.sig.json'), JSON.stringify(sigResult.envelope, null, 2));
    }

    return { defaultKeyId, secretKeyB64, publicKeyB64 };
}

// ─── Agent governance files ───────────────────────────────────────────────────
// Generated once by init so every AI agent auto-discovers LBE without the user
// needing to explain it. Logic and internals are never mentioned — only the API.

function agentContractContent() {
    return `# LBE Governance Contract

This project has LetterBlack LBE (Local-first execution Governance) active.

## Your role as an agent

Every file write, delete, and shell command must go through the LBE executor.
The executor validates each action against the project policy and audits it.

## How to perform actions

\`\`\`js
import { createLocalExecutor } from '@letterblack/lbe-core';
const lbe = createLocalExecutor({ rootDir: process.cwd() });

await lbe.writeFile('output/report.md', content);
await lbe.readFile('src/config.json');
await lbe.patchFile('src/index.js', patch);
await lbe.deleteFile('tmp/scratch.txt');
await lbe.runShell('node', ['scripts/build.js']);
\`\`\`

## What you must never do

- Call fs.* or child_process.* directly
- Modify \`.lbe/policy.json\` directly — propose a rule via \`lbe.policy.proposeRule()\`
- Attempt to bypass or disable the executor

## Proposing a policy rule

\`\`\`js
const proposal = lbe.policy.proposeRule({
  effect: 'deny', type: 'path', pattern: 'secrets/**',
  from: 'agent: these files should never be modified'
});
// Return proposal to the user — never call lbe.policy.addRule() yourself.
\`\`\`

## Result shape

\`{ ok: boolean, decision: 'allow' | 'deny' | 'observe', executed: boolean }\`

## Files

- Policy: \`.lbe/policy.json\`
- Audit:  \`.lbe/audit.jsonl\`
- Status: \`npx lbe status\`
`;
}

function writeAgentContract(cwd) {
    const lbeDir = path.join(cwd, '.lbe');
    fs.mkdirSync(lbeDir, { recursive: true });
    fs.writeFileSync(path.join(lbeDir, 'AGENT_CONTRACT.md'), agentContractContent());
}

// Migrate legacy root-level LBE files into .lbe/ so the workspace stays clean.
function migrateLegacyRootFiles(cwd) {
    const lbeDir = path.join(cwd, '.lbe');
    fs.mkdirSync(lbeDir, { recursive: true });
    const migrations = [
        ['lbe.policy.json', '.lbe/policy.json'],
        ['lbe.workspace.json', '.lbe/workspace.json'],
    ];
    const removed = [];
    for (const [src, dest] of migrations) {
        const srcPath = path.join(cwd, src);
        const destPath = path.join(cwd, dest);
        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
            fs.renameSync(srcPath, destPath);
            removed.push(src + ' → ' + dest);
        } else if (fs.existsSync(srcPath)) {
            fs.unlinkSync(srcPath);          // dest already exists — just drop the old file
            removed.push(src + ' (removed — .lbe/ version exists)');
        }
    }
    // Remove files that should never have been created in the project root
    const toDelete = ['CLAUDE.md', path.join('.github', 'copilot-instructions.md')];
    for (const rel of toDelete) {
        const p = path.join(cwd, rel);
        // Only remove if it contains the lbe-governance marker — don't touch user files
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            if (content.includes('lbe-governance') || content.includes('LetterBlack LBE')) {
                fs.unlinkSync(p);
                removed.push(rel + ' (removed — LBE-generated file)');
            }
        }
    }
    return removed;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function initCommand(opts = {}) {
    const cwd = process.cwd();
    const yes = opts.yes || opts.y || !process.stdin.isTTY;
    const lbeDir = path.join(cwd, '.lbe');
    fs.mkdirSync(lbeDir, { recursive: true });
    const outPath = path.join(lbeDir, 'workspace.json');

    // 1. Scan
    console.log('\nScanning workspace...\n');
    const { projectTypes, primaryType, semantics, enforcement } = scanWorkspace(cwd);

    // 2. Show summary
    console.log(formatSummary(projectTypes, semantics, enforcement));
    console.log('');

    // 3. Ask once (unless --yes or non-interactive)
    let finalEnforcement = enforcement;
    if (!yes) {
        const answer = await ask('Accept? [Y = accept / s = strict / r = relaxed / n = cancel] ');
        if (answer === 'n') {
            console.log('Cancelled.');
            return { success: false };
        }
        if (answer === 's') finalEnforcement = applyStrict(enforcement);
        if (answer === 'r') finalEnforcement = applyRelaxed(enforcement);
    }

    // 4. Write lbe.workspace.json
    const contract = {
        lbe: true,
        version: '0.4.0',
        state: 'local',
        projectTypes,
        primaryType,
        semantics,
        enforcement: finalEnforcement,
    };
    fs.writeFileSync(outPath, JSON.stringify(contract, null, 2));
    console.log('✓ Wrote .lbe/workspace.json');

    // 5. Crypto setup (silent)
    setupCrypto(cwd);
    const localPolicyPath = path.join(lbeDir, 'policy.json');
    if (!fs.existsSync(localPolicyPath)) {
        fs.writeFileSync(localPolicyPath, JSON.stringify({ version: 1, mode: 'observe', workspace: cwd, rules: [] }, null, 2) + '\n');
    }
    const localAuditPath = path.join(lbeDir, 'audit.jsonl');
    if (!fs.existsSync(localAuditPath)) fs.writeFileSync(localAuditPath, '');
    console.log('✓ Keys and policy ready  (.lbe/)');

    // 6. Agent contract inside .lbe/ only — no CLAUDE.md, no .github/ changes
    writeAgentContract(cwd);
    console.log('✓ Agent contract written  →  .lbe/AGENT_CONTRACT.md');

    // 7. Migrate any legacy root files from previous LBE versions
    const migrated = migrateLegacyRootFiles(cwd);
    if (migrated.length) {
        console.log('\n✓ Migrated legacy files:');
        for (const m of migrated) console.log('  ' + m);
    }

    console.log('\nDone. All LBE state is in .lbe/');
    console.log('Run  npx lbe status  to verify.\n');

    return { success: true, contract };
}
