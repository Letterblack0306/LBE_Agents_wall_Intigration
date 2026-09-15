# ADR-003: Keep LBE SDK-Only With Temporary Demo API Exception

**Status:** Accepted — 2026-06-19; amended 2026-07-02

## Decision

LBE ships as one local SDK and CLI embedded in the user's existing application.
It will not expand into a daemon, agent runner, host platform, MCP server, HTTP
service, hosted dashboard, Docker deployment, or companion system.

Temporary exception: a separate public demo API may exist only as a hosted
demo/control-plane surface. This exception does not change the production SDK
surface and does not reintroduce hosted execution.

## Why

The product must be fast to install, simple to understand, and realistic for a
solo developer to maintain. A direct SDK integration meets the local governance
requirement without creating a second platform to deploy, secure, operate, or
support.

## Product boundary

The user installs the SDK and calls its API from their existing application.
LBE validates the proposed action locally and returns its decision/result. No
external process or online dependency is required.

## Temporary demo-only hosted API exception

ADR-002 remains valid for the production SDK surface. The hosted API exception
is limited to public demonstration of proposal decisions and proof lookup.

Allowed demo behavior:

- Show health and public API metadata.
- Accept demo proposal payloads.
- Return deterministic allow/deny examples.
- Return demo proof records.

Forbidden hosted behavior:

- Real filesystem execution.
- Shell execution.
- Shared hosted `/run`.
- Private policy or local state exposure.
- Hosted API use as the release authority for the SDK package.

Real execution remains local through the SDK/CLI and explicitly controlled host
integrations. A future MCP integration, if restored, must remain separate from
public hosted demo execution.

## Reintroduction rule

No additional system may be added as a roadmap item, example, or compatibility
surface without the user's explicit request and a new ADR that explains why the
SDK-only approach no longer meets the stated requirement.
