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
  const calls = [], nudges = [];
  const desktop = {
    calls, nudges, port: null,
    setResident() {},
    async setJelly(jelly) { calls.push(jelly); if (desktop.fail) throw new Error(desktop.fail); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...reply }; },
    async showNudge(nudge) { nudges.push(nudge); return { ok: true, version: 7 }; },
    clearNudge() {},
  };
  return desktop;
}
const make = ({ appearance, reply, speciesNames, storage = { desktopJellyV1: { resident: true } } } = {}) => {
  const desktop = desktopStub({ reply });
  const jelly = Jelly.create({ storage: area(storage), desktop, appearance, speciesNames, setTimer: () => ({}), clearTimer: () => {} });
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

// ---------- 物种：回执报告实际生效的那一种，不一致就不冒充已应用 ----------

test('物种：回执 appearance.species 是组件实际画出来的那一种；与下发的一致才是 ok', async () => {
  const hammer = { ...PAYLOAD, species: 'hammer' };
  const cases = [
    ['请求动物、回执同一种', hammer, { appearance: { status: 'ok', species: 'hammer' } }, 'ok'],
    ['请求动物、回执只有 status（S1a 组件不认识物种，永远画水母）', hammer, { appearance: { status: 'ok' } }, 'unsupported'],
    ['请求动物、组件认得但这一种还画不出来，回退成水母', hammer, { appearance: { status: 'ok', species: 'jelly' } }, 'unsupported'],
    ['请求动物、回执是另一种动物', hammer, { appearance: { status: 'ok', species: 'manta' } }, 'unsupported'],
    ['请求动物、回执物种不是字符串', hammer, { appearance: { status: 'ok', species: 3 } }, 'unsupported'],
    ['请求动物、回执物种是 null', hammer, { appearance: { status: 'ok', species: null } }, 'unsupported'],
    ['请求动物、回执 status 不是 ok（物种对也不算）', hammer, { appearance: { status: 'invalid', species: 'hammer' } }, 'unsupported'],
    ['请求水母、S1a 组件的回执没有物种', { ...PAYLOAD, species: 'jelly' }, { appearance: { status: 'ok' } }, 'ok'],
    ['请求水母、回执写 jelly', { ...PAYLOAD, species: 'jelly' }, { appearance: { status: 'ok', species: 'jelly' } }, 'ok'],
    ['请求水母、回执却说是动物（不该发生，不能当作已应用）', { ...PAYLOAD, species: 'jelly' }, { appearance: { status: 'ok', species: 'hammer' } }, 'unsupported'],
    ['下发里没有物种（旧调用方）视为水母，回执没有物种也是 ok', PAYLOAD, { appearance: { status: 'ok' } }, 'ok'],
    ['下发里没有物种，回执说是动物', PAYLOAD, { appearance: { status: 'ok', species: 'hammer' } }, 'unsupported'],
  ];
  for (const [name, payload, reply, expected] of cases) {
    const { jelly, desktop } = make({ appearance: async () => payload, reply });
    await jelly.sync();
    assert.equal(jelly.appearanceStatus(), expected, name);
    assert.equal(desktop.calls[0].appearance.species, payload.species, `${name}：下发的物种原样带上`);
  }
});

test('物种：换物种后重新下发，状态按新一次的回执判断（不沿用上一次的 ok）', async () => {
  let current = { ...PAYLOAD, species: 'hammer' };
  const replies = [{ appearance: { status: 'ok', species: 'hammer' } }, { appearance: { status: 'ok' } }];
  const desktop = desktopStub();
  let n = 0;
  desktop.setJelly = async jelly => { desktop.calls.push(jelly); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...replies[n++] }; };
  const jelly = Jelly.create({ storage: area({ desktopJellyV1: { resident: true } }), desktop, appearance: async () => current, setTimer: () => ({}), clearTimer: () => {} });
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok');
  current = { ...PAYLOAD, species: 'jelly' };
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok', '换回水母，S1a 风格的回执（没有物种）也是 ok');
  assert.deepEqual(desktop.calls.map(call => call.appearance.species), ['hammer', 'jelly']);
});

