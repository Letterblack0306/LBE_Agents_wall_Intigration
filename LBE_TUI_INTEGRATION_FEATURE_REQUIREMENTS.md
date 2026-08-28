# LBE Terminal CLI/TUI — Integration and Feature Requirements

**Document status:** Product / integration specification  
**Target:** Separate `LBE-TUI-Lab` terminal client, later integrated with canonical LBE runtime  
**UI branding:** LetterBlack / LBE only  
**Reference basis:** Cline public documentation is used only to identify useful terminal-agent interaction patterns and integration surfaces. Cline branding, wording, product identity, and authority model are **not** part of the LBE product surface.

---

## 1. Objective

Build a native terminal CLI/TUI for LBE that supports conversational agent work, planning, governed execution, approvals, model/provider configuration, workspace context, tool visibility, evidence, receipts, and validation while preserving one hard boundary:

> **The TUI displays and requests. LBE runtime authorizes, executes, validates, persists, and proves.**

The TUI must never independently claim that an action is authorized, executed, completed, persisted, or validated.

---

## 2. Product boundary

### TUI owns

- terminal rendering;
- navigation and keyboard input;
- conversation/activity presentation;
- command composer;
- mode selection;
- model/provider selection UI;
- approval/rejection UI;
- tool-call presentation;
- streaming output presentation;
- evidence/receipt presentation;
- session navigation;
- contextual help;
- terminal capability handling;
- status-line projection.

### LBE runtime owns

- workspace identity;
- task scope;
- policy;
- capability;
- approval requirements;
- execution authority;
- deterministic guard results;
- validation;
- audit;
- receipts;
- persistence;
- completion proof.

This follows the existing LBE architecture and governance model: deterministic checks establish guard truth, LBE Core owns authorization, and no success claim is permitted without matching evidence and validation.

---

## 3. Required execution modes

The bottom status area exposes three user-facing modes:

### `Lbe Audit`

Purpose:

- inspect the current workspace;
- retrieve relevant evidence;
- select registered guards;
- execute deterministic inspection;
- run bounded validation;
- return `PASS`, `FAIL`, `INSUFFICIENT_EVIDENCE`, or `NOT_APPLICABLE`.

Rules:

- read-only by default;
- no autonomous repair;
- no write merely because a problem was detected;
- current workspace facts outrank historical/indexed material.

### `Agent regular`

Purpose:

- normal agent interaction;
- conversational coding/workflow assistance;
- tool requests;
- governed file/command operations;
- approvals;
- streaming execution;
- evidence/receipt display.

Rules:

- all executable actions pass through LBE authority;
- risky writes/commands require the active approval/policy path;
- the UI never bypasses runtime authorization.

### `Plan`

Purpose:

- investigate;
- search/read;
- discuss architecture;
- propose implementation strategy;
- identify affected areas;
- ask clarifying questions.

Rules:

- no workspace mutation;
- no command execution that would alter state;
- retain conversation context when returning to `Agent regular`.

`Tab` cycles:

```text
Lbe Audit → Agent regular → Plan → Lbe Audit
```

---

## 4. Terminal interaction model

The terminal application must support:

- interactive conversational prompt;
- multi-turn session state;
- streaming assistant output;
- tool request cards/rows;
- approval/rejection prompts;
- active operation status;
- abort behavior;
- session/history navigation;
- model/provider control;
- workspace context;
- compact/clear behavior;
- keyboard-first interaction;
- resize-safe rendering.

Useful reference behavior from Cline TUI includes interactive conversation, plan review, action approval, mode toggling, slash commands, file mentions, model/context/workspace status, and headless operation. These are interaction references only; LBE must use its own terminology and authority semantics.

---

## 5. Required keyboard controls

Minimum:

| Key | LBE behavior |
|---|---|
| `Tab` | Cycle `Lbe Audit / Agent regular / Plan` |
| `Shift+Tab` | Open approval policy / auto-approval control, if enabled by LBE policy |
| `Enter` | Submit / select / confirm |
| `Esc` | Close active picker, dialog, or detail view |
| `Ctrl+C` | Abort running turn; second press may exit when safe |
| `Ctrl+D` | Exit while idle and composer is empty |
| `Ctrl+L` | Clear current rendered conversation view, without deleting durable evidence |
| `↑ / ↓` | Navigate history, lists, pickers |
| `?` | Open shortcut/help overlay |

