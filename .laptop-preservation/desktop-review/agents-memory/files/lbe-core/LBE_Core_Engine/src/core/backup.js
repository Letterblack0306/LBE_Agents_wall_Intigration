// src/core/backup.js
// Pre-execution file backup and rollback

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteFileSync } from './atomicWrite.js';

export function createBackup(filePath, backupDir) {
    const dir = backupDir || path.resolve('.lbe/data/backups');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const target = path.resolve(filePath);
    const existed = fs.existsSync(target);
    let content = null;
    let hash = null;

    if (existed) {
        content = fs.readFileSync(target);
        hash = crypto.createHash('sha256').update(content).digest('hex');
    }

    const basename = path.basename(target).replace(/[^a-zA-Z0-9._-]/g, '_');
    const backupName = `${Date.now()}-${hash ? hash.slice(0, 8) : 'new'}-${basename}`;
    const backupPath = existed ? path.join(dir, backupName) : null;

    if (existed && content !== null) {
        atomicWriteFileSync(backupPath, content);
    }

    return {
        originalPath: target,
        backupPath,
        existed,
        hash,
        createdAt: new Date().toISOString()
    };
}

export function restoreBackup(backupMeta) {
    if (!backupMeta) return { restored: false, error: 'No backup metadata' };

    const { originalPath, backupPath, existed } = backupMeta;

    if (!existed) {
        // File was newly created — rollback means remove it
        try {
            if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
            return { restored: true, action: 'deleted' };
        } catch (e) {
            return { restored: false, error: e.message };
        }
    }

    if (!backupPath || !fs.existsSync(backupPath)) {
        return { restored: false, error: 'Backup file not found at: ' + backupPath };
    }

    try {
        const content = fs.readFileSync(backupPath);
        atomicWriteFileSync(originalPath, content);
        return { restored: true, action: 'restored' };
    } catch (e) {
        return { restored: false, error: e.message };
    }
}
