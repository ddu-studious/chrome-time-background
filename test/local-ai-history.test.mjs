import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createServer } from '../local-ai/server.mjs';
import Engine from '../js/assistant-engine.js';
import Sessions from '../js/assistant-session.js';

function file(t) { const dir = mkdtempSync(join(tmpdir(), 'ai-history-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return join(dir, 'history.json'); }
const row = (id, now = Date.now()) => ({ requestId: id, scene: 'music.intent', startedAt: now, status: 'pending', source: null });
const event = (id = 'message-1', conversationId = 'conversation-1') => ({ id, conversationId, scene: 'assistant', role: 'user', content: '私人问题' });

test('默认仅元数据，开启后保存正文且去除敏感字段，重启后模型参数不变', t => {
  const path = file(t), store = createHistoryStore({ file: path });
  const first = store.begin(row('r1'), { text: '不保存的原句' });
  store.finish(first, { ...row('r1'), status: 'ready', model: 'qwen/test', reasoning: 'low' }, { text: '不保存的回答' });
  store.event(event());
  assert.doesNotMatch(readFileSync(path, 'utf8'), /不保存|私人问题/);
  store.configure({ captureContent: true, retentionDays: 30 }, 1);
  const ticket = store.begin(row('r2'), { text: '要保存', token: 'secret', audio: 'base64-secret', nested: { Authorization: 'secret', text: '内容' } });
  store.finish(ticket, { ...row('r2'), status: 'ready', model: 'qwen/second', reasoning: 'off', usage: { inputTokens: 20 } }, { answer: '回答' });
  store.event(event('m2')); store.event(event('m2'));
  const restored = createHistoryStore({ file: path }).snapshot();
  assert.equal(restored.calls[0].model, 'qwen/test'); assert.equal(restored.calls[0].reasoning, 'low');
  assert.equal(restored.calls[1].input.text, '要保存'); assert.equal(restored.calls[1].output.answer, '回答');
  assert.equal(restored.events.length, 2); assert.doesNotMatch(readFileSync(path, 'utf8'), /secret|base64/);
});

test('重启把处理中标记中断，留存期限清理持久化；缩短期限会清理旧记录', t => {
  let now = 100 * 86400000; const path = file(t);
  const store = createHistoryStore({ file: path, now: () => now });
  store.begin(row('pending', now), {});
  assert.equal(createHistoryStore({ file: path, now: () => now }).snapshot().calls[0].status, 'interrupted');
  now += 8 * 86400000;
  store.configure({ captureContent: false, retentionDays: 7 }, 1);
  assert.equal(createHistoryStore({ file: path, now: () => now }).snapshot().calls.length, 0);
});

test('删除会话和清空后，迟到的模型结果和会话事件均不复活；其他调用可正常结束', () => {
  const store = createHistoryStore();
  const ticket = store.begin(row('r1'), {}, { conversationId: 'conversation-1' });
  const other = store.begin(row('r2'), {}, { conversationId: 'conversation-2' });
  store.event(event()); store.remove({ conversationId: 'conversation-1' });
  store.finish(ticket, { status: 'ready' }, {}); store.event(event('late'));
  store.finish(other, { status: 'ready' }, {});
  assert.equal(store.snapshot().calls.length, 1); assert.equal(store.snapshot().calls[0].status, 'ready'); assert.equal(store.snapshot().events.length, 0);
  const later = store.begin(row('r3'), {}); store.remove({ all: true }); store.finish(later, { status: 'ready' }, {});
  assert.equal(store.snapshot().calls.length, 0);
});

test('正文开关遵守提交时和完成时设置，旧元数据不能事后补正文', () => {
  const store = createHistoryStore();
  const a = store.begin(row('a'), { text: '关闭时提交' });
  store.configure({ captureContent: true, retentionDays: 30 }, 1);
  store.finish(a, { status: 'ready' }, { text: '不可事后补正文' });
  const b = store.begin(row('b'), { text: '开启时提交' });
  store.configure({ captureContent: false, retentionDays: 30 }, 2);
  store.finish(b, { status: 'ready' }, { text: '关闭后的回复' });
  assert.equal(store.snapshot().calls[0].input, undefined); assert.equal(store.snapshot().calls[0].output, undefined);
  assert.equal(store.snapshot().calls[1].input.text, '开启时提交'); assert.equal(store.snapshot().calls[1].output, undefined);
  assert.throws(() => store.configure({ captureContent: true, retentionDays: 30 }, 1), /已变化/);
});

test('网关关联会话，锁定当次策略与实测 token；取消留存状态准确', async () => {
  const history = createHistoryStore(), control = createControlStore();
  control.update({ ...control.snapshot().policy, model: 'chosen/model', reasoning: 'low' }, 1);
  const gateway = createGateway({ history, control, provider: { model: 'default', async generateObject(options) { options.onUsage({ inputTokens: 19, outputTokens: 12 }); return { status: 'needs_clarification', question: '几点？' }; } } });
  await gateway.run('alarm.interpret', { text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' }, { trace: { conversationId: 'c1', turnId: 'turn-1', userManaged: true } });
  const saved = history.snapshot();
  assert.equal(saved.calls[0].conversationId, 'c1'); assert.equal(saved.calls[0].model, 'chosen/model'); assert.equal(saved.calls[0].reasoning, 'low'); assert.deepEqual(saved.calls[0].usage, { inputTokens: 19, outputTokens: 12 });
  assert.equal(saved.events.length, 0);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(gateway.run('alarm.interpret', { text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' }, { signal: abort.signal }));
  assert.equal(history.snapshot().calls.at(-1).status, 'cancelled');
});

test('快捷助手追问共享会话、不同任务独立，历史写入失败不阻止动作', async () => {
  const values = {}, events = []; let id = 0, failHistory = false;
  const engine = Engine.create({ storage: { async get() { return values; }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } }, id: () => `task-${++id}`, history: async e => { if (failHistory) throw new Error('offline'); events.push(e); }, plan: async input => input.text === '开始' ? { question: '请补充', steps: [] } : { steps: [{ tool: 'music.intent', args: { text: '暂停' } }] }, execute: async () => ({ message: '已暂停' }) });
  await engine.submit({ text: '开始' }); await engine.settled();
  await engine.submit({ text: '继续' }); await engine.settled();
  assert.equal(events.filter(e => e.role === 'user').length, 2); assert.equal(new Set(events.map(e => e.conversationId)).size, 1);
  failHistory = true; await engine.submit({ text: '新的' }); await engine.settled();
  assert.equal((await engine.snapshot()).status, 'completed'); assert.match((await engine.snapshot()).historyWarning, /未留存/);
});

test('历史 HTTP 需要鉴权，设置和事件不会改变模型策略或今日计数', async t => {
  const server = createServer({ token: 'a'.repeat(64), historyFile: file(t) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/v1/history')).status, 401);
  const request = async (path, body) => (await fetch(base + path, { headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })).json();
  await request('/v1/history', { operation: 'configure', revision: 1, settings: { captureContent: true, retentionDays: 30 } });
  await request('/v1/history', { operation: 'event', event: event() });
  assert.equal((await request('/v1/history')).events[0].content, '私人问题');
  const tool = { role: 'tool', id: 'http-tool', conversationId: 'conversation-1', turnId: 'turn-1', tool: 'music.search', title: '搜索音乐', kind: 'tool', startedAt: Date.now(), phase: 'start', input: { query: '张杰' } };
  assert.equal((await request('/v1/history', { operation: 'event', event: tool })).ok, true);
  assert.equal((await request('/v1/history', { operation: 'event', event: { ...tool, phase: 'end', status: 'succeeded', endedAt: tool.startedAt + 50, output: { count: 50 } } })).ok, true);
  assert.equal((await request('/v1/history')).tools[0].elapsedMs, 50);
  const control = await request('/v1/control'); assert.equal(control.revision, 1); assert.equal(control.usage.admitted, 0);
  assert.equal((await request('/v1/history', { operation: 'clear' })).ok, false);
  assert.equal((await request('/v1/history', { operation: 'clear', confirm: true })).events.length, 0);
});

test('音乐先完成再回显不重复计数用户输入，候选点击仍留存实际消息', async () => {
  const events = [], session = Sessions.create('music', undefined, { history: async e => { events.push(e); return { ok: true }; } });
  const request = session.request('播放晴天'); session.set({ currentSource: 'rules' }); session.end(); session.reply('播放晴天', '已开始播放', 'completed');
  session.reply('选择第 2 个：现场版', '正在播放现场版', 'completed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(request.trace.userManaged, true);
  assert.deepEqual(events.filter(e => e.role === 'user').map(e => e.content), ['播放晴天', '选择第 2 个：现场版']);
  assert.deepEqual(events.filter(e => e.role === 'assistant').map(e => e.content), ['已开始播放', '正在播放现场版']);
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
});
