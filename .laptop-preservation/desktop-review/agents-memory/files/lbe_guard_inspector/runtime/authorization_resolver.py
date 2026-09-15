"""Deterministic authorization resolver for R6C.

This layer decides whether a requested capability is already within delegated
runtime authority. It does not execute tools, mutate the workspace, or create
new policy.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .mode_controller import ModeDecision


class AuthorizationVerdict(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    ESCALATE = "ESCALATE"


@dataclass(frozen=True)
class AuthorizationRequest:
    mode_decision: ModeDecision
    capability: str
    within_workspace_scope: bool = True
    explicitly_forbidden: bool = False
    destructive: bool = False
    destructive_authorized: bool = False
    persistent_policy_change: bool = False
    persistent_policy_authorized: bool = False
    intent_scope_conflict: bool = False
    approval_granted: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.mode_decision, ModeDecision):
            raise TypeError("mode_decision must be a ModeDecision")
        if not isinstance(self.capability, str) or not self.capability.strip():
            raise ValueError("capability must be a non-empty string")


@dataclass(frozen=True)
class AuthorizationDecision:
    verdict: AuthorizationVerdict
    capability: str
    rationale: str


def resolve_authorization(request: AuthorizationRequest) -> AuthorizationDecision:
    """Resolve existing delegated authority as ALLOW, DENY, or ESCALATE.

    ALLOW means the active typed mode already delegates the capability for the
    requested scope. DENY is reserved for an explicitly forbidden operation.
    ESCALATE means the operation would expand or conflict with current authority.
    """
    if not isinstance(request, AuthorizationRequest):
        raise TypeError("request must be an AuthorizationRequest")

    capability = request.capability.strip()

    if request.explicitly_forbidden:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.DENY,
            capability=capability,
            rationale="Operation is explicitly forbidden by active policy.",
        )

    if request.approval_granted:
        if not request.within_workspace_scope:
            return AuthorizationDecision(
                verdict=AuthorizationVerdict.ESCALATE,
                capability=capability,
                rationale="Approval cannot expand beyond the active workspace scope.",
            )
        if request.intent_scope_conflict:
            return AuthorizationDecision(
                verdict=AuthorizationVerdict.ESCALATE,
                capability=capability,
                rationale="Approval cannot resolve an unresolved intent or scope conflict.",
            )
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ALLOW,
            capability=capability,
            rationale="Explicit Agent Wall approval authorizes this operation.",
        )

    if capability not in request.mode_decision.capabilities:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ESCALATE,
            capability=capability,
            rationale=(
                f"Capability '{capability}' is not enabled by "
                f"{request.mode_decision.mode} mode policy."
            ),
        )

    if not request.within_workspace_scope:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ESCALATE,
            capability=capability,
            rationale="Operation expands beyond the active workspace scope.",
        )

    if request.intent_scope_conflict:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ESCALATE,
            capability=capability,
            rationale="Operation has unresolved intent or scope conflict.",
        )

    if request.destructive and not request.destructive_authorized:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ESCALATE,
            capability=capability,
            rationale="Destructive operation exceeds delegated authority.",
        )

    if request.persistent_policy_change and not request.persistent_policy_authorized:
        return AuthorizationDecision(
            verdict=AuthorizationVerdict.ESCALATE,
            capability=capability,
            rationale="Persistent policy change is not already delegated.",
        )

    return AuthorizationDecision(
        verdict=AuthorizationVerdict.ALLOW,
        capability=capability,
        rationale="Capability is already authorized by the active runtime policy.",
    )
