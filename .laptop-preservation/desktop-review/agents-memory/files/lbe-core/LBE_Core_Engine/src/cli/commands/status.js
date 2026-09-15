import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceState } from '../../state/index.js';
import { stateRoot } from '../../state/stateRoot.js';
import { isWorkspaceRegistryReadable, listWorkspaces } from '../../state/workspaceRegistry.js';
import { auditStatus } from '../../state/auditMode.js';

/**
 * lbe status
 *
 * Resolves central state for the workspace and prints a summary.
 * Policy authority stays in .lbe/policy.json — this command reads it
 * for display only. It does not modify or migrate anything.
 *
 * @returns {{ workspaceId, stateDir, policySource, policyMode, hasProof, hasEvents }}
 */
export async function statusCommand(opts) {
    if (opts.all) {
        const registryPath = opts.registryPath || path.join(stateRoot(), 'registry.json');
        if (!isWorkspaceRegistryReadable(registryPath)) {
            console.log('Workspace registry unreadable');
            return { workspaces: [], registryReadable: false };
        }

        const workspaces = listWorkspaces(registryPath);
        if (workspaces.length === 0) {
            console.log('No known workspaces yet');
            return { workspaces, registryReadable: true };
        }

        console.log('\nKnown LBE workspaces');
        for (const workspace of workspaces) {
            console.log(`  ${workspace.alias}`);
            console.log(`    workspace_id ${workspace.workspaceId}`);
            console.log(`    path         ${workspace.path}`);
            console.log(`    last_active  ${workspace.last_active}`);
        }
        console.log('');
        return { workspaces, registryReadable: true };
    }

    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir, workspaceId, paths } = resolveWorkspaceState(workspaceRoot);

    // ── Policy source (read-only, .lbe/policy.json is authoritative) ──────────
    const policyPath = path.join(workspaceRoot, '.lbe', 'policy.json');
    let policySource = 'not found';
    let policyMode   = 'unknown';
    if (fs.existsSync(policyPath)) {
        try {
            const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
            policyMode   = policy.mode || 'unknown';
            policySource = policyPath;
        } catch (_) {
            policySource = policyPath + ' (unreadable)';
        }
    }

    // ── Central state presence ─────────────────────────────────────────────────
    const hasProof  = fs.existsSync(paths.proofLatest);
    const hasEvents = fs.existsSync(paths.events);
    const audit = auditStatus({ root: workspaceRoot });

    // ── Output ─────────────────────────────────────────────────────────────────
    console.log(`\nLBE Central State — ${workspaceRoot}`);
    console.log(`  workspace_id  ${workspaceId}`);
    console.log(`  state_dir     ${stateDir}`);
    console.log(`  policy_source ${policySource}`);
    console.log(`  policy_mode   ${policyMode}`);
    console.log(`  audit_status  ${audit.status}`);
    console.log(`  central_proof ${hasProof  ? paths.proofLatest : 'No central proof yet'}`);
    console.log(`  central_logs  ${hasEvents ? paths.events      : 'No central logs yet. Hook dual-write not enabled.'}`);
    console.log('');

    return { workspaceId, stateDir, policySource, policyMode, hasProof, hasEvents, auditStatus: audit.status };
}
