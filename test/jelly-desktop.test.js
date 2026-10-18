// 桌面水母（独立于闹钟）：设置与迁移、常驻连接、状态下发、有界重连、喝水提醒气泡的委托。
// 用替身 storage / desktop 驱动真实模块代码，计时器由测试手动触发；不连接真实原生组件。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Jelly = require('../js/jelly-desktop.js');

function area(initial = {}) {
  const data = { ...initial };
  const writes = [];
  return {
    data, writes,
    get: async key => (typeof key === 'string' ? { [key]: data[key] } : Array.isArray(key) ? Object.fromEntries(key.map(k => [k, data[k]])) : { ...data }),
    set: async items => { writes.push(items); Object.assign(data, JSON.parse(JSON.stringify(items))); },
  };
}

function desktopStub(options = {}) {
  const calls = [];
  const desktop = {
    calls, port: options.port === undefined ? null : options.port, resident: false,
    setResident(on) { calls.push(['setResident', on]); desktop.resident = on === true; },
    async setJelly(jelly) {
      calls.push(['setJelly', jelly]);
      if (desktop.failJelly) throw new Error(desktop.failJelly);
      desktop.port = desktop.port || { fake: true };
      return { ok: true, version: desktop.version ?? 6, ...(desktop.assistantReply ? { assistant: desktop.assistantReply } : {}) };
    },
    async showNudge(nudge) {
      calls.push(['showNudge', nudge]);
      if (desktop.failNudge) throw new Error(desktop.failNudge);
      return { ok: true, version: 6 };
    },
    clearNudge(id) { calls.push(['clearNudge', id]); },
  };
  return desktop;
}

function env(options = {}) {
  const storage = area(options.storage);
  const desktop = desktopStub(options);
  const timers = [];
  const restored = [];
  const acts = [];
  const jelly = Jelly.create({
    storage, desktop,
    summary: options.summary === undefined ? async () => ({ lines: ['今天喝了 2 次水', '下次喝水提醒 14:30'], validUntil: 1760000000000 }) : options.summary,
    act: async (id, action) => { acts.push([id, action]); return { ok: true, text: '记下啦，今天第 1 次' }; },
    onRestored: () => { restored.push(Date.now()); },
    setTimer: (fn, ms) => { const handle = { fn, ms, cleared: false }; timers.push(handle); return handle; },
    clearTimer: handle => { if (handle) handle.cleared = true; },
  });
  const live = () => timers.filter(t => !t.cleared);
  return { jelly, storage, desktop, timers, live, restored, acts };
}
const pushes = e => e.desktop.calls.filter(c => c[0] === 'setJelly').map(c => c[1]);

// ---------- 设置 ----------

test('normalize：默认不常驻、夜晚荧光开；只有明确的 true 才常驻，只有明确的 false 才关夜晚荧光；未知键丢弃', () => {
  assert.deepEqual(Jelly.normalize(undefined), { resident: false, night: true });
  for (const bad of ['x', 5, [], true, null]) assert.deepEqual(Jelly.normalize(bad), { resident: false, night: true }, String(bad));
  for (const junk of [1, 'true', 'yes', {}, [], null, undefined, 0]) assert.equal(Jelly.normalize({ resident: junk }).resident, false, String(junk));
  assert.equal(Jelly.normalize({ resident: true }).resident, true);
  for (const junk of [0, null, '', 'false', 'off', {}, [], NaN, undefined]) assert.equal(Jelly.normalize({ night: junk }).night, true, `非布尔 false 不算关闭：${JSON.stringify(junk)}`);
  assert.equal(Jelly.normalize({ night: false }).night, false);
  assert.deepEqual(Object.keys(Jelly.normalize({ resident: true, evil: '<script>', __proto__: { x: 1 } })).sort(), ['night', 'resident']);
});

test('迁移：新键没有 night 时沿用旧闹钟倒计时设置里的 night；新键有就只认新键；旧 style 被忽略', () => {
  assert.equal(Jelly.normalize(undefined, { enabled: true, style: 'companion', night: false }).night, false);
  assert.equal(Jelly.normalize({}, { night: false }).night, false);
  assert.equal(Jelly.normalize({ night: true }, { night: false }).night, true, '新键优先');
  assert.equal(Jelly.normalize({ night: false }, { night: true }).night, false);
  assert.equal(Jelly.normalize(undefined, { night: 'no' }).night, true, '旧的奇怪值按开启处理');
  assert.deepEqual(Jelly.normalize(undefined, { style: 'capsule', enabled: false }), { resident: false, night: true });
  assert.equal(Jelly.KEY, 'desktopJellyV1');
});

test('get：读取设置与最近一次连接状态，不写存储、不动组件', async () => {
  const e = env({ storage: { userAlarmCountdownV1: { night: false } } });
  const result = await e.jelly.get();
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings, { resident: false, night: false });
  assert.deepEqual(result.status, { connected: false, version: 0, error: '' });
  assert.equal(e.storage.writes.length, 0);
  assert.equal(e.desktop.calls.length, 0);
});

