# Complete LBE TUI Implementation Gate

Status: **SUPERSEDED — RETAINED HISTORICAL TUI ACCEPTANCE RECORD**

This gate is preserved as historical evidence. It is not the active authorization. The machine
selected active plan is `docs/acceptance/COMPLETE_LBE_AGENT_RUNTIME_GATE.md`, with phase
`COMPLETE_LBE_AGENT_RUNTIME_IMPLEMENTATION` and slice `DOCTRINE_TO_PROVIDER_CONTEXT_BRIDGE`.
The terminal-workspace foundation and TUI records remain non-active until a future machine-gate
change explicitly selects them.

phase: `COMPLETE_TUI_IMPLEMENTATION`

active slice: `TUI_INSTALLED_INTERACTIVE_ACCEPTANCE`

required evidence level: `SOURCE_PLUS_INSTALLED_INTERACTIVE_RUNTIME_PROOF`

## Authorization and precedence

The user explicitly authorized building the complete LBE TUI and required GitHub to be the implementation authority. LoopTool/local execution is evidence-only and must not patch source.

This gate pauses, but does not mark PASS or erase, the earlier `PUBLICATION_VERSION_PREPARATION` gate. Publication, tagging, release creation, and package publication remain forbidden during this gate.

## Product contract

The TUI is one keyboard-first control and projection client over the existing LBE runtime. It must not become a second owner of sessions, provider state, authorization, execution, receipts, evidence, recovery, or completion.

The complete installed workflow must support:

1. create, open, resume, navigate, and inspect persisted sessions;
2. inspect, select, configure, and health-check provider/model profiles through existing owners;
3. submit objectives and steer, interrupt, or cancel active turns;
4. render structured model, tool-call, authorization, ToolReceipt, evidence, validation, failure, and completion events;
5. render bounded diff and evidence detail views from persisted runtime truth;
6. inspect registered capabilities and integrations without executing them directly;
7. expose truthful unavailable, loading, empty, denied, failed, cancelled, and completed states;
8. preserve one execution path through existing governed runtime owners.

Standing interaction/reference baseline: `https://github.com/google-antigravity/antigravity-cli`. The official public Google Antigravity CLI repository is a product/interaction reference only. Verified reference patterns that are compatible with this contract include a keyboard-first terminal client, persistent history, one shared core agent engine across interfaces, shared settings/permissions, and terminal chrome that projects current agent state. LBE does not infer or copy Antigravity's internal runtime, authorization, dispatch, event-store, or persistence implementation.

## Existing owners to reuse

- `SessionMemoryRuntimeBridge`, `SessionOperationalHistory`, and existing session/recovery stores;
- provider registry, user state, credential-reference, provider health, and provider-turn runtime;
- R6C authorization and R6E `GovernedToolOrchestrator` / `ToolReceipt`;
- persisted operational events and deterministic completion/validation owners;
- `terminal_projection.py` and `textual_tui.py` as projection/client owners.

## Required implementation sequence

1. Typed, persisted TUI view models for session, provider, capability, tool, authorization, receipt, evidence, diff, validation, failure, and completion states.
2. One objective/activity workspace with spatially stable focus and progressive disclosure.
3. Real command routing for status, provider, evidence, help, interrupt, and cancel; commands must not alias unrelated help output.
4. Session/history navigation and create/resume flow.
5. Provider/model selection, configuration, and health surfaces using existing provider owners.
6. Structured activity, receipt, authorization, evidence, validation, and diff detail views.
7. Capability/integration inspection and truthful unsupported-state handling.
8. Installed interactive acceptance with a local provider and governed tool turn.
9. Compatibility and regression acceptance.

## Interaction and visual requirements

- keyboard-first interaction with visible focus and discoverable commands;
- consistent layout at 80x24 and graceful resize behavior;
- progressive disclosure rather than raw JSON as the primary view;
- monochrome usable, 16-color readable, and truecolor enhanced;
- semantic colors with no color-only meaning;
- respect `NO_COLOR`;
- avoid unsupported Unicode glyphs and provide ASCII-safe borders/symbols;
- no flicker, blocking provider call on the UI thread, or uncontrolled log scrolling;
- help must expose universal navigation, view actions, and contextual actions;
- terminal title/status chrome may project existing persisted session/runtime/provider facts, but must not invent VCS, context-window, authorization, or execution state that LBE does not own;
- LBE reference HTML surfaces must carry the canonical LBE mark as inline SVG, without an external raster-logo dependency.

## Completed slices

### TUI_PROJECTION_CONTRACT_AND_VIEW_MODELS — PASS

Checkpoint evidence:

- GitHub revision: `72aa6834871cb17ee68ee74367749440c9c0e0cc`;
- focused projection tests: `9 passed`;
- `git diff --check`: PASS;
- installed interactive acceptance remained pending at this checkpoint.

### TUI_OBJECTIVE_ACTIVITY_WORKSPACE — PASS

