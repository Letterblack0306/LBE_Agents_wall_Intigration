// src/cli/commands/assertConsumer.js
// Guard that proves a consuming project is using LBE as an installed package,
// not treating a copied/source repository as release authority.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const PACKAGE_NAME = '@letterblack/lbe-core';
const DEP_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function addCheck(checks, name, ok, details = {}) {
  checks.push({ name, ok, ...details });
  return ok;
}

function findDependencySpec(packageJson) {
  if (!packageJson || typeof packageJson !== 'object') return null;

  for (const section of DEP_SECTIONS) {
    const value = packageJson[section]?.[PACKAGE_NAME];
    if (value !== undefined) {
      return { section, spec: String(value) };
    }
  }

  return null;
}

function classifyDependencySpec(spec) {
  const raw = String(spec || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return { ok: false, reason: 'EMPTY_DEPENDENCY_SPEC' };
  }

  const blockedPrefixes = [
    'file:',
    'link:',
    'workspace:',
    'git+',
    'github:',
    'git://',
    'ssh://'
  ];

  for (const prefix of blockedPrefixes) {
    if (lower.startsWith(prefix)) {
      return { ok: false, reason: 'LOCAL_OR_GIT_DEPENDENCY_SPEC', prefix };
    }
  }

  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith('./') || raw.startsWith('../')) {
    return { ok: false, reason: 'PATH_DEPENDENCY_SPEC' };
  }

  return { ok: true };
}

function findPackageRoot(startFile) {
  let dir = fs.statSync(startFile).isDirectory() ? startFile : path.dirname(startFile);

  while (dir) {
    const candidate = path.join(dir, 'package.json');
    const pkg = readJson(candidate);
    if (pkg?.name === PACKAGE_NAME) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function inspectPackageLock(root) {
  const lockPath = path.join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  if (!lock) return { present: false };

  const packageEntry = lock.packages?.[`node_modules/${PACKAGE_NAME}`];
  if (!packageEntry) return { present: true, packageEntryPresent: false };

  const resolved = String(packageEntry.resolved || '');
  const blockedResolved =
    packageEntry.link === true ||
    resolved.startsWith('file:') ||
    resolved.startsWith('git+') ||
    resolved.startsWith('github:') ||
    resolved.startsWith('ssh://') ||
    /^[a-z]:[\\/]/i.test(resolved);

  return {
    present: true,
    packageEntryPresent: true,
    link: packageEntry.link === true,
    resolved: resolved || null,
    blockedResolved
  };
}

function getInstalledPackagePath(root) {
  return path.join(root, 'node_modules', ...PACKAGE_NAME.split('/'));
}

export async function assertConsumerCommand(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const checks = [];

  addCheck(checks, 'project-package-json-present', Boolean(packageJson), { path: packageJsonPath });

  const dependency = findDependencySpec(packageJson);
  addCheck(checks, 'declares-lbe-package-dependency', Boolean(dependency), dependency || {});

  const specCheck = dependency ? classifyDependencySpec(dependency.spec) : { ok: false, reason: 'DEPENDENCY_NOT_DECLARED' };
  addCheck(checks, 'dependency-spec-is-registry-package', specCheck.ok, {
    spec: dependency?.spec || null,
    reason: specCheck.reason || null,
    blockedPrefix: specCheck.prefix || null
  });

  let resolvedEntry = null;
  let resolvedRoot = null;
  try {
    const req = createRequire(path.join(root, 'package.json'));
    resolvedEntry = req.resolve(PACKAGE_NAME);
    resolvedRoot = findPackageRoot(resolvedEntry);
  } catch (error) {
    addCheck(checks, 'lbe-package-resolves-from-project', false, { message: error.message });
  }

  if (resolvedEntry) {
    addCheck(checks, 'lbe-package-resolves-from-project', true, { resolvedEntry });
  }

  if (resolvedRoot) {
    const stat = fs.lstatSync(resolvedRoot);
    addCheck(checks, 'lbe-package-is-not-symlink', !stat.isSymbolicLink(), { resolvedRoot });
  } else {
    addCheck(checks, 'lbe-package-is-not-symlink', false, { reason: 'PACKAGE_ROOT_NOT_FOUND' });
  }

  const installedPackagePath = getInstalledPackagePath(root);
  if (fs.existsSync(installedPackagePath)) {
    const installedStat = fs.lstatSync(installedPackagePath);
    addCheck(checks, 'installed-node_modules-package-is-not-symlink', !installedStat.isSymbolicLink(), {
      installedPackagePath
    });
  } else {
    addCheck(checks, 'installed-node_modules-package-is-not-symlink', false, {
      installedPackagePath,
      reason: 'PACKAGE_NOT_INSTALLED_LOCALLY'
    });
  }

  const lockInfo = inspectPackageLock(root);
  if (lockInfo.present && lockInfo.packageEntryPresent) {
    addCheck(checks, 'package-lock-does-not-link-local-lbe', !lockInfo.blockedResolved, lockInfo);
  } else {
    addCheck(checks, 'package-lock-does-not-link-local-lbe', true, lockInfo);
  }

  const ok = checks.every((check) => check.ok);
  const result = {
    ok,
    command: 'assert-consumer',
    package: PACKAGE_NAME,
    root,
    classification: ok
      ? 'consumer-project-using-installed-registry-dependency'
      : 'not-proven-consumer-installed-dependency',
    releaseClaimsAllowed: false,
    message: ok
      ? 'This project consumes LBE as an installed package dependency. This does not certify LBE release safety.'
      : 'This project is not proven to consume LBE only as an installed registry dependency.',
    checks
  };

  console.log(JSON.stringify(result, null, 2));

  if (!ok) {
    process.exit(7);
  }
}
