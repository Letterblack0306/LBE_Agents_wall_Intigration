import { snapshotAuditWorkspace } from '../../state/auditMode.js';

export async function snapshotCommand(subcommand, opts = {}) {
    if (!['before', 'after'].includes(subcommand)) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'SNAPSHOT_COMMAND_UNSUPPORTED',
            message: 'Use: lbe snapshot before|after',
        }, null, 2));
        process.exitCode = 2;
        return { status: 'error' };
    }

    const result = snapshotAuditWorkspace(subcommand, opts);
    if (opts.json === true || opts.json === 'true') {
        console.log(JSON.stringify({
            status: result.status,
            phase: result.phase,
            file_count: result.fileCount,
        }, null, 2));
    } else {
        console.log(result.status);
        console.log(`files ${result.fileCount}`);
    }
    return result;
}
