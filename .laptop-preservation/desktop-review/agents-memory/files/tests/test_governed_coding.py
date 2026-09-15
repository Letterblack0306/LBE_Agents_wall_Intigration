from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import agent
import pytest

from lbe_guard_inspector.runtime.governed_coding import (
    _provider_tool_definition,
    _tool_id_for_provider_name,
    build_git_commit_staged_handler,
    build_git_stage_paths_handler,
    build_process_run_registered_handler,
    build_workspace_create_candidate_text_handler,
    build_workspace_write_text_handler,
    git_commit_staged_spec,
    git_stage_paths_spec,
    process_run_registered_spec,
    workspace_create_candidate_text_spec,
    workspace_write_text_spec,
    build_workspace_patch_handler,
    workspace_patch_spec,
)
from lbe_guard_inspector.runtime.mode_controller import ModeDecision
from lbe_guard_inspector.runtime.tool_orchestration import (
    GovernedToolOrchestrator,
    ToolExecutionContext,
    ToolReceiptStatus,
    ToolRegistry,
    ToolRequest,
)


def _configure_runtime_files(
    tmp_path: Path,
    monkeypatch,
    *,
    allowed_write_paths=(".",),
    forbidden_globs=(),
    max_changed_files=1,
    max_patch_bytes=4096,
) -> Path:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    config = tmp_path / "config.json"
    governance = tmp_path / "governance.json"
    config.write_text(
        json.dumps({"knowledge_roots": [{"name": "project-1", "path": str(workspace)}]}),
        encoding="utf-8",
    )
    governance.write_text(
        json.dumps(
            {
                "allowed_read_paths": ["."],
                "allowed_write_paths": list(allowed_write_paths),
                "forbidden_globs": list(forbidden_globs),
                "max_changed_files": max_changed_files,
                "max_patch_bytes": max_patch_bytes,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(agent, "CONFIG_PATH", config)
    monkeypatch.setattr(agent, "GOVERNANCE_PATH", governance)
    return workspace


def _context(workspace: Path, *capabilities: str) -> ToolExecutionContext:
    return ToolExecutionContext(
        mode_decision=ModeDecision(
            mode="coding",
            allowed_behaviors=("development_mode_capabilities",),
            capabilities=capabilities or ("test_candidate",),
            rationale="test",
        ),
        workspace_id="project-1",
        workspace_root=workspace,
        configured_root_id="project-1",
    )


def _orchestrator() -> GovernedToolOrchestrator:
    registry = ToolRegistry()
    registry.register(workspace_create_candidate_text_spec(), build_workspace_create_candidate_text_handler())
    return GovernedToolOrchestrator(registry=registry)


def test_create_candidate_text_executes_once_and_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    orchestrator = _orchestrator()
    request = ToolRequest(
        operation_id="op-create-1",
        tool_id="workspace.create_candidate_text",
        arguments={"path": "candidate.txt", "content": "governed\n"},
        context=_context(workspace),
    )
    first = orchestrator.invoke(request)
    second = orchestrator.invoke(request)
    assert first.status is ToolReceiptStatus.EXECUTED
    assert second is first
    assert first.authorization is not None
    assert first.authorization.verdict.value == "ALLOW"
    assert first.output["created"] is True
    assert first.output["path"] == "candidate.txt"
    assert first.output["sha256"]
    assert (workspace / "candidate.txt").read_text(encoding="utf-8") == "governed\n"


def test_create_candidate_text_never_overwrites_existing_file(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    target = workspace / "candidate.txt"
    target.write_text("original", encoding="utf-8")
    receipt = _orchestrator().invoke(
        ToolRequest(
            operation_id="op-create-existing",
            tool_id="workspace.create_candidate_text",
            arguments={"path": "candidate.txt", "content": "replacement"},
            context=_context(workspace),
        )
    )
    assert receipt.status is ToolReceiptStatus.FAILED
    assert receipt.error_code == "TOOL_EXECUTION_FAILED"
    assert "already exists" in receipt.error_message
    assert target.read_text(encoding="utf-8") == "original"


def test_create_candidate_text_respects_allowed_write_paths(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch, allowed_write_paths=())
    receipt = _orchestrator().invoke(
        ToolRequest(
            operation_id="op-denied-path",
            tool_id="workspace.create_candidate_text",
            arguments={"path": "candidate.txt", "content": "blocked"},
            context=_context(workspace),
        )
    )
    assert receipt.status is ToolReceiptStatus.FAILED
    assert receipt.error_code == "TOOL_EXECUTION_FAILED"
    assert "write path is not allowed" in receipt.error_message
    assert not (workspace / "candidate.txt").exists()


def test_create_candidate_text_respects_patch_limit(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch, max_patch_bytes=3)
    receipt = _orchestrator().invoke(
        ToolRequest(
            operation_id="op-too-large",
            tool_id="workspace.create_candidate_text",
            arguments={"path": "candidate.txt", "content": "four"},
            context=_context(workspace),
        )
    )
    assert receipt.status is ToolReceiptStatus.FAILED
    assert receipt.error_code == "TOOL_EXECUTION_FAILED"
    assert "max_patch_bytes" in receipt.error_message
    assert not (workspace / "candidate.txt").exists()


def test_provider_tool_schema_and_reverse_mapping_are_lbe_owned() -> None:
    spec = workspace_create_candidate_text_spec()
    definition = _provider_tool_definition(0, spec)
    assert definition["function"]["name"] == "lbe_0_workspace_create_candidate_text"
    assert _tool_id_for_provider_name(definition["function"]["name"], (spec,)) == spec.tool_id
    with pytest.raises(ValueError, match="unregistered tool"):
        _tool_id_for_provider_name("shell.execute", (spec,))


def _write_orchestrator() -> GovernedToolOrchestrator:
    registry = ToolRegistry()
    registry.register(workspace_write_text_spec(), build_workspace_write_text_handler())
    return GovernedToolOrchestrator(registry=registry)


def test_workspace_write_text_creates_new_file_with_receipt(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    receipt = _write_orchestrator().invoke(
        ToolRequest(
            operation_id="write-new",
            tool_id="workspace.write_text",
            arguments={"path": "new.txt", "content": "new\n"},
            context=_context(workspace, "modify"),
        )
    )
    assert receipt.status is ToolReceiptStatus.EXECUTED
    assert receipt.output["created"] is True
    assert receipt.output["updated"] is False
    assert (workspace / "new.txt").read_text(encoding="utf-8") == "new\n"
    assert receipt.evidence[0]["verified"] is True


def test_workspace_write_text_requires_current_hash_for_existing_file(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    target = workspace / "existing.txt"
    target.write_text("before", encoding="utf-8")
    receipt = _write_orchestrator().invoke(
        ToolRequest(
            operation_id="write-no-hash",
            tool_id="workspace.write_text",
            arguments={"path": "existing.txt", "content": "after"},
            context=_context(workspace, "modify"),
        )
    )
    assert receipt.status is ToolReceiptStatus.FAILED
    assert "expected_sha256 is required" in receipt.error_message
    assert target.read_text(encoding="utf-8") == "before"


def test_workspace_write_text_denies_stale_overwrite_and_accepts_exact_hash(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    target = workspace / "existing.txt"
    target.write_text("before", encoding="utf-8")
    before_hash = hashlib.sha256(b"before").hexdigest()
    stale = _write_orchestrator().invoke(
        ToolRequest(
            operation_id="write-stale",
            tool_id="workspace.write_text",
            arguments={"path": "existing.txt", "content": "after", "expected_sha256": "0" * 64},
            context=_context(workspace, "modify"),
        )
    )
    assert stale.status is ToolReceiptStatus.FAILED
    assert "stale overwrite denied" in stale.error_message
    assert target.read_text(encoding="utf-8") == "before"

    exact = _write_orchestrator().invoke(
        ToolRequest(
            operation_id="write-exact",
            tool_id="workspace.write_text",
            arguments={"path": "existing.txt", "content": "after", "expected_sha256": before_hash},
            context=_context(workspace, "modify"),
        )
    )
    assert exact.status is ToolReceiptStatus.EXECUTED
    assert exact.output["updated"] is True
    assert exact.output["before_sha256"] == before_hash
    assert target.read_text(encoding="utf-8") == "after"


def _patch_orchestrator() -> GovernedToolOrchestrator:
    registry = ToolRegistry()
    registry.register(workspace_patch_spec(), build_workspace_patch_handler())
    return GovernedToolOrchestrator(registry=registry)


def test_workspace_patch_requires_exact_hash_and_records_unified_diff(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    target = workspace / "existing.txt"
    target.write_text("before\n", encoding="utf-8")
    before_hash = hashlib.sha256(target.read_bytes()).hexdigest()

    stale = _patch_orchestrator().invoke(ToolRequest(
        operation_id="patch-stale",
        tool_id="workspace.patch",
        arguments={"path": "existing.txt", "content": "after\n", "expected_sha256": "0" * 64},
        context=_context(workspace, "modify"),
    ))
    assert stale.status is ToolReceiptStatus.FAILED
    assert "stale overwrite denied" in stale.error_message
    assert target.read_text(encoding="utf-8") == "before\n"

    applied = _patch_orchestrator().invoke(ToolRequest(
        operation_id="patch-exact",
        tool_id="workspace.patch",
        arguments={"path": "existing.txt", "content": "after\n", "expected_sha256": before_hash},
        context=_context(workspace, "modify"),
    ))
    assert applied.status is ToolReceiptStatus.EXECUTED
    assert applied.output["updated"] is True
    assert "-before" in applied.output["patch"]
    assert "+after" in applied.output["patch"]
    assert applied.evidence[0]["metadata"]["tool_id"] == "workspace.patch"


def test_workspace_patch_rejects_escape_before_preimage_read(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    outside = tmp_path / "outside.txt"
    outside.write_text("must remain", encoding="utf-8")
    receipt = _patch_orchestrator().invoke(ToolRequest(
        operation_id="patch-escape",
        tool_id="workspace.patch",
        arguments={"path": "../outside.txt", "content": "changed", "expected_sha256": "0" * 64},
        context=_context(workspace, "modify"),
    ))
    assert receipt.status is ToolReceiptStatus.FAILED
    assert outside.read_text(encoding="utf-8") == "must remain"


def test_registered_process_catalog_rejects_arbitrary_shell(tmp_path: Path) -> None:
    registry = ToolRegistry()
    registry.register(process_run_registered_spec(), build_process_run_registered_handler())
    orchestrator = GovernedToolOrchestrator(registry=registry)
    allowed = orchestrator.invoke(
        ToolRequest(
            operation_id="process-version",
            tool_id="process.run_registered",
            arguments={"command_id": "python.version"},
            context=_context(tmp_path, "inspect"),
        )
    )
    assert allowed.status is ToolReceiptStatus.EXECUTED
    assert allowed.output["command_id"] == "python.version"
    assert allowed.output["argv"]

    denied = orchestrator.invoke(
        ToolRequest(
            operation_id="process-shell",
            tool_id="process.run_registered",
            arguments={"command_id": "shell.execute"},
            context=_context(tmp_path, "inspect"),
        )
    )
    assert denied.status is ToolReceiptStatus.FAILED
    assert "not registered" in denied.error_message


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def _init_main_repo(workspace: Path) -> None:
    if shutil.which("git") is None:
        pytest.skip("git is unavailable")
    init = _git("init", "-b", "main", cwd=workspace)
    if init.returncode != 0:
        fallback = _git("init", cwd=workspace)
        assert fallback.returncode == 0
        branch = _git("checkout", "-b", "main", cwd=workspace)
        assert branch.returncode == 0
    assert _git("config", "user.name", "LBE Test", cwd=workspace).returncode == 0
    assert _git("config", "user.email", "lbe-test@example.invalid", cwd=workspace).returncode == 0


def test_git_mutation_is_main_only_and_limited_to_governed_paths(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    _init_main_repo(workspace)
    target = workspace / "tracked.txt"
    target.write_text("before", encoding="utf-8")
    assert _git("add", "tracked.txt", cwd=workspace).returncode == 0
    assert _git("commit", "-m", "baseline", cwd=workspace).returncode == 0

    governed_paths: set[str] = set()
    registry = ToolRegistry()
    registry.register(workspace_write_text_spec(), build_workspace_write_text_handler())
    registry.register(git_stage_paths_spec(), build_git_stage_paths_handler(lambda: frozenset(governed_paths)))
    registry.register(git_commit_staged_spec(), build_git_commit_staged_handler(lambda: frozenset(governed_paths)))
    orchestrator = GovernedToolOrchestrator(registry=registry)

    before_hash = hashlib.sha256(b"before").hexdigest()
    write_receipt = orchestrator.invoke(
        ToolRequest(
            operation_id="git-write",
            tool_id="workspace.write_text",
            arguments={"path": "tracked.txt", "content": "after", "expected_sha256": before_hash},
            context=_context(workspace, "modify"),
        )
    )
    assert write_receipt.status is ToolReceiptStatus.EXECUTED
    governed_paths.add("tracked.txt")

    foreign = workspace / "foreign.txt"
    foreign.write_text("do not stage", encoding="utf-8")
    foreign_stage = orchestrator.invoke(
        ToolRequest(
            operation_id="git-foreign-stage",
            tool_id="git.stage_paths",
            arguments={"paths_json": json.dumps(["foreign.txt"])},
            context=_context(workspace, "modify"),
        )
    )
    assert foreign_stage.status is ToolReceiptStatus.FAILED
    assert "limited to paths mutated" in foreign_stage.error_message

    stage = orchestrator.invoke(
        ToolRequest(
            operation_id="git-stage",
            tool_id="git.stage_paths",
            arguments={"paths_json": json.dumps(["tracked.txt"])},
            context=_context(workspace, "modify"),
        )
    )
    assert stage.status is ToolReceiptStatus.EXECUTED
    assert stage.output["staged_paths"] == ["tracked.txt"]

    commit = orchestrator.invoke(
        ToolRequest(
            operation_id="git-commit",
            tool_id="git.commit_staged",
            arguments={"message": "governed change"},
            context=_context(workspace, "modify"),
        )
    )
    assert commit.status is ToolReceiptStatus.EXECUTED
    assert len(commit.output["commit"]) == 40
    assert commit.output["committed_paths"] == ["tracked.txt"]


def test_git_mutation_rejects_non_main_branch(tmp_path: Path, monkeypatch) -> None:
    workspace = _configure_runtime_files(tmp_path, monkeypatch)
    _init_main_repo(workspace)
    assert _git("checkout", "-b", "feature", cwd=workspace).returncode == 0
    governed_paths = frozenset({"file.txt"})
    registry = ToolRegistry()
    registry.register(git_stage_paths_spec(), build_git_stage_paths_handler(lambda: governed_paths))
    receipt = GovernedToolOrchestrator(registry=registry).invoke(
        ToolRequest(
            operation_id="git-feature",
            tool_id="git.stage_paths",
            arguments={"paths_json": json.dumps(["file.txt"])},
            context=_context(workspace, "modify"),
        )
    )
    assert receipt.status is ToolReceiptStatus.FAILED
    assert "canonical main" in receipt.error_message
