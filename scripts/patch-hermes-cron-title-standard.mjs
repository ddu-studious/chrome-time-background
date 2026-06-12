#!/usr/bin/env node
/**
 * 为 ~/.hermes/cron/jobs.json 中三个「每日故事」任务注入统一标题输出规范。
 *
 * 用法:
 *   node scripts/patch-hermes-cron-title-standard.mjs          # 写入（自动备份）
 *   node scripts/patch-hermes-cron-title-standard.mjs --dry-run  # 仅预览 diff 摘要
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOBS_PATH = join(homedir(), '.hermes', 'cron', 'jobs.json');
const SNIPPET_PATH = join(__dirname, '..', 'hermes-prompts', 'output-title-standard.md');

const TARGET_IDS = new Set([
  '0c0d2c2e0918', // 中国历史每日故事
  'dd51052451f6', // 中国学术思想史每日一讲
  '469d08ad3a2d', // 抗日战争前后故事
  '17e2846968d9', // 地理故事
]);

const MARKER_START = '## 输出格式（写作空间 / 飞书 · 必须遵守）';
const MARKER_END = '## 故事结构';
const MARKER_END_ALT = '## 结构要求';

function loadSnippet() {
  return readFileSync(SNIPPET_PATH, 'utf-8').trim();
}

function patchPrompt(prompt, snippet) {
  if (prompt.includes(MARKER_START)) {
    const start = prompt.indexOf(MARKER_START);
    let end = prompt.indexOf(MARKER_END, start);
    if (end < 0) end = prompt.indexOf(MARKER_END_ALT, start);
    if (end < 0) return { prompt, changed: false, reason: 'marker_end_missing' };
    return {
      prompt: prompt.slice(0, start) + snippet + '\n\n' + prompt.slice(end),
      changed: true,
      reason: 'replaced',
    };
  }

  let insertAt = prompt.indexOf('## 故事结构');
  if (insertAt < 0) insertAt = prompt.indexOf('## 结构要求');
  if (insertAt < 0) insertAt = prompt.indexOf('## 工作流程');
  if (insertAt < 0) return { prompt, changed: false, reason: 'no_insert_point' };

  return {
    prompt: prompt.slice(0, insertAt) + snippet + '\n\n' + prompt.slice(insertAt),
    changed: true,
    reason: 'inserted',
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const snippet = loadSnippet();
  const raw = readFileSync(JOBS_PATH, 'utf-8');
  const data = JSON.parse(raw);
  let touched = 0;

  for (const job of data.jobs || []) {
    if (!TARGET_IDS.has(job.id)) continue;
    const { prompt, changed, reason } = patchPrompt(job.prompt || '', snippet);
    if (!changed) {
      console.warn(`[skip] ${job.name} (${job.id}): ${reason}`);
      continue;
    }
    console.log(`[ok] ${job.name} (${job.id}): ${reason}`);
    job.prompt = prompt;
    touched++;
  }

  if (touched === 0) {
    console.error('没有任务被更新，请检查 jobs.json 或 TARGET_IDS');
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\n(dry-run) 将更新 ${touched} 个任务，未写入磁盘`);
    return;
  }

  const backup = `${JOBS_PATH}.bak-${Date.now()}`;
  copyFileSync(JOBS_PATH, backup);
  writeFileSync(JOBS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\n已写入 ${JOBS_PATH}`);
  console.log(`备份: ${backup}`);
  console.log('若 gateway/cron 正在运行，无需重启；下次 tick 即生效。');
}

main();
