# Autonomous Developer Frontend Features (Handoff)

## Status
IMPLEMENTED (frontend scaffolding exists; blocked on real Agent Wall integration)

## Product Relevance
CORE / BLOCKING (full completion requires real Agent Wall attachment and feature-specific wall capabilities)

## Purpose
Map the autonomous developer frontend features (TUI-33 through TUI-40) to current implementation state, documenting what is implemented in the TUI, what remains mock/partial, and what specifically requires the real Agent Wall to become "real" instead of mock.

This document serves as a handoff from product/design to implementation. It follows the Handoff Result Format specified in the handoff document.

## Boundary Reminder
As established in the handoff document and verified in the codebase:
- User -> LBE TUI / CLI -> LbeWrapper -> Agent Wall / runtime authority
- The TUI may request, render, navigate, inspect, and review
- The TUI must not own canonical runtime truth, create canonical evidence/receipts, or directly execute tools/processes

## Implementation Evidence
Evidence level: PROVEN (via direct code inspection)
- Handoff features TUI-33 through TUI-40 correspond to existing routes/panels in app.rs handle_command()
- Mock projections exist in types.rs and memory.rs
- 42/42 unit tests pass (PROVEN via cargo test)
- RealLbeWrapper skeleton exists in wrapper.rs lines 1000-1123
- Current state: MOCK / NOT CONNECTED (UI CONTRACT PREVIEW - verified via runtime behavior)

---

## TUI-33: Project Context / Resume Surface

FEATURE
Project Context / Resume Surface
STATUS
PARTIAL (implemented as mock-only; requires real session persistence for full implementation)
PROJECTION USED
MemoryProjection (session_hash, indexed_sessions, indexed_memories, last_recall_query, recent_records)
REQUESTS USED
RecallSessionMemory (with query: "recent", limit: 5), RecallSession, SessionMemoryIndexed, MemoryRecallResult
UI SURFACE
/memory route -> MockPanel::Memory panel (app.rs:209-218), snapshot.memory, transcript rendering (ui.rs:683-698)
VALIDATION
- Unit tests: tests.rs validates memory recall events flow
- Manual: /memory shows mock session records with timestamps, types, summaries
- Evidence: MemoryRecord, SessionMemoryRef types fully typed (types.rs:11-30)
RUNTIME GAP
Requires real LBE memory adapter for: durable persistence across restarts, @memory/@session context references, automatic bounded recall before turns, real verification/promotion of memories
SCOPE CHANGE
NONE

---

## TUI-34: Project Knowledge / Decision Browser

FEATURE
Project Knowledge / Decision Browser
STATUS
PARTIAL (implements session memory browsing; lacks decision-specific views, requirement->decision->implementation linkage, filtering by status/component)
PROJECTION USED
MemoryProjection + MemoryRecord (with record_type: AgentDecision)
REQUESTS USED
RecallSessionMemory, MemoryRecallResult, SessionMemoryIndexed
UI SURFACE
/memory route -> MockPanel::Memory panel (shows all memory record types including AgentDecision)
VALIDATION
- Unit tests: MemoryRecord::AgentDecision label = "AGENT_DECISION" (types.rs:52)
- Manual: /memory panel displays memory records with type labels
- Evidence: MemoryRecordType enum includes AgentDecision (types.rs:39-47)
RUNTIME GAP
Requires real LBE memory adapter for: decision detail views, requirement tracing, architecture area tagging, alternatives tracking, evidence/receipt linkage, superseded_by tracking, filtering by session/file/component/status
SCOPE CHANGE
NONE

---

## TUI-35: Code -> Intent / Provenance View