Every mouse-enabled interaction, if mouse support is later added, must retain a keyboard equivalent.

---

## 6. Composer

The composer is the primary persistent interaction point.

Required behavior:

- multiline input;
- history recall;
- slash-command completion;
- file/context mention completion;
- paste-safe behavior;
- explicit submission;
- visible disabled/busy state when required;
- mode-aware placeholder;
- abort state while execution is running.

Examples:

```text
Plan:
> Inspect provider ownership before we change anything

Lbe Audit:
> Check whether this workspace follows the provider ownership contract

Agent regular:
> Implement the approved provider adapter
```

---

## 7. Slash-command surface

Initial LBE commands:

```text
/help
/model
/provider
/account
/mcp
/tools
/mode
/history
/session
/new
/compact
/clear
/undo
/status
/evidence
/receipts
/audit
/quit
```

### Command intent

- `/model` — select or inspect active model.
- `/provider` — select/configure provider.
- `/account` — account/authentication surface where applicable.
- `/mcp` — MCP server/tool management.
- `/tools` — inspect registered tools and approval policy.
- `/mode` — explicitly select Audit / Agent regular / Plan.
- `/history` — previous sessions/conversations.
- `/session` — current session metadata and navigation.
- `/compact` — request context compaction through runtime.
- `/undo` — checkpoint-aware restore proposal, never blind file rollback.
- `/status` — workspace/runtime/provider/health state.
- `/evidence` — current evidence package / references.
- `/receipts` — execution/validation receipts.
- `/audit` — enter LBE Audit mode.
- `/clear` — clear view, not authority records.
- `/quit` — safe exit.

---

## 8. Context integration

The TUI needs explicit context attachment.

### Required context types

- workspace file;
- directory;
- symbol/search result;
- Git diff;
- current selection;
- evidence reference;
- verified checkpoint;
- receipt;
- session;
- tool result.

Support an `@` interaction analogous to:

```text
@src/runtime/provider.ts
@docs/contracts/LBE_HOME_PROVIDER_SURFACE_CONTRACT.md
@evidence:provider-health
@receipt:run-123
```

Resolution must use exact path/workspace identity. Duplicate basenames cannot be accepted without path/hash disambiguation.

---

## 9. Model and provider integration

The TUI needs a first-class provider/model system.

### Provider surface

- list configured providers;
- provider availability/health;
- auth state;
- local/cloud classification;
- model discovery;
- current provider;
- current model;
- per-mode model selection;
- failure explanation;
- reconnect/retry action.

### Model surface

- model ID;
- provider;
- current mode binding;
- context window usage;
- reasoning/effort profile where supported;
- cost/usage information where available;
- health/availability;
- active/inactive state.

The UI must not maintain a second provider registry. It consumes canonical LBE provider ownership through the runtime adapter.

---

## 10. Tool system integration

Reference agent systems commonly expose tools for:

- shell/command execution;
- file reading;
- file editing/patching;
- codebase search;
- web retrieval;
- asking the user for information.

LBE must expose tools through its own typed tool registry.

Every visible tool needs:

```text
tool ID
description
read/write class
risk
network behavior
preconditions
approval requirement
current status
evidence produced
```

### Tool lifecycle shown in the TUI

```text
REQUESTED
    ↓
LBE POLICY CHECK
    ↓
APPROVAL REQUIRED / ALLOWED / DENIED
    ↓
EXECUTING
    ↓
RESULT
    ↓
VALIDATION
    ↓
RECEIPT
```

The reasoning agent may choose/request a tool. LBE determines whether execution is permitted.

---

## 11. Approval integration

Approval must be a runtime-backed event, not a frontend assumption.

Required UI states:

```text
approval.requested
approval.allowed
approval.denied
approval.cancelled
approval.expired
```

Approval detail should show:

