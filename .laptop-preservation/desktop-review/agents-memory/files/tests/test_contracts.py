from datetime import datetime, timezone

import pytest

from lbe_guard_inspector.contracts import ContractValidationError, validate_contract


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_task_record_valid() -> None:
    payload = {
        "task_id": "task-1",
        "problem": "Provided callback is not a function",
        "workspace_id": None,
        "workspace_root": None,
        "mode": "inspect",
        "write_allowed": False,
        "constraints": [],
        "created_at": now(),
    }
    assert validate_contract("task_record", payload)["task_id"] == "task-1"


def test_task_record_rejects_write_field_drift() -> None:
    payload = {
        "task_id": "task-1",
        "problem": "test",
        "workspace_id": None,
        "workspace_root": None,
        "mode": "inspect",
        "write_allowed": False,
        "constraints": [],
        "created_at": now(),
        "unexpected": True,
    }
    with pytest.raises(ContractValidationError):
        validate_contract("task_record", payload)


def test_guard_result_pass_requires_validation() -> None:
    payload = {
        "result_id": "result-1",
        "guard_id": "example-guard",
        "guard_version": "1.0.0",
        "workspace_id": "workspace-1",
        "verdict": "PASS",
        "summary": "Passed",
        "findings": [],
        "evidence_refs": ["workspace:file:a.js"],
        "validation_refs": [],
        "governance_state": "READ_ONLY",
        "executed_at": now(),
    }
    with pytest.raises(ContractValidationError):
        validate_contract("guard_result", payload)
