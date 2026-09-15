# Agent.py Baseline Validation — 2026-07-24 *(Historical Baseline)*

> **⚠ This document is a historical baseline from July 24–25, 2026. It is preserved for reference only. See `docs/history/VALIDATION_2026-07-25.md` for the current validation report. Do not use this document as evidence of current pass/fail status.**

## Baseline Snapshot

Pre-change frozen at: `20260724-224102`

| Artifact | Snapshot Path |
|---|---|
| Agent module | `agent.py.baseline-20260724-224102` (30.5 KB, 821 lines) |
| Live DB | `state/workspace.db.baseline-20260724-224102` |
| Backup DB | `state/workspace.backup.db.baseline-20260724-224102` |

Post-change (search-outcome contract) frozen at: `20260724-225045`

| Artifact | Snapshot Path |
|---|---|
| Agent module | `agent.py.baseline-20260724-225045` |

---

## Test Results

All tests passed. The live-DB search test is CPU/IO-bound against network roots and expected to exceed the 30 s command timeout; the 
outcome contract was verified against an isolated temp database instead.

| Surface | Result |
|---|---|
| `py_compile.compile('agent.py')` | PASS — compiles clean |
| Fresh SQLite schema (temp DB) | PASS — baseline `runs` + `files` with `PRAGMA journal_mode=WAL` |
| Live `state/workspace.db` schema | PASS — backward-compatible; extra columns from prior run read fine |
| Live `state/workspace.backup.db` schema | PASS — same `runs` + `files` baseline |
| Database table/row integrity | PASS — 82,537 files, 5.3 GB, 82,386 hashed |
| `Context.load()` | PASS — both `dev` and `mini` roots resolve |
| CLI `roots` | PASS — correct JSON |
| CLI `status` | PASS — reads live DB; extra columns surfaced correctly |
| CLI `trace --resume` flag storage | PASS — `resume_requested=1` persisted in `runs` |
| HTTP server start | PASS — listens on `127.0.0.1:8765` |
| `GET /health` | PASS — `{"status":"ok","mode":"read-only-sqlite","roots":["dev","mini"]}` |
| `GET /roots` | PASS — two roots returned |
| `GET /status` | PASS — 82,537 file_count |
| `migrate_legacy_state` imports | PASS — `open_database`, `utc_now`, `DATABASE_PATH` resolve |
| `server` imports | PASS — `CONFIG_PATH`, `Context`, `GovernanceError`, `database_status`, `inspect_file`, `load_json`, `search_workspace` resolve |
| `search_workspace` callable | PASS — returns dict without exceptions |

### Acceptance Tests — Search Outcome Contract (Temp DB / Fast)

| Test | Expected | Actual | Result |
|---|---|---|---|
| Known query (`hello`) | `matches_found`, `result_count > 0` | `matches_found` 1 | PASS |
| Nonsense query (`nonexistent`) | `no_matches`, `result_count == 0` | `no_matches` 0 | PASS |
| Nonexistent extension (`.xyz`) | `scope_empty`, `result_count == 0` | `scope_empty` 0 | PASS |
| Unavailable database (simulated) | `search_failed`, `search_completed == False` | `search_failed` | PASS |
| CLI `search` API | Returns envelope with `outcome`, `scope`, `execution` | Verified | PASS |
| Backward-compat keys | All previous keys present | 14/14 present | PASS |
| Serialization | `last_search.json` contains envelope | Verified | PASS |

---

## Current Status

| Component | Assessment | Notes |
|---|---|---|
| SQLite migration | **Correct** | Bounded memory; WAL journal; checkpoint commits; incremental hash reuse |
| Safe interruption | **Mostly correct** | `KeyboardInterrupt` commits and writes `trace_progress.json` |
| Incremental restart | **Correct** | Reuses cached hashes when size + mtime are unchanged |
| True positional resume | **Not implemented** | `--resume` restarts from root[0]; does not seek to last checkpoint position |
| Search outcome contract | **Correct after change** | Returns `matches_found`, `no_matches`, `scope_empty`, or `search_failed` |
| Scope-empty vs no-match | **Correct after change** | `files_considered` via COUNT query; `files_searched` (`scanned`) distinguishes empty scope from zero content match |
| Complete reconciliation accounting | **Not implemented** | `files_excluded`, `files_unsupported`, `stored_new`, `stored_updated`, `stored_unchanged` exist in schema but are not incremented in the trace loop |
| Multi-root failure isolation | **Needs improvement** | `Context.load()` raises on missing root; blocks `search` / `status` for offline shares |
| Read-only server endpoints | **Correct** | `GET /health`, `GET /roots`, `GET /status`, `POST /search`, `POST /inspect` |

---

## Known Gaps (Remaining)

1. **`--resume` is an incremental restart, not a positional resume.** Each run starts again from the first configured root 
   and first file. Cached hashes are reused, but traversal does not continue from the interrupted directory/file.

3. **Complete reconciliation accounting** — `files_excluded`, `files_unsupported`, `stored_new`, `stored_updated`, `stored_unchanged` 
   exist in schema but are not incremented in the trace loop.

4. **One unavailable root blocks the entire runtime.** `Context.load()` raises if any configured root is missing or 
   unreadable, preventing even local operations from running when a network share is offline.

5. **Search re-reads source files every time.** SQLite stores metadata and hashes, but not searchable text. Each 
   search opens physical files again; size/hash verification or full-text indexing were not added in this build.