test('set：只接受布尔字段，非法输入一律拒绝且不写存储', async () => {
  const e = env();
  for (const bad of [null, undefined, 'x', 5, [], { resident: 'true' }, { night: 0 }, { resident: 1 }, { resident: null }]) {
    const result = await e.jelly.set(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.error);
  }
  assert.equal(e.storage.writes.length, 0);
  assert.equal(e.desktop.calls.length, 0);
});

test('set：保存到 desktopJellyV1（未知键丢弃），把旧 night 一并写进新键；开常驻会连接组件并下发状态与今天的记录', async () => {
  const e = env({ storage: { userAlarmCountdownV1: { enabled: true, style: 'companion', night: false } } });
  const result = await e.jelly.set({ resident: true, evil: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings, { resident: true, night: false });
  assert.deepEqual(e.storage.data[Jelly.KEY], { resident: true, night: false });
  assert.deepEqual(e.desktop.calls[0], ['setResident', true]);
  assert.deepEqual(pushes(e), [{ resident: true, night: false, lines: ['今天喝了 2 次水', '下次喝水提醒 14:30'], linesUntil: 1760000000000 }]);
  assert.deepEqual(result.status, { connected: true, version: 6, error: '' });
  assert.deepEqual(e.storage.data.userAlarmCountdownV1, { enabled: true, style: 'companion', night: false }, '旧键原样保留，不由这里改写');
});

test('set：关闭常驻时没有连接就不会为了推送而启动组件；已有连接（倒计时在用）则推一次 resident:false', async () => {
  const e = env();
  await e.jelly.set({ resident: false });
  assert.equal(pushes(e).length, 0, '没有连接：不启动组件');
  assert.deepEqual(e.desktop.calls[0], ['setResident', false]);
  const busy = env({ port: { fake: true } });
  await busy.jelly.set({ resident: false });
  assert.deepEqual(pushes(busy).map(p => p.resident), [false]);
});

test('set：夜晚荧光开关在常驻关闭但组件正在显示时也会下发', async () => {
  const e = env({ port: { fake: true } });
  await e.jelly.set({ night: false });
  assert.deepEqual(pushes(e).map(p => [p.resident, p.night]), [[false, false]]);
  assert.deepEqual(e.storage.data[Jelly.KEY], { resident: false, night: false });
});

test('set：组件没装或太旧时设置照样保存，状态里给出原因；常驻时安排有界重连', async () => {
  const e = env();
  e.desktop.failJelly = '请更新桌面组件以启用桌面水母';
  const result = await e.jelly.set({ resident: true });
  assert.equal(result.ok, true, '设置已保存');
  assert.equal(e.storage.data[Jelly.KEY].resident, true);
  assert.deepEqual(result.status, { connected: false, version: 0, error: '请更新桌面组件以启用桌面水母' });
  assert.equal(e.live().length, 1);
  assert.equal(e.live()[0].ms, 2000);
  const off = env();
  off.desktop.failJelly = 'x';
  await off.jelly.set({ resident: false, night: false });
  assert.equal(off.live().length, 0, '不常驻就没有重连');
});

test('下发的“今天的记录”被清洗：最多 3 行、每行 40 字符、去控制字符、非有限的有效期记 0；summary 失败仍下发状态', async () => {
  const long = 'x'.repeat(100);
  const e = env({ summary: async () => ({ lines: ['a\u0000b\u202e', long, 5, null, 'd', 'e'], validUntil: Infinity }) });
  await e.jelly.set({ resident: true });
  const jelly = pushes(e)[0];
  assert.equal(jelly.lines.length, 3);
  assert.equal(jelly.lines[0], 'ab');
  assert.ok(jelly.lines.every(line => [...line].length <= 40));
  assert.equal(jelly.linesUntil, 0);
  const failing = env({ summary: async () => { throw new Error('boom'); } });
  await failing.jelly.set({ resident: true });
  assert.deepEqual(pushes(failing)[0].lines, []);
  assert.equal(failing.desktop.calls.some(c => c[0] === 'setJelly'), true);
  const missing = env({ summary: null });
  await missing.jelly.set({ resident: true });
  assert.deepEqual(pushes(missing)[0], { resident: true, night: true, lines: [], linesUntil: 0 });
});

test('restore：常驻时启动就建立连接并下发；不常驻时什么都不做（不启动组件）', async () => {
  const on = env({ storage: { [Jelly.KEY]: { resident: true, night: true } } });
  await on.jelly.restore();
  assert.deepEqual(on.desktop.calls[0], ['setResident', true]);
  assert.equal(pushes(on).length, 1);
  const off = env();
  await off.jelly.restore();
  assert.equal(pushes(off).length, 0);
  assert.deepEqual(off.desktop.calls, [['setResident', false]]);
});

test('sync：计数或设置变化后重新下发；常驻关着又没有连接时不启动组件', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: true } } });
  await e.jelly.sync();
  await e.jelly.sync();
  assert.equal(pushes(e).length, 2);
  const off = env();
  await off.jelly.sync();
  assert.equal(pushes(off).length, 0);
});

