from __future__ import annotations

import pytest

from lbe_guard_inspector.runtime.completion_gate import CompletionRequirement
from lbe_guard_inspector.runtime.task_completion_policy import (
    DEFAULT_TASK_COMPLETION_POLICY_CATALOG,
    TaskCompletionPolicy,
    TaskCompletionPolicyCatalog,
)


def test_authorized_coding_fix_policy_declares_exact_contract_requirements() -> None:
    policy = DEFAULT_TASK_COMPLETION_POLICY_CATALOG.find(
        operation_id="reasoning.inspect",
        task_class="coding_fix",
        mode="coding",
    )

    assert policy is not None
    assert policy.policy_id == "coding.reasoning.inspect.fix_issue.v1"
    assert policy.requirements == (
        CompletionRequirement("source-change", "source_change"),
        CompletionRequirement("focused-tests", "focused_test"),
        CompletionRequirement("git-state", "git_status"),
    )


def test_unknown_operation_task_class_or_mode_has_no_completion_policy() -> None:
    for operation_id, task_class, mode in (
        ("reasoning.inspect", "coding_fix", "audit"),
        ("reasoning.inspect", "other_coding_task", "coding"),
        ("other.operation", "coding_fix", "coding"),
    ):
        assert DEFAULT_TASK_COMPLETION_POLICY_CATALOG.find(
            operation_id=operation_id,
            task_class=task_class,
            mode=mode,
        ) is None


def test_catalog_rejects_ambiguous_policy_mapping() -> None:
    policy = TaskCompletionPolicy(
        policy_id="one",
        operation_id="reasoning.inspect",
        task_class="coding_fix",
        applicable_mode="coding",
        requirements=(CompletionRequirement("source-change", "source_change"),),
    )
    duplicate_mapping = TaskCompletionPolicy(
        policy_id="two",
        operation_id="reasoning.inspect",
        task_class="coding_fix",
        applicable_mode="coding",
        requirements=(CompletionRequirement("focused-tests", "focused_test"),),
    )

    with pytest.raises(ValueError, match="ambiguous"):
        TaskCompletionPolicyCatalog((policy, duplicate_mapping))
