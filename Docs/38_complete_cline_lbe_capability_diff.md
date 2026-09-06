# Cline ↔ LBE Complete Product Capability Diff

## Status
`CAPABILITY_DIFF_RECONCILED — REAL_LBE_WRAPPER_ACCURATE_STATE — LIVE_RUNTIME_PENDING`

## Build Status (2026-09-06)

```
cargo check: PASS — 0 errors / 42 warnings
cargo test: 199 passed / 3 expected live-fixture failures / 2 ignored
```

## RealLbeWrapper Request Coverage

### Dispatch Table Summary
```
Total UserRequest variants covered by submit dispatch: 37
```

### IMPLEMENTED (22 methods)

| Request | Helper Function | LBE Owner |
|---------|-----------------|-----------|
| StartSession | create_real_session() | LBE session lifecycle |
| ListSessions | list_real_sessions() | LBE session registry |
| ResumeSession | resume_real_session() | LBE session continuity |
| ValidateProvider | validate_real_provider() | LBE provider health |
| RefreshRuntimeSnapshot | attach() | LBE runtime connection |
| RefreshMcpRegistry | refresh_mcp_registry() | LBE MCP registry |
| QueryBirdEye | query_birdeye() | LBE memory/evidence |
| RefreshProviderCatalog | refresh_provider_catalog() | LBE provider catalog |
| SelectModel | select_model() | LBE model binding |
| SubmitTask | submit_conversational_turn() | LBE turn runtime |
| Continue | submit_conversational_turn() | LBE turn continuation |
| InspectWorkspace | inspect_workspace() | LBE workspace inspection |
| ListWorkspace | list_workspace() | LBE workspace listing |
| GlobWorkspace | glob_workspace() | LBE workspace glob |
| SearchWorkspace | search_workspace() | LBE workspace search |
| PatchWorkspace | patch_workspace() | LBE governed mutation |
| RunRegisteredProcess | run_registered_process() | LBE process authority |
| RequestAuthorization | request_authorization() | LBE authorization |
| Approve | resolve_authorization("approve") | LBE authorization |
| Reject | resolve_authorization("reject") | LBE authorization |
| RunDiagnostics | run_real_diagnostics() | LBE diagnostics |
| Abort | abort_real_turn() | LBE turn lifecycle |

### UNSUPPORTED (15 individual / 7 categories)

| Request | Error Message | Category Classification |
|---------|--------------|------------------------|
| CloseSession | "session closing" | PRESENT_IN_LBE_BUT_NOT_ADAPTED |
| ConfigureProvider | "provider configuration" | INTENTIONALLY_EXCLUDED — client config authority |
| RemoveProvider | "provider removal" | PRESENT_IN_LBE_BUT_NOT_ADAPTED |
| SetMode | "mode changes" | INTENTIONALLY_EXCLUDED — mode is LBE-authoritative |
| CompareCheckpoint | "checkpoint comparison" | MISSING_AND_RELEVANT — checkpoint owner unclear |
| RestoreCheckpoint | "checkpoint restore" | MISSING_AND_RELEVANT — checkpoint owner unclear |
| CompactContext | "context compaction" | PRESENT_IN_LBE_BUT_NOT_ADAPTED |
| RecallSessionMemory | "session memory operations" | MISSING_AND_RELEVANT — memory contract unclear |
| RecallSession | "session memory operations" | MISSING_AND_RELEVANT |
| CreateMemoryCheckpoint | "session memory operations" | MISSING_AND_RELEVANT |
| ForgetSessionMemory | "session memory operations" | MISSING_AND_RELEVANT |
| AttachBrowserChat | "browser chat" | MISSING_AND_RELEVANT — browser contract unclear |
| DetachBrowserChat | "browser chat" | MISSING_AND_RELEVANT |
| SendBrowserMessage | "browser chat" | MISSING_AND_RELEVANT |
| ContinueBrowserSession | "browser chat" | MISSING_AND_RELEVANT |

**Unsupported Categories:**
1. Session close — `PRESENT_IN_LBE_BUT_NOT_ADAPTED`
2. Provider configuration — `INTENTIONALLY_EXCLUDED`
3. Mode changes — `INTENTIONALLY_EXCLUDED`
4. Checkpoint operations — `MISSING_AND_RELEVANT`
5. Context compaction — `PRESENT_IN_LBE_BUT_NOT_ADAPTED`
6. Session memory — `MISSING_AND_RELEVANT`
7. Browser chat — `MISSING_AND_RELEVANT`

## Classification Legend

| Code | Meaning |
|------|---------|
| `ADAPT_FROM_CLINE` | Adapt Cline mechanics; LBE owns authority boundary |
| `PRESENT_IN_LBE` | LBE owns authoritative implementation |
| `REUSED_FROM_CLINE` | Cline source directly reused |
| `INTENTIONALLY_EXCLUDED` | Not in scope; preserve LBE boundary |
| `MISSING_AND_RELEVANT` | Not yet implemented; contract exists |
| `PRESENT_IN_LBE_BUT_NOT_ADAPTED` | LBE has capability but not connected |
| `UNVERIFIED` | LBE current state unknown; audit required |

## Next Steps

1. **Verify Live Runtime Attachment** — attach RealLbeWrapper to real LBE runtime
2. **Implement MISSING_AND_RELEVANT** — checkpoint, memory, browser contracts
3. **Decide PRESENT_IN_LBE_BUT_NOT_ADAPTED** — which to wire vs leave unsupported
4. **Decide INTENTIONALLY_EXCLUDED** — confirm these boundaries are correct

## Not Claimed

- Live runtime acceptance
- PTY/ConPTY lifecycle
- Installed provider catalog binding
- Full installed integration proof

