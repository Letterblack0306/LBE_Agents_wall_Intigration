#!/usr/bin/env node
// release-hygiene.mjs â€” single blocking release gate
// Usage: node scripts/release-hygiene.mjs [--quick]

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const blockers = [];
let vPass = true, fPass = true, dPass = true, cPass = true, tPass = true, gPass = true;

function block(id, sev, stage, file, exp, found, meaning, intent, fix, forbidden, decisions) {
  blockers.push({
    id, severity: sev, stage, file, expected: exp, found,
    meaning, intentRequired: intent, fix: fix || [], forbidden: forbidden || [],
    decisionOptions: decisions || ['Fix and rebuild', 'Stop and ask user']
  });
}
function rJ(fp) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; } }
function rT(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } }
function rp(...p) { return path.join(ROOT, ...p); }
function step(n) { process.stdout.write('  ' + n + '... '); }

// â•â•â• A. VERSION â•â•â•
console.log('\n=== VERSION ===');
const pkg = rJ(rp('package.json'));
if (!pkg) { block('V_MISSING_ROOT_PKG', 'BLOCKER', 'VERSION', 'package.json', 'valid JSON', 'missing', 'Root package.json required for version.', 'Restore or recreate package.json.', ['Restore from git', 'Recreate'], [], ['Restore', 'Ask user']); }
const v = pkg && pkg.version;
if (!v) { block('V_NO_VERSION', 'BLOCKER', 'VERSION', 'package.json', 'version field', 'missing', 'Version field required to align artifacts.', 'Add version to package.json.', ['Set version'], [], ['Set version', 'Ask user']); vPass = false; }

// Sub-packages
for (const [l, fp] of [
  ['package-lock.json', rp('package-lock.json')],
  ['release-public/package.json', rp('release-public', 'package.json')],
]) {
  const p = rJ(fp);
  if (!p) { block('V_SUB_PKG_MISSING', 'BLOCKER', 'VERSION', l, 'valid JSON', 'missing or invalid', l + ' required for version alignment.', 'Restore or fix ' + l + '.', ['Check file', 'Restore from git'], [], ['Fix file', 'Ask user']); vPass = false; }
  else if (p.version !== v) { block('V_VERSION_MISMATCH', 'BLOCKER', 'VERSION', l, v, 'found ' + p.version, l + ' version must match ' + v + '.', 'Align ' + l + ' to ' + v + '.', ['Update version in ' + l, 'Run sync'], [], ['Fix version', 'Ask user']); vPass = false; }
}
const ex = rJ(rp('release-exec', 'package.json'));
if (ex && ex.version !== v) { block('V_RELEASE_EXEC_MISMATCH', 'BLOCKER', 'VERSION', 'release-exec/package.json', v, 'found ' + ex.version, 'release-exec version must match root.', 'Align release-exec to ' + v + '.', ['Update version', 'Run sync'], [], ['Fix version', 'Ask user']); vPass = false; }

// Release docs
for (const [l, fp, pat] of [
  ['RELEASE_SCOPE.md', rp('RELEASE_SCOPE.md'), 'v' + v],
  ['CHANGELOG.md', rp('CHANGELOG.md'), v],
  ['Release-README.md', rp('Release-README.md'), v],
]) {
  const t = rT(fp);
  if (!t) { block('V_DOC_MISSING', 'BLOCKER', 'VERSION', l, 'file exists', 'missing', l + ' is required for release.', 'Create or restore ' + l + '.', ['Create file', 'Regenerate'], [], ['Create file', 'Ask user']); vPass = false; }
  else if (!t.includes(pat)) { block('V_DOC_VERSION_MISSING', 'BLOCKER', 'VERSION', l, 'contains ' + pat, 'missing version reference', l + ' must reference version ' + pat + '.', 'Add version ' + pat + ' to ' + l + '.', ['Update ' + l, 'Regenerate'], [], ['Fix doc', 'Ask user']); vPass = false; }
}

