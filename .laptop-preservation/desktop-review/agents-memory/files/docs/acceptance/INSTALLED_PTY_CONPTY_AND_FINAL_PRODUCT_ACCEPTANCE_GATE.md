# Installed PTY/ConPTY and Final Product Acceptance Gate

Status: **OPEN — INSTALLED PTY/ConPTY AND FINAL PRODUCT ACCEPTANCE**

## Machine-selected state

```text
phase: INSTALLED_PTY_CONPTY_AND_FINAL_PRODUCT_ACCEPTANCE
slice: INSTALLED_PTY_CONPTY_IMPLEMENTATION
status: OPEN
implementation_allowed: true — installed PTY/ConPTY and final product acceptance only
architecture_changes_allowed: true (explicit user authorization)
next_phase_locked: true
required_status_for_advance: PASS
publication: LOCKED / NOT AUTHORIZED
```

## Acceptance target

```text
fresh installed environment
→ open terminal
→ type: lbe
→ PTY/ConPTY starts cleanly
→ full LBE coding IDE CLI/TUI renders
→ Cline provider/model mechanics are available underneath
→ authoritative LBE runtime is attached
→ normal coding turn completes
→ governed tool/approval flow works
→ ToolReceipt/evidence are visible/persisted
→ quit restores terminal cleanly
→ restart
→ lbe
→ same session/workspace resumes correctly
```

## Required final verdicts

| # | Verdict | Description |
|---|---------|-------------|
| 1 | INSTALLED_PTY_CONPTY | PTY/ConPTY starts cleanly |
| 2 | FINAL_PRODUCT_SINGLE_COMMAND_LAUNCH | `lbe` launches the full product |
| 3 | REAL_RUNTIME_ATTACHMENT | Authoritative LBE runtime is attached |
| 4 | PROVIDER_MODEL_BINDING | Cline provider/model mechanics available |
| 5 | GOVERNED_CODING_FLOW | Normal coding turn completes |
| 6 | RECEIPT_EVIDENCE_PROJECTION | ToolReceipt/evidence visible/persisted |
| 7 | CLEAN_TERMINAL_EXIT | Quit restores terminal cleanly |
| 8 | INSTALLED_RESTART_RESUME | Restart resumes same session/workspace |
| 9 | FINAL_PRODUCT_ACCEPTANCE | All verdicts PASS |

## Implementation surfaces

The following are implementation surfaces (not separate gates):
- `lbe-product.ps1` — local build/package helper
- `run-lbe.bat` — local launcher helper
- `bin/lbe.js` — canonical product entry
- `lbe_guard_inspector.product_entry` — canonical product entry point

## Product direction (locked)

```text
USER → lbe
        → LBE coding IDE CLI/TUI
        → Cline mechanics underneath
        → LBE runtime authority (C:\Agents-Memory-Tool-v6-integration)
```
