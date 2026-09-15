// src/cli/commands/run.js
// Validate and execute a proposal

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateCommand } from '../../core/validator.js';
import { NonceStore } from '../../core/nonceStore.js';
import { executeAdapter } from '../../adapters/index.js';
import { appendAudit } from '../../core/auditLog.js';
import { loadKeysStore } from '../../core/trustedKeys.js';
import { RequestRateLimiter } from '../../core/requestRateLimiter.js';
import { verifyPolicySignature } from '../../core/policySignature.js';
import { validateAndUpdatePolicyVersionState } from '../../core/policyVersionGuard.js';
import { getApprovalManager } from '../../core/approval-token.js';
import { createBackup, restoreBackup } from '../../core/backup.js';
import { loadLocalPolicy, evaluateLocalPolicy, auditLocalPolicy } from '../../core/localPolicy.js';

function sha256(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export async function runCommand(opts) {
    const { in: inFile } = opts;
    const config = opts.config || opts.policy;
    const pubKey = opts['pub-key'];
    const keysStorePath = opts['keys-store'] || path.resolve('.lbe/config/keys.json');
    const policySigPath = opts['policy-sig'] || path.resolve('.lbe/config/policy.sig.json');
    const policyStatePath = opts['policy-state'] || path.resolve('.lbe/data/policy.state.json');
    const allowUnsignedPolicy = opts['policy-unsigned-ok'] === true || String(opts['policy-unsigned-ok']).toLowerCase() === 'true';
    // Validate required arguments
    if (!inFile) {
        console.error('Error: --in <file> is required');
        process.exit(1);
    }

    // Read proposal file
    let proposal;
    try {
        const filePath = path.resolve(inFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        proposal = JSON.parse(content);
    } catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INVALID_PROPOSAL_FILE',
            message: error.message
        }));
        process.exit(5);
    }

    // Load policy
    let policy;
    try {
        const policyPath = config || path.resolve('.lbe/config/policy.default.json');
        if (!fs.existsSync(policyPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'MISSING_POLICY',
                message: `Policy file not found: ${policyPath}`
            }));
            process.exit(1);
        }
        const policyContent = fs.readFileSync(policyPath, 'utf-8');
        policy = JSON.parse(policyContent);
    } catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'INVALID_POLICY',
            message: error.message
        }));
        process.exit(1);
    }

    // Project-local rules are controller-owned and take precedence over any
    // observer allow. Observe mode records a would-deny decision only.
    const rootDir = process.cwd();
    let localPolicy;
    try {
        localPolicy = loadLocalPolicy(rootDir);
    } catch (error) {
        console.error(JSON.stringify({ status: 'error', error: 'LOCAL_POLICY_INVALID', message: error.message }));
        process.exit(1);
    }
    const localDecision = evaluateLocalPolicy(localPolicy.policy, rootDir, {
        target: proposal.payload?.target,
        command: proposal.payload?.cmd
    });
    const localBlocked = localPolicy.policy.mode === 'enforce' && !localDecision.allowed;
    auditLocalPolicy(rootDir, {
        commandId: proposal.commandId || 'N/A', requesterId: proposal.requesterId || 'unknown',
        mode: localPolicy.policy.mode, decision: localBlocked ? 'deny' : 'allow',
        wouldDeny: !localDecision.allowed, ruleIds: localDecision.winningRules.map(rule => rule.id)
    });
    if (localBlocked) {
        console.error(JSON.stringify({ status: 'blocked', error: 'LOCAL_POLICY_DENY', ruleIds: localDecision.winningRules.map(rule => rule.id) }, null, 2));
        process.exit(2);
    }

    // Load key store (preferred) with legacy pub-key fallback
    const keyStoreResult = loadKeysStore(keysStorePath);
    const keyStore = keyStoreResult.ok ? keyStoreResult.store : null;

    // Preflight: policy signature verification (strict by default)
    const policySigCheck = verifyPolicySignature({
        policyObj: policy,
        keyStore,
        policySigPath,
        allowUnsigned: allowUnsignedPolicy
    });
    if (!policySigCheck.ok) {
        console.error(JSON.stringify({
            status: 'error',
            error: policySigCheck.reason,
            message: policySigCheck.message
        }, null, 2));
        process.exit(8);
    }

    const versionCheck = validateAndUpdatePolicyVersionState({
        policyObj: policy,
        statePath: policyStatePath,
        maxCreatedAtSkewSec: policy?.security?.maxPolicyCreatedAtSkewSec
    });
    if (!versionCheck.ok) {
        console.error(JSON.stringify({
            status: 'error',
            error: versionCheck.reason,
            message: versionCheck.message
        }, null, 2));
        process.exit(8);
    }

    // Load nonce store
    const nonceDb = new NonceStore(path.resolve('.lbe/data/nonce.db.json'));
    await nonceDb.load();

    if (!keyStore && !pubKey) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'MISSING_KEY_MATERIAL',
            message: `${keyStoreResult.message}. Provide --pub-key/--pub-key-file or create .lbe/config/keys.json`
        }));
        process.exit(1);
    }

    // Load requester rate limiter
    const rateLimiter = new RequestRateLimiter(path.resolve('.lbe/data/rate-limit.db.json'));
    await rateLimiter.load();

    // Validate command
    const validateResult = validateCommand({
        commandObj: proposal,
        pubKeyB64: pubKey,
        keyStore,
        nonceDb,
        policy,
        rateLimiter
    });

    if (!validateResult.valid) {
        // Persist state from checks that may record entries prior to rejection.
        try {
            await nonceDb.save();
            await rateLimiter.save();
        } catch (err) {
            console.error(JSON.stringify({
                status: 'error',
                stage: 'nonce_persist',
                error: 'NONCE_SAVE_FAILED',
                code: 'NONCE_SAVE_FAILED',
                message: err.message
            }, null, 2));
            process.exit(10);
        }

        const output = {
            status: 'invalid',
            commandId: proposal.commandId || 'N/A',
            checks: validateResult.checks,
            errors: validateResult.errors || [],
            executionResult: null
        };
        console.error(JSON.stringify(output, null, 2));

        // Load audit log and append this rejection
        const auditPath = path.resolve('.lbe/data/audit.log.jsonl');
        try {
            appendAudit(auditPath, {
                commandId: proposal.commandId || 'N/A',
                status: 'rejected',
                requesterId: proposal.requesterId || 'unknown',
                payloadHash: sha256(proposal),
                reason: validateResult.checks,
                timestamp: new Date().toISOString()
            });
        } catch (auditErr) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'AUDIT_WRITE_FAILED',
                message: auditErr.message
            }));
            process.exit(10);
        }

        if (validateResult.checks.schema === false) process.exit(5);
        if (validateResult.checks.signature === false) process.exit(3);
        if (validateResult.checks.nonce === false) process.exit(4);
        if (validateResult.checks.timestamp === false) process.exit(6);
        if (validateResult.checks.rateLimit === false) process.exit(7);
        if (validateResult.checks.policy === false) process.exit(2);
        process.exit(9);
    }

    const risk = validateResult.risk || 'LOW';
    const adapterName = proposal.payload.adapter || 'shell';
    const requesterPolicy = policy.requesters?.[proposal.requesterId];

    // Approval gate — pause if the requester policy marks this risk level for approval
    const approvalRule = requesterPolicy?.requireApproval;
    const approvalRequired = approvalRule === true
        || (Array.isArray(approvalRule) && (
            approvalRule.includes(risk)
            || approvalRule.includes('*')
            || (['HIGH', 'CRITICAL'].includes(risk) && approvalRule.includes('HIGH+'))
        ));

    if (approvalRequired) {
        const mgr = getApprovalManager();
        const tokenId = mgr.createToken(proposal.commandId, {
            requesterId: proposal.requesterId,
            adapter: adapterName,
            risk
        });

        try {
            await nonceDb.save();
            await rateLimiter.save();
        } catch (err) {
            console.error(JSON.stringify({
                status: 'error',
                stage: 'nonce_persist',
                error: 'NONCE_SAVE_FAILED',
                code: 'NONCE_SAVE_FAILED',
                message: err.message
            }, null, 2));
            process.exit(10);
        }

        console.log(JSON.stringify({
            status: 'approval_pending',
            commandId: proposal.commandId || 'N/A',
            risk,
            approvalToken: tokenId,
            approvalPending: true,
            approvalRequired: true,
            message: `${risk} risk operation is pending approval. Automatic resume is not implemented and is planned for a future release.`
        }, null, 2));
        process.exit(11);
    }

    // Backup — create before execution for file adapter or when --backup flag is set
    let backup = null;
    const shouldBackup = opts.backup === true || adapterName === 'file';
    if (shouldBackup && proposal.payload.target) {
        try {
            backup = createBackup(path.resolve(proposal.payload.target));
        } catch {
            // Non-fatal — execution continues without backup
        }
    }

    // Execute with appropriate adapter
    let executionResult;
    try {
        executionResult = await executeAdapter(adapterName, proposal, policy, requesterPolicy);
    } catch (error) {
        executionResult = {
            adapter: adapterName,
            status: 'error',
            error: error.message,
            exitCode: 1
        };
    }

    const executionFailed = executionResult.status === 'error' || executionResult.exitCode !== 0;

    // Rollback on failure — restore backup if execution failed and we have one
    let rollbackResult = null;
    if (executionFailed && backup && opts['rollback-on-failure'] !== false) {
        try {
            rollbackResult = restoreBackup(backup);
        } catch (e) {
            rollbackResult = { restored: false, error: e.message };
        }
    }

    // Post-execution validation — verify target exists after a write/patch
    let postValidation = null;
    if (!executionFailed && proposal.payload.target) {
        const writeActions = ['write', 'patch'];
        if (writeActions.includes(proposal.payload.action)) {
            const exists = fs.existsSync(path.resolve(proposal.payload.target));
            postValidation = { ok: exists, check: 'target_exists', target: proposal.payload.target };
            if (!exists && backup) {
                rollbackResult = restoreBackup(backup);
                executionResult.status = 'error';
            }
        }
    }

    const fallbackExitCode = executionFailed
        ? 10
        : ((postValidation && !postValidation.ok) ? 8 : 0);
    const finalExitCode = Number.isInteger(executionResult.exitCode)
        ? executionResult.exitCode
        : fallbackExitCode;

    // Log to audit trail
    // payloadHash: SHA-256 of the validated proposal — proves what the adapter received
    // executionHash: SHA-256 of the adapter result — proves what the adapter returned
    // Together these bind the validation result to the execution result in the immutable log
    const auditPath = path.resolve('.lbe/data/audit.log.jsonl');
    try {
        appendAudit(auditPath, {
            commandId: proposal.commandId || 'N/A',
            status: rollbackResult?.restored ? 'rolled_back' : (executionResult.status || 'completed'),
            requesterId: proposal.requesterId || 'unknown',
            payloadHash: sha256(proposal),
            executionHash: sha256(executionResult),
            adapter: executionResult.adapter,
            riskLevel: risk,
            exitCode: finalExitCode,
            rolledBack: rollbackResult?.restored || false,
            timestamp: new Date().toISOString()
        });
    } catch (auditErr) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'AUDIT_WRITE_FAILED',
            message: auditErr.message
        }));
        process.exit(10);
    }

    // Save nonce DB (records the nonce as used)
    await nonceDb.save();
    await rateLimiter.save();

    // Output structured result
    const output = {
        status: executionFailed || (postValidation && !postValidation.ok) ? 'failed' : 'executed',
        commandId: proposal.commandId || 'N/A',
        risk,
        checks: validateResult.checks,
        executionResult: {
            adapter: executionResult.adapter,
            status: executionResult.status || 'completed',
            output: executionResult.output || executionResult.error || '',
            exitCode: executionResult.exitCode || 0
        },
        backup: backup ? { path: backup.backupPath, existed: backup.existed, hash: backup.hash } : null,
        rollback: rollbackResult,
        postValidation
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(finalExitCode);
}
