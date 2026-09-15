"""Runtime-owned non-streaming provider turn over existing adapter and history."""
from __future__ import annotations

import threading
import json
from uuid import uuid4

from .agent_integration import AgentMode, AgentRequestEnvelope, GovernedAgentGateway
from .memory.operational_history import OperationalEvent, SessionOperationalHistory, TurnStatus
from .openai_compatible_event_adapter import OpenAICompatibleEventAdapter
from .professional_provider_events import ModelEventType, NormalizedModelEvent, ProviderProtocolFamily
from .provider_event_history import project_provider_events
from .runtime.agent_guidance import AgentGuidance
from .evidence_service import EvidenceService
from .provider_continuation import continuation_from_receipt
from .runtime.mode_controller import ModeRequest, resolve_mode
from .runtime.tool_orchestration import (
    GovernedToolOrchestrator,
    ToolExecutionContext,
    ToolRegistry,
    ToolRequest,
    build_workspace_read_handler,
    workspace_read_spec,
)


class NonStreamingProviderTurnRuntime:
    def __init__(self, *, history: SessionOperationalHistory, adapter: OpenAICompatibleEventAdapter, provider_id: str = "openai-compatible", guidance: AgentGuidance | None = None, workspace_root: str | None = None, workspace_id: str | None = None, permission: str = "read_only", runtime_policy: str = "audit", configured_root_id: str | None = None, enable_audit_tools: bool = False) -> None:
        self.history = history
        self.adapter = adapter
        self.provider_id = provider_id
        self.guidance = guidance
        self.workspace_root = workspace_root
        self.workspace_id = workspace_id
        self.permission = permission
        self.runtime_policy = runtime_policy
        self.configured_root_id = configured_root_id
        self.enable_audit_tools = enable_audit_tools
        self._cancel_lock = threading.Lock()
        self._cancelled_turns: set[str] = set()

    @property
    def supports_cancellation(self) -> bool:
        transport = getattr(getattr(self.adapter, "_transport", None), "supports_cancellation", False)
        return bool(transport)

    def cancel(self, *, turn_id: str) -> None:
        with self._cancel_lock:
            self._cancelled_turns.add(turn_id)
        transport = getattr(getattr(self.adapter, "_transport", None), "cancel", None)
        if transport is not None:
            transport()

    def was_cancelled(self, *, turn_id: str) -> bool:
        with self._cancel_lock:
            return turn_id in self._cancelled_turns

    def run(self, *, turn_id: str, text: str) -> None:
        try:
            turn = self.history.get_turn(turn_id=turn_id)
            if turn is None:
                raise ValueError("turn not found")
            messages: tuple[dict[str, str], ...]
            if self.guidance is None:
                messages = ({"role": "user", "content": text},)
            else:
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id,
                    turn_id=turn_id,
                    event_type="runtime.guidance.loaded",
                    payload=self.guidance.audit_payload(),
                ))
                messages = (
                    {"role": "system", "content": self.guidance.prompt},
                    {"role": "user", "content": text},
                )
            tools = self._audit_tools(turn.session_id)
            lbe_call_ids: dict[str, str] = {}
            events = self.adapter.complete(
                messages=messages,
                provider_id=self.provider_id,
                tools=tools,
                lbe_call_id_for_provider_tool_call=lambda provider_call_id: lbe_call_ids.setdefault(provider_call_id, f"lbe-call-{uuid4().hex}"),
            )
            project_provider_events(history=self.history, turn_id=turn_id, events=events)
            tool_events = [event for event in events if event.event_type is ModelEventType.TOOL_CALL_COMPLETED]
            if tool_events:
                self._execute_and_continue(turn_id=turn_id, messages=messages, tool_events=tool_events, lbe_call_ids=lbe_call_ids, tools=tools)
        except Exception as exc:
            if self.was_cancelled(turn_id=turn_id):
                return
            project_provider_events(history=self.history, turn_id=turn_id, events=(NormalizedModelEvent(
                ModelEventType.ERROR, self.provider_id, self.adapter._config.model, ProviderProtocolFamily.OPENAI_COMPATIBLE_CHAT,
                error_code="RUNTIME_PROVIDER_PROJECTION_ERROR", metadata={"error_type": type(exc).__name__},
            ),))

    def start(self, *, turn_id: str, text: str) -> None:
        self.run(turn_id=turn_id, text=text)

    def _audit_tools(self, session_id: str) -> tuple[dict[str, object], ...]:
        if not self.enable_audit_tools or not all((self.workspace_root, self.workspace_id, self.configured_root_id)):
            return ()
        spec = workspace_read_spec()
        return ({
            "type": "function",
            "function": {
                "name": spec.tool_id,
                "description": "Read one UTF-8 file inside the active workspace and return evidence.",
                "parameters": {
                    "type": "object",
                    "properties": {"path": {"type": "string", "description": "Relative workspace file path."}},
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
        },)

    def _execute_and_continue(self, *, turn_id: str, messages: tuple[dict[str, str], ...], tool_events: list[NormalizedModelEvent], lbe_call_ids: dict[str, str], tools: tuple[dict[str, object], ...]) -> None:
        turn = self.history.get_turn(turn_id=turn_id)
        if turn is None or not self.workspace_root or not self.workspace_id or not self.configured_root_id:
            raise ValueError("workspace context is required for governed tool execution")
        mode_decision = resolve_mode(ModeRequest(intent="inspect_workspace", permission=self.permission, workspace_root=self.workspace_root, runtime_policy=self.runtime_policy))
        registry = ToolRegistry()
        registry.register(workspace_read_spec(), build_workspace_read_handler(EvidenceService()))
        orchestrator = GovernedToolOrchestrator(registry=registry)
        continuations: list[dict[str, object]] = []
        for event in tool_events:
            if event.tool_name != "workspace.read" or not isinstance(event.tool_arguments, dict):
                raise ValueError("provider requested an unsupported governed tool")
            provider_call_id = event.provider_tool_call_id
            lbe_call_id = event.lbe_call_id or lbe_call_ids.get(provider_call_id or "")
            if not provider_call_id or not lbe_call_id:
                raise ValueError("provider tool call is missing correlation identity")
            operation_id = f"operation-{uuid4().hex}"
            receipt = orchestrator.invoke(ToolRequest(
                operation_id=operation_id,
                tool_id=event.tool_name,
                arguments=event.tool_arguments,
                context=ToolExecutionContext(
                    mode_decision=mode_decision,
                    workspace_id=self.workspace_id,
                    workspace_root=self.workspace_root,
                    configured_root_id=self.configured_root_id,
                ),
            ))
            self.history.project_tool_receipt(
                session_id=turn.session_id,
                turn_id=turn_id,
                item_id=None,
                receipt=receipt,
                provider_tool_call_id=provider_call_id,
                lbe_call_id=lbe_call_id,
            )
            continuation = continuation_from_receipt(provider_tool_call_id=provider_call_id, lbe_call_id=lbe_call_id, receipt=receipt)
            continuations.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": provider_call_id,
                    "type": "function",
                    "function": {
                        "name": continuation.tool_name,
                        "arguments": json.dumps(dict(event.tool_arguments), ensure_ascii=False, sort_keys=True),
                    },
                }],
            })
            continuations.append({
                "role": "tool",
                "tool_call_id": continuation.provider_tool_call_id,
                "content": json.dumps({"receipt_id": continuation.tool_receipt_id, "operation_id": continuation.runtime_operation_id, "tool_id": continuation.tool_name, "output": dict(continuation.output), "is_error": continuation.is_error}, ensure_ascii=False, sort_keys=True),
            })
        continuation_events = self.adapter.complete(
            messages=messages + tuple(continuations),
            provider_id=self.provider_id,
            tools=tools,
        )
        project_provider_events(history=self.history, turn_id=turn_id, events=continuation_events)


