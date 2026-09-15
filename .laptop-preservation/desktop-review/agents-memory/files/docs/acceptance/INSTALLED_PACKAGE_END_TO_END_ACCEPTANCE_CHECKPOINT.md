# Installed Package End-to-End Acceptance Checkpoint

```text
SLICE: INSTALLED_PACKAGE_END_TO_END_ACCEPTANCE
RESULT: PASS
SOURCE_HEAD: aeb02b1e1d25fd27817bb391aadc3e986633cdc9
ORIGIN_MAIN_AT_TRANSITION: aeb02b1e1d25fd27817bb391aadc3e986633cdc9
WORKTREE: CLEAN EXCEPT FOR PROTECTED UNTRACKED lbe-tui/
PUBLICATION: NOT AUTHORIZED
```

## Acceptance artifact

The package was built from the canonical transition source into an isolated
acceptance area outside the repository:

```text
ACCEPTANCE_ROOT: C:\LBE_ACCEPTANCE\installed-e2e-20260825-1610
PACKAGE: lbe_guard_inspector-2.0.3-py3-none-any.whl
PACKAGE_SHA256: a5be438a6c7953916d5e5119d9f560b38d875c2bf91d3a0c3c42f84787beeff0
PYTHON: 3.14
```

The fresh virtual environment imported `lbe_guard_inspector` only from its
isolated `venv\Lib\site-packages` directory. The installed `lbe` executable
resolved to that same environment. No repository-source import was used for
the installed-path evidence.

## Required evidence

```text
INSTALLED_ENTRYPOINT                         = PASS
INSTALLED_IMPORT_ISOLATION                   = PASS
PERSISTED_SESSION_CREATE_AND_RESTORE        = PASS
PROVIDER_MODEL_IDENTITY                      = PASS
INSTALLED_REGISTRY_FAIL_CLOSED               = PASS
INSTALLED_GOVERNED_CAPABILITY_RECEIPT        = PASS
INSTALLED_DETERMINISTIC_COMPLETION           = PASS
INSTALLED_VERIFIED_PROMOTION                 = PASS
INSTALLED_RECOVERY_RECONSTRUCTION            = PASS
INSTALLED_INTERFACE_SMOKE                    = PASS
FOCUSED_INSTALLED_TESTS                      = PASS
FULL_REGRESSION                              = PASS
```

The installed command surface was exercised through `lbe --help`, session
create/inspect/status/continue, provider selection, and TUI help/launch
surfaces. Session identity, workspace identity, provider, and model remained
persisted across the installed session path and runtime reconstruction.

The installed registry and governed dispatch tests proved:

```text
- invalid registry fields and plaintext credential fields fail closed;
- unavailable/disabled entries project without execution;
- provider-visible capability definitions remain LBE-owned;
- registered capability execution produces correlated receipts/evidence;
- unregistered tools, outside-workspace paths, protected paths, escapes,
  absolute paths, type/hash mismatches, and unauthorized destructive actions
  fail closed;
- physical handler failure produces a FAILED receipt;
- duplicate operation identities do not execute twice;
- arbitrary shell is not exposed as a registered capability.
```

Owner-backed installed integration tests exercised deterministic completion,
verified promotion, persisted completion evidence, recovery reconstruction,
provider/session identity, and the installed Textual projection. No external
provider credential or publication service was required; provider behavior was
validated through the existing configured-provider contract and isolated
test/provider boundaries.

## Validation totals

```text
INSTALLED GOVERNANCE / REGISTRY / ORCHESTRATION: 59 passed
INSTALLED TEXTUAL ACCEPTANCE:                    13 passed
INSTALLED RUNTIME / SESSION / PROVIDER / GATE:  132 passed
FULL REPOSITORY REGRESSION:                     767 passed
GIT DIFF CHECK:                                  PASS
```

The active repository remained unchanged by the isolated acceptance runs.
The untracked `lbe-tui/` directory remained untouched as reference-only
material. The separately preserved session/provider lifecycle artifact also
remained untouched and was not activated by this slice.

## Gate transition

```text
INSTALLED_PACKAGE_END_TO_END_ACCEPTANCE = PASS
LBE-INTENT-INSTALLED-PACKAGE-END-TO-END-ACCEPTANCE-001 = COMPLETE / PASS
COMPLETE_LBE_AGENT_RUNTIME = PASS
PUBLICATION = LOCKED / NOT AUTHORIZED
NEXT PRODUCT SLICE = NOT ACTIVATED
```