FEATURE
Code -> Intent / Provenance View
STATUS
MOCK (implements browser chat bridge for intent capture; lacks file/hunk -> requirement/execution/test mapping)
PROJECTION USED
BrowserChatProjection (last_browser_message_id, last_evidence_ref, last_receipt_id, status)
REQUESTS USED
AttachBrowserChat, SendBrowserMessage, ContinueBrowserSession, DetachBrowserChat, BrowserToolRequested, BrowserToolResultDelivered
UI SURFACE
/browser, /browser-chat, /browser-attach, /browser-detach routes -> MockPanel::Browser panel (app.rs:219-236), browser chat events in transcript (ui.rs:709-748)
VALIDATION
- Unit tests: BrowserChatAttachment/Message events implemented (events.rs:213-238)
- Manual: Browser chat panel shows connection status, last message ID
- Evidence: BrowserChatAdapter trait defined (browser_chat.rs:63-71), BrowserChatMessage/Event structs
RUNTIME GAP
Requires real Agent Wall for: file/hunk -> requirement mapping, execution -> test/evidence mapping, related decision/artifact/checkpoint navigation, real evidence/receipt ownership (TUI only renders)
SCOPE CHANGE
NONE


---

## TUI-36: Change Impact Analysis View

FEATURE
Change Impact Analysis View
STATUS
MOCK (implements checkpoint/restore vocabulary; lacks affected modules, dependency graph, risk classification, review-required state)
PROJECTION USED
CheckpointDescriptor (checkpoint_id, created_at, workspace_revision, changed_files)
REQUESTS USED
CreateMemoryCheckpoint, CheckpointCreated, CheckpointComparisonReady, CheckpointRestoreRequested/Blocked/Restored
UI SURFACE
/checkpoints route -> MockPanel::Undo panel (app.rs:244-245), checkpoint events in transcript (ui.rs:393-429)
VALIDATION
- Unit tests: Checkpoint events implemented (events.rs:56-72)
- Manual: /checkpoints panel shows checkpoint restore options
- Evidence: CheckpointDescriptor struct (types.rs:373-382), changed_files vector
RUNTIME GAP
Requires real Agent Wall for: affected modules calculation, dependency graph generation, affected tests identification, runtime/contracts impact analysis, risk classification, blockers identification, review-required state determination
SCOPE CHANGE
NONE

---

## TUI-37: Hypothesis -> Test -> Verify UI

FEATURE
Hypothesis -> Test -> Verify UI
STATUS
PARTIAL (implements validation events flow; lacks observation->hypothesis->proposed test->test result->implementation step->validation result->confidence cycle UI)
PROJECTION USED
ValidationLifecycle (NotStarted, Started, Passed, Failed, InsufficientEvidence), DiagnosticCheck (id, category, status, message)
REQUESTS USED
RunDiagnostics, DiagnosticsUpdated, ValidationStarted, ValidationCompleted
UI SURFACE
/doctor route -> MockPanel::Doctor panel (app.rs:238-242), diagnostics/validation events in transcript (ui.rs:136-138), validation events (ui.rs:183-189)
VALIDATION
- Unit tests: ValidationStarted/Completed events (events.rs:183-189), DiagnosticCheck struct (types.rs:671-677)
- Manual: /doctor shows mock diagnostics with PASS/FAIL/WARNING status
- Evidence: ValidationStatus enum (events.rs:258-273), DiagnosticStatus enum (types.rs:653-668)
RUNTIME GAP
Requires real Agent Wall for: observation capture, hypothesis formulation, proposed test generation, test execution supervision, result collection, implementation step tracking, validation result aggregation, confidence scoring, superseded hypothesis history
SCOPE CHANGE
NONE

---

## TUI-38: Dependency / Task Graph

