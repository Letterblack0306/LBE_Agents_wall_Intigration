# ADR-001: Remove the MCP Execution Surface

**Status:** Accepted — 2026-06-19

## Decision

LBE no longer ships an MCP server, an MCP adapter, an `lbe-mcp` command, or
MCP configuration examples. The supported integration boundary is the local
SDK/CLI contract and an application-controlled adapter.

## Why MCP was removed

MCP makes LBE available as one tool in a host's tool list. It does not prevent
that host or agent from selecting a separate native filesystem, shell, browser,
network, or process tool. Consequently, an MCP integration is advisory rather
than a mandatory execution boundary and cannot support the product claim that
every action is governed.

This decision does not reject local integrations. It requires a stronger one:
the host adapter must be the only component that holds authority to execute the
underlying action, and it must submit each proposed action to LBE before acting.

## Consequences

- The LBE public surface remains local: `execute(input)` and `lbe` CLI.
- Framework examples remain examples; they are not enforcement boundaries.
- A future mandatory-tunnel deployment requires a restricted host or worker
  plus an LBE-controlled local executor. A protocol bridge alone is insufficient.
- The internal WASM export named `lbe_execute` remains. It is the compiled
  runtime entrypoint, not an MCP tool.

## Reintroduction rule

MCP must not be restored by default, as a compatibility feature, or through an
automated dependency update. It may be reintroduced only after the user has
given explicit informed consent that includes:

1. MCP is optional and does not enforce all agent actions by itself.
2. The specific host's native execution tools are disabled or separately
   restricted.
3. The intended security claim and fallback behavior are documented.
4. The change is approved in a new ADR that references this decision.
