# Preserved Unused Repository Material

`unused-in-repo/` is a controlled preservation surface for material proven not to
participate in the current canonical repository but retained for future recovery or
review.

This directory is not a deletion bin, archive of unknown material, source tree,
runtime state store, or authority surface. Presence here means only:

```text
UNUSED_BUT_PRESERVED
```

It does not mean permanently disposable. Deletion requires a separate, governed
retention decision after review.

## Required proof before a move

An item may be moved here only when the manifest records proof that it is:

- not imported or called by current source/runtime;
- not required by tests, build, release, governance, active acceptance, or documentation authority;
- not protected user work, runtime/database/state material, an embedded repository, or a deliberate local reference;
- not required at a tool-consumed path; and
- not a duplicate live owner whose canonical replacement is still unproven.

Absence of an import or Markdown link alone is insufficient.

## Protected exclusions

Do not move these here merely because they are outside normal routing:

```text
lbe-tui/
lbe-core/
state/
.lbe/memory/
.env
config*.json
*.before-*
*.baseline-*
*.pre-audit-backup
.git/
worktree metadata
```

See [`MANIFEST.md`](MANIFEST.md) for the required record for every preserved item.
