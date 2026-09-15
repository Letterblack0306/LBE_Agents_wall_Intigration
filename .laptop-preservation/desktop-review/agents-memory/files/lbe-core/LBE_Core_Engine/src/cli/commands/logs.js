import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceState } from '../../state/index.js';

const DEFAULT_LIMIT = 20;

/**
 * lbe logs [--limit <n>]
 *
 * Reads central lbe-events.jsonl and prints the last N entries.
 * If the file does not exist, prints a clear "not yet" message — it means
 * hook dual-write (alpha2 of the hook change) has not been enabled yet.
 *
 * Reads only. Does not write, migrate, or modify anything.
 *
 * @returns {{ eventsPath, count, entries, missing }}
 */
export async function logsCommand(opts) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { paths } = resolveWorkspaceState(workspaceRoot);
    const limit = opts.limit ? parseInt(opts.limit, 10) : DEFAULT_LIMIT;

    if (!fs.existsSync(paths.events)) {
        console.log('\nLBE Central Logs');
        console.log('  No central logs yet. Hook dual-write not enabled.');
        console.log(`  Expected at: ${paths.events}`);
        console.log('');
        return { eventsPath: paths.events, count: 0, entries: [], missing: true };
    }

    const raw = fs.readFileSync(paths.events, 'utf8').trim();
    const lines = raw ? raw.split('\n') : [];

    const entries = lines
        .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
        .filter(Boolean);

    const tail = entries.slice(-limit);

    console.log(`\nLBE Central Logs — last ${tail.length} of ${entries.length} entries`);
    console.log(`  source: ${paths.events}\n`);

    for (const entry of tail) {
        const ts     = entry.ts ? new Date(entry.ts * 1000).toISOString() : '?';
        const action = entry.action   || '?';
        const dec    = entry.decision || '?';
        const target = entry.path || entry.cmd || '';
        console.log(`  [${ts}] ${dec.toUpperCase().padEnd(5)} ${action} ${target}`);
    }
    console.log('');

    return { eventsPath: paths.events, count: entries.length, entries: tail, missing: false };
}
