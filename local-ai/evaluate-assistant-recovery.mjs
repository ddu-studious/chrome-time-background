// Production Engine/Tools + authenticated model Gateway, synthetic read failure only.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';

if (!process.argv.includes('--live')) {
  console.log('使用 --live 验证真实模型根据模拟读取错误重新规划；无真实账号或播放器操作。');
} else {
  const token = readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET', headers,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '本机请求失败');
    return result;
  };
  const control = await request('/v1/control');
  assert.ok(control.ok && control.jobs.length === 0, '本机服务未就绪或已有模型任务');
  const started = Date.now(), values = {}, inputs = [], calls = [];
  let reads = 0;
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage,
    readMusicState: async () => {
      if (++reads === 1) throw Object.assign(new Error('模拟：播放器状态接口暂时不可用，请重新查询状态'), { code: 'PLAYER_STATE_UNAVAILABLE' });
      return { status: 'ready', revision: 'fixture-only-v2', count: 50, isPlaying: false, mode: 'sequence',
        songs: Array.from({ length: 50 }, (_, index) => ({ songId: `fixture-${index}`, title: `模拟曲目${index + 1}`, artist: '测试歌手' })) };
    },
    ai: async message => {
      let result;
      if (message.action === 'ai_scene_submit') {
        assert.equal(message.scene, 'assistant.plan');
        inputs.push(message.input);
        result = await request('/v1/ai/interpret', { scene: message.scene, input: message.input, selection: message.selection, trace: message.trace });
      } else if (message.action === 'ai_scene_result') result = await request(`/v1/ai/jobs/${message.jobId}`);
      else if (message.action === 'ai_job_cancel') return request(`/v1/ai/jobs/${message.jobId}/cancel`, {});
      else throw new Error('验证不允许其他AI入口');
      if (result.execution) {
        calls.push({ data: result.data, execution: result.execution });
        console.log(JSON.stringify({ elapsedMs: result.execution.elapsedMs, status: result.status, plan: result.data, usage: result.execution.usage }));
      }
      return result;
    }
  });
  const engine = Engine.create({ storage, ...handlers, cancelJob: jobId => request(`/v1/ai/jobs/${jobId}/cancel`, {}) });
  const report = { at: new Date(started).toISOString(), boundary: '真实Engine/Tools + 生产HTTP/Gateway + 真实本机模型；所有工具依赖为隔离替身，仅模拟一次读取失败', passed: false, calls };
  let timer;
  try {
    const task = await engine.submit({ app: 'music', text: '读取当前播放队列，确认歌曲数量，不要修改队列或播放。', ai: { reasoning: 'off' } });
    timer = setTimeout(() => { void engine.cancel(task.id); }, 180000);
    report.task = await engine.settled();
    report.reads = reads;
    assert.equal(report.task.status, 'completed', report.task.message);
    assert.ok(reads >= 2, '第一次失败、后续查询成功');
    assert.ok(report.task.recoveryCount >= 1 && report.task.recoveryCount <= 3);
    assert.equal(inputs[1].observations.at(-1).status, 'failed');
    assert.equal(inputs[1].observations.at(-1).data.error.code, 'PLAYER_STATE_UNAVAILABLE');
    assert.ok(report.task.log.filter(row => row.status === 'done').every(row => ['music.state', 'music.queue.list', 'tools.load'].includes(row.tool)));
    assert.match(report.task.message, /50/);
    report.passed = true;
  } catch (error) { report.error = error.message; process.exitCode = 1; }
  finally { clearTimeout(timer); }
  report.elapsedMs = Date.now() - started;
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-recovery-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, reads, elapsedMs: report.elapsedMs, report: output.pathname }));
}