class GovernedCodingTurnRuntime:
    """Project a TUI coding turn through the same governed gateway as ``lbe code``."""

    supports_cancellation = False

    def __init__(self, *, history: SessionOperationalHistory, gateway: GovernedAgentGateway) -> None:
        self.history = history
        self.gateway = gateway

    def cancel(self, *, turn_id: str) -> None:
        raise RuntimeError("live provider cancellation is not available for governed coding")

    def start(self, *, turn_id: str, text: str) -> None:
        self.run(turn_id=turn_id, text=text)

    def run(self, *, turn_id: str, text: str) -> None:
        turn = self.history.get_turn(turn_id=turn_id)
        if turn is None:
            raise ValueError("turn not found")
        state = self.history.store.load_session_state(session_id=turn.session_id)
        if state is None:
            raise ValueError("session not found")
        self.history.append_event(OperationalEvent(
            session_id=turn.session_id, turn_id=turn_id, event_type="model.turn.started", payload={},
            provider_id=state.provider_id, model_id=state.provider_model,
        ))
        try:
            result = self.gateway.invoke(AgentRequestEnvelope(
                request_id=f"tui-{uuid4().hex}",
                session_id=state.session_id,
                task_id=f"tui-task-{turn_id}",
                project_workspace_id=state.project_workspace_id,
                workspace_root=state.canonical_workspace_root,
                mode=AgentMode.CODING,
                operation_id="reasoning.inspect",
                arguments={"problem": text, "max_results": 10},
            ))
            deterministic = dict(result.response.deterministic_result or {})
            guidance = deterministic.get("agent_guidance")
            if isinstance(guidance, dict):
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id,
                    turn_id=turn_id,
                    event_type="runtime.guidance.loaded",
                    payload=dict(guidance),
                ))
            for receipt in deterministic.get("governed_tool_receipts", []):
                if isinstance(receipt, dict):
                    self.history.append_event(OperationalEvent(
                        session_id=turn.session_id, turn_id=turn_id,
                        event_type={"EXECUTED": "tool.completed", "DENIED": "tool.denied", "ESCALATED": "tool.escalated"}.get(str(receipt.get("status")), "tool.failed"),
                        payload=receipt, tool_receipt_id=receipt.get("receipt_id"), runtime_operation_id=receipt.get("operation_id"),
                    ))
            output = deterministic.get("provider_output")
            if isinstance(output, str) and output:
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id, turn_id=turn_id, event_type="model.message.completed", payload={"text": output},
                    provider_id=state.provider_id, model_id=state.provider_model,
                ))
            if result.outcome == "COMPLETED":
                self.history.append_event(OperationalEvent(session_id=turn.session_id, turn_id=turn_id, event_type="model.turn.completed", payload={"task_id": result.task_id, "outcome": result.outcome}))
                self.history.finalize_turn(turn_id=turn_id, status=TurnStatus.COMPLETED)
                return
            raise RuntimeError(result.response.error.message if result.response.error else result.outcome)
        except Exception as exc:
            self.history.append_event(OperationalEvent(session_id=turn.session_id, turn_id=turn_id, event_type="model.error", payload={"error_code": "GOVERNED_CODING_TURN_ERROR", "error_message": f"{type(exc).__name__}: {exc}"}))
            self.history.finalize_turn(turn_id=turn_id, status=TurnStatus.FAILED)


