#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceEntry = path.join(__dirname, '../src/cli/main.js');
const distEntry = path.join(__dirname, '../dist/cli/lbe.js');
const entry = fs.existsSync(sourceEntry) ? sourceEntry : distEntry;

await import(pathToFileURL(entry).href);