test('并发的 set / sync 串行执行，最后一次设置生效', async () => {
  const e = env();
  await Promise.all([e.jelly.set({ resident: true }), e.jelly.set({ resident: false }), e.jelly.set({ resident: true, night: false }), e.jelly.sync()]);
  assert.deepEqual(e.storage.data[Jelly.KEY], { resident: true, night: false });
  assert.equal(e.desktop.resident, true);
  assert.equal(pushes(e).at(-1).night, false);
});

// ---------- 钩子：新连接、连接丢失、水母菜单 ----------

test('新连接建立时先下发水母状态（组件由倒计时或提醒启动的也一样）', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: false, night: false } }, port: { fake: true } });
  e.desktop.onConnected();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pushes(e).map(p => [p.resident, p.night]), [[false, false]]);
  const resident = env({ storage: { [Jelly.KEY]: { resident: true, night: true } }, port: { fake: true } });
  resident.desktop.onConnected();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pushes(resident).map(p => p.resident), [true]);
});

test('连接丢失且常驻：按 2/5/15/60/300 秒有界退避重连，用完就停止并提示；再次成功后只通知一次“已恢复”', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: true } } });
  e.desktop.failJelly = '桌面提醒组件已断开';
  e.desktop.onPortLost({ quit: false });
  await new Promise(resolve => setImmediate(resolve));
  const delays = [];
  for (let i = 0; i < 8; i++) {
    const pending = e.live();
    if (!pending.length) break;
    assert.equal(pending.length, 1, '同一时刻只有一个重连计时器');
    delays.push(pending[0].ms);
    pending[0].cleared = true;
    await pending[0].fn();
  }
  assert.deepEqual(delays, Jelly.RETRY_MS);
  assert.deepEqual([...Jelly.RETRY_MS], [2000, 5000, 15000, 60000, 300000]);
  assert.equal(e.live().length, 0, '用完次数就不再无限重试');
  assert.match((await e.jelly.get()).status.error, /已停止自动重连/);
  assert.equal(e.restored.length, 0, '没成功过就没有“恢复”');
  // 用户重新打开常驻：从头再来
  await e.jelly.set({ resident: true });
  assert.equal(e.live().length, 1);
  assert.equal(e.live()[0].ms, 2000);
  // 组件回来了
  e.desktop.failJelly = '';
  const retry = e.live()[0];
  retry.cleared = true;
  await retry.fn();
  assert.equal(e.live().length, 0);
  assert.equal(e.restored.length, 1);
  assert.deepEqual((await e.jelly.get()).status, { connected: true, version: 6, error: '' });
});

test('重连成功后退避计数清零：恢复之后再掉线，仍从 2 秒开始而不是接着上次的档位', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: true } } });
  await e.jelly.restore();
  const lose = async () => { e.desktop.port = null; e.desktop.onPortLost({ quit: false }); await new Promise(resolve => setImmediate(resolve)); };
  const runNext = async expectedMs => {
    const retry = e.live()[0];
    assert.equal(retry.ms, expectedMs);
    retry.cleared = true;
    await retry.fn();
  };
  e.desktop.failJelly = '桌面提醒组件已断开';
  await lose();
  await runNext(2000);                       // 仍失败 → 排下一档
  e.desktop.failJelly = '';
  await runNext(5000);                       // 这次成功
  assert.equal(e.live().length, 0);
  assert.equal(e.restored.length, 1);
  e.desktop.failJelly = '桌面提醒组件已断开';
  await lose();
  assert.equal(e.live()[0].ms, 2000, '第二次掉线重新从第一档开始');
});

test('重连成功后会请外部重新下发倒计时（onRestored），第一次启动成功不算“恢复”', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: true } } });
  await e.jelly.restore();
  assert.equal(e.restored.length, 0);
  e.desktop.port = null;
  e.desktop.onPortLost({ quit: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.live().length, 1);
  const retry = e.live()[0];
  retry.cleared = true;
  await retry.fn();
  assert.equal(e.restored.length, 1);
  assert.equal(e.live().length, 0);
});

test('连接丢失但没有常驻：不重连（没有什么需要恢复）', async () => {
  const e = env();
  e.desktop.onPortLost({ quit: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.timers.length, 0);
});

test('用户从状态栏退出桌面组件：视为“不再常驻”并保存，不自动重连，连接层也不再按常驻处理', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: false } } });
  await e.jelly.restore();                                   // 常驻已经建立：连接层的 resident 为 true
  assert.equal(e.desktop.resident, true);
  const pushesBefore = pushes(e).length;
  e.desktop.port = null;
  e.desktop.onPortLost({ quit: true });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(e.storage.data[Jelly.KEY], { resident: false, night: false });
  assert.equal(e.live().length, 0);
  assert.equal(e.desktop.resident, false, '否则之后别的功能拉起的连接永远不会被空闲释放');
  assert.deepEqual(e.desktop.calls.filter(c => c[0] === 'setResident').at(-1), ['setResident', false]);
  assert.equal(pushes(e).length, pushesBefore, '组件已经退出，不为了通知它而重新启动');
});

