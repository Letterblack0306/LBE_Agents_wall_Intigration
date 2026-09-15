# What We Missed

> **Critical engineering note:** Read this before changing release, governance, agent, adapter, execution, or packaging behavior.

The central mistake was treating LBE as a package, CLI, and documentation system before making it the **mandatory execution boundary**.

## 1. Governance was advisory, not enforced

Agents could still call file, shell, GitHub, npm, release, and deployment tools directly.

```text
Agent acts
→ files change
→ tests/npm/release gates detect damage later
```

Required model:

```text
Agent proposes
→ LBE validates intent, scope, policy and capability
→ ALLOW / DENY / APPROVAL_REQUIRED
→ approved adapter executes
→ audit proof is written
```

## 2. Intent existed only as labels

There were action names such as `write_file` or `run_shell`, but no complete chain:

```text
user instruction
→ durable intent
→ policy proposal
→ approval
→ enforcement
→ proof
```

## 3. Issue scope was not permission

Agents could add unrelated files to the changelog and make the documentation appear valid.

The correct rule is:

```text
Documented file ≠ approved file
```

A changed file must also belong to the active issue’s `allowedFiles`.

## 4. Removed features had no negative memory

Agents interpreted intentionally removed features as missing bugs and restored them.

Needed feature states:

- `ACTIVE`
- `PLANNED`
- `DEPRECATED`
- `REMOVED`
- `BLOCKED`
- `UNKNOWN`

A `REMOVED` feature must not return without explicit user approval.

## 5. Agent discovery was incomplete

Governance rules existed, but agents did not reliably discover them on workspace entry.

Needed workspace boundary:

```text
workspace detected
→ read LBE contract
→ read active issue
→ read feature ledger
→ submit intent before acting
```

## 6. Direct adapter access remained possible

The architecture said “Agents propose, controller decides, adapters execute,” but adapters were not structurally private.

Agents must never receive direct adapter or execution handles.

## 7. Decision authenticity was incomplete

A plain result such as:

```json
{ "allowed": true }
```

is not enough.

Requests and decisions need:

- actor identity
- session ID
- workspace ID
- intent
- target
- capability
- nonce
- correlation ID
- signed/verifiable decision token

## 8. Audit happened too late or incompletely

Allow, deny, approval, execution, failure, rollback, and bypass attempts all need append-only evidence.

## 9. Package and release validation inspected intended files, not always actual packed bytes

`npm pack --dry-run` was treated as sufficient.

The stronger gate must:

```text
npm pack --json
→ extract actual .tgz
→ inspect package/ files
→ scan forbidden paths
→ scan forbidden text markers
→ clean temporary artifacts
```

## 10. GitHub workflow location was wrong

A workflow inside:

```text
LBE_Core_Engine/.github/workflows/
```

is ignored by GitHub Actions.

The workflow must live at:

```text
.github/workflows/
```

## 11. Source-of-truth confusion caused repeated mistakes

Historical instructions assumed `Z:\Core_Control` or GitHub was authoritative.

Current authority is now:

```text
G:\Developments\42_LBE_Core_Clean
```

GitHub is a remote reference. Google Drive synchronizes the working directory.

## 12. Release work repeatedly addressed symptoms

README wording, CLI naming, npm packaging, version alignment, and generated docs were repaired repeatedly while the execution boundary itself remained bypassable.

## Current priority

Do not expand marketing, cloud, Railway, dashboard, or TUI work yet.

The correct order is:

```text
repair release gates
→ validate actual packed artifact
→ align root workflow
→ establish clean G: workspace state
→ implement mandatory tool execution boundary
→ add bypass tests
→ then release and market
```
