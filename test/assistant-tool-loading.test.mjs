import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { plan } from '../local-ai/assistant-service.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';

const text = '检查队列是否有歌曲？有，则清空\n搜索许巍热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队里中的歌曲';
const step = (tool, args = {}) => ({ steps: [{ tool, args }], continue: true });
const receipt = (status = 'stale', revision = 'saved') => ({ tool: 'music.state', status: 'done', message: '本地保存队列有50首，尚待核对。', data: { status, revision, count: 50, source: 'cache', isPlaying: false } });
const reconcile = revision => step('music.queue.reconcile', { action: 'clear', expectedRevision: revision });
function storage() {
  const values = {};
  return { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
}

test('截图回归：最新过期/异常缓存回执按需补齐核对工具，原始清空计划可通过', async () => {
  for (const status of ['stale', 'unavailable']) {
    const result = await plan({ app: 'music', text, observations: [receipt(status)] }, {
      async generateObject({ instructions, input }) {
        assert.ok(input.toolGroups.includes('music.queue'));
        assert.match(instructions, /"music.queue.reconcile":/);
        return reconcile('saved');
      }
    });
    assert.deepEqual(result.data, reconcile('saved'));
    assert.ok(result.toolContext.loadedGroups.includes('music.queue'));
  }
  const kept = step('music.queue.reconcile', { action: 'keep', expectedRevision: 'saved' });
  assert.deepEqual((await plan({ app: 'music', text: '保留并恢复过期队列，不要播放', observations: [receipt()] }, { generateObject: async () => kept })).data, kept);
  assert.deepEqual((await plan({ text, observations: [receipt()] }, { generateObject: async () => reconcile('saved') })).data, reconcile('saved'), '未显式选应用时仍复用音乐场景推断');
  assert.deepEqual((await plan({ app: 'music', text, observations: [receipt()] }, { generateObject: async () => reconcile('old') })).data, step('music.state'), '曝光工具不能放行旧版本');
});

test('不从旧回执、失败、unknown或无版本记录预加载，不扩大普通查询或其他应用目录', async () => {
  const cases = [
    { observations: [] },
    { observations: [receipt('ready')] },
    { observations: [receipt('stale', '')] },
    { observations: [receipt('stale', 5)] },
    { observations: [{ ...receipt(), status: 'failed' }] },
    { observations: [{ ...receipt(), status: 'unknown' }] },
    { observations: [receipt(), receipt('ready', 'new')] },
    { observations: [receipt(), { ...receipt(), tool: 'music.queue.reconcile', status: 'unknown', data: null }] },
    { text: '检查队列是否有歌曲', observations: [receipt()] },
    { app: 'alarm', observations: [receipt()] }
  ];
  for (const input of cases) await plan({ app: 'music', text, ...input }, {
    async generateObject({ input, instructions }) {
      assert.ok(!input.toolGroups.includes('music.queue'));
      assert.doesNotMatch(instructions, /"music.queue.reconcile":/);
      return { question: '测试不执行业务' };
    }
  });
});

test('未加载错误提供具体工具和有效加载计划；禁用入口及非法参数仍拒绝', async () => {
  const input = { app: 'music', text: '查看队列' };
  await assert.rejects(plan(input, { generateObject: async () => step('music.queue.list') }), error => {
    assert.equal(error.code, 'ASSISTANT_PLAN_INVALID');
    assert.match(error.message, /music.queue.list 尚未加载/);
    assert.ok(error.message.includes(JSON.stringify(step('tools.load', { group: 'music.queue' }))));
    assert.ok(error.message.length < 400, '错误可以完整通过Engine的恢复观察通道');
    return true;
  });
  await assert.rejects(plan(input, { generateObject: async () => step('music.intent', { text: '查看队列' }) }), /music.intent 本轮不可用，不能通过加载工具组启用/);
  await assert.rejects(plan(input, { generateObject: async () => step('music.queue.list', { limit: 'all' }) }), /分页/);
  await assert.rejects(plan({ app: 'alarm', text: '查看复杂需求', observations: [receipt()] }, { generateObject: async () => reconcile('saved') }), /范围/);
});

test('真实Engine预加载最终目标，缺失的前置工具仍收到加载建议并计入原预算', async () => {
  let calls = 0, plays = 0;
  const gateway = createGateway({ provider: { async generateObject({ input }) {
    if (input.planningPhase === 'outline') return { todoTips: [{ text: '核对并播放队列', source: 0, tool: 'music.queue.play' }] };
    switch (calls++) {
      case 0: return step('music.queue.list');
      case 1:
        assert.match(input.observations.at(-1).data.error.message, /music.queue.list 尚未加载/);
        assert.match(input.observations.at(-1).data.error.message, /"group":"music.queue"/);
        return step('tools.load', { group: 'music.queue' });
      case 2:
        assert.equal(input.observations.at(-1).tool, 'tools.load');
        assert.ok(input.toolGroups.includes('music.queue'));
        return step('music.queue.list');
      case 3: return step('music.queue.play', { expectedRevision: 'saved' });
      case 4: return { done: true };
      default: assert.fail('不得继续重试');
    }
  } } });
  const store = storage();
  const handlers = Tools.create({ storage: store, readMusicState: async () => ({ ...receipt('ready').data, songs: [] }),
    playCurrentQueue: async revision => { assert.equal(revision, 'saved'); plays++; return { status: 'ready', revision: 'playing', count: 50, mode: 'sequence', isPlaying: true }; },
    ai: async r => ({ ok: true, ...await gateway.run(r.scene, r.input, { trace: r.trace, selection: r.selection }) }) });
  const engine = Engine.create({ storage: store, ...handlers });
  await engine.submit({ app: 'music', text: '核对并播放队列' });
  const task = await engine.settled();
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 1);
  assert.equal(calls, 5); assert.equal(plays, 1);
  assert.equal(gateway.describe().usage.admitted, 6); // Includes the outline phase.
});