FEATURE
Dependency / Task Graph
STATUS
PARTIAL (implements plan/audit modes and task submission; lacks dependency graph visualization, blocking relationships, ready/blocked/running/completed state tracking, agent/owner projection)
PROJECTION USED
PlanUpdated event (text field), AgentMode enum (Regular, Audit)
REQUESTS USED
SubmitTask (with mode: AgentMode), SetMode, Continue
UI SURFACE
/mode route (cycles agent modes), /audit route (sets AgentMode::Audit), plan transcript rendering (ui.rs:146-148)
VALIDATION
- Unit tests: PlanUpdated event (events.rs:146-148), AgentMode cycling (app.rs:83, types.rs:587-602)
- Manual: /mode shows current agent mode, /audit switches to audit mode
- Evidence: SessionStatus::WaitingForApproval mapping to Phase::AwaitingApproval (types.rs:90-94)
RUNTIME GAP
Requires real Agent Wall for: canonical task state ownership, dependency graph rendering, blocking relationship visualization, ready/blocked/running/completed state tracking, agent/owner assignment display, evidence/receipt linkage to tasks
SCOPE CHANGE
NONE

---

## TUI-39: Validation Strategy Viewer

FEATURE
Validation Strategy Viewer
STATUS
PARTIAL (implements validation event categories and status; lacks required vs optional distinction, last result persistence, blocked reason tracking)
PROJECTION USED
ValidationLifecycle, ValidationStatus, DiagnosticCheck (category field)
REQUESTS USED
RunDiagnostics, DiagnosticsUpdated, ValidationStarted, ValidationCompleted
UI SURFACE
/doctor route -> MockPanel::Doctor panel, diagnostics/validation events in transcript
VALIDATION
- Unit tests: Validation lifecycle events (events.rs:183-189), DiagnosticCheck category field
- Manual: /doctor shows validation categories (unit/integration/etc.) with PASSED/FAILED/INSUFFICIENT_EVIDENCE
- Evidence: ValidationLifecycle enum (wrapper.rs:43-49), ValidationStatus enum (events.rs:258-273)
RUNTIME GAP
Requires real Agent Wall for: required vs optional tagging per strategy, last result persistence, blocked reason storage/display, evidence/ref linkage per strategy, strategy_id tracking
SCOPE CHANGE
NONE

---

## TUI-40: Documentation Review Surface

FEATURE

## Artifact / Diff / Test Review (Additional from handoff)

FEATURE
Artifact / Diff / Test Review
STATUS
MISSING (no dedicated UI; placeholder in /checkpoints -> MockPanel::Undo)
PROJECTION USED
None
REQUESTS USED
CreateMemoryCheckpoint, CheckpointCreated
UI SURFACE
/checkpoints route -> MockPanel::Undo panel (limited to checkpoint restore)
VALIDATION
- Evidence: Checkpoint event vocabulary exists (events.rs:56-72)
RUNTIME GAP
Requires real Agent Wall for: file-level diff rendering, hunk navigation, test-result artifact display, generated files/screenshots browser, validation summary, artifact provenance tracking, accept/reject/comment controls
SCOPE CHANGE
NONE
Documentation Review Surface
STATUS
PLACEHOLDER (no dedicated UI; documentation exists as static .md files in Docs/)
PROJECTION USED

---

## Background / Agent Task Panels (Additional from handoff)

FEATURE
Background / Agent Task Panels
STATUS
PARTIAL (implements basic process agent modes; lacks detailed process/agent subpanels, logs, artifacts, evidence/receipts display)
PROJECTION USED
AgentMode enum (Regular, Audit, Automation, Subagent, Team)
REQUESTS USED
SetMode, SubmitTask (with mode)
UI SURFACE
/mode route (cycles agent modes); transcript shows mode changes
VALIDATION
- Unit tests: AgentMode enum includes Automation/Subagent/Team (types.rs:589-591)
- Manual: /mode shows all five agent modes
- Evidence: SessionOrigin enum includes Automation/Subagent/Team (types.rs:587-591)
RUNTIME GAP
Requires real Agent Wall for: dedicated /processes, /agents, /subagents panels, process/agent status display, current task tracking, parent/child relationship visualization, logs/artifacts/evidence/receipts panels, blocked/retry state tracking
SCOPE CHANGE
NONE

