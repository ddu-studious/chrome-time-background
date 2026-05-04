/**
 * Rebuilds native modules (sqlite3) to match the current Node.js architecture.
 * Handles the case where prebuild downloads a binary for the wrong arch
 * (e.g., arm64 binary on a Rosetta x86_64 Node).
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlite3Dir = join(__dirname, '..', 'node_modules', 'sqlite3');

if (!existsSync(sqlite3Dir)) {
  process.exit(0);
}

try {
  console.log(`[postinstall] Rebuilding sqlite3 for ${process.arch}...`);
  execSync(`npx --yes node-gyp rebuild --arch=${process.arch}`, {
    cwd: sqlite3Dir,
    stdio: 'pipe',
  });
  console.log(`[postinstall] sqlite3 rebuilt for ${process.arch}`);
} catch (err) {
  console.warn(`[postinstall] sqlite3 rebuild failed (non-fatal):`, err.message);
}
