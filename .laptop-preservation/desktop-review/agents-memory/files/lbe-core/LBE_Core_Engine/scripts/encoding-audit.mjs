#!/usr/bin/env node
// encoding-audit.mjs — scan tracked text files for encoding corruption
// Scans for:
//   1. U+FFFD (replacement character) — indicates decoding failure
//   2. Standalone Windows-1252 bytes (0x80-0x9F) not part of valid UTF-8
// Usage: node scripts/encoding-audit.mjs
// Exit 0 = clean, exit 1 = corrupted files found

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getTrackedFiles() {
    const out = execFileSync('git', ['ls-files'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
    });
    return out.trim().split('\n').filter(f => /\.(md|mjs|js|json|yml|yaml)$/i.test(f));
}

function scanFile(filePath) {
    const buf = fs.readFileSync(filePath);
    const issues = [];

    // Check 1: Does the file decode cleanly as UTF-8?
    const text = buf.toString('utf8');
    if (text.includes('\uFFFD')) {
        issues.push({ type: 'U+FFFD', detail: 'Contains replacement character (decoding failure)' });
    }

    // Check 2: Standalone Windows-1252 bytes (0x80-0x9F) not part of valid UTF-8
    for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b < 0x80 || b > 0x9f) continue;

        // Check if this byte is part of a valid multi-byte UTF-8 sequence
        let partOfUtf8 = false;
        if (i > 0) {
            const prev = buf[i - 1];
            // 2-byte sequence: 0xC2-0xDF 0x80-0xBF
            if (prev >= 0xC2 && prev <= 0xDF) partOfUtf8 = true;
            // 3-byte sequence byte 2: 0xE0-0xEF 0x80-0xBF 0x80-0xBF
            if (prev >= 0xE0 && prev <= 0xEF) partOfUtf8 = true;
            // 4-byte sequence byte 2: 0xF0-0xF4 0x80-0xBF 0x80-0xBF 0x80-0xBF
            if (prev >= 0xF0 && prev <= 0xF4) partOfUtf8 = true;
        }
        // Check if this is byte 3 of a 3-byte or 4 of a 4-byte sequence
        if (i > 1 && buf[i - 1] >= 0x80 && buf[i - 1] <= 0xBF) {
            const prev2 = buf[i - 2];
            if (prev2 >= 0xE0 && prev2 <= 0xEF) partOfUtf8 = true;
            if (prev2 >= 0xF0 && prev2 <= 0xF4) partOfUtf8 = true;
        }
        // Check if this is byte 4 of a 4-byte sequence
        if (i > 2 && buf[i - 1] >= 0x80 && buf[i - 1] <= 0xBF &&
            buf[i - 2] >= 0x80 && buf[i - 2] <= 0xBF) {
            const prev3 = buf[i - 3];
            if (prev3 >= 0xF0 && prev3 <= 0xF4) partOfUtf8 = true;
        }

        if (!partOfUtf8) {
            const ctx = buf.slice(Math.max(0, i - 5), i + 15).toString('utf8').replace(/\n/g, ' ').trim();
            issues.push({ type: 'WIN1252_BYTE', byte: '0x' + b.toString(16), detail: ctx });
        }
    }

    return issues;
}

// — Main —
const files = getTrackedFiles();
let corruptedCount = 0;
let totalIssues = 0;

console.log('[encoding-audit] Scanning ' + files.length + ' tracked files...\n');

for (const rel of files) {
    const filePath = path.join(ROOT, rel);
    if (!fs.existsSync(filePath)) continue;

    const issues = scanFile(filePath);
    if (issues.length > 0) {
        corruptedCount++;
        totalIssues += issues.length;
        console.log('  CORRUPTED: ' + rel);
        for (const issue of issues) {
            console.log('    [' + issue.type + '] ' + (issue.byte || '') + ' ' + issue.detail);
        }
    }
}

if (corruptedCount === 0) {
    console.log('[encoding-audit] PASS: No encoding corruption found\n');
    process.exit(0);
} else {
    console.error('\n[encoding-audit] FAIL: ' + corruptedCount + ' file(s) with ' + totalIssues + ' encoding issue(s)\n');
    process.exit(1);
}
