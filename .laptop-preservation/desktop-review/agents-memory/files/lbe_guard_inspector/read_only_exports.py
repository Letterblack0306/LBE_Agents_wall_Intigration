"""Product-level read-only projections over existing LBE owners."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .contracts import validate_contract
from .memory.completion_contracts import TaskCompletionContractPersistence
from .memory.completion_evidence import TaskCompletionEvidencePersistence
from .memory.context import inspect_git_state, protected_checkpoint_eligibility
from .memory.models import MemoryType, ValidationStatus, canonical_root
from .memory.operational_history import SessionOperationalHistory
from .memory.store import WorkspaceMemoryStore
from .project_profiler import ProjectProfiler
from .professional_transcript import replay_session_transcript
from .runtime.validation_command_policy import DEFAULT_VALIDATION_COMMAND_POLICY_CATALOG

SCHEMA_VERSION = "1.0"

class ProjectionExportError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message); self.code = code; self.retryable = retryable

def _now() -> str: return datetime.now(timezone.utc).isoformat()
def _opaque(payload: dict[str, Any]) -> dict[str, Any]:
    return {"owner_payload_version": SCHEMA_VERSION, "opaque": True, "payload": payload}

def _envelope(kind: str, data: dict[str, Any], workspace_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
    value: dict[str, Any] = {"schema_version": SCHEMA_VERSION, "projection_type": kind, "generated_at": _now(), "workspace_id": workspace_id, "read_only": True, "data": data}
    if session_id is not None: value["session_id"] = session_id
    return value

def _error(kind: str, exc: Exception, workspace_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
    code = exc.code if isinstance(exc, ProjectionExportError) else "MALFORMED_OWNER_STATE"
    retryable = exc.retryable if isinstance(exc, ProjectionExportError) else False
    value = {"schema_version": SCHEMA_VERSION, "projection_type": kind, "generated_at": _now(), "workspace_id": workspace_id, "session_id": session_id, "read_only": True, "error": {"code": code, "message": str(exc), "retryable": retryable}}
    return validate_contract("projection_error_envelope", value)

def _run(kind: str, builder: Callable[[], dict[str, Any]], workspace_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
    try: return validate_contract(f"{kind}_projection", builder())
    except Exception as exc: return _error(kind, exc, workspace_id, session_id)

def project_truth(*, workspace_root: str | Path, configured_root_id: str | None = None) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        profile = ProjectProfiler().profile(workspace_root, configured_root_id=configured_root_id)
        snapshot = ProjectProfiler.snapshot(profile)
        workspace_id = profile.get("workspace_id")
        if not isinstance(workspace_id, str) or not workspace_id: raise ProjectionExportError("AUTHORITATIVE_STATE_UNAVAILABLE", "Project profile has no workspace identity.")
        data = {
            "workspace_root": profile["workspace_root"],
            "target_project_root": profile["target_project_root"],
            "configured_root_id": profile.get("configured_root_id"),
            "project_types": profile["project_types"],
            "signals": profile["signals"],
            "confidence": profile["confidence"],
            "outcome": profile["outcome"],
            "missing_evidence": profile["missing_evidence"],
            "profile_hash": snapshot["profile_hash"],
        }
        return _envelope("project_truth", data, workspace_id)
    return _run("project_truth", build)

def _session(store: WorkspaceMemoryStore, session_id: str, workspace_id: str | None, workspace_root: str | Path | None) -> tuple[Any, str, str]:
    state = store.load_session_state(session_id=session_id)
    if state is None: raise ProjectionExportError("AUTHORITATIVE_STATE_UNAVAILABLE", f"Persisted session not found: {session_id}")
    if workspace_id is not None and state.project_workspace_id != workspace_id: raise ProjectionExportError("IDENTITY_MISMATCH", "Persisted session workspace identity does not match the requested workspace.")
    root = canonical_root(workspace_root) if workspace_root is not None else state.canonical_workspace_root
    if state.canonical_workspace_root != root: raise ProjectionExportError("IDENTITY_MISMATCH", "Persisted session workspace root does not match the requested workspace.")
    return state, state.project_workspace_id, root

def _task(task: Any) -> dict[str, Any] | None:
    return None if task is None else {"task_id": task.task_id, "current_status": task.status.value, "last_outcome": task.last_outcome, "created_at": task.created_at, "updated_at": task.updated_at}

def _checkpoint(value: Any) -> dict[str, Any] | None:
    return None if value is None else {"checkpoint_id": value.checkpoint_id, "source_prefix_hash": value.source_prefix_hash, "source_message_count": value.source_message_count, "source_last_message_key": value.source_last_message_key, "branch": value.branch, "head": value.head, "verified_memory_ids": list(value.verified_memory_ids), "active_constraints": list(value.active_constraints), "created_at": value.created_at}

def session_context(*, store: WorkspaceMemoryStore, session_id: str, workspace_id: str | None = None, workspace_root: str | Path | None = None, task_id: str | None = None) -> dict[str, Any]:
    hint = store.load_session_state(session_id=session_id); known = hint.project_workspace_id if hint else workspace_id
    def build() -> dict[str, Any]:
        state, project_id, root = _session(store, session_id, workspace_id, workspace_root)
        git = inspect_git_state(root); task = store.load_session_task(session_id=session_id, task_id=task_id, project_workspace_id=project_id) if task_id else None
        checkpoint = store.latest_checkpoint(session_id); records = store.query(project_workspace_id=project_id, statuses=(ValidationStatus.VERIFIED,), limit=500)
        verified=[]; constraints=[]; failures=[]
        for record in records:
            item = _opaque(record.as_dict())
            if record.memory_type is MemoryType.TASK_CONSTRAINT: constraints.append(item)
            elif record.memory_type is MemoryType.FAILURE_PATTERN: failures.append(item)
            else: verified.append(item)
        history = SessionOperationalHistory(store=store)
        transcript = [{"sequence": x.sequence, "kind": x.kind, "status": x.status, "text": x.text, "event_id": x.event_id, "item_id": x.item_id} for x in replay_session_transcript(history=history, session_id=session_id)]
        revalidation = None
        if checkpoint is not None:
            revalidation = _opaque(protected_checkpoint_eligibility(
                checkpoint=checkpoint,
                current_workspace_id=project_id,
                current_workspace_root=root,
                current_git_state=git,
            ))
        data = {"session": state.as_dict(), "workspace": {"project_workspace_id": project_id, "canonical_root": root, "branch": git["branch"], "head": git["head"], "status_short": list(git["status_short"])}, "task": _opaque(_task(task)) if task else None, "checkpoint": _opaque(_checkpoint(checkpoint)) if checkpoint else None, "checkpoint_revalidation": revalidation, "verified_facts": verified, "active_constraints": constraints, "recent_failures": failures, "transcript": transcript}
        return _envelope("session_context", data, project_id, session_id)
    return _run("session_context", build, known, session_id)

def provenance(*, store: WorkspaceMemoryStore, workspace_id: str, session_id: str | None = None, task_id: str | None = None) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        records = store.query(project_workspace_id=workspace_id, statuses=tuple(ValidationStatus), task_id=task_id, limit=1000)
        events=[]
        if session_id is not None:
            state=store.load_session_state(session_id=session_id)
            if state is None: raise ProjectionExportError("AUTHORITATIVE_STATE_UNAVAILABLE", f"Persisted session not found: {session_id}")
            if state.project_workspace_id != workspace_id: raise ProjectionExportError("IDENTITY_MISMATCH", "Persisted session workspace identity does not match the requested workspace.")
            for event in SessionOperationalHistory(store=store).events_for_session(session_id=session_id):
                sequence=event.session_sequence if event.session_sequence is not None else event.turn_sequence
                if sequence is None: raise ProjectionExportError("MALFORMED_OWNER_STATE", "Operational event has no sequence.")
                events.append({"event_id": event.event_id, "sequence": sequence, "event_type": event.event_type, "turn_id": event.turn_id, "item_id": event.item_id, "provider_id": event.provider_id, "model_id": event.model_id, "provider_request_id": event.provider_request_id, "provider_item_id": event.provider_item_id, "provider_tool_call_id": event.provider_tool_call_id, "lbe_call_id": event.lbe_call_id, "runtime_operation_id": event.runtime_operation_id, "tool_receipt_id": event.tool_receipt_id})
        statuses={record.validation_status for record in records}; stale="stale" if ValidationStatus.STALE in statuses else "current" if records or events else "unknown"
        data={"session_id": session_id, "task_id": task_id, "sources": [_opaque(record.as_dict()) for record in records], "events": events, "evidence_ids": None, "staleness": stale}
        return _envelope("provenance", data, workspace_id, session_id)
    return _run("provenance", build, workspace_id, session_id)

def validation(*, store: WorkspaceMemoryStore, session_id: str, task_id: str) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        state=store.load_session_state(session_id=session_id)
        if state is None: raise ProjectionExportError("AUTHORITATIVE_STATE_UNAVAILABLE", f"Persisted session not found: {session_id}")
        contract=TaskCompletionContractPersistence(store).load(session_id=session_id, task_id=task_id, project_workspace_id=state.project_workspace_id)
        if contract is None: raise ProjectionExportError("AUTHORITATIVE_STATE_UNAVAILABLE", f"Persisted task completion contract not found: {task_id}")
        requirements=[{"requirement_id": item.requirement_id, "evidence_kind": item.evidence_kind} for item in contract.requirements]; policies=[]
        for item in contract.requirements:
            policy=DEFAULT_VALIDATION_COMMAND_POLICY_CATALOG.find(operation_id="reasoning.inspect", mode=state.mode, evidence_kind=item.evidence_kind)
            if policy is not None: policies.append({"policy_id": policy.policy_id, "operation_id": policy.operation_id, "applicable_mode": policy.applicable_mode, "evidence_kind": policy.evidence_kind, "command": list(policy.command), "timeout_seconds": policy.timeout_seconds})
        evidence=TaskCompletionEvidencePersistence(store).load(session_id=session_id, task_id=task_id, project_workspace_id=state.project_workspace_id); task=store.load_session_task(session_id=session_id, task_id=task_id, project_workspace_id=state.project_workspace_id)
        data={"task_id": task_id, "operation_id": "reasoning.inspect", "mode": state.mode, "requirements": requirements, "policies": policies, "evidence": [{"evidence_id": x.evidence_id, "kind": x.kind, "status": x.status, "producer_id": x.producer_id, "operation_id": x.operation_id, "details": _opaque(dict(x.details))} for x in evidence], "task_status": task.status.value if task else None}
        return _envelope("validation", data, state.project_workspace_id, session_id)
    return _run("validation", build, session_id=session_id)

__all__=["ProjectionExportError","project_truth","session_context","provenance","validation"]
