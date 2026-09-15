// src/state/blockerRegistry.js — maps audit status codes to structured informative blockers
import { AUDIT_STATUS } from './auditMode.js';

const R = Object.freeze({
  [AUDIT_STATUS.NO_SCOPE_FOUND]: { id:'NO_SCOPE_FOUND',severity:'BLOCKER',meaning:'No scope contract registered.',intentRequired:'Create scope via npx lbe scope set.',fix:['Run npx lbe scope set','Use Agent Instructions'],forbidden:['Do not run proof without scope'],decisionOptions:['Set scope','Ask user'] },
  [AUDIT_STATUS.FORBIDDEN_FILE_TOUCHED]: { id:'FORBIDDEN_FILE_TOUCHED',severity:'BLOCKER',meaning:'Forbidden file modified.',intentRequired:'Roll back immediately.',fix:['Revert the forbidden file','Review scope'],forbidden:['Do not proceed','Do not mark clean'],decisionOptions:['Roll back','Update scope','Ask user'] },
  [AUDIT_STATUS.PROOF_INCOMPLETE]: { id:'PROOF_INCOMPLETE',severity:'BLOCKER',meaning:'Proof not completed.',intentRequired:'Complete proof cycle.',fix:['Run npx lbe proof','Capture snapshots'],forbidden:['Do not claim proof passed'],decisionOptions:['Run proof','Ask user'] },
  [AUDIT_STATUS.CHANGED_OUTSIDE_SCOPE]: { id:'CHANGED_OUTSIDE_SCOPE',severity:'BLOCKER',meaning:'Files changed outside allowed scope.',intentRequired:'Roll back changes or expand scope.',fix:['Review changed files','Roll back or update scope'],forbidden:['Do not mark clean','Do not silently widen scope'],decisionOptions:['Roll back','Expand scope','Ask user'] },
  [AUDIT_STATUS.MISMATCH_DETECTED]: { id:'MISMATCH_DETECTED',severity:'BLOCKER',meaning:'Proof detected mismatches.',intentRequired:'Review proof and fix or update scope.',fix:['Run npx lbe proof --json','Fix files or update scope'],forbidden:['Do not ignore mismatch'],decisionOptions:['Fix violations','Update scope','Ask user'] },
  [AUDIT_STATUS.NO_INTENT_FOUND]: { id:'NO_INTENT_FOUND',severity:'BLOCKER',meaning:'No intent record.',intentRequired:'Register intent before changes.',fix:['Run npx lbe intent begin'],forbidden:['Do not change files without intent'],decisionOptions:['Register intent','Ask user'] },
  [AUDIT_STATUS.INTENT_SCOPE_MISMATCH]: { id:'INTENT_SCOPE_MISMATCH',severity:'BLOCKER',meaning:'Intent scope mismatch.',intentRequired:'Re-register intent.',fix:['Run npx lbe intent begin'],forbidden:['Do not force proof'],decisionOptions:['Re-register','Ask user'] },
  [AUDIT_STATUS.REQUIRED_READING_MISSING]: { id:'REQUIRED_READING_MISSING',severity:'BLOCKER',meaning:'Required reading missing.',intentRequired:'Read required files.',fix:['Read each file listed'],forbidden:['Do not skip reading'],decisionOptions:['Read files','Update scope','Ask user'] },
  [AUDIT_STATUS.VALIDATION_MISSING]: { id:'VALIDATION_MISSING',severity:'BLOCKER',meaning:'Required validations not performed.',intentRequired:'Run required validations.',fix:['Run each validation','Re-run proof'],forbidden:['Do not skip validations'],decisionOptions:['Run validations','Ask user'] },
  [AUDIT_STATUS.CLEAN]: { id:'CLEAN',severity:'INFO',meaning:'All checks passed.',intentRequired:'No action needed.',fix:[],forbidden:[],decisionOptions:['Proceed'] },
});

export function explainAuditStatus(status, context) {
  context = context || {};
  var entry = R[status];
  if (!entry) return { id: status || 'UNKNOWN', severity: 'BLOCKER', meaning: 'Unknown: ' + status, intentRequired: 'Report.', fix: [], forbidden: [], decisionOptions: ['Report'] };
  return Object.assign({}, entry, { context: context });
}

export async function auditStatusWithBlocker(opts) {
  opts = opts || {};
  var mod = await import('./auditMode.js');
  var result = mod.auditStatus(opts);
  result.blocker = explainAuditStatus(result.status, { changedFiles: result.changedFiles, scope: result.scope, intent: result.intent, proof: result.proof });
  return result;
}
