from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from agent import Context, GovernanceError, inspect_file
from audit_controller import AuditError, RuleResult, register_rule

RULE_ID = "cep.callback_contract"
_MAX_FILES = 25
_MAX_FINDINGS = 50
_MAX_SCANNED_FILES = 2_000
_ALLOWED_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
_EXCLUDED_DIRS = {".git", "node_modules", "dist", "build", "coverage", "__pycache__"}


def _rule(ctx: Context, params: dict[str, Any], logic) -> RuleResult:
    try:
        return logic(ctx, params)
    except (GovernanceError, AuditError) as exc:
        return RuleResult(rule_id=RULE_ID, status="blocked", message=str(exc))
    except Exception as exc:  # pragma: no cover - defensive boundary
        return RuleResult(
            rule_id=RULE_ID,
            status="failed",
            message=f"{type(exc).__name__}: {exc}",
        )


def _split_top_level_arguments(source: str) -> list[str]:
    """Split one call argument list without evaluating JavaScript."""
    args: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    escaped = False

    for index, char in enumerate(source):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in {"'", '"', "`"}:
            quote = char
            continue
        if char in "([{":
            depth += 1
            continue
        if char in ")]}":
            depth = max(0, depth - 1)
            continue
        if char == "," and depth == 0:
            args.append(source[start:index].strip())
            start = index + 1

    args.append(source[start:].strip())
    return args


def _extract_evalscript_calls(content: str) -> list[dict[str, Any]]:
    """Return bounded evalScript calls with source positions and arguments."""
    calls: list[dict[str, Any]] = []
    pattern = re.compile(r"\bevalScript\s*\(")

    for match in pattern.finditer(content):
        open_index = content.find("(", match.start())
        depth = 1
        quote: str | None = None
        escaped = False
        close_index: int | None = None

        for index in range(open_index + 1, len(content)):
            char = content[index]
            if quote is not None:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
                continue
            if char in {"'", '"', "`"}:
                quote = char
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    close_index = index
                    break

        if close_index is None:
            continue

        argument_source = content[open_index + 1 : close_index]
        line_start = content.count("\n", 0, match.start()) + 1
        snippet_start = content.rfind("\n", 0, match.start()) + 1
        snippet_end = content.find("\n", close_index)
        if snippet_end < 0:
            snippet_end = len(content)
        calls.append(
            {
                "arguments": _split_top_level_arguments(argument_source),
                "line_start": line_start,
                "snippet": content[snippet_start:snippet_end].strip()[:500],
            }
        )
        if len(calls) >= _MAX_FINDINGS:
            break

    return calls


def _classify_callback(expression: str) -> str:
    """Classify a second argument conservatively from source syntax only."""
    value = expression.strip()
    if not value:
        return "missing"

    lower = value.lower()
    if lower in {"null", "undefined", "true", "false", "nan", "infinity"}:
        return "definitely_invalid"
    if re.fullmatch(r"[-+]?\d+(?:\.\d+)?", value):
        return "definitely_invalid"
    if value.startswith(("'", '"', "`", "{", "[")):
        return "definitely_invalid"
    if re.match(r"^(?:async\s+)?function\b", value):
        return "function"
    if "=>" in value:
        return "function"

    return "unresolved"


def _configured_root_for(ctx: Context, target: Path, roots: list[str]) -> Any:
    selected = set(roots or [])
    for root in ctx.roots:
        if selected and root.name not in selected:
            continue
        try:
            target.relative_to(root.path)
            return root
        except ValueError:
            continue
    raise GovernanceError(f"Workspace root is outside configured knowledge roots: {target}")


