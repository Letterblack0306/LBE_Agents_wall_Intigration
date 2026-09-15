# Agent Rules

## Mandatory rule

Do not edit first.

Every agent must:

1. Read:
   - WORKSPACE_CONTRACT.md
   - RELEASE_SCOPE.md
   - FEATURE_LEDGER.json
   - REMOVED_FEATURES.json
   - VALIDATION_GATES.md
   - ISSUE_LEDGER.md
2. Run workspace audit.
3. Write findings into ISSUE_LEDGER.md.
4. Stop and report.
5. Patch only documented and approved issues.

## Forbidden

Agents must not:
- restore removed features
- add new features outside RELEASE_SCOPE.md
- edit unrelated files
- use git add .
- claim release success without validation output
- claim LBE protection without audit/observe evidence
- modify policy files directly unless task explicitly says policy update
- publish/tag/push unless explicitly instructed

## Strongest rule

The agent cannot fix anything it has not first documented as an ISSUE.

## Release proof rule

No audit/observe entry means LBE was bypassed.
Bypass means release fails.
