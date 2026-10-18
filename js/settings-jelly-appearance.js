(function (root) {
  'use strict';

  // 设置页“桌面水母形象”卡片：只经扩展消息读写（后台 js/jelly-appearance.js 拥有设置与解析），页面不直接写存储、不连接组件。
  // 水母常驻时选择立即在桌面生效；没有常驻时没有实时预览，页面如实说明。设计见 docs/superpowers/specs/2026-10-17-jelly-appearance-design.md；
  // 动物（物种）部分见 docs/superpowers/specs/2026-10-17-jelly-species-design.md：示意图用 js/jelly-species-shapes.js 的同一份形状数据画，
  // 颜色规则与原生 SpeciesPainter 一致，所以示意图与桌面上的动物是同一个形状、同一套花纹语义。

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
  // 物种中文名：与原生 JellySpecies.displayName 一致（test/desktop-companion-logic.test.mjs 对照）；下拉框里只列已经画得出来的物种（见 settings.html）。
  const SPECIES_NAMES = Object.freeze({ jelly: '水母', hammer: '小锤头鲨', manta: '蝠鲼', turtle: '海龟', whaleshark: '鲸鲨' });
  const speciesNameOf = id => (Object.prototype.hasOwnProperty.call(SPECIES_NAMES, id) ? SPECIES_NAMES[id] : SPECIES_NAMES.jelly);
  const mix = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
  const hexToRgb = hex => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };
  const toHex = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

  /**
   * 肢体（触须、鳍、四肢）在位置 u（沿身体长轴，0 尾端 → 1 头端）处的颜色：纯色一色；双色第二色；渐变偏向第二色（0.7）；
   * 七彩沿长轴在三色之间取色。规则与原生 JellyPaint.limbTone(u:) 一致（test/desktop-companion-logic.test.mjs 逐点对照）。
   * u 夹到 0…1，不是有限数（NaN、无穷、非数字）取正中，不外推。paint 取 paintOf 的结果。
   */
  function limbTone(paint, u) {
    if (!paint) return null;
    const t = Number.isFinite(u) ? Math.max(0, Math.min(1, u)) : 0.5;
    if (paint.kind === 'solid') return paint.a;
    if (paint.kind === 'duo') return paint.b;
    if (paint.kind === 'blend') return mix(paint.a, paint.b, 0.7);
    return t < 0.5 ? mix(paint.a, paint.b, t * 2) : mix(paint.b, paint.c, (t - 0.5) * 2);
  }

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
    const tentacles = Array.from({ length: 5 }, (_, i) => limbTone({ kind, a, b, c }, i / 4));
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
  /** 文字说明写清每种颜色在哪里（读屏与色弱用户都靠它，也是对花纹的准确描述）。动物没有钟罩与触须：躯干沿尾→头铺色，鳍与尾取肢体色；海龟的头也是肢体色，所以双色时点名头。 */
  function previewText(paint, species = 'jelly') {
    const [n0, n1, n2] = paint.slots.map(colorName);
    if (species !== 'jelly') {
      switch (paint.kind) {
        case 'duo': return species === 'turtle' ? `双色（龟壳${n0}，头、鳍与尾${n1}）` : `双色（躯干${n0}，鳍与尾${n1}）`;
        case 'blend': return `渐变（尾端${n0} → 头端${n1}）`;
        case 'rainbow': return `七彩（${n0}、${n1}、${n2}，由尾到头铺开）`;
        default: return `纯色（${n0}）`;
      }
    }
    switch (paint.kind) {
      case 'duo': return `双色（钟罩${n0}，触须${n1}）`;
      case 'blend': return `渐变（下缘${n0} → 顶部${n1}）`;
      case 'rainbow': return `七彩（${n0}、${n1}、${n2}，横向铺开）`;
      default: return `纯色（${n0}）`;
    }
  }

  // ---------- 动物示意图：同一份形状数据 + 与原生 SpeciesPainter 同规则的颜色 → 一段自包含的 SVG（用 <img> 的 data: 地址显示） ----------
  const TILE_W = 100, TILE_H = 136, FIT_W = 84;     // 与水母示意图同一块 100×136 的深色底；动物按长度缩进 84 以内并居中
  const lighten = (rgb, amount) => rgb.map(c => Math.min(1, c + (1 - c) * amount));
  const shade = (rgb, lightenBy = 0, darkenBy = 0) => lighten(rgb, lightenBy).map(c => c * (1 - darkenBy));   // 与原生 JellyTint.color(_, lighten:, darken:) 同式

  /**
   * 某种动物按 paint（paintOf 的结果）画出的静态示意图（朝右、不转身、不划水），返回 SVG 文本；动物不存在、形状数据缺失或 paint 无效返回 null。
   * 取色与原生 SpeciesPainter 一致：躯干纯色/双色用主色自下而上由深到浅，渐变与七彩沿尾→头铺色（再叠一层自下而上的亮度）；
   * 肢体取 limbTone(u) 的上浅下深小渐变与同色系深描边；腹部主色提亮；斑点（白，透明度 0.72）与高光（白，0.4）是半透明白；眼睛、高光点、腮红与微笑按数据里的位置画。
   * 全部数值来自形状数据（expand 已校验路径只含 M/L/C/Q/Z 与数字）和 toHex 的结果，不拼接任何外部文字，所以不会注入标记。
   */
  function animalPreviewSvg(id, paint) {
    const S = root.JellySpeciesShapes;
    if (id === 'jelly' || !paint || !S || typeof S.expand !== 'function' || !Array.isArray(S.AVAILABLE) || !S.AVAILABLE.includes(id)) return null;
    const shape = S.expand(id), union = S.union(id);
    if (!shape || !union) return null;
    // 躯干包围盒（渐变沿它铺开，与原生 SpeciesGeometry.bodyBounds 同一定义：只算躯干部件、静止相位），形状数据坐标（y 向下）
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const part of shape.parts) {
      if (part.role !== 'body') continue;
      for (const [x, y] of S.sample(S.parsePath(part.d))) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    }
    if (![bx0, by0, bx1, by1].every(Number.isFinite) || bx1 <= bx0 || by1 <= by0) return null;
    const width = union.maxX - union.minX;
    if (!(width > 0)) return null;
    const fit = Math.min(1, FIT_W / width), k = shape.scale * fit;
    // union 是原生坐标（点，y 向上）；形状数据坐标 (x, y) → 底板坐标：x = 50 + fit·(scale·x − 中心x)，y = 68 + fit·(scale·y + 中心y)
    const tx = TILE_W / 2 - fit * (union.minX + union.maxX) / 2, ty = TILE_H / 2 + fit * (union.minY + union.maxY) / 2;
    const num = S.num, hex = toHex;
    const stop = (offset, rgb, opacity) => `<stop offset="${num(offset)}" stop-color="${hex(rgb)}" stop-opacity="${num(opacity)}"/>`;
    const gradient = (gid, attrs, stops) => `<linearGradient id="${gid}" ${attrs}>${stops.join('')}</linearGradient>`;
    const midX = (bx0 + bx1) / 2, midY = (by0 + by1) / 2;
    const vertical = `gradientUnits="userSpaceOnUse" x1="${num(midX)}" y1="${num(by1)}" x2="${num(midX)}" y2="${num(by0)}"`;       // 自下（y 大）而上
    const lengthwise = `gradientUnits="userSpaceOnUse" x1="${num(bx0)}" y1="${num(midY)}" x2="${num(bx1)}" y2="${num(midY)}"`;      // 自尾（左）到头（右）
    const defs = ['<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26334f"/><stop offset="1" stop-color="#121a2c"/></linearGradient>'];
    const layered = paint.kind === 'blend' || paint.kind === 'rainbow';
    if (paint.kind === 'blend') defs.push(gradient('bodyFill', lengthwise, [stop(0, shade(paint.a, 0.22), 0.95), stop(1, shade(paint.b, 0.22), 0.95)]));
    else if (paint.kind === 'rainbow') defs.push(gradient('bodyFill', lengthwise, [stop(0, shade(paint.a, 0.22), 0.95), stop(0.5, shade(paint.b, 0.22), 0.95), stop(1, shade(paint.c, 0.22), 0.95)]));
    else defs.push(gradient('bodyFill', vertical, [stop(0, shade(paint.a, 0, 0.05), 0.93), stop(0.55, shade(paint.a, 0.22), 0.95), stop(1, shade(paint.a, 0.5), 0.97)]));
    if (layered) defs.push(gradient('bodyLight', vertical, [stop(0, [1, 1, 1], 0), stop(1, [1, 1, 1], 0.32)]));
    const out = [];
    shape.parts.forEach((part, index) => {
      const d = part.d;
      switch (part.role) {
        case 'limb': {
          const tone = limbTone(paint, part.u);
          defs.push(gradient(`limb${index}`, 'x1="0" y1="1" x2="0" y2="0"', [stop(0, shade(tone, 0, 0.06), 0.92), stop(1, shade(tone, 0.34), 0.95)]));
          out.push(`<path d="${d}" fill="url(#limb${index})" stroke="${hex(shade(tone, 0, 0.3))}" stroke-opacity=".9" stroke-width="${num(1 / k)}"/>`);
          break;
        }
        case 'body':
          out.push(`<path d="${d}" fill="url(#bodyFill)"/>`);
          if (layered) out.push(`<path d="${d}" fill="url(#bodyLight)"/>`);
          out.push(`<path d="${d}" fill="none" stroke="${hex(shade(paint.outline, 0, 0.28))}" stroke-opacity=".9" stroke-width="${num(1.1 / k)}"/>`);
          break;
        case 'belly': out.push(`<path d="${d}" fill="${hex(shade(paint.a, 0.72))}" fill-opacity=".92"/>`); break;
        case 'accent': out.push(`<path d="${d}" fill="#fff" fill-opacity=".72"/>`); break;
        case 'shine': out.push(`<path d="${d}" fill="#fff" fill-opacity=".4"/>`); break;
        default: break;
      }
    });
    const r = shape.eyes.r;
    for (const [x, y] of shape.eyes.at) {
      out.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="#293a4d" fill-opacity=".88"/>`);
      out.push(`<circle cx="${num(x + 0.2 * r)}" cy="${num(y - 0.4 * r)}" r="${num(0.3 * r)}" fill="#fff" fill-opacity=".85"/>`);
    }
    for (const [x, y, rx, ry] of shape.blush) out.push(`<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(rx)}" ry="${num(ry)}" fill="#ff8c9e" fill-opacity=".34"/>`);
    // 微笑（只有侧视动物有）：与原生同一条三次贝塞尔、线宽 1.2 pt（组内坐标除以缩放）
    if (shape.mouth) {
      const [p0, p1, p2, p3] = shape.mouth.map(([x, y]) => `${num(x)} ${num(y)}`);
      out.push(`<path d="M ${p0} C ${p1} ${p2} ${p3}" fill="none" stroke="#293a4d" stroke-opacity=".88" stroke-width="${num(1.2 / k)}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_W} ${TILE_H}" width="${TILE_W}" height="${TILE_H}"><defs>${defs.join('')}</defs>`
      + `<rect width="${TILE_W}" height="${TILE_H}" rx="12" fill="url(#tile)"/>`
      + `<g transform="translate(${num(tx)} ${num(ty)}) scale(${num(k)})" stroke-linejoin="round" stroke-linecap="round">${out.join('')}</g></svg>`;
  }

  /** 示意图的 data: 地址（<img> 里的 SVG 不执行脚本、不加载外部资源）；画不出来返回 null。 */
  function animalPreviewUri(id, paint) {
    const svg = animalPreviewSvg(id, paint);
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  }

  /** 要显示的物种：后台解析出的 resolved.species，没有就用已存设置里的；不认识的取值当水母。 */
  function speciesOf(reply) {
    const id = reply?.resolved?.species ?? reply?.settings?.species;
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SPECIES_NAMES, id) ? id : 'jelly';
  }

  /**
   * 按后台给出的 resolved（“每天换一只”开着时就是当天那只）更新示意图；没有可用数据就隐藏，不影响其余控件。
   * 选了动物且形状数据可用时显示动物的示意图（<img>），否则显示水母的内联 SVG（所选动物还没有加入时文字如实说明）。
   */
  function renderPreview(reply) {
    const box = $('set-jellyPreview'), label = $('set-jellyPreviewLabel'), text = $('set-jellyPreviewText'), img = $('set-jellyAnimalPreview');
    if (!box) return;
    const paint = paintOf(reply?.resolved, swatchPalette());
    if (!paint) { box.hidden = true; if (text) text.textContent = ''; img?.removeAttribute?.('src'); return; }
    const title = reply.settings?.daily === true ? '今天这只' : '当前形象';
    const species = speciesOf(reply);
    const uri = species === 'jelly' || !img ? null : animalPreviewUri(species, paint);
    const prefix = uri ? `${speciesNameOf(species)}，` : species === 'jelly' ? '' : `暂时显示水母（“${speciesNameOf(species)}”还没有加入），`;
    const description = prefix + previewText(paint, uri ? species : 'jelly');
    const set = (name, rgb) => box.style.setProperty(name, toHex(rgb));
    box.setAttribute('data-look', paint.kind);
    box.setAttribute('data-art', uri ? 'animal' : 'jelly');
    box.setAttribute('data-species', uri ? species : 'jelly');
    if (img) { if (uri) img.setAttribute('src', uri); else img.removeAttribute('src'); }
    set('--jp-a', paint.a); set('--jp-b', paint.b); set('--jp-c', paint.c); set('--jp-mid', paint.mid);
    paint.tentacles.forEach((rgb, i) => set(`--jp-t${i}`, rgb));
    set('--jp-oral', paint.oral); set('--jp-outline', paint.outline);
    if (label) label.textContent = title;
    if (text) text.textContent = description;
    box.setAttribute('aria-label', `${title}：${description}`);
    box.hidden = false;
  }

  /** 状态文字：每种组件状态都给出可行动的下一步，没生效就不说已生效。选了动物时点名所选的动物（组件没有画出它时现在显示的是水母）。 */
  function describe(reply) {
    const wanted = reply?.settings?.species;
    const animal = typeof wanted === 'string' && wanted !== 'jelly' && Object.prototype.hasOwnProperty.call(SPECIES_NAMES, wanted) ? SPECIES_NAMES[wanted] : null;
    switch (reply?.component) {
      case 'ok': return animal ? `外观已应用到桌面：${animal}。` : '外观已应用到桌面水母。';
      case 'unsupported': return animal
        ? `桌面组件没有画出所选的“${animal}”（组件版本较旧，或这种动物还没有加入）：请更新桌面组件后重载扩展。设置已保存，更新后自动生效；现在桌面上显示的是水母。`
        : '桌面组件版本较旧，不支持形象设置：请更新桌面组件后重载扩展。设置已保存，更新后自动生效。';
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
    const species = $('set-jellySpecies'); if (species) species.disabled = busy;          // 物种与“每天换一只”无关：日期与随机只换颜色和花纹
    const look = $('set-jellyLook'); if (look) look.disabled = lock;
    for (const swatch of swatches()) swatch.disabled = lock;
    const dailyBox = $('set-jellyDaily'); if (dailyBox) dailyBox.disabled = busy;
    const reroll = $('set-jellyReroll'); if (reroll) reroll.disabled = busy;
  }

  function apply(reply) {
    const { settings } = reply;
    for (const swatch of swatches()) swatch.setAttribute('aria-checked', String(Number(swatch.dataset.color) === settings.color));
    const look = $('set-jellyLook'); if (look) look.value = settings.look;
    const species = $('set-jellySpecies'); if (species) species.value = typeof settings.species === 'string' ? settings.species : 'jelly';
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
    $('set-jellySpecies')?.addEventListener('change', event => { void run({ action: 'jelly_appearance_set', settings: { species: event.target.value } }, '正在保存…'); });
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

  root.JellyAppearanceSettings = { describe, paintOf, limbTone, animalPreviewSvg, animalPreviewUri, SPECIES_NAMES };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})(typeof window !== 'undefined' ? window : globalThis);
