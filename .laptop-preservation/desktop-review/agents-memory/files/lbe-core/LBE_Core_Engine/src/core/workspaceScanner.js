// src/core/workspaceScanner.js
// Scans a project directory and produces two outputs:
//   semantics   — imperative instructions for agent reasoning (LLM-read)
//   enforcement — allow/approval/deny rules for the controller (machine-enforced)
//
// Supports mixed projects: a repo with Node + Python + Docker + CI
// returns projectTypes: ['node','python','docker','ci'], primaryType: 'node'
// and merges config/lockfile surfaces from all detected types.

import fs from 'fs';
import path from 'path';

// ─── Signals ─────────────────────────────────────────────────────────────────
// file: match if file exists at root
// dir:  match if directory exists at root

const PROJECT_SIGNALS = [
    // Code types — ordered by priority for primaryType resolution
    { file: 'package.json',       type: 'node' },
    { file: 'pyproject.toml',     type: 'python' },
    { file: 'requirements.txt',   type: 'python' },
    { file: 'go.mod',             type: 'go' },
    { file: 'Cargo.toml',         type: 'rust' },
    { file: 'pom.xml',            type: 'java' },
    { file: 'build.gradle',       type: 'java' },
    { file: 'build.gradle.kts',   type: 'java' },
    // Infrastructure types — supplementary, not primary
    { file: 'Dockerfile',         type: 'docker' },
    { file: 'docker-compose.yml', type: 'docker' },
    { dir:  '.github/workflows',  type: 'ci' },
    { file: '.gitlab-ci.yml',     type: 'ci' },
    { dir:  '.circleci',          type: 'ci' },
    { file: 'Jenkinsfile',        type: 'ci' },
    { file: '.travis.yml',        type: 'ci' },
];

// Code types — eligible for primaryType; infra types are always supplementary
const CODE_TYPES = ['node', 'python', 'go', 'rust', 'java'];

// ─── Surface tables ───────────────────────────────────────────────────────────

const SURFACE_MAP = {
    source:    ['src', 'lib', 'app', 'pages', 'components', 'core', 'api', 'server', 'client', 'pkg', 'cmd'],
    generated: ['dist', 'build', '.next', 'out', 'coverage', 'target', '.cache', '__pycache__', '.turbo'],
    tests:     ['test', 'tests', '__tests__', 'spec', 'e2e'],
    docs:      ['docs', 'doc', 'documentation'],
};

const SECRET_GLOBS = ['.env', '.env.*', 'keys/**', 'secrets/**', '*.key', '*.pem', '*.p12', '*.pfx', '*.crt'];
const ALWAYS_DENY  = ['node_modules/**', '.git/**'];

// Lockfiles per ecosystem — never hand-edited
const LOCKFILES_BY_TYPE = {
    node:    ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    python:  ['Pipfile.lock', 'poetry.lock'],
    go:      ['go.sum'],
    rust:    ['Cargo.lock'],
    java:    ['gradle/wrapper/**'],
    docker:  [],
    ci:      [],
    generic: [],
};

// Config files per ecosystem
const CONFIG_FILES_BY_TYPE = {
    node:    ['package.json', 'tsconfig*.json', 'jest.config.*', 'vite.config.*', 'next.config.*',
              'webpack.config.*', '.eslintrc*', '.eslint.config.*', '.prettierrc*', 'babel.config.*'],
    python:  ['pyproject.toml', 'setup.py', 'setup.cfg', 'tox.ini', 'pytest.ini',
              'mypy.ini', '.flake8', '.pylintrc', 'Pipfile'],
    go:      ['go.mod', '.golangci.yml', '.golangci.yaml'],
    rust:    ['Cargo.toml', 'rust-toolchain.toml', 'clippy.toml', '.rustfmt.toml'],
    java:    ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradle.properties',
              'settings.gradle', 'settings.gradle.kts'],
    docker:  ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
    ci:      ['.gitlab-ci.yml', 'Jenkinsfile', '.travis.yml'],
    generic: ['Makefile', 'CMakeLists.txt', 'meson.build'],
};

// Universal config files — included regardless of type
const CONFIG_FILES_UNIVERSAL = ['.editorconfig', '.nvmrc', '.node-version', '.python-version'];
const CONFIG_DIRS_UNIVERSAL  = ['config', '.github', '.gitlab', '.circleci', '.vscode'];

// ─── Human-readable labels ────────────────────────────────────────────────────

const CONFIG_LABEL = {
    node:    'dependency and build config',
    python:  'package and environment config',
    go:      'module definition',
    rust:    'crate manifest',
    java:    'build definition',
    docker:  'container config',
    ci:      'pipeline definition',
    generic: 'project config',
};

const LOCKFILE_LABEL = {
    node:   'package manager',
    python: 'dependency resolver',
    go:     'module checksums',
    rust:   'dependency resolver',
    java:   'Gradle wrapper',
};

