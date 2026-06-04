#!/usr/bin/env node
/**
 * 扫描 ~/.hermes/cron/output/ 并将新故事推送到 cursor-bridge 待同步队列。
 * 扩展打开写作空间时会从 bridge 拉取并写入 blogPosts。
 *
 * 用法:
 *   node scripts/hermes-sync-writing.mjs          # 仅扫描新增
 *   node scripts/hermes-sync-writing.mjs --stats  # 查看队列状态
 */

const BRIDGE = process.env.CURSOR_BRIDGE_URL || 'http://127.0.0.1:19840';

async function main() {
  const statsOnly = process.argv.includes('--stats');

  if (statsOnly) {
    const res = await fetch(`${BRIDGE}/writing/hermes/stats`);
    if (!res.ok) throw new Error(`Bridge ${res.status}`);
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  const res = await fetch(`${BRIDGE}/writing/hermes/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('扫描失败:', res.status, err);
    console.error('请确认 cursor-bridge 已启动: cd cursor-bridge && npm run dev');
    process.exit(1);
  }

  const data = await res.json();
  console.log('Hermes → 写作空间 扫描完成');
  console.log(`  目录 .md 数: ${data.checked ?? data.scanned}`);
  console.log(`  实际解析:   ${data.scanned}`);
  console.log(`  新入库:     ${data.imported}`);
  console.log(`  已跳过:     ${data.skipped} (mtime ${data.skippedByMtime ?? '?'} / 重复 ${data.skippedByDuplicate ?? '?'})`);
  if (data.incremental != null) {
    console.log(`  增量模式:   ${data.incremental}，mtime 水位 ${data.watermarkBeforeMs} → ${data.watermarkAfterMs}`);
  }
  if (data.errors?.length) {
    console.log('  错误:', data.errors.join('; '));
  }
  console.log('\n在 Chrome 新标签页打开写作空间，或点击「Hermes」按钮完成同步到本地。');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