def _live_candidates(ctx: Context, params: dict[str, Any]) -> dict[str, Any] | None:
    """Find evalScript candidates from the exact live workspace, not the index."""
    raw_workspace = params.get("workspace_root")
    if not isinstance(raw_workspace, str) or not raw_workspace.strip():
        raise GovernanceError(
            "workspace_root is required for exact CEP callback inspection"
        )

    target = Path(raw_workspace).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        raise GovernanceError(f"Workspace root does not exist or is not a directory: {target}")

    roots = [str(item) for item in (params.get("roots") or [])]
    configured = _configured_root_for(ctx, target, roots)
    max_bytes = int(getattr(ctx, "config", {}).get("max_file_bytes", 5_000_000))
    matches: list[dict[str, Any]] = []
    scanned = 0

    files = sorted(
        (path for path in target.rglob("*") if path.is_file() and not path.is_symlink()),
        key=lambda path: path.relative_to(target).as_posix().lower(),
    )
    for path in files:
        relative_target = path.relative_to(target)
        if any(part in _EXCLUDED_DIRS for part in relative_target.parts):
            continue
        if path.suffix.lower() not in _ALLOWED_EXTENSIONS:
            continue
        if scanned >= _MAX_SCANNED_FILES:
            break
        scanned += 1
        try:
            if path.stat().st_size > max_bytes:
                continue
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "evalScript" not in content:
            continue

        relative_configured = path.relative_to(configured.path).as_posix()
        matches.append({"path": f"{configured.name}/{relative_configured}"})
        if len(matches) >= _MAX_FILES:
            break

    return {
        "outcome": "matches_found" if matches else "no_matches",
        "searched_roots": [configured.name],
        "results": matches,
        "retrieval_source": "bounded_live_workspace_scan",
        "scanned_files": scanned,
        "scan_limit": _MAX_SCANNED_FILES,
        "workspace_root": str(target),
    }


def _candidate_result(ctx: Context, params: dict[str, Any]) -> dict[str, Any]:
    return _live_candidates(ctx, params)


def rule_cep_callback_contract(ctx: Context, params: dict[str, Any]) -> RuleResult:
    """Detect definite non-function callbacks passed to CEP evalScript calls.

    Identifier callbacks are not guessed. They produce a blocked result unless a
    definite invalid callback exists elsewhere in the inspected workspace.
    """
    result = _candidate_result(ctx, params)
    if result.get("outcome") != "matches_found":
        return RuleResult(
            rule_id=RULE_ID,
            status="not_applicable",
            message="No CEP evalScript calls were found in the selected workspace scope.",
            evidence={
                "searched_roots": result.get("searched_roots"),
                "retrieval_source": result.get("retrieval_source"),
                "scanned_files": result.get("scanned_files"),
                "scan_limit": result.get("scan_limit"),
                "read_only": True,
                "bounded": True,
            },
        )

    invalid: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    valid: list[dict[str, Any]] = []
    inspected_paths: list[str] = []

    for item in result.get("results", [])[:_MAX_FILES]:
        path = item.get("path")
        if not isinstance(path, str) or not path:
            continue
        current = inspect_file(ctx, path)
        content = current.get("content") or ""
        inspected_paths.append(path)

        for call in _extract_evalscript_calls(content):
            args = call["arguments"]
            finding = {
                "path": path,
                "hash": current.get("sha256"),
                "line_start": call["line_start"],
                "snippet": call["snippet"],
            }
            if len(args) < 2:
                valid.append({**finding, "classification": "callback_omitted"})
                continue

            callback = args[1]
            classification = _classify_callback(callback)
            finding = {
                **finding,
                "callback_expression": callback[:300],
                "classification": classification,
            }
            if classification == "definitely_invalid":
                invalid.append(finding)
            elif classification == "function":
                valid.append(finding)
            else:
                unresolved.append(finding)

            if len(invalid) + len(unresolved) + len(valid) >= _MAX_FINDINGS:
                break

    evidence = {
        "inspected_paths": inspected_paths,
        "invalid_callbacks": invalid,
        "unresolved_callbacks": unresolved,
        "valid_or_omitted_callbacks": valid,
        "retrieval_source": result.get("retrieval_source", "bounded_live_workspace_scan"),
        "scanned_files": result.get("scanned_files"),
        "scan_limit": result.get("scan_limit"),
        "workspace_root": result.get("workspace_root"),
        "read_only": True,
        "bounded": True,
    }

    if invalid:
        return RuleResult(
            rule_id=RULE_ID,
            status="failed",
            message=f"Found {len(invalid)} evalScript call(s) with a definite non-function callback.",
            evidence=evidence,
        )
    if unresolved:
        return RuleResult(
            rule_id=RULE_ID,
            status="blocked",
            message=(
                "evalScript callback identifiers were found, but their function contracts "
                "cannot be proven from the bounded call-site inspection."
            ),
            evidence=evidence,
            severity="warning",
        )
    if not valid:
        return RuleResult(
            rule_id=RULE_ID,
            status="not_applicable",
            message="Candidate files were found, but no parseable evalScript calls were present.",
            evidence=evidence,
        )

    return RuleResult(
        rule_id=RULE_ID,
        status="passed",
        message="All bounded evalScript call sites omit the callback or use an inline function.",
        evidence=evidence,
    )


register_rule(
    "cep_callback",
    RULE_ID,
    lambda ctx, params: _rule(ctx, params, rule_cep_callback_contract),
)
