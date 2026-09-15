import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveWorkspaceState } from '../../state/index.js';

/**
 * lbe open-state
 *
 * Resolves the central state directory and opens it in the system file manager.
 * Always prints the path regardless of whether the open succeeds — so the user
 * can copy-paste it even if the file manager call fails.
 *
 * Set env LBE_NO_OPEN=1 to skip the subprocess (used in tests and CI).
 *
 * @returns {{ stateDir, opened }}
 */
export async function openStateCommand(opts) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir } = resolveWorkspaceState(workspaceRoot);

    console.log(`\nLBE Central State Directory`);
    console.log(`  ${stateDir}\n`);

    if (process.env.LBE_NO_OPEN === '1') {
        return { stateDir, opened: false };
    }

    let opened = false;
    try {
        if (process.platform === 'win32') {
            spawnSync('explorer.exe', [stateDir], { detached: true, stdio: 'ignore' });
            opened = true;
        } else if (process.platform === 'darwin') {
            spawnSync('open', [stateDir], { detached: true, stdio: 'ignore' });
            opened = true;
        } else {
            spawnSync('xdg-open', [stateDir], { detached: true, stdio: 'ignore' });
            opened = true;
        }
    } catch (_) {
        // Non-fatal — path was already printed above.
    }

    return { stateDir, opened };
}
