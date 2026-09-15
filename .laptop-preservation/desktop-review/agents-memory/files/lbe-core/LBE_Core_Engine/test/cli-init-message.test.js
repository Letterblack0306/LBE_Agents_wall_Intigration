import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'lbe.js');

test('init points users to the current lbe status command', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-cli-init-'));
    const result = spawnSync(process.execPath, [cli, 'init', '--yes'], {
        cwd: workspace,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /npx lbe status/);
    assert.doesNotMatch(result.stdout, /lbe-exec status/);
});