---

## Cross-Cutting Runtime Truth Boundary (THE GAP)

All TUI-33 through TUI-40 features share the same fundamental runtime gap, but the nature of the gap has shifted:

CORRECTED (2026-08-29): Module 32 deterministic mock-runtime hardening has been substantially implemented, including terminal idempotency. A RealLbeWrapper read-only skeleton now exists behind LbeWrapper.

STALE MODEL (incorrect): "Module 32 must be CLOSED before RealLbeWrapper can exist."

CURRENT MODEL (correct):

```
deterministic mock runtime
        |
        v
RealLbeWrapper skeleton
        |
        +-- skeleton: IMPLEMENTED (wrapper.rs:1000-1123)
        +-- real attachment: PENDING
        +-- real snapshot stream: PENDING
        +-- real event/request mapping: PENDING
                |
                v
Agent Wall capabilities
        +-- memory
        +-- provenance
        +-- impact analysis
        +-- hypothesis/test/verify
        +-- task graph
        +-- validation strategies
        +-- documentation artifacts
```

Evidence for skeleton existence (PROVEN):
- RealLbeWrapper struct defined at wrapper.rs:1000-1123
- RealLbeWrapper::new() constructs snapshot with Disconnected state
- RealLbeWrapper::attach() returns error without wall endpoint (stubbed)
- RealLbeWrapper::poll_event() returns None (no stream yet)
- RealLbeWrapper requires connection for mutation-bearing requests (wrapper.rs:1094-1104)
- build_wrapper() selects RealLbeWrapper when LBE_RUNTIME=real (main.rs:73-77)

What becomes "real" when the gap closes:
- LbeSnapshot fields transition from mock-fabricated to wall-provided values
- LbeEvent stream transitions from mock-scheduled to wall-authoritative events
- Session identity, execution status, validation results become runtime-owned
- Evidence/receipt references become durable and verifiable
- All TUI features (TUI-33 through TUI-40) then render real runtime data instead of mock data

What remains TUI-only (presentation/navigation/editing):
- Local input buffer, transcript scrolling, panel navigation
- Shortcut display (/?), mode cycling (/mode), intro animation
- Layout rendering, responsive behavior, terminal compatibility
- Local state limited to presentation/navigation/editing per handoff rules

Next implementation step is NOT another state-machine pass. It is completing RealLbeWrapper real attachment and Agent Wall contracts.

---

## Validation Performed

- 42/42 unit tests pass (cargo test --quiet)
- Code compiles with warnings only (unused imports/dead code - not blocking)
- All handoff features (TUI-33 -> TUI-40) mapped to existing code
- Runtime gap precisely identified: RealLbeWrapper real attachment + Agent Wall capabilities
- No assumptions made beyond directly observed code evidence
- CORRECTION APPLIED (2026-08-29): Module 32 status updated from MISSING to IMPLEMENTED_PRE_INTEGRATION across STATUS.md, README.md, and status.json
- CORRECTION APPLIED (2026-08-29): RealLbeWrapper described as "absent" corrected to "skeleton exists"

## Files Affected (for future implementation)
Next implementation step is NOT another state-machine pass:
- `src/wrapper.rs`: Complete RealLbeWrapper implementation (attach, event streaming)
- `src/types.rs`: Add any missing runtime-owned projection fields
- `src/app.rs`: Ensure UI only projects, never authors canonical state
- `src/ui.rs`: No changes needed (already projection-only rendering)
- New Docs files: Per-feature documentation as work items close

---
*Documented from direct codebase inspection on 8/29/2026. All evidence levels marked as PROVEN where directly observed, HYPOTHESIS where requiring inference from existing patterns.*
Requires real Agent Wall for: file-level diff rendering, hunk navigation, test-result artifact display, generated files/screenshots browser, validation summary, artifact provenance tracking, accept/reject/comment controls
SCOPE CHANGE
NONE