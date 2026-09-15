import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceState } from '../../state/index.js';
import { loadLatestProof } from '../../state/proofRunner.js';
import { runAuditProof } from '../../state/auditMode.js';

function buildPublicProof(proof, targets) {
    const lastTarget = Array.isArray(targets) && targets.length > 0
        ? targets[targets.length - 1]
        : null;

    // Redact: only expose safe, non-identifying fields
    const pub = {
        result:      proof.result,
        profile:     proof.profile,
        checks:      proof.checks_run || [],
        allow_deny:  (proof.failures && proof.failures.length > 0) ? 'deny' : 'allow',
    };

    if (lastTarget) {
        pub.target_type  = lastTarget.kind        || null;
        pub.target_label = lastTarget.label       || null;
        // component_file is a relative path — safe to include as-is
        pub.target_file  = lastTarget.component_file || null;
    }

    // Include failure reasons but NOT the raw file paths
    if (proof.failures && proof.failures.length > 0) {
        pub.failure_reasons = proof.failures.map(f => ({ check: f.check, reason: f.reason }));
    }

    return pub;
}

/**
 * lbe proof [--json] [--public] [--root <path>]
 *
 * Reads proof/latest.json from the central state store and prints it.
 * Does not re-run proof; use the programmatic API for that.
 *
 * @returns {{ result, profile, found } | null}
 */
export async function proofCommand(opts) {
    const workspaceRoot = path.resolve(opts.root || process.cwd());
    const { stateDir } = resolveWorkspaceState(workspaceRoot);

    let proof = loadLatestProof(stateDir);
    const beforePath = path.join(stateDir, 'file-index', 'before.json');
    const afterPath = path.join(stateDir, 'file-index', 'after.json');
    if ((!proof || opts.run === true || opts.run === 'true') && fs.existsSync(beforePath) && fs.existsSync(afterPath)) {
        proof = runAuditProof(opts).proof;
    }
    const isPublic = opts.public === true || opts.public === 'true';
    const isJson   = opts.json   === true || opts.json   === 'true' || isPublic;

    if (!proof) {
        if (isJson) {
            console.log(JSON.stringify({ found: false, status: 'PROOF_INCOMPLETE', message: 'No proof record found. Run lbe snapshot before, lbe snapshot after, then lbe proof.' }, null, 2));
        } else {
            console.log('\nNo proof record found.');
            console.log('Use Audit Mode: lbe intent begin, lbe snapshot before, lbe snapshot after, lbe proof\n');
        }
        return { found: false };
    }

    // Load targets for public redaction
    let targets = [];
    if (isPublic) {
        const targetPath = path.join(stateDir, 'target_registry.jsonl');
        if (fs.existsSync(targetPath)) {
            const raw = fs.readFileSync(targetPath, 'utf8').trim();
            targets = raw ? raw.split('\n').reduce((acc, l) => {
                try { acc.push(JSON.parse(l)); } catch (_) { /* ignore */ }
                return acc;
            }, []) : [];
        }
    }

    if (isPublic) {
        const pub = buildPublicProof(proof, targets);
        console.log(JSON.stringify(pub, null, 2));
        return { found: true, result: proof.result, profile: proof.profile, public: true };
    }

    if (isJson) {
        console.log(JSON.stringify(proof, null, 2));
        return { found: true, result: proof.result, profile: proof.profile };
    }

    // Human-readable output
    const resultMark = proof.result === 'PASS' ? '✓' : proof.result === 'WEAK_PROOF' ? '⚠' : '✗';
    const workspace  = path.basename(workspaceRoot);
    console.log(`\nLBE Proof — ${workspace}`);
    if (proof.user_status) console.log(`  Status         ${proof.user_status}`);
    console.log(`  Result         ${resultMark} ${proof.result}`);
    console.log(`  Profile        ${proof.profile}`);
    console.log(`  Changed files  ${(proof.files_changed || []).length}`);
    console.log(`  Checks run     ${(proof.checks_run || []).join(', ')}`);
    if (proof.failures && proof.failures.length > 0) {
        console.log(`  Failures       ${proof.failures.length}`);
        for (const f of proof.failures) {
            console.log(`    • [${f.check}] ${f.reason}${f.file ? ': ' + f.file : ''}`);
        }
    }
    console.log(`  Recorded at    ${proof.ts}`);
    console.log('');

    return { found: true, result: proof.result, profile: proof.profile };
}
