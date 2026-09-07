# LBE TUI / Agent Wall Integration Alignment

Status: **ACTIVE INTEGRATION MAP — CLI/WORKSPACE ROLES RECONCILED**

Updated: 2026-09-07

## Repository Ownership

```text
C:\LBE-TUI-Lab
  = client/integration workspace containing:
    - LBE CLI launcher (uses npm-installed Cline)
    - Rust/Ratatui prototype/reference client

C:\Agents-Memory-Tool-v6-integration
  = LBE Python runtime authority: governance, sessions, providers,
    authorization, governed execution, evidence, receipts, persistence,
    validation, completion truth
```

## LBE CLI vs Rust Reference Client

The current accepted product-surface direction uses the LBE CLI (Cline engine):

```text
LBE CLI (user-facing product)
  source: npm-installed Cline (globally installed)
  launcher: C:\LBE-TUI-Lab\run-cline-lbe.ps1
  role: LBE CLI interface over Cline engine

RUST REFERENCE CLIENT (reference only)
  entrypoint: C:\LBE-TUI-Lab\src\main.rs
  binary: C:\LBE-TUI-Lab\target\release\lbe.exe
  launcher: C:\LBE-TUI-Lab\run-lbe.bat
  role: Rust/Ratatui prototype/reference client
```

## Authority Flow

```
USER → LBE CLI (Cline-powered) → LBE Runtime → Sole Authority
                                       ↓
                              Governance / Evidence / Receipts
```

## Product Definition

| Component | Role |
|-----------|------|
| **LBE CLI** | User-facing product surface |
| **Cline** | Embedded AI provider/reasoning |
| **LBE Runtime** | Sole authority |

**Core Principle:** The agent owns cognition. LBE owns capabilities and consequences.