test('水母右键菜单“收起”：只在连接里发来 resident:false 时保存为不常驻', async () => {
  const e = env({ storage: { [Jelly.KEY]: { resident: true, night: true } }, port: { fake: true } });
  e.desktop.onJellySetting({ resident: false });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.storage.data[Jelly.KEY].resident, false);
  assert.equal(e.desktop.resident, false);
  e.desktop.onJellySetting({ resident: true });
  e.desktop.onJellySetting({});
  e.desktop.onJellySetting(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.storage.data[Jelly.KEY].resident, false, '原生不能把常驻打开');
});

// ---------- 喝水 / 起身提醒气泡 ----------

const nudge = { id: 'jelly-nudge-water-1760000000000', kind: 'water', title: 't', text: 'x', buttons: [{ id: 'done', title: '喝了' }], ttl: 90 };

test('presenter.present：交给原生显示，原生确认才算 shown；失败抛出，由 JellyNudge 退回系统通知', async () => {
  const e = env();
  assert.deepEqual(await e.jelly.presenter.present(nudge), { shown: true });
  assert.deepEqual(e.desktop.calls.find(c => c[0] === 'showNudge')[1], nudge);
  e.desktop.failNudge = '桌面组件未响应，请检查是否已安装';
  await assert.rejects(e.jelly.presenter.present(nudge), /未响应/);
  e.desktop.failNudge = '';
  e.desktop.showNudge = async () => ({ ok: false });
  assert.deepEqual(await e.jelly.presenter.present(nudge), { shown: false });
  e.desktop.showNudge = async () => undefined;
  assert.deepEqual(await e.jelly.presenter.present(nudge), { shown: false });
});

test('presenter.cancel：让原生撤掉同一个 id 的气泡；失败不抛', async () => {
  const e = env();
  await e.jelly.presenter.cancel(nudge.id);
  assert.deepEqual(e.desktop.calls.at(-1), ['clearNudge', nudge.id]);
  e.desktop.clearNudge = () => { throw new Error('port gone'); };
  await assert.doesNotReject(async () => e.jelly.presenter.cancel(nudge.id));
});

test('气泡上的按钮由 act 注入处理：AlarmDesktop 的 onNudgeAction 指向它，结果原样回给原生', async () => {
  const e = env();
  const result = await e.desktop.onNudgeAction({ id: nudge.id, action: 'done', actionId: 'a1' });
  assert.deepEqual(result, { ok: true, text: '记下啦，今天第 1 次' });
  assert.deepEqual(e.acts, [[nudge.id, 'done']]);
});

test('与桌面连接对象的接线：create 会设置全部回调，不依赖外部再手工接', () => {
  const e = env();
  for (const hook of ['onConnected', 'onPortLost', 'onJellySetting', 'onNudgeAction']) assert.equal(typeof e.desktop[hook], 'function', hook);
});

// ---------- 范围 ----------

test('隐私与范围：模块不碰网络、活动/空闲状态、标签页与历史，不直接操作闹钟或通知', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/jelly-desktop.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|chrome\.idle|\.idle\b|sendMessage|tabs\.|history|cookies|innerHTML|\beval\(|chrome\.alarms|chrome\.notifications|getUserMedia|mediaDevices/);
});

// ---------- 桌面 AI 助手设置（独立键 desktopAssistantV1，协议 v7） ----------

const HOTKEY_VALID = [
  ['ctrl+shift+b', 'ctrl+shift+b'], ['ctrl+shift+space', 'ctrl+shift+space'], ['ctrl+option+a', 'ctrl+option+a'], ['ctrl+option+b', 'ctrl+option+b'],
  ['cmd+shift+1', 'shift+cmd+1'], ['option+cmd+f12', 'option+cmd+f12'], ['ctrl+option+shift+cmd+z', 'ctrl+option+shift+cmd+z'],
  ['CTRL+Shift+B', 'ctrl+shift+b'], ['shift+ctrl+b', 'ctrl+shift+b'], ['cmd+ctrl+f20', 'ctrl+cmd+f20'], ['  ctrl+shift+b  ', 'ctrl+shift+b'],
  ['shift+option+b', 'option+shift+b'], ['ctrl+cmd+0', 'ctrl+cmd+0'], ['option+cmd+f1', 'option+cmd+f1'],
  // 长度上限是 64 个 UTF-16 单元（含两端空白，规范化前就量）：恰好 64 通过
  [`ctrl+shift+b${' '.repeat(52)}`, 'ctrl+shift+b'], [`${' '.repeat(52)}ctrl+shift+b`, 'ctrl+shift+b'],
];
const HOTKEY_INVALID = ['', 'b', 'ctrl+b', 'shift+b', 'cmd+b', 'ctrl+shift', 'ctrl+shift+bb', 'ctrl+shift+b+c', 'b+ctrl+shift', 'ctrl+ctrl+b', 'shift+shift+b',
  'ctrl+shift+enter', 'ctrl+shift+f0', 'ctrl+shift+f21', 'ctrl+shift+f100', 'ctrl+shift+é', 'ctrl + shift + b', 'ctrl+alt+b', 'control+shift+b', 'command+shift+b',
  'ctrl+shift+', '+ctrl+shift+b', 'ctrl++b', 'ctrl+shift+B+', 'ctrl+shift+-', 'ctrl+shift+,', 'ctrl+shift+tab', 'ctrl+shift+ ', 'ctrl+shift+b+', 'x'.repeat(500),
  // 重复的修饰键：即使去重后仍有两个不同的修饰键也不行（只有“不同修饰键不足两个”的重复不能证明重复检查本身存在）
  'ctrl+shift+shift+b', 'ctrl+ctrl+shift+b', 'ctrl+option+ctrl+b', 'cmd+cmd+option+b', 'shift+option+shift+cmd+b',
  // 超过 64 个单元一律拒绝，哪怕去掉空白后是合法热键
  `ctrl+shift+b${' '.repeat(53)}`, `${' '.repeat(53)}ctrl+shift+b`, `${' '.repeat(30)}ctrl+shift+b${' '.repeat(30)}`,
  null, undefined, 5, true, {}, [], ['ctrl+shift+b']];

