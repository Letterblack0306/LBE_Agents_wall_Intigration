'use strict';
// Spawned as a child process by state-appendCentral.test.js concurrent test.
// Usage: node central-append-worker.cjs <filePath> <count> <workerId>
// Appends <count> records to <filePath> sequentially, then exits 0.

var filePath = process.argv[2];
var count    = parseInt(process.argv[3], 10);
var id       = process.argv[4] || 'w';

if (!filePath || isNaN(count)) {
    process.exit(0);
}

var appendJsonlSync = require('../../src/state/appendCentral.cjs').appendJsonlSync;

for (var i = 0; i < count; i++) {
    appendJsonlSync(filePath, { worker: id, index: i, action: 'concurrent_test' });
}

process.exit(0);
