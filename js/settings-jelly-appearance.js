(function (root) {
  'use strict';

  // 设置页“桌面水母形象”卡片：只经扩展消息读写（后台 js/jelly-appearance.js 拥有设置与解析），页面不直接写存储、不连接组件。
  // 水母常驻时选择立即在桌面生效；没有常驻时没有实时预览，页面如实说明。设计见 docs/superpowers/specs/2026-10-17-jelly-appearance-design.md。

  const $ = id => document.getElementById(id);
  const swatches = () => Array.from(document.querySelectorAll('#set-jellyColorSwatches [data-color]'));
  let chain = Promise.resolve();
  let busy = false;
  let daily = false;       // 当前“每天换一只”是否开着：开着时颜色与花纹由日期决定，选择器不起作用

  const send = (message, timeout = 8000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('后台没有响应')), timeout);
    chrome.runtime.sendMessage(message, reply => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (reply && reply.ok === false) { reject(new Error(reply.error || '操作失败')); return; }
      // 只接受后台明确成功并带回设置的响应；别的形状（没有 settings、ok 不是 true）说明后台没有按约定回答，不能当成功处理
      if (!reply || reply.ok !== true || !reply.settings || typeof reply.settings !== 'object') { reject(new Error('后台返回的数据不完整')); return; }
      resolve(reply);
    });
  });

  // ---------- 示意图：后台解析出的外观 → 各部位颜色 → 页面里的静态 SVG ----------
  const NEED = { solid: 1, duo: 2, blend: 2, rainbow: 3 };       // 每种花纹需要的颜色位个数
  const mix = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
  const hexToRgb = hex => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };
  const toHex = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

  /**
   * 颜色位 + 花纹 → 各部位的颜色（[r,g,b]，0…1）。规则与原生 JellyPaint（desktop-reminder/jelly-materials.swift）一致，
   * test/jelly-appearance-settings.test.js 有源码绊线：纯色一色；双色钟罩主色、触须与口腕第二色；渐变钟罩下缘主色 → 顶部第二色、
   * 触须偏向第二色（0.7）；七彩三色横向铺开、触须沿横向取色。颜色位不够或越界时与原生解析一样退回纯色；完全无效返回 null。
   */
  function paintOf(resolved, palette) {
    if (!resolved || typeof resolved !== 'object' || !Array.isArray(resolved.colors) || !Array.isArray(palette)) return null;
    const slots = [];
    for (const slot of resolved.colors) { if (!Number.isInteger(slot) || !Array.isArray(palette[slot])) break; slots.push(slot); }
    if (!slots.length) return null;
    const wanted = Object.prototype.hasOwnProperty.call(NEED, resolved.look) ? resolved.look : 'solid';
    const kind = slots.length >= NEED[wanted] ? wanted : 'solid';
    const tints = slots.map(slot => palette[slot]);
    const a = tints[0];
    const b = kind === 'solid' ? a : tints[1];
    const c = kind === 'solid' ? a : kind === 'rainbow' ? tints[2] : tints[1];
    const tentacles = Array.from({ length: 5 }, (_, i) => {
      if (kind === 'solid') return a;
      if (kind === 'duo') return b;
      if (kind === 'blend') return mix(a, b, 0.7);
      const u = i / 4;
      return u < 0.5 ? mix(a, b, u * 2) : mix(b, c, (u - 0.5) * 2);
    });
    return { kind, slots: slots.slice(0, kind === 'solid' ? 1 : NEED[kind]), a, b, c, mid: mix(a, b, 0.5), tentacles, oral: kind === 'solid' ? a : b, outline: kind === 'rainbow' ? b : a };
  }

  /** 调色板就是页面上色块的颜色（settings.html 的 --swatch，与原生调色板的对照由测试守住），示意图与色块不会不一致。 */
  function swatchPalette() {
    const palette = [];
    for (const swatch of swatches()) {
      const rgb = hexToRgb(swatch.style?.getPropertyValue?.('--swatch'));
      const slot = Number(swatch.dataset?.color);
      if (rgb && Number.isInteger(slot)) palette[slot] = rgb;
    }
    return palette;
  }
  const colorName = slot => {
    const swatch = swatches().find(item => Number(item.dataset?.color) === slot);
    return String(swatch?.getAttribute?.('title') || '').replace(/（[^）]*）/g, '').trim() || `色位 ${slot + 1}`;
  };
  /** 文字说明写清每种颜色在哪里（读屏与色弱用户都靠它，也是对花纹的准确描述）。 */
  function previewText(paint) {
    const [n0, n1, n2] = paint.slots.map(colorName);
    switch (paint.kind) {
      case 'duo': return `双色（钟罩${n0}，触须${n1}）`;
      case 'blend': return `渐变（下缘${n0} → 顶部${n1}）`;
      case 'rainbow': return `七彩（${n0}、${n1}、${n2}，横向铺开）`;
      default: return `纯色（${n0}）`;
    }
  }

  /** 按后台给出的 resolved（“每天换一只”开着时就是当天那只）更新示意图；没有可用数据就隐藏，不影响其余控件。 */
  function renderPreview(reply) {
    const box = $('set-jellyPreview'), label = $('set-jellyPreviewLabel'), text = $('set-jellyPreviewText');
    if (!box) return;
    const paint = paintOf(reply?.resolved, swatchPalette());
    if (!paint) { box.hidden = true; if (text) text.textContent = ''; return; }
    const title = reply.settings?.daily === true ? '今天这只' : '当前形象';
    const description = previewText(paint);
    const set = (name, rgb) => box.style.setProperty(name, toHex(rgb));
    box.setAttribute('data-look', paint.kind);
    set('--jp-a', paint.a); set('--jp-b', paint.b); set('--jp-c', paint.c); set('--jp-mid', paint.mid);
    paint.tentacles.forEach((rgb, i) => set(`--jp-t${i}`, rgb));
    set('--jp-oral', paint.oral); set('--jp-outline', paint.outline);
    if (label) label.textContent = title;
    if (text) text.textContent = description;
    box.setAttribute('aria-label', `${title}：${description}`);
    box.hidden = false;
  }

  /** 状态文字：每种组件状态都给出可行动的下一步，没生效就不说已生效。 */
  function describe(reply) {
    switch (reply?.component) {
      case 'ok': return '外观已应用到桌面水母。';
      case 'unsupported': return '桌面组件版本较旧，不支持形象设置：请更新桌面组件后重载扩展。设置已保存，更新后自动生效。';
      case 'off': return '设置已保存。';
      default: return reply?.connected
        ? '设置已保存，正在等待桌面组件确认…'
        : '设置已保存。桌面水母没有连上（需要先在上面的“桌面水母”里打开“常驻桌面”），下次出现时会按这里的设置显示。';
    }
  }

  function setStatus(text) { const el = $('set-jellyAppearanceStatus'); if (el) el.textContent = text || ''; }

  /** 控件可用性：忙碌时全部禁用；“每天换一只”开着时颜色与花纹额外禁用（随机按钮与开关仍可用）。 */
  function refreshEnabled() {
    const lock = busy || daily;
    const look = $('set-jellyLook'); if (look) look.disabled = lock;
    for (const swatch of swatches()) swatch.disabled = lock;
    const dailyBox = $('set-jellyDaily'); if (dailyBox) dailyBox.disabled = busy;
    const reroll = $('set-jellyReroll'); if (reroll) reroll.disabled = busy;
  }

  function apply(reply) {
    const { settings } = reply;
    for (const swatch of swatches()) swatch.setAttribute('aria-checked', String(Number(swatch.dataset.color) === settings.color));
    const look = $('set-jellyLook'); if (look) look.value = settings.look;
    const dailyBox = $('set-jellyDaily'); if (dailyBox) dailyBox.checked = settings.daily === true;
    daily = settings.daily === true;
    renderPreview(reply);
    setStatus(describe(reply));
  }

  function run(message, label) {
    busy = true; refreshEnabled();
    if (label) setStatus(label);
    chain = chain.then(() => send(message)).then(apply)
      .catch(error => setStatus(`保存失败：${error.message}。再改一次即可重试。`))
      .then(() => { busy = false; refreshEnabled(); });
  }

  function bind() {
    if (!$('sp-jelly-appearance-card')) return;
    for (const swatch of swatches()) {
      swatch.addEventListener('click', () => { void run({ action: 'jelly_appearance_set', settings: { color: Number(swatch.dataset.color) } }, '正在保存…'); });
    }
    $('set-jellyLook')?.addEventListener('change', event => { void run({ action: 'jelly_appearance_set', settings: { look: event.target.value } }, '正在保存…'); });
    $('set-jellyDaily')?.addEventListener('change', event => { void run({ action: 'jelly_appearance_set', settings: { daily: event.target.checked } }, '正在保存…'); });
    $('set-jellyReroll')?.addEventListener('click', () => { void run({ action: 'jelly_appearance_reroll' }, '正在换一只…'); });
    // 水母常驻状态或外观在别处变化后（比如另一个设置页），刷新一次显示
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === 'local' && (changes.desktopJellyV1 || changes.desktopJellyAppearanceV1)) void run({ action: 'jelly_appearance_get' }, '');
    });
    chain = chain.then(() => send({ action: 'jelly_appearance_get' })).then(apply)
      .catch(error => setStatus(`无法读取形象设置：${error.message}。请在已加载的扩展里打开本页。`))
      .then(refreshEnabled);
  }

  root.JellyAppearanceSettings = { describe, paintOf };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})(typeof window !== 'undefined' ? window : globalThis);
