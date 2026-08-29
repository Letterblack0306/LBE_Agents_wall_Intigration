# Terminal Lifecycle Acceptance

## Status

`PARTIAL`

## Scope

This module is part of the pre-integration TUI implementation. It remains compatible with the existing `LbeWrapper` boundary and does not assume canonical LBE authority.

## Proven Behavior

- `q` with empty input sets application quit intent.
- Ctrl+C while idle sets application quit intent.
- Ctrl+C while an execution is running requests `UserRequest::Abort` and does not directly quit the application.
- Ctrl+D with empty input sets application quit intent.
- Ctrl+D with non-empty input does not quit.
- Normal `run()` return and ordinary `run()` errors flow through `restore_terminal()` before `main()` returns.
- The LBE terminal restore sequence leaves the alternate screen and makes the cursor visible.
- On Windows/MSVC, Termina 0.3.3 stores the original input/output console modes and restores them from `WindowsTerminal::drop()`.
- On panic, Termina 0.3.3 restores original Windows console modes/code pages through its panic hook, while the LBE panic callback emits alternate-screen-off and cursor-visible control sequences.
- Resize events are accepted by the event loop and are followed by the normal next-loop redraw using the current terminal size.

## Not Proven By Real PTY / ConPTY

No PTY/ConPTY harness is present in the current dependency graph. Therefore this slice does not claim a real terminal-process smoke proof for:

- post-process raw-mode leakage;
- post-process alternate-screen leakage;
- post-process cursor visibility;
- panic cleanup observed from an external terminal host.

The deterministic tests prove the application key semantics and exact visual cleanup sequence, while Windows raw-mode restoration is supported by inspected Termina 0.3.3 implementation.

## Suspend / Resume

`NOT_APPLICABLE` for the current Windows/MSVC implementation slice.

No `Suspend`, `Resume`, `SIGTSTP`, or `SIGCONT` handling exists in the current TUI source. This slice does not invent Unix-style suspend/resume behavior.

## Acceptance Matrix

| Behavior | Status |
| --- | --- |
| Normal `q` quit intent | PROVEN |
| Ctrl+C idle quit intent | PROVEN |
| Ctrl+C running abort semantics | PROVEN |
| Ctrl+D empty-input quit intent | PROVEN |
| Ctrl+D non-empty behavior | PROVEN |
| Ordinary `run()` error reaches cleanup | PROVEN_BY_SOURCE |
| Alternate-screen restore sequence | PROVEN |
| Cursor-visible restore sequence | PROVEN |
| Windows raw-mode restoration ownership | PROVEN_BY_DEPENDENCY_SOURCE |
| Panic raw-mode restoration ownership | PROVEN_BY_DEPENDENCY_SOURCE |
| Panic LBE visual restore callback | IMPLEMENTED_AND_SOURCE_PROVEN |
| Resize acceptance/redraw model | IMPLEMENTED_AND_SOURCE_PROVEN |
| Suspend/resume | NOT_APPLICABLE |
| Real PTY/ConPTY end-to-end lifecycle smoke | NOT_PROVEN |

## Remaining Gap

A real PTY/ConPTY lifecycle smoke remains unproven. A bounded Windows ConPTY experiment using `portable-pty` 0.9.0 was attempted, but the generic `cmd.exe` control probe failed with Windows status `0xC0000142` (`STATUS_DLL_INIT_FAILED`) before command execution. Because the control executable failed identically, this is classified as a ConPTY harness/environment blocker rather than an LBE lifecycle defect. Until external-process terminal-state restoration can be observed with a working host harness, terminal lifecycle acceptance remains `PARTIAL`, not `CLOSED`.

## Out of Scope

- Real LBE runtime attachment.
- Canonical authorization/execution ownership inside the TUI.
- Replacing `LbeWrapper` with direct runtime logic.
- Agent Wall changes.
- Real read/write execution integration.