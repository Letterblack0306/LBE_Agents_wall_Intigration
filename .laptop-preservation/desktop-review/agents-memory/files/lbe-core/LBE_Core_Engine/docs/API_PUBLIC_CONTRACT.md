# Public API Contract

Status: demo plus authenticated local-first connection mode.

The public hosted API demonstrates Sentinel/LBE decisions and proof lookup. It
does not execute real shell commands, write project files, or expose a shared
hosted `/run` endpoint.

Real execution remains local through the SDK/CLI and any explicitly controlled
host integration.

LBE Cloud is the connection and proof layer. LBE Local is the execution
boundary.

## Local-First Authority Model

The hosted API does not own the user workspace. A user's local LBE workspace is
the authority for policy, gates, audit/proof, workspace identity, and local
rules.

Local LBE discovers existing workspace configuration in this order:

1. Existing `.lbe/` workspace files.
2. Existing `lbe.json`, if a workspace uses one.

Current repository discovery result:

```text
.lbe/workspace.json
```

The server receives only lightweight connection status and optional proof/event
summaries. It must not receive secret keys, tokens, raw private files, full
audit logs by default, or shell output unless explicitly approved by the user.

## Public Routes

### `GET /health`

Returns service health.

```json
{
  "ok": true,
  "service": "sentinel-public-api",
  "status": "healthy"
}
```

### `GET /v1/info`

Returns public API mode and route metadata.

## Authenticated Connection Routes

These routes require `Authorization: Bearer <token>`. The server authenticates,
records connection status, and may mirror proof/event summaries. It does not
execute commands or read/write workspace files.

### `POST /v1/connect`

Registers or refreshes a local workspace connection.

Request:

```json
{
  "workspaceId": "ws_123",
  "lbeVersion": "1.3.37",
  "mode": "local",
  "status": "connected",
  "capabilities": ["verify", "dryrun", "proof", "audit"],
  "policyHash": "sha256:...",
  "gatesHash": "sha256:...",
  "lastProofId": "proof_..."
}
```

Response:

```json
{
  "ok": true,
  "sessionId": "sess_123",
  "heartbeatSeconds": 30,
  "serverMode": "control_plane",
  "execution": "local_only"
}
```

### `GET /v1/me`

Returns authenticated control-plane identity metadata. It does not expose a raw
`/u/{userId}` public path.

### `GET /v1/me/workspaces`

Returns connection summaries for workspaces authenticated by the current token.

### `POST /v1/workspaces/:workspaceId/ping`

Refreshes online/offline status for a local workspace. The payload shape matches
`POST /v1/connect` and must match the route `workspaceId`.

### `POST /v1/workspaces/:workspaceId/proof`

Stores an optional proof summary. The payload may include `proofId`, `result`,
`status`, and `summary`. It must not include raw private files, full audit logs,
tokens, secrets, or shell output.

### `POST /v1/workspaces/:workspaceId/events`

Stores an optional event summary. This is for dashboard/status visibility only,
not hosted execution.

### `POST /v1/demo/verify`

Accepts a demo proposal and returns an allow/deny decision without execution.

Request:

```json
{
  "action": "write_file",
  "target": "docs/example.md",
  "metadata": {
    "source": "public-demo"
  }
}
```

Response:

```json
{
  "ok": true,
  "demo": true,
  "mode": "verify",
  "decision": "allow",
  "executed": false,
  "proof_id": "example",
  "proof_url": "/v1/demo/proof/example"
}
```

### `POST /v1/demo/dryrun`

Same payload shape as demo verify. Returns a deterministic dry-run decision and
proof id. No adapters are executed.

### `GET /v1/demo/proof/:id`

Returns the in-memory demo proof for a previous demo verify/dryrun request.

## Disabled Route

`POST /v1/run` is not public and must not execute on the hosted demo service.
Raw public user paths such as `/u/{userId}` are not part of the contract.

## Safety Requirements

- Bind to `0.0.0.0`.
- Listen on `process.env.PORT`.
- Enforce JSON body size limits.
- Return structured JSON errors.
- Do not log request bodies, secrets, headers, API keys, or tokens.
- Do not execute shell commands.
- Do not write project files.
- Do not expose private policy or local state.
- Do not create server-owned workspaces.
- Do not expose raw user IDs in public paths.
- Keep local `.lbe/` or `lbe.json` as the authority.
- Use a CORS allowlist.
- Use basic rate limiting.

## Curl Examples

```powershell
curl.exe -i https://api.letterblack.net/health
curl.exe -i https://api.letterblack.net/v1/info
curl.exe -i https://api.letterblack.net/v1/demo/verify `
  -H "content-type: application/json" `
  --data "{\"action\":\"write_file\",\"target\":\"docs/example.md\"}"
curl.exe -i https://api.letterblack.net/v1/demo/dryrun `
  -H "content-type: application/json" `
  --data "{\"action\":\"run_shell\",\"target\":\"npm publish\"}"
curl.exe -i https://api.letterblack.net/v1/connect `
  -H "authorization: Bearer <token>" `
  -H "content-type: application/json" `
  --data "{\"workspaceId\":\"ws_123\",\"lbeVersion\":\"1.3.37\",\"mode\":\"local\",\"status\":\"connected\",\"capabilities\":[\"verify\",\"dryrun\",\"proof\",\"audit\"],\"policyHash\":\"sha256:...\",\"gatesHash\":\"sha256:...\",\"lastProofId\":\"proof_...\"}"
```