// Manifests from known-but-unsupported ecosystems.
// If found at root, placed in approval (config) so agents can't silently edit them.
const FALLBACK_MANIFESTS = [
    'composer.json',   // PHP
    'Gemfile',         // Ruby
    'mix.exs',         // Elixir
    'pubspec.yaml',    // Dart / Flutter
    'Package.swift',   // Swift
    'project.clj',     // Clojure
    'build.sbt',       // Scala
    'stack.yaml',      // Haskell
    'deno.json', 'deno.jsonc', // Deno
    'Podfile',         // CocoaPods (iOS/macOS)
];

// Lockfiles for unsupported ecosystems — machine-generated, never hand-edit.
const FALLBACK_LOCKFILES = [
    'composer.lock',   // PHP
    'Gemfile.lock',    // Ruby
    'mix.lock',        // Elixir
    'pubspec.lock',    // Dart / Flutter
    'Package.resolved', // Swift
];

// Root-level extension patterns for ecosystems that use file extensions as manifests.
// Checked via readdirSync to avoid false-negatives on arbitrary project names.
const FALLBACK_EXTENSIONS = ['.csproj', '.fsproj', '.sln', '.cabal'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exists(p) { return fs.existsSync(p); }

function detectDirs(root, names) {
    return names.filter(n => exists(path.join(root, n))).map(n => `${n}/**`);
}

function readGitignore(root) {
    const p = path.join(root, '.gitignore');
    if (!exists(p)) return [];
    return fs.readFileSync(p, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
        .map(l => l.endsWith('/') ? l + '**' : l);
}

function dedup(arr) {
    return arr.filter((v, i, a) => v && a.indexOf(v) === i);
}

// ─── Type detection ───────────────────────────────────────────────────────────

function detectProjectTypes(root) {
    const seen  = new Set();
    const types = [];
    for (const sig of PROJECT_SIGNALS) {
        if (seen.has(sig.type)) continue;
        const p = path.join(root, sig.file || sig.dir);
        if (exists(p)) { seen.add(sig.type); types.push(sig.type); }
    }
    return types.length > 0 ? types : ['generic'];
}

function primaryType(projectTypes) {
    // Infra-only types (docker, ci) are never primary — fall through to 'generic'
    return CODE_TYPES.find(t => projectTypes.includes(t)) ?? 'generic';
}

function scanFallbackManifests(root) {
    const manifests = FALLBACK_MANIFESTS.filter(f => exists(path.join(root, f)));
    const lockfiles = FALLBACK_LOCKFILES.filter(f => exists(path.join(root, f)));
    // Extension-based manifests (.csproj etc.) — scan root dir once
    try {
        const entries = fs.readdirSync(root);
        for (const e of entries) {
            if (FALLBACK_EXTENSIONS.some(ext => e.endsWith(ext))) manifests.push(e);
        }
    } catch { /* unreadable root — skip */ }
    return { manifests, lockfiles };
}

// ─── Surface detection ────────────────────────────────────────────────────────

function detectSurfaces(root, projectTypes) {
    const s = {};

    // Structural dirs — same for all types
    for (const [key, names] of Object.entries(SURFACE_MAP)) {
        s[key] = detectDirs(root, names);
    }

    // Secrets — globs + existing dirs
    s.secrets = SECRET_GLOBS.filter(g => {
        const base = g.split('/')[0].replace(/\*.*/, '');
        return base.includes('*') || exists(path.join(root, base));
    });

    // Config — merge from ALL detected types, no overwrite
    const typeConfigFiles = dedup(
        projectTypes.flatMap(t => CONFIG_FILES_BY_TYPE[t] || CONFIG_FILES_BY_TYPE.generic)
            .concat(CONFIG_FILES_UNIVERSAL)
    );
    s.config = dedup([
        ...typeConfigFiles.filter(f => !f.includes('*') && !f.endsWith('/**') && exists(path.join(root, f))),
        ...typeConfigFiles.filter(f => f.endsWith('/**') && exists(path.join(root, f.replace('/**', '')))),
        ...detectDirs(root, CONFIG_DIRS_UNIVERSAL),
    ]);

    // Lockfiles — merge from ALL detected types
    s.lockfiles = dedup(
        projectTypes.flatMap(t => LOCKFILES_BY_TYPE[t] || [])
            .filter(f => {
                const base = f.replace(/\*.*/, '').split('/')[0];
                return base.includes('*') || exists(path.join(root, base));
            })
    );

    // Unknown ecosystem — scan for manifests from unsupported toolchains.
    // Anything found goes into config (→ approval) and lockfiles (→ deny).
    if (!projectTypes.some(t => CODE_TYPES.includes(t))) {
        const fb = scanFallbackManifests(root);
        s.config   = dedup([...s.config,    ...fb.manifests]);
        s.lockfiles = dedup([...s.lockfiles, ...fb.lockfiles]);
    }

    return s;
}

// ─── Semantics builder ────────────────────────────────────────────────────────

function buildSemantics(projectTypes, primary, surfaces) {
    const sem = {};

    sem.structure = 'Preserve the existing folder structure. Add new files within established directories. Do not create top-level directories, reorganize, or rename existing folders.';

    if (surfaces.source.length > 0) {
        sem.source = `Source code lives in ${surfaces.source.join(', ')}. Make feature changes and bug fixes here only.`;
    }

    sem.secrets = `Never propose changes to credential or key files (${SECRET_GLOBS.slice(0, 4).join(', ')} …). These are never task targets regardless of the instruction.`;

    if (surfaces.generated.length > 0) {
        sem.generated = `${surfaces.generated.join(', ')} contain generated output. Modify the source files that produce them; never write to generated directories directly.`;
    }

    if (surfaces.config.length > 0) {
        // For mixed projects, use the primary type's label if it makes sense;
        // otherwise say "project configuration" generically.
        const codeTypes  = projectTypes.filter(t => CODE_TYPES.includes(t));
        const label      = codeTypes.length === 1
            ? CONFIG_LABEL[codeTypes[0]]
            : 'project configuration';
        const listed     = surfaces.config.slice(0, 5).join(', ');
        const trailer    = surfaces.config.length > 5 ? ' and related files' : '';
        sem.config = `Treat ${listed}${trailer} as ${label} files. Do not modify them unless the task explicitly requires a configuration or dependency change.`;
    }

    if (surfaces.tests.length > 0) {
        sem.tests = `Test files in ${surfaces.tests.join(', ')} validate behavior. Update them only when the behavior they cover changes.`;
    }

    if (surfaces.lockfiles?.length > 0) {
        const label  = LOCKFILE_LABEL[primary] || 'tooling';
        const listed = surfaces.lockfiles.slice(0, 3).join(', ');
        sem.lockfiles = `${listed} are generated by the ${label}. Never edit them directly.`;
    }

    // Generic / unknown ecosystem — if no code type was recognised, make the
    // conservative posture explicit so agents don't assume they understand the project.
    if (primary === 'generic') {
        const foundManifests = surfaces.config.filter(f => !f.endsWith('/**'));
        if (foundManifests.length > 0) {
            sem.unknown = `This project uses an unrecognized toolchain. Treat ${foundManifests.slice(0, 3).join(', ')} as dependency/manifest files. Do not modify them unless the task explicitly requires a dependency change.`;
        } else {
            sem.unknown = 'This project uses an unrecognized toolchain. Do not assume standard source layouts, dependency files, or build conventions apply. Confirm any structural assumption before acting.';
        }
    }

    // Infra-specific semantics when those types are present
    if (projectTypes.includes('docker')) {
        sem.docker = 'Dockerfile and docker-compose.yml define the container environment. Treat them as infrastructure config — only modify when the task explicitly involves container or environment changes.';
    }
    if (projectTypes.includes('ci')) {
        sem.ci = 'CI config files (.github/**, .gitlab-ci.yml, etc.) define the build and deployment pipeline. Do not modify them unless the task explicitly involves CI/CD changes.';
    }

    return sem;
}

// ─── Enforcement builder ──────────────────────────────────────────────────────

function buildEnforcement(surfaces, gitignorePatterns) {
    const allow = dedup([...surfaces.source, ...surfaces.docs, ...surfaces.tests]);

    const approval = [...surfaces.config];

    const deny = dedup([
        ...surfaces.secrets,
        ...surfaces.generated,
        ...(surfaces.lockfiles || []),
        ...ALWAYS_DENY,
        ...gitignorePatterns.filter(p => p.endsWith('/**')).slice(0, 8),
    ]);

    return {
        allow:    allow.length > 0 ? allow : ['src/**'],
        approval: approval.length > 0 ? approval : [],
        deny,
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function scanWorkspace(rootDir) {
    const root         = path.resolve(rootDir || process.cwd());
    const projectTypes = detectProjectTypes(root);
    const primary      = primaryType(projectTypes);
    const surfaces     = detectSurfaces(root, projectTypes);
    const gitignore    = readGitignore(root);
    const semantics    = buildSemantics(projectTypes, primary, surfaces);
    const enforcement  = buildEnforcement(surfaces, gitignore);

    return { projectTypes, primaryType: primary, surfaces, semantics, enforcement };
}

export function formatSummary(projectTypes, semantics, enforcement) {
    const lines = [];
    const label = Array.isArray(projectTypes) ? projectTypes.join(' + ') : projectTypes;
    lines.push(`Detected: ${label}`);
    lines.push('');
    lines.push('Agent semantics:');
    for (const [, v] of Object.entries(semantics)) {
        lines.push(`  - ${v}`);
    }
    lines.push('');
    lines.push('Enforcement:');
    if (enforcement.allow.length)    lines.push(`  allow:    ${enforcement.allow.join(', ')}`);
    if (enforcement.approval.length) lines.push(`  approval: ${enforcement.approval.join(', ')}`);
    if (enforcement.deny.length)     lines.push(`  deny:     ${enforcement.deny.slice(0, 6).join(', ')}${enforcement.deny.length > 6 ? ' …' : ''}`);
    return lines.join('\n');
}
