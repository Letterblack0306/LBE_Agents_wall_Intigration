// src/cli/main.js
// LetterBlack Sentinel CLI entrypoint

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, printHelp } from './parseArgs.js';
import { initCommand } from './commands/init.js';
import { verifyCommand } from './commands/verify.js';
import { dryrunCommand } from './commands/dryrun.js';
import { runCommand } from './commands/run.js';
import { auditVerifyCommand } from './commands/auditVerify.js';
import { integrityCheckCommand, integrityGenerateCommand } from './commands/integrityCheck.js';
import { performIntegrityCheck } from '../core/integrity.js';
import { policySignCommand } from './commands/policySign.js';
import { healthCommand } from './commands/health.js';
import { policyAddCommand } from './commands/policyAdd.js';
import { policyModeCommand } from './commands/policyMode.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { instructionsCommand } from './commands/instructions.js';
import { openStateCommand } from './commands/openState.js';
import { proofCommand } from './commands/proof.js';
import { assertConsumerCommand } from './commands/assertConsumer.js';
import { auditWorkspaceCommand } from './commands/auditWorkspace.js';
import { intentCommand } from './commands/intent.js';
import { snapshotCommand } from './commands/snapshot.js';
import { scopeCommand } from './commands/scope.js';
import { runTui } from './tui.js';

function toBoolean(value, defaultValue = false) {
    if (value === undefined) return defaultValue;
    if (value === true || value === false) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return defaultValue;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

export async function main() {
    const argv = process.argv.slice(2);
    const wantsAdvancedHelp = argv.includes('--advanced');
    if (argv.includes('--version')) {
        console.log(`LBE v${packageJson.version} — LetterBlack Sentinel (Local Execution Governance)`);
        process.exit(0);
    }
    if (argv.length === 0) {
        await runTui({ version: packageJson.version, root: process.cwd() });
        process.exit(0);
    }
    if (argv.includes('--help') || argv.includes('-h')) {
        printHelp(packageJson.version, { advanced: wantsAdvancedHelp });
        process.exit(0);
    }

    const { command, opts } = parseArgs(argv);

    // Handle version flag
    if (opts.version) {
        console.log(`LBE v${packageJson.version} — LetterBlack Sentinel (Local Execution Governance)`);
        process.exit(0);
    }

    // Handle help flag or no command
    if (opts.help || !command || command === 'help') {
        printHelp(packageJson.version, { advanced: Boolean(opts.advanced) });
        process.exit(0);
    }

    try {
        // Parse --pub-key-file if provided
        if (opts['pub-key-file']) {
            try {
                opts['pub-key'] = fs.readFileSync(path.resolve(opts['pub-key-file']), 'utf-8').trim();
            } catch (error) {
                console.error(`Error reading public key file: ${error.message}`);
                process.exit(1);
            }
        }

        // Route to command handler
        if (['verify', 'dryrun', 'run'].includes(command)) {
            const integrityStrict = toBoolean(opts['integrity-strict'], false);
            const integrityManifestPath = path.resolve(opts['integrity-manifest'] || '.lbe/config/integrity.manifest.json');
            const integrityResult = await performIntegrityCheck({
                strict: integrityStrict,
                manifestPath: integrityManifestPath
            });
            if (!integrityResult.valid) {
                console.error(JSON.stringify({
                    status: 'error',
                    error: integrityResult.reason || 'INTEGRITY_CHECK_FAILED',
                    message: integrityResult.message
                }, null, 2));
                process.exit(8);
            }
        }

        switch (command) {
            case 'init':
                await initCommand(opts);
                break;

            case 'verify':
                await verifyCommand(opts);
                break;

            case 'dryrun':
                await dryrunCommand(opts);
                break;

            case 'run':
                await runCommand(opts);
                break;

            case 'audit-verify':
                await auditVerifyCommand(opts);
                break;

            case 'integrity-check':
                await integrityCheckCommand(opts);
                break;

            case 'integrity-generate':
                await integrityGenerateCommand(opts);
                break;

            case 'policy-sign':
                await policySignCommand(opts);
                break;

            case 'health':
                await healthCommand(opts);
                break;

            case 'policy-add':
                await policyAddCommand(opts);
                break;

            case 'observe':
            case 'enforce':
                await policyModeCommand(command, opts);
                break;

            case 'status':
                await statusCommand(opts);
                break;

            case 'logs':
                await logsCommand(opts);
                break;

            case 'open-state':
                await openStateCommand(opts);
                break;

            case 'proof':
                await proofCommand(opts);
                break;

            case 'intent':
                await intentCommand(opts._?.[0], opts);
                break;

            case 'snapshot':
                await snapshotCommand(opts._?.[0], opts);
                break;

            case 'scope':
                await scopeCommand(opts._?.[0], opts);
                break;

            case 'assert-consumer':
                await assertConsumerCommand(opts);
                break;
            case 'audit-workspace':
                await auditWorkspaceCommand(opts);
                break;

            case 'instructions':
                await instructionsCommand(opts);
                break;

            default:
                console.error(`Unknown command: ${command}`);
                printHelp(packageJson.version);
                process.exit(1);
        }
    } catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INTERNAL_ERROR',
            message: error.message,
            stack: process.env.DEBUG ? error.stack : undefined
        }));
        process.exit(9);
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        status: 'error',
        error: 'FATAL_ERROR',
        message: error.message
    }));
    process.exit(9);
});
