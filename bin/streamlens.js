#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distEntry = path.resolve(__dirname, '../dist/cli/index.js');

if (fs.existsSync(distEntry)) {
  const { run } = await import(pathToFileURL(distEntry).href);
  run();
} else {
  // If running from source in development
  import('../src/cli/index.js').then(({ run }) => run()).catch(async () => {
    console.error('StreamLens: dist/cli/index.js not found. Please run "npm run build" first.');
    process.exit(1);
  });
}
