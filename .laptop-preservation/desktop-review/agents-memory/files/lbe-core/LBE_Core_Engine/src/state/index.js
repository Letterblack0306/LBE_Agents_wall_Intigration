import fs from 'node:fs';
import path from 'node:path';
import { workspaceId, workspaceStateDir } from './workspaceId.js';
import { stateRoot } from './stateRoot.js';
import { registerWorkspace } from './workspaceRegistry.js';
import { migrateLegacyEvents } from './migration.js';

export { workspaceId, workspaceStateDir, stateRoot };

/**
 * Resolves (and creates) the central state directory for a workspace.
 *
 * Returned paths object is the contract for all subsequent state operations.
 * The ESM resolver also refreshes the central workspace registry. The hook CJS
 * resolver remains separate and deliberately does not perform this write.
 *
 * Safe to call multiple times — mkdirSync with recursive:true is idempotent.
 *
 * @param {string} workspaceRoot  Absolute path to the workspace root.
 * @returns {{ stateDir: string, workspaceId: string, paths: WorkspacePaths }}
 */
export function resolveWorkspaceState(workspaceRoot) {
    const root = stateRoot();
    const id   = workspaceId(workspaceRoot);
    const dir  = workspaceStateDir(root, id);

    // Ensure directory tree exists — idempotent.
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'file-index'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'proof'),      { recursive: true });
    registerWorkspace(path.join(root, 'registry.json'), id, workspaceRoot);
    migrateLegacyEvents(workspaceRoot, dir);

    return {
        stateDir:    dir,
        workspaceId: id,
        paths:       buildPaths(dir),
    };
}

/**
 * @typedef {Object} WorkspacePaths
 * @property {string} workspace      workspace.json
 * @property {string} events         lbe-events.jsonl  (central audit mirror)
 * @property {string} intent         intent.jsonl
 * @property {string} targetRegistry target_registry.jsonl
 * @property {string} fileIndexDir   file-index/
 * @property {string} fileIndexBefore file-index/before.json
 * @property {string} fileIndexAfter  file-index/after.json
 * @property {string} proofDir       proof/
 * @property {string} proofLatest    proof/latest.json
 */
function buildPaths(dir) {
    return {
        workspace:        path.join(dir, 'workspace.json'),
        events:           path.join(dir, 'lbe-events.jsonl'),
        intent:           path.join(dir, 'intent.jsonl'),
        targetRegistry:   path.join(dir, 'target_registry.jsonl'),
        fileIndexDir:     path.join(dir, 'file-index'),
        fileIndexBefore:  path.join(dir, 'file-index', 'before.json'),
        fileIndexAfter:   path.join(dir, 'file-index', 'after.json'),
        proofDir:         path.join(dir, 'proof'),
        proofLatest:      path.join(dir, 'proof', 'latest.json'),
    };
}