function workflow({ earlyDone = false, omitContinue = false } = {}) {
  let earlyDoneReturned = false;
  let calls = 0, layaCalls = 0;
  let state = { ...receipt().data, songs: [] };
  const effects = [], control = createControlStore();
  control.update({ ...control.snapshot().policy, layaMode: 'assist' }, 1);
  const gateway = createGateway({ control, layaProvider: { async predict() { layaCalls++; throw new Error('unavailable'); } }, provider: {
    planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }),
    async generateObject({ input }) {
      assert.equal(input.text, text, '保留完整两位歌手及随机播放要求');
      if (input.planningPhase === 'outline') return { todoTips: [
          { text: '检查并清空队列', source: 0, tool: 'music.queue.clear' },
          { text: '追加许巍热歌', source: 1, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
          { text: '追加法老热歌', source: 2, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
          { text: '随机播放', source: 3, tool: 'music.queue.play', args: { mode: 'shuffle' } }
        ] };
      const last = input.observations.at(-1);
      const revision = input.observations.findLast(row => row.status === 'done' && row.data?.revision)?.data.revision;
      if (earlyDone && calls === 2 && !earlyDoneReturned) { earlyDoneReturned = true; return { done: true }; }
      if (earlyDoneReturned && calls === 2) assert.match(last.message, /Todo 尚未完成/);
      switch (calls++) {
        case 0: assert.ok(!input.toolGroups.includes('music.queue')); return step('music.state');
        case 1: assert.ok(input.toolGroups.includes('music.queue')); return reconcile(revision);
        case 2: return { ...step('music.search', { kind: 'artist', query: '许巍' }), ...(omitContinue ? { continue: false } : {}) };
        case 5: return step('music.search', { kind: 'artist', query: '法老' });
        case 3: case 6: return step('music.collection.get', { ref: last.data.selectedRef });
        case 4: case 7: return step('music.queue.apply', { ref: last.data.ref, mode: 'append', startPlayback: false, expectedRevision: revision });
        case 8: return step('music.queue.play', { mode: 'shuffle', expectedRevision: revision });
        case 9: return { done: true };
        default: assert.fail('不得重放已完成业务');
      }
    }
  } });
  const store = storage();
  const handlers = Tools.create({ storage: store,
    memory: async () => ({ ok: true, enabled: false }),
    ai: async r => ({ ok: true, ...await gateway.run(r.scene, r.input, { trace: r.trace, selection: r.selection }) }),
    readMusicState: async () => structuredClone(state),
    reconcileMusicQueue: async (action, revision) => {
      assert.equal(action, 'clear'); assert.equal(revision, state.revision);
      effects.push('clear'); state = { ...state, status: 'empty', revision: 'cleared', count: 0 }; return state;
    },
    netease: async (path, params) => {
      if (path.includes('search')) {
        assert.equal(params.type, 100);
        const name = params.s; assert.ok(['许巍', '法老'].includes(name));
        effects.push(`search:${name}`);
        return { code: 200, result: { artists: [{ id: name === '许巍' ? 101 : 102, name }] } };
      }
      assert.ok(['/api/artist/top/song', '/api/v1/artist'].includes(path));
      return { code: 200, songs: [{ id: Number(params.id) + 1000, name: '测试热歌', ar: [{ name: '测试歌手' }], dt: 180000 }] };
    },
    applyMusicQueue: async (songs, args) => {
      assert.equal(args.expectedRevision, state.revision); assert.equal(args.mode, 'append'); assert.equal(args.startPlayback, false);
      assert.equal(songs.length, 1); effects.push('append');
      state = { ...state, status: 'ready', revision: `append-${effects.length}`, count: state.count + 1, songs: [...state.songs, ...songs] }; return state;
    },
    playCurrentQueue: async (revision, ref, ctx, mode) => {
      assert.equal(revision, state.revision); assert.equal(mode, 'shuffle'); assert.equal(state.count, 2);
      effects.push('shuffle'); return { ...state, revision: 'playing', isPlaying: true, mode };
    }
  });
  const engine = Engine.create({ storage: store, ...handlers });
  return { engine, effects, stats: () => ({ calls, layaCalls }) };
}

