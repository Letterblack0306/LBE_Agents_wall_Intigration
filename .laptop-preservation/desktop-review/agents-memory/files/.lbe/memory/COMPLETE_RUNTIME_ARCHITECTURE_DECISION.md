# Complete Runtime Architecture Decision

Status: accepted product direction. This is workspace memory, not an execution
authority or a substitute for the active implementation gate.

## LBE authority

- Providers reason; LBE owns workspace identity, policy, authorization,
  governed dispatch, receipts, evidence, recovery, and deterministic completion.
- Hooks, prompt checks, and verification subagents may advise, enrich, or
  verify. They never grant authority or replace R6C/R6E decisions.
- Credentials are referenced by ID only. Secrets remain in the host credential
  store and the outbound transport boundary; they never enter workspace config,
  SQLite events, receipts, diagnostics, or Git.
- An integration is governed only when the agent cannot reach an equivalent
  direct mutation path. Expose LBE's pre-action permission/adapter tool and
  withhold direct filesystem, shell, Git, network, MCP/plugin, subagent, and
  hosted-service mutation tools from the agent-facing tool set.

## Core execution-chain baseline

The following three layers are the existing LBE Core execution-chain baseline.
The complete runtime consumes this baseline; it does not redefine it:

1. **Pre-action control:** an agent proposes a tool call; LBE validates actor,
   intent, workspace, target, and policy, then returns `allow`, `deny`, or
   `approval_required` before any adapter executes.
2. **Action evidence:** the approved adapter performs the bounded operation,
   including transaction/rollback staging where applicable, and persists the
   decision, operation identity, receipt, and validation evidence.
3. **Post-action promotion:** temporary-workspace proof, intent/scope
   comparison, and independent repository validation decide whether a change
   may be promoted. This does not replace the first two layers.

Historical Core executor claims must be re-proven in the active installed
runtime before they are presented as current capability proof.

## Future capability areas — not a current runtime-gate sequence

1. Platform runner backends with a single fail-closed sandbox contract,
   workspace allowlists, command allowlists, network egress policy, and
   receipt-backed outcome. Backend availability must be reported explicitly.
2. Outbound DLP scans/redacts provider context, tool output, logs, and receipts
   before any remote transmission or persistence.
3. Mutation-capable subagents use isolated Git worktrees. Read-only diagnostics
   use bounded shadow directories. Both retain parent session identity, budgets,
   evidence, and receipts.
4. Lifecycle events use typed payloads and deterministic command-hook exit
   semantics: `0=allow`, `1=warn`, `2=block`. Payload mutation is constrained
   and auditable. Prompt/agent hook results are non-authoritative inputs.
5. Repository context uses incremental structural indexing, SQLite cache,
   scope-aware rendering, and bounded ranked retrieval. Exact search remains
   available; semantic retrieval stays local and opt-in.
6. MCP, skills, ACP-facing clients, and future protocol adapters register only
   behind the same LBE dispatch, policy, evidence, receipt, and completion path.

These areas remain useful future directions. They do not redefine Core and are
not automatically accepted as a current complete-runtime implementation
sequence. The active gate decides when, or whether, any becomes an authorized
slice.

## Workspace ingestion

- Load root `AGENTS.md` and project instructions as bounded, provenance-tagged
  context.
- Discover skills from workspace `.agents/skills/` and user skill locations
  only through explicit registration and capability manifests.
- Do not treat instruction files or skills as policy authority; LBE validates
  each requested action at dispatch time.

## AI guidance and operator use

The Google Agents CLI documentation is the reference for LBE's **agent-facing
operational knowledge**, not a requirement that an end user learn or manually
operate an agent-development command suite.

LBE has two documented consumption paths:

1. **Provider/agent guidance path.** At session bootstrap, LBE supplies bounded,
   provenance-tagged operating guidance: its authority boundaries, current
   workspace and policy, available governed tools, receipt/evidence
   requirements, and the conditions under which each tool may be requested.
   The reasoning provider uses this knowledge to choose an appropriate LBE tool
   request; it cannot turn the guidance into authority or bypass dispatch.
2. **User/operator CLI path.** The user opens LBE as a normal local CLI/TUI,
   chooses settings or a runtime mode where needed, enters an objective, and
   sees real runtime events, evidence, and only the required high-risk
   authorization surface. The user is not expected to run the internal agent
   lifecycle commands as part of ordinary work.

The settings/mode documentation must present these two paths explicitly. It
must distinguish a selected LBE runtime mode from model-generated intent, and
must keep the provider's operational guidance visible as descriptive context,
not an editable policy or approval mechanism.
