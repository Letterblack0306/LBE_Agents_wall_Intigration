from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from lbe_guard_inspector.guard_runner import GuardRunner


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return data


def _refs(items: list[dict[str, Any]]) -> list[str]:
    return [str(item.get("ref")) for item in items if item.get("ref")]


def _run_rule(runner: GuardRunner, plan: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    result = runner.run(
        problem=case["problem"],
        workspace_root=plan["target_workspace"],
        workspace_id=plan["workspace_id"],
        pack_id=case["pack_id"],
        rule_id=case["rule_id"],
        reason=f"Deterministic acceptance: {case['rule_id']}",
    )

    package = result["evidence_package"]
    rule_result = result["rule_result"]
    guard_result = result["guard_result"]

    current_workspace_evidence = package.get("current_workspace_evidence") or []
    indexed_reference_evidence = package.get("indexed_reference_evidence") or []
    validation_evidence = package.get("validation_evidence") or []
    contradictions = package.get("contradictions") or []

    status = rule_result.get("status")
    verdict = guard_result.get("verdict")
    errors: list[str] = []

    if status not in case["expected_rule_statuses"]:
        errors.append(
            f"Unexpected rule status {status!r}; expected one of {case['expected_rule_statuses']}"
        )
    if verdict not in case["allowed_verdicts"]:
        errors.append(
            f"Unexpected verdict {verdict!r}; expected one of {case['allowed_verdicts']}"
        )
    if case.get("must_not_verdict") == verdict:
        errors.append(f"Forbidden verdict produced: {verdict}")

    if verdict == "PASS":
        if not current_workspace_evidence:
            errors.append("PASS produced without current workspace evidence")
        if not validation_evidence:
            errors.append("PASS produced without validation evidence")

    if not current_workspace_evidence and verdict in {"PASS", "FAIL"}:
        errors.append(f"{verdict} produced without current workspace evidence")

    if contradictions:
        errors.append(
            "Acceptance target produced contradictions; unrelated workspace evidence may still be leaking"
        )

    return {
        "pack_id": case["pack_id"],
        "rule_id": case["rule_id"],
        "problem": case["problem"],
        "rule_status": status,
        "verdict": verdict,
        "reason": guard_result.get("reason"),
        "current_workspace_evidence_refs": _refs(current_workspace_evidence),
        "indexed_reference_evidence_refs": _refs(indexed_reference_evidence),
        "validation_evidence_refs": _refs(validation_evidence),
        "contradiction_count": len(contradictions),
        "contradictions": contradictions,
        "missing_evidence": package.get("missing_evidence") or [],
        "errors": errors,
    }


def _run_pytest() -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "-q"],
        text=True,
        capture_output=True,
        check=False,
    )
    return {
        "command": f"{sys.executable} -m pytest -q",
        "exit_code": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
        "passed": completed.returncode == 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the deterministic Guard Inspector post-fix acceptance plan."
    )
    parser.add_argument(
        "--plan",
        default="docs/history/legacy-acceptance/post_fix_acceptance_plan.json",
        help="Path to the acceptance plan JSON.",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Skip the final pytest run.",
    )
    args = parser.parse_args()

    plan_path = Path(args.plan).resolve()
    plan = _load_json(plan_path)
    output_path = Path(plan["output_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    runner = GuardRunner()
    results: list[dict[str, Any]] = []
    fatal_errors: list[str] = []

    for case in plan["rules"]:
        try:
            results.append(_run_rule(runner, plan, case))
        except Exception as exc:  # acceptance report must preserve exact failure
            fatal_errors.append(f"{case['rule_id']}: {type(exc).__name__}: {exc}")
            results.append(
                {
                    "pack_id": case["pack_id"],
                    "rule_id": case["rule_id"],
                    "problem": case["problem"],
                    "errors": [fatal_errors[-1]],
                }
            )

    pytest_result = None if args.skip_tests else _run_pytest()
    rule_errors = [
        error
        for result in results
        for error in result.get("errors", [])
    ]

    passed = not fatal_errors and not rule_errors
    if pytest_result is not None:
        passed = passed and pytest_result["passed"]

    report = {
        "plan_id": plan["plan_id"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_workspace": plan["target_workspace"],
        "workspace_id": plan["workspace_id"],
        "read_only": True,
        "passed": passed,
        "results": results,
        "pytest": pytest_result,
        "fatal_errors": fatal_errors,
    }

    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nAcceptance report: {output_path.resolve()}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
