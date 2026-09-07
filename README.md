# LBE — Lockstep Boundary Engine terminal CLI

## PRODUCT IDENTITY

```
LBE CLI      =  LBE-NATIVE user-facing terminal (NOT Cline)
Rust TUI     =  Reference/integration client
LBE Runtime  =  C:\Agents-Memory-Tool-v6-integration (sole authority)
BirdEye MCP  =  Evidence, memory, and skills integration
```

**The LBE CLI is a completely different interface from Cline.** It uses a unique
Green/Amber color scheme, governance-focused layout, and LBE-specific commands.
BirdEye MCP provides evidence, memory recall, and skills integration.

## Quick Start

### LBE CLI (Recommended)

```powershell
lbe                    # Open LBE in current directory
lbe C:\project        # Open LBE in specified directory
lbe /evidence         # View evidence browser
lbe /memory           # Recall session memory
lbe /skills           # View skills registry
lbe /audit            # View audit trail
lbe /governance        # View governance status
```

The `lbe` command opens the **LBE-NATIVE CLI** with:
- **Unique UI** — NOT Cline's interface
- **Green/Amber** color scheme (not blue/purple)
- **Governance-focused** — Evidence, receipts, authorization always visible
- **BirdEye MCP** integration — Memory recall, skills registry, workspace identity
- **Slash commands** — /evidence, /memory, /skills, /audit, /governance, /mode

### Install LBE Command

If `lbe` is not in PATH:
```powershell
.\install-lbe-path.ps1    # Add to user PATH
.\install-lbe-path.ps1 -SystemWide   # Add to system PATH (requires admin)
```

To uninstall:
```powershell
.\install-lbe-path.ps1 -Remove
```

## Runtime requirement

Rust 1.88 or newer. This workspace was validated with Rust 1.96.0 on Windows.

## Rust Reference Client Commands

```text
cargo run --bin lbe      # Run Rust reference client
cargo test               # Run tests
cargo fmt --check        # Format check
cargo check              # Type check
```

## LBE-NATIVE CLI Commands

```
/evidence     - Browse evidence chain through LBE governance
/memory       - Recall session memory via BirdEye
/skills       - View skills registry
/audit        - View LBE audit trail
/governance   - View authorization, evidence, receipts status
/mode [x]     - Set agent mode (build|plan|audit)
/clear        - Clear conversation
/quit         - Exit LBE CLI
```

## BirdEye MCP Integration

The LBE CLI integrates with BirdEye MCP at `C:\MCP Local\Letterblack_BirdEye`:
- **Workspace Identity** — Workspace root, Git branch, commit hash
- **Memory Recall** — Session memory search and retrieval
- **Skills Registry** — Governed skill invocation status

All BirdEye operations pass through LBE authorization and generate receipts.
# LBE — Lockstep Boundary Engine terminal CLI

## PRODUCT IDENTITY

```
LBE CLI/TUI  =  Cline-based user-facing product surface
Rust TUI     =  Reference/integration client
LBE Runtime  =  C:\Agents-Memory-Tool-v6-integration (sole authority)
```

Cline provides the embedded provider/reasoning engine. LBE runtime owns governance,
evidence, receipts, and completion truth. The Rust TUI renders projections supplied
by the authoritative LBE Python runtime and never owns provider credentials or runtime
authority.

## Quick Start

### LBE CLI (Recommended)

```powershell
lbe                    # Open LBE in current directory
lbe C:\project        # Open LBE in specified directory
```

The `lbe` command opens the **LBE-branded CLI** with:
- LBE header/branding displayed
- Cline embedded underneath for AI provider/reasoning
- Automatic session creation with LBE runtime
- Full LBE governance, evidence, and receipts

### Install LBE Command

If `lbe` is not in PATH:
```powershell
.\install-lbe-path.ps1    # Add to user PATH
.\install-lbe-path.ps1 -SystemWide   # Add to system PATH (requires admin)
```

To uninstall:
```powershell
.\install-lbe-path.ps1 -Remove
```

## Runtime requirement

Rust 1.88 or newer. This workspace was validated with Rust 1.96.0 on Windows.

## Rust Reference Client Commands

```text
cargo run --bin lbe      # Run Rust reference client
cargo test               # Run tests
cargo fmt --check        # Format check
cargo check              # Type check
```
# LBE — Lockstep Boundary Engine terminal CLI

## PRODUCT IDENTITY

```
LBE CLI/TUI  =  Cline-based user-facing product surface
Rust TUI     =  Reference/integration client
LBE Runtime  =  C:\Agents-Memory-Tool-v6-integration (sole authority)
```

Cline provides the embedded provider/reasoning engine. LBE runtime owns governance,
evidence, receipts, and completion truth. The Rust TUI renders projections supplied
by the authoritative LBE Python runtime and never owns provider credentials or runtime
authority.

## Runtime requirement

Rust 1.88 or newer. This workspace was validated with Rust 1.96.0 on Windows.

## Commands

```text
cargo run --bin lbe
cargo test
cargo fmt --check
cargo check
```

The real LBE runtime is the default. The active interface routes actions through the
`LbeWrapper` trait and renders typed `LbeSnapshot` / `LbeEvent` values. The fail-closed
`RealLbeWrapper` path requires explicit Agent Wall configuration and does not fabricate
state. Set `LBE_RUNTIME=mock` only for deterministic local contract previews.

## Conversational interaction and diagnostic surfaces

Chat is the primary user-facing interface. The agent interprets the conversation, selects
capabilities, and submits requests through `LbeWrapper`; LBE performs access control,
policy evaluation, execution, validation, evidence, receipts, and completion.

The TUI has three conversational modes:

- **Runtime** — broad workspace-aware agent assistance using governed capabilities.
- **Plan** — broad workspace investigation and proposal; no execution.
- **Audit** — focused, read-only investigation of workspace rules, guards, and evidence.

Slash commands (`/help`, `/mode`, `/audit`, `/clear`, `/new`, `/quit`, `/mcp`, `/status`)
are diagnostic scaffolding, not required user operations.

## LBE provider integration policy

- Cline documentation is reference only.
- Cline authentication is not used.
- `api.cline.bot` is not used.
- Providers connect through LBE-owned provider gateway.
- Provider credentials remain provider-native; never rendered in snapshots.
- OpenCode and Cline are external behavior references only; any reuse must pass
  through `LbeWrapper` and the authoritative LBE runtime.