// ---------- 写实风格：回执里明确的 realistic === true 才是写实；旧组件没有这个字段，一律按卡通算 ----------

test('画法（appearanceStyle）：回执 realistic 为 true 才是写实；没有该字段（旧组件）、非布尔、false 都是卡通；水母没有风格之分', async () => {
  const hammer = { ...PAYLOAD, species: 'hammer', realistic: true };
  const cases = [
    ['组件确认画成了写实', hammer, { appearance: { status: 'ok', species: 'hammer', realistic: true } }, 'ok', { style: 'realistic', species: 'hammer', realistic: true }],
    ['组件回执 realistic:false（这种动物的写实数据在组件里不可用，画了卡通）', hammer, { appearance: { status: 'ok', species: 'hammer', realistic: false } }, 'ok', { style: 'cartoon', species: 'hammer', realistic: true }],
    ['旧组件：回执只有 status 与 species，没有 realistic', hammer, { appearance: { status: 'ok', species: 'hammer' } }, 'ok', { style: 'cartoon', species: 'hammer', realistic: true }],
    ['回执 realistic 是字符串 "true"（不是布尔）不算写实', hammer, { appearance: { status: 'ok', species: 'hammer', realistic: 'true' } }, 'ok', { style: 'cartoon', species: 'hammer', realistic: true }],
    ['回执 realistic 是 1 不算写实', hammer, { appearance: { status: 'ok', species: 'hammer', realistic: 1 } }, 'ok', { style: 'cartoon', species: 'hammer', realistic: true }],
    ['设置要求卡通，回执也是卡通', { ...hammer, realistic: false }, { appearance: { status: 'ok', species: 'hammer', realistic: false } }, 'ok', { style: 'cartoon', species: 'hammer', realistic: false }],
    ['设置要求卡通，回执却说写实（不该发生）：照回执如实记录，设置页比对 realistic 不一致就不采信', { ...hammer, realistic: false }, { appearance: { status: 'ok', species: 'hammer', realistic: true } }, 'ok', { style: 'realistic', species: 'hammer', realistic: false }],
    ['水母：没有风格之分，回执里有没有 realistic 都是 jelly', { ...PAYLOAD, species: 'jelly', realistic: true }, { appearance: { status: 'ok', species: 'jelly', realistic: true } }, 'ok', { style: 'jelly', species: 'jelly', realistic: true }],
    ['下发里没有物种（旧调用方）视为水母', PAYLOAD, { appearance: { status: 'ok' } }, 'ok', { style: 'jelly', species: 'jelly', realistic: false }],
    ['物种与下发的不同（不支持）：风格没有确认', hammer, { appearance: { status: 'ok', species: 'manta', realistic: true } }, 'unsupported', { style: 'unknown', species: 'jelly', realistic: false }],
    ['回执 status 不是 ok：风格没有确认', hammer, { appearance: { status: 'invalid', species: 'hammer', realistic: true } }, 'unsupported', { style: 'unknown', species: 'jelly', realistic: false }],
    ['回执里完全没有 appearance（旧组件）：风格没有确认', hammer, {}, 'unsupported', { style: 'unknown', species: 'jelly', realistic: false }],
  ];
  for (const [name, payload, reply, status, expected] of cases) {
    const { jelly, desktop } = make({ appearance: async () => payload, reply });
    assert.deepEqual(jelly.appearanceStyle(), { style: 'unknown', species: 'jelly', realistic: false }, `${name}：下发之前没有确认`);
    await jelly.sync();
    assert.equal(jelly.appearanceStatus(), status, name);
    assert.deepEqual(jelly.appearanceStyle(), expected, name);
    assert.equal(desktop.calls[0].appearance.realistic, payload.realistic, `${name}：下发的 realistic 原样带上`);
  }
});

