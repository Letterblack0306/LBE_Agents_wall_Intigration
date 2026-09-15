from __future__ import annotations

import hashlib
import sqlite3
import subprocess
from pathlib import Path

import pytest

from lbe_guard_inspector.memory import ValidationStatus, WorkspaceMemoryStore
from lbe_guard_inspector.reasoning_contracts import LBEResponse
from lbe_guard_inspector.session_memory_runtime import (
    SessionMemoryRuntimeBridge,
    TaskStatus,
)


def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
    (root / "tracked.txt").write_text("one\n", encoding="utf-8")
    subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
    subprocess.run(["git", "commit", "-qm", "initial"], cwd=root, check=True)
    return root


def bridge(tmp_path: Path, root: Path) -> SessionMemoryRuntimeBridge:
    return SessionMemoryRuntimeBridge(
        database_path=tmp_path / "memory.sqlite",
        project_workspace_id="project-1",
        workspace_root=root,
        session_id="session-1",
    )


def test_bridge_initializes_store_and_adapter(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    assert isinstance(runtime.store, WorkspaceMemoryStore)
    assert runtime.project_workspace_id == "project-1"
    assert runtime.workspace_root == root.resolve()
    assert runtime.session_state.permission == "read_only"
    assert runtime.session_state.runtime_policy == "audit"


def test_typed_session_policy_persists_across_runtime_reconstruction(tmp_path: Path) -> None:
    root = repo(tmp_path)
    first = SessionMemoryRuntimeBridge(
        database_path=tmp_path / "memory.sqlite",
        project_workspace_id="project-1",
        workspace_root=root,
        session_id="policy-session",
        mode="coding",
        permission="write_allowed",
        runtime_policy="permissive",
        permission_policy_id="opaque-permissions",
    )

    second = SessionMemoryRuntimeBridge(
        database_path=tmp_path / "memory.sqlite",
        project_workspace_id="project-1",
        workspace_root=root,
        session_id="policy-session",
    )

    assert first.session_state.permission == second.session_state.permission == "write_allowed"
    assert first.session_state.runtime_policy == second.session_state.runtime_policy == "permissive"
    assert second.session_state.permission_policy_id == "opaque-permissions"


def test_provider_switch_preserves_typed_session_policy(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = SessionMemoryRuntimeBridge(
        database_path=tmp_path / "memory.sqlite",
        project_workspace_id="project-1",
        workspace_root=root,
        session_id="provider-policy-session",
        permission="audit_only",
        runtime_policy="strict",
    )

    updated = runtime.configure_session(provider_id="provider-b", provider_model="model-b")

    assert updated.permission == "audit_only"
    assert updated.runtime_policy == "strict"


def test_invalid_typed_session_policy_is_rejected(tmp_path: Path) -> None:
    root = repo(tmp_path)
    with pytest.raises(ValueError, match="permission"):
        SessionMemoryRuntimeBridge(
            database_path=tmp_path / "memory.sqlite",
            project_workspace_id="project-1",
            workspace_root=root,
            session_id="bad-policy-session",
            permission="opaque-permissions",
        )


def test_legacy_session_schema_loads_without_fabricating_typed_authority(tmp_path: Path) -> None:
    database = tmp_path / "legacy.sqlite"
    with sqlite3.connect(database) as connection:
        connection.execute(
            """
            CREATE TABLE session_state (
                session_id TEXT PRIMARY KEY,
                project_workspace_id TEXT NOT NULL,
                canonical_workspace_root TEXT NOT NULL,
                mode TEXT NOT NULL,
                provider_id TEXT,
                provider_model TEXT,
                active_profile_id TEXT,
                permission_policy_id TEXT,
                evidence_policy_id TEXT,
                checkpoint_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO session_state VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "legacy-session", "project-1", str(tmp_path), "coding", None, None,
                "opaque-profile", "opaque-permission", "opaque-evidence", None, "t", "t",
            ),
        )

    store = WorkspaceMemoryStore(database)
    state = store.load_session_state(session_id="legacy-session")

    assert state is not None
    assert state.permission is None
    assert state.runtime_policy is None
    assert state.permission_policy_id == "opaque-permission"


def test_deterministic_command_and_tool_results_are_verified(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    command_id = runtime.ingest_command_result(
        command="python -m pytest -q",
        cwd=root,
        exit_code=1,
        stdout="1 failed",
        task_id="task-1",
    )
    tool_id = runtime.ingest_tool_result(
        tool_name="workspace.read_file",
        result={"path": "tracked.txt", "sha256": "abc"},
        success=True,
        task_id="task-1",
    )

    command = runtime.store.get(command_id)
    tool = runtime.store.get(tool_id)
    assert command is not None and command.validation_status is ValidationStatus.VERIFIED
    assert tool is not None and tool.validation_status is ValidationStatus.VERIFIED
    assert command.task_id == "task-1"
    assert tool.task_id == "task-1"


def test_model_observation_is_not_promoted_by_runtime_bridge(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    observation_id = runtime.adapter.record_assistant_observation(
        subject="tracked.txt",
        predicate="is_broken",
        value=True,
    )

    observation = runtime.store.get(observation_id)
    assert observation is not None
    assert observation.validation_status is ValidationStatus.UNVERIFIED
    assert runtime.store.query(project_workspace_id="project-1") == []


def test_checkpoint_rehydrate_preserves_constraints_as_history(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    runtime.adapter.record_git_state(task_id="task-1")

    checkpoint_id = runtime.checkpoint(
        compaction={
            "source_message_count": 4,
            "source_prefix_hash": "sha256:" + "a" * 64,
            "source_last_message_key": "id:msg-4",
            "messages": [],
        },
        active_constraints=["do not commit"],
    )
    packet = runtime.start_or_resume(task_id="task-1")

    assert packet["checkpoint"]["checkpoint_id"] == checkpoint_id
    assert packet["checkpoint"]["active_constraints"] == ["do not commit"]


def test_current_source_invalidates_stale_source_backed_memory(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    memory_id = runtime.adapter.record_file_hash(relative_path="tracked.txt")
    original = runtime.store.get(memory_id)
    assert original is not None
    assert original.source_hash == hashlib.sha256(
        (root / "tracked.txt").read_bytes()
    ).hexdigest()

    (root / "tracked.txt").write_text("two\n", encoding="utf-8")
    runtime.start_or_resume()

    stale = runtime.store.get(memory_id)
    assert stale is not None
    assert stale.validation_status is ValidationStatus.STALE


def test_registry_receipt_remains_separate_but_correlated(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    correlation = runtime.correlate_registry_receipt(
        module_id="module.registry",
        receipt_sequence=7,
        task_id="task-1",
    )

    assert correlation == {
        "project_workspace_id": "project-1",
        "session_id": "session-1",
        "task_id": "task-1",
        "module_id": "module.registry",
        "receipt_sequence": 7,
        "memory_evidence_stored": False,
    }
    assert runtime.store.query(project_workspace_id="project-1") == []


def test_task_outcome_maps_to_canonical_status(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    assert runtime.task_status_for_outcome("COMPLETED") is TaskStatus.COMPLETED
    assert runtime.task_status_for_outcome("ORCHESTRATION_ERROR") is TaskStatus.FAILED
    assert runtime.task_status_for_outcome("INSUFFICIENT_EVIDENCE") is TaskStatus.BLOCKED


def test_unknown_or_fabricated_outcome_is_rejected(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    with pytest.raises(ValueError):
        runtime.task_status_for_outcome("fabricated")
    with pytest.raises(ValueError):
        runtime.task_status_for_outcome("PASS")
    with pytest.raises(ValueError):
        runtime.task_status_for_outcome("")


def test_session_task_create_persist_reload(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    state = runtime.record_task_status(task_id="task-r2", status=TaskStatus.RUNNING)
    assert state.status is TaskStatus.RUNNING
    loaded = runtime.load_task_status(task_id="task-r2")
    assert loaded is not None
    assert loaded.session_id == "session-1"
    assert loaded.task_id == "task-r2"
    assert loaded.project_workspace_id == "project-1"
    assert loaded.status is TaskStatus.RUNNING


def test_task_status_transitions_are_persisted(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    runtime.record_task_status(task_id="task-t", status=TaskStatus.CREATED)
    runtime.record_task_status(task_id="task-t", status=TaskStatus.COMPLETED)
    loaded = runtime.load_task_status(task_id="task-t")
    assert loaded is not None and loaded.status is TaskStatus.COMPLETED


def test_task_outcome_maps_to_persisted_status(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    runtime.record_task_outcome(task_id="task-o", outcome="ORCHESTRATION_ERROR")
    loaded = runtime.load_task_status(task_id="task-o")
    assert loaded is not None and loaded.status is TaskStatus.FAILED
    assert loaded.last_outcome == "ORCHESTRATION_ERROR"


def test_invalid_outcome_does_not_persist(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    with pytest.raises(ValueError):
        runtime.record_task_outcome(task_id="task-x", outcome="fabricated")
    assert runtime.load_task_status(task_id="task-x") is None


def test_task_state_is_isolated_between_sessions(tmp_path: Path) -> None:
    root = repo(tmp_path)
    a = bridge(tmp_path, root)
    b = SessionMemoryRuntimeBridge(
        database_path=tmp_path / "memory.sqlite",
        project_workspace_id="project-1",
        workspace_root=root,
        session_id="session-2",
    )
    a.record_task_status(task_id="shared-task", status=TaskStatus.RUNNING)
    assert a.load_task_status(task_id="shared-task") is not None
    assert b.load_task_status(task_id="shared-task") is None


def test_corrupted_persisted_status_fails_visibly(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    class _BadRow:
        values = {
            "status": "bogus-status",
            "session_id": "session-1",
            "task_id": "bad",
            "project_workspace_id": "project-1",
            "canonical_workspace_root": "x",
            "last_outcome": None,
            "created_at": "t",
            "updated_at": "t",
        }

        def __getitem__(self, key):
            return self.values[key]

    with pytest.raises(ValueError):
        runtime.store._row_to_task_state(_BadRow())


class _FakeReasoningController:
    def __init__(self, outcome: str = "COMPLETED") -> None:
        self.outcome = outcome
        self.requests = []

    def run(self, request):
        self.requests.append(request)
        return LBEResponse(
            task_id=request.task_id,
            workspace_identity={
                "workspace_id": "project-1",
                "target_project_root": str(Path(request.workspace_root).resolve()),
            },
            workspace_profile={},
            plan=None,
            deterministic_result=None,
            explanation=None,
            outcome=self.outcome,
        )


def test_runtime_invokes_existing_reasoning_boundary_and_persists_completed_outcome(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    controller = _FakeReasoningController()

    response = runtime.run_reasoning(
        controller=controller,
        problem="Inspect current workspace",
        task_id="task-r3",
    )

    assert len(controller.requests) == 1
    request = controller.requests[0]
    assert request.problem == "Inspect current workspace"
    assert request.task_id == "task-r3"
    assert Path(request.workspace_root).resolve() == root.resolve()
    assert response is not None
    assert response.task_id == "task-r3"
    assert response.outcome == "COMPLETED"
    state = runtime.load_task_status(task_id="task-r3")
    assert state is not None
    assert state.status is TaskStatus.COMPLETED
    assert state.last_outcome == "COMPLETED"


def test_runtime_persists_blocked_reasoning_outcome(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    controller = _FakeReasoningController("INSUFFICIENT_EVIDENCE")

    response = runtime.run_reasoning(
        controller=controller,
        problem="Inspect",
        task_id="task-blocked",
    )

    assert response.outcome == "INSUFFICIENT_EVIDENCE"
    state = runtime.load_task_status(task_id="task-blocked")
    assert state is not None
    assert state.status is TaskStatus.BLOCKED
    assert state.last_outcome == "INSUFFICIENT_EVIDENCE"


def test_runtime_persists_failed_reasoning_outcome(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)
    controller = _FakeReasoningController("ORCHESTRATION_ERROR")

    response = runtime.run_reasoning(
        controller=controller,
        problem="Inspect",
        task_id="task-failed",
    )

    assert response.outcome == "ORCHESTRATION_ERROR"
    state = runtime.load_task_status(task_id="task-failed")
    assert state is not None
    assert state.status is TaskStatus.FAILED
    assert state.last_outcome == "ORCHESTRATION_ERROR"


def test_runtime_persists_interruption_without_swallowing_it(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    class _InterruptingController:
        def run(self, request):
            raise KeyboardInterrupt()

    with pytest.raises(KeyboardInterrupt):
        runtime.run_reasoning(
            controller=_InterruptingController(),
            problem="Inspect",
            task_id="task-interrupted",
        )

    state = runtime.load_task_status(task_id="task-interrupted")
    assert state is not None
    assert state.status is TaskStatus.BLOCKED
    assert state.last_outcome == "INTERRUPTED"


def test_runtime_persists_boundary_exception_and_reraises(tmp_path: Path) -> None:
    root = repo(tmp_path)
    runtime = bridge(tmp_path, root)

    class _FailingController:
        def run(self, request):
            raise RuntimeError("boundary failed")

    with pytest.raises(RuntimeError, match="boundary failed"):
        runtime.run_reasoning(
            controller=_FailingController(),
            problem="Inspect",
            task_id="task-boundary-error",
        )

    state = runtime.load_task_status(task_id="task-boundary-error")
    assert state is not None
    assert state.status is TaskStatus.FAILED
    assert state.last_outcome == "RUNTIME_REASONING_ERROR"
