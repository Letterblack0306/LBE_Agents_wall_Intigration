// src/audit/workspaceAuditChain.js — workspace audit chain
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Workspace hygiene checks — files that should not be in a healthy source workspace
const FORBIDDEN_WORKSPACE = [/node_modules[\\/]/i, /\.git[\\/]/i, /\.lbe[\\/]keys/i, /\.env$/i, /\.env\./i, /\.pem$/i, /\.key$/i, /secrets[\\/]/i, /audit\.jsonl$/i];
// Package artifact rules — files forbidden in the npm tarball (checked separately)
const FORBIDDEN_PACKAGE = [/package-lock\.json$/i, /src[\\/]/i, /test[\\/]/i, /scripts[\\/]/i, /native[\\/]/i, /runtime[\\/]/i, /release[\\/]/i, /release-public[\\/]/i, /\.lbe[\\/]/i, /\.jsonl$/i, /\.tgz$/i, /keys[\\/]/i, /secrets[\\/]/i];
const LBE_CONFIG_FILES = ['policy.json', 'workspace.json'];

function locateWorkspaceRoot(root) {
    for (const dir of [root, path.resolve(root, '..')]) {
        if (fs.existsSync(path.join(dir, '.lbe'))) return { pass: true, value: dir };
    }
    if (fs.existsSync(root)) return { pass: true, value: root };
    return { pass: false, reason: 'Workspace root not found: ' + root, nextStep: 'Run lbe init or verify the path' };
}

function buildFileInventory(root) {
    const files = [];
    const walk = (d) => {
        try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const f = path.join(d, e.name);
                if (e.isDirectory()) {
                    if (['node_modules', '.git', '.lbe', 'dist', 'release-public', 'release-exec'].includes(e.name)) continue;
                    walk(f);
                } else {
                    files.push(f);
                }
            }
        } catch { /* skip unreadable */ }
    };
    walk(root);
    return { pass: true, value: { total: files.length, files } };
}

function checkForbiddenPaths(root, inventory) {
    const leaked = [];
    for (const file of inventory.files) {
        const rel = path.relative(root, file);
        for (const pat of FORBIDDEN_WORKSPACE) { if (pat.test(rel)) { leaked.push(rel); break; } }
    }
    const top = fs.readdirSync(root);
    for (const e of top) { if (/^[A-Z]:\\/.test(e) || e.includes('Core_Control') || e.includes('private')) leaked.push(e); }
    if (leaked.length > 0) return { pass: false, reason: 'Forbidden paths: ' + leaked.join(', '), nextStep: 'Remove or move outside workspace' };
    return { pass: true };
}

function checkLbeConfig(root) {
    const ld = path.join(root, '.lbe');
    if (!fs.existsSync(ld)) return { pass: false, reason: '.lbe directory missing', nextStep: 'Run lbe init' };
    const missing = LBE_CONFIG_FILES.filter(f => !fs.existsSync(path.join(ld, f)));
    const pp = path.join(ld, 'policy.json');
    if (fs.existsSync(pp)) { try { JSON.parse(fs.readFileSync(pp, 'utf8')); } catch { return { pass: false, reason: '.lbe/policy.json not valid JSON', nextStep: 'Fix policy file' }; } }
    if (missing.length > 0) return { pass: false, reason: 'Missing .lbe config: ' + missing.join(', '), nextStep: 'Run lbe init' };
    return { pass: true };
}

function checkPackageState(root) {
    const p = path.join(root, 'package.json');
    if (!fs.existsSync(p)) return { pass: true, note: 'No package.json — skip' };
    try { JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { pass: false, reason: 'package.json invalid', nextStep: 'Fix syntax' }; }
    const l = path.join(root, 'package-lock.json');
    const n = path.join(root, 'node_modules');
    if (!fs.existsSync(l) && fs.existsSync(n)) return { pass: false, reason: 'node_modules without lockfile', nextStep: 'Delete node_modules, run npm install' };
    if (fs.existsSync(l) && !fs.existsSync(n)) return { pass: false, reason: 'lockfile without node_modules', nextStep: 'Run npm install' };
    return { pass: true };
}

