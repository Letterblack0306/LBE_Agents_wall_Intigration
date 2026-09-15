import { setActiveScopeFromFile, loadActiveScope, readRequiredScopeDocuments, scopeStatus } from '../../state/scopeContract.js';

function isJson(opts) {
    return opts.json === true || opts.json === 'true';
}

export async function scopeCommand(subcommand, opts = {}) {
    if (!subcommand) {
        subcommand = 'status';
    }

    if (subcommand === 'set') {
        const file = opts._?.[1];
        if (!file) {
            console.error(JSON.stringify({ status: 'error', error: 'SCOPE_FILE_REQUIRED', message: 'Use: lbe scope set <file>' }, null, 2));
            process.exitCode = 2;
            return { status: 'error' };
        }
        const result = setActiveScopeFromFile(file, opts);
        if (isJson(opts)) console.log(JSON.stringify({ status: result.status, scope_id: result.scope.id }, null, 2));
        else {
            console.log(result.status);
            console.log(`scope_id ${result.scope.id}`);
        }
        return result;
    }

    if (subcommand === 'show') {
        const scope = loadActiveScope(opts.root || process.cwd());
        if (!scope) {
            console.log(isJson(opts) ? JSON.stringify({ status: 'NO_SCOPE_FOUND' }, null, 2) : 'NO_SCOPE_FOUND');
            return { status: 'NO_SCOPE_FOUND' };
        }
        console.log(JSON.stringify(scope, null, 2));
        return { status: 'SCOPE_FOUND', scope };
    }

    if (subcommand === 'read') {
        const result = readRequiredScopeDocuments(opts);
        if (isJson(opts)) {
            console.log(JSON.stringify({
                status: result.status,
                scope_id: result.scope?.id || null,
                receipts: result.receipts.map((receipt) => ({
                    path: receipt.path,
                    sha256: receipt.sha256,
                    bytes: receipt.bytes,
                })),
            }, null, 2));
        } else {
            console.log(result.status);
            for (const receipt of result.receipts) {
                console.log(`--- ${receipt.path}`);
                console.log(receipt.content);
            }
        }
        return result;
    }

    if (subcommand === 'status') {
        const result = scopeStatus(opts);
        if (isJson(opts)) {
            console.log(JSON.stringify({
                status: result.status,
                scope_id: result.scope?.id || null,
                missing_required_reading: result.missingReading.length,
            }, null, 2));
        } else {
            console.log(result.status);
            if (result.scope) console.log(`scope_id ${result.scope.id}`);
        }
        return result;
    }

    console.error(JSON.stringify({
        status: 'error',
        error: 'SCOPE_COMMAND_UNSUPPORTED',
        message: 'Use: lbe scope set|show|read|status',
    }, null, 2));
    process.exitCode = 2;
    return { status: 'error' };
}
