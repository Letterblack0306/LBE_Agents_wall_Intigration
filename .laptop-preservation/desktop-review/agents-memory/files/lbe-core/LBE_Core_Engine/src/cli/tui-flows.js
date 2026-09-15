// tui-flows.js — LBE TUI workflow functions
import fs from 'fs';
import path from 'path';
import { runAuditChain } from '../audit/workspaceAuditChain.js';
import { FLOW, MENU_ITEMS } from './public-strings.js';
import { initCommand } from './commands/init.js';

export let GREEN, YELLOW, CYAN, RED, BOLD, DIM, WHITE, RESET;
export let line, promptConfirm, promptInput, pressEnter;
export let showHeader, renderMenu, policyMode, isBA, hasAL, hasAI, hasCI, lPR;

export function setColors(g, y, c, r, b, d, w, rs) {
  GREEN = g; YELLOW = y; CYAN = c; RED = r; BOLD = b; DIM = d; WHITE = w; RESET = rs;
}
export function setHelpers(h) {
  line = h.line; promptConfirm = h.promptConfirm; promptInput = h.promptInput;
  pressEnter = h.pressEnter; showHeader = h.showHeader; renderMenu = h.renderMenu;
  policyMode = h.policyMode; isBA = h.isBA; hasAL = h.hasAL;
  hasAI = h.hasAI; hasCI = h.hasCI; lPR = h.lPR;
}

export async function applyBoundary(version, root) {
  showHeader({ version, root });
  line('  ' + BOLD + WHITE + FLOW.applyBoundary + RESET);
  line('  ' + DIM + '\u2500'.repeat(53) + RESET); line('');
  line('  Workspace: ' + CYAN + root + RESET); line('');
  if (isBA(root)) {
    line('  ' + YELLOW + '\u26a0' + RESET + ' Boundary already applied.');
    if (!await promptConfirm(FLOW.reapplyPrompt, false)) {
      line('  ' + DIM + FLOW.skipped + RESET + '\n'); await pressEnter(); return;
    } line('');
  }
  line('  ' + DIM + FLOW.initializing + RESET); line('');
  const prevCwd = process.cwd();
  try {
    // chdir to the TUI-selected workspace so initCommand uses the right root
    process.chdir(root);
    // Call shared initCommand with --yes (non-interactive) to create canonical .lbe state
    await initCommand({ yes: true });
    line(''); line('  ' + GREEN + BOLD + '\u2713 Boundary applied.' + RESET); line('  ' + DIM + 'All LBE state is in .lbe/' + RESET); line('');
  } catch (err) { line('  ' + RED + '\u2716 Error:' + RESET + ' ' + err.message); line(''); }
  finally { process.chdir(prevCwd); }
  await pressEnter();
}


