import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, withFileLock } from '../core/atomicWrite.js';

const FORMAT = 1;

function emptyRegistry() {
    return { format: FORMAT, workspaces: {} };
}

function readRegistry(registryPath) {
    if (!fs.existsSync(registryPath)) return { registry: emptyRegistry(), readable: true };

    try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        if (!registry || typeof registry !== 'object' || Array.isArray(registry) ||
            registry.format !== FORMAT || !registry.workspaces ||
            typeof registry.workspaces !== 'object' || Array.isArray(registry.workspaces)) {
            return { registry: null, readable: false };
        }
        return { registry, readable: true };
    } catch (_) {
        return { registry: null, readable: false };
    }
}

/**
 * Register a workspace in the central registry.
 *
 * A corrupt existing registry is intentionally left untouched. Resolution must
 * remain safe for the CLI, and overwriting forensic state would be surprising.
 */
export function registerWorkspace(registryPath, workspaceId, workspacePath) {
    return withFileLock(registryPath, () => {
        const { registry, readable } = readRegistry(registryPath);
        if (!readable) return null;

        const now = new Date().toISOString();
        const existing = registry.workspaces[workspaceId];
        registry.workspaces[workspaceId] = {
            path: workspacePath,
            alias: existing?.alias || path.basename(workspacePath),
            first_seen: existing?.first_seen || now,
            last_active: now,
        };

        atomicWriteFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
        return registry.workspaces[workspaceId];
    });
}

/** Returns known workspaces, or [] when the registry is missing or unreadable. */
export function listWorkspaces(registryPath) {
    const { registry, readable } = readRegistry(registryPath);
    if (!readable) return [];
    return Object.entries(registry.workspaces).map(([workspaceId, workspace]) => ({
        workspaceId,
        ...workspace,
    }));
}

/** Allows presentation code to distinguish an absent registry from corruption. */
export function isWorkspaceRegistryReadable(registryPath) {
    return readRegistry(registryPath).readable;
}
