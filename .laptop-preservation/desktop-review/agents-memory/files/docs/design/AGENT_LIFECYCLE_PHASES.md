# LBE Agent Lifecycle — Phases, Owners, Surfaces, and Reuse

Status: **Live design artifact** — the single product lifecycle that everything hangs off of.

> This is the one thread: a task moves through **boot → understand → plan → execute → validate →
> persist → continue**. Every capability, every IDE surface, and every implementation decision maps
> to a phase and an owner. Nothing reinvents the lifecycle; everything exposes or serves it.

## Central invariant (unchanged)

> **LBE governs an agent's capabilities and consequences; it does not prescribe the agent's
> reasoning procedure.**

Three owner classes:

- **Agent (reasoning)** — plans, selects capabilities, interprets results, communicates.
- **LBE (authority)** — workspace/session identity, authorization, governed execution, receipts,
  deterministic validation/completion, persistence.
- **Knowledge & workspace layer** — retrieval and inspection that supply evidence, never truth.

## 1. The single lifecycle

```text
boot
 -> understand
 -> plan
 -> execute
 -> validate
 -> persist
 -> continue  (loops back to understand/plan)
```

A new turn re-enters at `understand`. The lifecycle is the same whether the surface is a CLI, a
TUI, an IDE panel, or an API.

## 2. Responsibility per phase

| Phase | Reasoning (agent) | Authorization / Validation (LBE) | Knowledge & workspace layer |
|---|---|---|---|
| boot | - | establish workspace/session identity; load mode/policy; restore persisted state | resolve workspace root, project type, config |
| understand | interpret the task; form hypotheses | project available capabilities; current truth outranks memory | retrieve ranked evidence; inspect current files |
| plan | choose capabilities; build the plan | enforce the capability/policy boundary (what is allowed) | supply additional evidence on request |
| execute | - | R6C authorization; R6E governed dispatch; ToolReceipt | receipts captured as evidence |
| validate | explain the outcome | deterministic validation and completion truth | provide evidence references for the verdict |
| persist | - | persist session/turn/item/evidence/checkpoint | - |
| continue | reason over receipts; revise the plan (loop) | receipt-backed continuation; agent owns no execution authority | fetch new evidence as needed |

## 3. IDE surfaces expose phases, not reinvent them

Each screen or panel maps to **one phase and one owner**. The IDE is a projection layer; it never
becomes a duplicate authority owner.

| Screen / panel | Phase(s) | Owner |
|---|---|---|
| Conversation / Composer | understand, plan, continue | reasoning agent |
| Plan / Capability | plan | reasoning agent |
| Evidence / Context | understand | knowledge & workspace layer |
| Execution / Activity / Receipt | execute | LBE |
| Validation / Results | validate | LBE validation |
| History / Checkpoints / Resume | persist, continue | LBE persistence |

## 4. Reuse / Wrap / Own per phase (implementation guide)

Three decisions per phase, so you adopt what exists and only build what must be owned:

- **Reuse** — consume an existing, mature implementation as-is (mechanics only, never authority).
- **Wrap** — adopt an existing implementation behind an LBE-owned boundary/interface; LBE retains
  authority.
- **Own** — keep LBE-owned; never delegate authority (matches REJECT for duplicate authority in
  `docs/research/CLINE_CORE_REUSE_BOUNDARY_MATRIX.md`; Wrap ≈ ADAPT, Reuse ≈ REUSE).

| Phase | Reuse | Wrap | Own (LBE authority) |
|---|---|---|---|
| boot | provider config parsing; host/platform detection | Cline workspace/session init behind LBE identity | workspace/session identity; mode/policy; persisted state authority |
| understand | knowledge-index search; workspace tree/read/hash | Cline retrieval/inspection tools behind the LBE evidence boundary | retrieval authority; current-truth evidence; capability projection |
| plan | guard-catalog metadata | Cline AgentRuntime reasoning/planning loop behind LBE capability selection | capability selection is agent-owned; LBE does not prescribe the plan |
| execute | provider transport/gateway stream mechanics | Cline tool surface behind the LBE R6E dispatcher; deny native mutating tools | R6C authorization; R6E dispatch; ToolReceipt |
| validate | guard implementations (deterministic checks) | - | deterministic validation and completion truth |
| persist | - | provider history/narrative as non-authoritative reference | session/turn/item/evidence/checkpoint persistence |
| continue | provider stream event normalization | Cline continuation loop behind the LBE receipt boundary | receipt-backed continuation authority |

## Why this matters

- **Do not rebuild** what you should adopt: provider transports, the reasoning loop, tool surfaces,
  guard mechanics already exist and are mature.
- **Never let reuse become authority**: reuse/wrap supply mechanics only. Authorization,
  validation, persistence, receipts, and completion stay LBE-owned.
- The lifecycle gives every contributor a single operational story, so no screen, capability, or
  document reinvents the flow.

## Cross-references

- `docs/LBE_AGENT_LIFECYCLE.md` — the operational turn flow (this document's phases are the
  product-level frame for that flow).
- `docs/design/AGENT_AGENCY_LBE_AUTHORITY_SEPARATION.md` — the accepted ownership boundary.
- `docs/research/CLINE_CORE_REUSE_BOUNDARY_MATRIX.md` — the reuse classification (REUSE/ADAPT/
  REJECT) this guide maps onto.
- `docs/IMPLEMENTATION_PLAN.md` — section 1 (product goal) and section 15 (architecture
  correction).
- `.lbe/governance/implementation-gates.json` — authoritative active-slice authorization.