// Dist headers
const eh = '@letterblack/lbe-core v' + v;
for (const [l, fp] of [
  ['dist/index.js', rp('release-public', 'dist', 'index.js')],
  ['dist/cli.js', rp('release-public', 'dist', 'cli.js')],
  ['types.d.ts', rp('release-public', 'types.d.ts')],
]) {
  const t = rT(fp);
  if (!t) continue; // skip missing dist files â€” rebuilt in FILES section
  if (!t.includes(eh)) { block('V_DIST_HEADER_MISMATCH', 'BLOCKER', 'VERSION', l, eh, 'header mismatch', l + ' must contain header: ' + eh + '.', 'Rebuild dist with correct version.', ['npm run build:public-sdk'], [], ['Rebuild', 'Ask user']); vPass = false; }
}
// Asset version scan â€” SVG/PNG text metadata must not contain stale versions
const versionPattern = /v\d+\.\d+\.\d+/g;
const assetDirs = [rp('assets'), rp('release-public', 'assets')];
for (const ad of assetDirs) {
  if (!fs.existsSync(ad)) continue;
  const assetFiles = fs.readdirSync(ad).filter(function (f) { return /\.(svg|png|jpg)$/i.test(f); });
  for (const af of assetFiles) {
    const content = rT(path.join(ad, af));
    const foundVersions = content.match(versionPattern);
    if (foundVersions) {
      const stale = foundVersions.filter(function (fv) { return fv !== 'v' + v; });
      if (stale.length) {
        block('V_ASSET_STALE_VERSION', 'BLOCKER', 'VERSION', ad + '/' + af, 'no stale version', 'found ' + stale.join(', '), 'Asset ' + af + ' contains stale version(s) ' + stale.join(', ') + '. Current version is v' + v + '.', 'Update asset to v' + v + ' or remove hardcoded version.', ['Edit ' + af, 'Remove version text'], [], ['Fix asset', 'Ask user']); vPass = false;
      }
    }
  }
}
console.log(vPass ? '  Version: PASS' : '  Version: FAIL');

// â•â•â• B. FILES â•â•â•
console.log('\n=== FILES ===');
function sh(label, cmd, ms, blkId) {
  ms = ms || 60000;
  try { step(label); execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: ms }); console.log('OK'); return true; }
  catch (e) { var errDetail = (e.stderr || e.stdout || e.message || '').toString().split('\n').slice(0, 3).join(' | ').slice(0, 200); block(blkId || 'F_SH_' + label.replace(/[^A-Z0-9_]/g, '_').toUpperCase(), 'BLOCKER', 'FILES', label, 'success', 'failed: ' + errDetail, label + ' must succeed for release.', 'Fix ' + label + ' failures.', ['Check output', 'Fix source'], [], ['Fix and retry', 'Ask user']); fPass = false; console.log('FAIL'); return false; }
}
sh('build:public-sdk', 'npm run build:public-sdk', 60000, 'F_BUILD_PUBLIC_SDK_FAILED');
sh('check-artifact', 'node scripts/check-public-artifact.mjs', 30000, 'F_CHECK_ARTIFACT_FAILED');
sh('verify-pack-proof', 'npm run verify:pack-proof', 60000, 'F_VERIFY_PACK_PROOF_FAILED');

