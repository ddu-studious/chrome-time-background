/**
 * Pre-start check: verifies native module arch matches current Node.
 * If mismatched, triggers a rebuild automatically.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const ARCH_STAMP = join(projectRoot, 'node_modules', '.native-arch');

const currentArch = process.arch;
let stampedArch = null;
try { stampedArch = readFileSync(ARCH_STAMP, 'utf-8').trim(); } catch {}

if (stampedArch === currentArch) {
  process.exit(0);
}

console.log(`\n[arch-check] Native modules built for "${stampedArch || 'unknown'}", but Node is "${currentArch}".`);
console.log(`[arch-check] Node binary: ${process.execPath}`);
console.log(`[arch-check] Auto-rebuilding native modules...\n`);

try {
  execSync('node scripts/rebuild-native.js --force', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
} catch {
  console.error('\n[arch-check] Auto-rebuild failed. Run manually: node scripts/rebuild-native.js --force\n');
  process.exit(1);
}
