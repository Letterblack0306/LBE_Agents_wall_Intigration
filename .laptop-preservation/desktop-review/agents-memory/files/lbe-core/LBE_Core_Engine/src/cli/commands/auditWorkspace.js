// src/cli/commands/auditWorkspace.js
// 'lbe audit-workspace --mode audit' runs the workspace audit chain.
// 'lbe audit-workspace --mode repair' returns NOT_IMPLEMENTED.

import path from 'node:path';
import { runAuditChain } from '../../audit/workspaceAuditChain.js';

function isJson(opts) { return opts.json === true || opts.json === 'true'; }

export async function auditWorkspaceCommand(opts = {}) {
    const mode = opts.mode || 'audit';
    const root = path.resolve(opts.root || process.cwd());

    const result = await runAuditChain(root, mode);

    if (mode === 'repair' && result.pass === false && result.reason === 'NOT_IMPLEMENTED') {
        console.log(isJson(opts) ? JSON.stringify({ status: 'NOT_IMPLEMENTED', message: result.nextStep }) : 'NOT_IMPLEMENTED');
        return { status: 'NOT_IMPLEMENTED' };
    }

    if (isJson(opts)) {
        console.log(JSON.stringify({
            status: result.overall === 'PASS' ? 'AUDIT_PASS' : 'AUDIT_FAIL',
            overall: result.overall,
            gates: result.results.map(r => ({ gate: r.gate, pass: r.pass, reason: r.reason })),
            summary: {
                total: result.results.length,
                passed: result.results.filter(r => r.pass).length,
                failed: result.results.filter(r => !r.pass).length,
            },
        }, null, 2));
    } else {
        console.log(`\n  Workspace Audit: ${result.overall === 'PASS' ? 'PASS' : 'FAIL'}`);
        console.log(`  Mode: ${mode}`);
        console.log('');
        for (const g of result.results) {
            const icon = g.pass ? '\u2713' : '\u2716';
            console.log(`    ${icon} ${g.gate}`);
            if (!g.pass) {
                console.log(`       reason: ${g.reason}`);
                console.log(`       next:   ${g.nextStep}`);
            }
        }
        console.log(`\n  Summary: ${result.results.filter(r => r.pass).length}/${result.results.length} passed`);
        console.log('');
    }

    return { status: result.overall === 'PASS' ? 'AUDIT_PASS' : 'AUDIT_FAIL', result };
}
