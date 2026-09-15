# 18 — Worked Examples

## Example 1 — CEP callback error

### User

> Why do I get “Provided callback is not a function”?

### Flow

1. Resolve the target CEP workspace.
2. Search indexed CEP failures and callback rules.
3. Read current `CSInterface.js` caller sites.
4. Package exact paths, hashes, snippets, and relevant verified patterns.
5. Select the callback-contract guard.
6. Run the deterministic inspection.
7. Validate the narrow callback path.
8. Return a verdict with evidence.

The reasoning agent may explain whether the callback appears omitted, non-function, or masked. The guard and validation determine the verdict.

## Example 2 — General rule question without workspace

### User

> What rule applies to hardcoded machine paths?

The system may answer from indexed rule metadata without current workspace inspection. It must not claim that any specific workspace passes or fails.

## Example 3 — Workspace protection proposal

### Finding

A verified feature must preserve continuous fast-chain behavior, but the active workspace has no explicit protection.

### Flow

1. Check for an equivalent workspace rule.
2. Produce a proposed profile rule:
   - trigger;
   - protected intent;
   - bound paths/hashes;
   - conflict conditions;
   - required clarification behavior.
3. Show exact profile diff.
4. Ask user approval.
5. If approved, route the write through LBE Core.
6. Validate that other agents can retrieve the rule.
7. Record provenance.

## Example 4 — Protected checkpoint conflict

Protected intent:

> Fast-chain loop must continue until completion.

New request:

> Stop the loop after 30 seconds.

Result:

```text
This request conflicts with the protected fast-chain continuity intent.
Confirm whether the earlier intent is being replaced or whether the
timeout should act only as recovery behavior.
```

Until confirmed, no modification is authorized.