test('normalizeHotkey：规范化为固定修饰键顺序的小写串；至少两个修饰键且至少一个属于 ctrl/option/cmd；按键只允许 a–z、0–9、space、f1–f20', () => {
  for (const [input, expected] of HOTKEY_VALID) assert.equal(Jelly.normalizeHotkey(input), expected, String(input));
  for (const input of HOTKEY_INVALID) assert.equal(Jelly.normalizeHotkey(input), null, JSON.stringify(input));
  for (const key of 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) assert.equal(Jelly.normalizeHotkey(`ctrl+option+${key}`), `ctrl+option+${key}`, key);
  for (let n = 1; n <= 20; n++) assert.equal(Jelly.normalizeHotkey(`ctrl+option+f${n}`), `ctrl+option+f${n}`, `f${n}`);
});

test('快捷键预设：四个，默认 ctrl+shift+b，全部满足语法且互不重复', () => {
  assert.deepEqual([...Jelly.HOTKEY_PRESETS], ['ctrl+shift+b', 'ctrl+shift+space', 'ctrl+option+a', 'ctrl+option+b']);
  assert.equal(Jelly.DEFAULT_HOTKEY, 'ctrl+shift+b');
  for (const preset of Jelly.HOTKEY_PRESETS) assert.equal(Jelly.normalizeHotkey(preset), preset);
  assert.equal(new Set(Jelly.HOTKEY_PRESETS).size, Jelly.HOTKEY_PRESETS.length);
  assert.equal(Jelly.ASSISTANT_KEY, 'desktopAssistantV1');
});

test('normalizeAssistant：默认关闭、默认热键；只有明确的 true 才启用；非法热键回到默认；未知键丢弃', () => {
  assert.deepEqual(Jelly.normalizeAssistant(undefined), { enabled: false, hotkey: 'ctrl+shift+b' });
  for (const bad of ['x', 5, [], true, null]) assert.deepEqual(Jelly.normalizeAssistant(bad), { enabled: false, hotkey: 'ctrl+shift+b' }, String(bad));
  for (const junk of [1, 'true', 'yes', {}, [], null, undefined, 0]) assert.equal(Jelly.normalizeAssistant({ enabled: junk }).enabled, false, String(junk));
  assert.deepEqual(Jelly.normalizeAssistant({ enabled: true, hotkey: 'Ctrl+Option+A' }), { enabled: true, hotkey: 'ctrl+option+a' });
  for (const junk of ['b', '', 'ctrl+b', 5, null]) assert.equal(Jelly.normalizeAssistant({ enabled: true, hotkey: junk }).hotkey, 'ctrl+shift+b', String(junk));
  assert.deepEqual(Object.keys(Jelly.normalizeAssistant({ enabled: true, evil: '<script>' })).sort(), ['enabled', 'hotkey']);
});

test('get：默认的 AI 助手设置与状态（关闭、未常驻），不写存储、不动组件；既有 settings 与 status 的形状不变', async () => {
  const e = env();
  const result = await e.jelly.get();
  assert.deepEqual(result.settings, { resident: false, night: true });
  assert.deepEqual(result.status, { connected: false, version: 0, error: '' });
  assert.deepEqual(result.assistant, { enabled: false, hotkey: 'ctrl+shift+b', hotkeyStatus: 'off', needsResident: false });
  assert.equal(e.storage.writes.length, 0); assert.equal(e.desktop.calls.length, 0);
  const waiting = env({ storage: { [Jelly.ASSISTANT_KEY]: { enabled: true, hotkey: 'ctrl+option+a' } } });
  assert.deepEqual((await waiting.jelly.get()).assistant, { enabled: true, hotkey: 'ctrl+option+a', hotkeyStatus: 'off', needsResident: true });
});

