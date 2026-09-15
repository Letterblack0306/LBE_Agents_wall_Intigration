// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { assertConsumerCommand } from '../src/cli/commands/assertConsumer.js';

const PACKAGE_NAME = '@letterblack/lbe-core';

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lbe-assert-consumer-'));
}

function writeJson(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`);
}

function writeMinimalInstalledPackage(root) {
    const pkgRoot = path.join(root, 'node_modules', PACKAGE_NAME);
    fs.mkdirSync(pkgRoot, { recursive: true });
    writeJson(path.join(pkgRoot, 'package.json'), {
        name: PACKAGE_NAME,
        version: '1.3.4',
        type: 'module',
        main: 'index.js'
    });
    fs.writeFileSync(path.join(pkgRoot, 'index.js'), 'export const ok = true;\n');
}

async function runAssertConsumer(root) {
    const lines = [];
    const origLog = console.log;
    const origExitCode = process.exitCode;
    const origExit = process.exit;
    let exitCode = 0;
    process.exitCode = 0;
    console.log = (...args) => {
        lines.push(args.join(' '));
    };
    process.exit = (code = 0) => {
        exitCode = code;
        throw Object.assign(new Error(`process.exit(${code})`), {
            code: 'TEST_PROCESS_EXIT',
            exitCode: code
        });
    };

    try {
        await assertConsumerCommand({ root });
    } catch (error) {
        if (error.code !== 'TEST_PROCESS_EXIT') throw error;
    } finally {
        console.log = origLog;
        process.exit = origExit;
        process.exitCode = origExitCode;
    }

    const output = lines.join('\n').trim();
    assert.ok(output.length > 0, 'assert-consumer should write JSON output');
    return { ...JSON.parse(output), exitCode };
}

function makeConsumerProject(baseDir, dependencySpec, lockEntry = null) {
    const root = path.join(baseDir, 'consumer-project');
    fs.mkdirSync(root, { recursive: true });

    writeJson(path.join(root, 'package.json'), {
        name: 'consumer-project',
        private: true,
        type: 'module',
        dependencies: {
            [PACKAGE_NAME]: dependencySpec
        }
    });

    if (lockEntry) {
        writeJson(path.join(root, 'package-lock.json'), {
            name: 'consumer-project',
            lockfileVersion: 3,
            packages: {
                '': {
                    name: 'consumer-project',
                    dependencies: {
                        [PACKAGE_NAME]: dependencySpec
                    }
                },
                [`node_modules/${PACKAGE_NAME}`]: lockEntry
            }
        });
    }

    return root;
}

test('assert-consumer passes for installed registry dependency', async () => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, '^1.3.4', {
        version: '1.3.4',
        resolved: 'https://registry.npmjs.org/@letterblack/lbe-core/-/lbe-core-1.3.4.tgz',
        integrity: 'sha512-demo'
    });
    writeMinimalInstalledPackage(root);

    const result = await runAssertConsumer(root);
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.classification, 'consumer-project-using-installed-registry-dependency');
    assert.equal(result.releaseClaimsAllowed, false);
});

test('assert-consumer fails for file dependency', async () => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, 'file:../letterblack-sentinel');
    const result = await runAssertConsumer(root);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.releaseClaimsAllowed, false);
    assert.match(JSON.stringify(result), /LOCAL_OR_GIT_DEPENDENCY_SPEC|not-proven-consumer-installed-dependency/);
});

test('assert-consumer fails for link dependency', async () => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, 'link:../letterblack-sentinel');
    const result = await runAssertConsumer(root);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.releaseClaimsAllowed, false);
    assert.match(JSON.stringify(result), /LOCAL_OR_GIT_DEPENDENCY_SPEC|not-proven-consumer-installed-dependency/);
});

test('assert-consumer fails for workspace dependency', async () => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, 'workspace:*');
    const result = await runAssertConsumer(root);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.releaseClaimsAllowed, false);
    assert.match(JSON.stringify(result), /LOCAL_OR_GIT_DEPENDENCY_SPEC|not-proven-consumer-installed-dependency/);
});

test('assert-consumer fails for git dependency', async () => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, 'git+https://github.com/Letterblack0306/LetterBlack-Sentinel.git');
    const result = await runAssertConsumer(root);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.releaseClaimsAllowed, false);
    assert.match(JSON.stringify(result), /LOCAL_OR_GIT_DEPENDENCY_SPEC|not-proven-consumer-installed-dependency/);
});

test('assert-consumer fails for symlinked node_modules package', async (t) => {
    const baseDir = makeTempDir();
    const root = makeConsumerProject(baseDir, '^1.3.4', {
        version: '1.3.4',
        resolved: 'https://registry.npmjs.org/@letterblack/lbe-core/-/lbe-core-1.3.4.tgz',
        integrity: 'sha512-demo'
    });

    const actualPkg = path.join(root, 'actual-lbe-package');
    fs.mkdirSync(actualPkg, { recursive: true });
    writeJson(path.join(actualPkg, 'package.json'), {
        name: PACKAGE_NAME,
        version: '1.3.4',
        type: 'module',
        main: 'index.js'
    });
    fs.writeFileSync(path.join(actualPkg, 'index.js'), 'export const ok = true;\n');

    const linkPath = path.join(root, 'node_modules', PACKAGE_NAME);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    try {
        fs.symlinkSync(actualPkg, linkPath, 'junction');
    } catch (error) {
        t.skip(`symlink creation unavailable in this environment: ${error.message}`);
        return;
    }

    const result = await runAssertConsumer(root);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.releaseClaimsAllowed, false);
    assert.match(JSON.stringify(result), /lbe-package-is-not-symlink|not-proven-consumer-installed-dependency/);
});