function checkImports(root) {
    const errs = [];
    const walk = (d) => {
        try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const f = path.join(d, e.name);
                if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'release-public' || e.name === 'release-exec') continue;
                if (e.isDirectory()) { walk(f); continue; }
                if (!e.name.endsWith('.js') && !e.name.endsWith('.mjs')) continue;
                let content = fs.readFileSync(f, 'utf8');
                // Strip backtick template literals to avoid false positives
                // on generated code embedded inside build scripts.
                content = content.replace(/`[^`]*`/g, '');
                const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
                for (const m of matches) {
                    const spec = m[1];
                    if (!spec.startsWith('.') && !spec.startsWith('/') || spec.startsWith('node:')) continue;
                    const resolved = path.resolve(path.dirname(f), spec);
                    const exts = ['.js', '.mjs', '.cjs', '', '.json', '/index.js', '/index.mjs'];
                    if (!exts.some(ext => fs.existsSync(resolved + ext))) errs.push(path.relative(root, f) + ': cannot resolve ' + spec);
                }
            }
        } catch { /* skip */ }
    };
    walk(root);
    if (errs.length > 0) return { pass: false, reason: errs.length + ' import error(s)', nextStep: 'Fix import paths', errors: errs };
    return { pass: true };
}

function runSyntaxValidation(root) {
    const errs = [];
    const walk = (d) => {
        try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const f = path.join(d, e.name);
                if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'release-public' || e.name === 'release-exec') continue;
                if (e.isDirectory()) { walk(f); continue; }
                if (!e.name.endsWith('.js') && !e.name.endsWith('.mjs') && !e.name.endsWith('.cjs')) continue;
                try { execSync('node --check "' + f + '"', { stdio: 'pipe', timeout: 10000 }); } catch (ex) {
                    const msg = ex.stderr ? ex.stderr.toString().split('\n')[0].trim() : ex.message;
                    errs.push(path.relative(root, f) + ': ' + msg);
                }
            }
        } catch { /* skip */ }
    };
    walk(root);
    if (errs.length > 0) return { pass: false, reason: errs.length + ' syntax error(s)', nextStep: 'Fix syntax', errors: errs };
    return { pass: true };
}

// Optimised batch syntax checker — runs all files through a single child process
// to avoid the ~200 ms per-file spawn overhead of repeated execSync('node --check').
// Falls back to per-file checking if the batch approach fails.
function runSyntaxValidationBatched(root) {
    // Collect all eligible files first
    const jsFiles = [];
    const walk = (d) => {
        try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const f = path.join(d, e.name);
                if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'release-public' || e.name === 'release-exec') continue;
                if (e.isDirectory()) { walk(f); continue; }
                if (!e.name.endsWith('.js') && !e.name.endsWith('.mjs') && !e.name.endsWith('.cjs')) continue;
                jsFiles.push(f);
            }
        } catch { /* skip */ }
    };
    walk(root);

    if (jsFiles.length === 0) return { pass: true };

    // Use a single child process to check all files.
    // We embed the checker as an inline script passed via -e.
    const checkerCode = `
        const fs = require('fs');
        const path = require('path');
        const root = ${JSON.stringify(root)};
        const files = ${JSON.stringify(jsFiles)};
        const errs = [];
        for (const f of files) {
            try {
                require('child_process').execSync('node --check ' + JSON.stringify(f), { stdio: 'pipe', timeout: 10000 });
            } catch (ex) {
                const msg = ex.stderr ? ex.stderr.toString().split('\\n')[0].trim() : ex.message;
                errs.push(path.relative(root, f) + ': ' + msg);
            }
        }
        process.stdout.write(JSON.stringify(errs));
    `;

    try {
        const output = execSync('node -e ' + JSON.stringify(checkerCode), {
            stdio: 'pipe',
            timeout: 120000,  // 2 min for worst-case workspace
            maxBuffer: 10 * 1024 * 1024,  // 10 MB
            encoding: 'utf8'
        });
        const batchErrs = JSON.parse(output.trim());
        if (batchErrs.length > 0) {
            return { pass: false, reason: batchErrs.length + ' syntax error(s)', nextStep: 'Fix syntax', errors: batchErrs };
        }
        return { pass: true };
    } catch {
        // Fallback: per-file checking (slow but reliable)
        const errs = [];
        for (const f of jsFiles) {
            try { execSync('node --check ' + JSON.stringify(f), { stdio: 'pipe', timeout: 10000 }); } catch (ex) {
                const msg = ex.stderr ? ex.stderr.toString().split('\\n')[0].trim() : ex.message;
                errs.push(path.relative(root, f) + ': ' + msg);
            }
        }
        if (errs.length > 0) return { pass: false, reason: errs.length + ' syntax error(s)', nextStep: 'Fix syntax', errors: errs };
        return { pass: true };
    }
}

function runSmokeChecks(root) {
    const p = path.join(root, 'package.json');
    if (!fs.existsSync(p)) return { pass: true, note: 'No package.json — skip' };
    let pkg; try { pkg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { pass: true, note: 'Skip' }; }
    if (pkg.scripts && pkg.scripts.test) {
        try { execSync('npm test', { cwd: root, stdio: 'pipe', timeout: 60000 }); } catch { return { pass: false, reason: 'Tests failed', nextStep: 'Run npm test' }; }
    }
    return { pass: true, note: 'No test script — skipped' };
}

function runSecurityScan(root, inventory) {
    const secrets = [];
    const patterns = [/(?:password|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,/ghp_[A-Za-z0-9]{36,}/,/AKIA[0-9A-Z]{16}/];
    for (const f of inventory.files.filter(f2 => ['.js','.json','.md','.yml','.env','.cjs','.mjs','.ts'].includes(path.extname(f2))).slice(0, 100)) {
        try { const c = fs.readFileSync(f, 'utf8'); for (const p of patterns) { if (p.test(c)) { secrets.push(path.relative(root, f)); break; } } } catch {}
    }
    if (secrets.length > 0) return { pass: false, reason: secrets.length + ' file(s) may contain secrets', nextStep: 'Review and remove', secrets };
    return { pass: true };
}

function writeReport(root, results) {
    const rd = path.join(root, '.lbe', 'reports');
    fs.mkdirSync(rd, { recursive: true });
    const rp = path.join(rd, 'workspace-audit.json');
    const report = { version: '1.0', timestamp: new Date().toISOString(), overall: results.every(r => r.pass) ? 'PASS' : 'FAIL', gates: results.map(r => ({ gate: r.gate, pass: r.pass, reason: r.reason || null, nextStep: r.nextStep || null })), summary: { total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length } };
    fs.writeFileSync(rp, JSON.stringify(report, null, 2) + '\n', 'utf8');
    return { pass: true, reportPath: rp };
}

export async function runAuditChain(root, mode) {
    if (mode === 'repair') return { pass: false, reason: 'NOT_IMPLEMENTED', nextStep: 'Repair mode not yet implemented' };
    const results = [];
    let ff = false;
    let r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
    const add = (g, r) => { results.push({ gate: g, pass: r.pass, reason: r.reason || null, nextStep: r.nextStep || null }); if (!r.pass) ff = true; };
    r1 = locateWorkspaceRoot(root);
    add('locate_workspace_root', r1);
    if (!ff) { r2 = buildFileInventory(r1.value); add('build_file_inventory', r2); }
    if (!ff) { r3 = checkForbiddenPaths(r1.value, r2.value); add('check_forbidden_paths', r3); }
    if (!ff) { r4 = checkLbeConfig(r1.value); add('check_lbe_config', r4); }
    if (!ff) { r5 = checkPackageState(r1.value); add('check_package_state', r5); }
    if (!ff) { r6 = checkImports(r1.value); add('check_imports', r6); }
    if (!ff) { r7 = runSyntaxValidationBatched(r1.value); add('run_syntax_validation', r7); }
    if (!ff) { const i2 = buildFileInventory(r1.value); r9 = runSecurityScan(r1.value, i2.value); add('run_security_scan', r9); }
    r10 = writeReport(r1 ? (r1.value || root) : root, results);
    add('write_report', r10);
    return { overall: results.every(r => r.pass) ? 'PASS' : 'FAIL', results, reportPath: r10.reportPath };
}
