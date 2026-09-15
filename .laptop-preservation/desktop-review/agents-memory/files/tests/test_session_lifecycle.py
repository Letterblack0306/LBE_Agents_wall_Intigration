from pathlib import Path

import pytest

from lbe_guard_inspector.memory.models import SessionState
from lbe_guard_inspector.memory.operational_history import SessionOperationalHistory
from lbe_guard_inspector.memory.store import WorkspaceMemoryStore
from lbe_guard_inspector.provider_registry import ProviderRegistry
from lbe_guard_inspector.session_lifecycle import LbeSessionService, SessionLifecycleError


def _service(tmp_path: Path) -> tuple[LbeSessionService, SessionOperationalHistory, SessionState]:
    store = WorkspaceMemoryStore(tmp_path / "state.sqlite3")
    state = SessionState(
        "session-1", "workspace", tmp_path, "coding", "read_only", "development",
        "openai-compatible", "old-model",
    )
    store.save_session_state(state)
    history = SessionOperationalHistory(store=store)
    return LbeSessionService(history, ProviderRegistry({"openai-compatible": lambda config: None})), history, state


def test_create_and_resume_use_persisted_session_owner(tmp_path: Path) -> None:
    service, history, state = _service(tmp_path)

    created = service.create_session(from_state=state, new_session_id="session-2")
    assert created.session_id == "session-2"
    assert history.store.load_session_state(session_id="session-2") == created
    assert service.resume_session(current_session_id="session-1", target_session_id="session-2") == created


def test_provider_configuration_uses_registry_and_persists(tmp_path: Path) -> None:
    service, history, state = _service(tmp_path)

    configured = service.configure_provider(
        state=state, provider_id="openai-compatible", model_id="new-model"
    )
    assert configured.provider_model == "new-model"
    assert history.store.load_session_state(session_id=state.session_id).provider_model == "new-model"


@pytest.mark.parametrize(
    "operation",
    [
        lambda service, history, state: service.create_session(from_state=state, new_session_id=""),
        lambda service, history, state: service.resume_session(current_session_id=state.session_id, target_session_id="missing"),
        lambda service, history, state: service.configure_provider(state=state, provider_id="missing", model_id="m"),
    ],
)
def test_invalid_lifecycle_operations_fail_through_one_service(
    tmp_path: Path, operation
) -> None:
    service, history, state = _service(tmp_path)
    with pytest.raises(SessionLifecycleError):
        operation(service, history, state)


def test_lifecycle_mutation_is_rejected_while_turn_is_running(tmp_path: Path) -> None:
    service, history, state = _service(tmp_path)
    history.start_turn(session_id=state.session_id)

    with pytest.raises(SessionLifecycleError, match="active turn"):
        service.create_session(from_state=state, new_session_id="session-2")
    with pytest.raises(SessionLifecycleError, match="active turn"):
        service.configure_provider(state=state, provider_id="openai-compatible", model_id="m")
