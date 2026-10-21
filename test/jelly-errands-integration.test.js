// 水母差事接线合同：后台加载顺序与回调、设置消息通道与来源校验、不进入沙箱截取片段、
// 五个系统通知发送器“先水母后通知”的行为（开/关、接手/回退、标记写入时机）、设置页控件与版本钉子、不新增权限。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const background = read('js/background.js');
const settingsJs = read('js/settings-page.js');
const settingsHtml = read('settings.html');
const manifest = JSON.parse(read('manifest.json'));

// ---------- 后台接线 ----------

test('后台 importScripts：差事核心、歌曲来源与控制器在 jelly-nudge.js 之后、jelly-desktop.js 之前，且都在使用之前', () => {
  const importLine = background.split('\n').find(line => line.includes('importScripts('));
  const order = ['jelly-nudge.js', 'jelly-errands-core.js', 'jelly-errand-songs.js', 'jelly-errands.js', 'jelly-desktop.js'].map(name => importLine.indexOf(`'${name}'`));
  assert.ok(order.every(index => index > 0), '五个脚本都在 importScripts 里');
  assert.deepEqual([...order].sort((a, b) => a - b), order, '顺序：nudge → errands-core → errand-songs → errands → desktop');
  assert.ok(background.indexOf("'jelly-errands.js'") < background.indexOf('JellyErrands.create('));
  assert.ok(background.indexOf("'jelly-errand-songs.js'") < background.indexOf('JellyErrandSongs.create('));
});