---

## Verdict

**Search outcome contract change is correct and complete.** Preserve the baseline before any further edits. The next 
change should remain limited to coverage; do not touch trace loop counters, skip/resume logic, or governance isolation.
## Audit Controller Status

New module scaffolded: `audit_controller.py`

| Surface | Result |
|---|---|
| `audit_controller.py` compile | PASS |
| `rules/cep.py` compile | PASS |
| `rules/generic.py` compile | PASS |
| `run_audit(pack_ids=['generic'])` | PASS — `outcome: pass`, 2 rules passed |
| CEP rule pack (temp workspace) | PASS — `outcome: pass_with_notes`, 4 rules passed, 1 blocked |
| CLI `packs` | PASS — returns `rules_dir` |
| CLI `audit --pack generic` | PASS — full envelope JSON + `state/audit_report.json` saved |
| Existing `agent.py` imports | PASS — unaffected |
| Existing `server.py` imports | PASS — unaffected |
| Existing `migrate_legacy_state.py` imports | PASS — unaffected |

### Audit Report Contract

```json
{
  "audit_id": "...",
  "started_at": "...",
  "completed_at": "...",
  "project_type": "cep",
  "packs_evaluated": ["generic"],
  "passed": 2,
  "failed": 0,
  "blocked": 0,
  "not_applicable": 0,
  "summary": "pass",
  "results": [
    {
      "rule_id": "generic.index_present",
      "status": "passed",
      "message": "...",
      "evidence": {}
    }
  ],
  "outcome": "pass",
  "audit_completed": true
}
```

## Guard Inspector Evaluation Layer Status

Implemented and validated: `lbe_guard_inspector/guard_inspector.py`, `lbe_guard_inspector/guard_runner.py`, and `lbe_guard_inspector/server.py`.

| Surface | Result |
|---|---|
| `GuardInspector.evaluate()` compiles and imports | PASS |
| `GuardRunner.run()` compiles and imports | PASS |
| Verdict mapping (`passed` / `failed` / `blocked` / `not_applicable`) | PASS |
| `POST /guard-result` endpoint | PASS — accepts `rule_result` + `evidence_package`, returns validated `guard_result` |
| `POST /guard-run` endpoint | PASS — accepts problem + `pack_id` / `rule_id`, executes registered guard, returns full decision context |
| Indexed-only rule downgrade (`generic.index_present`) | PASS — cannot produce `PASS` or `FAIL` |
| Contradiction downgrade for `passed` | PASS — prevents unsupported `PASS` |
| Validation-ref requirement for `PASS` | PASS — missing validation keeps verdict at `INSUFFICIENT_EVIDENCE` |
| Workspace evidence requirement for `PASS` / `FAIL` | PASS — missing workspace evidence downgrades to `INSUFFICIENT_EVIDENCE` |
| `guard_result.schema.json` validation | PASS |
| Full pytest suite | PASS — **48 tests passed** *(historical: July 24-25, 2026 baseline; superseded by current 65-pass validation)* |

### GuardRunner responsibilities

`GuardRunner.run()` performs the complete read-only vertical slice:

1. Creates the `evidence_package` via `EvidenceService.build_evidence_package()`.
2. Selects and executes the registered deterministic rule via `audit_controller.run_rule()`.
3. Independently corroborates workspace evidence via `agent.inspect_file`.
4. Produces the `guard_result` via `GuardInspector.evaluate()`.

### Verdict policy

`GuardInspector` enforces the following evidence-bound verdict policy:

| Rule status | Evidence condition | Verdict |
|---|---|---|
| `passed` | Workspace evidence refs present, no contradictions, validation refs present | `PASS` |
| `passed` | Workspace evidence refs missing, contradictory, or validation missing | `INSUFFICIENT_EVIDENCE` |
| `failed` | Workspace evidence refs present | `FAIL` |
| `failed` | Workspace evidence refs missing | `INSUFFICIENT_EVIDENCE` |
| `blocked` | Any | `INSUFFICIENT_EVIDENCE` |
| `not_applicable` | Any | `NOT_APPLICABLE` |
| Any (index-only rule, e.g. `generic.index_present`) | Any | `INSUFFICIENT_EVIDENCE` |

Indexed-only evidence (e.g. rules that inspect only the SQLite index) cannot produce `PASS` or `FAIL` workspace compliance verdicts.

### Example guard_result

```json
{
  "result_id": "gr-...",
  "guard_id": "cep.manifest_exists",
  "guard_version": null,
  "workspace_id": "cep-project",
  "verdict": "PASS",
  "summary": "PASS: cep.manifest_exists passed and is supported by current workspace evidence.",
  "findings": [],
  "evidence_refs": ["workspace:dev:src/app.js"],
  "validation_refs": ["validation:workspace_corroboration:dev/src/app.js"],
  "governance_state": "READ_ONLY",
  "executed_at": "2026-07-25T00:00:00+00:00"
}
```

### Full pytest suite *(historical — 2026-07-24/25 baseline superseded)*

```text
48 passed in 0.21s
```


## Verdict

**Search outcome contract, audit controller scaffolding, and evidence-bound Guard Inspector evaluation layer are complete.** The full read-only vertical slice (`POST /guard-run`) is implemented and all 48 tests pass. Preserve the baseline before any further edits. The next change should remain limited to coverage; do not touch trace loop counters, skip/resume logic, or governance isolation.
