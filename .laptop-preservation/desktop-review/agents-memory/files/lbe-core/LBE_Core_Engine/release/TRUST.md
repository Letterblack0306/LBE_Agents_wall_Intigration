# Trust Model

This document states plainly what you can and cannot verify about `@letterblack/lbe-exec` and `@letterblack/lbe-sdk`. It is written for agents and developers who want to reason about the trust surface before depending on this package.

---

## What this package does

LBE intercepts Node.js file system and shell operations at the process level via a CJS preload hook (`--require`). Every intercepted action is evaluated against a local policy file and appended to an audit log. The governance engine runs inside a compiled WASM binary shipped with the package.

---

## What you can verify independently

### 1. Hook behavior (fully verifiable)

The preload hook (`hooks/register.cjs`) is client-side JavaScript. You can read it, run it in isolation, and confirm it patches the APIs it claims to patch. The minified form is smaller but not protected — it can be formatted and read.

```bash
# Confirm hook patches fs and child_process
node --require ./node_modules/@letterblack/lbe-exec/hooks/register.cjs \
  -e "require('fs').writeFileSync('test.txt','x')"
cat .lbe/events.jsonl
```

### 2. Audit log integrity (partially verifiable)

`audit.jsonl` is append-only JSONL in `.lbe/`. You can read every entry. The format is stable and human-readable. There is no cryptographic hash chain on the events.jsonl written by the hook — entries can be deleted without detection at the file level.

### 3. WASM hash lock (tamper-detection, not supply-chain proof)

`dist/wasm.lock.json` contains a SHA-256 hash of `dist/lbe_engine.wasm`. The CLI verifies this at runtime.

**What this protects against:** post-install tampering — if someone modifies the WASM binary on your machine after installation, the hash check fails and the CLI refuses to run.

**What this does not protect against:** the initial install. If the package on npm is compromised before you install it, the hash in `wasm.lock.json` will match the compromised binary. This is standard supply-chain trust, not an additional guarantee.

### 4. Commit signatures (verifiable from 2026-06-21 forward)

Commits to this repository are GPG-signed with key `B902B3111F7D01BA` (Ed25519, expires 2028-06-20). You can verify:

```bash
git log --show-signature
```

This confirms that commits were made by the key holder. It does not make the code open source.

---

## What you cannot verify

### The WASM runtime is closed source

`dist/lbe_engine.wasm` is a compiled binary. Its source is not published. You cannot audit the governance engine logic — policy evaluation, signature verification, rate limiting, nonce replay protection — from the shipped artifact.

The trust chain for the runtime is: **you trust the binary or you don't.** There is no open-source alternative at this time.

### Minified JS is not hidden

`hooks/register.cjs` and `dist/cli.js` are minified. Minified means smaller and harder to read — not protected, not encrypted, not obfuscated beyond whitespace and name compression. A motivated reader can format and read the full implementation.

---

## What the hook does and does not govern

**Governed:** Node.js processes that load the hook via `--require` or `NODE_OPTIONS`.

**Not governed:** Python, Go, Rust, native binaries, PowerShell scripts, subprocess spawns outside `child_process`, or any process that runs outside the hooked Node.js environment.

The hook is a best-effort governance layer for Node.js agents, not a sandbox or kernel-level enforcement mechanism.

---

## Verification surface summary

| Claim | Verifiable? | How |
|---|---|---|
| Hook patches fs and child_process | Yes | Run it, read the audit log |
| Audit log captures intercepted actions | Yes | Read `.lbe/events.jsonl` |
| WASM binary not tampered post-install | Yes | Hash in `wasm.lock.json` |
| WASM binary not tampered at publish time | No | Closed source, standard npm trust |
| Governance engine logic is correct | No | WASM is not open source |
| Commits are from the stated author | Yes | GPG signatures on git history |
| Hook controls every Node.js action | No | JS is not a sandbox |

---

## Reporting

If you find behaviour that contradicts this document — the hook not logging, the hash check not failing on a modified binary, or audit entries missing — open an issue on the public repository.
