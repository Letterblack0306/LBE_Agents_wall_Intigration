"""LBE-owned completion requirement policy for governed task establishment.

This module declares exact requirement templates only. It neither produces
evidence nor evaluates whether a task is complete.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from .completion_gate import CompletionRequirement, TaskCompletionContract


RuntimeMode = Literal["coding", "audit", "investigation"]


@dataclass(frozen=True)
class TaskCompletionPolicy:
    policy_id: str
    operation_id: str
    task_class: str
    applicable_mode: RuntimeMode
    requirements: tuple[CompletionRequirement, ...]

    def __post_init__(self) -> None:
        for name in ("policy_id", "operation_id", "task_class"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} must be a non-empty string")
            object.__setattr__(self, name, value.strip())
        if self.applicable_mode not in {"coding", "audit", "investigation"}:
            raise ValueError("applicable_mode must be a supported runtime mode")
        if not self.requirements:
            raise ValueError("task completion policy requires at least one requirement")
        if not all(isinstance(item, CompletionRequirement) for item in self.requirements):
            raise TypeError("task completion policy requirements must be CompletionRequirement")
        TaskCompletionContract(requirements=self.requirements)

    def contract(self) -> TaskCompletionContract:
        return TaskCompletionContract(requirements=self.requirements)


class TaskCompletionPolicyCatalog:
    """Fixed LBE policy data; unknown mappings intentionally return no policy."""

    def __init__(self, policies: Sequence[TaskCompletionPolicy]) -> None:
        by_id: dict[str, TaskCompletionPolicy] = {}
        by_mapping: dict[tuple[str, str, RuntimeMode], TaskCompletionPolicy] = {}
        for policy in policies:
            if not isinstance(policy, TaskCompletionPolicy):
                raise TypeError("task completion policies must be TaskCompletionPolicy")
            if policy.policy_id in by_id:
                raise ValueError(f"duplicate task completion policy ID: {policy.policy_id}")
            mapping = (policy.operation_id, policy.task_class, policy.applicable_mode)
            if mapping in by_mapping:
                raise ValueError(f"ambiguous task completion policy mapping: {mapping}")
            by_id[policy.policy_id] = policy
            by_mapping[mapping] = policy
        self._by_mapping = by_mapping

    def find(
        self,
        *,
        operation_id: str,
        task_class: str,
        mode: RuntimeMode,
    ) -> TaskCompletionPolicy | None:
        return self._by_mapping.get((operation_id.strip(), task_class.strip(), mode))


DEFAULT_TASK_COMPLETION_POLICY_CATALOG = TaskCompletionPolicyCatalog((
    TaskCompletionPolicy(
        policy_id="coding.reasoning.inspect.fix_issue.v1",
        operation_id="reasoning.inspect",
        task_class="coding_fix",
        applicable_mode="coding",
        requirements=(
            CompletionRequirement("source-change", "source_change"),
            CompletionRequirement("focused-tests", "focused_test"),
            CompletionRequirement("git-state", "git_status"),
        ),
    ),
))
