# ADR-002: Remove the HTTP Server Surface

**Status:** Accepted — 2026-06-19

## Decision

LBE is a local SDK and CLI. It does not ship an HTTP API server, Docker or
Railway deployment assets, server runbooks, or hosted-service documentation.

## Why HTTP deployment was removed

An API server introduces infrastructure ownership: authentication, network
exposure, CORS, secrets, availability, deployment, monitoring, incident
response, and ongoing dependency maintenance. That is not a responsible or
useful burden for the current solo-developer, local-first product.

The HTTP layer also weakens the product focus. LBE's value is deterministic,
local execution governance, not operating a remote execution service.

## Consequences

- Supported local interfaces are the SDK and `lbe` CLI only.
- Runtime state remains local; no network listener is started by LBE.
- Documentation and CI must not offer HTTP, Docker, Railway, cloud dashboard,
  or server deployment paths.

## Reintroduction rule

HTTP or hosted deployment must not be restored by default, as an example, or
as a future roadmap item. It may be reconsidered only after explicit user
approval of a written infrastructure ownership plan covering authentication,
network exposure, secrets, updates, monitoring, backups, support, and cost.
