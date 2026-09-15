# Main-head authority

`main` in the repository's primary working tree is the only authoritative
source of truth. Feature branches, detached HEAD states, and linked Git
worktrees must not be used to validate, commit, push, or release source.

`npm run guard:mainhead` is the repository blocker. It is also executed by the
pre-commit and pre-push hooks. A failure is intentional and must not be
skipped with `--no-verify`.

The public release workflow invokes the same blocker before it builds or
copies an artifact. In CI it accepts detached HEAD only when that commit is
exactly `origin/main`; any other branch, tag-only commit, or linked worktree
blocks the release.

Run this once after cloning to activate the versioned hooks:

```bash
npm run hooks:install
```

The public artifact repository is not a source repository. Its release
workflow receives only the generated `release-public/` tree from main.
