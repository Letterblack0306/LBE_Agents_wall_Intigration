from pathlib import Path

from lbe_guard_inspector.agent_integration import AgentMode, AgentRequestEnvelope, AgentResultEnvelope
from lbe_guard_inspector.control_protocol import ControlMethod, ControlRequest
from lbe_guard_inspector.memory.models import SessionState, TaskStatus
from lbe_guard_inspector.memory.operational_history import SessionOperationalHistory, TurnStatus
from lbe_guard_inspector.memory.store import WorkspaceMemoryStore
from lbe_guard_inspector.openai_compatible_event_adapter import OpenAICompatibleEventAdapter
from lbe_guard_inspector.persistent_turn_control import PersistentTurnControl
from lbe_guard_inspector.provider_turn_runtime import GovernedProviderTurnRuntime, NonStreamingProviderTurnRuntime
from lbe_guard_inspector.reasoning_contracts import ExplanationResult, LBEResponse
from lbe_guard_inspector.reasoning_provider import ProviderConfig
from lbe_guard_inspector.runtime.agent_guidance import build_agent_guidance
from lbe_guard_inspector.runtime.mode_controller import ModeDecision, ModeRequest, resolve_mode


def _service(tmp_path: Path, mode: str = "audit") -> tuple[SessionOperationalHistory, SessionState]:
    store = WorkspaceMemoryStore(tmp_path / "state.sqlite3")
    state = SessionState(
        session_id="gov-1",
        project_workspace_id="workspace",
        canonical_workspace_root=tmp_path,
        mode=mode,
        permission="read_only",
        runtime_policy="audit",
        provider_id="openai-compatible",
        provider_model="m",
    )
    store.save_session_state(state)
    return SessionOperationalHistory(store=store), state


class _CapturingGateway:
    def __init__(self) -> None:
        self.requests: list[AgentRequestEnvelope] = []

    def invoke(self, request: AgentRequestEnvelope) -> AgentResultEnvelope:
        self.requests.append(request)
        return AgentResultEnvelope(
            request_id=request.request_id,
            session_id=request.session_id,
            task_id=request.task_id,
            operation_id=request.operation_id,
            mode=request.mode,
            mode_decision=ModeDecision(mode=request.mode.value, allowed_behaviors=(), capabilities=(), rationale="test"),
            status=TaskStatus.COMPLETED,
            outcome="COMPLETED",
            response=LBEResponse(
                task_id=request.task_id,
                workspace_identity={},
                workspace_profile={},
                plan=None,
                deterministic_result={},
                explanation=ExplanationResult(explanation="done"),
                outcome="COMPLETED",
                error=None,
            ),
        )


def test_governed_provider_runtime_delivers_active_doctrine_and_safe_provenance(tmp_path: Path) -> None:
    history, state = _service(tmp_path, mode="audit")
    guidance = build_agent_guidance(
        mode_decision=resolve_mode(ModeRequest(intent="inspect_workspace", permission="read_only", workspace_root=str(tmp_path), runtime_policy="audit")),
        workspace_root=tmp_path,
        tools=(),
    )
    gateway = _CapturingGateway()
    runtime = GovernedProviderTurnRuntime(history=history, gateway=gateway, mode=AgentMode.AUDIT, guidance=guidance)

    turn = history.start_turn(session_id=state.session_id)
    runtime.run(turn_id=turn.turn_id, text="find the cause")

    assert gateway.requests and "ACTIVE DOCTRINE: AUDIT" in gateway.requests[0].arguments["problem"]
    events = history.events_for_session(session_id=state.session_id)
    loaded = [event for event in events if event.event_type == "runtime.guidance.loaded"]
    assert len(loaded) == 1
    assert loaded[0].payload["doctrine"] == "AUDIT"
    assert "prompt" not in loaded[0].payload


def test_governed_provider_runtime_without_guidance_sends_user_problem_only(tmp_path: Path) -> None:
    history, state = _service(tmp_path, mode="investigation")
    gateway = _CapturingGateway()
    runtime = GovernedProviderTurnRuntime(history=history, gateway=gateway, mode=AgentMode.INVESTIGATION)

    turn = history.start_turn(session_id=state.session_id)
    runtime.run(turn_id=turn.turn_id, text="trace the failure")

    assert gateway.requests[0].arguments["problem"] == "trace the failure"
    events = history.events_for_session(session_id=state.session_id)
    assert not [event for event in events if event.event_type == "runtime.guidance.loaded"]


class _Transport:
    def __init__(self) -> None:
        self.messages = None

    def post_json(self, **_: object) -> dict[str, object]:
        self.messages = _.get("payload", {}).get("messages")
        return {"id": "req-1", "choices": [{"message": {"content": "answer"}, "finish_reason": "stop"}], "usage": {"total_tokens": 3}}


def test_typed_start_runs_provider_through_control_owner_and_persists_result(tmp_path: Path) -> None:
    store = WorkspaceMemoryStore(tmp_path / "state.sqlite3")
    store.save_session_state(SessionState("s", "w", tmp_path, "coding", "read_only", "development", "openai-compatible", "m"))
    history = SessionOperationalHistory(store=store)
    adapter = OpenAICompatibleEventAdapter(config=ProviderConfig("http://provider.invalid/v1/chat/completions", "m", 1), transport=_Transport())
    control = PersistentTurnControl(history=history, provider_runtime=NonStreamingProviderTurnRuntime(history=history, adapter=adapter))
    assert control.handle(ControlRequest("r", ControlMethod.TURN_START, {"session_id": "s", "text": "hello"})).accepted
    turn = history.events_for_session(session_id="s")
    assert [event.event_type for event in turn] == ["user.message", "model.turn.started", "model.message.completed", "model.usage.updated", "model.turn.completed"]
    assert history.get_turn(turn_id=turn[-1].turn_id).status is TurnStatus.COMPLETED


def test_non_streaming_runtime_delivers_active_doctrine_and_safe_provenance(tmp_path: Path) -> None:
    store = WorkspaceMemoryStore(tmp_path / "state.sqlite3")
    store.save_session_state(SessionState("s", "w", tmp_path, "audit", "read_only", "audit", "openai-compatible", "m"))
    history = SessionOperationalHistory(store=store)
    transport = _Transport()
    guidance = build_agent_guidance(
        mode_decision=resolve_mode(ModeRequest(intent="inspect_workspace", permission="read_only", workspace_root=str(tmp_path), runtime_policy="audit")),
        workspace_root=tmp_path,
        tools=(),
    )
    adapter = OpenAICompatibleEventAdapter(config=ProviderConfig("http://provider.invalid/v1/chat/completions", "m", 1), transport=transport)
    control = PersistentTurnControl(history=history, provider_runtime=NonStreamingProviderTurnRuntime(history=history, adapter=adapter, guidance=guidance))
    assert control.handle(ControlRequest("r", ControlMethod.TURN_START, {"session_id": "s", "text": "find the cause"})).accepted
    assert transport.messages[0]["role"] == "system"
    assert "ACTIVE DOCTRINE: AUDIT" in transport.messages[0]["content"]
    events = history.events_for_session(session_id="s")
    loaded = [event for event in events if event.event_type == "runtime.guidance.loaded"]
    assert len(loaded) == 1
    assert loaded[0].payload["doctrine"] == "AUDIT"
    assert "prompt" not in loaded[0].payload
