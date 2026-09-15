# SDK Reference Notes

Status: future design note only.

This document records external SDK structure references for future LBE Cloud
client work. It does not change the current SDK, runtime, package, public API
server, npm version, release artifacts, or local execution behavior.

## Decision

Use OpenAI SDK repositories as structure references only:

- `openai/openai-node`: primary JavaScript/TypeScript SDK structure reference.
- `openai/openai-python`: secondary client/auth/documentation clarity reference.
- `openai/openai-agents-js`: guardrails, tools, handoff, tracing, and
  human-in-loop vocabulary reference.
- `openai/codex`: local-first agent positioning reference.

Do not copy OpenAI code, model/API product shape, or hosted execution model.

## LBE Boundary

LBE remains local-first. LBE Local owns policy, proof, audit, rollback, and
execution authority. LBE Cloud is optional and may only provide authentication,
connection status, proof summary sync, and control-plane visibility.

Real execution remains local through SDK/CLI/MCP or another explicitly
controlled local host integration. Cloud must not execute shell commands, mutate
files, or become a server-owned workspace authority.

## Future Cloud Client Shape

A future optional cloud client may expose:

```ts
import { LetterBlack } from "@letterblack/lbe-core/cloud";

const lb = new LetterBlack({
  apiKey: process.env.LBE_CLOUD_TOKEN,
  baseURL: "https://api.letterblack.net"
});

await lb.connect({
  userId: "letterblack_user",
  workspaceId: "..."
});
```

The future client surface should map to the existing local-first API contract:

- `connect`
- `me`
- `workspaces`
- `ping`
- `proof`
- `events`

It must not expose hosted `/run`, hosted shell execution, hosted filesystem
mutation, or a shared Railway execution workspace.

## Auth Rules

Future cloud API auth should use environment or local secret storage, never
committed tokens:

```text
LBE_CLOUD_TOKEN=<local secret>
```

No auth token, API key, private audit log, raw file content, shell output, or
decrypted sensitive policy internals may be committed to source.

## Schema Direction

Future cloud-client schema work should be OpenAPI-first:

1. Define `api.letterblack.net` contract in an OpenAPI document.
2. Generate typed request and response clients from that contract.
3. Keep generated client code separate from local enforcement modules.
4. Keep examples separate from runtime code.
5. Validate that the generated public surface cannot call hosted execution.

Do not add runtime schema implementation until a separate approved issue exists.

## Non-Goals

- No npm publish.
- No version bump.
- No tag.
- No current SDK behavior change.
- No current execution behavior change.
- No OpenAI feature-set copy.