- requested action;
- tool;
- target;
- exact command or write scope;
- risk;
- reason;
- affected paths;
- policy source;
- whether approval is one-time or policy-backed.

Low-risk reads may be auto-approved only when the active LBE policy permits it.

---

## 12. MCP integration

MCP support is required as an external tool/data integration surface.

Required features:

- list configured MCP servers;
- local STDIO servers;
- remote HTTP transport;
- enable/disable;
- connection health;
- restart;
- request timeout;
- discovered tool list;
- per-tool approval visibility;
- authentication/configuration state;
- safe error reporting.

Recommended TUI flow:

```text
/mcp

MCP SERVERS
● filesystem-local      STDIO      healthy      4 tools
● github                HTTP       healthy     12 tools
○ design-service        HTTP       disabled     0 tools
! local-index           STDIO      timeout      6 tools
```

Secrets must not be rendered or persisted into ordinary UI history.

---

## 13. Rules, skills, plugins, hooks and connectors

These should be supported as inspectable integrations, but they must remain subordinate to LBE authority.

### Rules

- list active workspace rules;
- show source and scope;
- show triggering conditions;
- show conflicts;
- never silently create permanent rules.

### Skills

- list installed/available skill definitions;
- show activation reason;
- show tools/capabilities used;
- distinguish skill instructions from runtime authority.

### Plugins/custom tools

- discover registered extensions;
- list tools provided;
- show risk/permissions;
- enable/disable only through governed configuration.

### Hooks

- show registered lifecycle hooks;
- phase/event;
- source;
- failure state;
- output evidence.

### Connectors

- show external service connections;
- connection status;
- capability;
- authentication state without displaying secrets.

---

## 14. Session and conversation system

Required:

- create session;
- restore session;
- rename session;
- session list;
- session timestamps;
- workspace binding;
- provider/model binding;
- mode state;
- conversation history;
- runtime events;
- checkpoints;
- receipts/evidence references.

The visual transcript must distinguish:

```text
USER
AGENT
PLAN
TOOL REQUEST
APPROVAL
EXECUTION
RESULT
VALIDATION
LBE VERDICT
SYSTEM / RUNTIME
```

---

## 15. Checkpoints and undo

Checkpoint support must not become an uncontrolled frontend rollback mechanism.

The UI should display:

- checkpoint ID;
- timestamp;
- bound workspace;
- associated intent/task;
- changed paths;
- validation status;
- protected state.

`/undo` should request a comparison/restore workflow through the runtime.

Protected checkpoints remain visible but quiet until an evidence-backed conflict or explicit superseding intent reactivates them.

---

## 16. LBE Audit integration

Audit mode should be a first-class TUI surface, not just a color change.

### Audit pipeline

```text
user problem
→ workspace resolution
→ knowledge retrieval
→ evidence package
→ guard selection
→ deterministic guard execution
→ governance review
→ validation
→ verdict
```

### Verdict presentation