Checkpoint evidence:

- GitHub revision: `15c41d9f781fd197ea8cc51779d285baf0068ded`;
- focused TUI/projection tests: `14 passed`;
- 80x24, alternate size, focus, progressive details, persisted states, and `NO_COLOR` source behavior covered;
- `git diff --check`: PASS;
- installed interactive acceptance remained pending at this checkpoint.

### TUI_COMMAND_ROUTING — PASS

Checkpoint evidence:

- GitHub revision: `00265ab3d6590a5dad716905507e05077ee9af1d`;
- focused TUI/projection tests: `15 passed`;
- all six commands exercised through the Textual input surface;
- `git diff --check`: PASS;
- installed interactive command acceptance remained pending at this checkpoint.

### TUI_SESSION_NAVIGATION_AND_RESUME — PASS

Checkpoint evidence:

- GitHub revision: `7bf75acc6d50915bebf5564698dda22dedd9d0c7`;
- focused store/session/TUI/projection tests: `18 passed`;
- create, list, resume, projection switch, and active-turn boundary covered;
- `git diff --check`: PASS;
- installed interactive session acceptance remained pending at this checkpoint.

### TUI_PROVIDER_MODEL_CONFIGURATION_AND_HEALTH — PASS

Checkpoint evidence:

- GitHub revision: `243a363bc092d9947d17ffb77167678c02d324de`;
- focused provider/session/TUI regression tests: `39 passed`;
- selection delegates to the persisted session owner and health delegates to the registered provider health owner;
- explicit provider configuration and credential values are neither rendered nor persisted by the TUI;
- `git diff --check`: PASS;
- installed interactive provider acceptance remained pending at this checkpoint.

### TUI_STRUCTURED_ACTIVITY_AND_DETAIL_VIEWS — PASS

Checkpoint evidence:

- GitHub revision: `ee8251a083e9614f92bb672c4604df8861ec7e94`;
- focused tests: `24 passed`;
- validation command hash: `7DE82A4260F536B19EECF22AB1460038D38793D6551B056060B9FC1BA0F8FB2F`;
- `git diff --check`: PASS.

### TUI_CAPABILITY_INTEGRATION_INSPECTION — PASS

Checkpoint evidence:

- GitHub revision: `775e595270ae391573aca9bed9b63b5d6a0f3e9e`;
- focused tests: `38 passed`;
- validation command hash: `59AA029B59C7D10EE98C3F8891C7FFEE659A5D07841DC59E7706083E7A705EFB`;
- `git diff --check`: PASS.

## Active slice

### TUI_INSTALLED_INTERACTIVE_ACCEPTANCE — OPEN

Question:

> From the exact installed package, can the LBE TUI operate as a truthful keyboard-first projection over the same persisted runtime while exercising real local-provider, session, command, governed-tool, interrupt/cancel, and completion behavior without creating a second authority path?

Current source alignment:

- terminal title now projects only LBE-owned workspace, mode, session, and runtime state;
- status chrome now projects LBE-owned runtime/provider/session facts and adapts its command hints to terminal width;
- terminal chrome refreshes after session/provider/control state changes and on terminal resize;
- the TUI still delegates session, provider, control, tool, evidence, authorization, and completion ownership to existing runtime owners;
- focused tests were updated for terminal-title state transitions, adaptive 80-column status behavior, wide status controls, session switching, and ASCII/`NO_COLOR` compatibility;
- these source changes are **not installed-interactive proof** until executed against the installed artifact.

Required proof:

- exact GitHub revision and clean installed artifact identified;
- real Windows Terminal launch and render captured;
- `/status`, `/provider`, `/evidence`, `/help`, `/interrupt`, and `/cancel` exercise distinct truthful behavior;
- session create/resume/navigation proven;
- provider select/check proven without credential leakage;
- terminal title/status state tracks persisted session/runtime state and remains readable across resize/80x24;
- one governed local-provider tool turn renders proposal, decision, receipt, evidence, diff where applicable, continuation, and deterministic completion;
- interrupt and cancel proven during an active turn;
- monochrome, 16-color, truecolor, and `NO_COLOR` behavior checked;
- no unexplained runtime errors or false completion;
- full focused and relevant regression suites pass.

## Final acceptance

The phase may advance only when `TUI_INSTALLED_INTERACTIVE_ACCEPTANCE` is PASS and the required installed evidence above is recorded. Source changes, static screenshots, mocks, or unit tests alone are insufficient.

## Forbidden

- patching source through LoopTool;
- creating a second runtime, event store, session owner, provider owner, dispatcher, authorization path, receipt type, or completion owner;
- TUI-direct filesystem, shell, Git, network, MCP, plugin, or provider mutations;
- treating static source, labels, screenshots, mocks, or unit tests alone as installed runtime proof;
- publication, tagging, release creation, or package publication;
- unrelated architecture or capability expansion.