export async function removeBoundary(version, root) {
  showHeader({ version, root }); line('  ' + BOLD + WHITE + FLOW.removeBoundary + RESET);
  line('  ' + DIM + '\u2500'.repeat(53) + RESET); line(''); line('  Workspace: ' + CYAN + root + RESET); line('');
  if (!isBA(root)) { line('  ' + YELLOW + '\u25CB' + RESET + ' No boundary applied.'); line(''); await pressEnter(); return; }
  const keep = await promptConfirm('Keep audit history?', true); line('');
  line(keep ? '  ' + GREEN + '\u2713' + RESET + ' Audit preserved.' : '  ' + YELLOW + '\u26A0' + RESET + ' Audit removed.'); line('');
  if (!await promptConfirm(FLOW.removeConfirm, false)) { line('  ' + DIM + FLOW.cancelled + RESET + '\n'); await pressEnter(); return; } line('');
  let removed = [], preserved = [];
  try {
    const afs = [{ f: path.join(root, 'CLAUDE.md'), l: 'CLAUDE.md' }, { f: path.join(root, '.github', 'copilot-instructions.md'), l: '.github/copilot-instructions.md' }, { f: path.join(root, '.windsurfrules'), l: '.windsurfrules' }, { f: path.join(root, '.cursor', 'rules', 'lbe.mdc'), l: '.cursor/rules/lbe.mdc' }];
    // eslint-disable-next-line no-undef
    for (const a of afs) { if (fs.existsSync(a.f)) { const c = fs.readFileSync(a.f, 'utf8'); if (c.includes('lbe-governance')) { const u = c.replace(/\n*## LBE Governance[\s\S]*?<!-- \/lbe-governance -->/, ''); const t = u.trim(); if (t.length === 0) { fs.unlinkSync(a.f); removed.push(a.l + ' (removed)'); } else { fs.writeFileSync(a.f, t + '\n'); removed.push(a.l + ' (LBE removed)'); } } } }
    const ld = path.join(root, '.lbe');['AGENT_CONTRACT.md', 'agent-instructions.json', 'policy.json'].forEach(f => { const fp = path.join(ld, f); if (fs.existsSync(fp)) { fs.unlinkSync(fp); removed.push('.lbe/' + f); } });
    if (keep) { preserved.push('.lbe/audit.jsonl'); preserved.push('.lbe/data/'); preserved.push('.lbe/proof/'); }
    else {
      const ap = path.join(ld, 'audit.jsonl'); if (fs.existsSync(ap)) { fs.unlinkSync(ap); removed.push('.lbe/audit.jsonl'); }
      const pr = path.join(ld, 'proof'); if (fs.existsSync(pr)) { fs.readdirSync(pr).forEach(e => { fs.unlinkSync(path.join(pr, e)); removed.push('.lbe/proof/' + e); }); }
    }
    line(''); if (removed.length) { line('  ' + YELLOW + 'Removed:' + RESET); removed.forEach(r => line('  ' + DIM + '  \u2022 ' + r + RESET)); }
    if (preserved.length) { line('  ' + GREEN + 'Preserved:' + RESET); preserved.forEach(p => line('  ' + DIM + '  \u2022 ' + p + RESET)); }
    line(''); line('  ' + GREEN + BOLD + '\u2713 Boundary removed.' + RESET); line('');
  } catch (err) { line('  ' + RED + '\u2716 Error:' + RESET + ' ' + err.message); line(''); }
  await pressEnter();
}


export async function checkStatus(version, root) {
  showHeader({ version, root }); line('  ' + BOLD + WHITE + 'Workspace Status' + RESET);
  line('  ' + DIM + '\u2500'.repeat(53) + RESET); line('');
  const checks = [{ l: 'Workspace detected', p: fs.existsSync(path.join(root, '.lbe')), h: 'Run Apply Boundary' }, { l: 'Boundary applied', p: isBA(root), h: 'Run Apply Boundary' }, { l: 'Policy present', p: fs.existsSync(path.join(root, '.lbe', 'policy.json')), h: 'Re-apply' }, { l: 'Mode selected', p: policyMode(root) !== 'not initialized', h: 'Run Apply' }, { l: FLOW.taskRules, p: hasAI(root), h: 'Re-apply' }, { l: 'Audit log', p: hasAL(root), h: 'Run Apply' }, { l: 'Proof available', p: lPR(root) !== 'none', h: 'Run task + proof' }];
  if (hasCI(root)) checks.push({ l: 'Custom instruction file', p: true, h: '' });
  let allPass = true;
  checks.forEach(ch => { line('  ' + (ch.p ? GREEN + '\u2713' : RED + '\u2716') + RESET + '  ' + (ch.p ? BOLD + WHITE : '') + ch.l + RESET + (ch.p ? '' : ' ' + DIM + '\u2192 ' + ch.h + RESET)); if (!ch.p) allPass = false; });
  line(''); line('  ' + DIM + 'Mode:' + RESET + ' ' + (policyMode(root) === 'enforce' ? RED + '\u25CF enforce' : policyMode(root) === 'observe' ? '\u25CB observe' : '\u25CB not set') + RESET);
  line('  ' + DIM + 'Proof:' + RESET + ' ' + (lPR(root) === 'PASS' ? GREEN + '\u2713 PASS' : lPR(root) === 'FAIL' ? RED + '\u2716 FAIL' : DIM + '\u25CB ' + (lPR(root) || 'none')) + RESET); line('');
  allPass ? line('  ' + GREEN + BOLD + '\u2713 Passed.' + RESET) : line('  ' + YELLOW + BOLD + '\u25CB Issues found.' + RESET); line(''); await pressEnter();
}

// ─── Managed block update helper ──────────────────────────────────────────
function updateManagedBlocks(root, scope) {
  const afs = [
    { f: path.join(root, 'CLAUDE.md'), l: 'CLAUDE.md' },
    { f: path.join(root, '.github', 'copilot-instructions.md'), l: '.github/copilot-instructions.md' },
    { f: path.join(root, '.windsurfrules'), l: '.windsurfrules' },
    { f: path.join(root, '.cursor', 'rules', 'lbe.mdc'), l: '.cursor/rules/lbe.mdc' },
  ];
  const section = [
    '', '## LBE Governance', '<!-- lbe-governance: managed block -->',
    'This workspace is governed by LBE.',
    '',
    '**Objective:** ' + (scope.objective || '(not set)'),
    (scope.allowed && scope.allowed.length) ? '**Allowed:** ' + scope.allowed.join(', ') : '',
    (scope.forbidden && scope.forbidden.length) ? '**Forbidden:** ' + scope.forbidden.join(', ') : '',
    (scope.validations && scope.validations.length) ? '**Validations:** ' + scope.validations.join(', ') : '',
    '', '1. Check .lbe/policy.json', '2. Route through LBE', '3. Record intent & proof',
  ].filter(Boolean).join('\n');
  let updated = 0;
  for (const a of afs) {
    const dir = path.dirname(a.f);
    if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { void 0; } }
    if (fs.existsSync(a.f)) {
      const c = fs.readFileSync(a.f, 'utf8');
      if (c.includes('lbe-governance')) {
        const u = c.replace(/## LBE Governance[\s\S]*?<!-- \/lbe-governance -->/, section + '\n<!-- /lbe-governance -->');
        if (u !== c) { fs.writeFileSync(a.f, u); line('  ' + GREEN + '\u2713' + RESET + ' Updated block in ' + DIM + a.l + RESET); updated++; }
      } else {
        fs.writeFileSync(a.f, c + section + '\n<!-- /lbe-governance -->\n');
        line('  ' + GREEN + '\u2713' + RESET + ' Added block to ' + DIM + a.l + RESET); updated++;
      }
    } else {
      fs.writeFileSync(a.f, section + '\n<!-- /lbe-governance -->\n');
      line('  ' + GREEN + '\u2713' + RESET + ' Created ' + DIM + a.l + RESET + ' with LBE block'); updated++;
    }
  }
  return updated;
}

export async function agentInstructionsFlow(version, root) {
  const ld = path.join(root, '.lbe');
  const scopeFile = path.join(ld, 'scope.json');
  const taskLog = path.join(ld, 'task.jsonl');
  const legacyIntentLog = path.join(ld, 'intent.jsonl');
  fs.mkdirSync(ld, { recursive: true });

  let current = null;
  if (fs.existsSync(scopeFile)) {
    try { current = JSON.parse(fs.readFileSync(scopeFile, 'utf8')); } catch (_) { void 0; }
  }
  showHeader({ version, root });
  line('  ' + BOLD + WHITE + FLOW.taskRules + RESET);
  line('  ' + DIM + '\u2500'.repeat(53) + RESET); line('');
  line('  Workspace: ' + CYAN + root + RESET); line('');
  if (current) {
    line('  ' + BOLD + FLOW.currentPlan + RESET);
    line('  ' + DIM + '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' + RESET);
    line('  ' + BOLD + 'Objective:' + RESET + ' ' + (current.objective || '(not set)'));
    if (current.allowed && current.allowed.length) line('  ' + BOLD + 'Allowed:' + RESET + ' ' + current.allowed.join(', '));
    if (current.forbidden && current.forbidden.length) line('  ' + BOLD + 'Forbidden:' + RESET + ' ' + current.forbidden.join(', '));
    if (current.validations && current.validations.length) line('  ' + BOLD + 'Validations:' + RESET + ' ' + current.validations.join(', '));
    line('');
  } else {
    line('  ' + YELLOW + '\u25CB' + RESET + ' No plan yet.'); line('');
  }

  if (!await promptConfirm(FLOW.setUpdatePrompt, true)) { line(''); await pressEnter(); return; }
  line('');

  const objective = await promptInput(FLOW.objectivePrompt);
  if (!objective) { line('  ' + DIM + FLOW.cancelled + RESET + '\n'); await pressEnter(); return; }
  const allowedStr = await promptInput(FLOW.allowedPrompt);
  const allowed = allowedStr ? allowedStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const forbiddenStr = await promptInput(FLOW.forbiddenPrompt);
  const forbidden = forbiddenStr ? forbiddenStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const valStr = await promptInput(FLOW.validationsPrompt);
  const validations = valStr ? valStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  line('');

  const scopeId = 'scope_' + Date.now().toString(36);
  const scope = { id: scopeId, objective, allowed, forbidden, validations, created: Math.floor(Date.now() / 1000) };
  fs.writeFileSync(scopeFile, JSON.stringify(scope, null, 2) + '\n', 'utf8');
  line('  ' + GREEN + '\u2713' + RESET + ' Scope saved  ' + DIM + '(.lbe/scope.json)' + RESET);

  const timestamp = Math.floor(Date.now() / 1000);
  const entry = { objective, allowed, forbidden, validations, timestamp };
  fs.appendFileSync(taskLog, JSON.stringify(entry) + '\n', 'utf8');
  // Also append to legacy intent.jsonl for backward compatibility
  try { fs.appendFileSync(legacyIntentLog, JSON.stringify(Object.assign({ intent_id: 'i_' + timestamp.toString(36), scope_id: scopeId }, entry)) + '\n', 'utf8'); } catch { }

  line('  ' + GREEN + '\u2713' + RESET + ' Activity saved  ' + DIM + '(.lbe/task.jsonl)' + RESET);
  line(''); line('  ' + GREEN + BOLD + '\u2713 Instructions saved.' + RESET);
  line('  ' + DIM + 'scope_id:' + RESET + ' ' + scopeId); line('');
  await pressEnter();

  const m = [FLOW.addFile, FLOW.changeFile, FLOW.removeReference, FLOW.viewSources, FLOW.backToMenu];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    showHeader({ version, root }); line('  ' + BOLD + WHITE + 'Agent Instructions \u2014 File Management' + RESET);
    line('  ' + DIM + '\u2500'.repeat(53) + RESET); line('');
    const c = await renderMenu(m); if (c < 0 || c === 4) return; line('');
    await [addInstrFile, changeInstrFile, removeInstrFile, viewInstrSources][c](root);
  }
}

async function addInstrFile(root) {
  const ip = await promptInput('Path (e.g. ./docs/rules.md)');
  if (!ip) { line('  ' + DIM + FLOW.cancelled + RESET + '\n'); await pressEnter(); return; }
  const rp = path.resolve(root, ip); if (!fs.existsSync(rp)) { line('  ' + RED + '\u2716' + RESET + ' Not found.'); line(''); await pressEnter(); return; }
  const ld = path.join(root, '.lbe'); fs.mkdirSync(ld, { recursive: true });
  fs.writeFileSync(path.join(ld, 'agent-instructions.json'), JSON.stringify({ customInstructionFile: ip, registeredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2));
  line('  ' + GREEN + '\u2713' + RESET + ' Registered: ' + CYAN + ip + RESET);
  const acp = path.join(ld, 'AGENT_CONTRACT.md');
  if (fs.existsSync(acp)) {
    const c = fs.readFileSync(acp, 'utf8'); const ref = '\n\n## Custom File\n\nPath: ' + ip + '\nRegistered: ' + new Date().toISOString() + '\n';
    if (c.includes('## Custom File')) { const u = c.replace(/## Custom File[\s\S]*?(?=\n##|$)/, '## Custom File\n\nPath: ' + ip + '\nUpdated: ' + new Date().toISOString()); fs.writeFileSync(acp, u); }
    else fs.appendFileSync(acp, ref);
    line('  ' + GREEN + '\u2713' + RESET + ' Contract updated');
  } line(''); await pressEnter();
}

async function changeInstrFile(root) {
  const ld = path.join(root, '.lbe'); const icp = path.join(ld, 'agent-instructions.json');
  if (!fs.existsSync(icp)) { line('  ' + YELLOW + '\u25CB' + RESET + ' No file registered.\n'); await pressEnter(); return; }
  const ip = await promptInput('New path');
  if (!ip) { line('  ' + DIM + FLOW.cancelled + RESET + '\n'); await pressEnter(); return; }
  const rp = path.resolve(root, ip); if (!fs.existsSync(rp)) { line('  ' + RED + '\u2716' + RESET + ' Not found.'); line(''); await pressEnter(); return; }
  const old = JSON.parse(fs.readFileSync(icp, 'utf8'));
  fs.writeFileSync(icp, JSON.stringify({ customInstructionFile: ip, updatedAt: new Date().toISOString(), registeredAt: old.registeredAt || new Date().toISOString() }, null, 2));
  line('  ' + GREEN + '\u2713' + RESET + ' Updated: ' + CYAN + ip + RESET); line(''); await pressEnter();
}

async function removeInstrFile(root) {
  const ld = path.join(root, '.lbe'); const icp = path.join(ld, 'agent-instructions.json');
  if (!fs.existsSync(icp)) { line('  ' + YELLOW + '\u25CB' + RESET + ' No file.\n'); await pressEnter(); return; }
  if (!await promptConfirm('Remove reference?', false)) { line('  ' + DIM + FLOW.cancelled + RESET + '\n'); await pressEnter(); return; }
  fs.unlinkSync(icp); line('  ' + GREEN + '\u2713' + RESET + ' Removed.');
  const acp = path.join(ld, 'AGENT_CONTRACT.md');
  if (fs.existsSync(acp)) { const c = fs.readFileSync(acp, 'utf8'); fs.writeFileSync(acp, c.replace(/## Custom File[\s\S]*?(?=\n##|$)/, '')); line('  ' + GREEN + '\u2713' + RESET + ' Contract updated.'); }
  line(''); await pressEnter();
}

async function viewInstrSources(root) {
  const ld = path.join(root, '.lbe');
  line('  ' + BOLD + 'Sources' + RESET); line('  ' + DIM + '\u2500'.repeat(30) + RESET); line('');
  const acp = path.join(ld, 'AGENT_CONTRACT.md');
  line('  ' + (fs.existsSync(acp) ? GREEN + '\u2713' : DIM + '\u25CB') + RESET + ' .lbe/AGENT_CONTRACT.md');
  const icp = path.join(ld, 'agent-instructions.json');
  if (fs.existsSync(icp)) { try { const cfg = JSON.parse(fs.readFileSync(icp, 'utf8')); line('  ' + (fs.existsSync(path.resolve(root, cfg.customInstructionFile)) ? GREEN + '\u2713' : RED + '\u2716') + RESET + ' ' + CYAN + cfg.customInstructionFile + RESET); } catch (_) { void 0; } }
  else line('  ' + DIM + '\u25CB' + RESET + ' No custom file');
  [[path.join(root, 'CLAUDE.md'), 'CLAUDE.md'], [path.join(root, '.github', 'copilot-instructions.md'), '.github/copilot.md']].forEach(([p, l]) => {
    if (fs.existsSync(p)) { const c = fs.readFileSync(p, 'utf8'); line('  ' + (c.includes('lbe-governance') ? GREEN + '\u2713' : YELLOW + '\u25CB') + RESET + ' ' + l); }
    else line('  ' + DIM + '\u25CB' + RESET + ' ' + l);
  });
  line(''); await pressEnter();
}

export async function auditWorkspace(version, root) {
  showHeader({ version, root });
  line('  ' + BOLD + WHITE + 'Audit Workspace' + RESET);
  line('  ' + DIM + '\u2500'.repeat(53) + RESET); line('');
  line('  Workspace: ' + CYAN + root + RESET); line('');

  if (!isBA(root)) {
    line('  ' + YELLOW + '\u25CB' + RESET + ' No boundary applied. Run audit anyway?');
    if (!await promptConfirm('Continue?', false)) { line('  ' + DIM + FLOW.skipped + RESET + '\n'); await pressEnter(); return; }
  }
  line('');

  const result = await runAuditChain(root, 'audit');
  const passed = result.results.filter(r => r.pass).length;
  const failed = result.results.filter(r => !r.pass).length;

  line('  ' + BOLD + 'Audit Results' + RESET);
  line('  ' + DIM + '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' + RESET);
  line('');
  for (const g of result.results) {
    const icon = g.pass ? GREEN + '\u2713' + RESET : RED + '\u2716' + RESET;
    const label = g.gate.replace(/_/g, ' ');
    line('  ' + icon + '  ' + BOLD + label + RESET);
    if (!g.pass) {
      line('       ' + DIM + 'reason:' + RESET + ' ' + (g.reason || 'unknown'));
      line('       ' + DIM + 'next:' + RESET + '   ' + (g.nextStep || '—'));
    }
    line('');
  }
  line('  ' + DIM + '\u2500'.repeat(30) + RESET);
  const overall = result.overall === 'PASS' ? GREEN + result.overall + RESET : RED + result.overall + RESET;
  line('  ' + BOLD + 'Overall: ' + overall + RESET + '\t' + passed + '/' + result.results.length + ' passed, ' + failed + ' failed' + RESET);
  line('');
  line('  ' + DIM + 'Report written to .lbe/reports/workspace-audit.json' + RESET);
  line('');
  await pressEnter();
}
