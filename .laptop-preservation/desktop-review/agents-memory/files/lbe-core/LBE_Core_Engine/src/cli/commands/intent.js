import fs from 'node:fs';
import path from 'node:path';
import { beginAuditIntent } from '../../state/auditMode.js';
import { resolveWorkspaceState } from '../../state/index.js';

function loadJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').reduce((records, line) => {
        try {
            records.push(JSON.parse(line));
        } catch (_) {
            // Ignore malformed evidence lines; intent status is read-only.
        }
        return records;
    }, []);
}

function latestIntent(workspaceRoot, stateDir) {
    const central = loadJsonl(path.join(stateDir, 'intent.jsonl'));
    if (central.length > 0) return central[central.length - 1];
    const localIntent = path.join(workspaceRoot, '.lbe', 'intent.jsonl');
    const local = loadJsonl(localIntent);
    return local[local.length - 1] || null;
}

function isJson(opts) {
    return opts.json === true || opts.json === 'true';
}

export async function intentCommand(subcommand, opts = {}) {
    if (!subcommand) {
        const workspaceRoot = path.resolve(opts.root || process.cwd());
        const { stateDir } = resolveWorkspaceState(workspaceRoot);
        const intent = latestIntent(workspaceRoot, stateDir);
        if (!intent) {
            console.log(isJson(opts) ? JSON.stringify({ status: 'NO_INTENT_FOUND' }, null, 2) : 'NO_INTENT_FOUND');
            return { status: 'NO_INTENT_FOUND' };
        }

        if (isJson(opts)) {
            console.log(JSON.stringify({
                status: 'INTENT_REGISTERED',
                intent_id: intent.intent_id || null,
                scope_id: intent.scope_id || null,
            }, null, 2));
        } else {
            console.log('INTENT_REGISTERED');
            if (intent.intent_id) console.log(`intent_id ${intent.intent_id}`);
            if (intent.scope_id) console.log(`scope_id ${intent.scope_id}`);
        }
        return { status: 'INTENT_REGISTERED', intent };
    }

    if (subcommand !== 'begin') {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INTENT_COMMAND_UNSUPPORTED',
            message: 'Use: lbe intent begin --task "<task>" --allowed-files "src/**"',
        }, null, 2));
        process.exitCode = 2;
        return { status: 'error' };
    }

    const result = beginAuditIntent(opts);
    if (opts.json === true || opts.json === 'true') {
        console.log(JSON.stringify({
            status: result.status,
            intent_id: result.intent?.intent_id || null,
            scope_id: result.scope?.id || null,
        }, null, 2));
    } else {
        console.log(result.status);
        if (result.intent) console.log(`intent_id ${result.intent.intent_id}`);
        if (result.scope) console.log(`scope_id ${result.scope.id}`);
    }
    return result;
}