test('set({assistant})：只认 enabled 布尔与合法热键，非法输入整体拒绝且不写存储；只写 desktopAssistantV1，不碰 desktopJellyV1', async () => {
  const e = env();
  for (const bad of [null, 'x', 5, [], { enabled: 'true' }, { enabled: 1 }, { hotkey: 'b' }, { hotkey: 5 }, { hotkey: 'ctrl+b' }, { enabled: true, hotkey: 'ctrl+shift+enter' }]) {
    const result = await e.jelly.set({ assistant: bad });
    assert.equal(result.ok, false, JSON.stringify(bad)); assert.ok(result.error);
  }
  assert.match((await e.jelly.set({ assistant: { hotkey: 'b' } })).error, /快捷键/);
  assert.equal(e.storage.writes.length, 0); assert.equal(e.desktop.calls.length, 0);
  const result = await e.jelly.set({ assistant: { enabled: true, hotkey: 'Ctrl+Option+A', evil: 1 } });
  assert.equal(result.ok, true);
  assert.deepEqual(e.storage.data[Jelly.ASSISTANT_KEY], { enabled: true, hotkey: 'ctrl+option+a' });
  assert.equal(Jelly.KEY in e.storage.data, false, '只改助手设置时不写水母外观键');
  assert.deepEqual(result.assistant.enabled, true); assert.equal(result.assistant.hotkey, 'ctrl+option+a');
  const partial = await e.jelly.set({ assistant: { hotkey: 'ctrl+shift+space' } });
  assert.deepEqual(e.storage.data[Jelly.ASSISTANT_KEY], { enabled: true, hotkey: 'ctrl+shift+space' }, '只改热键保留 enabled');
  assert.equal(partial.ok, true);
});

test('下发：只有常驻且已启用才带 assistant；关闭助手后再下发不带 assistant（原生据此注销）；旧存储没有助手键时 payload 不变', async () => {
  const e = env(); e.desktop.version = 7; e.desktop.assistantReply = { status: 'ok', hotkey: 'ctrl+shift+b' };
  await e.jelly.set({ resident: true });
  assert.equal('assistant' in pushes(e).at(-1), false, '助手未启用');
  await e.jelly.set({ assistant: { enabled: true } });
  assert.deepEqual(pushes(e).at(-1).assistant, { enabled: true, hotkey: 'ctrl+shift+b' });
  await e.jelly.set({ assistant: { hotkey: 'ctrl+option+b' } });
  assert.deepEqual(pushes(e).at(-1).assistant, { enabled: true, hotkey: 'ctrl+option+b' });
  await e.jelly.set({ assistant: { enabled: false } });
  assert.equal('assistant' in pushes(e).at(-1), false, '关闭后下发不带 assistant');
  await e.jelly.set({ assistant: { enabled: true } });
  await e.jelly.set({ resident: false });
  assert.equal('assistant' in pushes(e).at(-1), false, '没有常驻就没有全局快捷键');
  assert.equal((await e.jelly.get()).assistant.needsResident, true);
});

test('回执里的热键状态进入 get/set 结果：ok/taken/failed/invalid 原样，未知值与缺失按 unknown；旧组件（v6）为 unsupported；关闭为 off', async () => {
  for (const status of ['ok', 'taken', 'failed', 'invalid']) {
    const e = env(); e.desktop.version = 7; e.desktop.assistantReply = { status, hotkey: 'ctrl+shift+b' };
    await e.jelly.set({ resident: true });
    const result = await e.jelly.set({ assistant: { enabled: true } });
    assert.equal(result.assistant.hotkeyStatus, status, status);
    assert.equal((await e.jelly.get()).assistant.hotkeyStatus, status);
  }
  const weird = env(); weird.desktop.version = 7; weird.desktop.assistantReply = { status: '<script>', hotkey: 5 };
  await weird.jelly.set({ resident: true });
  assert.equal((await weird.jelly.set({ assistant: { enabled: true } })).assistant.hotkeyStatus, 'unknown');
  const missing = env(); missing.desktop.version = 7;
  await missing.jelly.set({ resident: true });
  assert.equal((await missing.jelly.set({ assistant: { enabled: true } })).assistant.hotkeyStatus, 'unknown');
  const old = env(); old.desktop.version = 6;
  await old.jelly.set({ resident: true });
  assert.equal((await old.jelly.set({ assistant: { enabled: true } })).assistant.hotkeyStatus, 'unsupported');
  const off = env(); off.desktop.version = 7; off.desktop.assistantReply = { status: 'ok', hotkey: 'ctrl+shift+b' };
  await off.jelly.set({ resident: true, assistant: { enabled: true } });
  assert.equal((await off.jelly.set({ assistant: { enabled: false } })).assistant.hotkeyStatus, 'off');
});

test('assistantEnabled：必须同时常驻且启用；读取失败按关闭', async () => {
  const e = env();
  assert.equal(await e.jelly.assistantEnabled(), false);
  await e.jelly.set({ assistant: { enabled: true } });
  assert.equal(await e.jelly.assistantEnabled(), false, '没有常驻');
  await e.jelly.set({ resident: true });
  assert.equal(await e.jelly.assistantEnabled(), true);
  await e.jelly.set({ assistant: { enabled: false } });
  assert.equal(await e.jelly.assistantEnabled(), false);
  const broken = env(); broken.storage.get = async () => { throw new Error('读取失败'); };
  assert.equal(await broken.jelly.assistantEnabled(), false);
});

