#!/usr/bin/env node
import { runGovernanceCheck } from './governance.mjs';

const mode = process.argv[2] === 'pre-push' ? 'head' : 'staged';
const label = mode === 'head' ? 'pre-push' : 'pre-commit';
const result = runGovernanceCheck({ mode });

if (!result.ok) {
    console.error(`[${label}] BLOCKED`);
    for (const blocker of result.blockers) console.error(JSON.stringify(blocker));
    process.exit(1);
}

console.log(`[${label}] PASS: issue scope validated`);
