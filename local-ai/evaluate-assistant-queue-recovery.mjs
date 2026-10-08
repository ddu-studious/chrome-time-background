// Opt-in controlled HTTP evaluation. All receipts are synthetic; execute no plans.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (!process.argv.includes('--live')) {
  console.log('使用 --live 验证真实本机规划：读取队列版本、追加、随机播放。仅模拟回执，不执行业务动作。');
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
  const started = Date.now(), id = `queue-recovery-evaluation-${started}`;
  const text = '林俊杰热歌，添加队列，随机播放。';
  const observation = { tool: 'music.collection.get', status: 'done', message: '已读取林俊杰的50首曲目（测试替身）。', data: { ref: 'r10', count: 50, total: 50, truncated: false } };
  const input = { text, app: 'music', toolGroups: ['music.queue', 'music.playback'], observations: [observation],
    completedSteps: [{ tool: 'music.search', message: '已选择林俊杰（测试替身）。' }, { tool: observation.tool, message: observation.message }],
    context: { version: 1, revision: 5, summary: '', constraints: [], receipts: [], canCompact: false } };
  const report = { at: new Date(started).toISOString(), boundary: '生产鉴权HTTP/Gateway及真实本机模型；所有业务回执为替身，只验证计划，不执行队列写入或播放', passed: false, records: [] };
  const call = async () => {
    let jobId;
    try {
      let result = await request('/v1/ai/interpret', { scene: 'assistant.plan', input, selection: { reasoning: 'low' },
        trace: { conversationId: id, turnId: id, userManaged: true, startedAt: started } });
      jobId = result.jobId;
      const deadline = Date.now() + 105000;
      while (result.status === 'pending') {
        if (Date.now() >= deadline) throw new Error('验证等待超时');
        await new Promise(resolve => setTimeout(resolve, 750));
        result = await request(`/v1/ai/jobs/${jobId}`);
      }
      report.records.push({ data: result.data, execution: result.execution, toolContext: result.toolContext });
      console.log(JSON.stringify({ step: result.data, elapsedMs: result.execution.elapsedMs, attempts: result.execution.attempts?.map(a => ({ reasoning: a.reasoning, status: a.status, elapsedMs: a.elapsedMs })) }));
      return result.data;
    } catch (error) { if (jobId) await request(`/v1/ai/jobs/${jobId}/cancel`, {}).catch(() => {}); throw error; }
  };
  const receipt = (tool, data) => {
    input.observations.push({ tool, status: 'done', message: '测试替身成功回执，未执行真实业务。', data });
    input.completedSteps.push({ tool, message: '测试替身成功回执。' });
    input.context.revision++;
  };
  try {
    const first = await call();
    assert.deepEqual(first.steps, [{ tool: 'music.state', args: {} }]); assert.equal(first.continue, true);
    const before = 'a'.repeat(64), after = 'b'.repeat(64);
    receipt('music.state', { status: 'ready', revision: before, count: 2, mode: 'sequence', isPlaying: false });
    const second = await call();
    assert.deepEqual(second.steps, [{ tool: 'music.queue.apply', args: { ref: 'r10', mode: 'append', startPlayback: false, expectedRevision: before } }]);
    assert.equal(second.continue, true);
    receipt('music.queue.apply', { status: 'ready', revision: after, count: 52, mode: 'sequence', isPlaying: false });
    const third = await call();
    assert.deepEqual(third.steps, [{ tool: 'music.queue.play', args: { expectedRevision: after, mode: 'shuffle' } }]);
    report.passed = true;
  } catch (error) { report.error = error.message; if (error.result) report.failure = error.result; process.exitCode = 1; }
  report.elapsedMs = Date.now() - started;
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-queue-recovery-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, elapsedMs: report.elapsedMs, report: output.pathname }));
}
