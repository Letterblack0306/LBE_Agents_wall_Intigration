//! LBE deterministic WASM validation kernel.
//!
//! Provides ordered policy decisions, replay checks, rate checks, audit
//! hashing, rollback decisions, and risk classification. The JS SDK is a
//! thin IO and adapter wrapper. This module is one layer in a multi-layer
//! governance stack — it does not own all auth/security decisions.
//!
//! IO protocol: two 16 KB static buffers exposed as pointers.
//!   lbe_in_ptr()  → JS writes input here before calling any buffer function
//!   lbe_out_ptr() → JS reads output here after calling a buffer function
//!
//! Scalar functions (validate_pipeline, classify_risk, rollback_decision)
//! take individual u32 arguments — no buffer needed.
//!
//! SHA-256 is implemented inline — no external crates, no build scripts,
//! compiles cleanly to wasm32-unknown-unknown with zero host toolchain deps.

// ── Static IO buffers ─────────────────────────────────────────────────────────

const BUF: usize = 16 * 1024;

static mut IN_BUF: [u8; BUF] = [0; BUF];
static mut OUT_BUF: [u8; BUF] = [0; BUF];

#[no_mangle]
pub extern "C" fn lbe_in_ptr() -> u32 {
    unsafe { IN_BUF.as_ptr() as u32 }
}
#[no_mangle]
pub extern "C" fn lbe_out_ptr() -> u32 {
    unsafe { OUT_BUF.as_ptr() as u32 }
}
#[no_mangle]
pub extern "C" fn lbe_buf_size() -> u32 {
    BUF as u32
}
#[no_mangle]
pub extern "C" fn lbe_engine_version() -> u32 {
    3
}

// ── JSON entry point (field-presence check) ──────────────────────────────────
//
// Contract:
//   JS writes a UTF-8 JSON request into IN_BUF, null-terminated.
//   JS calls lbe_execute().
//   WASM writes a UTF-8 JSON response into OUT_BUF, null-terminated.
//
// Note: lbe_execute() performs field-presence checks only (structure-aware
// verification of required fields). Real auth, nonce, signature, and policy
// decisions are handled by the JS validation pipeline above this layer.
// This is a deterministic, host-IO free field presence validator.

#[no_mangle]
pub extern "C" fn lbe_execute() -> u32 {
    unsafe {
        let inp_len = find_nul(&IN_BUF);
        let inp = &IN_BUF[..inp_len];
        let trace_hash = sha256_two(b"", inp);
        let trace_hex = hex64(trace_hash);

        let decision = execute_decision(inp);
        let status = match decision {
            ExecuteDecision::Allowed => 0,
            ExecuteDecision::Denied(_) => 1,
            ExecuteDecision::Error(_) => 2,
        };

        write_execute_response(&mut OUT_BUF, decision, &trace_hex);
        status
    }
}

