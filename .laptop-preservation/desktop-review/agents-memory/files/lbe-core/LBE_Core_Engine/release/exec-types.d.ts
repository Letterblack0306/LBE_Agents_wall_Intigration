export interface LBEResult {
  ok: boolean;
  decision: 'allow' | 'deny' | 'observe';
  executed: boolean;
  dryRun: boolean;
  error?: { code: string; message: string; recoverable: boolean };
  matchedRules?: string[];
  auditId?: string;
  rollback?: { available: boolean; performed: boolean; backupId?: string };
}

export interface LBEPolicyRule {
  effect: 'allow' | 'deny';
  type: 'path' | 'command';
  pattern: string;
  from: string;
}

export interface LocalExecutor {
  rootDir: string;

  // High-level API — use these in agent code
  writeFile(target: string, content: string): Promise<LBEResult>;
  readFile(target: string): Promise<LBEResult>;
  patchFile(target: string, content: string): Promise<LBEResult>;
  deleteFile(target: string): Promise<LBEResult>;
  runShell(cmd: string, args?: string[], opts?: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number }): Promise<LBEResult>;

  // Policy management
  policy: {
    read(): unknown;
    proposeRule(rule: LBEPolicyRule): unknown;
    addRule(rule: LBEPolicyRule): unknown;
  };

  // Audit
  audit: { verify(): unknown };

  // Low-level — for advanced / non-standard use only
  validate(request: unknown): Promise<LBEResult>;
  dryRun(request: unknown): Promise<LBEResult>;
  execute(request: unknown): Promise<LBEResult>;
}

export function createLocalExecutor(options?: {
  rootDir?: string;
  keyId?: string;
  mode?: 'observe' | 'enforce';
  shell?: { allowCommands?: string[]; denyCommands?: string[]; maxRequests?: number };
}): LocalExecutor;
