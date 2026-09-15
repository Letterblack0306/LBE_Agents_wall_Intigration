import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicAppendFileSync, atomicWriteFileSync, withFileLock } from '../core/atomicWrite.js';

const SOURCE = '.lbe/events.jsonl';

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function readMarker(markerPath) {
    try {
        return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function readCentralLines(eventsPath) {
    try {
        return new Set(fs.readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean));
    } catch (_) {
        return new Set();
    }
}

/**
 * Imports a legacy project-local event log into the central log once per source
 * content hash. The legacy source is read-only throughout this process.
 */
export function migrateLegacyEvents(workspaceRoot, stateDir) {
    const sourcePath = path.join(workspaceRoot, '.lbe', 'events.jsonl');
    const migrationDir = path.join(stateDir, 'migration');
    const markerPath = path.join(migrationDir, 'events-v1.json');
    const invalidPath = path.join(migrationDir, 'migration-invalid.jsonl');
    const result = {
        attempted: false,
        imported_count: 0,
        skipped_duplicate_count: 0,
        invalid_count: 0,
        markerPath,
        invalidPath,
    };

    let source;
    try {
        if (!fs.existsSync(sourcePath)) return result;
        source = fs.readFileSync(sourcePath, 'utf8');
    } catch (_) {
        return result;
    }

    result.attempted = true;
    const sourceSha256 = sha256(source);
    const marker = readMarker(markerPath);
    if (marker?.format === 1 && marker.source_sha256 === sourceSha256) return result;

    const validLines = [];
    const invalidLines = [];
    for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
            JSON.parse(line);
            validLines.push(line);
        } catch (_) {
            invalidLines.push({ source: SOURCE, line_number: index + 1, line, source_sha256: sourceSha256 });
        }
    }

    const eventsPath = path.join(stateDir, 'lbe-events.jsonl');
    try {
        withFileLock(eventsPath, () => {
            const centralLines = readCentralLines(eventsPath);
            const imported = [];
            for (const line of validLines) {
                if (centralLines.has(line)) {
                    result.skipped_duplicate_count++;
                    continue;
                }
                centralLines.add(line);
                imported.push(line);
                result.imported_count++;
            }
            if (imported.length > 0) {
                const existing = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8') : '';
                atomicWriteFileSync(eventsPath, existing + (existing && !existing.endsWith('\n') ? '\n' : '') + imported.join('\n') + '\n', 'utf8');
            }
        });

        if (invalidLines.length > 0) {
            atomicAppendFileSync(invalidPath, invalidLines.map(line => JSON.stringify(line) + '\n').join(''), { encoding: 'utf8' });
            result.invalid_count = invalidLines.length;
        }

        fs.mkdirSync(migrationDir, { recursive: true });
        atomicWriteFileSync(markerPath, JSON.stringify({
            format: 1,
            source: SOURCE,
            source_sha256: sourceSha256,
            migrated_at: new Date().toISOString(),
            imported_count: result.imported_count,
            skipped_duplicate_count: result.skipped_duplicate_count,
            invalid_count: result.invalid_count,
        }, null, 2) + '\n', 'utf8');
    } catch (_) {
        // Central-state migration is opportunistic; resolution must remain safe.
    }

    return result;
}
