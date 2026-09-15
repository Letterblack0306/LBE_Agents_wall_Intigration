import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function toPosix(file) {
  return file.replaceAll(path.sep, '/').replaceAll('\\', '/');
}

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8'));
}

export function existsRelative(relativePath) {
  return fs.existsSync(path.join(workspaceRoot, relativePath));
}

export function listFiles(rootRelative, predicate = () => true) {
  const root = path.join(workspaceRoot, rootRelative);
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const relative = toPosix(path.relative(workspaceRoot, full));
        if (predicate(relative)) results.push(relative);
      }
    }
  }
  if (fs.existsSync(root)) walk(root);
  return results.sort();
}

export function matchPattern(file, pattern) {
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -3));
  return file === pattern;
}

export function fail(label, messages) {
  console.error(`[${label}] FAIL`);
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

export function pass(label, message) {
  console.log(`[${label}] PASS: ${message}`);
}

