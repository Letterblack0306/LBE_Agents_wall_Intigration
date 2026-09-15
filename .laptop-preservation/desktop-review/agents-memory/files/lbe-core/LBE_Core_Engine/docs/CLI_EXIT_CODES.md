# CLI Exit Codes

Canonical exit-code reference for LBE CLI commands.

## Common

| Code | Meaning |
|---:|---|
| 0 | Success |
| 1 | General error, missing required input, missing policy, invalid policy, or missing key material depending on command context |
| 8 | Policy/signature/state/audit verification failure, or post-validation failure where applicable |
| 9 | Generic validation failure |
| 10 | Execution failed without an adapter-provided exit code |

## verify

| Code | Meaning |
|---:|---|
| 0 | Proposal valid |
| 1 | Missing input, missing policy, invalid policy, or missing key material |
| 2 | Policy blocked the proposal |
| 3 | Signature validation failed |
| 4 | Nonce/replay validation failed |
| 5 | Invalid proposal file or schema validation failed |
| 6 | Timestamp / clock-skew validation failed |
| 7 | Rate limit validation failed |
| 8 | Policy signature or policy-version state validation failed |
| 9 | Generic validation failure |

## run

| Code | Meaning |
|---:|---|
| 0 | Execution completed and post-validation passed or was not required |
| 5 | Invalid proposal/schema-style input failure |
| 8 | Post-validation failed, or policy/signature/state validation failed where used |
| 9 | Generic validation failure |
| 10 | Execution failed without an adapter-provided exit code |

## assert-consumer

| Code | Meaning |
|---:|---|
| 0 | Consumer install assertion passed |
| 7 | Consumer install assertion failed |
