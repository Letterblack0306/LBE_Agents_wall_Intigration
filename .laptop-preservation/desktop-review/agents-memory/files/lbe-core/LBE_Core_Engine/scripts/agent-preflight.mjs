#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { workspaceRoot } from './governance-utils.mjs';

const commands = [
  ['npm', ['run', 'gate:workspace-structure']],
  ['npm', ['run', 'validate:docs']],
  ['npm', ['run', 'gate:feature-governance']],
  ['npm', ['run', 'gate:src-orphan-detection']],
  ['npm', ['run', 'validate:registry']],
  ['npm', ['run', 'gate:changelog']]
];

for (const [cmd, args] of commands) {
  execFileSync([cmd, ...args].join(' '), { cwd: workspaceRoot, stdio: 'inherit', shell: true });
}

console.log('[agent-preflight] PASS: fast validation includes governance blockers');