class GovernedProviderTurnRuntime:
    """Run non-coding turns through the registered LBE provider controller."""

    supports_cancellation = False

    def __init__(self, *, history: SessionOperationalHistory, gateway: GovernedAgentGateway, mode: AgentMode, guidance: AgentGuidance | None = None) -> None:
        self.history = history
        self.gateway = gateway
        self.mode = mode
        self.guidance = guidance

    def cancel(self, *, turn_id: str) -> None:
        raise RuntimeError("live provider cancellation is not available for governed reasoning")

    def start(self, *, turn_id: str, text: str) -> None:
        self.run(turn_id=turn_id, text=text)

    def run(self, *, turn_id: str, text: str) -> None:
        turn = self.history.get_turn(turn_id=turn_id)
        if turn is None:
            raise ValueError("turn not found")
        state = self.history.store.load_session_state(session_id=turn.session_id)
        if state is None:
            raise ValueError("session not found")
        self.history.append_event(OperationalEvent(
            session_id=turn.session_id, turn_id=turn_id, event_type="model.turn.started", payload={},
            provider_id=state.provider_id, model_id=state.provider_model,
        ))
        try:
            problem = text
            if self.guidance is not None:
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id, turn_id=turn_id,
                    event_type="runtime.guidance.loaded",
                    payload=self.guidance.audit_payload(),
                ))
                problem = f"{self.guidance.prompt}\n\n---\n\n{text}"
            result = self.gateway.invoke(AgentRequestEnvelope(
                request_id=f"tui-{uuid4().hex}",
                session_id=state.session_id,
                task_id=f"tui-task-{turn_id}",
                project_workspace_id=state.project_workspace_id,
                workspace_root=state.canonical_workspace_root,
                mode=self.mode,
                operation_id="reasoning.inspect",
                arguments={"problem": problem, "max_results": 10},
            ))
            response = result.response
            if response.explanation is not None and response.explanation.explanation:
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id, turn_id=turn_id,
                    event_type="model.message.completed",
                    payload={"text": response.explanation.explanation},
                    provider_id=state.provider_id, model_id=state.provider_model,
                ))
            if result.outcome == "COMPLETED":
                self.history.append_event(OperationalEvent(
                    session_id=turn.session_id, turn_id=turn_id,
                    event_type="model.turn.completed",
                    payload={"task_id": result.task_id, "outcome": result.outcome},
                    provider_id=state.provider_id, model_id=state.provider_model,
                ))
                self.history.finalize_turn(turn_id=turn_id, status=TurnStatus.COMPLETED)
                return
            message = response.error.message if response.error else result.outcome
            raise RuntimeError(message)
        except Exception as exc:
            self.history.append_event(OperationalEvent(
                session_id=turn.session_id, turn_id=turn_id, event_type="model.error",
                payload={"error_code": "GOVERNED_PROVIDER_TURN_ERROR", "error_message": f"{type(exc).__name__}: {exc}"},
                provider_id=state.provider_id, model_id=state.provider_model,
            ))
            self.history.finalize_turn(turn_id=turn_id, status=TurnStatus.FAILED)


