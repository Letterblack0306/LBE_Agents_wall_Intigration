# LBE CLI Unique Frontend Design

## Status
`DESIGN_PHASE — UNIQUE_LBE_CLI_NOT_CLINE`

## Problem Statement

**Current State**: The `lbe` command directly launches Cline (`cline --cwd ... --tui`), causing users to see Cline's native UI.

**Required Change**: The LBE CLI must have its **own unique visual identity** that is **completely different** from Cline's interface.

## Design Principles

### 1. NOT Cline UI
- No sidebar with "current file", "problems", "terminal"
- No VS Code-style file explorer
- No Cline's blue/purple color scheme
- No command palette styled like Cline's

### 2. LBE-NATIVE Design Language

**Philosophy**: LBE = Lockstep Boundary Engine / Accountable AI Agent

The UI should convey:
- **Precision** — Clean lines, deliberate spacing
- **Authority** — Governance, evidence, receipts
- **Accountability** — Every action tracked and provable

### 3. Proposed Visual Identity

#### Color Palette (LBE-NATIVE — NOT Cline's blue/purple)
```
Primary Background:  #0A0B0D (near black, different from Cline)
Accent Primary:      #00FF88 (electric green — "boundary active")
Accent Secondary:    #FFB800 (amber — "attention/governance")
Text Primary:        #E8EBEF (light gray)
Text Muted:          #8B929C (muted gray)
Danger:              #D94A4A (red)
Success:             #4FD18B (green)
Border:              #2B3038 (subtle lines)
```

#### Layout (Completely Different from Cline)
```
┌─────────────────────────────────────────────────────────────┐
│ ▓▓ LBE │ SESSION:abc123 │ RUNTIME:LIVE │ MODE:BUILD       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ EVIDENCE CHAIN                                       │   │
│  │ • tui.birdeye.query:abc:001 → RECEIPT#R-001        │   │
│  │ • tui.birdeye.query:abc:002 → RECEIPT#R-002        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ CONVERSATION                                         │   │
│  │ > What files need review?                           │   │
│  │ [Agent] Found 3 files with changes...               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ > _                                                        │
│ ────────────────────────────────────────────────────────── │
│ [F1]Evidence [F2]Memory [F3]Skills [F4]Sessions [F5]Audit │
└─────────────────────────────────────────────────────────────┘
```

#### Key Differentiators from Cline
| Aspect | Cline | LBE-NATIVE |
|--------|-------|------------|
| Header | Minimal | Full governance status bar |
| File Browser | VS Code sidebar | Evidence-focused panel |
| Colors | Blue/Purple | Green/Amber/Black |
| Focus | Code editing | Accountability |
| Sidebar | File tree | Receipt chain |
| Status | Tool count | Evidence references |

## MCP/Skills/Memory Integration Design

### BirdEye MCP Integration
- **Authority**: `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`
- **Usage**: Query workspace knowledge, memory recall, skills
- **Display**: Show evidence references, not raw data

### Memory Recall Panel
```
┌────────────────────────────────────────┐
│ MEMORY RECALL                          │
├────────────────────────────────────────┤
│ Query: "recent decisions"              │
├────────────────────────────────────────┤
│ [RECENT] 2026-09-07 14:23             │
│ Session: abc123 | Decision: X         │
│ Evidence: #E-001 | Receipt: #R-002    │
├────────────────────────────────────────┤
│ [RECENT] 2026-09-07 13:15             │
│ Session: def456 | Decision: Y         │
│ Evidence: #E-002 | Receipt: #R-003   │
└────────────────────────────────────────┘
```

### Skills Integration Panel
```
┌────────────────────────────────────────┐
│ LBE SKILLS REGISTRY                   │
├────────────────────────────────────────┤
│ [skill-gallery-router]   GOVERNED     │
│ [devils-audit-master]    AVAILABLE    │
│ [devils-governance]      AVAILABLE    │
├────────────────────────────────────────┤
│ Invoking skills requires authorization │
│ All skill executions are receipted     │
└────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Create LBE-NATIVE CLI (Not Cline)
1. Create `lbe-cli.ps1` — New LBE-branded terminal interface
2. Build custom UI from scratch (NOT Cline's interface)
3. Use LBE color palette (green/amber/black)
4. Show governance status prominently

### Phase 2: Integrate BirdEye MCP
1. Query skills through `birdeye__skills`
2. Query memory through `birdeye__memory_recall`
3. Display results with evidence/receipt references

### Phase 3: Replace `lbe` Command
1. Update `lbe.bat`/`lbe.ps1` to launch new CLI
2. Remove direct Cline invocation
3. Use Rust TUI or new PowerShell-based LBE interface

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lbe-cli.ps1` | CREATE | New LBE-native terminal interface |
| `lbe.bat` | MODIFY | Launch new CLI instead of Cline |
| `lbe.ps1` | MODIFY | Launch new CLI instead of Cline |
| `Docs/LBE_CLI_DESIGN.md` | CREATE | This design document |

## Validation

- `lbe` command shows LBE-native UI (NOT Cline)
- BirdEye skills accessible via F3 key
- Memory recall shows evidence references
- Governance status always visible
- Color scheme is green/amber/black (not blue/purple)

---
*Design completed 2026-09-07*
*Evidence: Cline runs directly via `cline --cwd ... --tui`; must be replaced with LBE-native interface*