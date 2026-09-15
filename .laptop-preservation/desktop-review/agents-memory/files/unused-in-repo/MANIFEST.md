# `unused-in-repo/` Preservation Manifest

Status: **CANONICAL PRESERVATION REGISTER**

This manifest records material moved out of the live repository surface only after
evidence proves that it does not participate in the current canonical project.
It is a recovery and review index, not a declaration that the content may be deleted.

## Lookup order

```text
canonical project
    -> this manifest
    -> historical/reference repositories
    -> deeper filesystem discovery only when still unresolved
```

## Move requirements

Every entry must include all fields below before the move is staged:

```text
ORIGINAL_PATH
CURRENT_PATH
CLASSIFICATION: UNUSED_BUT_PRESERVED
WHY_UNUSED
REFERENCE_SCAN
IMPORT/CONSUMER_SCAN
GIT_STATUS
OWNER_BEFORE_MOVE
MOVE_COMMIT
DATE
RESTORE_NOTES
```

The required negative proof is explicit: no current source import, runtime call,
test dependency, build/release dependency, governance dependency, active acceptance
dependency, documentation-authority dependency, tool-path dependency, protected-user
ownership, runtime/database/state role, embedded-repository role, or deliberate local
reference role.

`UNREFERENCED` is not `UNUSED`; `UNUSED` is not `DISPOSABLE`; and `DISPOSABLE` is
not automatic permission to delete.

## Entries

No items are currently registered. No material has been moved by this change.
