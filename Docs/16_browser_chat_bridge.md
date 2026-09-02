# Browser Chat Interaction Bridge

## Status

`CLOSED_PRE_INTEGRATION — LBE EXTERNAL CAPABILITY BOUNDARY PASS`

## Scope Boundary

This module is closed for the pre-integration contract/UI layer. Real browser
automation, automatic memory recall, and live LBE/browser attachment are later
integration dependencies, not remaining Module 16 scope.

## Purpose

Allow an LBE session to interact with a supported browser-based AI chat while preserving LBE as the canonical owner of:

- session identity
- authorization
- tool execution
- evidence
- receipts
- validation
- completion state
- memory

Browser chat is a reasoning/conversation surface, not the execution authority.

## Target Architecture

Browser Chat
    â†“
Browser Chat Adapter
    â†“
LBE Bridge Protocol
    â†“
LbeWrapper
    â†“
Canonical LBE Runtime

Return path:

Canonical LBE Runtime
    â†“
structured result/event
    â†“
Browser Chat Adapter
    â†“
Browser Chat

## Work Items

- [x] Define BrowserChatAdapter trait.
- [x] Define browser-chat session identity.
- [x] Map browser conversation to LBE session ID in the mock projection contract.
- [x] Add outbound message request.
- [x] Add inbound assistant-message event.
- [x] Add browser tool-request interception event.
- [x] Route all proposed mock tool calls through LBE boundary events.
- [x] Return LBE execution result identity to browser chat projection.
- [x] Correlate every browser turn with LBE turn ID in message identity.
- [x] Correlate tool results with receipt/evidence IDs in events/projection.
- [x] Add attach/detach/reconnect state events.
- [x] Add browser-chat status projection to TUI.
- [x] Add session-memory linkage through LBE session/turn IDs.
- [x] Fail closed when bridge/runtime is unavailable in mock wrapper.
- [x] Prevent silent direct-browser execution fallback by contract.

## Completed

- Browser chat types/contracts
- `BrowserChatAdapter` boundary
- `BrowserChatProjection`
- `LbeWrapper` request/event integration
- Browser TUI commands
- Browser panel projection
- Fail-closed mock behavior
- Mock/pre-integration validation

## External / Later Integration

- `REAL_BROWSER_AUTOMATION`
- `AUTOMATIC_MEMORY_RECALL`
- `LIVE_LBE_BROWSER_ATTACHMENT`

## Acceptance Criteria

- [x] Browser chat cannot directly execute governed tools in the mock contract.
- [x] Every browser turn maps to one LBE session/turn identity.
- [x] Tool requests cross the LBE boundary before execution.
- [x] Tool result returned to browser includes correlation identity.
- [x] LBE receipt/evidence remains canonical by projection labels.
- [x] Browser reconnection restores the correct LBE session identity in events.
- [x] Browser chat history is not treated as canonical LBE memory by itself.
- [x] Relevant LBE session memory linkage is represented for later browser-turn recall.
- [x] Bridge failure does not bypass LBE.

## Cross-workspace status (2026-08-31)

LBE runtime: external capabilities are registered through the governed ToolRegistry; no direct external executor is authorized. Rust TUI: browser bridge remains a pre-integration contract and does not prove live browser automation. Evidence: C:\Agents-Memory-Tool-v6-integration\docs\acceptance\GOVERNED_EXTERNAL_CAPABILITY_REGISTRATION_CHECKPOINT.md:32-51.