enum ExecuteDecision {
    Allowed,
    Denied(&'static str),
    Error(&'static str),
}

fn execute_decision(input: &[u8]) -> ExecuteDecision {
    if input.is_empty() {
        return ExecuteDecision::Error("empty input");
    }
    if !looks_like_json_object(input) {
        return ExecuteDecision::Error("input must be a JSON object");
    }
    if !json_string_eq(input, b"version", b"1.0") {
        return ExecuteDecision::Error("unsupported version");
    }
    if !json_has_string(input, b"request_id") {
        return ExecuteDecision::Error("missing request_id");
    }
    if !json_has_number(input, b"timestamp") {
        return ExecuteDecision::Error("missing timestamp");
    }
    if !json_has_object(input, b"actor") || !json_has_string(input, b"id") {
        return ExecuteDecision::Error("missing actor");
    }
    if !json_has_object(input, b"intent") || !json_has_string(input, b"name") {
        return ExecuteDecision::Error("missing intent");
    }
    if !json_has_object(input, b"context") || !json_has_string(input, b"workspace") {
        return ExecuteDecision::Error("missing context");
    }
    if !json_has_object(input, b"constraints") {
        return ExecuteDecision::Error("missing constraints");
    }
    if !json_has_object(input, b"auth") {
        return ExecuteDecision::Denied("missing auth");
    }
    if !json_has_non_empty_string(input, b"signature") {
        return ExecuteDecision::Denied("missing signature");
    }
    if !json_has_non_empty_string(input, b"nonce") {
        return ExecuteDecision::Denied("missing nonce");
    }
    ExecuteDecision::Allowed
}

fn write_execute_response(out: &mut [u8], decision: ExecuteDecision, trace_hash: &[u8; 64]) {
    let mut pos = 0usize;
    match decision {
        ExecuteDecision::Allowed => {
            pos = write_bytes(out, pos, b"{\"ok\":true,\"result\":{\"type\":\"allowed\",\"action\":\"execute\",\"data\":{}},\"policy\":{\"decision\":\"allow\",\"reason\":\"authorized\",\"rules\":[\"wasm-entry-v1\"]},\"trace\":{\"id\":\"");
            pos = write_bytes(out, pos, &trace_hash[..32]);
            pos = write_bytes(out, pos, b"\",\"steps\":[],\"hash\":\"");
            pos = write_bytes(out, pos, trace_hash);
            pos = write_bytes(out, pos, b"\"},\"error\":null}");
        }
        ExecuteDecision::Denied(reason) => {
            pos = write_bytes(out, pos, b"{\"ok\":false,\"result\":{\"type\":\"denied\",\"action\":\"execute\",\"data\":{}},\"policy\":{\"decision\":\"deny\",\"reason\":\"");
            pos = write_bytes(out, pos, reason.as_bytes());
            pos = write_bytes(out, pos, b"\",\"rules\":[\"wasm-auth-v1\"]},\"trace\":{\"id\":\"");
            pos = write_bytes(out, pos, &trace_hash[..32]);
            pos = write_bytes(out, pos, b"\",\"steps\":[],\"hash\":\"");
            pos = write_bytes(out, pos, trace_hash);
            pos = write_bytes(out, pos, b"\"},\"error\":null}");
        }
        ExecuteDecision::Error(message) => {
            pos = write_bytes(out, pos, b"{\"ok\":false,\"result\":{\"type\":\"error\",\"action\":\"execute\",\"data\":{}},\"policy\":{\"decision\":\"deny\",\"reason\":\"invalid input\",\"rules\":[\"wasm-schema-v1\"]},\"trace\":{\"id\":\"");
            pos = write_bytes(out, pos, &trace_hash[..32]);
            pos = write_bytes(out, pos, b"\",\"steps\":[],\"hash\":\"");
            pos = write_bytes(out, pos, trace_hash);
            pos = write_bytes(out, pos, b"\"},\"error\":{\"code\":\"INVALID_INPUT\",\"message\":\"");
            pos = write_bytes(out, pos, message.as_bytes());
            pos = write_bytes(out, pos, b"\"}}");
        }
    }
    if pos < out.len() {
        out[pos] = 0;
    }
}

// ── Validation pipeline ───────────────────────────────────────────────────────
//
// All 4 gates in strict order. Each gate is atomic — a failure at gate N
// means gates N+1..4 are not evaluated.
//
// Input: 49 packed u32 values written to IN_BUF before calling.
//   [0-24]  schema flags   (see SCHEMA_IDX_* below)
//   [25]    cmd_timestamp  (unix seconds)
//   [26]    now_sec
//   [27]    max_clock_skew_sec
//   [28]    key_id_format_valid
//   [29]    key_found
//   [30]    key_not_deprecated
//   [31]    key_requester_matches
//   [32]    key_not_before_ok
//   [33]    key_not_expired
//   [34]    key_lifecycle_fields_present
//   [35]    signature_valid
//   [36]    rate_limit_ok        (1 = not exceeded)
//   [37]    rate_limit_retry_after_sec
//   [38]    nonce_ok             (1 = not a replay)
//   [39-48] policy flags         (see POLICY_IDX_* below)
//
// Output written to OUT_BUF:
//   [0] stage  — 0=schema 1=timestamp 2=key 3=sig 4=rate 5=nonce 6=policy 255=ok
//   [1] code   — stage-specific error code, or retry_after_sec for rate, or skew for timestamp
//
// Calling lbe_validate_pipeline() returns OUT_BUF[0] (the stage).

#[no_mangle]
pub extern "C" fn lbe_validate_pipeline() -> u32 {
    unsafe {
        let inp = &IN_BUF;
        let out = &mut OUT_BUF;

        // Gate 1 — Schema
        let schema_code = schema_decision(inp, 0);
        if schema_code != 0 {
            put_u32(out, 0, 0);
            put_u32(out, 1, schema_code);
            return 0;
        }

        // Gate 2 — Timestamp skew
        let cmd_ts   = get_u32(inp, 25);
        let now_sec  = get_u32(inp, 26);
        let max_skew = get_u32(inp, 27);
        let skew = if now_sec >= cmd_ts { now_sec - cmd_ts } else { cmd_ts - now_sec };
        if skew > max_skew {
            put_u32(out, 0, 1);
            put_u32(out, 1, skew);
            return 1;
        }

        // Gate 3 — Key lifecycle
        // Evaluated in order: format → found → not-deprecated → requester-match
        //                     → lifecycle-fields-present → not-before → not-expired
        let key_code = key_decision(inp, 28);
        if key_code != 0 {
            put_u32(out, 0, 2);
            put_u32(out, 1, key_code);
            return 2;
        }

        // Gate 4a — Signature
        if get_u32(inp, 35) == 0 {
            put_u32(out, 0, 3);
            put_u32(out, 1, 0);
            return 3;
        }

        // Gate 4b — Rate limit
        if get_u32(inp, 36) == 0 {
            put_u32(out, 0, 4);
            put_u32(out, 1, get_u32(inp, 37));
            return 4;
        }

        // Gate 4c — Nonce replay
        if get_u32(inp, 38) == 0 {
            put_u32(out, 0, 5);
            put_u32(out, 1, 0);
            return 5;
        }

        // Gate 5 — Policy
        let policy_code = policy_decision(inp, 39);
        if policy_code != 0 {
            put_u32(out, 0, 6);
            put_u32(out, 1, policy_code);
            return 6;
        }

        put_u32(out, 0, 255);
        put_u32(out, 1, 0);
        255
    }
}

// ── Nonce check-and-record ────────────────────────────────────────────────────
//
// IN_BUF text format (null-terminated):
//   line 1:  TTL_SEC:NOW_SEC
//   line 2:  REQUESTER|SESSION|NONCE  (the new entry to check and record)
//   lines 3+: KEY:TIMESTAMP_SEC       (existing DB entries)
//
// Returns 0 = accepted, 1 = replay.
//
// OUT_BUF on return (null-terminated):
//   line 1:  OK  or  REPLAY
//   lines 2+: KEY:TIMESTAMP_SEC  (updated pruned entries, new entry appended if OK)

#[no_mangle]
pub extern "C" fn lbe_nonce_check() -> u32 {
    unsafe {
        let inp_len = find_nul(&IN_BUF);
        let inp = &IN_BUF[..inp_len];
        let mut out_pos: usize = 0;

        let mut iter = split_lines(inp);

        // Header
        let header = iter.next().unwrap_or(b"3600:0");
        let (ttl_sec, now_sec) = parse_two_u32_colon(header, 3600, 0);
        let cutoff = now_sec.saturating_sub(ttl_sec);

        // New entry key
        let new_key = iter.next().unwrap_or(b"");

        // Scan existing entries: prune expired, detect replay
        // We write entries directly into OUT_BUF as we go (after reserving space for status line).
        // Status line is "OK\n" or "REPLAY\n" (7 bytes max) — write it last, shift if needed.
        // Simpler: buffer the entries section starting at offset 8 (enough for "REPLAY\n\0").

        let entries_start = 8usize;
        let mut entry_pos = entries_start;
        let mut is_replay = false;

        for line in iter {
            if line.is_empty() {
                continue;
            }
            let (key, ts) = rsplit_colon_u32(line);
            if ts < cutoff {
                continue; // pruned
            }
            if key == new_key {
                is_replay = true;
            }
            // Write entry to buffer regardless (we'll still update state for caller)
            entry_pos = write_bytes(&mut OUT_BUF, entry_pos, key);
            entry_pos = write_byte(&mut OUT_BUF, entry_pos, b':');
            entry_pos = write_u32_dec(&mut OUT_BUF, entry_pos, ts);
            entry_pos = write_byte(&mut OUT_BUF, entry_pos, b'\n');
        }

        if is_replay {
            out_pos = write_bytes(&mut OUT_BUF, 0, b"REPLAY\n");
            OUT_BUF[out_pos] = 0;
            return 1;
        }

        // Append new entry
        entry_pos = write_bytes(&mut OUT_BUF, entry_pos, new_key);
        entry_pos = write_byte(&mut OUT_BUF, entry_pos, b':');
        entry_pos = write_u32_dec(&mut OUT_BUF, entry_pos, now_sec);
        entry_pos = write_byte(&mut OUT_BUF, entry_pos, b'\n');
        OUT_BUF[entry_pos] = 0;

        // Write status line at front and shift entries forward
        // Use a two-pass approach: write "OK\n" into bytes 0..3, then entries start at 3.
        // Since entries_start=8 > 3, we need to shift entries down.
        let ok_prefix = b"OK\n";
        let entries_len = entry_pos - entries_start;
        // Shift entries to start at ok_prefix.len()
        OUT_BUF.copy_within(entries_start..entries_start + entries_len, ok_prefix.len());
        OUT_BUF[..ok_prefix.len()].copy_from_slice(ok_prefix);
        out_pos = ok_prefix.len() + entries_len;
        OUT_BUF[out_pos] = 0;

        0
    }
}

// ── Rate limit check-and-record ───────────────────────────────────────────────
//
// IN_BUF text format (null-terminated):
//   line 1:  WINDOW_SEC:MAX_REQUESTS:NOW_SEC
//   line 2:  REQUESTER_ID
//   lines 3+: REQUESTER_ID:TIMESTAMP_SEC  (all requesters in DB)
//
// Returns 0 = ok, 1 = exceeded.
//
// OUT_BUF on return (null-terminated):
//   line 1:  OK  or  EXCEEDED:RETRY_AFTER_SEC
//   lines 2+: REQUESTER_ID:TIMESTAMP_SEC  (updated entries)

#[no_mangle]
pub extern "C" fn lbe_rate_check() -> u32 {
    unsafe {
        let inp_len = find_nul(&IN_BUF);
        let inp = &IN_BUF[..inp_len];

        let mut iter = split_lines(inp);

        let header = iter.next().unwrap_or(b"60:30:0");
        let (window_sec, rest) = split_first_colon(header);
        let (max_requests_bytes, now_bytes) = split_first_colon(rest);
        let window_sec  = parse_u32(window_sec).unwrap_or(60);
        let max_req     = parse_u32(max_requests_bytes).unwrap_or(30);
        let now_sec     = parse_u32(now_bytes).unwrap_or(0);
        let cutoff      = now_sec.saturating_sub(window_sec);

        let requester = iter.next().unwrap_or(b"");

        let entries_start = 32usize; // reserve space for "EXCEEDED:4294967295\n" (20 chars) + safety
        let mut entry_pos = entries_start;
        let mut requester_count: u32 = 0;
        let mut oldest_requester_ts: u32 = u32::MAX;

        for line in iter {
            if line.is_empty() {
                continue;
            }
            let (rid, ts) = rsplit_colon_u32(line);
            if ts < cutoff {
                continue; // pruned
            }
            if rid == requester {
                requester_count += 1;
                if ts < oldest_requester_ts {
                    oldest_requester_ts = ts;
                }
            }
            entry_pos = write_bytes(&mut OUT_BUF, entry_pos, rid);
            entry_pos = write_byte(&mut OUT_BUF, entry_pos, b':');
            entry_pos = write_u32_dec(&mut OUT_BUF, entry_pos, ts);
            entry_pos = write_byte(&mut OUT_BUF, entry_pos, b'\n');
        }

        let entries_len = entry_pos - entries_start;

        if requester_count >= max_req {
            let retry_after = if oldest_requester_ts < now_sec {
                window_sec.saturating_sub(now_sec - oldest_requester_ts).max(1)
            } else {
                1
            };
            let mut status_pos = 0;
            status_pos = write_bytes(&mut OUT_BUF, status_pos, b"EXCEEDED:");
            status_pos = write_u32_dec(&mut OUT_BUF, status_pos, retry_after);
            status_pos = write_byte(&mut OUT_BUF, status_pos, b'\n');
            // Append current entries (without new one — caller already has them)
            OUT_BUF.copy_within(entries_start..entries_start + entries_len, status_pos);
            OUT_BUF[status_pos + entries_len] = 0;
            return 1;
        }

        // Append new entry for this requester
        entry_pos = write_bytes(&mut OUT_BUF, entry_pos, requester);
        entry_pos = write_byte(&mut OUT_BUF, entry_pos, b':');
        entry_pos = write_u32_dec(&mut OUT_BUF, entry_pos, now_sec);
        entry_pos = write_byte(&mut OUT_BUF, entry_pos, b'\n');
        OUT_BUF[entry_pos] = 0;

        // Write "OK\n" at front and shift entries
        let ok = b"OK\n";
        let total_entries_len = entry_pos - entries_start;
        OUT_BUF.copy_within(entries_start..entries_start + total_entries_len, ok.len());
        OUT_BUF[..ok.len()].copy_from_slice(ok);
        OUT_BUF[ok.len() + total_entries_len] = 0;

        0
    }
}

// ── Audit hash ────────────────────────────────────────────────────────────────
//
// IN_BUF: PREV_HASH bytes, then 0x00, then ENTRY_JSON bytes, then 0x00
// OUT_BUF: 64-byte ASCII hex of SHA-256(PREV_HASH || ENTRY_JSON), then 0x00

#[no_mangle]
pub extern "C" fn lbe_audit_hash() {
    unsafe {
        // Find first null → end of prev_hash
        let mut sep = 0usize;
        while sep < BUF && IN_BUF[sep] != 0 {
            sep += 1;
        }
        let prev_hash = &IN_BUF[..sep];

        // Find second segment
        let entry_start = sep + 1;
        let mut entry_end = entry_start;
        while entry_end < BUF && IN_BUF[entry_end] != 0 {
            entry_end += 1;
        }
        let entry = &IN_BUF[entry_start..entry_end];

        let digest = sha256_two(prev_hash, entry);

        let hex = b"0123456789abcdef";
        for (i, &byte) in digest.iter().enumerate() {
            OUT_BUF[i * 2]     = hex[(byte >> 4) as usize];
            OUT_BUF[i * 2 + 1] = hex[(byte & 0x0f) as usize];
        }
        OUT_BUF[64] = 0;
    }
}

// ── Risk classification ───────────────────────────────────────────────────────
// command_type: 0=noop/echo, 1=read, 2=write, 3=patch, 4=delete, 5=run_shell
// shell_cmd_is_rm: 1 if payload.cmd == "rm"
// Returns: 0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL

#[no_mangle]
pub extern "C" fn lbe_classify_risk(command_type: u32, shell_cmd_is_rm: u32) -> u32 {
    if command_type == 5 && shell_cmd_is_rm == 1 {
        return 3; // CRITICAL
    }
    match command_type {
        4 => 2,     // delete → HIGH
        2 | 3 => 1, // write/patch → MEDIUM
        _ => 0,     // read/echo/noop/shell(non-rm) → LOW
    }
}

// ── Rollback decision ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn lbe_rollback_decision(
    exec_failed: u32,
    post_check_failed: u32,
    backup_exists: u32,
    rollback_enabled: u32,
) -> u32 {
    if rollback_enabled == 0 || backup_exists == 0 {
        return 0;
    }
    if exec_failed != 0 || post_check_failed != 0 { 1 } else { 0 }
}

// ── Legacy scalar entry points (kept for back-compat) ─────────────────────────

#[no_mangle]
pub extern "C" fn lbe_policy_decision(
    policy_configured: u32, requester_configured: u32,
    command_allowed: u32, adapter_allowed: u32,
    filesystem_required: u32, filesystem_roots_defined: u32,
    filesystem_ok: u32, path_denied: u32,
    shell_required: u32, shell_command_ok: u32,
) -> u32 {
    let flags: [u8; 40] = {
        let mut b = [0u8; 40];
        for (i, v) in [
            policy_configured, requester_configured, command_allowed, adapter_allowed,
            filesystem_required, filesystem_roots_defined, filesystem_ok, path_denied,
            shell_required, shell_command_ok,
        ].iter().enumerate() {
            put_u32_into(&mut b, i, *v);
        }
        b
    };
    policy_decision(&flags, 0)
}

#[no_mangle]
pub extern "C" fn lbe_schema_decision(
    has_id: u32, id_valid: u32, has_command_id: u32, command_id_valid: u32,
    has_requester_id: u32, requester_id_valid: u32, has_session_id: u32, session_id_valid: u32,
    has_timestamp: u32, timestamp_valid: u32, has_nonce: u32, nonce_valid: u32,
    has_requires: u32, requires_valid: u32, has_payload: u32,
    has_payload_adapter: u32, payload_adapter_valid: u32,
    has_signature: u32, has_signature_alg: u32, signature_alg_valid: u32,
    has_signature_key_id: u32, has_signature_sig: u32, signature_sig_valid: u32,
    has_risk: u32, risk_valid: u32,
) -> u32 {
    let vals = [
        has_id, id_valid, has_command_id, command_id_valid,
        has_requester_id, requester_id_valid, has_session_id, session_id_valid,
        has_timestamp, timestamp_valid, has_nonce, nonce_valid,
        has_requires, requires_valid, has_payload,
        has_payload_adapter, payload_adapter_valid,
        has_signature, has_signature_alg, signature_alg_valid,
        has_signature_key_id, has_signature_sig, signature_sig_valid,
        has_risk, risk_valid,
    ];
    let mut buf = [0u8; 100];
    for (i, &v) in vals.iter().enumerate() {
        put_u32_into(&mut buf, i, v);
    }
    schema_decision(&buf, 0)
}

// ── Inner decision logic ──────────────────────────────────────────────────────

fn schema_decision(buf: &[u8], base: usize) -> u32 {
    let f = |i: usize| get_u32_from(buf, base + i);
    // Presence checks first, then validity
    if f(0)  == 0 { return 1;  } // missing id
    if f(2)  == 0 { return 2;  } // missing commandId
    if f(4)  == 0 { return 3;  } // missing requesterId
    if f(6)  == 0 { return 4;  } // missing sessionId
    if f(8)  == 0 { return 5;  } // missing timestamp
    if f(10) == 0 { return 6;  } // missing nonce
    if f(12) == 0 { return 7;  } // missing requires
    if f(14) == 0 { return 8;  } // missing payload
    if f(17) == 0 { return 9;  } // missing signature
    if f(1)  == 0 { return 10; } // id invalid
    if f(3)  == 0 { return 11; } // commandId invalid
    if f(5)  == 0 { return 12; } // requesterId invalid
    if f(7)  == 0 { return 13; } // sessionId invalid
    if f(9)  == 0 { return 14; } // timestamp invalid
    if f(11) == 0 { return 15; } // nonce invalid
    if f(13) == 0 { return 16; } // requires invalid
    if f(15) == 0 { return 17; } // payload.adapter missing
    if f(16) == 0 { return 18; } // payload.adapter invalid
    if f(18) == 0 { return 19; } // signature.alg missing
    if f(20) == 0 { return 20; } // signature.keyId missing
    if f(21) == 0 { return 21; } // signature.sig missing
    if f(19) == 0 { return 22; } // signature.alg invalid
    if f(22) == 0 { return 23; } // signature.sig invalid
    if f(23) != 0 && f(24) == 0 { return 24; } // risk present but invalid
    0
}

fn key_decision(buf: &[u8], base: usize) -> u32 {
    let f = |i: usize| get_u32_from(buf, base + i);
    // Offsets relative to base (28 in pipeline):
    // 0 = key_id_format_valid
    // 1 = key_found
    // 2 = key_not_deprecated
    // 3 = key_requester_matches
    // 4 = key_not_before_ok
    // 5 = key_not_expired
    // 6 = key_lifecycle_fields_present
    if f(0) == 0 { return 1; } // KEY_ID_INVALID
    if f(1) == 0 { return 2; } // KEY_NOT_TRUSTED
    if f(2) == 0 { return 3; } // KEY_DEPRECATED
    if f(3) == 0 { return 4; } // KEY_REQUESTER_MISMATCH
    if f(6) == 0 { return 5; } // KEY_LIFECYCLE_INVALID (fields missing)
    if f(4) == 0 { return 6; } // KEY_NOT_YET_VALID
    if f(5) == 0 { return 7; } // KEY_EXPIRED
    0
}

fn policy_decision(buf: &[u8], base: usize) -> u32 {
    let f = |i: usize| get_u32_from(buf, base + i);
    if f(0) == 0 { return 1; } // POLICY_NOT_CONFIGURED
    if f(1) == 0 { return 2; } // REQUESTER_NOT_ALLOWED
    if f(2) == 0 { return 3; } // COMMAND_NOT_ALLOWED
    if f(3) == 0 { return 4; } // ADAPTER_NOT_ALLOWED
    if f(4) != 0 {
        // filesystem required
        if f(5) == 0 { return 5; } // NO_FILESYSTEM_ROOTS_DEFINED
        if f(6) == 0 { return 6; } // CWD_OUTSIDE_ALLOWED_ROOT
        if f(7) != 0 { return 7; } // PATH_DENIED_BY_PATTERN
    }
    if f(8) != 0 && f(9) == 0 { return 8; } // SHELL_CMD_DENIED
    0
}

// ── Buffer utilities ──────────────────────────────────────────────────────────

#[inline(always)]
fn get_u32(buf: &[u8], idx: usize) -> u32 {
    let o = idx * 4;
    u32::from_le_bytes([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]])
}

