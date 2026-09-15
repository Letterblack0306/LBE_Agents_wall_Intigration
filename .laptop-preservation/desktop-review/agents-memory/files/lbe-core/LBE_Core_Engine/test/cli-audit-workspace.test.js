// test/cli-audit-workspace.test.js
// Tests for lbe audit-workspace command

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runAuditChain } from '../src/audit/workspaceAuditChain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(__dirname, '..', '.lbe'), { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', '.lbe', 'test-audit-XXXXXX'));
const lbeDir = path.join(tmpDir, '.lbe');
const reportDir = path.join(lbeDir, 'reports');

function writeFile(rel, content = '') {
    const p = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
}

function readReport() {
    const rp = path.join(reportDir, 'workspace-audit.json');
    if (!fs.existsSync(rp)) return null;
    return JSON.parse(fs.readFileSync(rp, 'utf8'));
}

describe('audit-workspace', () => {
    before(() => {
        fs.mkdirSync(lbeDir, { recursive: true });
        writeFile('.lbe/policy.json', JSON.stringify({ version: 1, mode: 'observe', rules: [] }));
        writeFile('.lbe/workspace.json', JSON.stringify({ lbe: true, version: '1.0' }));
        writeFile('package.json', JSON.stringify({ name: 'test-ws', version: '0.0.1' }));
        writeFile('README.md', '# test');
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('clean temp workspace returns PASS', async () => {
        const r = await runAuditChain(tmpDir, 'audit');
        assert.equal(r.overall, 'PASS', 'clean workspace should pass');
        assert.ok(r.results.length >= 4, 'should run at least 4 gates');
    });

    it('missing .lbe/policy.json returns FAIL with exact path', async () => {
        fs.unlinkSync(path.join(lbeDir, 'policy.json'));
        const r = await runAuditChain(tmpDir, 'audit');
        assert.equal(r.overall, 'FAIL');
        const cfg = r.results.find(g => g.gate === 'check_lbe_config');
        assert.ok(cfg, 'should have check_lbe_config gate');
        assert.ok(cfg.reason.includes('Missing'), 'reason mentions missing');
        assert.ok(cfg.reason.includes('policy.json'), 'reason mentions policy.json');
        // Restore
        writeFile('.lbe/policy.json', JSON.stringify({ version: 1, mode: 'observe', rules: [] }));
    });

    it('.env in workspace returns FAIL', async () => {
        writeFile('.env', 'SECRET=value');
        const r = await runAuditChain(tmpDir, 'audit');
        assert.equal(r.overall, 'FAIL');
        const fb = r.results.find(g => g.gate === 'check_forbidden_paths');
        assert.ok(fb, 'should have check_forbidden_paths gate');
        assert.ok(fb.reason.includes('.env'), 'reason mentions .env');
        fs.unlinkSync(path.join(tmpDir, '.env'));
    });

    it('package-lock.json alone does not fail workspace audit', async () => {
        writeFile('package-lock.json', '{}');
        fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
        const r = await runAuditChain(tmpDir, 'audit');
        assert.equal(r.overall, 'PASS', 'package-lock.json should not fail workspace audit');
        fs.unlinkSync(path.join(tmpDir, 'package-lock.json'));
        fs.rmSync(path.join(tmpDir, 'node_modules'), { recursive: true, force: true });
    });

    it('repair mode returns NOT_IMPLEMENTED', async () => {
        const r = await runAuditChain(tmpDir, 'repair');
        assert.ok(!r.pass === undefined || !r.pass, 'repair should fail');
        const first = r.results ? r.results[0] : r;
        assert.ok(first.reason === 'NOT_IMPLEMENTED' || (r.results && r.results[0].reason === 'NOT_IMPLEMENTED'),
            'reason should be NOT_IMPLEMENTED');
    });

    it('audit report is written to .lbe/reports/workspace-audit.json', async () => {
        const r = await runAuditChain(tmpDir, 'audit');
        assert.equal(r.overall, 'PASS');
        const report = readReport();
        assert.ok(report, 'report file should exist');
        assert.equal(report.overall, 'PASS');
        assert.ok(report.timestamp, 'report should have timestamp');
        assert.ok(report.gates.length >= 4, 'report should have gates');
        assert.equal(report.summary.passed, report.gates.length,
            'ALL gates should pass in clean workspace');
    });

    it('template string imports in build script do not fail workspace audit', async () => {
        // Simulate a build script with `import { x } from './nonexistent.js'` inside
        // a template literal — these are generated code strings, not real imports.
        writeFile('scripts/dummy-build.mjs', [
            "import fs from 'node:fs';",
            "import path from 'node:path';",
            "const outDir = '/tmp/out';",
            "fs.writeFileSync(path.join(outDir, 'cli.js'), `#!/usr/bin/env node",
            "import { execute } from './index.js';",
            "import { createLBE, generateKeyPair } from './core.js';",
            "console.log('hello');",
            "`);",
            "fs.writeFileSync(path.join(outDir, 'sdk.js'), `import fs from 'node:fs';",
            "import { createLBE } from './core.js';",
            "`);",
            "console.log('built');",
            ''
        ].join('\n'));
        const r = await runAuditChain(tmpDir, 'audit');
        const imp = r.results.find(g => g.gate === 'check_imports');
        assert.ok(imp, 'should have check_imports gate');
        assert.equal(imp.pass, true,
            'template string imports should not trigger false positive');
        // Cleanup
        fs.rmSync(path.join(tmpDir, 'scripts'), { recursive: true, force: true });
    });

    it('real missing relative import still fails workspace audit', async () => {
        // Build the import string dynamically so it doesn't appear as a literal
        // import in this test file itself (avoiding false positives when the
        // test file is scanned by the audit chain).
        const importLine = "import { something } from '" + './non-existent-module.js' + "';";
        writeFile('src/missing-import-test.js', [
            "import fs from 'node:fs';",
            "import path from 'node:path';",
            importLine,
            "console.log('hello');",
            ''
        ].join('\n'));
        const r = await runAuditChain(tmpDir, 'audit');
        const imp = r.results.find(g => g.gate === 'check_imports');
        assert.ok(imp, 'should have check_imports gate');
        assert.equal(imp.pass, false,
            'real unresolved relative import should fail');
        assert.ok(imp.reason.includes('import error'),
            'reason should mention import errors');
        // Cleanup
        fs.rmSync(path.join(tmpDir, 'src'), { recursive: true, force: true });
    });

    it('syntax validation ignores double-shebang in generated dist', async () => {
        // release-exec/dist/ is a generated artifact — double-shebang should
        // not cause run_syntax_validation to fail during workspace audit.
        writeFile('release-exec/dist/cli.js', '#!/usr/bin/env node\n#!/usr/bin/env node\n');
        writeFile('release-public/dist/bundle.js', '#!/usr/bin/env node\n#!/usr/bin/env node\n');
        writeFile('dist/out.js', '#!/usr/bin/env node\n#!/usr/bin/env node\n');
        const r = await runAuditChain(tmpDir, 'audit');
        const syn = r.results.find(g => g.gate === 'run_syntax_validation');
        assert.ok(syn, 'should have run_syntax_validation gate');
        assert.equal(syn.pass, true,
            'generated dir syntax errors should be ignored by workspace audit');
        // Cleanup
        fs.rmSync(path.join(tmpDir, 'release-exec'), { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, 'release-public'), { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, 'dist'), { recursive: true, force: true });
    });

    it('syntax validation still catches real syntax error in source files', async () => {
        // Use .mjs extension so file is always treated as ESM regardless of
        // the CJS/ESM setting of package.json in the temp workspace.
        writeFile('src/bad-syntax.mjs', [
            "import fs from 'node:fs';",
            'const x = ;',  // syntax error: unexpected token
            "console.log('hello');",
            ''
        ].join('\n'));
        const r = await runAuditChain(tmpDir, 'audit');
        const syn = r.results.find(g => g.gate === 'run_syntax_validation');
        assert.ok(syn, 'should have run_syntax_validation gate');
        assert.equal(syn.pass, false,
            'source file syntax errors should still fail workspace audit');
        assert.ok(syn.reason.includes('syntax error'),
            'reason should mention syntax error');
        // Cleanup
        fs.rmSync(path.join(tmpDir, 'src'), { recursive: true, force: true });
    });

    it('check_imports does not scan generated output directories', async () => {
        // Generated output dirs should be skipped — broken imports inside
        // dist/, release-exec/, release-public/ must not trigger failures.
        // Build the content dynamically so the test file itself does NOT
        // contain a literal `from './somepath.js'` pattern that would cause
        // a false positive when the workspace audit scans this test file.
        const badImport = "import { x } from '" + './nonexistent.js' + "';\n";
        writeFile('dist/bad-import.js', badImport);
        writeFile('release-exec/bad-import.js', badImport);
        writeFile('release-public/bad-import.js', badImport);
        const r = await runAuditChain(tmpDir, 'audit');
        const imp = r.results.find(g => g.gate === 'check_imports');
        assert.ok(imp, 'should have check_imports gate');
        assert.equal(imp.pass, true,
            'generated dir broken imports should be ignored by workspace audit');
        // Cleanup
        fs.rmSync(path.join(tmpDir, 'dist'), { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, 'release-exec'), { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, 'release-public'), { recursive: true, force: true });
    });

});
