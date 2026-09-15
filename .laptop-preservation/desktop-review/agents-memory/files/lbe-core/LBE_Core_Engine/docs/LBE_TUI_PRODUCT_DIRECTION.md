# LBE Terminal UI Product Direction

Status: branded TUI implemented with LBE logo rendering (from SVG), ANSI-color status bar, and improved menu layout. Richer dependency-backed TUI remains future work.

This document records the next user-facing product direction for LBE/Sentinel.
It does not change package versions, publish npm, move tags, or change the
hosted API.

## Decision

Build a branded terminal UI before building a web dashboard. The first step is
a dependency-free terminal menu at the existing `lbe` entrypoint.

```text
LBE = real local engine
Terminal UI = product experience
Web dashboard = later
```

The current product is local-first, CLI-centered, execution-oriented, and
technical. A terminal-first experience gives users one install, one terminal,
one flow, and direct local action without introducing a separate dashboard
surface.

Current implemented entrypoint:

```bash
lbe
```

For one-off npm execution before local install, use the scoped package:

```bash
npx --yes --package @letterblack/lbe-core@latest lbe
```

Bare `npx lbe` before installation is not authoritative because npm may resolve
an unrelated package named `lbe`.

## Product Boundary

The TUI must wrap the existing local CLI/API surfaces. It must not become a
second execution engine.

Required boundary:

- LBE Local owns policy, gates, audit, rollback, proof, and execution authority.
- LBE Cloud owns authentication, connection status, and optional proof/control
  summaries.
- Hosted services must not execute shell commands.
- Hosted services must not mutate the user's filesystem.
- The TUI must not imply that cloud state is the source of truth for local
  policy or workspace state.

## Branding

Use the LetterBlack mark as terminal branding inspiration:

- black field
- white frame
- bracket-like white center form
- red vertical center mark
- restrained red accent

Terminal rendering must stay compatible:

- use ANSI color, ASCII, or Unicode logo variants
- provide a plain text fallback
- keep motion subtle, such as a spinner or pulse during refresh
- avoid image-only rendering
- avoid large frame-by-frame animation
- avoid banners that push useful content below the fold

## Layout Reference

Use Cline-style terminal product ergonomics as layout inspiration only:

- persistent identity area
- action-focused workflow
- visible state
- compact command feedback
- keyboard-driven choices

Do not copy Cline source code, product claims, or behavior. LBE's product
identity remains the local execution boundary and proof layer.

## Current Implementation (v1.3.37)

The TUI now renders a branded header with the LBE ASCII logo derived from `assets/lbe-logo-from-image.svg`, along with a status bar and colored menu:

```text
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     ╔══╗       ═══╬═══       ╔══╗                             ║
║     ║  ║       ═══╬═══       ║  ║   LetterBlack Sentinel      ║
║     ║  ║       ═══╬═══       ║  ║   Local Execution Govern.   ║
║     ╚══╝       ═══╬═══       ╚══╝   v1.3.37                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

  ./workspace  |  ○ observe  |  ○ no proof  |  ○ local

  Select an action:
  ─────────────────────────────────────────────────────

  1.  Initialize / Repair Workspace
  2.  Check Status
  3.  View Logs
  4.  View Proof
  5.  Verify Proposal
  6.  Dry Run Proposal
  7.  Observe Mode
  8.  Enforce Mode
  9.  Open Local State

  h     Help / Direct Commands
  q     Exit
```

