/**
 * Rebuilds native modules to match the current Node.js architecture.
 * Records the arch that was used so future runs can detect mismatches.
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const ARCH_STAMP = join(projectRoot, 'node_modules', '.native-arch');

const nativeModules = ['better-sqlite3', 'sqlite3'];

const toRebuild = nativeModules.filter(name =>
  existsSync(join(projectRoot, 'node_modules', name))
);

if (toRebuild.length === 0) {
  console.log('[native] No native modules found.');
  process.exit(0);
}

const currentArch = process.arch;
let lastArch = null;
try { lastArch = readFileSync(ARCH_STAMP, 'utf-8').trim(); } catch {}

const force = process.argv.includes('--force');
if (lastArch === currentArch && !force) {
  console.log(`[native] Already built for ${currentArch}, skipping. Use --force to override.`);
  process.exit(0);
}

if (lastArch && lastArch !== currentArch) {
  console.log(`[native] Arch mismatch: modules built for ${lastArch}, running on ${currentArch}. Rebuilding...`);
}

console.log(`[native] Building for ${currentArch}/${process.platform}: ${toRebuild.join(', ')}`);
console.log(`[native] Node: ${process.execPath} (${process.version})`);

for (const mod of toRebuild) {
  const buildDir = join(projectRoot, 'node_modules', mod, 'build');
  if (existsSync(buildDir)) {
    execSync(`rm -rf "${buildDir}"`, { cwd: projectRoot });
  }
}

try {
  execSync(`npm rebuild ${toRebuild.join(' ')}`, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_target_arch: currentArch },
  });
  writeFileSync(ARCH_STAMP, currentArch);
  console.log(`[native] Done. Modules built for ${currentArch}.`);
} catch (err) {
  console.error('[native] Rebuild failed:', err.message);
  process.exit(1);
}
