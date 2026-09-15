from __future__ import annotations

import copy
import json
import subprocess
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from lbe_guard_inspector.contracts import load_schema
from lbe_guard_inspector.memory import WorkspaceMemoryStore
from lbe_guard_inspector.memory.completion_contracts import TaskCompletionContractPersistence
from lbe_guard_inspector.memory.completion_evidence import TaskCompletionEvidencePersistence
from lbe_guard_inspector.memory.models import SessionState
from lbe_guard_inspector.memory.models import MemoryRecord, MemoryType, SourceType, ValidationStatus
from lbe_guard_inspector.read_only_exports import project_truth, provenance, session_context, validation
from lbe_guard_inspector import product_entry


def repo(tmp_path: Path) -> Path:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=tmp_path, check=True)
    (tmp_path / "tracked.txt").write_text("initial\n", encoding="utf-8")
    subprocess.run(["git", "add", "tracked.txt"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-qm", "initial"], cwd=tmp_path, check=True)
    return tmp_path


def store_for(tmp_path: Path, *, project: str = "workspace-1", session: str = "session-1", mode: str = "coding") -> WorkspaceMemoryStore:
    store = WorkspaceMemoryStore(tmp_path / "state.sqlite")
    store.save_session_state(SessionState(session, project, tmp_path, mode))
    return store


def test_project_truth_success_and_insufficient_evidence(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    good = project_truth(workspace_root=repo(tmp_path))
    assert good["projection_type"] == "project_truth"
    assert good["read_only"] is True
    assert good["data"]["profile_hash"]

    empty = tmp_path / "empty"
    empty.mkdir()
    result = project_truth(workspace_root=repo(empty))
    assert result["data"]["outcome"] == "insufficient_evidence"
    assert result["data"]["missing_evidence"]


def test_session_context_success_nullable_and_ordered_transcript(tmp_path: Path) -> None:
    root = repo(tmp_path)
    store = store_for(root)
    result = session_context(store=store, session_id="session-1")
    assert result["projection_type"] == "session_context"
    assert result["data"]["session"]["session_id"] == "session-1"
    assert result["data"]["task"] is None
    assert result["data"]["checkpoint"] is None
    assert result["data"]["transcript"] == []


def test_provenance_current_and_stale(tmp_path: Path) -> None:
    root = repo(tmp_path)
    store = store_for(root)
    source = root / "source.txt"
    source.write_text("source\n", encoding="utf-8")
    record = MemoryRecord(
        project_workspace_id="workspace-1",
        canonical_workspace_root=root,
        memory_type=MemoryType.WORKSPACE_FACT,
        subject="source",
        predicate="state",
        value="old",
        source_type=SourceType.LIVE_WORKSPACE,
        validation_status=ValidationStatus.STALE,
        confidence=1.0,
        source_path=str(source),
        source_hash="a" * 64,
    )
    store.upsert(record)
    current = provenance(store=store, workspace_id="workspace-1")
    assert current["data"]["staleness"] == "stale"
    stale = provenance(store=store, workspace_id="workspace-1", task_id="task-1")
    assert stale["data"]["staleness"] == "unknown"


def test_validation_reads_persisted_evidence_without_evaluating_completion(tmp_path: Path) -> None:
    root = repo(tmp_path)
    store = store_for(root)
    TaskCompletionContractPersistence(store).save(
        session_id="session-1", task_id="task-1", project_workspace_id="workspace-1",
        canonical_workspace_root=str(root), requirements=[{"requirement_id": "focused", "evidence_kind": "focused_test"}],
    )
    TaskCompletionEvidencePersistence(store).save(
        session_id="session-1", task_id="task-1", project_workspace_id="workspace-1",
        canonical_workspace_root=str(root), evidence_id="e-1", kind="focused_test", status="PASS",
        source="test", producer_id="producer", operation_id="reasoning.inspect", details={"ok": True},
    )
    result = validation(store=store, session_id="session-1", task_id="task-1")
    assert result["data"]["task_id"] == "task-1"
    assert result["data"]["evidence"][0]["evidence_id"] == "e-1"
    assert "completion_verdict" not in result["data"]


def test_identity_mismatch_and_malformed_owner_state_fail_closed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = repo(tmp_path)
    store = store_for(root, project="persisted")
    mismatch = session_context(store=store, session_id="session-1", workspace_id="requested")
    assert mismatch["error"]["code"] == "IDENTITY_MISMATCH"
    monkeypatch.setattr(store, "load_session_state", lambda **_: None)
    malformed = session_context(store=store, session_id="session-1")
    assert malformed["error"]["code"] == "AUTHORITATIVE_STATE_UNAVAILABLE"


def test_deterministic_data_excludes_generated_at(tmp_path: Path) -> None:
    root = repo(tmp_path)
    (root / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    first = project_truth(workspace_root=root)
    second = project_truth(workspace_root=root)
    assert first["data"] == second["data"]
    assert first["generated_at"] != second["generated_at"] or first["generated_at"] == second["generated_at"]
    assert "generated_at" not in first["data"]
    assert json.dumps(first["data"], sort_keys=True) == json.dumps(second["data"], sort_keys=True)


def test_schema_rejection_and_no_mock_fallback(tmp_path: Path) -> None:
    root = repo(tmp_path)
    payload = project_truth(workspace_root=root)
    schema = load_schema("project_truth_projection")
    invalid = copy.deepcopy(payload)
    invalid["unexpected"] = True
    assert list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(invalid))
    assert payload["data"]["outcome"] == "insufficient_evidence"


def test_export_does_not_invoke_providers_tools_validation_or_mutating_rehydrate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = repo(tmp_path)
    (root / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    store = store_for(root)
    monkeypatch.setattr("lbe_guard_inspector.read_only_exports.protected_checkpoint_eligibility", lambda **_: (_ for _ in ()).throw(AssertionError("must not revalidate through a mutating path")))
    monkeypatch.setattr("lbe_guard_inspector.read_only_exports.DEFAULT_VALIDATION_COMMAND_POLICY_CATALOG.find", lambda **_: (_ for _ in ()).throw(AssertionError("must not execute validation")))
    assert not hasattr(__import__("lbe_guard_inspector.read_only_exports", fromlist=["x"]), "provider")
    assert not hasattr(__import__("lbe_guard_inspector.read_only_exports", fromlist=["x"]), "tool")
    assert project_truth(workspace_root=root)["read_only"] is True
    assert session_context(store=store, session_id="session-1")["read_only"] is True
    assert provenance(store=store, workspace_id="workspace-1")["read_only"] is True


def test_owner_state_unchanged_by_session_export(tmp_path: Path) -> None:
    root = repo(tmp_path)
    store = store_for(root)
    before = store.load_session_state(session_id="session-1").as_dict()
    session_context(store=store, session_id="session-1")
    after = store.load_session_state(session_id="session-1").as_dict()
    assert after == before


def test_product_export_command_is_read_only(tmp_path: Path, capsys) -> None:
    root = repo(tmp_path)
    (root / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    assert product_entry.main(["export", "project_truth", "--workspace", str(root)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["projection_type"] == "project_truth"
    assert payload["read_only"] is True
