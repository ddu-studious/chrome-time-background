(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyAppearance = api;
})(globalThis, function () {
  'use strict';

  // 桌面水母的外观设置（物种、颜色、花纹、材质、尺寸、节日、每天换一只）。
  //  · Chrome 是唯一的设置所有者：这里把设置解析成**具体值**交给原生端，原生端不另存、不做随机；
  //  · 存储键独立于 desktopJellyV1：旧版本的 JellyDesktop.normalize 只保留 resident/night，放进去会被旧版本抹掉；
  //  · 花纹语义与首页水母（js/jellyfish-core.js 的 pickLook、js/jellyfish.js 的 paintOf）一致，偏移常量相同；
  //  · 本模块不碰 DOM、网络、权限，随机数与时间都可注入。设计见 docs/superpowers/specs/2026-10-17-jelly-appearance-design.md。

  const KEY = 'desktopJellyAppearanceV1';
  const COLORS = 8;
  const LOOKS = Object.freeze(['solid', 'duo', 'blend', 'rainbow']);
  const MATERIALS = Object.freeze(['glass', 'gummy', 'plush', 'wire', 'pencil', 'pixel']);
  const SIZES = Object.freeze(['small', 'medium', 'large']);
  // 物种：每次只显示一种（水母或某种海洋动物）。原生端的 JellySpecies 是同一份列表（test/desktop-companion-logic.test.mjs 对照）；
  // 动物的几何数据在 js/jelly-species-shapes.js，哪些已经画得出来由两端各自判断（原生回执 appearance.species 报告实际生效的那一种）。
  // “每天换一只”与“随机一只”只换颜色和花纹，不换物种——物种是用户明确选的，不能被日期或随机悄悄改掉。
  const SPECIES = Object.freeze(['jelly', 'hammer', 'manta', 'turtle', 'whaleshark']);
  // 物种中文名：桌面提醒气泡里的称呼（js/jelly-desktop.js 的 presenter 据此把文案里的“水母”换成正在桌面上的那只动物）。
  // 设置页（settings-jelly-appearance.js）与原生端（JellySpecies.displayName）各有一份同样的表，test/desktop-companion-logic.test.mjs 逐项对照。
  const SPECIES_NAMES = Object.freeze({ jelly: '水母', hammer: '小锤头鲨', manta: '蝠鲼', turtle: '海龟', whaleshark: '鲸鲨' });
  const DUO_OFFSETS = Object.freeze([2, 3, 4]);
  const BLEND_OFFSETS = Object.freeze([2]);
  const RAINBOW_STEP = 2;
  const DAILY_MARGIN_MS = 1000;   // 午夜后多等 1 秒再重新下发：保证那时本地日期已经翻过去，同时延迟恒 ≥ 1 秒，不会在午夜前后空转
  // realistic：动物画成写实风格（默认开）。写实动物用自己的自然体色，颜色与花纹只管水母与卡通动物；水母没有写实版，这个开关对它无影响。
  // 原生端的缺省是 false（旧版本的 Chrome 不下发该字段，组件照旧画卡通），所以这里下发的永远是明确的布尔值。
  const DEFAULTS = Object.freeze({ color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false, species: 'jelly', realistic: true });
  const VALIDATORS = Object.freeze({
    color: value => Number.isInteger(value) && value >= 0 && value < COLORS,
    look: value => LOOKS.includes(value),
    material: value => MATERIALS.includes(value),
    size: value => SIZES.includes(value),
    seasonal: value => typeof value === 'boolean',
    daily: value => typeof value === 'boolean',
    species: value => typeof value === 'string' && SPECIES.includes(value),
    realistic: value => typeof value === 'boolean',
  });

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const wrap = color => ((color % COLORS) + COLORS) % COLORS;

  /** 规范化：每个字段各自校验，非法值回到默认，不影响其他字段。 */
  function normalize(raw) {
    const source = isObject(raw) ? raw : {};
    const out = {};
    for (const key of Object.keys(DEFAULTS)) out[key] = VALIDATORS[key](source[key]) ? source[key] : DEFAULTS[key];
    return out;
  }

  /** 32 位种子的小型伪随机数（mulberry32）：结果只取决于种子，所以同一天、同一设置总得到同一外观。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const dateSeed = date => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const pickIndex = (rand, length) => Math.min(length - 1, Math.floor(rand() * length));

  /** 按花纹把主色展开成 1…3 个色位；方向与偏移由 rand 决定（调用方保证 rand 是确定的）。 */
  function colorsFor(color, look, rand) {
    const sign = rand() < 0.5 ? 1 : -1;
    const choose = list => list[pickIndex(rand, list.length)];
    if (look === 'duo') return [color, wrap(color + sign * choose(DUO_OFFSETS))];
    if (look === 'blend') return [color, wrap(color + sign * choose(BLEND_OFFSETS))];
    if (look === 'rainbow') return [color, wrap(color + sign * RAINBOW_STEP), wrap(color + sign * RAINBOW_STEP * 2)];
    return [color];
  }

  /**
   * 设置 → 下发给原生端的具体值。daily 为 true 时颜色与花纹由本地日期决定（同一天不变，忽略存储的 color/look）；
   * 否则第二、第三色由“主色 + 花纹”确定性算出，所以不需要存储它们，重启与重连后外观不会变。
   * season 本轮恒为 null（节日是 S4）。species 原样带上（非法值已被 normalize 改回水母），颜色与花纹的展开与物种无关。
   * realistic 原样带上（明确的布尔值）：原生组件只有收到 true 才画写实动物，并在回执里报告实际画的是哪一种。
   */
  function resolve(settings, { date = new Date() } = {}) {
    const s = normalize(settings);
    let color = s.color, look = s.look, rand;
    if (s.daily) {
      rand = mulberry32(dateSeed(date));
      color = pickIndex(rand, COLORS);
      look = LOOKS[pickIndex(rand, LOOKS.length)];
    } else {
      rand = mulberry32(color * 16 + LOOKS.indexOf(look) + 1);
    }
    return { color, colors: colorsFor(color, look, rand), look, material: s.material, size: s.size, season: null, species: s.species, realistic: s.realistic };
  }

  /** “随机”：换成**不同**的颜色与随机花纹，并关闭“每天换”（用户明确选了一只）；其余字段保留。 */
  function reroll(settings, random = Math.random) {
    const s = normalize(settings);
    let color = pickIndex(random, COLORS);
    if (color === s.color) color = wrap(color + 1 + Math.floor(random() * (COLORS - 1)));
    const look = LOOKS[pickIndex(random, LOOKS.length)];
    return { ...s, color, look, daily: false };
  }

  /**
   * storage：chrome.storage.local；onChange：保存后调用（后台据此让 JellyDesktop 重新下发），抛错或返回被拒绝的 Promise 都不影响保存。
   * 所有写入经同一条串行队列“先读最新值再改”，并发的设置互不覆盖。
   */
  function create({ storage, onChange = null, now = () => new Date(), random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let queue = Promise.resolve();
    let dailyTimer = null;
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    const read = async () => normalize((await storage.get(KEY))[KEY]);
    const view = settings => ({ ok: true, settings, resolved: resolve(settings, { date: now() }) });
    const notify = () => { try { Promise.resolve(onChange?.()).catch(() => {}); } catch (_) { /* 回调失败不影响保存 */ } };

    // “每天换一只”开着时，下一个本地午夜让后台重新下发一次（否则要等别的原因触发下发，Chrome 开着过夜会停在昨天那只）。
    // 只在真正下发外观（payload）或设置变化时预约/取消；到点只通知、不自行续约，水母没常驻就不会一直转。
    const stopDaily = () => { if (dailyTimer !== null) { clearTimer(dailyTimer); dailyTimer = null; } };
    const armDaily = (settings, date) => {
      stopDaily();
      if (!settings.daily) return;
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      dailyTimer = setTimer(() => { dailyTimer = null; notify(); }, midnight - date.getTime() + DAILY_MARGIN_MS);
      // Node 宿主（测试）里别让这个最长 24 小时的定时器拖住进程退出；浏览器返回的是数字，没有这个方法
      if (dailyTimer && typeof dailyTimer.unref === 'function') dailyTimer.unref();
    };

    const get = async () => view(await read());
    const payload = async () => {
      const settings = await read(), date = now();
      armDaily(settings, date);
      return resolve(settings, { date });
    };
    const set = patch => {
      if (!isObject(patch)) return Promise.resolve({ ok: false, error: '外观设置格式不正确' });
      const next = {};
      for (const key of Object.keys(DEFAULTS)) {
        if (!has(patch, key)) continue;
        if (!VALIDATORS[key](patch[key])) return Promise.resolve({ ok: false, error: `${key} 的取值无效` });
        next[key] = patch[key];
      }
      return serial(async () => {
        const settings = { ...(await read()), ...next };
        await storage.set({ [KEY]: settings });
        armDaily(settings, now());
        notify();
        return view(settings);
      });
    };
    const rerollNow = () => serial(async () => {
      const settings = reroll(await read(), random);
      await storage.set({ [KEY]: settings });
      armDaily(settings, now());
      notify();
      return view(settings);
    });
    return { get, set, rerollNow, payload };
  }

  return { KEY, COLORS, LOOKS, MATERIALS, SIZES, SPECIES, SPECIES_NAMES, DEFAULTS, DUO_OFFSETS, BLEND_OFFSETS, RAINBOW_STEP, normalize, resolve, reroll, create };
});
