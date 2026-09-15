// src/core/logger.js
// Scoped operational logger with bounded history and level filtering.
// Separate from the audit log — this captures execution flow, not governance decisions.
//
// Usage:
//   import { logger } from './logger.js';
//   const val = logger.scope('Validator');
//   val.info('Timestamp check passed', { skewSec: 12 });
//   const ops = logger.exportLogs();   // full history for debugging
//
// Env: LBE_LOG_LEVEL=DEBUG|INFO|WARN|ERROR (default INFO)
//      LBE_LOG_SILENT=1  suppress all stderr output (history still kept)

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export function createLogger({ level = 'INFO', maxHistory = 500, silent = false } = {}) {
    const threshold = LEVELS[level] ?? LEVELS.INFO;
    const history = [];

    function append(lvl, scope, message, meta) {
        const entry = {
            ts: new Date().toISOString(),
            level: lvl,
            scope,
            message,
            ...(meta !== undefined ? { meta } : {})
        };

        if (history.length >= maxHistory) history.shift();
        history.push(entry);

        if (!silent && LEVELS[lvl] >= threshold) {
            const line = meta !== undefined
                ? `[${lvl}] [${scope}] ${message} ${JSON.stringify(meta)}`
                : `[${lvl}] [${scope}] ${message}`;
            (lvl === 'ERROR' || lvl === 'WARN' ? process.stderr : process.stderr).write(line + '\n');
        }
    }

    function makeScope(name) {
        return {
            debug: (msg, meta) => append('DEBUG', name, msg, meta),
            info:  (msg, meta) => append('INFO',  name, msg, meta),
            warn:  (msg, meta) => append('WARN',  name, msg, meta),
            error: (msg, meta) => append('ERROR', name, msg, meta)
        };
    }

    return {
        scope: makeScope,
        debug: (msg, meta) => append('DEBUG', 'lbe', msg, meta),
        info:  (msg, meta) => append('INFO',  'lbe', msg, meta),
        warn:  (msg, meta) => append('WARN',  'lbe', msg, meta),
        error: (msg, meta) => append('ERROR', 'lbe', msg, meta),
        exportLogs:   () => [...history],
        clearHistory: () => { history.length = 0; },
        get historyLength() { return history.length; }
    };
}

const logLevel = process.env.LBE_LOG_LEVEL || 'INFO';
const logSilent = process.env.LBE_LOG_SILENT === '1';

export const logger = createLogger({ level: logLevel, silent: logSilent });
