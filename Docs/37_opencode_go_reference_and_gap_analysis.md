# OpenCode Go Reference and LBE-TUI Gap Analysis

## Snapshot

- Source documentation: OpenCode official documentation, `https://dev.opencode.ai/docs/go/`
- Related official references: Providers, Models, Tools, Permissions, and MCP servers documentation.
- Documentation snapshot: September 1, 2026.
- Local project checked: `C:\LBE-TUI-Lab`.
- Live BirdEye MCP authority: `C:\MCP Local\Letterblack_BirdEye\mcp_server.py`.

This document is a local engineering reference and comparison. It summarizes the official OpenCode contracts and records what the current LBE-TUI repository must still prove. It does not replace LBE authority or create a second provider, MCP, authorization, receipt, evidence, hashing, indexing, or cache owner.

## 1. OpenCode Go product contract

OpenCode Go is a $10/month subscription for reliable access to selected open coding models. It is optional and works as an ordinary OpenCode provider. The documented flow is: sign in to OpenCode Zen, subscribe to Go, copy the API key, use `/connect`, select OpenCode Go, enter the key, and use `/models` to select an available model. Only one workspace member may subscribe to OpenCode Go.

The model list is curated and may change as OpenCode tests and adds models. The documented list includes:

- Grok 4.6
- GLM-5.3-Flash, GLM-5.3, GLM-5.2, GLM-5.1
- GPT 5.6 Luna
- Kimi K3, Kimi K2.7 Code, Kimi K2.6
- LongCat-2.0
- MiMo-V2.5, MiMo-V2.5-Pro
- MiniMax M3, MiniMax M2.7
- Muse Spark 1.2 Contributor, with limited-region availability
- Qwen3.8 Max, Qwen3.8 Flash
- Qwen3.7 Max, Qwen3.7 Plus
- Qwen3.6 Plus
- DeepSeek V4 Pro, V4 Flash, and V4 Flash Vision Exp
- Hy4 preview and Hy3

### Usage limits

Limits are expressed as usage dollars rather than fixed request counts:

- Five-hour limit: `$12` of usage
- Weekly limit: `$30` of usage
- Monthly limit: `$60` of usage

Actual request count varies by model and token usage. If the Go limit is reached, OpenCode documents that free models may continue to be used. If Zen balance is enabled, Go can fall back to that balance instead of blocking requests after the included limits are reached.

### Traffic requirements

Traffic is monitored for abuse. Coding-agent integrations must avoid abusive traffic and must identify themselves correctly rather than using a broad or misleading user agent.

## 2. Model IDs, endpoints, and API compatibility

OpenCode Go model configuration uses the form:

```text
opencode-go/<model-id>
```

The official Go endpoint table maps models to three API styles:

- OpenAI Responses API: `/responses`
- OpenAI-compatible Chat Completions API: `/chat/completions`
- Anthropic Messages API: `/messages`

The documented SDK package varies with the endpoint style:

- `@ai-sdk/openai`
- `@ai-sdk/openai-compatible`
- `@ai-sdk/anthropic`

The documented model endpoint is:

```text
https://opencode.ai/zen/go/v1/models
```

The endpoint returns an OpenAI-style list object. The observed response shape contains `object: "list"` and `data` entries with `id`, `object`, `created`, and `owned_by`. The live response also contained newer IDs not present in the prose list, including `kimi-k2.5`, `glm-5`, `qwen3.5-plus`, `mimo-v2-pro`, `mimo-v2-omni`, `grok-4.5`, and `hy3-preview`. Therefore the model catalog must be treated as dynamic rather than hard-coded.

## 3. Provider and model behavior required for parity

OpenCode provider documentation describes these relevant behaviors:

- Provider credentials are added through `/connect`.
- Credentials are stored in OpenCode's auth store, not in the project model configuration.
- Provider configuration supports a custom `baseURL`.
- Provider model pickers support model allowlists and denylists.
- `/models` is the model selection surface.
- Full model IDs use `provider_id/model_id`.
- Model configuration supports provider/model options and variants.
- Variants can change reasoning effort, thinking budgets, verbosity, or disable a variant.
- Model loading priority is command-line model, configured model, last-used model, then internal priority.

