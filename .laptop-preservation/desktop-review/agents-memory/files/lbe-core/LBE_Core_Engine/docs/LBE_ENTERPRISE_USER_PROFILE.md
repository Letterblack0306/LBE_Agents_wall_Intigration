# LBE Enterprise User Profile

`letterblack_user` is the first controlled enterprise-user profile for
LetterBlack's own workspace.

The real profile lives in private local `.lbe/` state and is not part of the
public SDK package or public mirror output.

## Authority

Local LBE remains the execution boundary. The hosted API may authenticate a
connection, receive ping/status updates, and mirror proof or audit summaries.
It must not execute shell commands, mutate files, or become a server-owned
workspace authority.

Workspace config discovery order:

1. Existing `.lbe/` workspace files.
2. Existing `lbe.json`, only if present.

Do not create another source of truth.

## Private Local Files

```text
.lbe/users/letterblack_user.json
.lbe/bundles/letterblack_user.policy.json
.lbe/runtime/letterblack_user.connection.json
```

These files must not contain secrets, tokens, API keys, raw private logs, shell
output, or decrypted sensitive policy internals.

## Safe Example

Use `examples/policy-bundles/letterblack_user.example.json` for public-safe
structure only. It is not an active policy bundle.