class BackgroundProviderTurnRuntime:
    """One non-blocking lifecycle around the existing non-streaming runtime."""

    def __init__(self, *, history: SessionOperationalHistory, foreground) -> None:
        self.history = history
        self.foreground = foreground
        self._lock = threading.RLock()
        self._threads: dict[str, threading.Thread] = {}

    @property
    def supports_cancellation(self) -> bool:
        return getattr(self.foreground, "supports_cancellation", False)

    def cancel(self, *, turn_id: str) -> None:
        if self.is_running(turn_id=turn_id):
            self.foreground.cancel(turn_id=turn_id)

    def start(self, *, turn_id: str, text: str) -> None:
        with self._lock:
            if self.is_running(turn_id=turn_id):
                raise ValueError("provider turn is already running")
            turn = self.history.get_turn(turn_id=turn_id)
            if turn is None:
                raise ValueError("turn not found")
            self.history.append_event(OperationalEvent(session_id=turn.session_id, turn_id=turn_id, event_type="runtime.provider.queued", payload={}))
            thread = threading.Thread(target=self._run, kwargs={"turn_id": turn_id, "text": text}, daemon=True)
            self._threads[turn_id] = thread
            thread.start()

    def is_running(self, *, turn_id: str) -> bool:
        with self._lock:
            thread = self._threads.get(turn_id)
            return thread is not None and thread.is_alive()

    def _run(self, *, turn_id: str, text: str) -> None:
        try:
            turn = self.history.get_turn(turn_id=turn_id)
            if turn is not None:
                self.history.append_event(OperationalEvent(session_id=turn.session_id, turn_id=turn_id, event_type="runtime.provider.running", payload={}))
                self.foreground.run(turn_id=turn_id, text=text)
        finally:
            with self._lock:
                self._threads.pop(turn_id, None)
