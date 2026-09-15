import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Returns a platform-correct canonical form of a workspace path for ID hashing.
 *
 * Rules:
 *   - Use realpathSync.native to resolve symlinks and normalise separators.
 *   - Fallback to path.resolve if the path does not yet exist.
 *   - Windows: lowercase after normalisation (NTFS is case-insensitive).
 *   - Linux/macOS: preserve case (case-sensitive volumes).
 */
export function canonicalWorkspacePath(workspaceRoot) {
    let resolved;
    try {
        resolved = fs.realpathSync.native(workspaceRoot);
    } catch (_) {
        // Path does not exist yet — normalise without resolving symlinks.
        resolved = path.resolve(workspaceRoot);
    }
    const normalised = path.normalize(resolved);
    return process.platform === 'win32' ? normalised.toLowerCase() : normalised;
}

/**
 * Returns a 64-char hex SHA-256 workspace ID derived from the canonical path.
 */
export function workspaceId(workspaceRoot) {
    return crypto.createHash('sha256').update(canonicalWorkspacePath(workspaceRoot)).digest('hex');
}

/**
 * Returns the sharded state directory path for a workspace ID.
 * Format: <stateRoot>/workspaces/<xx>/<xx>/<xx>/<full-id>/
 * Sharding prevents flat-dir scaling problems with many projects.
 */
export function workspaceStateDir(stateRoot, id) {
    return path.join(stateRoot, 'workspaces', id.slice(0, 2), id.slice(2, 4), id.slice(4, 6), id);
}