Only:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
NOT_APPLICABLE
```

Each verdict should expose:

- guard ID/version;
- workspace ID;
- evidence refs;
- deterministic check result;
- validation result;
- LBE governance state;
- timestamp.

No model-generated unsupported PASS/FAIL.

---

## 17. Evidence and receipts panel

The TUI should expose evidence without overwhelming the chat.

Suggested expandable row:

```text
VALIDATION PASS
guard    provider-owner-contract@1
workspace lbe-main
evidence  4 refs
receipt   rcpt_01J...
```

Open detail:

```text
Evidence
├─ current source
├─ hashes
├─ exact paths
├─ relevant lines
├─ runtime result
└─ validation
```

Indexed/history material must retain source classification and must not be displayed as current workspace truth.

---

## 18. Workspace/Git status

Status projection should include when available:

- workspace root;
- repository;
- branch;
- HEAD;
- upstream;
- dirty/clean;
- diff counts;
- current task/session;
- runtime connectivity.

The TUI must never select a workspace based only on a directory basename.

---

## 19. Headless CLI compatibility

The interactive TUI should sit beside a non-interactive CLI.

Desired shape:

```text
lbe
lbe tui
lbe run "<task>"
lbe inspect "<problem>"
lbe status
lbe --json ...
```

Interactive TUI is for collaboration, navigation, approvals and visibility.

Headless mode is for:

- scripts;
- CI;
- automation;
- machine-readable execution;
- structured evidence/results.

Both must use the same contracts and the same LBE runtime authority.

---

## 20. Agent/subagent capability

Later-phase capability:

- spawn bounded subagents;
- show parent/child relationship;
- show assigned scope;
- show model;
- show tool permissions;
- stream summarized progress;
- collect outputs;
- cancel child;
- preserve evidence.

Subagents must not independently bypass LBE execution or authorization.

---

## 21. Required runtime event contract

The terminal UI should consume typed events similar to:

```ts
type RuntimeEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "assistant.delta"; text: string }
  | { type: "plan.updated"; text: string }
  | { type: "tool.requested"; toolCall: ToolCall }
  | { type: "approval.requested"; approval: ApprovalRequest }
  | { type: "approval.resolved"; approvalId: string; decision: string }
  | { type: "execution.started"; executionId: string }
  | { type: "execution.output"; executionId: string; text: string }
  | { type: "execution.completed"; executionId: string; receiptId: string }
  | { type: "validation.completed"; result: ValidationResult }
  | { type: "audit.verdict"; verdict: GuardResult }
  | { type: "provider.changed"; providerId: string }
  | { type: "model.changed"; modelId: string }
  | { type: "context.updated"; used: number; limit: number }
  | { type: "runtime.error"; error: RuntimeError };
```

Names may change during integration, but the separation of request, authorization, execution, result and validation must remain explicit.

---

## 22. Screen requirements

### Landing

- canonical LBE mark;
- LBE-only branding;
- active workspace or workspace selection;
- composer;
- minimal shortcuts.

### Main conversation

- transcript/activity;
- composer;
- current mode;
- model/context;
- workspace;
- streaming operation state.

### Provider/model picker

- provider;
- model;
- health;
- context capability;
- mode binding.

### MCP

- servers;
- transport;
- health;
- tools;
- enable/disable;
- errors.

### Sessions

- list/history;
- workspace;
- model;
- last activity;
- restore.

### Evidence/receipt

- source;
- authority;
- hashes;
- validation;
- receipt.

### Settings

- account/provider;
- model;
- approval policy;
- MCP;
- terminal preferences.

---

## 23. Terminal status/footer contract

The bottom region is persistent and should not copy the visual arrangement of another product.

### Required layout

```text
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
? for shortcuts                   ○ Lbe Audit/● Agent regular/○ Plan (Tab)                      Model ID· low
C:\Users\                                                                         Gemini (Context) ██ ||||||||
```

### Semantic meaning

#### Row 1 — composer top rule

```text
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
```

Separates activity/transcript from the persistent composer.

#### Row 2 — composer

```text
>
```

The active prompt cursor begins after `>`.

#### Row 3 — composer bottom rule

```text
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
```

#### Row 4 — controls / mode / model effort

Left:

```text
? for shortcuts
```

Center:

```text
○ Lbe Audit/● Agent regular/○ Plan (Tab)
```

Only one mode is active.

Right:

```text
Model ID· low
```

`low` is the current reasoning/effort profile when the provider/model exposes such a concept. If unsupported, hide the effort label rather than inventing one.

#### Row 5 — workspace / model-context

Left:

```text
C:\Users\
```

Shows the resolved current workspace, abbreviated when needed.

Right:

```text
Gemini (Context) ██ ||||||||
```

Displays:

- current model/family label;
- context consumption visualization.

The exact bar implementation should adapt to terminal width.

---

## 24. Responsive footer behavior

### Wide terminals

Show all information:

```text
? shortcuts       ● Agent regular / ○ Plan / ○ Lbe Audit (Tab)       model-id · low
C:\workspace\project                                      Gemini  42% ████░░░░░░
```

### Medium terminals

Collapse labels:

```text
? help       ● Agent  ○ Plan  ○ Audit       model-id
C:\workspace\project                            42% ████░░
```

### Narrow terminals

Preserve only critical state:

```text
● Agent   model-id   42%
C:\workspace
```

Mode, model, and workspace must not disappear simultaneously.

---

## 25. Context meter

The context meter should distinguish:

- used;
- remaining;
- warning threshold;
- critical threshold.

Example:

```text
Gemini (Context)  ███████░░░  71%
```

When compacting becomes advisable:

```text
Gemini (Context)  █████████░  91%  COMPACT ADVISED
```

The TUI may recommend compaction. Runtime/session logic owns the actual compaction operation.

---

## 26. Visual identity

Required:

- LBE black/dark base;
- canonical `[ | ]` authority mark;
- restrained red authority accent;
- neutral white/gray terminal typography;
- no visible Cline name/logo;
- no cloned Cline alignment/layout;
- no Cline blue selection language;
- no product strings such as “Open the Cline model selector.”

Use LBE terminology:

```text
Choose model
Provider
Workspace
Audit
Agent
Plan
Evidence
Receipt
Approval
Validation
LBE decides
```

---

## 27. Architecture for separate TUI lab

Recommended initial location:

```text
C:\LBE-TUI-Lab
```

Suggested structure:

```text
C:\LBE-TUI-Lab
├── src
│   ├── cli.ts
│   ├── commands
│   ├── tui
│   │   ├── app.ts
│   │   ├── screens
│   │   ├── components
│   │   ├── keymap.ts
│   │   └── theme.ts
│   ├── contracts
│   ├── state
│   └── runtime-client
├── tests
│   ├── contracts
│   ├── state
│   ├── cli
│   └── tui
├── fixtures
├── docs
└── package.json
```

During independent development:

```text
OpenTUI
   ↓
