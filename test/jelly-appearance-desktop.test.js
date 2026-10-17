// 外观下发：JellyDesktop 在每次 jelly 下发里带 appearance；回执里有 appearance.status==='ok' 才算组件支持；
// 读取外观失败只影响外观（不带该字段），水母照常下发。
const test = require('node:test');
const assert = require('node:assert/strict');
const Jelly = require('../js/jelly-desktop.js');

function area(initial = {}) {
  const data = { ...initial };
  return { data, get: async key => (typeof key === 'string' ? { [key]: data[key] } : Array.isArray(key) ? Object.fromEntries(key.map(k => [k, data[k]])) : { ...data }), set: async items => { Object.assign(data, JSON.parse(JSON.stringify(items))); } };
}
function desktopStub({ reply = {} } = {}) {
  const calls = [];
  const desktop = {
    calls, port: null,
    setResident() {},
    async setJelly(jelly) { calls.push(jelly); if (desktop.fail) throw new Error(desktop.fail); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...reply }; },
    async showNudge() { return { ok: true, version: 7 }; },
    clearNudge() {},
  };
  return desktop;
}
const make = ({ appearance, reply, storage = { desktopJellyV1: { resident: true } } } = {}) => {
  const desktop = desktopStub({ reply });
  const jelly = Jelly.create({ storage: area(storage), desktop, appearance, setTimer: () => ({}), clearTimer: () => {} });
  return { jelly, desktop };
};
const PAYLOAD = { color: 2, colors: [2], look: 'solid', material: 'glass', size: 'medium', season: null };

test('下发带 appearance，且原有字段不变', async () => {
  const { jelly, desktop } = make({ appearance: async () => PAYLOAD });
  await jelly.sync();
  assert.equal(desktop.calls.length, 1);
  assert.deepEqual(desktop.calls[0].appearance, PAYLOAD);
  assert.equal(desktop.calls[0].resident, true);
  assert.equal(desktop.calls[0].night, true);
  assert.ok(Array.isArray(desktop.calls[0].lines));
});

test('没有外观数据源时：不带 appearance，状态是 off（旧行为）', async () => {
  const { jelly, desktop } = make({});
  await jelly.sync();
  assert.equal('appearance' in desktop.calls[0], false);
  assert.equal(jelly.appearanceStatus(), 'off');
});

test('回执带 appearance.status==="ok" 才是 ok；没有就是 unsupported（旧组件）', async () => {
  const supported = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } });
  await supported.jelly.sync();
  assert.equal(supported.jelly.appearanceStatus(), 'ok');
  const old = make({ appearance: async () => PAYLOAD });
  await old.jelly.sync();
  assert.equal(old.jelly.appearanceStatus(), 'unsupported');
  const odd = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'invalid' } } });
  await odd.jelly.sync();
  assert.equal(odd.jelly.appearanceStatus(), 'unsupported', '只有 ok 才算支持');
});

test('读取外观失败或返回空：本次不带 appearance，水母照常下发', async () => {
  for (const source of [async () => { throw new Error('read failed'); }, async () => null]) {
    const { jelly, desktop } = make({ appearance: source });
    await jelly.sync();
    assert.equal(desktop.calls.length, 1);
    assert.equal('appearance' in desktop.calls[0], false);
    assert.equal(desktop.calls[0].resident, true);
    assert.equal(jelly.appearanceStatus(), 'off');
  }
});

test('下发失败：状态回到 unknown，不冒充 ok', async () => {
  const { jelly, desktop } = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } });
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok');
  desktop.fail = '连接失败';
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'unknown');
});

test('每次下发都重新取外观：设置改变后 sync 带新值', async () => {
  let current = PAYLOAD;
  const { jelly, desktop } = make({ appearance: async () => current });
  await jelly.sync();
  current = { ...PAYLOAD, color: 6, colors: [6] };
  await jelly.sync();
  assert.deepEqual(desktop.calls.map(call => call.appearance.color), [2, 6]);
});

// ---------- 2026-10-17 第一轮变异检查后补充 ----------

test('读取到的不是对象（字符串、数字、布尔）：不下发 appearance，状态 off', async () => {
  for (const value of ['garbage', 7, true]) {
    const { jelly, desktop } = make({ appearance: async () => value });
    await jelly.sync();
    assert.equal('appearance' in desktop.calls[0], false, `数据源返回 ${JSON.stringify(value)} 时不该下发`);
    assert.equal(jelly.appearanceStatus(), 'off');
  }
});

test('端口断开（含从菜单退出）：外观状态回到 unknown，不继续显示“已应用”', async () => {
  const { jelly, desktop } = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } });
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok');
  assert.equal(jelly.status().connected, true, '下发成功后是已连接');
  desktop.onPortLost({});
  assert.equal(jelly.appearanceStatus(), 'unknown');
  assert.equal(jelly.status().connected, false, '端口断开后不再显示已连接（替身的 port 仍有值，只有 status.ok 能把它翻成 false）');
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok', '重新连上并下发后恢复');
  assert.equal(jelly.status().connected, true);
  desktop.onPortLost({ quit: true });
  assert.equal(jelly.appearanceStatus(), 'unknown');
  assert.equal(jelly.status().connected, false);
});