#[inline(always)]
fn get_u32_from(buf: &[u8], idx: usize) -> u32 {
    get_u32(buf, idx)
}

#[inline(always)]
fn put_u32(buf: &mut [u8], idx: usize, v: u32) {
    let o = idx * 4;
    let b = v.to_le_bytes();
    buf[o] = b[0]; buf[o + 1] = b[1]; buf[o + 2] = b[2]; buf[o + 3] = b[3];
}

#[inline(always)]
fn put_u32_into(buf: &mut [u8], idx: usize, v: u32) {
    put_u32(buf, idx, v);
}

fn find_nul(buf: &[u8]) -> usize {
    let mut i = 0;
    while i < buf.len() && buf[i] != 0 {
        i += 1;
    }
    i
}

// Write src bytes into buf at pos, return new pos.
fn write_bytes(buf: &mut [u8], pos: usize, src: &[u8]) -> usize {
    let end = (pos + src.len()).min(buf.len());
    let n = end - pos;
    buf[pos..end].copy_from_slice(&src[..n]);
    end
}

fn write_byte(buf: &mut [u8], pos: usize, b: u8) -> usize {
    if pos < buf.len() {
        buf[pos] = b;
        pos + 1
    } else {
        pos
    }
}

fn write_u32_dec(buf: &mut [u8], pos: usize, n: u32) -> usize {
    let mut tmp = [0u8; 10];
    if n == 0 {
        return write_byte(buf, pos, b'0');
    }
    let mut i = 10usize;
    let mut v = n;
    while v > 0 {
        i -= 1;
        tmp[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    write_bytes(buf, pos, &tmp[i..])
}

fn parse_u32(s: &[u8]) -> Option<u32> {
    if s.is_empty() {
        return None;
    }
    let mut n: u32 = 0;
    for &b in s {
        if b < b'0' || b > b'9' {
            return None;
        }
        n = n.wrapping_mul(10).wrapping_add((b - b'0') as u32);
    }
    Some(n)
}

// Split on first ':' — returns (before, after)
fn split_first_colon(s: &[u8]) -> (&[u8], &[u8]) {
    for (i, &b) in s.iter().enumerate() {
        if b == b':' {
            return (&s[..i], &s[i + 1..]);
        }
    }
    (s, b"")
}

// Split on LAST ':' — for entries where key may contain colons
fn rsplit_colon_u32(line: &[u8]) -> (&[u8], u32) {
    for i in (0..line.len()).rev() {
        if line[i] == b':' {
            let ts = parse_u32(&line[i + 1..]).unwrap_or(0);
            return (&line[..i], ts);
        }
    }
    (line, 0)
}

fn parse_two_u32_colon(s: &[u8], def_a: u32, def_b: u32) -> (u32, u32) {
    let (a, b) = split_first_colon(s);
    (
        parse_u32(a).unwrap_or(def_a),
        parse_u32(b).unwrap_or(def_b),
    )
}

fn looks_like_json_object(s: &[u8]) -> bool {
    let mut start = 0usize;
    while start < s.len() && is_ws(s[start]) {
        start += 1;
    }
    if start >= s.len() || s[start] != b'{' {
        return false;
    }
    let mut end = s.len();
    while end > start && is_ws(s[end - 1]) {
        end -= 1;
    }
    end > start && s[end - 1] == b'}'
}

fn is_ws(b: u8) -> bool {
    b == b' ' || b == b'\n' || b == b'\r' || b == b'\t'
}

fn json_has_object(input: &[u8], key: &[u8]) -> bool {
    match find_json_key(input, key) {
        Some(mut pos) => {
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            pos < input.len() && input[pos] == b'{'
        }
        None => false,
    }
}

fn json_has_number(input: &[u8], key: &[u8]) -> bool {
    match find_json_key(input, key) {
        Some(mut pos) => {
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            pos < input.len() && input[pos] >= b'0' && input[pos] <= b'9'
        }
        None => false,
    }
}

fn json_has_string(input: &[u8], key: &[u8]) -> bool {
    match find_json_key(input, key) {
        Some(mut pos) => {
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            pos < input.len() && input[pos] == b'"'
        }
        None => false,
    }
}

fn json_has_non_empty_string(input: &[u8], key: &[u8]) -> bool {
    match find_json_key(input, key) {
        Some(mut pos) => {
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            if pos >= input.len() || input[pos] != b'"' {
                return false;
            }
            pos += 1;
            pos < input.len() && input[pos] != b'"'
        }
        None => false,
    }
}

fn json_string_eq(input: &[u8], key: &[u8], expected: &[u8]) -> bool {
    match find_json_key(input, key) {
        Some(mut pos) => {
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            if pos >= input.len() || input[pos] != b'"' {
                return false;
            }
            pos += 1;
            let start = pos;
            while pos < input.len() && input[pos] != b'"' {
                pos += 1;
            }
            pos <= input.len() && &input[start..pos] == expected
        }
        None => false,
    }
}

fn find_json_key(input: &[u8], key: &[u8]) -> Option<usize> {
    if key.is_empty() || input.len() < key.len() + 3 {
        return None;
    }
    let mut i = 0usize;
    while i + key.len() + 2 < input.len() {
        if input[i] == b'"'
            && (i == 0 || input[i - 1] != b'\\')
            && &input[i + 1..i + 1 + key.len()] == key
            && input[i + 1 + key.len()] == b'"'
        {
            let mut pos = i + key.len() + 2;
            while pos < input.len() && is_ws(input[pos]) {
                pos += 1;
            }
            if pos < input.len() && input[pos] == b':' {
                return Some(pos + 1);
            }
        }
        i += 1;
    }
    None
}

fn hex64(digest: [u8; 32]) -> [u8; 64] {
    let mut out = [0u8; 64];
    let hex = b"0123456789abcdef";
    for (i, &byte) in digest.iter().enumerate() {
        out[i * 2] = hex[(byte >> 4) as usize];
        out[i * 2 + 1] = hex[(byte & 0x0f) as usize];
    }
    out
}

// Zero-copy line iterator over a byte slice
struct LineIter<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Iterator for LineIter<'a> {
    type Item = &'a [u8];
    fn next(&mut self) -> Option<&'a [u8]> {
        if self.pos >= self.buf.len() {
            return None;
        }
        let start = self.pos;
        while self.pos < self.buf.len() && self.buf[self.pos] != b'\n' {
            self.pos += 1;
        }
        let end = self.pos;
        if self.pos < self.buf.len() {
            self.pos += 1; // skip '\n'
        }
        // Trim trailing '\r' for CRLF safety
        let line = if end > start && self.buf[end - 1] == b'\r' {
            &self.buf[start..end - 1]
        } else {
            &self.buf[start..end]
        };
        Some(line)
    }
}

