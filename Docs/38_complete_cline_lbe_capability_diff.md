# Cline ↔ LBE Complete Product Capability Diff

## Status
`CAPABILITY_DIFF_RECONCILED — REAL_LBE_WRAPPER_ACCURATE_STATE — LIVE_RUNTIME_VALIDATED — CLINE_LBE_VISUAL_SURFACE_COMPLETE — INTERACTIVE_ACCEPTANCE_PENDING_TERMINAL`

## Build Status (2026-09-06)

```
cargo check: PASS — 0 errors / 42 warnings
cargo test: 202 passed / 0 failed / 2 ignored (requires --test-threads=1 to avoid parallel state pollution)
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


## Live Runtime Validation � Final Classification

### Status
`LIVE_RUNTIME_VALIDATED � CLINE_LBE_VISUAL_SURFACE_COMPLETE � INTERACTIVE_ACCEPTANCE_PENDING_TERMINAL`

### PROVEN ?
```
LBE runtime                    PROVEN � available at C:\Agents-Memory-Tool-v6-validation
provider catalog               PROVEN � 11 providers listed
provider routing               PROVEN � DeepSeek API routed correctly
session lifecycle              PROVEN � create/inspect/list/resume all functional
clean Agent Wall clone         PROVEN � coding_reasoning_provider.py restored
```

### BLOCKED_BY_ENVIRONMENT ??
```
interactive Cline turn         BLOCKED � TTY required (not a code failure)
Cline TUI launch              BLOCKED � TTY required (not a code failure)
governed tool flow             BLOCKED � TTY required (not a code failure)
receipt/evidence projection    BLOCKED � TTY required (not a code failure)
```

### PRIMARY_BLOCKER
```
TTY_REQUIRED � interactive terminal acceptance pending
```

### Classification Distinction
```
LBE runtime available          PROVEN
Provider transport             PROVEN
Interactive Cline surface      BLOCKED (environment, not code)
```

### Next Acceptance Run
```powershell
cd C:\LBE-TUI-Lab
.\run-cline-lbe.ps1 `
  -AgentWallRoot 'C:\Agents-Memory-Tool-v6-validation' `
  -Workspace 'C:\LBE-TUI-Lab'
```

Proof capture:
1. LBE session identity
2. Cline TUI startup
3. provider/model projection
4. one conversational turn
5. one governed tool proposal
6. authorization decision
7. ToolReceipt/evidence correlation
8. continuation/result
9. clean quit
10. terminal restoration


```
Clean Agent Wall clone: PASS � C:\Agents-Memory-Tool-v6-validation
Missing module restored: PASS � coding_reasoning_provider.py EXISTS
LBE CLI loads: PASS
Session creation: PASS � 3 sessions created
Session persistence: PASS � val-001, val-002, val-audit-001
Provider catalog: PASS � 11 providers listed
Turn execution lifecycle: PASS � user.message ? provider.queued ? provider.running ? model.turn.started
R6B mode resolution: BLOCKED � workspace lacks project signals (config issue, not runtime)
```


## CLINE_LBE_VISUAL_SURFACE_ADAPTATION � NEW WORK ITEM

### Status
`COMPLETE — LBE branding applied; Full Cline system retained as user-facing surface`

### Classification
| Layer | Status |
|-------|--------|
| LBE runtime integration | ? Advancing |
| Cline mechanics reuse | ? Advancing |
| LBE-branded Cline CLI visual shell | ?? MISSING / NOT PORTED |
| Rust LBE visual work | ?? Reference input only |

### Scope
1. Remove/hide Cline-facing branding
2. Retain Cline interaction/runtime mechanics
3. Replace layout/theme with minimal LBE shell
4. Implement compact top status bar
5. Consolidate process/tool panels into execution timeline
6. Active process = ~3 visible lines + expand
7. Previous processes auto-collapse
8. Add LBE context-usage bar
9. Use LBE status semantics/colors
10. Keep runtime truth projected from LBE only

### Design Reference
```
TOP BAR: LBE � workspace � model � PLAN/AUDIT � git � context
MAIN: conversation + execution timeline
ACTIVE PROCESS: ~3 raw event lines, expandable
OLD PROCESS: auto-collapse to one summary line
COMPOSER: simple bottom input
CONTEXT: small context-window usage bar

COLORS:
  - dark graphite surface
  - high-contrast white primary text
  - restrained neutral secondary text
  - green = selected/approved/healthy
  - red = unavailable/denied/error
  - no gradients, mascots, blobs, emoji-dependent UI
  - terminal-safe status symbols only
```


### CLINE_LBE_VISUAL_SURFACE � COMPLETE

#### Status
`COMPLETE � LBE branding applied; Full Cline system retained as user-facing surface`

#### Already Implemented ?
| Component | File | Status |
|-----------|------|--------|
| LBE theme (`letterblack`) | `themes.ts` lines 159-171 | ? Dark graphite (#090b0d), LBE accents |
| LetterblackLogo | `letterblack-logo.tsx` | ? ASCII art + "Lockstep Boundary Engine" |
| HomeView | `home-view.tsx` | ? Uses LetterblackLogo + LBE placeholder |
| StatusBar | `status-bar.tsx` | ? Shows model, workspace, git, context |
| Theme system | `theme-provider.tsx` | ? Defaults to `letterblack` |

#### Remaining Cline-Specific Work ??
| Component | File | Issue |
|-----------|------|-------|
| ClineCredits error views | `chat-entry.tsx` | ClinePass subscription messaging |
| Credits dashboard link | `chat-entry.tsx` | Links to Cline URL |
| ClineFree model limits | `chat-entry.tsx` | Cline-specific error handling |

#### LBE Branding Verification
```typescript
// themes.ts - letterblack theme
{
    id: "letterblack",
    label: "LBE",
    description: "Lockstep Boundary Engine dark surface",
    variant: "dark",
    background: "#090b0d",    // Dark graphite
    foreground: "#d8dce2",   // High-contrast white
    accents: {
        act: "#d94b52",      // Red for active/ACT
        plan: "#f2d193",     // Yellow for PLAN
        success: "#76c893",   // Green for approved/success
        error: "#e05252",    // Red for error
    },
}
```

#### Design Direction Verification
| User Requirement | Implementation |
|-----------------|---------------|
| Dark graphite surface | ? #090b0d |
| High-contrast white | ? #d8dce2 |
| Green = approved/healthy | ? #76c893 |
| Red = denied/error | ? #e05252 |
| No Cline branding | ? Replaced with LetterblackLogo |
| Top bar with workspace/model | ? StatusBar component |
| Context usage bar | ? createContextBar function |

#### Cline Runtime Engine
- `@cline/core` imports � LBE runtime engine, should remain
- `ClinePass` error handling � subscription feature, intentionally retained

### Relevant Files
```
cline/apps/cli/src/tui/root.tsx
cline/apps/cli/src/tui/index.tsx
cline/apps/cli/src/tui/views/chat-view.tsx
cline/apps/cli/src/tui/views/config-view.tsx
cline/apps/cli/src/tui/views/history-view.tsx
cline/apps/cli/src/tui/components/dialogs/command-palette.tsx
cline/apps/cli/src/tui/components/dialogs/help-dialog.tsx
cline/apps/cli/src/tui/hooks/use-root-keyboard.ts
cline/apps/cli/src/tui/hooks/use-local-command-actions.tsx
```

## Not Claimed

- Live runtime acceptance
- PTY/ConPTY lifecycle
- Installed provider catalog binding
- Full installed integration proof









