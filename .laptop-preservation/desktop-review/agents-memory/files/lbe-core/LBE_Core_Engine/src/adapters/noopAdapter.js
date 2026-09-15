// src/adapters/noopAdapter.js
// No-operation adapter for testing and dry-run

export async function noopAdapter(cmd) {
    return {
        adapter: 'noop',
        commandId: cmd.commandId || 'unknown',
        command: cmd.id || 'unknown',
        status: 'completed',
        output: `[NOOP] Would execute: ${cmd.id || 'unknown'} on adapter: ${cmd.payload?.adapter || 'unknown'}`,
        exitCode: 0,
        timestamp: new Date().toISOString()
    };
}
