import test from 'node:test';
import assert from 'node:assert/strict';
import { auditText } from '../scripts/audit-public-docs.mjs';

test('catches a private Windows path', () => {
    assert.ok(auditText('C:\\Users\\prave\\secret.txt').length > 0);
});

test('catches alpha-only wording', () => {
    assert.ok(auditText('alpha14 release notes').length > 0);
});

test('catches an overclaim', () => {
    assert.ok(auditText('This is impossible to bypass.').length > 0);
});

test('allows normal public install instructions', () => {
    assert.deepEqual(auditText('npm install @letterblack/lbe-sdk\nnpx lbe init'), []);
});

test('allows truthful limitation wording', () => {
    assert.deepEqual(auditText('LBE controls actions routed through its execution boundary.'), []);
});
