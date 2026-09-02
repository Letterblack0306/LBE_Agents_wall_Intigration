# LBE TUI Modular Status

Update this file only when a module changes.

| Module | Status | Product Relevance | Depends On | Notes |
|---|---|---|---|---|
| `00_integration_alignment.md` | ACTIVE | GOVERNANCE | - | Phase 0 alignment map. The canonical LBE workspace records PASS for complete runtime/session/application ownership, governed tools, provider continuation, external capability registration, and interface evidence surfaces. Rust mock mode is preview-only; live Rust adapter integration remains incomplete. LBE remains runtime authority. |
| `01_transcript_viewport.md` | IMPLEMENTED / LOCAL |CORE |- |Rust projection is implemented; LBE persisted conversation/event owner is PASS; live Rust event binding and PTY acceptance remain open. |
| `02_model_picker.md` | IMPLEMENTED / LOCAL — CATALOG ORDERING RECONCILED |CORE |- |Rust picker and real catalog-before-selection ordering are implemented; LBE provider/model owner and first-run pairing are PASS; installed live catalog acceptance remains open. |
| `03_checkpoints_restore.md` | IMPLEMENTED / LOCAL |CORE |- |Rust request/projection is implemented; LBE checkpoint/recovery owners exist; live Rust projection remains unproven. |
| `04_sessions.md` | IMPLEMENTED / LBE OWNER PASS; RUST ADAPTER PARTIAL |CORE |- |LBE session/application lifecycle is PASS; Rust contracts/projection exist but live service/event integration remains pending. |
| `05_background_processes.md` | PARTIAL — LBE OWNER EXISTS; RUST PROJECTION LOCALLY TESTED |CORE |- |LBE process/runtime owners exist; Rust process projection now identifies connected authoritative LBE state, while installed live event acceptance remains open. |
| `06_provider_configuration.md` | PARTIAL — LBE PROVIDER LIFECYCLE PASS; RUST IDENTITY/CATALOG ADAPTER RECONCILED |CORE |- |LBE provider registry/configuration/health/continuation are accepted; Rust accepts registered provider IDs and waits for authoritative catalog events, while richer editing and installed live binding remain pending. |
| `07_tools_registry.md` | PARTIAL — LBE R6E PASS; RUST PROJECTION LOCALLY TESTED |CORE |- |LBE ToolRegistry/orchestration/authorization/receipt/continuation are PASS; Rust connected tool projection is locally tested and installed live registry acceptance remains open. |
| `08_evidence_browser.md` | IMPLEMENTED / LOCAL TESTED — LIVE EVIDENCE ACCEPTANCE OPEN |CORE |07 |LBE EvidenceService is PASS; Rust typed evidence projection and connected-state UI labeling are implemented and tested; installed live evidence acceptance remains open. |
| `09_receipts_browser.md` | IMPLEMENTED / LOCAL TESTED — LIVE RECEIPT ACCEPTANCE OPEN |CORE |08 |LBE receipt lifecycle is PASS; Rust structured receipt projection, connected-state labeling, and empty-state rendering are implemented and tested; installed live receipt acceptance remains open. |
| `10_mcp_surface.md` | GOVERNED BIRDEYE ROUTING IMPLEMENTED — METADATA UI LOCALLY TESTED; LIVE MCP PROOF OPEN |CORE |- |Rust BirdEye requests cross the existing LBE `ToolRegistry`/R6C/R6E boundary; MCP metadata and connected-state UI projection are locally tested. Installed registry execution, DENY-zero, ALLOW-exactly-one, persisted MCP ordering, provider continuation, and installed UI acceptance remain open. |
| `11_terminal_compatibility.md` | IMPLEMENTED / LOCAL TESTED — LIVE TERMINAL ACCEPTANCE OPEN |CORE |- |Rust NO_COLOR handling, ASCII fallbacks, Unicode-width truncation, and local compatibility tests are implemented; external PTY/ConPTY lifecycle acceptance remains open. |
| `12_plain_cli_mode.md` | IMPLEMENTED / LOCAL TESTED — LIVE GOVERNED COMPLETION ACCEPTANCE OPEN |CORE |- |Rust --no-tui/headless routing, structured stdout events/results, stderr diagnostics, and exit-code contract are implemented; live governed completion remains runtime-dependent. |
| `13_lifecycle_acceptance.md` | PARTIAL — LBE RUNTIME PASS; RUST PTY NOT PROVEN |CORE |14 |LBE live lifecycle/interface is accepted; Rust external PTY/ConPTY cleanup smoke remains unproven. |
| `14_responsive_acceptance.md` | IMPLEMENTED / LOCAL TESTED — LIVE TERMINAL ACCEPTANCE OPEN |CORE |- |Rust compact 60x18/80x18 layouts, populated panel rendering, long-name truncation, and minimum-size fallback are locally tested; external terminal acceptance remains open. |
| `15_session_memory_recall.md` | PARTIAL — LBE MEMORY OWNER IMPLEMENTED; RUST INTEGRATION PENDING |CORE |04 |LBE memory/promotion/recovery owners are accepted; Rust durable recall/context integration remains pending. |
| `16_browser_chat_bridge.md` | CLOSED_PRE_INTEGRATION — LBE EXTERNAL CAPABILITY BOUNDARY PASS |EXTERNAL INTERACTION |15 |Pre-integration browser contract is closed; LBE external capability boundary is PASS; live browser automation remains unproven. |
| `17_policy_hooks_permissions.md` | IMPLEMENTED / LOCAL TESTED — LIVE AUTHORIZATION ACCEPTANCE OPEN |CORE |- |LBE authorization/policy is PASS; Rust approval-required/allow/deny projection and fail-closed continuation are implemented and tested; dedicated permissions/sandbox projection and installed live approval remain open. |
| `18_schedules.md` | MISSING — NO CURRENT LBE SCHEDULE OWNER EVIDENCE |SUPPORTING |- |No current LBE schedule product contract is proven; Rust schedules remain unimplemented. |
| `19_connectors.md` | PARTIAL — LBE EXTERNAL REGISTRATION ONLY; CONNECTOR PRODUCT NOT PROVEN |SUPPORTING |- |LBE external registration exists; connector lifecycle/product is not proven; Rust UI remains unimplemented. |
| `20_agent_teams.md` | PARTIAL — LBE EXTERNAL/SUBAGENT REGISTRATION ONLY; TEAM PRODUCT NOT PROVEN |ADVANCED CORE |04, 23 |LBE registration is governed; coordinated team/task-board product is not proven; Rust UI remains unimplemented. |
| `21_conversation_handoff.md` | PARTIAL — LBE SESSION PERSISTENCE PASS; HANDOFF PRODUCT NOT PROVEN |CORE FOR MULTI-CLIENT USE |04, 15 |LBE persistence/resume is PASS; cross-client handoff package/product is not proven; Rust UI remains unimplemented. |
| `22_artifacts_review.md` | PARTIAL — LBE EVIDENCE/DIFF SURFACES PASS; ARTIFACT REVIEW UI NOT PROVEN |CORE |03, 08, 09, 29 |LBE evidence/receipt/diff surfaces are PASS; complete artifact review UI remains unproven. |
| `23_subagents.md` | PARTIAL — LBE EXTERNAL CAPABILITY REGISTRATION PASS; SUBAGENT UI/RUNTIME NOT PROVEN |CORE FOR AGENTIC CODING |05, 07, 17 |LBE subagent registration is governed; complete subagent lifecycle/UI remains unproven. |
| `24_projects_settings.md` | PARTIAL — LBE HOME/PROVIDER/SESSION OWNERS PASS; RUST UI MISSING |CORE |06, 17 |LBE project/provider/session owners and interface contracts are PASS; Rust project/settings UI remains missing. |
| `25_composer_prompt_editor.md` | PARTIAL — LBE PROVIDER/CONTINUATION MECHANICS PASS; RUST EDITOR MISSING |CORE |- |LBE provider/continuation mechanics are PASS; Rust multiline editor and reference UX remain missing. |
| `26_statusline_title.md` | PARTIAL — LBE INTERFACE SURFACE PASS; RUST CONFIGURATION MISSING |UX SUPPORT |24 |LBE interface projections are PASS; Rust statusline/title configuration remains missing. |
| `27_code_search.md` | PARTIAL — LBE EVIDENCE/WORKSPACE READ OWNERS EXIST; SEARCH UI MISSING |CORE |07, 24 |LBE workspace/evidence owners exist; complete governed search product and Rust UI remain missing. |
| `28_usage_quotas.md` | PARTIAL — LBE PROVIDER HEALTH/CAPABILITY OWNERS EXIST; QUOTA PRODUCT NOT PROVEN |SUPPORTING |06 |LBE provider health/capability owners exist; verified quota/billing projection is not proven; Rust UI remains missing. |
| `29_workspace_changes_diff.md` | IMPLEMENTED / LOCAL TESTED — LIVE WRITABLE ACCEPTANCE OPEN |CORE |03, 08 |LBE governed mutation/evidence/diff owners are PASS; Rust changes/diff projection and local rendering are implemented and tested; live writable mutation and installed acceptance remain open. |
| `30_file_editor_patch_review.md` | IMPLEMENTED / LOCAL TESTED — LIVE PATCH ACCEPTANCE OPEN |CORE |17, 22, 29 |LBE mutation is authorization/receipt/evidence-bound; Rust patch review, accept/reject routing, identity checks, and diff/receipt/evidence projection are implemented and tested; live writable execution remains open. |
| `31_cline_interop_reuse_strategy.md` | PASS — CLINE/OPENCODE AUDIT COMPLETE; LBE ADAPTER COMPOSITION PROVEN; LIVE ACCEPTANCE OPEN |STRATEGIC |17-30 |Cline and pinned OpenCode revision `dc4449d` are reuse inputs behind the LBE-owned adapter. Installed provider composition is proven; live authenticated provider execution and visible installed TUI proof remain open. |
| `32_deterministic_runtime_state_machine.md` | CLOSED — LOCAL PRE-INTEGRATION FOUNDATION; LBE RUNTIME AUTHORITY PASS |CORE / BLOCKING |04, 05, 07, 13 |Local deterministic mock foundation remains closed for test scope; LBE complete runtime is the production authority and Rust must integrate it rather than extend mock authority. |
| `33_real_cli_ide_implementation_plan.md` | ACTIVE — REAL LBE + CLINE/OPENCODE REUSE INTEGRATION REQUIRED |CORE / SEQUENCING |31, 32 |LBE runtime owners are accepted; Rust must reuse/adapt Cline/OpenCode mechanics through a governed LBE adapter. Pinned OpenCode source validation, live event mapping, and installed interactive acceptance remain pending. |
| `34_p1_live_readonly_acceptance.md` | PASS — BOUNDED HISTORICAL RUST P1 CONTRACT |ACCEPTANCE |32, 33 |P1 contract remains valid for bounded read-only wrapper scope; it does not prove full current LBE/TUI integration. |
| `35_p1_live_acceptance_evidence_record.md` | HISTORICAL PASS — SUPERSEDED CURRENT LBE STATUS |ACCEPTANCE |34 |Historical Rust P1 evidence retained; current LBE status is defined by later canonical LBE checkpoints. |
| `36_p2_p3_client_contract.md` | LIVE READ-ONLY ADAPTER PROVEN — PROVIDER/CATALOG RECONCILED — FULL P2/P3 INCOMPLETE |CONTRACT |33, 34, 35 |Real Rust adapter and isolated live Agent Wall validation pass for workspace.read, workspace.list, workspace.glob, workspace.search, and read-only denial of modify with LBE receipt/evidence projection; provider identity decoding and catalog-before-selection ordering are locally proven; approval routing, patch review, diff rendering, credentialed writable mutation, installed live validation/completion, and full installed P2/P3 acceptance remain pending. |
| `34_autonomous_developer_frontend.md` | PARTIAL — LBE BACKEND CAPABILITIES PASS; RUST FEATURE SURFACES PARTIAL |CORE |32, 33 |LBE backend owners are accepted; Rust frontend scaffolding remains partial until it consumes authoritative projections. |
| `documentation_companion_plugin/` | VENDORED ISOLATED PROTOTYPE — NOT WIRED INTO RUNTIME | DOCUMENTATION SUPPORT | 00, 36 |Optional Python companion consumes LBE-owned identifiers/events and renders derived Markdown only when explicitly invoked; it has no runtime, authorization, execution, evidence, receipt, validation, completion, or persistence authority. |