test('画法：读到的是副本，外部改它不影响内部状态', async () => {
  const { jelly } = make({ appearance: async () => ({ ...PAYLOAD, species: 'manta', realistic: true }), reply: { appearance: { status: 'ok', species: 'manta', realistic: true } } });
  await jelly.sync();
  const view = jelly.appearanceStyle();
  view.style = 'cartoon'; view.species = 'jelly';
  assert.deepEqual(jelly.appearanceStyle(), { style: 'realistic', species: 'manta', realistic: true });
});

test('画法：换风格后重新下发，按新一次的回执判断；连接失败、断开、没有外观数据时回到未确认', async () => {
  let current = { ...PAYLOAD, species: 'turtle', realistic: true };
  const replies = [
    { appearance: { status: 'ok', species: 'turtle', realistic: true } },
    { appearance: { status: 'ok', species: 'turtle', realistic: false } },
    { appearance: { status: 'ok', species: 'turtle', realistic: true } },
  ];
  const desktop = desktopStub();
  let n = 0;
  desktop.setJelly = async jelly => { desktop.calls.push(jelly); if (desktop.fail) throw new Error(desktop.fail); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...replies[n++] }; };
  const jelly = Jelly.create({ storage: area({ desktopJellyV1: { resident: true } }), desktop, appearance: async () => current, setTimer: () => ({}), clearTimer: () => {} });
  await jelly.sync();
  assert.equal(jelly.appearanceStyle().style, 'realistic');
  current = { ...current, realistic: false };
  await jelly.sync();
  assert.deepEqual(jelly.appearanceStyle(), { style: 'cartoon', species: 'turtle', realistic: false }, '换成卡通后按新回执');
  current = { ...current, realistic: true };
  await jelly.sync();
  assert.equal(jelly.appearanceStyle().style, 'realistic');
  desktop.fail = 'boom';
  await jelly.sync().catch(() => {});
  assert.equal(jelly.appearanceStatus(), 'unknown');
  assert.deepEqual(jelly.appearanceStyle(), { style: 'unknown', species: 'jelly', realistic: false }, '连接失败后上一次的确认作废');
});

test('画法：读取外观失败（没带 appearance）时风格没有确认，不沿用上一次', async () => {
  let value = { ...PAYLOAD, species: 'whaleshark', realistic: true };
  const { jelly } = make({ appearance: async () => { if (value === 'fail') throw new Error('storage down'); return value; }, reply: { appearance: { status: 'ok', species: 'whaleshark', realistic: true } } });
  await jelly.sync();
  assert.equal(jelly.appearanceStyle().style, 'realistic');
  value = 'fail';
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'off');
  assert.equal(jelly.appearanceStyle().style, 'unknown');
});

// ---------- 提醒气泡的称呼：桌面上真是那只动物在说话时，文案里的“水母”换成它的名字 ----------

const JellyAppearance = require('../js/jelly-appearance.js');
const WATER = Object.freeze({
  id: 'jelly-nudge-water-1', kind: 'water', title: '水母口渴了 💧', text: '喝口水吧，水母陪你喝一杯（今天已喝了 2 次）',
  buttons: Object.freeze([Object.freeze({ id: 'done', title: '喝了' })]), ttl: 90,
});
const HAMMER_OK = { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }), reply: { appearance: { status: 'ok', species: 'hammer' } }, speciesNames: JellyAppearance.SPECIES_NAMES };

