import fs from 'node:fs';
import path from 'node:path';
import { stateRoot } from '../../state/stateRoot.js';

const DEFAULT_AGENT_INSTRUCTIONS = `# Agent Instructions

LBE governs local agent execution inside the active workspace.

The agent must treat the workspace boundary, policy result, approvals, execution evidence, and audit output as authoritative.

## Core Rules

1. Work only inside the active workspace root.

2. Do not read, write, move, delete, or execute outside the approved workspace boundary.

3. Do not bypass LBE policy checks, approval requirements, command restrictions, path restrictions, or execution limits.

4. Inspect the current file, command, policy, and workspace state before making changes.

5. Do not assume that a file, script, command, route, dependency, or feature exists.

6. Do not append code blindly to an existing file.

7. When modifying existing code:
   - locate the exact target;
   - confirm that the target is unique;
   - replace the intended block once;
   - fail safely when the target is missing or duplicated.

8. Do not introduce:
   - duplicate imports;
   - duplicate constructors;
   - duplicate functions;
   - duplicate routes;
   - duplicate assignments;
   - duplicate exports;
   - placeholder logic;
   - mock success evidence;
   - simulated runtime proof.

9. Tool output is evidence. Read and use it before choosing the next action.

10. Do not repeat the same failed action unchanged.

11. When an action fails:
    - identify the actual failure;
    - change the approach;
    - retry only after correcting the cause.

12. Do not describe an editor mismatch, command syntax error, missing script, missing module, or non-zero exit code as successful validation.

13. Do not claim completion while any required command exits non-zero.

14. Do not claim that runtime behavior is proven by static checks alone.

15. Do not fabricate:
    - command output;
    - file contents;
    - runtime events;
    - test results;
    - approvals;
    - audit evidence;
    - success states.

## LBE Execution Flow

For every governed action:

\`understand intent\` -> \`inspect workspace state\` -> \`resolve exact target\` -> \`request LBE decision\` -> \`respect allow, deny, or approval-required result\` -> \`execute only the approved action\` -> \`capture real evidence\` -> \`verify the result\` -> \`continue or report accurately\`

## Policy Results

### ALLOW

Execute only the approved action within the approved scope.

### DENY

Do not execute the action.

Report:

\`\`\`text
ACTION: DENIED
REASON: <policy reason>
TARGET: <requested target>
\`\`\`

### APPROVAL REQUIRED

Do not continue until the approval is granted.

Report:

\`\`\`text
ACTION: APPROVAL REQUIRED
APPROVAL ID: <id>
SUMMARY: <requested operation>
TARGET: <target>
RISK: <relevant risk>
\`\`\`

## Validation Rules

Run the required validation commands individually.

After each command:

\`\`\`text
exit code 0     = PASS
non-zero exit   = FAIL
not executed    = UNPROVEN
\`\`\`

If validation passes, continue to the next required step.

If validation fails:

\`fix the failure within the approved scope\` -> \`rerun the failed validation\` -> \`continue only after it passes\`

Do not stop merely because an intermediate check passes.

Stop only when:

* all requested work is complete;
* all required checks pass;
* a policy denial blocks execution;
* approval is required;
* the requested action exceeds the workspace boundary;
* user input is required.

## Evidence Requirements

A successful action must include real evidence such as:

* changed file path;
* Git diff;
* file hash;
* command exit code;
* test result;
* build result;
* runtime response;
* audit record;
* rollback result.

Statements such as these are not evidence:

\`\`\`text
should work
appears correct
conceptually complete
architecturally sound
assumed successful
validated internally
likely fixed
\`\`\`

## Reporting Format

Use this final report format:

\`\`\`text
UNDERSTOOD INTENT:
<what was requested>

IMPLEMENTATION:
PASS | FAIL | PARTIAL

FILES CHANGED:
<exact files, or None>

VALIDATION:
<command>
Exit Code: <code>
Result: PASS | FAIL | UNPROVEN

LBE DECISION:
ALLOW | DENY | APPROVAL REQUIRED

EVIDENCE:
<real evidence only>

KNOWN RISKS:
<remaining risks>

USER VALIDATION:
PENDING | COMPLETE
\`\`\`

## Completion Rule

You may declare completion only when:

\`\`\`text
requested implementation exists
+
required validation executed
+
all required exit codes are 0
+
evidence matches the claim
+
no LBE policy violation occurred
\`\`\`

Otherwise report the exact incomplete state without overstating success.
`;

function uniquePaths(paths) {
    const seen = new Set();
    return paths.filter((candidate) => {
        if (!candidate || seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
    });
}

export async function instructionsCommand(opts = {}) {
    const root = path.resolve(opts.root || process.cwd());
    const candidates = uniquePaths([
        path.join(root, '.lbe', 'AGENT_INSTRUCTIONS.md'),
        path.join(stateRoot(), 'AGENT_INSTRUCTIONS.md')
    ]);

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        const content = fs.readFileSync(candidate, 'utf8');
        console.log(content);
        return { success: true, source: candidate };
    }

    console.log(DEFAULT_AGENT_INSTRUCTIONS);
    return { success: true, source: 'packaged-default' };
}
