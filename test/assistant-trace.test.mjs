import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';

const memory = () => { const data = {}; return { async get() { return structuredClone(data); }, async set(v) { Object.assign(data, structuredClone(v)); }, async remove(k) { delete data[k]; } }; };
function historyFixture(t) { const dir = mkdtempSync(join(tmpdir(), 'assistant-trace-')); t.after(() => rmSync(dir, { recursive: true, force: true })); const file = join(dir, 'history.json'); return { file, history: createHistoryStore({ file }) }; }
const span = (id = 'tool-1', start = Date.now()) => ({ role: 'tool', id, conversationId: 'c1', turnId: 't1', startedAt: start, phase: 'start', kind: 'tool', tool: 'music.search', title: '搜索音乐', input: { query: '张杰' } });

test('工具元数据与正文开关分离、首尾去重、旧文件兼容、关闭期间输出不补记', t => {
  const { file, history } = historyFixture(t); const first = span();
  history.event(first); history.event(first);
  history.configure({ captureContent: true, retentionDays: 30 }, 1);
  history.event({ ...first, phase: 'end', status: 'succeeded', endedAt: first.startedAt + 20, output: { songs: ['未开启时提交'] } });
  assert.equal(history.snapshot().tools.length, 1); assert.equal(history.snapshot().tools[0].input, undefined); assert.equal(history.snapshot().tools[0].output, undefined);
  const next = span('tool-2'); history.event(next);
  history.configure({ captureContent: false, retentionDays: 30 }, 2);
  history.event({ ...next, phase: 'end', status: 'failed', endedAt: next.startedAt + 90, error: { message: 'private' } });
  assert.equal(history.snapshot().tools[1].input.query, '张杰'); assert.equal(history.snapshot().tools[1].error, undefined);
  const saved = JSON.parse(readFileSync(file, 'utf8')); delete saved.tools; writeFileSync(file, JSON.stringify(saved));
  assert.deepEqual(createHistoryStore({ file }).snapshot().tools, []);
});

test('删除、清空、重启后迟到结束不得恢复或改写终态；回执必须匹配调用', t => {
  const { file, history } = historyFixture(t); const start = span(); history.event(start);
  assert.throws(() => history.event({ ...start, phase: 'end', conversationId: 'evil', status: 'succeeded', endedAt: start.startedAt + 1 }), /不匹配/);
  const restored = createHistoryStore({ file });
  assert.equal(restored.snapshot().tools[0].status, 'interrupted');
  restored.event({ ...start, phase: 'end', status: 'succeeded', endedAt: start.startedAt + 10 });
  assert.equal(restored.snapshot().tools[0].status, 'interrupted');
  restored.remove({ conversationId: 'c1' }); restored.event(start); restored.event({ ...start, phase: 'end', status: 'succeeded', endedAt: start.startedAt + 20 });
  assert.equal(restored.snapshot().tools.length, 0);
  const another = { ...span('another'), conversationId: 'c2' }; restored.event(another); restored.remove({ all: true });
  restored.event({ ...another, phase: 'end', status: 'succeeded', endedAt: another.startedAt + 20 }); assert.equal(restored.snapshot().tools.length, 0);
});