## Current LBE workspace reconciliation (2026-08-31)

The LBE workspace is the authority for implemented runtime capabilities. Its current accepted slices include complete runtime/session/application ownership, R6E governed tool orchestration, external capability registration, Cline provider continuation, and interface control/evidence surfaces. Official Cline and pinned OpenCode sources are reuse inputs, not replacement authorities. TUI module status must distinguish LBE OWNER PASS from RUST TUI INTEGRATION PENDING; a local mock or projection does not replace the LBE owner, and an equivalent generic feature must not be recreated without a documented incompatibility or LBE-specific requirement.

## MCP/BirdEye sequencing checkpoint (2026-09-02)

The working MCP implementation is `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`. Its existing hashing, indexing, freshness, cache, and governed MCP surfaces are the implementation inputs for the backend integration slice. The TUI must consume those capabilities through the LBE-owned registry, authorization, execution, receipt, and evidence seams; it must not copy the server, create a second hash/index/cache store, or bypass governance. Backend MCP proof is active and independent of the separate UI agent. Only UI-dependent projection and installed UI acceptance are sequenced behind completion of the UI work.

Backend/integration proof obligations:

1. Resolve the canonical capability registry.
2. Verify BirdEye registration in LBE.
3. Prove unregistered capability rejection.
4. Prove authorization precedes BirdEye invocation.
5. Prove `DENY` equals zero BirdEye execution.
6. Prove `ALLOW` equals exactly one invocation.
7. Correlate result → LBE receipt → evidence.
8. Prove provider continuation.
9. Prove persisted event sequence.

## MCP/BirdEye implementation update (2026-09-02)

The Rust adapter no longer invokes `C:\MCP Local\Letterblack_BirdEye\mcp_server.py` directly for BirdEye queries. It now invokes the existing LBE product command `tool mcp.birdeye.<tool>` with session, workspace, and operation identity. The LBE runtime registers bounded BirdEye capabilities behind its existing `ToolRegistry` and `GovernedToolOrchestrator`, preserving authorization-before-handler execution, receipt generation, evidence projection, and operation-id idempotency ownership in LBE.

Validation: LBE focused external-capability/product/orchestration tests `75 passed`; Rust full suite `205 passed`; Rust `cargo check` passed; Python compilation passed. `cargo fmt -- --check` remains failed because of existing formatting differences in unrelated working-tree changes. The installed live MCP proof gate remains open: the configured live registry/runtime fixture was unavailable, so BirdEye registration in the installed registry, DENY-zero, ALLOW-exactly-one, persisted event ordering, provider continuation, and installed Rust/TUI acceptance are not claimed complete.
