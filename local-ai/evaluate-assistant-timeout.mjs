// Opt-in production HTTP/Gateway validation. Never execute returned business plans.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Contract from '../js/assistant-contract.js';

if (!process.argv.includes('--live')) {
  console.log('使用 --live 验证截图需求的真实本机规划；队列状态为合成数据，不执行任何业务工具。');
} else {
  const token = readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET', headers,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error?.message || result.error || '请求失败'), { result });
    return result;
  };
  const control = await request('/v1/control');
  assert.equal(control.jobs.length, 0, '已有模型任务，稍后再验证');
  const started = Date.now(), traceId = `timeout-evaluation-${started}`, reasoning = process.argv.includes('--off') ? 'off' : 'low';
  const text = '清空队列，找到法老的热门歌曲，加入队列，随机播放队列的歌曲。';
  const revision = 'fixture-79e975b9c9014b108d792eeedd596e3d54b5857fa50cabd06a575a9cfc';
  const observation = { tool: 'music.state', status: 'done', message: '当前队列50首，未在播放。', data: {
    status: 'ready', revision, mode: 'shuffle', isPlaying: false, count: 50, currentTime: 0, duration: 0,
    volume: 1, currentSong: null, source: 'cache', readAt: started, timer: null
  } };
  const input = { text, app: 'music', personalMemory: { artistDefaultAction: 'play', artistQueueMode: 'append' },
    turns: [{ role: 'user', content: text }], observations: [], completedSteps: [], toolGroups: [],
    context: { version: 1, revision: 1, summary: '', constraints: [], receipts: [], canCompact: false, compactionAttempted: false } };
  const report = { at: new Date(started).toISOString(), reasoning, boundary: '真实本机模型 + 生产鉴权HTTP/Gateway；模拟50首队列，仅校验计划，不执行清空、搜索或播放', passed: false, records: [] };
  const call = async input => {
    let jobId;
    try {
      let result = await request('/v1/ai/interpret', { scene: 'assistant.plan', input, selection: { reasoning },
        trace: { conversationId: traceId, turnId: traceId, startedAt: started, userManaged: true } });
      jobId = result.jobId;
      const deadline = Date.now() + 105000;
      while (result.status === 'pending') {
        if (Date.now() >= deadline) throw new Error('验证等待超时');
        await new Promise(resolve => setTimeout(resolve, 750));
        result = await request(`/v1/ai/jobs/${jobId}`);
      }
      const plan = Contract.validatePlan(result.data, 'music');
      report.records.push({ data: result.data, execution: result.execution });
      console.log(JSON.stringify(report.records.at(-1)));
      return plan;
    } catch (error) { if (jobId) await request(`/v1/ai/jobs/${jobId}/cancel`, {}).catch(() => {}); throw error; }
  };
  try {
    const first = await call(input);
    assert.deepEqual(first.steps, [{ tool: 'music.state', args: {} }]);
    const second = await call({ ...input, turns: [...input.turns, { role: 'assistant', content: `${observation.tool} [done] ${observation.message}（来源 context:2）` }],
      observations: [observation], completedSteps: [{ tool: observation.tool, message: observation.message }],
      context: { ...input.context, revision: 2, receipts: [{ id: `${traceId}:2`, turnId: traceId, tool: observation.tool, message: observation.message, status: 'done' }] } });
    assert.deepEqual(second.steps, [{ tool: 'music.queue.clear', args: { expectedRevision: revision } }]);
    assert.equal(second.continue, true);
    const [initial, next] = report.records;
    if (reasoning !== 'off' && initial.execution.effectiveReasoning === 'off') {
      assert.equal(next.execution.recoveryFromRequestId, initial.execution.requestId);
      assert.equal(next.execution.attempts.length, 1);
      assert.equal(next.execution.effectiveReasoning, 'off');
    }
    report.passed = true;
  } catch (error) { report.error = error.message; if (error.result) report.failure = error.result; process.exitCode = 1; }
  report.elapsedMs = Date.now() - started;
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-timeout-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, elapsedMs: report.elapsedMs, report: output.pathname }));
}