test('真实执行器记录搜索失败回退、热门歌曲读取、队列操作，并排除凭证和播放链接', async t => {
  const { file, history } = historyFixture(t); history.configure({ captureContent: true, retentionDays: 30 }, 1);
  const storage = memory(), effects = [];
  const handlers = Tools.create({ storage, netease: async (path, params) => {
    if (path.includes('cloudsearch')) return { code: 500, message: '暂不可用' };
    if (path.includes('artist/top')) return { code: 200, songs: [{ id: 1, name: '明天过后', ar: [{ name: '张杰' }] }] };
    return { code: 200, result: { artists: [{ id: 7, name: '张杰' }] }, token: 'sensitive', cookie: 'sensitive' };
  }, playQueue: async (songs, ctx) => { effects.push(songs); return ctx.trace('music.playback.confirm', '确认播放器状态', { songId: songs[0].songId }, async () => ({ ok: true, url: 'https://secret.test/play?token=sensitive', song: songs[0], queueLength: songs.length })); } });
  const engine = Engine.create({ storage, ...handlers, plan: async () => ({ steps: [{ tool: 'music.search', args: { kind: 'artist', query: '张杰' } }] }), history: e => history.event(e) });
  await engine.submit({ app: 'music', text: '张杰 top 歌曲' }); let task = await engine.settled();
  assert.equal(task.status, 'waiting');
  const choice = task.choices.find(c => c.action === 'music.enqueue-collection'); assert.ok(choice);
  await engine.choose(task.id, choice.id, task.version); task = await engine.settled();
  assert.equal(task.status, 'completed'); assert.equal(effects.length, 1);
  const data = history.snapshot(), rows = data.tools;
  assert.equal(data.events.filter(e => e.role === 'user').length, 2);
  assert.equal(rows.filter(r => r.kind === 'tool').length, 1); assert.equal(rows.filter(r => r.kind === 'action').length, 1);
  assert.ok(rows.some(r => r.kind === 'request' && r.status === 'failed'));
  assert.ok(rows.some(r => r.input?.[0] === '/api/artist/top/song' && r.status === 'succeeded'));
  assert.ok(rows.some(r => r.tool === 'service.playQueue' && r.status === 'succeeded'));
  const confirm = rows.find(r => r.tool === 'music.playback.confirm'); assert.equal(rows.find(r => r.id === confirm.parentId).tool, 'service.playQueue');
  assert.ok(rows.every(r => Number.isInteger(r.elapsedMs))); assert.doesNotMatch(readFileSync(file, 'utf8'), /sensitive|secret.test/);
});

test('取消立即结束所有未完成步骤，迟到成功不覆盖，也不执行后续工具', async () => {
  const history = createHistoryStore(), storage = memory(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const engine = Engine.create({ storage, history: e => history.event(e), plan: async () => ({ steps: [{ tool: 'music.intent', args: { text: '暂停' } }] }), execute: async (step, ctx) => ctx.trace('service.pending', '等待外部结果', {}, async () => { entered(); return new Promise(resolve => { release = resolve; }); }) });
  const task = await engine.submit({ text: '暂停' }); await started;
  await engine.cancel(task.id);
  assert.ok(history.snapshot().tools.filter(r => r.kind !== 'plan').every(r => r.status === 'cancelled'));
  release({ message: '迟到成功' }); await engine.settled();
  assert.ok(history.snapshot().tools.filter(r => r.kind !== 'plan').every(r => r.status === 'cancelled'));
  assert.equal((await engine.snapshot()).status, 'cancelled');
});

test('并行操作有独立 ID 和同一父级；记录服务失败仍完成业务', async () => {
  const history = createHistoryStore(), storage = memory();
  const engine = Engine.create({ storage, history: e => history.event(e), plan: async () => ({ steps: [{ tool: 'music.intent', args: { text: '搜索' } }] }), execute: async (step, ctx) => { await Promise.all([1, 2, 3].map(i => ctx.trace('service.parallel', '并行搜索', { i }, async () => ({ i })))); return { message: '完成' }; } });
  await engine.submit({ text: '搜索' }); await engine.settled();
  const rows = history.snapshot().tools.filter(r => r.tool === 'service.parallel');
  assert.equal(new Set(rows.map(r => r.id)).size, 3); assert.equal(new Set(rows.map(r => r.parentId)).size, 1);
  const offline = Engine.create({ storage: memory(), history: async () => { throw new Error('offline'); }, plan: async () => ({ steps: [{ tool: 'music.intent', args: { text: '暂停' } }] }), execute: async () => ({ message: '完成' }) });
  await offline.submit({ text: '暂停' }); await offline.settled(); assert.equal((await offline.snapshot()).status, 'completed'); assert.match((await offline.snapshot()).historyWarning, /未留存/);
});

test('模型调用关联实际工具步骤 ID', async () => {
  const history = createHistoryStore();
  const gateway = createGateway({ history, provider: { model: 'test', generateObject: async () => ({ action: 'search', kind: 'artist', query: '张杰' }) } });
  await gateway.run('music.intent', { text: '寻找张杰 top 歌曲' }, { trace: { conversationId: 'c1', turnId: 't1', toolCallId: 'tool-123', userManaged: true } });
  assert.equal(history.snapshot().calls[0].toolCallId, 'tool-123');
});
