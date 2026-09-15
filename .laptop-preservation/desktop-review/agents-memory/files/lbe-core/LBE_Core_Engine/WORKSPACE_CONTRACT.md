# Workspace Contract

This workspace builds LBE as a local-first SDK/CLI execution boundary.

LBE is:
- local-first
- SDK/CLI-first
- agent execution governance
- audit/rollback/proof layer

LBE is not:
- hosted agent platform
- cloud dashboard
- chatbot
- After Effects-only tool
- general automation framework
- replacement for human review

## Operating model

```text
Agent proposes.
LBE/controller decides.
Adapter executes.
Audit proves.
Rollback recovers.
```

No release is valid unless the workspace proves that agent file/shell actions pass through LBE and leave audit/observe evidence.