ANSI color is used: white (#e9e9ef) for brackets and text, red (#ef4b4b) for the center bar and action numbers, dim for secondary info. The logo mirrors the SVG bracket+bar motif.

## First Screen Wireframe (Original Design)

```text
┌──────────────────────────────────────────────────────────────┐
│  [LB] LetterBlack Sentinel                                   │
│  API: online/offline   User: letterblack_user   Mode: local   │
│  Execution: local only   Cloud: connected/disconnected        │
├──────────────────────────────────────────────────────────────┤
│  Select an action:                                           │
│                                                              │
│  1. Connect to Cloud                                         │
│  2. Check Status                                             │
│  3. Verify Action                                            │
│  4. Dry Run                                                  │
│  5. View Proof                                               │
│  6. View Policy                                              │
│  7. Run Local Rollback Demo                                  │
│  8. Settings                                                 │
│  9. Exit                                                     │
├──────────────────────────────────────────────────────────────┤
│  Result / proof / blocked reason / connection output          │
├──────────────────────────────────────────────────────────────┤
│  q quit   r refresh   c connect   p proof                    │
└──────────────────────────────────────────────────────────────┘
```

The header should remain visually stable. The menu should support arrow keys,
number keys, and Enter. The output area should show the latest result without
scrolling the primary controls away.

## Screens

### Boot

Show:

- local workspace discovery result
- API health status
- connection status
- current execution mode
- whether cloud execution is disabled

### Connect to Cloud

Use the existing local-first connection model:

- read local `.lbe/` or existing `lbe.json`
- use a local secret source or environment variable for auth
- call `POST /v1/connect` when available
- show auth-required, connected, or blocked state explicitly

The TUI must not print tokens, secrets, private policy internals, raw audit logs,
or shell output.

### Check Status

Wrap the existing status behavior and show:

- workspace state
- scope/intent/proof availability
- local/cloud connection status
- whether any proof is incomplete

### Verify Action

Collect or load a proposal and pass it through existing verification logic. Do
not execute the action.

### Dry Run

Show the expected decision and reason without shell or filesystem mutation
unless the existing local command already supports safe local dry-run behavior.

### View Proof

Display the latest proof result with concise labels such as:

- `CLEAN`
- `NO_SCOPE_FOUND`
- `NO_INTENT_FOUND`
- `CHANGED_OUTSIDE_SCOPE`
- `VALIDATION_MISSING`
- `PROOF_INCOMPLETE`

### View Policy

Show summarized local policy state. Do not expose secrets, private internals, or
raw sensitive policy data.

### Run Local Rollback Demo

This must be explicitly local-only. It must not call hosted execution endpoints
or imply cloud rollback authority.

### Settings

Show editable or readable settings only when they map to existing local config
authority. Do not invent a second config source.

## Data Shape Direction

Future richer TUI work should define a small TUI state model before adding
dependency-backed UI code:

```json
{
  "workspaceId": "string",
  "userId": "letterblack_user",
  "mode": "observe",
  "api": {
    "baseUrl": "https://api.letterblack.net",
    "health": "online",
    "authenticated": true
  },
  "cloud": {
    "connected": true,
    "execution": "local_only"
  },
  "local": {
    "configPath": ".lbe/",
    "executionAuthority": true,
    "protectedPathsActive": true
  },
  "proof": {
    "status": "CLEAN",
    "lastProofId": "proof_..."
  }
}
```

This is a design shape, not a committed runtime schema.

## Library Direction

Preferred future implementation path:

- `Ink` for a product-like interactive TUI when dependencies are approved.
- `chalk`, `prompts`, `boxen`, and `ora` for a smaller branded CLI step.
- `blessed` or `neo-blessed` only if a dashboard-like terminal pane layout is
  actually needed.

No dependency should be added until a separate richer-TUI implementation issue
is opened and the package/release impact is reviewed. The current menu is
dependency-free.

## Non-Goals

- No web dashboard now.
- No hosted execution.
- No public `/run`.
- No npm publish.
- No tag.
- No package version bump.
- No hosted runtime behavior change.
- No public API expansion from this document.
- No dashboard or account-system claim in the main product surface.

## Next Richer TUI Issue

Open a separate implementation issue before adding a richer dependency-backed
TUI. That issue should declare:

- selected terminal UI library
- package and release impact
- command name and entrypoint
- local config discovery path
- cloud auth source
- tests and smoke checks
- proof that hosted execution remains disabled
