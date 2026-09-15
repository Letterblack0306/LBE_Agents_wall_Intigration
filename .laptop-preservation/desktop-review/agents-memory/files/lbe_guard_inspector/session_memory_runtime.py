from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, TypeVar

from .memory import (
    CandidateClaim,
    MemoryPromoter,
    MemoryType,
    SessionMemoryAdapter,
    SessionState,
    SourceType,
    TaskState,
    TaskStatus,
    WorkspaceMemoryStore,
)
from .reasoning_contracts import LBERequest, LBEResponse
from .recovery import (
    CancellationSignal,
    EvidenceCallback,
    FailureClassifier,
    RetryPolicy,
    classify_failure,
    load_recovery_state,
    run_with_recovery,
)


T = TypeVar("T")

_REASONING_OUTCOME_TO_TASK_STATUS = {
    "COMPLETED": TaskStatus.COMPLETED,
    "ORCHESTRATION_ERROR": TaskStatus.FAILED,
    "INSUFFICIENT_EVIDENCE": TaskStatus.BLOCKED,
}


class ReasoningController(Protocol):
    """Existing reasoning boundary required by the persistent runtime."""

    def run(self, request: LBERequest) -> LBEResponse: ...


class SessionMemoryRuntimeBridge:
    """One bounded runtime bridge for validated session memory.

    Command and tool results must be deterministic structured records. Registry
    receipts remain registry evidence; this bridge only returns correlation
    metadata and never promotes receipts or model prose into workspace truth.
    """

    def __init__(
        self,
        *,
        database_path: str | Path,
        project_workspace_id: str,
        workspace_root: str | Path,
        session_id: str,
        mode: str = "unspecified",
        permission: str | None = "read_only",
        runtime_policy: str | None = "audit",
        provider_id: str | None = None,
        provider_model: str | None = None,
        active_profile_id: str | None = None,
        permission_policy_id: str | None = None,
        evidence_policy_id: str | None = None,
    ) -> None:
        clean_session = session_id.strip()
        if not clean_session:
            raise ValueError("session_id must not be empty")
        self.session_id = clean_session
        self.store = WorkspaceMemoryStore(database_path)
        self.adapter = SessionMemoryAdapter(
            store=self.store,
            project_workspace_id=project_workspace_id,
            workspace_root=workspace_root,
        )
        self.promoter = MemoryPromoter(self.store)
        existing = self.store.load_session_state(session_id=self.session_id)
        if existing is not None:
            if existing.project_workspace_id != self.project_workspace_id:
                raise ValueError("persisted session workspace identity does not match runtime")
            if Path(existing.canonical_workspace_root).resolve() != self.workspace_root:
                raise ValueError("persisted session workspace root does not match runtime")
        self.session_state = SessionState(
            session_id=self.session_id,
            project_workspace_id=self.project_workspace_id,
            canonical_workspace_root=str(self.workspace_root),
            mode=mode if existing is None else existing.mode,
            permission=permission if existing is None else existing.permission,
            runtime_policy=runtime_policy if existing is None else existing.runtime_policy,
            provider_id=provider_id if existing is None else existing.provider_id,
            provider_model=provider_model if existing is None else existing.provider_model,
            active_profile_id=(active_profile_id if existing is None else existing.active_profile_id),
            permission_policy_id=(
                permission_policy_id if existing is None else existing.permission_policy_id
            ),
            evidence_policy_id=(
                evidence_policy_id if existing is None else existing.evidence_policy_id
            ),
            checkpoint_id=None if existing is None else existing.checkpoint_id,
            created_at=existing.created_at if existing is not None else SessionState.__dataclass_fields__["created_at"].default_factory(),
            updated_at=existing.updated_at if existing is not None else SessionState.__dataclass_fields__["updated_at"].default_factory(),
        )
        self.adapter.save_session_state(self.session_state)

    @property
    def project_workspace_id(self) -> str:
        return self.adapter.project_workspace_id

    @property
    def workspace_root(self) -> Path:
        return self.adapter.workspace_root

    def configure_session(
        self,
        *,
        mode: str | None = None,
        permission: str | None = None,
        runtime_policy: str | None = None,
        provider_id: str | None = None,
        provider_model: str | None = None,
        active_profile_id: str | None = None,
        permission_policy_id: str | None = None,
        evidence_policy_id: str | None = None,
    ) -> SessionState:
        current = self.store.load_session_state(session_id=self.session_id)
        if current is None:
            raise RuntimeError("persistent session state is missing")
        state = SessionState(
            session_id=current.session_id,
            project_workspace_id=current.project_workspace_id,
            canonical_workspace_root=current.canonical_workspace_root,
            mode=current.mode if mode is None else mode,
            permission=current.permission if permission is None else permission,
            runtime_policy=(
                current.runtime_policy if runtime_policy is None else runtime_policy
            ),
            provider_id=current.provider_id if provider_id is None else provider_id,
            provider_model=current.provider_model if provider_model is None else provider_model,
            active_profile_id=(
                current.active_profile_id if active_profile_id is None else active_profile_id
            ),
            permission_policy_id=(
                current.permission_policy_id
                if permission_policy_id is None
                else permission_policy_id
            ),
            evidence_policy_id=(
                current.evidence_policy_id if evidence_policy_id is None else evidence_policy_id
            ),
            checkpoint_id=current.checkpoint_id,
            created_at=current.created_at,
            updated_at=current.updated_at,
        )
        self.session_state = self.adapter.save_session_state(state)
        return self.session_state

    def task_status_for_outcome(self, outcome: str) -> TaskStatus:
        """Map a reasoning-layer outcome to the canonical task lifecycle status."""
        if not isinstance(outcome, str):
            raise ValueError("reasoning outcome must be a string")
        try:
            return _REASONING_OUTCOME_TO_TASK_STATUS[outcome]
        except KeyError as exc:
            message = "Unknown reasoning outcome for task status: " + outcome
            raise ValueError(message) from exc

    def record_task_status(
        self,
        *,
        task_id: str,
        status: TaskStatus | str,
        last_outcome: str | None = None,
    ) -> TaskState:
        """Persist the canonical status for one task in this session."""
        clean_task = task_id.strip()
        if not clean_task:
            raise ValueError("task_id must not be empty")
        status_value = status if isinstance(status, TaskStatus) else TaskStatus(status)
        if not isinstance(status_value, TaskStatus):
            raise ValueError(f"status must be a TaskStatus value, got {status!r}")
        existing = self.load_task_status(task_id=clean_task)
        state = TaskState(
            session_id=self.session_id,
            task_id=clean_task,
            project_workspace_id=self.project_workspace_id,
            canonical_workspace_root=str(self.workspace_root),
            status=status_value,
            last_outcome=last_outcome,
            created_at=existing.created_at if existing else TaskState.__dataclass_fields__["created_at"].default_factory(),
        )
        self.store.save_session_task(state)
        return state

    def record_task_outcome(self, *, task_id: str, outcome: str) -> TaskState:
        """Persist a task status derived from an existing reasoning outcome."""
        return self.record_task_status(
            task_id=task_id,
            status=self.task_status_for_outcome(outcome),
            last_outcome=outcome,
        )

    def run_reasoning(
        self,
        *,
        controller: ReasoningController,
        problem: str,
        task_id: str,
        reference_context: tuple[Mapping[str, Any], ...] = (),
        max_results: int = 10,
    ) -> LBEResponse:
        """Invoke the existing reasoning boundary and persist task lifecycle state."""
        clean_problem = problem.strip()
        clean_task = task_id.strip()
        if not clean_problem:
            raise ValueError("problem must not be empty")
        if not clean_task:
            raise ValueError("task_id must not be empty")

        self.record_task_status(task_id=clean_task, status=TaskStatus.RUNNING)
        request = LBERequest(
            problem=clean_problem,
            workspace_root=self.workspace_root,
            reference_context=reference_context,
            task_id=clean_task,
            max_results=max_results,
        )
        try:
            response = controller.run(request)
        except KeyboardInterrupt:
            self.record_task_status(
                task_id=clean_task,
                status=TaskStatus.BLOCKED,
                last_outcome="INTERRUPTED",
            )
            raise
        except Exception:
            self.record_task_status(
                task_id=clean_task,
                status=TaskStatus.FAILED,
                last_outcome="RUNTIME_REASONING_ERROR",
            )
            raise

        if not isinstance(response, LBEResponse):
            self.record_task_status(
                task_id=clean_task,
                status=TaskStatus.FAILED,
                last_outcome="INVALID_REASONING_RESPONSE",
            )
            raise TypeError("reasoning controller must return LBEResponse")
        if response.task_id != clean_task:
            self.record_task_status(
                task_id=clean_task,
                status=TaskStatus.FAILED,
                last_outcome="TASK_ID_MISMATCH",
            )
            raise ValueError("reasoning response task_id does not match runtime task_id")

        self.record_task_outcome(task_id=clean_task, outcome=response.outcome)
        return response

    def run_recoverable(
        self,
        *,
        task_id: str,
        operation_id: str,
        operation: Callable[[], T],
        policy: RetryPolicy,
        idempotent: bool,
        cancellation: CancellationSignal | None = None,
        evidence_between_attempts: EvidenceCallback | None = None,
        classify: FailureClassifier = classify_failure,
    ) -> T:
        """Execute one bounded operation under the persisted R5 recovery contract."""
        return run_with_recovery(
            operation=operation,
            policy=policy,
            store=self.store,
            promoter=self.promoter,
            project_workspace_id=self.project_workspace_id,
            canonical_workspace_root=str(self.workspace_root),
            task_id=task_id,
            operation_id=operation_id,
            idempotent=idempotent,
            cancellation=cancellation,
            evidence_between_attempts=evidence_between_attempts,
            classify=classify,
        )

    def load_recovery_state(self, *, task_id: str, operation_id: str):
        """Reload the persisted recovery receipt for one task operation."""
        return load_recovery_state(
            store=self.store,
            project_workspace_id=self.project_workspace_id,
            task_id=task_id,
            operation_id=operation_id,
        )

    def load_task_status(self, *, task_id: str) -> TaskState | None:
        clean_task = task_id.strip()
        if not clean_task:
            raise ValueError("task_id must not be empty")
        return self.store.load_session_task(
            session_id=self.session_id,
            task_id=clean_task,
            project_workspace_id=self.project_workspace_id,
        )

    def start_or_resume(
        self,
        *,
        task_id: str | None = None,
        recent_messages: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        packet = self.adapter.rehydrate(
            session_id=self.session_id,
            task_id=task_id,
            recent_messages=recent_messages,
        )
        self.session_state = self.store.load_session_state(session_id=self.session_id) or self.session_state
        return packet

    def ingest_command_result(
        self,
        *,
        command: str,
        cwd: str | Path,
        exit_code: int,
        task_id: str | None = None,
        source_message_id: str | None = None,
        stdout: str = "",
        stderr: str = "",
    ) -> str:
        return self.adapter.record_command_result(
            command=command,
            cwd=cwd,
            exit_code=exit_code,
            task_id=task_id,
            source_message_id=source_message_id,
            stdout=stdout,
            stderr=stderr,
        )

    def ingest_tool_result(
        self,
        *,
        tool_name: str,
        result: Mapping[str, Any],
        success: bool,
        task_id: str | None = None,
        source_message_id: str | None = None,
    ) -> str:
        clean_name = tool_name.strip()
        if not clean_name:
            raise ValueError("tool_name must not be empty")
        if not isinstance(result, Mapping):
            raise TypeError("result must be a structured mapping")
        record = self.promoter.promote(
            CandidateClaim(
                project_workspace_id=self.project_workspace_id,
                canonical_workspace_root=str(self.workspace_root),
                task_id=task_id,
                memory_type=MemoryType.VALIDATION_RESULT,
                subject=clean_name,
                predicate="tool_result",
                value={"success": bool(success), "result": dict(result)},
                source_type=SourceType.COMMAND_RESULT,
                source_message_id=source_message_id,
                authority=9,
                validation_method="structured-tool-result",
                validated=True,
            )
        )
        return record.memory_id

    def checkpoint(
        self,
        *,
        compaction: str | Path | dict[str, Any],
        active_constraints: list[str] | tuple[str, ...] = (),
    ) -> str:
        checkpoint_id = self.adapter.checkpoint_compaction(
            session_id=self.session_id,
            compaction=compaction,
            active_constraints=active_constraints,
        )
        self.session_state = self.store.load_session_state(session_id=self.session_id) or self.session_state
        return checkpoint_id

    def correlate_registry_receipt(
        self,
        *,
        module_id: str,
        receipt_sequence: int,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        clean_module = module_id.strip()
        if not clean_module:
            raise ValueError("module_id must not be empty")
        if receipt_sequence < 1:
            raise ValueError("receipt_sequence must be positive")
        return {
            "project_workspace_id": self.project_workspace_id,
            "session_id": self.session_id,
            "task_id": task_id,
            "module_id": clean_module,
            "receipt_sequence": receipt_sequence,
            "memory_evidence_stored": False,
        }