test('真实Engine/Tools + Laya不可用：过期队列清空需确认，两位歌手各追加一次，随机播放一次', async () => {
  const f = workflow();
  await f.engine.submit({ app: 'music', text });
  let task = await f.engine.settled();
  assert.equal(task.status, 'review', task.message); assert.deepEqual(f.effects, []);
  await f.engine.choose(task.id, 'queue-reconcile-clear', task.version);
  for (let i = 0; i < 2; i++) {
    task = await f.engine.settled();
    assert.equal(task.status, 'waiting', task.message);
    await f.engine.choose(task.id, task.choices.find(c => c.kind === 'artist' && !c.secondary).id, task.version);
  }
  task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.equal(task.recoveryCount, 0);
  assert.deepEqual(f.effects, ['clear', 'search:许巍', 'append', 'search:法老', 'append', 'shuffle']);
  assert.deepEqual(f.stats(), { calls: 10, layaCalls: 1 });
});

test('取消过期队列清空确认后不写入、不搜索、不播放，旧确认不可提交', async () => {
  const f = workflow();
  await f.engine.submit({ app: 'music', text });
  const task = await f.engine.settled();
  assert.equal(task.status, 'review', task.message);
  await f.engine.cancel(task.id);
  await assert.rejects(f.engine.choose(task.id, 'queue-reconcile-clear', task.version));
  assert.deepEqual(f.effects, []);
  assert.equal((await f.engine.settled()).status, 'cancelled');
});

 test('Todo 回归：清空后错误 done 被拒绝；漏写 continue 仍完成两位歌手和随机播放', async () => {
  const f = workflow({ earlyDone: true, omitContinue: true });
  await f.engine.submit({ app: 'music', text });
  let task = await f.engine.settled();
  assert.equal(task.status, 'review');
  assert.equal(task.todoTips.items.length, 4);
  assert.equal(task.todoTips.items[0].status, 'review');
  assert.ok(task.todoTips.items.slice(1).every(row => row.status === 'pending'));
  await f.engine.choose(task.id, 'queue-reconcile-clear', task.version);
  for (let i = 0; i < 2; i++) {
    task = await f.engine.settled();
    assert.equal(task.status, 'waiting', task.message);
    assert.ok(task.todoTips.items[0].receiptId);
    assert.equal(task.todoTips.items.filter(row => row.status === 'completed').length, i + 1);
    await f.engine.choose(task.id, task.choices.find(c => c.kind === 'artist' && !c.secondary).id, task.version);
  }
  task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message);
  assert.ok(task.todoTips.items.every(row => row.status === 'completed' && row.receiptId));
  assert.deepEqual(f.effects, ['clear', 'search:许巍', 'append', 'search:法老', 'append', 'shuffle']);
});