test('提醒气泡：组件确认画出了小锤头鲨，标题与正文里的“水母”换成它的名字，其余字段原样，调用方的对象不被改动', async () => {
  const { jelly, desktop } = make(HAMMER_OK);
  await jelly.sync();
  assert.deepEqual(await jelly.presenter.present(WATER), { shown: true });
  assert.deepEqual(desktop.nudges, [{ ...WATER, title: '小锤头鲨口渴了 💧', text: '喝口水吧，小锤头鲨陪你喝一杯（今天已喝了 2 次）' }]);
  assert.equal(WATER.title, '水母口渴了 💧', '调用方的对象不能被改');
  assert.equal(WATER.text, '喝口水吧，水母陪你喝一杯（今天已喝了 2 次）');
  assert.notEqual(desktop.nudges[0], WATER, '给原生的是副本');
  assert.equal(desktop.nudges[0].buttons, WATER.buttons, '按钮等其余字段原样沿用');
});

test('提醒气泡：起身提醒同样替换（标题与正文各自替换所有“水母”）', async () => {
  const { jelly, desktop } = make(HAMMER_OK);
  await jelly.sync();
  await jelly.presenter.present({ id: 'jelly-nudge-stretch-1', kind: 'stretch', title: '水母想游一圈 🌊', text: '水母和水母一起伸个懒腰', buttons: [], ttl: 90 });
  assert.equal(desktop.nudges[0].title, '小锤头鲨想游一圈 🌊');
  assert.equal(desktop.nudges[0].text, '小锤头鲨和小锤头鲨一起伸个懒腰');
});

test('提醒气泡：仍是水母、没有物种、旧组件、组件画不出来、没有外观数据源——都保持“水母”', async () => {
  const names = JellyAppearance.SPECIES_NAMES;
  const cases = [
    ['默认水母', { appearance: async () => ({ ...PAYLOAD, species: 'jelly' }), reply: { appearance: { status: 'ok', species: 'jelly' } } }],
    ['外观数据里没有物种', { appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } }],
    ['旧组件（回执没有 appearance）', { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }) }],
    ['旧组件（回执只有 status）', { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }), reply: { appearance: { status: 'ok' } } }],
    ['组件画不出这一种，回执说退回了水母', { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }), reply: { appearance: { status: 'ok', species: 'jelly' } } }],
    ['回执说的是另一种动物', { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }), reply: { appearance: { status: 'ok', species: 'manta' } } }],
    ['回执 status 不是 ok', { appearance: async () => ({ ...PAYLOAD, species: 'hammer' }), reply: { appearance: { status: 'invalid', species: 'hammer' } } }],
    ['没有外观数据源', {}],
  ];
  for (const [name, options] of cases) {
    const { jelly, desktop } = make({ ...options, speciesNames: names });
    await jelly.sync();
    await jelly.presenter.present(WATER);
    assert.deepEqual(desktop.nudges, [WATER], name);
  }
});

test('提醒气泡：还没有下发过、下发失败、端口断开后——不知道桌面上是什么，保持“水母”；重新下发成功后恢复', async () => {
  const { jelly, desktop } = make(HAMMER_OK);
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '水母口渴了 💧', '还没有下发过');
  await jelly.sync();
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '小锤头鲨口渴了 💧');
  desktop.onPortLost({});
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '水母口渴了 💧', '端口断开后不再沿用上一次的确认');
  await jelly.sync();
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '小锤头鲨口渴了 💧', '重新下发并确认后恢复');
  desktop.fail = '连接失败';
  await jelly.sync();
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '水母口渴了 💧', '下发失败后不沿用');
});

test('提醒气泡：换回水母后立刻按水母称呼（不沿用上一只动物的名字）', async () => {
  let current = { ...PAYLOAD, species: 'hammer' };
  const desktop = desktopStub();
  const replies = [{ appearance: { status: 'ok', species: 'hammer' } }, { appearance: { status: 'ok' } }];
  let n = 0;
  desktop.setJelly = async jelly => { desktop.calls.push(jelly); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...replies[n++] }; };
  const jelly = Jelly.create({ storage: area({ desktopJellyV1: { resident: true } }), desktop, appearance: async () => current, speciesNames: JellyAppearance.SPECIES_NAMES, setTimer: () => ({}), clearTimer: () => {} });
  await jelly.sync();
  await jelly.presenter.present(WATER);
  current = { ...PAYLOAD, species: 'jelly' };
  await jelly.sync();
  await jelly.presenter.present(WATER);
  assert.deepEqual(desktop.nudges.map(nudge => nudge.title), ['小锤头鲨口渴了 💧', '水母口渴了 💧']);
});