test('errandsReady：常驻、已连接、组件版本 ≥ 8 才为 true（水母差事据此决定要不要开口）；连接断开、组件太旧、没有常驻、读取失败都是 false', async () => {
  const e = env(); e.desktop.version = 8;
  assert.equal(await e.jelly.errandsReady(), false, '还没有常驻');
  await e.jelly.set({ resident: true });
  assert.equal(await e.jelly.errandsReady(), true);
  e.desktop.port = null;
  assert.equal(await e.jelly.errandsReady(), false, '端口没了');
  const old = env(); old.desktop.version = 7;
  await old.jelly.set({ resident: true });
  assert.equal(await old.jelly.errandsReady(), false, 'v7 组件认不得差事');
  const down = env(); down.desktop.version = 8; down.desktop.failJelly = '组件没装';
  await down.jelly.set({ resident: true });
  assert.equal(await down.jelly.errandsReady(), false, '连接失败');
  const broken = env(); broken.desktop.version = 8; await broken.jelly.set({ resident: true });
  broken.storage.get = async () => { throw new Error('读取失败'); };
  assert.equal(await broken.jelly.errandsReady(), false);
  const off = env(); off.desktop.version = 8; await off.jelly.set({ resident: true }); await off.jelly.set({ resident: false });
  assert.equal(await off.jelly.errandsReady(), false, '取消常驻后');
});

test('onAssistantApplied：带 assistant 的下发被 v7 组件接受后通知一次（用来补发当前任务状态）；旧组件、未启用、失败都不通知；回调抛错不影响下发', async () => {
  const e = env(); e.desktop.version = 7; e.desktop.assistantReply = { status: 'ok', hotkey: 'ctrl+shift+b' };
  let applied = 0; e.jelly.onAssistantApplied = () => { applied++; };
  await e.jelly.set({ resident: true });
  assert.equal(applied, 0, '助手未启用');
  await e.jelly.set({ assistant: { enabled: true } });
  assert.equal(applied, 1);
  e.jelly.onAssistantApplied = () => { throw new Error('boom'); };
  assert.equal((await e.jelly.set({ assistant: { hotkey: 'ctrl+option+a' } })).ok, true);
  const old = env(); old.desktop.version = 6; let oldApplied = 0; old.jelly.onAssistantApplied = () => { oldApplied++; };
  await old.jelly.set({ resident: true, assistant: { enabled: true } });
  assert.equal(oldApplied, 0);
  const failing = env(); failing.desktop.version = 7; failing.desktop.failJelly = '断开'; let failedApplied = 0; failing.jelly.onAssistantApplied = () => { failedApplied++; };
  await failing.jelly.set({ resident: true, assistant: { enabled: true } });
  assert.equal(failedApplied, 0);
});

test('resident 与 assistant 同时设置：一次保存、一次下发', async () => {
  const e = env(); e.desktop.version = 7; e.desktop.assistantReply = { status: 'ok', hotkey: 'ctrl+shift+b' };
  const result = await e.jelly.set({ resident: true, assistant: { enabled: true, hotkey: 'ctrl+shift+space' } });
  assert.equal(result.ok, true);
  assert.deepEqual(e.storage.data[Jelly.KEY], { resident: true, night: true });
  assert.deepEqual(e.storage.data[Jelly.ASSISTANT_KEY], { enabled: true, hotkey: 'ctrl+shift+space' });
  assert.equal(pushes(e).length, 1);
  assert.deepEqual(pushes(e)[0].assistant, { enabled: true, hotkey: 'ctrl+shift+space' });
});

// ---------- 水母差事第二期（协议 v9）：组件版本分档与右键菜单开关的下发 ----------

test('errandsReady(minVersion)：默认 8；歌曲与菜单请求要 9；参数不能把门槛放宽到 8 以下；不是数字的参数一律按“不能”处理（不会因为调用写错而在旧组件上放行）', async () => {
  const e = env(); e.desktop.version = 8;
  await e.jelly.set({ resident: true });
  assert.equal(await e.jelly.errandsReady(), true);
  assert.equal(await e.jelly.errandsReady(8), true);
  assert.equal(await e.jelly.errandsReady(9), false, 'v8 组件认不得歌曲与菜单请求');
  assert.equal(await e.jelly.errandsReady(1), true, '低于 8 的参数按 8 算');
  for (const bad of ['9', NaN, null, Infinity, {}, [], true]) assert.equal(await e.jelly.errandsReady(bad), false, String(bad));
  const nine = env(); nine.desktop.version = 9;
  await nine.jelly.set({ resident: true });
  assert.equal(await nine.jelly.errandsReady(9), true);
  assert.equal(await nine.jelly.errandsReady(), true);
  assert.equal(await nine.jelly.errandsReady(10), false);
  const old = env(); old.desktop.version = 7;
  await old.jelly.set({ resident: true });
  assert.equal(await old.jelly.errandsReady(1), false, '参数再小也不能让 v7 组件通过');
  assert.equal(await old.jelly.errandsReady(9), false);
  nine.desktop.port = null;
  assert.equal(await nine.jelly.errandsReady(9), false, '端口没了');
});

