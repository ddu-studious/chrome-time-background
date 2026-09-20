// Real SDK + real selected local model via the authenticated running Gateway.
// All source material and observations are synthetic; no business tool executes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Contract from '../js/assistant-contract.js';

if (!process.argv.includes('--live')) {
  console.log('使用 --live 验证 pi SDK 摘要与压缩后的真实本机模型规划；仅使用合成记录，不操作账号、队列或提醒。');
} else {
  const token = readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET', headers,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || '请求失败'), { result });
    return result;
  };
  const control = await request('/v1/control');
  assert.ok(control.scenes.some(row => row.id === 'assistant.compact'), '先重启本机服务以加载新 SDK 场景');
  assert.equal(control.jobs.length, 0, '已有模型任务，稍后再验证');
  const started = Date.now(), records = [];
  const call = async (scene, input) => {
    let jobId;
    try {
      let result = await request('/v1/ai/interpret', { scene, input,
        trace: { conversationId: `compaction-evaluation-${started}`, startedAt: started, userManaged: true } });
      jobId = result.jobId;
      const deadline = Date.now() + 100000;
      while (result.status === 'pending') {
        if (Date.now() >= deadline) throw new Error('验证等待超时');
        await new Promise(resolve => setTimeout(resolve, 750));
        result = await request(`/v1/ai/jobs/${jobId}`);
      }
      records.push({ scene, data: result.data, execution: result.execution });
      console.log(JSON.stringify({ scene, elapsedMs: result.execution.elapsedMs, usage: result.execution.usage, sdk: result.data?.sdk }));
      return result;
    } catch (error) { if (jobId) await request(`/v1/ai/jobs/${jobId}/cancel`, {}).catch(() => {}); throw error; }
  };
  const original = '查询杨和苏的热门歌曲候选，先不要播放，不要清空或修改原队列，等待我选择。';
  const entries = [{ seq: 1, role: 'user', content: original }, ...Array.from({ length: 15 }, (_, i) => ({ seq: i + 2, role: 'assistant', content:
    `第${i + 1}次只读检索已结束。` + '测试目录返回了同名歌手、专辑和歌曲候选，仍需要按用户的目标确认歌手身份，不能把同名候选直接当作用户选择。'.repeat(5) + '原队列仍有101首，未播放、未清空、未追加。' }))];
  const report = { at: new Date().toISOString(), boundary: '真实 pi SDK + 真实本机模型 + 生产 HTTP/Gateway；合成历史和状态，未执行任何业务工具', passed: false, records };
  try {
    const compacted = (await call('assistant.compact', { revision: 16, entries, force: true })).data;
    assert.equal(compacted.changed, true); assert.ok(compacted.afterEstimatedTokens < compacted.beforeEstimatedTokens);
    assert.match(compacted.summary, /杨和苏/);
    const result = await call('assistant.plan', { text: '继续查询候选，先不要播放或修改队列', app: 'music',
      turns: [], observations: [{ tool: 'music.state', status: 'done', message: '测试队列101首，尚未播放', data: { revision: 'fixture-only', count: 101, isPlaying: false } }],
      context: { version: 1, revision: 16, summary: compacted.summary, constraints: [{ seq: 1, text: original }], receipts: [], canCompact: false } });
    assert.equal(result.status, 'ready');
    const plan = Contract.validatePlan(result.data, 'music');
    assert.ok(plan.steps.length, '应继续只读检索而非声称已完成');
    assert.ok(plan.steps.every(step => ['tools.load', 'music.search', 'music.search.next', 'music.state', 'music.collection.get', 'context.read'].includes(step.tool)), '禁止模型提出播放或修改队列');
    report.passed = true;
  } catch (error) { report.error = error.message; if (error.result) report.failure = error.result; process.exitCode = 1; }
  report.elapsedMs = Date.now() - started;
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-compaction-${started}.json`, directory); writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, report: output.pathname, elapsedMs: report.elapsedMs }));
}