test('提醒气泡：没有名字表、表里没有这一种或名字不是非空字符串、标题正文不是字符串——不改、不抛', async () => {
  const run = async (options, nudge = WATER) => {
    const { jelly, desktop } = make({ ...HAMMER_OK, ...options });
    await jelly.sync();
    assert.deepEqual(await jelly.presenter.present(nudge), { shown: true });
    return desktop.nudges[0];
  };
  assert.deepEqual(await run({ speciesNames: undefined }), WATER, '没传名字表');
  assert.deepEqual(await run({ speciesNames: null }), WATER, '名字表是 null');
  assert.deepEqual(await run({ speciesNames: {} }), WATER, '表里没有这一种');
  assert.deepEqual(await run({ speciesNames: { hammer: '' } }), WATER, '空名字');
  assert.deepEqual(await run({ speciesNames: { hammer: 5 } }), WATER, '名字不是字符串');
  assert.deepEqual(await run({ speciesNames: { hammer: ' ' } }), WATER, '只有空白的名字');
  assert.deepEqual(await run({ speciesNames: Object.create({ hammer: '继承来的' }) }), WATER, '继承来的属性不算');
  assert.deepEqual(await run({}, { ...WATER, title: undefined }), { ...WATER, title: undefined, text: '喝口水吧，小锤头鲨陪你喝一杯（今天已喝了 2 次）' }, '标题不是字符串时不动它，只改正文');
  assert.deepEqual(await run({}, { ...WATER, text: 42 }), { ...WATER, title: '小锤头鲨口渴了 💧', text: 42 }, '正文不是字符串时只动标题');
});

test('提醒气泡：名字按字面替换，不当作替换模式（名字里有 $&、$1 之类也不例外）', async () => {
  const { jelly, desktop } = make({ ...HAMMER_OK, speciesNames: { hammer: '$&·$1·$$' } });
  await jelly.sync();
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges[0].title, '$&·$1·$$口渴了 💧');
});

test('提醒气泡：失败仍照原样抛出或回报（称呼不改变 shown 的判定）', async () => {
  const { jelly, desktop } = make(HAMMER_OK);
  await jelly.sync();
  desktop.showNudge = async () => { throw new Error('桌面组件未响应'); };
  await assert.rejects(jelly.presenter.present(WATER), /未响应/);
  desktop.showNudge = async () => ({ ok: false });
  assert.deepEqual(await jelly.presenter.present(WATER), { shown: false });
});

test('提醒气泡：某次下发没带外观（读取失败）时，原生保持上一次的外观，称呼也保持上一次确认的；连接断开后才回到水母', async () => {
  let fail = false;
  const { jelly, desktop } = make({ ...HAMMER_OK, appearance: async () => { if (fail) throw new Error('read failed'); return { ...PAYLOAD, species: 'hammer' }; } });
  await jelly.sync();
  fail = true;
  await jelly.sync();
  assert.equal('appearance' in desktop.calls[1], false, '第二次下发没有带外观');
  assert.equal(jelly.appearanceStatus(), 'off');
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '小锤头鲨口渴了 💧', '原生仍在画上一次确认的小锤头鲨');
  desktop.onPortLost({});
  await jelly.sync();  // 新连接：原生从默认外观开始，这次也没带外观
  await jelly.presenter.present(WATER);
  assert.equal(desktop.nudges.at(-1).title, '水母口渴了 💧', '断开后原生进程重新开始，从默认的水母起');
});
