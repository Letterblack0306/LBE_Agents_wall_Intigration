import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPackageRuntime } from '../scripts/verify-package-runtime.mjs';

test('package runtime boundary installs and runs from dist', async () => {
    const result = await verifyPackageRuntime();
    assert.ok(result.tarballPath.endsWith('.tgz'), 'expected npm pack tarball');
    assert.ok(result.tarLines.includes('dist/cli/lbe.js'), 'dist CLI must be present');
});