### LBE-TUI comparison

Current Rust provider types already include provider identity, provider health, model descriptors, selected model state, and provider configuration requests. The repository also has provider catalog refresh and validation requests in `C:\LBE-TUI-Lab\src\requests.rs` and `C:\LBE-TUI-Lab\src\wrapper.rs`.

Remaining parity checks:

- OpenCode Go must be represented as a distinct provider identity, not merely as generic OpenAI-compatible transport.
- The model catalog should be fetched dynamically from the Go models endpoint or authoritative LBE provider catalog.
- Model IDs must preserve the `opencode-go/<model-id>` configuration identity while retaining the provider/model split internally.
- Endpoint/API-style differences must remain provider-owned; the model or reasoning provider must not select arbitrary endpoints.
- Variants and model-specific reasoning options are not proven in the current LBE-TUI projection.
- API key material must remain an opaque credential reference and must not enter Rust UI state, receipts, logs, or evidence.

## 4. Tools and coding-agent behavior

OpenCode documents built-in tools including:

- `bash` for shell commands
- `edit` and `write` for file modification
- `read` for file reads
- `grep` for content search
- `glob` for file discovery
- `lsp` for code intelligence when enabled
- `apply_patch` for patch application
- `skill` and `todowrite`
- `webfetch`, `websearch`, and `question`
- custom tools and MCP-server tools

OpenCode warns that MCP tools add context to every request and recommends limiting enabled MCP servers. This is relevant to LBE because tool discovery must be bounded and tool schemas should not inflate the provider context unnecessarily.

### LBE-TUI comparison

The current LBE boundary already distinguishes read-only workspace operations from governed mutation and process execution. The repository's authoritative boundary is documented in `C:\LBE-TUI-Lab\Agent.md`: Rust is the interaction/projection layer, while LBE owns authorization, policy, governed execution, validation, evidence, receipts, persistence, and completion truth.

The BirdEye server should therefore be exposed only through bounded LBE-owned capability registrations. Direct exposure of the raw filesystem server's mutation tools is not equivalent to OpenCode's tool surface and must remain prohibited unless separately registered and governed.

## 5. Permission and authorization contract

OpenCode permissions resolve to:

- `allow`: execute without approval
- `ask`: prompt for approval
- `deny`: block execution

Permission rules support wildcards and granular input matching. Specific rules override broad rules according to the documented last-match behavior. Auto mode approves requests that would otherwise ask, but explicit deny rules remain enforced. OpenCode also documents `external_directory` and `doom_loop` safety guards.

The documented approval outcomes are once, always for the current session, or reject.

### LBE proof mapping

The backend MCP proof must demonstrate the stricter LBE sequence:

1. Resolve the canonical capability registry.
2. Verify the BirdEye registration in LBE.
3. Reject an unregistered capability before invocation.
4. Authorize before invoking BirdEye.
5. Prove `DENY` causes zero BirdEye invocations.
6. Prove `ALLOW` causes exactly one BirdEye invocation.
7. Correlate the result to the LBE receipt and evidence.
8. Prove provider continuation after a tool result.
9. Prove the persisted event sequence.

OpenCode's permission semantics are a client reference. LBE remains the canonical authorization and receipt owner for this product.

## 6. MCP server contract

OpenCode supports local and remote MCP servers. Local servers are configured with a unique name, `type: "local"`, an installation-owned command array, optional `cwd`, optional environment, and an enabled state. Remote servers use a URL and may use OAuth or headers. MCP tools become available to the model after discovery and are prefixed by the server name for permission matching.

OpenCode documents these operational considerations:

- MCP servers may be disabled without being removed.
- Server tools can be disabled globally or per agent with wildcard rules.
- MCP tool schemas add to model context.
- MCP authentication may be managed separately from ordinary provider credentials.
- Local command and environment configuration belongs to installation/configuration authority, not model-generated input.

### Live BirdEye mapping