MockRuntimeClient
   ↓
fixtures
```

Later:

```text
OpenTUI
   ↓
LbeRuntimeClient
   ↓
canonical LBE owners
```

Do not duplicate provider, session, authorization, execution, evidence, persistence, validation or completion ownership inside the TUI lab.

---

## 28. Minimum first vertical slice

The first usable TUI slice should prove:

1. launch LBE terminal UI;
2. resolve/show workspace;
3. show active mode;
4. show active model/context;
5. accept user input;
6. generate a simulated/runtime proposal;
7. show approval requirement;
8. approve/reject;
9. stream operation output;
10. show result;
11. show validation;
12. show receipt/evidence;
13. return to idle composer.

Acceptance must include keyboard navigation and terminal resize behavior.

---

## 29. Later integrations

After the core vertical slice:

- provider discovery/health;
- MCP management;
- rules;
- skills;
- custom tools/plugins;
- hooks;
- connectors;
- checkpoints;
- session restore/history;
- subagents/agent teams;
- headless JSON mode;
- scheduling;
- observability;
- remote/runtime connectivity.

These should be added incrementally and only through typed runtime contracts.

---

## 30. Acceptance requirements

The TUI is not considered integrated merely because screens render.

Separate claims:

```text
UI implemented
UI behavior tested with mocks
typed contracts validated
runtime adapter connected
authorization path proven
tool path proven
approval path proven
live execution proven
validation proven
receipt/evidence proven
installed terminal artifact proven
```

For any workspace-specific `PASS` or `FAIL`, current workspace evidence and deterministic validation are required.

---

## 31. Source-derived reference notes

The Cline public documentation currently describes:

- an interactive terminal TUI for conversational work, plan review, approvals and iteration;
- Plan/Act mode switching;
- slash commands for settings/model/account/MCP/history/help and related operations;
- `@file` context mentions;
- status projection including active model, context usage, cost, workspace/branch, diff information and mode;
- built-in shell, file, patch, search, web and user-question tools;
- tool approval/auto-approval policies;
- MCP local and remote tool integrations;
- SDK support for building separate applications/integrations;
- interactive TUI versus headless automation.

LBE adopts only useful capability patterns. The resulting product remains an LBE interface governed by LBE contracts and runtime authority.

---

## 32. LBE authority statement

```text
Model selects and interprets.
Retrieval supplies historical evidence.
Workspace tools supply current facts.
Guards detect.
LBE Core authorizes.
Validation proves.
The TUI renders and requests.
```

No TUI state may override that boundary.