fn split_lines(buf: &[u8]) -> LineIter<'_> {
    LineIter { buf, pos: 0 }
}

// ── SHA-256 (inline, no external crates) ──────────────────────────────────────
// Computes SHA-256 over two byte slices concatenated — used for the audit
// hash chain: sha256(prev_hash_bytes || entry_json_bytes).

#[allow(clippy::unreadable_literal)]
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256_compress(state: &mut [u32; 8], block: &[u8; 64]) {
    let mut w = [0u32; 64];
    for i in 0..16 {
        let o = i * 4;
        w[i] = u32::from_be_bytes([block[o], block[o+1], block[o+2], block[o+3]]);
    }
    for i in 16..64 {
        let s0 = w[i-15].rotate_right(7) ^ w[i-15].rotate_right(18) ^ (w[i-15] >> 3);
        let s1 = w[i-2].rotate_right(17) ^ w[i-2].rotate_right(19)  ^ (w[i-2] >> 10);
        w[i] = w[i-16].wrapping_add(s0).wrapping_add(w[i-7]).wrapping_add(s1);
    }
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for i in 0..64 {
        let s1    = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch    = (e & f) ^ ((!e) & g);
        let temp1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
        let s0    = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj   = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);
        h = g; g = f; f = e;
        e = d.wrapping_add(temp1);
        d = c; c = b; b = a;
        a = temp1.wrapping_add(temp2);
    }
    state[0] = state[0].wrapping_add(a); state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c); state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e); state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g); state[7] = state[7].wrapping_add(h);
}

