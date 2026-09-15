export interface LBEActor {
  id: string;
  role: 'user' | 'system' | 'agent';
}

export interface LBEIntent {
  type: 'command' | 'query' | 'task';
  name: string;
  payload: Record<string, unknown>;
}

export interface LBEExecuteInput {
  version: '1.0';
  request_id: string;
  timestamp: number;
  actor: LBEActor;
  intent: LBEIntent;
  context: {
    workspace: string;
    env: Record<string, unknown>;
    history: unknown[];
  };
  constraints: {
    policy_mode: 'strict' | 'permissive';
    timeout_ms: number;
  };
  auth: {
    signature: string;
    nonce: string;
  };
}

export interface LBEExecuteOutput {
  ok: boolean;
  result: {
    type: 'allowed' | 'denied' | 'error';
    action: string;
    data: Record<string, unknown>;
  };
  policy: {
    decision: 'allow' | 'deny' | 'escalate';
    reason: string;
    rules: string[];
  };
  trace: {
    id: string;
    steps: unknown[];
    hash: string;
  };
  error: null | {
    code: string;
    message: string;
  };
}

export function execute(input: string): string;

export type LBEExecutionIntent = 'read_file' | 'write_file' | 'patch_file' | 'delete_file' | 'run_shell';

export interface LBERequest {
  id?: string;
  actor?: string;
  intent: LBEExecutionIntent;
  target?: string;
  content?: string;
  patch?: unknown;
  command?: { cmd: string; args: string[]; cwd?: string; timeoutMs?: number; maxOutputBytes?: number };
  reason?: string;
}

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

// ── Policy file types ─────────────────────────────────────────────────────

export type LBEMode = 'observe' | 'enforce';
export type LBERuleEffect = 'deny' | 'allow';
export type LBERuleType = 'path' | 'command';

export interface LBEPolicyRule {
  id: string;
  effect: LBERuleEffect;
  type: LBERuleType;
  pattern: string;
  from: string;
  at: string;
}

export interface LBEPolicy {
  version: number;
  mode: LBEMode;
  workspace: string;
  rules: LBEPolicyRule[];
}

// ── High-level ergonomic API ──────────────────────────────────────────────

export interface LBEResult {
  ok: boolean;
  denied: boolean;
  reason: string | null;
  commandId: string | null;
  stage?: string;
  risk?: string | null;
  output?: unknown;
  error: string | null;
}

export interface LBEObservedResult {
  ok: true;
  observed: true;
  intent: string;
  actor: string;
  commandId: string | null;
}

export interface LBEToolDef {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LBEDispatchContext {
  agentId?: string;
  actor?: string;
}

export interface LBEWrappedTools {
  definitions: LBEToolDef[];
  dispatch(
    toolName: string,
    args?: Record<string, unknown>,
    context?: LBEDispatchContext,
  ): Promise<LBEResult | LBEObservedResult>;
}

export interface LBEAddedRule {
  id: string;
  added: true;
}

export interface LBEInstance {
  mode: LBEMode;
  rootDir: string;
  execute(opts: { actor?: string; intent: string; [key: string]: unknown }): Promise<LBEResult | LBEObservedResult>;
  wrapTools(toolDefs: LBEToolDef[]): LBEWrappedTools;
  /** Advisory only; never writes lbe.policy.json. */
  proposePolicyRule(rule: { effect: LBERuleEffect; type: LBERuleType; pattern: string; from: string }): { proposed: true; at: string };
  /**
   * Detect if a user message expresses a permanent block instruction.
   * Returns a rule object to pass to addRule(), or null if not a policy intent.
   * llmCall receives a ready-made prompt and must return the LLM's text response.
   */
  detectPolicyIntent(
    userMessage: string,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<{ effect: LBERuleEffect; type: LBERuleType; pattern: string } | null>;
}

export interface LBEOptions {
  rootDir?: string;
  actor?: string;
  mode?: LBEMode;
}

export function createLBE(opts?: LBEOptions): LBEInstance;
