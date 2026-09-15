#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.resolve(scriptDir, '..', '.githooks');
execFileSync('git', ['config', 'core.hooksPath', path.relative(repoRoot, hooksDir)], { stdio: 'inherit' });
console.log('[mainhead-guard] Git hooks configured from .githooks');
