"""Canonical session and provider lifecycle operations for LBE clients."""
from __future__ import annotations

from dataclasses import dataclass

from .memory.models import SessionState
from .memory.operational_history import SessionOperationalHistory
from .provider_registry import ProviderRegistry
from .session_memory_runtime import SessionMemoryRuntimeBridge


class SessionLifecycleError(ValueError):
    """A requested session/provider lifecycle transition is not valid."""


@dataclass(slots=True)
class LbeSessionService:
    """Single owner for persisted session navigation and provider selection."""

    history: SessionOperationalHistory
    provider_registry: ProviderRegistry

    def create_session(self, *, from_state: SessionState, new_session_id: str) -> SessionState:
        clean_id = new_session_id.strip()
        if not clean_id:
            raise SessionLifecycleError("Session id must not be empty.")
        self._require_idle(from_state.session_id, "creating a session")
        if self.history.store.load_session_state(session_id=clean_id) is not None:
            raise SessionLifecycleError(f"Session already exists: {clean_id}")
        return self._runtime(from_state, session_id=clean_id).session_state

    def resume_session(
        self, *, current_session_id: str, target_session_id: str
    ) -> SessionState:
        clean_id = target_session_id.strip()
        if not clean_id:
            raise SessionLifecycleError("Session id must not be empty.")
        self._require_idle(current_session_id, "switching sessions")
        target = self.history.store.load_session_state(session_id=clean_id)
        if target is None:
            raise SessionLifecycleError(f"Session not found: {clean_id}")
        return target

    def configure_provider(
        self, *, state: SessionState, provider_id: str, model_id: str
    ) -> SessionState:
        clean_provider = provider_id.strip()
        clean_model = model_id.strip()
        self._require_idle(state.session_id, "changing provider")
        if clean_provider not in self.provider_registry.provider_ids():
            raise SessionLifecycleError(f"Provider is not registered: {clean_provider}")
        if not clean_model:
            raise SessionLifecycleError("Provider model must not be empty.")
        return self._runtime(state).configure_session(
            provider_id=clean_provider,
            provider_model=clean_model,
        )

    def _require_idle(self, session_id: str, operation: str) -> None:
        if self.history.latest_running_turn(session_id=session_id) is not None:
            raise SessionLifecycleError(
                f"Cancel or complete the active turn before {operation}."
            )

    def _runtime(
        self, state: SessionState, *, session_id: str | None = None
    ) -> SessionMemoryRuntimeBridge:
        return SessionMemoryRuntimeBridge(
            database_path=self.history.store.database_path,
            project_workspace_id=state.project_workspace_id,
            workspace_root=state.canonical_workspace_root,
            session_id=session_id or state.session_id,
            mode=state.mode,
            permission=state.permission,
            runtime_policy=state.runtime_policy,
            provider_id=state.provider_id,
            provider_model=state.provider_model,
            active_profile_id=state.active_profile_id,
            permission_policy_id=state.permission_policy_id,
            evidence_policy_id=state.evidence_policy_id,
        )