fn sha256_two(a: &[u8], b: &[u8]) -> [u8; 32] {
    let total_len = a.len() + b.len();
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    // Feed data through a virtual concatenated stream a||b, block by block.
    let mut block = [0u8; 64];
    let mut block_pos: usize = 0;
    let mut src_a_done = false;
    let mut a_pos: usize = 0;
    let mut b_pos: usize = 0;

    // Helper: feed one byte into the block, compressing when full.
    macro_rules! feed {
        ($byte:expr) => {{
            block[block_pos] = $byte;
            block_pos += 1;
            if block_pos == 64 {
                sha256_compress(&mut state, &block);
                block_pos = 0;
            }
        }};
    }

    while a_pos < a.len() { feed!(a[a_pos]); a_pos += 1; }
    while b_pos < b.len() { feed!(b[b_pos]); b_pos += 1; }

    // Padding: 0x80, then zeros, then 64-bit big-endian bit length.
    let bit_len = (total_len as u64) * 8;
    feed!(0x80);
    while block_pos != 56 {
        if block_pos == 64 {
            sha256_compress(&mut state, &block);
            block_pos = 0;
        }
        block[block_pos] = 0;
        block_pos += 1;
    }
    let bl = bit_len.to_be_bytes();
    for &byte in &bl { feed!(byte); }
    // Final compress happens when block_pos wraps to 0 after the last bit_len byte.

    let mut out = [0u8; 32];
    for (i, &word) in state.iter().enumerate() {
        let wb = word.to_be_bytes();
        out[i*4..i*4+4].copy_from_slice(&wb);
    }
    out
}
