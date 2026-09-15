"""Tests for the R6C authorization resolver."""
from __future__ import annotations

import pytest

from lbe_guard_inspector.runtime.authorization_resolver import (
    AuthorizationDecision,
    AuthorizationRequest,
    AuthorizationVerdict,
    resolve_authorization,
)
from lbe_guard_inspector.runtime.mode_controller import ModeRequest, resolve_mode


def _coding_decision():
    return resolve_mode(
        ModeRequest(
            intent="fix_issue",
            permission="write_allowed",
            runtime_policy="permissive",
        )
    )


def _audit_decision():
    return resolve_mode(
        ModeRequest(
            intent="audit_workspace",
            permission="read_only",
            runtime_policy="permissive",
        )
    )


def _investigation_decision():
    return resolve_mode(
        ModeRequest(
            intent="diagnose_failure",
            permission="write_allowed",
            runtime_policy="permissive",
        )
    )


def test_enabled_capability_is_allowed_without_repeat_confirmation() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(mode_decision=_coding_decision(), capability="propose")
    )
    assert decision.verdict is AuthorizationVerdict.ALLOW


def test_capability_class_not_enabled_escalates() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(mode_decision=_audit_decision(), capability="propose")
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_investigation_write_capability_requires_authority_expansion() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_investigation_decision(),
            capability="test_candidate",
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_explicitly_forbidden_operation_is_denied() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose",
            explicitly_forbidden=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.DENY


def test_workspace_scope_expansion_escalates() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose",
            within_workspace_scope=False,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_unresolved_intent_scope_conflict_escalates() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_audit_decision(),
            capability="inspect",
            intent_scope_conflict=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_unauthorized_destructive_operation_escalates() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose",
            destructive=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_authorized_destructive_operation_does_not_repeat_confirmation() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose",
            destructive=True,
            destructive_authorized=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ALLOW


def test_unauthorized_persistent_policy_change_escalates() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose_rule",
            persistent_policy_change=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE


def test_authorized_persistent_policy_change_is_allowed() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_coding_decision(),
            capability="propose_rule",
            persistent_policy_change=True,
            persistent_policy_authorized=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ALLOW


def test_decision_is_immutable() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(mode_decision=_audit_decision(), capability="inspect")
    )
    assert isinstance(decision, AuthorizationDecision)
    with pytest.raises(AttributeError):
        decision.verdict = AuthorizationVerdict.DENY  # type: ignore[misc]


def test_invalid_capability_is_rejected() -> None:
    with pytest.raises(ValueError):
        AuthorizationRequest(mode_decision=_audit_decision(), capability=" ")


def test_invalid_mode_decision_is_rejected() -> None:
    with pytest.raises(TypeError):
        AuthorizationRequest(mode_decision=object(), capability="inspect")  # type: ignore[arg-type]


def test_invalid_request_type_is_rejected() -> None:
    with pytest.raises(TypeError):
        resolve_authorization(object())  # type: ignore[arg-type]


def test_explicit_approval_allows_in_scope_capability() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_audit_decision(),
            capability="modify",
            approval_granted=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ALLOW


def test_explicit_approval_cannot_expand_scope() -> None:
    decision = resolve_authorization(
        AuthorizationRequest(
            mode_decision=_audit_decision(),
            capability="modify",
            within_workspace_scope=False,
            approval_granted=True,
        )
    )
    assert decision.verdict is AuthorizationVerdict.ESCALATE
