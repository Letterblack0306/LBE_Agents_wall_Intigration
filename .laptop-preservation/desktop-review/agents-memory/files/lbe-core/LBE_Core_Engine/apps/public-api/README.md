# Sentinel Public API

Demo and authenticated connection API for public visitors and local LBE
workspaces.

This surface does not execute shell commands, does not write project files, and
does not expose a public `/run` route. Public demo routes demonstrate action
proposal decisions and proof lookup. Authenticated connection routes let local
LBE report lightweight status and proof summaries.

LBE Cloud is the connection and proof layer. LBE Local is the execution
boundary. The local `.lbe/` workspace remains the authority for policy, gates,
audit/proof, workspace identity, and local rules.

## Routes

- `GET /health`
- `GET /v1/info`
- `POST /v1/connect`
- `GET /v1/me`
- `GET /v1/me/workspaces`
- `POST /v1/workspaces/:workspaceId/ping`
- `POST /v1/workspaces/:workspaceId/proof`
- `POST /v1/workspaces/:workspaceId/events`
- `POST /v1/demo/verify`
- `POST /v1/demo/dryrun`
- `GET /v1/demo/proof/:id`

Connection routes require `Authorization: Bearer <token>`. They do not receive
secret keys, raw private files, full audit logs, or shell output by default.

## Run Locally

```powershell
$env:PORT='8080'
node apps/public-api/api-server.js
```

## Example

```powershell
curl.exe -i http://localhost:8080/v1/demo/verify `
  -H "content-type: application/json" `
  --data "{\"action\":\"write_file\",\"target\":\"docs/example.md\"}"
```
