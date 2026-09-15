import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { shellAdapter } from '../src/adapters/shellAdapter.js';

function makeSandbox(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-shell-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function makeCommand(cwd, args) {
    return {
        id: 'RUN_SHELL',
        commandId: crypto.randomUUID(),
        payload: {
            adapter: 'shell',
            cmd: process.execPath,
            args,
            cwd
        }
    };
}

function makeRequester(cwd) {
    return {
        filesystem: { roots: [cwd] },
        exec: {
            allowCmds: [process.execPath],
            denyCmds: []
        }
    };
}

test('shell adapter treats metacharacter args as data, not shell syntax', async (t) => {
    const cwd = makeSandbox(t);
    const marker = path.join(cwd, 'whoami-ran.txt');
    const cmd = makeCommand(cwd, [
        '-e',
        'const fs=require("fs"); console.log(process.argv.slice(1).join("|"));',
        'ok',
        '&&',
        `fs.writeFileSync(${JSON.stringify(marker)}, "executed")`
    ]);

    const result = await shellAdapter(cmd, {}, makeRequester(cwd));

    assert.equal(result.status, 'completed');
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /ok\|&&\|fs\.writeFileSync/);
    assert.equal(fs.existsSync(marker), false, 'metacharacter args must not execute as shell syntax');
});
