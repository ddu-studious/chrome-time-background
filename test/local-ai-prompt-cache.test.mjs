import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPromptCache } from '../local-ai/inspect-prompt-cache.mjs';

test('缓存诊断区分音乐规划与短请求，使用服务计数且不输出正文', () => {
  const log = `[2026-10-20 11:00:00][DEBUG] Received request: POST to /api/v1/chat with body {
  "system_prompt": "你是快捷助手的受控工具规划器 private-input",
[2026-10-20 11:00:00][INFO][qwen/test] Running api/v1/chat on history with 2 messages.
[cache_store] Prompt cache restore: cached_tokens=2048 uncached_tokens=1951
[2026-10-20 11:00:01][DEBUG] Received request: POST to /api/v1/chat with body {
  "system_prompt": "你负责分析完整待办清单 another-private-input",
[2026-10-20 11:00:01][INFO][qwen/test] Running api/v1/chat on history with 2 messages.
[cache_store] Prompt cache restore: cached_tokens=0 uncached_tokens=999
[cache_store] VLM prompt cache disk usage: used_mib=128.0 cap_mib=7815.0 lifetime_evicted_mib=0.0 records=4 lifetime=model_load`;
  const report = inspectPromptCache(log);
  assert.deepEqual(report.total, { requests: 2, hitRequests: 1, cachedTokens: 2048, uncachedTokens: 2950, cachedTokenPercent: 41 });
  assert.equal(report.groups.find(g => g.kind === 'planning').cachedTokenPercent, 51.2);
  assert.equal(report.groups.find(g => g.kind === 'outline').cachedTokenPercent, 0);
  assert.equal(report.disk.records, 4); assert.equal(report.rows[0].at, '2026-10-20 11:00:00');
  assert.doesNotMatch(JSON.stringify(report), /private-input|system_prompt/);
});

test('缺少命中信息不冒充零命中或生成失败，空日志占比为未知', () => {
  assert.equal(inspectPromptCache('仅有请求，无缓存回执').total.cachedTokenPercent, null);
  assert.equal(inspectPromptCache('Prompt cache restore: cached_tokens=9007199254740991 uncached_tokens=10').total.requests, 0);
});

test('按日志时间窗口统计，避免日常请求与隔离验收混在同一命中率里', () => {
  const log = `[2026-10-20 11:00:00][INFO][qwen/test] Running api/v1/chat
Prompt cache restore: cached_tokens=0 uncached_tokens=3000
[2026-10-20 15:00:00][INFO][qwen/test] Running api/v1/chat
Prompt cache restore: cached_tokens=2048 uncached_tokens=952
[2026-10-20 16:00:00][INFO][qwen/test] Running api/v1/chat
Prompt cache restore: cached_tokens=4096 uncached_tokens=100`;
  const report = inspectPromptCache(log, { since: '2026-10-20T14:59:59', until: '2026-10-20T15:00:00' });
  assert.equal(report.total.requests, 1);
  assert.equal(report.total.cachedTokenPercent, 68.3);
  assert.equal(inspectPromptCache(log, { since: '2026-10-20T17:00:00' }).total.cachedTokenPercent, null);
  assert.equal(inspectPromptCache('Prompt cache restore: cached_tokens=10 uncached_tokens=1', { since: '2026-10-20T17:00:00' }).total.requests, 0);
  assert.throws(() => inspectPromptCache(log, { since: '2026-10-21T00:00:00', until: '2026-10-20T00:00:00' }), /起始时间/);
  assert.throws(() => inspectPromptCache(log, { since: '2026-02-30T00:00:00' }), /时间范围/);
});
