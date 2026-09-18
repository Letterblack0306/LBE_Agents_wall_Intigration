# LBE TUI / Agent Wall Integration Alignment

Status: **ACTIVE — LBE-OWNED RUST TUI SELECTED**

Updated: 2026-09-18

## Repository ownership

```text
C:\LBE-TUI-Lab
  = canonical visible LBE terminal client workspace
    - Rust/Ratatui UI in src/
    - LbeWrapper / RealLbeWrapper client boundary
    - LBE launch/client integration

C:\Agents-Memory-Tool-v6-integration
  = LBE runtime authority
    - sessions/workspace identity
    - provider/model policy truth
    - authorization / governed execution
    - ToolReceipt / evidence
    - persistence / recovery
    - validation / completion
    - headless governed Cline worker/provider mechanics
```

## Product composition

```text
USER
  -> lbe
  -> LBE-owned Rust/Ratatui terminal UI
  -> RealLbeWrapper / LBE product-entry boundary
  -> headless Cline reasoning/provider/model/continuation mechanics
  -> LBE governed consequences and truth
```

## Technology roles

| Component | Current role |
|---|---|
| Rust/Ratatui | **Canonical visible LBE terminal implementation** |
| HTML/React LBE prototypes | Visual/interaction contract and reuse source; not runtime proof |
| Cline AgentRuntime / @cline/agents | Headless reasoning/provider/model/tool-proposal/continuation mechanics |
| Cline CLI/OpenTUI product UI | Reference/reuse source only; not required as visible LBE product |
| LBE runtime | Sole authority |

## Authority invariant

> The agent owns cognition. LBE owns capabilities and consequences. The Rust client owns presentation, not authority.

The Rust UI may request and project state, but must never become a second owner for sessions, authorization, execution, receipts/evidence, persistence, or completion truth.
