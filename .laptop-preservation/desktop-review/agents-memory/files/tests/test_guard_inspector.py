from __future__ import annotations

import pytest

from lbe_guard_inspector.contracts import ContractValidationError, validate_contract
from lbe_guard_inspector.guard_inspector import (
    DEFAULT_INDEX_ONLY_RULE_IDS,
    EvidencePolicy,
    GuardInspector,
    VERDICT_FAIL,
    VERDICT_INSUFFICIENT_EVIDENCE,
    VERDICT_NOT_APPLICABLE,
    VERDICT_PASS,
    coerce_rule_result,
)


def _ws(ref: str = "workspace:ws:src/app.js"):
    return {
        "ref": ref,
        "source_type": "workspace",
        "authority": 2,
        "verified": True,
        "classification": "current_workspace",
    }


def _val(ref: str = "validation:check:1"):
    return {
        "ref": ref,
        "source_type": "validation",
        "authority": 5,
        "verified": True,
        "classification": "validation",
    }


def _idx(ref: str = "index:dev:src/app.js", hash_: str = "idx-hash"):
    return {
        "ref": ref,
        "source_type": "index",
        "authority": 6,
        "verified": False,
        "classification": "indexed_reference",
        "hash": hash_,
    }


def _package(
    *,
    workspace=None,
    validation=None,
    indexed=None,
    contradictions=None,
    gaps=None,
    workspace_id: str = "ws",
):
    return {
        "package_id": "ep-1",
        "task_id": "task-1",
        "query": "q",
        "workspace_id": workspace_id,
        "indexed_reference_evidence": indexed if indexed is not None else [],
        "current_workspace_evidence": workspace if workspace is not None else [],
        "validation_evidence": validation if validation is not None else [],
        "contradictions": contradictions or [],
        "missing_evidence": gaps or [],
        "generated_at": "2026-07-25T00:00:00+00:00",
    }


def _rule(status: str, rule_id: str = "cep.manifest_exists", message: str = "m", evidence=None):
    return {
        "rule_id": rule_id,
        "status": status,
        "message": message,
        "evidence": evidence or {},
    }


# --- coerce_rule_result ---------------------------------------------------

def test_coerce_accepts_dict() -> None:
    r = coerce_rule_result({"rule_id": "x", "status": "passed", "message": "ok"})
    assert r.rule_id == "x"
    assert r.status == "passed"


def test_coerce_accepts_attribute_object() -> None:
    class R:
        rule_id = "x"
        status = "failed"
        message = "no"
        evidence = {"a": 1}

    r = coerce_rule_result(R())
    assert r.status == "failed"
    assert r.evidence == {"a": 1}


def test_coerce_rejects_invalid_status() -> None:
    with pytest.raises(ValueError):
        coerce_rule_result({"rule_id": "x", "status": "bogus"})


def test_coerce_rejects_missing_rule_id() -> None:
    with pytest.raises(ValueError):
        coerce_rule_result({"rule_id": "", "status": "passed"})


# --- verdict mapping ------------------------------------------------------

def test_passed_with_workspace_and_validation_is_pass() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_PASS
    assert r["evidence_refs"] == ["workspace:ws:src/app.js"]
    assert r["validation_refs"] == ["validation:check:1"]
    assert r["governance_state"] == "READ_ONLY"


def test_failed_with_workspace_is_fail() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("failed"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_FAIL
    assert r["evidence_refs"] == ["workspace:ws:src/app.js"]
    assert r["governance_state"] == "READ_ONLY"


def test_blocked_is_insufficient_evidence() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("blocked"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE
    assert r["governance_state"] == "INCOMPLETE"


def test_not_applicable_passes_through() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("not_applicable"),
        evidence_package=_package(workspace=[_ws()]),
    )
    assert r["verdict"] == VERDICT_NOT_APPLICABLE


# --- indexed-only safeguards ---------------------------------------------

def test_index_only_rule_cannot_pass_even_with_workspace_evidence() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed", rule_id="generic.index_present"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE


def test_index_only_rule_cannot_fail_even_with_workspace_evidence() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("failed", rule_id="generic.index_present"),
        evidence_package=_package(workspace=[_ws()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE


def test_passed_without_workspace_evidence_is_insufficient() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(workspace=[], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE


def test_failed_without_workspace_evidence_is_insufficient() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("failed"),
        evidence_package=_package(workspace=[], indexed=[_idx()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE
    assert r["evidence_refs"] == []


# --- contradictions / validation ------------------------------------------

def test_contradictions_prevent_pass() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(
            workspace=[_ws()],
            validation=[_val()],
            contradictions=["stale-indexed-hash at src/app.js"],
        ),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE
    assert any("contradiction" in f for f in r["findings"])


def test_missing_validation_prevents_pass() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(workspace=[_ws()], validation=[]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE


def test_fail_does_not_require_validation_refs() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("failed"),
        evidence_package=_package(workspace=[_ws()], validation=[]),
    )
    assert r["verdict"] == VERDICT_FAIL


# --- contract / shape -----------------------------------------------------

def test_guard_result_validates_against_schema_for_pass() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(
            workspace=[_ws("workspace:ws:a.js"), _ws("workspace:ws:b.js")],
            validation=[_val()],
        ),
    )
    assert r["guard_id"] == "cep.manifest_exists"
    assert r["result_id"].startswith("gr-")
    assert "executed_at" in r
    assert r["evidence_refs"] == ["workspace:ws:a.js", "workspace:ws:b.js"]


def test_guard_id_override() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
        guard_id="custom-guard",
    )
    assert r["guard_id"] == "custom-guard"


def test_pass_contract_rejects_missing_validation_refs() -> None:
    with pytest.raises(ContractValidationError):
        validate_contract(
            "guard_result",
            {
                "result_id": "r",
                "guard_id": "g",
                "verdict": "PASS",
                "summary": "s",
                "findings": [],
                "evidence_refs": ["x"],
                "validation_refs": [],
                "governance_state": "READ_ONLY",
                "executed_at": "2026-07-25T00:00:00+00:00",
            },
        )


def test_evidence_refs_are_workspace_refs_not_indexed() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed"),
        evidence_package=_package(
            workspace=[_ws("workspace:ws:a.js")],
            validation=[_val()],
            indexed=[_idx("index:dev:a.js")],
        ),
    )
    assert r["evidence_refs"] == ["workspace:ws:a.js"]
    assert "index:dev:a.js" not in r["evidence_refs"]


def test_custom_policy_can_mark_rule_index_only() -> None:
    policy = EvidencePolicy(index_only_rule_ids=frozenset({"my.index_rule"}))
    r = GuardInspector(policy=policy).evaluate(
        rule_result=_rule("passed", rule_id="my.index_rule"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert r["verdict"] == VERDICT_INSUFFICIENT_EVIDENCE


def test_default_index_only_set_contains_generic_index_present() -> None:
    assert "generic.index_present" in DEFAULT_INDEX_ONLY_RULE_IDS


def test_index_only_finding_documented() -> None:
    r = GuardInspector().evaluate(
        rule_result=_rule("passed", rule_id="generic.index_present"),
        evidence_package=_package(workspace=[_ws()], validation=[_val()]),
    )
    assert any(
        "index" in f.lower() and "workspace compliance" in f.lower()
        for f in r["findings"]
    )
