import test from 'node:test';
import assert from 'node:assert/strict';
import { createLBE, sandbox, generateKeyPair, getRuntimeInfo, loadWasmEngine } from '../index.js';

test('public package entry exports SDK API and runtime boundary', async () => {
    assert.equal(typeof createLBE, 'function');
    assert.equal(typeof sandbox, 'function');
    assert.equal(typeof generateKeyPair, 'function');

    const runtime = getRuntimeInfo();
    assert.equal(runtime.localFirst, true);
    assert.match(runtime.mode, /^(javascript|wasm)$/);

    const engine = await loadWasmEngine();
    assert.equal(engine.mode, runtime.mode);
});