test('后台：差事控制器接上水母的 presenter、可用性判断（带最低协议版本）、日志；动作、气泡自行消失、presence、菜单请求都回到控制器；闹钟与恢复', () => {
  const start = background.indexOf('const jellyErrands = JellyErrands.create(');
  assert.ok(start > 0);
  const end = background.indexOf('void jellyErrands.restore()', start);
  assert.ok(end > start);
  const block = background.slice(start, end + 80);
  assert.match(block, /presenter: jellyDesktop\.presenter/);
  assert.match(block, /isAvailable: minVersion => jellyDesktop\.errandsReady\(minVersion\)/);
  assert.match(block, /isBusy: \(\) => !!\(desktopAlarm\.sessionId \|\| desktopAlarm\.confirmationId\)/);
  assert.match(block, /logExtEvent\('system'/);
  assert.match(block, /songs: jellyErrandSongs/);
  assert.match(block, /isPlaying: isMusicPlaying/);
  assert.match(block, /playSong: playJellySong/);
  assert.match(block, /onChange: \(\) => jellyDesktop\.sync\(\)/);
  assert.match(block, /desktopAlarm\.onErrandAction = message => jellyErrands\.act\(message\?\.id, message\?\.action\)/);
  assert.match(block, /desktopAlarm\.onErrandRequest = message => jellyErrands\.request\(message\?\.kind\)/);
  assert.match(block, /desktopAlarm\.onNudgeHidden = id => \{ void jellyErrands\.onHidden\(id\); \}/);
  assert.match(block, /desktopAlarm\.onPresence = \(state, extra\) => jellyErrands\.onPresence\(state, extra\)/);
  assert.match(block, /readLark: .*lark_sentinel_check/);
  assert.match(block, /readTabs: \(\) => chrome\.tabs\.query/);
  assert.match(block, /readWatch: \(\) => chrome\.storage\.local\.get/);
  assert.match(block, /readBookmarks: async \(\) =>/);
  assert.match(block, /chrome\.alarms\.onAlarm\.addListener\(alarm => \{ void jellyErrands\.fire\(alarm\.name\)/);
  assert.match(block, /void jellyErrands\.restore\(\)\.catch\(/);
  assert.ok(start > background.indexOf('const jellyDesktop = JellyDesktop.create('), '先有水母再有差事');
});

test('后台：水母据差事总开关决定要不要给原生端“errands”字段（右键菜单），读配置不经差事控制器的串行队列', () => {
  const start = background.indexOf('jellyDesktop.errandsEnabled = ');
  assert.ok(start > 0, '没有给 jellyDesktop.errandsEnabled 赋值');
  assert.ok(start > background.indexOf('const jellyErrands = JellyErrands.create('), '在控制器创建之后');
  assert.ok(start < background.indexOf('void jellyDesktop.restore()'), '在 restore 建立连接之前就位，第一次下发 jelly 命令就带上');
  const line = background.slice(start, background.indexOf('\n', start));
  assert.match(line, /JellyErrandsCore\.normalize\(/);
  assert.match(line, /\.enabled === true/);
  assert.match(line, /chrome\.storage\.sync\.get\(JellyErrands\.CONFIG_KEY\)/);
  assert.doesNotMatch(line, /jellyErrands\.get\(/, '不经控制器的串行队列，免得和长时间的歌曲推荐互相等');
});

test('后台：“活动行为”（协议 v10 的 errands.patrol）由 jellyDesktop.errandsPatrol 直接读配置并经 normalize（缺省为开），与 errandsEnabled 同样不经控制器的串行队列', () => {
  const start = background.indexOf('jellyDesktop.errandsPatrol = ');
  assert.ok(start > 0, '没有给 jellyDesktop.errandsPatrol 赋值');
  assert.ok(start > background.indexOf('jellyDesktop.errandsEnabled = '), '紧跟在 errandsEnabled 之后');
  assert.ok(start < background.indexOf('void jellyDesktop.restore()'), '在 restore 建立连接之前就位，第一次下发 jelly 命令就带上');
  const line = background.slice(start, background.indexOf('\n', start));
  assert.match(line, /JellyErrandsCore\.normalize\(/);
  assert.match(line, /\.patrol === true/, '只认规范化后的严格布尔');
  assert.match(line, /chrome\.storage\.sync\.get\(JellyErrands\.CONFIG_KEY\)/);
  assert.doesNotMatch(line, /jellyErrands\.get\(/, '不经控制器的串行队列');
});

test('后台：推荐歌曲来源只经现成的 neteaseApiCall / getNeteaseCookies / normalizeSilentMusicSong；登录只认 MUSIC_U', () => {
  const start = background.indexOf('const jellyErrandSongs = JellyErrandSongs.create(');
  assert.ok(start > 0);
  assert.ok(start < background.indexOf('const jellyErrands = JellyErrands.create('), '先有来源再有控制器');
  const block = background.slice(start, background.indexOf('});', start) + 3);
  assert.match(block, /api: \(endpoint, params\) => neteaseApiCall\(endpoint, params\)/);
  assert.match(block, /loggedIn: async \(\) => \(await getNeteaseCookies\(\)\)\.includes\('MUSIC_U'\)/);
  assert.match(block, /normalize: normalizeSilentMusicSong/);
});

/** vm 里造出来的对象原型与本领域不同，deepStrictEqual 会因此失败；比较前先转成普通对象。 */
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** 在沙箱里运行 background.js 里某个独立函数的真实源码（`async function name(`），注入替身全局。 */
function sandboxFunction(name, globals) {
  const context = { console: { log() {}, warn() {}, error() {} }, ...globals };
  vm.createContext(context);
  vm.runInContext(`${extract(name)}\nthis.__fn = ${name};`, context);
  return context.__fn;
}

test('isMusicPlaying：没有 Offscreen 文档就是没在放（不创建文档、不发消息）；有文档才问；读不出来一律返回 null，不抛错', async () => {
  const run = async ({ contexts = [], response, throwAt } = {}) => {
    const calls = [];
    const fn = sandboxFunction('isMusicPlaying', {
      chrome: { runtime: {
        getURL: p => `chrome-extension://x/${p}`,
        getContexts: async query => { calls.push(['contexts', query]); if (throwAt === 'contexts') throw new Error('boom'); return contexts; },
      } },
      sendToOffscreen: async message => { calls.push(['send', message]); if (throwAt === 'send') throw new Error('boom'); return response; },
      ensureOffscreen: async () => { calls.push(['ensure']); },
    });
    return { value: await fn(), calls };
  };

  let r = await run({ contexts: [] });
  assert.equal(r.value, false);
  assert.deepEqual(r.calls.map(call => call[0]), ['contexts'], '没有文档：不创建、不发消息');
  assert.deepEqual(plain(r.calls[0][1]), { contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: ['chrome-extension://x/offscreen.html'] });

  r = await run({ contexts: [{}], response: { ok: true, data: { isPlaying: true } } });
  assert.equal(r.value, true);
  assert.deepEqual(plain(r.calls[1]), ['send', { command: 'getState' }]);
  assert.equal(r.calls.some(call => call[0] === 'ensure'), false);

  r = await run({ contexts: [{}], response: { ok: true, data: { isPlaying: false } } });
  assert.equal(r.value, false);

  for (const response of [{ ok: false }, { ok: true }, { ok: true, data: {} }, { ok: true, data: { isPlaying: 'yes' } }, undefined, null]) {
    r = await run({ contexts: [{}], response });
    assert.equal(r.value, null, JSON.stringify(response));
  }
  for (const throwAt of ['contexts', 'send']) {
    r = await run({ contexts: [{}], response: { ok: true, data: { isPlaying: false } }, throwAt });
    assert.equal(r.value, null, `${throwAt} 抛错也只是读不出来`);
  }
});

test('playJellySong：复用 playAssistantMusic；“提交播放”之前失败 = 明确没发出，之后失败 = 已动手；成功才是 ok:true；取消生效', async () => {
  const run = async (impl, { song = { songId: 12345, title: '歌', artist: '人' }, signal = { cancelled: false } } = {}) => {
    const seen = [];
    const fn = sandboxFunction('playJellySong', {
      playAssistantMusic: async (...args) => { seen.push(args); return impl(...args); },
    });
    return { result: plain(await fn(song, signal)), seen };
  };
  const dispatchStep = (ctx, fn = async () => ({ ok: true })) => ctx.trace('music.playback.dispatch', '提交播放请求', {}, fn);

  // 成功：歌曲编号规范成字符串，只带 ctx（不替用户选队列、不指定模式）
  let { result, seen } = await run(async (song, ctx) => { await dispatchStep(ctx); return { ok: true }; });
  assert.deepEqual(result, { ok: true, dispatched: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0].songId, '12345');
  assert.equal(seen[0].length, 2, '不传 selectedQueue / queueName / requestedMode');
  assert.equal(typeof seen[0][1].guard, 'function');
  assert.equal(typeof seen[0][1].trace, 'function');

  // 之前就失败（取不到地址 / 手动操作了播放器 / 队列已满）：dispatched:false；只有“暂不可播放”带 unavailable，文字只放中文原文
  ({ result } = await run(async () => { throw Object.assign(new Error('这首歌暂不可播放，请选择其他版本'), { code: 'unavailable' }); }));
  assert.deepEqual(result, { ok: false, dispatched: false, code: 'unavailable', message: '这首歌暂不可播放，请选择其他版本' });
  ({ result } = await run(async () => { throw new Error('播放器已被手动操作，请重新选择歌曲'); }));
  assert.deepEqual(result, { ok: false, dispatched: false, message: '播放器已被手动操作，请重新选择歌曲' });
  ({ result } = await run(async () => { throw new Error('TypeError: x is not a function at https://music.163.com/secret?token=abc'); }));
  assert.deepEqual(result, { ok: false, dispatched: false }, '英文/技术报错原文不外传');
  ({ result } = await run(async () => { throw new Error(`${'很长的中文说明'.repeat(20)}`); }));
  assert.equal(result.message.length, 40);

  // 进了“提交播放请求”就算已动手：之后无论哪一步失败都是 dispatched:true（控制器按未知处理，不重放）
  ({ result } = await run(async (song, ctx) => { await dispatchStep(ctx); throw new Error('播放器未确认目标状态，请检查登录或歌曲是否可播放'); }));
  assert.equal(result.ok, false);
  assert.equal(result.dispatched, true);
  ({ result } = await run(async (song, ctx) => { await dispatchStep(ctx, async () => { throw new Error('offscreen 创建失败'); }); }));
  assert.equal(result.dispatched, true, '提交这一步本身抛错也不能当作没发生');

  // 取消：guard 抛错；还没提交时不会提交
  const signal = { cancelled: false };
  ({ result, seen } = await run(async (song, ctx) => {
    signal.cancelled = true;
    let ran = false;
    try { await dispatchStep(ctx, async () => { ran = true; }); } catch (error) { assert.equal(ran, false, '取消后不执行提交'); throw error; }
  }, { signal }));
  assert.equal(result.ok, false);
  assert.equal(result.dispatched, false, '取消发生在提交之前 → 明确没发出');
});

/** 去掉注释再扫描代码本身（URL 里的 // 前面没有空白，不会被误当注释）。 */
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

test('差事源码（核心 / 歌曲来源 / 控制器）自己不碰播放器、扩展存储、Cookie、标签页：这些都由后台注入', () => {
  for (const file of ['js/jelly-errands-core.js', 'js/jelly-errand-songs.js', 'js/jelly-errands.js']) {
    assert.doesNotMatch(stripComments(read(file)), /offscreen|sendMessage|playAssistantMusic|chrome\.|\bfetch\s*\(|XMLHttpRequest|WebSocket|innerHTML|\beval\s*\(|new Function/i, file);
  }
});

test('后台：喝水/起身发出后让差事让出间隔（onSent → noteExternal）', () => {
  const start = background.indexOf('const jellyNudge = JellyNudge.create(');
  const block = background.slice(start, start + 800);
  assert.match(block, /onSent: at => jellyErrands\.noteExternal\(at\)/);
});

test('后台：差事的打开页面与系统通知同一去处；日志先写标记再开页；继续看/拾贝/飞书跳对应目标；任务/概览只开新标签页', () => {
  const start = background.indexOf('openPage: async (kind, target) =>');
  const block = background.slice(start, start + 1800);
  assert.ok(block.indexOf("pendingAction: 'openWorklogPanel'") > 0);
  assert.ok(block.indexOf("pendingAction: 'openWorklogPanel'") < block.indexOf("chrome.tabs.create({ url: 'chrome://newtab/' })"));
  assert.match(block, /kind === 'worklog'/);
  assert.match(block, /kind === 'watch'/);
  assert.match(block, /AppVideo\.buildURL/);
  assert.match(block, /kind === 'bookmark'/);
  assert.match(block, /kind === 'lark'/);
});

test('后台：差事设置消息只接受本扩展页面，只处理 get/set，设置只来自 message.config', () => {
  const start = background.indexOf("['jelly_errands_get', 'jelly_errands_set']");
  assert.ok(start > 0);
  const handler = background.slice(start, start + 800);
  assert.match(handler, /sender\.id !== chrome\.runtime\.id/);
  assert.match(handler, /sender\.url\?\.startsWith\(chrome\.runtime\.getURL\(''\)\)/);
  assert.match(handler, /respond\(\{ ok: false, error: '仅扩展页面可设置水母差事' \}\); return;/, '来源不对要拒绝并立即返回，不能继续执行设置');
  assert.match(handler, /jellyErrands\.set\(message\.config\)/);
  assert.match(handler, /jellyErrands\.get\(\)/);
  assert.equal((background.match(/jelly_errands_(get|set)'\]\.includes/g) || []).length, 1);
});

test('后台：userAlarmSaveQueue 到 getUserAlarmViewState 之间（被 assistant-management 测试截取沙箱执行）不引用差事全局', () => {
  const start = background.indexOf('let userAlarmSaveQueue');
  const end = background.indexOf('async function getUserAlarmViewState');
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(background.slice(start, end), /jellyErrands|JellyErrands|jellyDesktop|jellyNudge|jellyErrandSongs|isMusicPlaying|playJellySong/);
});

test('不新增权限、不新增 host_permissions；差事源码没有网络、innerHTML、eval、chrome.idle', () => {
  const permissions = [...(manifest.permissions || [])];
  assert.ok(!permissions.includes('idle'), '不使用 chrome.idle');
  // 推荐歌曲读的是音乐页早就在用的网易云接口：host 权限是原有的，这一期没有新增
  assert.ok((manifest.host_permissions || []).includes('*://music.163.com/*'));
  for (const file of ['js/jelly-errands-core.js', 'js/jelly-errand-songs.js', 'js/jelly-errands.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|innerHTML|insertAdjacentHTML|\beval\s*\(|new Function|chrome\.idle|chrome\.tabs|chrome\.notifications/, file);
  }
});

// ---------- 五个系统通知发送器：先水母后通知 ----------

/** 按花括号配平截取 `async function name(` 的完整源码（这些函数里的花括号都成对出现）。 */
function extract(name) {
  const start = background.indexOf(`async function ${name}(`);
  assert.ok(start > 0, `找不到 ${name}`);
  let depth = 0, seenOpen = false;
  for (let index = background.indexOf('{', start); index < background.length; index += 1) {
    const char = background[index];
    if (char === '{') { depth += 1; seenOpen = true; }
    if (char === '}') depth -= 1;
    if (seenOpen && depth === 0) return background.slice(start, index + 1);
  }
  throw new Error(`${name} 括号不配平`);
}

/** 在沙箱里运行真实函数源码；通知、存储、水母 offer 都是替身。 */
function sandbox({ offer, memos, worklogEntries, settings, now = new Date(2026, 9, 15, 15, 30), warmTipEnabled } = {}) {
  const log = { notifications: [], offers: [], storageSets: [] };
  const local = { memos: memos ? JSON.parse(JSON.stringify(memos)) : memos, worklogEntries };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    chrome: {
      runtime: { getURL: p => `chrome-extension://x/${p}` },
      notifications: { create: async (id, info) => { log.notifications.push([id, info]); } },
      storage: {
        local: {
          get: async key => (typeof key === 'string' ? { [key]: local[key] } : { ...local }),
          set: async items => { log.storageSets.push(JSON.parse(JSON.stringify(items))); Object.assign(local, JSON.parse(JSON.stringify(items))); },
        },
        sync: { get: async key => (key === 'settings' ? { settings } : key === 'warmTipEnabled' ? { warmTipEnabled } : {}) },
      },
    },
    jellyErrands: { offer: async kind => { log.offers.push(kind); return offer ? offer(kind) : { handled: false }; } },
    getTodayDate: () => '2026-10-15',
    getRandomWarmTip: type => ({ type: type || 'quote', text: '先开始，才有灵感' }),
    formatWarmTip: tip => (tip ? tip.text : ''),
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } },
    Math,
  };
  vm.createContext(context);
  const run = name => { vm.runInContext(`${extract(name)}\nthis.__fn = ${name};`, context); return context.__fn; };
  return { run, log, local, context };
}

const overdue = [{ title: '写周报', dueDate: '2026-10-13' }, { title: '今天的', dueDate: '2026-10-15' }];

test('每日摘要：水母接手 → 不发系统通知；没接手 → 照旧发；没有任务两边都不动', async () => {
  let s = sandbox({ memos: overdue, offer: () => ({ handled: true }) });
  await s.run('sendDailySummary')();
  assert.deepEqual(s.log.offers, ['brief']);
  assert.equal(s.log.notifications.length, 0);

  s = sandbox({ memos: overdue, offer: () => ({ handled: false }) });
  await s.run('sendDailySummary')();
  assert.equal(s.log.notifications.length, 1);
  assert.equal(s.log.notifications[0][0], 'daily-summary');

  s = sandbox({ memos: [], offer: () => ({ handled: true }) });
  await s.run('sendDailySummary')();
  assert.deepEqual(s.log.offers, [], '没有任务不问水母');
  assert.equal(s.log.notifications.length, 0);
});

test('过期任务：水母接手 → 不发系统通知，但仍标记已通知（不会每次检查都再说）；没接手 → 通知并标记', async () => {
  let s = sandbox({ memos: overdue, offer: () => ({ handled: true }) });
  await s.run('checkOverdueTasks')();
  assert.deepEqual(s.log.offers, ['task']);
  assert.equal(s.log.notifications.length, 0);
  assert.equal(s.local.memos.find(task => task.title === '写周报').overdueNotified, true);

  s = sandbox({ memos: overdue, offer: () => ({ handled: false }) });
  await s.run('checkOverdueTasks')();
  assert.equal(s.log.notifications.length, 1);
  assert.equal(s.log.notifications[0][0], 'overdue-tasks');
  assert.equal(s.local.memos.find(task => task.title === '写周报').overdueNotified, true);

  s = sandbox({ memos: overdue.map(task => ({ ...task, overdueNotified: true })), offer: () => ({ handled: true }) });
  await s.run('checkOverdueTasks')();
  assert.deepEqual(s.log.offers, [], '都已通知过就不再问');
});

test('工作日志（下班提醒）：水母接手 → 不发；没接手 → 照旧；工作日志提醒关闭时两边都不动', async () => {
  let s = sandbox({ worklogEntries: [], offer: () => ({ handled: true }) });
  await s.run('sendWorklogReminder')();
  assert.deepEqual(s.log.offers, ['worklog']);
  assert.equal(s.log.notifications.length, 0);

  s = sandbox({ worklogEntries: [], offer: () => ({ handled: false }) });
  await s.run('sendWorklogReminder')();
  assert.equal(s.log.notifications[0][0], 'worklog-reminder');

  s = sandbox({ worklogEntries: [], settings: { worklogReminderEnabled: false }, offer: () => ({ handled: true }) });
  await s.run('sendWorklogReminder')();
  assert.deepEqual(s.log.offers, []);
  assert.equal(s.log.notifications.length, 0);
});

test('工作日志（智能检查）：水母接手 → 不发通知；两种方式之后都写“本时段已提醒”标记，且只在发出之后才写', async () => {
  let s = sandbox({ worklogEntries: [], offer: () => ({ handled: true }) });
  await s.run('checkWorklogProgress')();
  assert.deepEqual(s.log.offers, ['worklog']);
  assert.equal(s.log.notifications.length, 0);
  assert.equal(s.log.storageSets.length, 1);
  assert.deepEqual(Object.values(s.log.storageSets[0])[0], { 15: true });

  s = sandbox({ worklogEntries: [], offer: () => ({ handled: false }) });
  await s.run('checkWorklogProgress')();
  assert.equal(s.log.notifications.length, 1);
  assert.equal(s.log.notifications[0][0], 'worklog-smart-15');
  assert.equal(s.log.storageSets.length, 1);

  s = sandbox({ worklogEntries: [{ date: '2026-10-15', duration: 400 }], offer: () => ({ handled: true }) });
  await s.run('checkWorklogProgress')();
  assert.deepEqual(s.log.offers, [], '工时已够就不问水母');
  assert.equal(s.log.storageSets.length, 0);

  s = sandbox({ worklogEntries: [], now: new Date(2026, 9, 17, 15, 30), offer: () => ({ handled: true }) });     // 星期六
  await s.run('checkWorklogProgress')();
  assert.deepEqual(s.log.offers, [], '周末不问水母');
});

test('温情提示：水母接手 → 不发系统通知；没接手 → 照旧；用户关闭温情提示时两边都不动', async () => {
  let s = sandbox({ offer: () => ({ handled: true }) });
  await s.run('sendWarmTipNotification')();
  assert.deepEqual(s.log.offers, ['tidbit']);
  assert.equal(s.log.notifications.length, 0);

  s = sandbox({ offer: () => ({ handled: false }) });
  await s.run('sendWarmTipNotification')();
  assert.equal(s.log.notifications.length, 1);
  assert.match(s.log.notifications[0][0], /^warm-tip-/);

  s = sandbox({ warmTipEnabled: false, offer: () => ({ handled: true }) });
  await s.run('sendWarmTipNotification')();
  assert.deepEqual(s.log.offers, []);
  assert.equal(s.log.notifications.length, 0);
});

test('差事总开关关闭或水母不可用时 offer 返回 handled:false → 五个发送器与以前完全一样（通知数量不变）', async () => {
  for (const [name, options] of [['sendDailySummary', { memos: overdue }], ['checkOverdueTasks', { memos: overdue }], ['sendWorklogReminder', { worklogEntries: [] }],
    ['checkWorklogProgress', { worklogEntries: [] }], ['sendWarmTipNotification', {}]]) {
    const s = sandbox({ ...options, offer: () => ({ handled: false, reason: 'off' }) });
    await s.run(name)();
    assert.equal(s.log.notifications.length, 1, name);
  }
});

// ---------- 设置页 ----------

test('设置页：差事卡片的控件都存在，脚本绑定同一组 id，且只经 jelly_errands_get/set 读写（页面不直接写存储）', () => {
  const ids = ['set-errandsEnabled', 'set-errandsLevel', 'set-errandsTask', 'set-errandsWorklog', 'set-errandsLark', 'set-errandsTabs', 'set-errandsWatch', 'set-errandsBookmark', 'set-errandsSong', 'set-errandsTidbit', 'set-errandsTitles', 'set-errandsFrom', 'set-errandsTo', 'set-errandsWeekdays', 'set-errandsPatrol', 'set-errandsStatus'];
  for (const id of ids) {
    assert.ok(settingsHtml.includes(`id="${id}"`), `settings.html 缺少 ${id}`);
    assert.ok(settingsJs.includes(`'${id}'`), `settings-page.js 没有引用 ${id}`);
  }
  assert.ok(settingsHtml.includes('id="sp-jelly-errands-card"'));
  assert.match(settingsJs, /action: 'jelly_errands_get'/);
  assert.match(settingsJs, /action: 'jelly_errands_set', config/);
  const block = settingsJs.slice(settingsJs.indexOf('水母差事（让常驻的桌面水母主动开口）'), settingsJs.indexOf('桌面水母（macOS 原生组件）'));
  assert.doesNotMatch(block, /chrome\.storage\.(local|sync)\.(set|remove)|chrome\.alarms|innerHTML/);
});

test('设置页：默认关闭、任务名默认不显示、推荐歌曲跟其他类别一样默认勾选；说明文字交代“只读系统空闲秒数”“只有点播放才放歌、会加入播放队列”“歌曲来源”“右键水母”“没接手时系统通知照旧”', () => {
  const card = settingsHtml.slice(settingsHtml.indexOf('id="sp-jelly-errands-card"'), settingsHtml.indexOf('id="set-errandsStatus"'));
  assert.doesNotMatch(card.match(/<input[^>]*id="set-errandsEnabled"[^>]*>/)[0], /checked/);
  assert.doesNotMatch(card.match(/<input[^>]*id="set-errandsTitles"[^>]*>/)[0], /checked/);
  assert.match(card.match(/<input[^>]*id="set-errandsSong"[^>]*>/)[0], /checked/);
  assert.match(card, /系统“距离上次键盘或鼠标操作过了多少秒”/);
  assert.match(card, /不读按了什么、不需要额外权限/);
  assert.doesNotMatch(card, /不会放歌|不联网/, '第二期起水母会联网读歌曲列表，旧的“不放歌 / 不联网”说法必须去掉');
  assert.match(card, /只有你点“播放”才会把这一首加入播放队列并开始播放/);
  assert.match(card, /不点就什么也不放，正在放歌时也不会来打扰/);
  assert.match(card, /网易云每日推荐/);
  assert.match(card, /热歌榜/);
  assert.match(card, /右键水母/);
  assert.match(card, /不调用模型/);
  assert.match(card, /系统通知照旧弹出/);
  assert.match(card, /协议 v9/);
  assert.match(card, /v8 组件只有/, '交代旧组件缺什么');
});

test('设置页：推荐歌曲开关跟其他类别一起读写（读出 kinds.song、写回 kinds.song、缺省按开启）', () => {
  const block = settingsJs.slice(settingsJs.indexOf('水母差事（让常驻的桌面水母主动开口）'), settingsJs.indexOf('桌面水母（macOS 原生组件）'));
  assert.match(block, /kinds: \{[^}]*song: !!value\('set-errandsSong'\)\?\.checked/);
  assert.match(block, /value\('set-errandsSong'\)\.checked = config\.kinds\.song !== false/);
  assert.match(block, /ERRANDS_IDS = \[[^\]]*'set-errandsSong'/);
});

test('设置页：“让水母活动起来”（patrol）默认勾选，与其他控件一起读写（读出 patrol、写回 patrol、缺省按开启），说明里写清睡与不动的条件', () => {
  const card = settingsHtml.slice(settingsHtml.indexOf('id="sp-jelly-errands-card"'), settingsHtml.indexOf('id="set-errandsStatus"'));
  assert.match(card.match(/<input[^>]*id="set-errandsPatrol"[^>]*>/)[0], /checked/, '缺省开启');
  assert.match(card, /让水母活动起来/);
  assert.match(card, /夜里（约 19:30 到次日 06:30）/);
  assert.match(card, /离开电脑超过 10 分钟仍会睡着/);
  assert.match(card, /鼠标停在它身上/);
  assert.match(card, /减少动态效果/);
  assert.match(card, /协议 v10/);
  const block = settingsJs.slice(settingsJs.indexOf('水母差事（让常驻的桌面水母主动开口）'), settingsJs.indexOf('桌面水母（macOS 原生组件）'));
  assert.match(block, /patrol: !!value\('set-errandsPatrol'\)\?\.checked/);
  assert.match(block, /value\('set-errandsPatrol'\)\.checked = config\.patrol !== false/);
  assert.match(block, /ERRANDS_IDS = \[[^\]]*'set-errandsPatrol'/);
});

test('设置页状态提示：协议 v10 之前的组件开着“让水母活动起来”时说明它不起作用并给出下一步；关掉就不提；v10 及以上不提', () => {
  const block = settingsJs.slice(settingsJs.indexOf('function describeErrands('), settingsJs.indexOf('function setErrandsControlsDisabled('));
  assert.match(block, /config\.patrol !== false && Number\(status\.version\) < 10/);
  assert.match(block, /“让水母活动起来”（白天不睡觉、巡游、小动作）需要组件协议 v10/);
  assert.match(block, /请按 desktop-reminder\/README\.md 更新组件，再重载扩展/);
  // 真实执行：取出函数源码在沙箱里跑，看三种情况的文字
  const source = block.slice(0, block.lastIndexOf('}') + 1);
  const run = new Function('ERRANDS_LEVEL_TEXT', `${source}; return describeErrands;`)({ quiet: 2, mid: 4, busy: 8 });
  const config = patrol => ({ enabled: true, level: 'mid', from: '09:00', to: '18:00', weekdaysOnly: true, patrol });
  const desktop = version => ({ settings: { resident: true }, status: { connected: true, version } });
  assert.match(run(config(true), desktop(9)), /需要组件协议 v10/);
  assert.doesNotMatch(run(config(false), desktop(9)), /需要组件协议 v10/);
  assert.doesNotMatch(run(config(true), desktop(10)), /需要组件协议 v10/);
  assert.doesNotMatch(run({ ...config(true), patrol: undefined }, desktop(10)), /需要组件协议 v10/);
  assert.match(run({ ...config(true), patrol: undefined }, desktop(9)), /需要组件协议 v10/, '旧配置没有 patrol 键按开启');
  assert.match(run(config(true), desktop(9)), /水母差事已开启（组件协议 v9）/, '提示是在原有状态文字后面追加，不替换它');
});

test('设置页状态提示：没常驻、没连上、组件版本过旧、v8 组件缺歌曲与菜单、正常五种情况各有可执行的说明', () => {
  assert.match(settingsJs, /需要先打开上方“桌面水母”里的“常驻桌面”/);
  assert.match(settingsJs, /桌面组件还没有连上/);
  assert.match(settingsJs, /Number\(status\.version\) < 8\)\s*return `桌面组件协议 v\$\{status\.version\} 太旧，不认识水母差事/, '差事的最低门槛仍是 8，与原生/控制器一致');
  assert.match(settingsJs, /太旧，不认识水母差事/);
  assert.match(settingsJs, /Number\(status\.version\) < 9\)\s*return `桌面组件协议 v\$\{status\.version\} 已能说任务、日志和小乐子，但推荐歌曲和右键“水母，给我…”需要 v9/, '歌曲与菜单的门槛是 9');
  assert.match(settingsJs, /水母差事已开启（组件协议 v/);
});

test('脚本版本钉子：settings-page.js?v=17，且仍在 chrome-shim 之后加载', () => {
  assert.ok(settingsHtml.includes('js/settings-page.js?v=19'));
  assert.ok(settingsHtml.indexOf('js/chrome-shim.js?v=5') < settingsHtml.indexOf('js/settings-page.js?v=19'));
});