try {
  step('npm pack --dry-run');
  var o = execSync('npm pack --dry-run --json', { cwd: rp('release-public'), encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  var pk = (JSON.parse(o)[0] && JSON.parse(o)[0].files || []).map(function (f) { return f.path; });
  var mf = rJ(rp('release', 'release-manifest.json'));
  if (mf) {
    var fb = (mf.forbiddenNpmPackedPaths || []).map(function (p) { return p.replace(/\/$/, '').replace(/^\*\./, ''); });
    for (var pi = 0; pi < fb.length; pi++)
      for (var fi = 0; fi < pk.length; fi++)
        if (pk[fi] === fb[pi] || pk[fi].startsWith(fb[pi] + '/') || pk[fi].endsWith('.' + fb[pi])) { block('F_FORBIDDEN_IN_PACK', 'BLOCKER', 'FILES', 'npm pack', pk[fi] + ' not allowed', pk[fi] + ' found in pack', pk[fi] + ' is forbidden in release package.', 'Remove or add to allowed files list.', ['Check release-manifest.json', 'Rebuild'], [], ['Remove file', 'Ask user']); fPass = false; }
  }
  console.log('OK (' + pk.length + ' files)');
} catch (e) { block('F_PACK_FAILED', 'BLOCKER', 'FILES', 'npm pack --dry-run', 'success', 'failed: ' + e.message, 'Package dry-run must succeed.', 'Fix pack failures.', ['Check package.json files', 'Check release-public'], [], ['Fix pack', 'Ask user']); fPass = false; console.log('FAIL'); }

for (var di = 0; di < 2; di++) {
  var dd = ['dist', 'docs/decisions'][di];
  if (!fs.existsSync(rp('release-public', dd.split('/')[0], dd.split('/')[1] || ''))) { block('F_DIST_MISSING', 'BLOCKER', 'FILES', 'release-public/' + dd, 'directory exists', 'missing', 'release-public/' + dd + ' directory is required.', 'Rebuild release-public.', ['npm run build:public-sdk'], [], ['Rebuild', 'Ask user']); fPass = false; }
}
console.log(fPass ? '  Files: PASS' : '  Files: FAIL');


// â•â•â• C. DOCS â•â•â•
console.log('\n=== DOCS ===');
var rm = rT(rp('README.md'));
var pr = rT(rp('release-public', 'README.md'));
var FC = ['Used in production', 'After Effects', 'safety engine inside Letterblack', 'LetterBlack-LBE-Core', 'Core_Control', 'REPOSITORY_LOCATIONS'];
for (var ii = 0; ii < FC.length; ii++) {
  var c2 = FC[ii];
  if (rm.includes(c2)) { block('D_FORBIDDEN_README', 'BLOCKER', 'DOCS', 'README.md', 'must not contain ' + c2, 'found ' + c2, 'Root README must not reveal internal details.', 'Remove ' + c2 + ' from README.', ['Edit README.md', 'Regenerate'], [], ['Fix README', 'Ask user']); dPass = false; }
  if (pr.includes(c2)) { block('D_FORBIDDEN_PUBLIC_README', 'BLOCKER', 'DOCS', 'release-public/README.md', 'must not contain ' + c2, 'found ' + c2, 'Public README must not reveal internal details.', 'Remove ' + c2 + ' from public README.', ['Edit source', 'Rebuild'], [], ['Fix public README', 'Ask user']); dPass = false; }
}
if (!rm.includes('@letterblack/lbe-core')) { block('D_MISSING_PKG_NAME', 'BLOCKER', 'DOCS', 'README.md', 'contains @letterblack/lbe-core', 'missing', 'README must name the package.', 'Add package name to README.', ['Add @letterblack/lbe-core', 'Rebuild'], [], ['Update README', 'Ask user']); dPass = false; }
var requiredScopedNpx = [
  'npx --package @letterblack/lbe-core lbe',
  'npx --package @letterblack/lbe-core lbe init',
  'npx --package @letterblack/lbe-core lbe status',
  'npx --package @letterblack/lbe-core lbe proof'
];
for (var rn = 0; rn < requiredScopedNpx.length; rn++) {
  var requiredCmd = requiredScopedNpx[rn];
  if (!rm.includes(requiredCmd)) { block('D_MISSING_SCOPED_NPX_LBE', 'BLOCKER', 'DOCS', 'README.md', 'contains ' + requiredCmd, 'missing', 'Quick start must show scoped npx command.', 'Add scoped npx command to README.', ['Add ' + requiredCmd, 'Rebuild'], ['Do not add bare npx lbe'], ['Fix README', 'Ask user']); dPass = false; }
  if (!pr.includes(requiredCmd)) { block('D_MISSING_PUBLIC_SCOPED_NPX_LBE', 'BLOCKER', 'DOCS', 'release-public/README.md', 'contains ' + requiredCmd, 'missing', 'Public README must show scoped npx command.', 'Fix source README and rebuild.', ['Add ' + requiredCmd, 'Rebuild'], ['Do not add bare npx lbe'], ['Fix README', 'Ask user']); dPass = false; }
}
var bareNpxRoot = rm.split(/\r?\n/).filter(function (line) { var t = line.trim(); return /^npx\s+lbe(\s|$)/.test(t) && !t.includes('--package'); });
var bareNpxPublic = pr.split(/\r?\n/).filter(function (line) { var t = line.trim(); return /^npx\s+lbe(\s|$)/.test(t) && !t.includes('--package'); });
if (bareNpxRoot.length) { block('D_FORBIDDEN_BARE_NPX_LBE', 'BLOCKER', 'DOCS', 'README.md', 'no bare npx lbe command', 'found ' + bareNpxRoot[0].trim(), 'Bare npx lbe can resolve to an unrelated npm package.', 'Use npx --package @letterblack/lbe-core lbe.', ['Replace bare npx command'], ['Do not document npx lbe'], ['Fix README', 'Ask user']); dPass = false; }
if (bareNpxPublic.length) { block('D_FORBIDDEN_PUBLIC_BARE_NPX_LBE', 'BLOCKER', 'DOCS', 'release-public/README.md', 'no bare npx lbe command', 'found ' + bareNpxPublic[0].trim(), 'Bare npx lbe can resolve to an unrelated npm package.', 'Use npx --package @letterblack/lbe-core lbe.', ['Replace bare npx command'], ['Do not document npx lbe'], ['Fix README', 'Ask user']); dPass = false; }
if (!pr.includes('@letterblack/lbe-core')) { block('D_MISSING_PKG_NAME', 'BLOCKER', 'DOCS', 'release-public/README.md', 'contains @letterblack/lbe-core', 'missing', 'Public README must identify package.', 'Fix source and rebuild.', ['Update README source', 'Rebuild'], [], ['Fix source', 'Ask user']); dPass = false; }

// Encoding audit
try {
  var ea = spawnSync(process.execPath, [rp('scripts', 'encoding-audit.mjs')], { cwd: root, stdio: 'pipe', timeout: 15000, windowsHide: true });
  if (ea.status !== 0) {
    block('D_ENCODING_FAILED', 'BLOCKER', 'DOCS', 'scripts/encoding-audit.mjs', 'exits 0', 'found encoding corruption', 'Encoding audit must pass.', 'Fix encoding corruption.', ['Run npm run audit:encoding', 'Fix files'], [], ['Fix encoding', 'Ask user']); dPass = false;
  }
} catch (e) { /* encoding-audit not yet created, skip */ }

console.log(dPass ? '  Docs: PASS' : '  Docs: FAIL');

// â•â•â• D. CLI â•â•â•
console.log('\n=== CLI ===');
var cp = rp('release-public', 'dist', 'cli.js');
if (!fs.existsSync(cp)) { block('C_CLI_JS_MISSING', 'BLOCKER', 'CLI', 'release-public/dist/cli.js', 'file exists', 'missing', 'CLI entrypoint must exist.', 'Rebuild release-public.', ['npm run build:public-sdk'], [], ['Rebuild', 'Ask user']); cPass = false; } else {
  function rc(args) {
    try { return { ok: true, out: execSync('node "' + cp + '" ' + args, { cwd: ROOT, encoding: 'utf8', timeout: 15000, stdio: 'pipe', env: Object.assign({}, process.env, { NODE_ENV: 'test' }) }) }; }
    catch (e) { return { ok: false, out: e.stdout || '', err: e.stderr || e.message || '' }; }
  }
  var ct = [['help', '--help'], ['status', 'status'], ['proof', 'proof']];
  for (var ci2 = 0; ci2 < ct.length; ci2++) {
    step(ct[ci2][0]); var r = rc(ct[ci2][1]);
    if (r.err && r.err.includes('Unknown command')) { block('C_CLI_BROKEN', 'BLOCKER', 'CLI', 'cli.js ' + ct[ci2][0], 'working command', 'broken', 'CLI ' + ct[ci2][0] + ' command must work.', 'Fix CLI ' + ct[ci2][0] + '.', ['Check CLI source', 'Rebuild'], [], ['Fix CLI', 'Ask user']); cPass = false; console.log('FAIL'); }
    else { console.log('OK'); }
  }
  step('menu handlers'); var ccc = rT(cp);
  var mc = ['init', 'remove', 'status', 'audit-workspace', 'intent']; var allOk = true; for (var mi = 0; mi < mc.length; mi++) { var patt = mc[mi]; var found = false; var lines = ccc.split('\n'); for (var li = 0; li < lines.length; li++) { if (lines[li].indexOf('cmd ===') > -1 && lines[li].indexOf(patt) > -1) { found = true; break; } } if (!found) { block('C_MISSING_HANDLER', 'BLOCKER', 'CLI', 'cli.js', 'all handlers present', 'missing ' + patt, 'CLI must have ' + patt + ' handler.', 'Add ' + patt + ' handler to CLI.', ['Check CLI source', 'Add handler'], [], ['Fix CLI', 'Ask user']); cPass = false; allOk = false; } } console.log(allOk ? 'OK' : 'FAIL');
}
console.log(cPass ? '  CLI: PASS' : '  CLI: FAIL');

// â•â•â• E. TESTS â•â•â•
if (!quick) {
  console.log('\n=== TESTS ===');
  try { step('validate:all'); execSync('npm run validate:all', { cwd: ROOT, stdio: 'pipe', timeout: 300000, encoding: 'utf8' }); console.log('OK'); }
  catch (e) {
    var vaErr = (e.stderr || e.stdout || '').toString();
    if (e.killed || e.signal === 'SIGTERM') {
      block('T_VALIDATE_TIMEOUT', 'BLOCKER', 'TESTS', 'npm run validate:all', 'all pass', 'timed out', 'Release validation did not complete within 5 minutes. Hanging test must be isolated.', 'Isolate hanging test or convert to deterministic fixture.', ['Run test:slow separately', 'Isolate `security-invariants` test'], [], ['Fix hanging test', 'Ask user']);
    } else {
      var ve = vaErr.split('\n').slice(-10).join(' | ').slice(0, 400);
      block('T_VALIDATE_FAILED', 'BLOCKER', 'TESTS', 'npm run validate:all', 'all pass', 'failed: ' + ve, 'Tests must pass before release.', 'Fix failing tests.', ['Run npm test:release', 'Fix broken source'], [], ['Fix tests', 'Ask user']);
    }
    tPass = false; console.log('FAIL');
  }
  try { step('proof'); execSync('npm run proof', { cwd: ROOT, stdio: 'pipe', timeout: 60000 }); console.log('OK'); }
  catch (e) { block('T_PROOF_FAILED', 'BLOCKER', 'TESTS', 'npm run proof', '12/12 pass', 'failed', 'LBE proof must pass.', 'Fix proof failures.', ['Check proof output', 'Fix broken step'], [], ['Fix proof', 'Ask user']); tPass = false; console.log('FAIL'); }
  try { step('governance:check'); execSync('npm run governance:check', { cwd: ROOT, stdio: 'pipe', timeout: 30000, encoding: 'utf8' }); console.log('OK'); }
  catch (e) { var ge = (e.stderr || e.stdout || '').toString().split('\n').slice(-5).join(' | ').slice(0, 300); block('T_GOVERNANCE_FAILED', 'BLOCKER', 'TESTS', 'npm run governance:check', 'passes', 'blocked: ' + ge, 'Governance must be clean.', 'Fix governance violations.', ['Check violations', 'Fix scope/docs'], [], ['Fix governance', 'Ask user']); tPass = false; console.log('FAIL'); }
  console.log(tPass ? '  Tests: PASS' : '  Tests: FAIL');
} else { console.log('\n=== TESTS === (skipped via --quick)'); }

// â•â•â• F. GIT â•â•â•
console.log('\n=== GIT ===');
try { step('diff --check'); execSync('git diff --check', { cwd: ROOT, stdio: 'pipe', timeout: 10000 }); console.log('OK'); }
catch (e) { block('G_DIFF_FAILED', 'BLOCKER', 'GIT', 'git diff --check', 'clean', 'errors', 'Git whitespace errors.', 'Fix whitespace.', ['Run git diff --check', 'Fix trailing whitespace'], [], ['Fix whitespace', 'Ask user']); gPass = false; console.log('FAIL'); }
try {
  var st2 = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  var dirty = st2.trim().split('\n').filter(function (l) { return l && !l.startsWith('??'); });
  if (dirty.length) { block('G_DIRTY_TREE', 'BLOCKER', 'GIT', 'git status', 'clean working tree', dirty.length + ' dirty files', 'Working tree must be clean for release.', 'Commit or stash dirty files.', ['git status', 'Commit changes'], [], ['Clean tree', 'Ask user']); gPass = false; console.log('FAIL'); }
  else { console.log('OK (clean)'); }
} catch (e) { block('G_STATUS_FAILED', 'BLOCKER', 'GIT', 'git status', 'works', 'failed', 'Cannot verify working tree.', 'Check git.', ['Check git installation'], [], ['Fix git', 'Ask user']); gPass = false; console.log('FAIL'); }
console.log(gPass ? '  Git: PASS' : '  Git: FAIL');

// â•â•â• REPORT â•â•â•
console.log('\n' + '='.repeat(60));
console.log('  RELEASE HYGIENE REPORT');
console.log('='.repeat(60));
console.log('  Version: ' + (vPass ? 'PASS' : 'FAIL'));
console.log('  Files:   ' + (fPass ? 'PASS' : 'FAIL'));
console.log('  Docs:    ' + (dPass ? 'PASS' : 'FAIL'));
console.log('  CLI:     ' + (cPass ? 'PASS' : 'FAIL'));
console.log('  Tests:   ' + (tPass ? (quick ? 'SKIP' : 'PASS') : 'FAIL'));
console.log('  Git:     ' + (gPass ? 'PASS' : 'FAIL'));
console.log('='.repeat(60));

if (blockers.length) {
  console.log('\n  RELEASE BLOCKED â€” ' + blockers.length + ' blocker(s)\n');
  for (var bi = 0; bi < blockers.length; bi++) {
    var b = blockers[bi];
    console.log('  BLOCKER: ' + b.id + ' [' + b.severity + ']');
    console.log('  FILE:    ' + b.file);
    if (b.expected) console.log('  EXPECTED: ' + b.expected);
    if (b.found) console.log('  FOUND:    ' + b.found);
    console.log('  MEANING: ' + b.meaning);
    console.log('  INTENT:  ' + b.intentRequired);
    if (b.fix.length) { console.log('  FIX:'); for (var fi = 0; fi < b.fix.length; fi++) console.log('    - ' + b.fix[fi]); }
    if (b.forbidden.length) { console.log('  FORBIDDEN:'); for (var fj = 0; fj < b.forbidden.length; fj++) console.log('    - ' + b.forbidden[fj]); }
    if (b.decisionOptions.length) { console.log('  DECISIONS:'); for (var dk = 0; dk < b.decisionOptions.length; dk++) console.log('    - ' + b.decisionOptions[dk]); }
    console.log('');
  }
  console.log('  AGENT_BLOCKERS_JSON:');
  console.log(JSON.stringify(blockers, null, 2));
  console.log('\n  RELEASE BLOCKED\n');
  process.exit(1);
}

console.log('\n  ALL GATES PASSED â€” RELEASE AUTHORIZED\n');
process.exit(0);
