![LetterBlack Sentinel](assets/banner.png)

# LBE Core — The Execution Boundary for AI Agents

> **AI agents can think and propose. LBE governs what is allowed to execute.**

LBE Core sits between an AI agent and the tools that can change a real workspace.

```text
AI Agent
   │ proposes an action
   ▼
LBE Core
   │ validates identity, scope, policy, capability and proof
   ├── ALLOW ──► approved adapter executes
   ├── DENY  ──► action stops
   └── INCOMPLETE ──► completion is rejected
                    │
                    ▼
           Local audit and proof
```

LBE is not the model, planner, IDE or chat interface. It is the local control layer on the execution path.

> [!IMPORTANT]
> Read [What We Missed](WHAT_WE_MISSED.md) before changing governance, execution, adapters, packaging, release or agent behavior.

## The three guarantees

### Before execution

A proposed action is checked against the active workspace, task scope, policy and available capability before an approved adapter may run it.

### Deterministic decisions

The controller returns a structured result: allow, deny, approval required, incomplete proof or error. Agents do not decide their own authority.

### Verifiable evidence

Governed decisions and results produce local audit and proof records so a host can accept, reject or investigate the work.

## Where LBE lives

```text
User instruction
      ↓
AI agent proposes
      ↓
LBE controller decides
      ↓
Private adapter executes
      ↓
Filesystem / shell / host tool
      ↓
Audit, rollback and completion proof
```

The product boundary is strict:

- **Agent:** reasons and proposes.
- **Controller:** validates and decides.
- **Adapter:** executes only an approved, bound request.
- **Host:** accepts completion only when proof is sufficient.

## Current release

`@letterblack/lbe-core@1.3.42` · Node.js `>= 20.9.0` · local-first · no hosted control plane required

## Install

Install once on the computer:

```bash
npm install -g @letterblack/lbe-core
```

Then enter a workspace and start LBE:

```bash
cd your-project
lbe
```

For automation:

```bash
lbe init
lbe status
lbe proof
```

No-install test:

```bash
npx --package @letterblack/lbe-core lbe
```

Do not use bare `npx lbe`; it can resolve to an unrelated package.

## What LBE governs

- workspace-scoped file actions
- permitted shell actions
- task scope and target checks
- local decision and execution evidence
- completion proof for routed work

## Honest limit

LBE governs only actions routed through its execution boundary. A tool that receives independent filesystem or shell access can bypass LBE and is outside its control.

The current engineering priority is therefore not more UI, cloud or marketing work. It is proving a mandatory governed path where an agent cannot mutate the workspace except through an LBE-authorized, payload-bound and auditable execution.

## One sentence

**LBE Core is the local execution boundary that turns an AI agent’s proposed action into an allowed, denied or provably incomplete result before real tools act.**
