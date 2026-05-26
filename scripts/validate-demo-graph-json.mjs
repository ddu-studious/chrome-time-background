#!/usr/bin/env node
/**
 * GraphSnapshot 校验 CLI — 复用 kg-graph-core.validateGraphSnapshot
 *
 * preset:
 *   release — L2-P0（预置场景 ≤150 节点）
 *   draft   — 仅 L0+L1
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { validateGraphSnapshot } = require(
    resolve(__dirname, '../js/kg-graph-core.js')
);

const filePath = process.argv[2];
const preset = process.argv[3] || 'release';

if (!filePath) {
    console.error('用法: node validate-demo-graph-json.mjs <file.json> [release|draft]');
    process.exit(2);
}

let raw;
try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (err) {
    console.error(`[E_PARSE] ${filePath}: ${err.message}`);
    process.exit(1);
}

const options = { presetPackage: preset !== 'runtime' };

const result = validateGraphSnapshot(raw, options);

if (result.status !== 'ok') {
    console.error(`[FAIL] ${filePath} (${preset})`);
    for (const issue of result.issues || []) {
        console.error(`  ${issue.code}: ${issue.message}${issue.path ? ` @ ${issue.path}` : ''}`);
    }
    process.exit(1);
}

const nodeCount = result.graph?.nodes?.length ?? 0;
const edgeCount = result.graph?.edges?.length ?? 0;
console.log(
    `[OK] ${filePath} schema=${result.graph?.schemaVersion} nodes=${nodeCount} edges=${edgeCount} preset=${preset}`
);
