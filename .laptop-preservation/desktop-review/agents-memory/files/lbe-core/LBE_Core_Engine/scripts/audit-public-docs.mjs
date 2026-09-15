import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BANNED_PATTERNS = [
    [/Z:\//i, 'private Z: path'],
    [/C:\\Users\\prave/i, 'private Windows user path'],
    [/C:\/Users\/prave/i, 'private Windows user path'],
    [/\bCore_Control\b/i, 'private workspace name'],
    [/AppData\\Local\\LetterBlack\\Sentinel\\workspaces\\[0-9a-f]{2}/i, 'private state path'],
    [/\bsetImmediate\b/i, 'internal timing detail'],
    [/unlink recursion/i, 'internal hook detail'],
    [/\bO_EXCL\b/i, 'internal lock detail'],
    [/\balpha\d+\b/i, 'internal alpha-stage language'],
    [/\bWEAKPOINT\b/i, 'internal security language'],
    [/\bloophole\b/i, 'release-dangerous wording'],
    [/\bbypass(?:ed|es|ing)?\b/i, 'release-dangerous wording'],
    [/all agents around the world/i, 'universal enforcement claim'],
    [/impossible to bypass/i, 'universal enforcement claim'],
];

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(file) : [file];
    });
}

const EXCLUDE_DOCS = new Set(['docs/REPOSITORY_LOCATIONS.md']);

export function publicDocFiles(root) {
    const named = ['README.md', 'Release-README.md', 'CHANGELOG.md', 'WORKSPACE.md', 'package.json'];
    const files = named.map(file => path.join(root, file)).filter(fs.existsSync);
    for (const dir of ['docs', '.github', 'release', 'release-public']) {
        files.push(...walk(path.join(root, dir)).filter(file => /\.(md|json|ya?ml)$/i.test(file)));
    }
    return [...new Set(files)].filter(f => !EXCLUDE_DOCS.has(path.relative(root, f).replace(/\\/g, '/')));
}

export function auditText(text) {
    return BANNED_PATTERNS.flatMap(([pattern, reason]) => pattern.test(text) ? [{ reason, pattern: pattern.source }] : []);
}

export function auditPublicDocs(root = process.cwd()) {
    return publicDocFiles(root).flatMap(file =>
        auditText(fs.readFileSync(file, 'utf8')).map(finding => ({ file: path.relative(root, file), ...finding }))
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const findings = auditPublicDocs();
    if (findings.length) {
        console.error('Public documentation audit failed:');
        for (const finding of findings) console.error(`- ${finding.file}: ${finding.reason}`);
        process.exitCode = 1;
    } else {
        console.log('Public documentation audit passed.');
    }
}