test('下发：只有常驻且 errandsEnabled() 严格返回 true 才带 errands:{enabled:true}；没接回调、返回假值、抛错、没有常驻都不带（原生据此隐藏右键菜单项）', async () => {
  const e = env(); e.desktop.version = 9;
  await e.jelly.set({ resident: true });
  assert.equal('errands' in pushes(e).at(-1), false, '没接回调');
  assert.equal(e.jelly.errandsEnabled, null, '默认没有回调');
  e.jelly.errandsEnabled = async () => true;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: false }, '没接 errandsPatrol 回调：patrol 为严格的 false（活动行为是可选的，缺省不带）');
  assert.deepEqual(Object.keys(pushes(e).at(-1)).sort(), ['errands', 'lines', 'linesUntil', 'night', 'resident'], '其余字段不变');
  for (const reply of [async () => false, async () => 1, async () => 'yes', async () => undefined, async () => ({ enabled: true }), () => { throw new Error('boom'); }, async () => { throw new Error('boom'); }]) {
    e.jelly.errandsEnabled = reply;
    await e.jelly.sync();
    assert.equal('errands' in pushes(e).at(-1), false, String(reply));
  }
  e.jelly.errandsEnabled = () => true;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: false }, '同步返回 true 也认');
  const idle = env(); idle.desktop.version = 9; idle.desktop.port = { fake: true };
  idle.jelly.errandsEnabled = async () => true;
  await idle.jelly.set({ night: false });
  assert.equal('errands' in pushes(idle).at(-1), false, '没有常驻（组件被倒计时等拉起着）不带');
});

test('下发：errands 与 assistant 可以同时带，互不影响；回调返回之前不会下发半截状态', async () => {
  const e = env(); e.desktop.version = 9; e.desktop.assistantReply = { status: 'ok' };
  e.jelly.errandsEnabled = async () => { await new Promise(resolve => setImmediate(resolve)); return true; };
  await e.jelly.set({ resident: true, assistant: { enabled: true, hotkey: 'ctrl+shift+space' } });
  assert.equal(pushes(e).length, 1);
  assert.deepEqual(pushes(e)[0].assistant, { enabled: true, hotkey: 'ctrl+shift+space' });
  assert.deepEqual(pushes(e)[0].errands, { enabled: true, patrol: false });
});

test('下发：errands.patrol（活动行为，协议 v10）只在 errandsPatrol() 严格返回 true 时为 true；没接回调、假值、字符串、抛错一律 false；差事没开就根本不带 errands，patrol 回调也不会被调用', async () => {
  const e = env(); e.desktop.version = 10;
  e.jelly.errandsEnabled = async () => true;
  assert.equal(e.jelly.errandsPatrol, null, '默认没有回调');
  await e.jelly.set({ resident: true });
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: false });
  e.jelly.errandsPatrol = async () => true;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: true });
  e.jelly.errandsPatrol = () => true;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: true }, '同步返回 true 也认');
  for (const reply of [async () => false, async () => 1, async () => 'true', async () => 'yes', async () => undefined, async () => null, async () => ({ patrol: true }), () => { throw new Error('boom'); }, async () => { throw new Error('boom'); }]) {
    e.jelly.errandsPatrol = reply;
    await e.jelly.sync();
    assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: false }, String(reply));
  }
  // 差事没开：不带 errands；patrol 的回调连问都不问（避免在差事关闭时读多余的配置）
  const off = env(); off.desktop.version = 10;
  let asked = 0;
  off.jelly.errandsEnabled = async () => false;
  off.jelly.errandsPatrol = async () => { asked += 1; return true; };
  await off.jelly.set({ resident: true });
  assert.equal('errands' in pushes(off).at(-1), false);
  assert.equal(asked, 0, '差事关闭时不问 patrol');
  // 没有常驻：同样不带、也不问
  const idle = env(); idle.desktop.version = 10; idle.desktop.port = { fake: true };
  let askedIdle = 0;
  idle.jelly.errandsEnabled = async () => true;
  idle.jelly.errandsPatrol = async () => { askedIdle += 1; return true; };
  await idle.jelly.set({ night: false });
  assert.equal('errands' in pushes(idle).at(-1), false, '没有常驻不带');
  assert.equal(askedIdle, 0);
});

test('下发：patrol 变化后重新同步会带上新的值（设置页关掉“活动行为”后原生马上回到老样子，不用重载）', async () => {
  const e = env(); e.desktop.version = 10;
  let patrol = true;
  e.jelly.errandsEnabled = async () => true;
  e.jelly.errandsPatrol = async () => patrol;
  await e.jelly.set({ resident: true });
  assert.equal(pushes(e).at(-1).errands.patrol, true);
  patrol = false;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: false });
  patrol = true;
  await e.jelly.sync();
  assert.deepEqual(pushes(e).at(-1).errands, { enabled: true, patrol: true });
});
