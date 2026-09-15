# Release Scope

## Release version
v1.3.42

## Allowed in this release
- Execution bridge proof
- Observe mode
- Enforce mode
- Audit/observe logging
- Local policy
- Package validation
- README/install alignment

## Not allowed in this release
- Hosted service
- Dashboard
- MCP expansion unless explicitly scoped
- New adapters
- CEP-specific feature code
- AI model features
- UI product work
- Marketing claims beyond proven behavior

## Release pass condition
No release unless:
- tests pass
- package dry-run is clean
- audit/observe proof exists
- denied action is blocked in enforce mode
- file remains unchanged after denied action
