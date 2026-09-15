# 06 — Guard Selector

## Purpose

Translate a user problem and evidence package into one or more explicit inspection requests.

## Required questions

1. Which workspace is involved?
2. Is current workspace evidence required?
3. What failure domain is indicated?
4. Which existing guards match the trigger?
5. What evidence does each guard require?
6. What would make the guard not applicable?
7. What validation is needed for a reliable verdict?

## Output

The selector produces `guard_request` objects. It does not produce final guard truth.

## Selection rules

- Prefer exact trigger matches.
- Prefer workspace-specific profile guards over generic guards.
- Use current evidence to disambiguate historical patterns.
- Do not run every guard.
- Do not select a guard solely because keywords are similar.
- State uncertainty and alternatives.
- Stop when no guard has sufficient applicability.

## Example

```json
{
  "guard_id": "missing-module-guard",
  "workspace_id": "example-cep",
  "reason": "Current error and imports indicate unresolved local module ownership.",
  "required_evidence_refs": [
    "workspace:file:src/panel/app.js",
    "workspace:file:src/shared/bridge.js",
    "memory:pattern:missing-relative-module"
  ],
  "requested_mode": "inspect"
}
```