The working installation is configured through the MCP Local registry and points to:

```text
C:\MCP Local\Letterblack_BirdEye\mcp_server.py
```

The server uses native MCP stdio and exposes BirdEye search, status, roots, inspection, workspace query, skills, memory, identity, and revision surfaces. It also exposes execution/control surfaces; those must not be projected as read-only capabilities without a separate LBE governance decision.

BirdEye already owns SHA-256 identities, SQLite-backed query/index state, freshness checks, and cache reuse. LBE-TUI must consume those results through the LBE registry and governed orchestration rather than creating another hash/index/cache authority.

## 7. Privacy and retention considerations

The Go documentation states that most listed models are not used for training and have zero-day retention, with documented exceptions and qualifications:

- Grok 4.6 and GPT 5.6 Luna have documented 30-day retention/monitoring qualifications.
- Muse Spark 1.2 Contributor permits training use and is region-limited.
- DeepSeek zero-data-retention coverage is documented as renewed monthly and time-bounded.

Provider selection and usage displays should not imply a universal zero-retention policy. The provider/model record should preserve the applicable policy metadata when the authoritative provider catalog supplies it.

## 8. Confirmed gaps and follow-up checks

### Confirmed or supported by current repository evidence

- LBE is the runtime and governance authority.
- Rust has provider/model projection structures and refresh requests.
- Rust has typed MCP metadata projection and `/mcp` refresh routing.
- BirdEye is the working MCP authority for hashing, indexing, caching, freshness, and search.
- The Rust project has explicit receipt/evidence projection structures.

### Not yet proven by this comparison

- Canonical OpenCode Go provider registration in the LBE capability/provider registry.
- Live Go API-key configuration through the governed credential path.
- Dynamic Go model catalog retrieval and reconciliation.
- Endpoint selection for Responses, Chat Completions, and Anthropic Messages models.
- Model variants and reasoning-option projection.
- Usage-limit telemetry and balance fallback behavior.
- Provider user-agent identity and abuse-safe request shaping.
- Privacy/retention metadata projection.
- End-to-end tool continuation through Go using LBE authorization and receipts.
- Persisted provider/tool event ordering across restart and recovery.

### MCP implementation follow-up (2026-09-02)

The bounded BirdEye MCP routing prerequisite is now implemented in the current
workspaces: Rust `RealLbeWrapper` sends BirdEye requests through the existing LBE
product `tool mcp.birdeye.<tool>` command, and the LBE runtime exposes the handler
through its existing governed registry/orchestrator boundary. This preserves the
documented provider/OpenCode parity requirement that endpoint, transport, and
execution authority remain outside the client.

The OpenCode Go parity gaps above remain unchanged. In particular, Go provider
registration, governed credentials, dynamic model discovery, endpoint/API-style
projection, usage-limit telemetry, privacy/retention metadata, Go continuation,
and persisted provider/tool ordering are still not proven.

## 9. Recommended implementation order

1. Resolve the canonical LBE provider/capability registry.
2. Register OpenCode Go with opaque credential-reference handling.
3. Add dynamic model discovery from the authoritative Go model catalog.
4. Preserve model/provider IDs and endpoint/API-style metadata.
5. Map OpenCode permissions to LBE authorization without moving authority into Rust.
6. Register the bounded BirdEye read-only surfaces through LBE.
7. Prove the nine backend MCP obligations listed above.
8. Add provider continuation and persisted event-sequence tests.
9. Only then add UI projections for provider/model/usage/MCP status.

## Source references

- OpenCode Go: `https://dev.opencode.ai/docs/go/`
- OpenCode Providers: `https://dev.opencode.ai/docs/providers/`
- OpenCode Models: `https://dev.opencode.ai/docs/models/`
- OpenCode Tools: `https://dev.opencode.ai/docs/tools/`
- OpenCode Permissions: `https://dev.opencode.ai/docs/permissions/`
- OpenCode MCP servers: `https://dev.opencode.ai/docs/mcp-servers/`
- OpenCode Go model endpoint: `https://opencode.ai/zen/go/v1/models`