// “解压果冻”控制器：界面构建、尺寸与像素比、逐帧循环（醒着才画、睡着即停）、指针/键盘/按钮输入、
// 颜色与本机数据、累计时长、休息倒计时、卸载释放、故障自停。物理本身在 jelly-core.test.js。
// 这里用替身 DOM / RAF / ResizeObserver / 定时器 / localStorage / 记录型画布驱动真实的控制器代码（不是真实浏览器）。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jelly-core.js');
const Game = require('../js/jelly-game.js');

const P = Core.PARAMS;

// ---------- 替身 ----------

class FakeClassList {
    constructor() { this.set = new Set(); }
    reset(value) { this.set = new Set(String(value).split(/\s+/).filter(Boolean)); }
    add(...names) { names.forEach(name => this.set.add(name)); }
    remove(...names) { names.forEach(name => this.set.delete(name)); }
    contains(name) { return this.set.has(name); }
    toString() { return [...this.set].join(' '); }
}

function matches(el, selector) {
    let found;
    if ((found = /^\.([\w-]+)$/.exec(selector))) return el.classList.contains(found[1]);
    if ((found = /^\[([\w-]+)\]$/.exec(selector))) return el.attrs.has(found[1]);
    if ((found = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector))) return el.attrs.get(found[1]) === found[2];
    throw new Error(`替身不支持的选择器：${selector}`);
}

class FakeElement {
    constructor(tag, doc) {
        this.tagName = tag.toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        this.listeners = new Map();
        this.classList = new FakeClassList();
        this.style = { props: {}, setProperty(key, value) { this.props[key] = value; } };
        this._text = '';
        this._w = 300;
        this._h = 150;
        this.widthWrites = 0;      // 给画布缓冲尺寸记账：改尺寸会清空画布状态，没变化时不应该写
        this.heightWrites = 0;
        this.captured = null;
        this.focused = 0;
    }
    get width() { return this._w; }
    set width(value) { this._w = value; this.widthWrites++; }
    get height() { return this._h; }
    set height(value) { this._h = value; this.heightWrites++; }
    get className() { return this.classList.toString(); }
    set className(value) { this.classList.reset(value); }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; }
    removeAttribute(key) { this.attrs.delete(key); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._text = String(value);
    }
    addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
        const list = this.listeners.get(type) || [];
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
    }
    listenerCount() { let total = 0; for (const list of this.listeners.values()) total += list.length; return total; }
    dispatch(type, init = {}) {
        const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
        for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
        return event;
    }
    getBoundingClientRect() { return this.ownerDocument.rectFor(this); }
    // 布局尺寸：浏览器取整、且不受祖先 transform 影响；矩形对象上的 layoutWidth/layoutHeight 用来模拟“被缩放后的外接矩形 ≠ 布局尺寸”
    get clientWidth() { const rect = this.ownerDocument.rectFor(this); return rect.layoutWidth ?? Math.round(rect.width); }
    get clientHeight() { const rect = this.ownerDocument.rectFor(this); return rect.layoutHeight ?? Math.round(rect.height); }
    getContext(kind) { return kind === '2d' ? (this._ctx || (this._ctx = this.ownerDocument.makeCtx())) : null; }
    setPointerCapture(id) { this.captured = id; }
    releasePointerCapture(id) {
        if (this.captured !== id) return;
        this.captured = null;
        this.dispatch('lostpointercapture', { pointerId: id });      // 真实浏览器释放捕获后会触发这个事件（这里同步触发，是更苛刻的情况）
    }
    hasPointerCapture(id) { return this.captured === id; }
    focus() { this.focused++; }
    * walk() { yield this; for (const child of this.children) yield* child.walk(); }
    query(selector) { return [...this.walk()].filter(el => el !== this && matches(el, selector)); }
}

/** 记录所有方法调用（名字与参数）与渐变色标的画布；throwOn 指定的方法被调用时抛错。 */
function recorder({ throwOn = null } = {}) {
    const calls = [];
    const log = [];
    const stops = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key === '_log') return log;
            if (key === '_stops') return stops;
            if (key in target) return target[key];
            return (...args) => {
                if (throwOn && key === throwOn) throw new Error('画布故障');
                calls.push(String(key));
                log.push([String(key), args]);
                if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop(offset, color) { stops.push(color); } };
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}

function fakeStorage(initial = {}, { failRead = false, failWrite = false } = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem(key) { if (failRead) throw new Error('denied'); return map.has(key) ? map.get(key) : null; },
        setItem(key, value) { if (failWrite) throw new Error('quota'); map.set(key, String(value)); },
    };
}

/** 组装一套环境并挂载前的全部替身；mount() 之后可以用 h.el / h.all / h.run 操作。 */
function harness(options = {}) {
    const clock = { t: 1000000 };
    const stage = options.stage || { left: 0, top: 0, width: 640, height: 400 };
    const listeners = new Map();
    const doc = {
        hidden: false,
        createElement: tag => new FakeElement(tag, doc),
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
        removeEventListener(type, fn) { const list = listeners.get(type) || []; const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); },
        dispatch(type) { for (const fn of [...(listeners.get(type) || [])]) fn({ type }); },
        listenerCount(type) { return (listeners.get(type) || []).length; },
        rectFor: el => (el.classList.contains('jelly-canvas') ? (h.canvasRect || stage) : (el.classList.contains('jelly-stage') ? stage : { left: 0, top: 0, width: 0, height: 0 })),
        makeCtx: () => (options.noContext ? null : (h.ctx = recorder({ throwOn: options.throwOn }))),
    };
    let rafSeq = 0;
    const queue = new Map();
    const rafs = {
        raf: cb => { const id = ++rafSeq; queue.set(id, cb); return id; },
        caf: id => { if (!options.rafNoCancel) queue.delete(id); },
        get pending() { return queue.size; },
        flush(t) { const entries = [...queue.values()]; queue.clear(); for (const cb of entries) cb(t); return entries.length; },
    };
    let timerSeq = 0;
    const active = new Map();
    const timers = {
        intervals: [],
        setInterval: (fn, ms) => { const id = ++timerSeq; timers.intervals.push(ms); active.set(id, { fn, ms }); return id; },
        clearInterval: id => { active.delete(id); },
        get active() { return active.size; },
        tick() { for (const timer of [...active.values()]) timer.fn(); },
    };
    const instances = [];
    class FakeResizeObserver {
        constructor(cb) { this.cb = cb; this.observed = []; this.disconnected = false; instances.push(this); }
        observe(el) { this.observed.push(el); }
        disconnect() { this.disconnected = true; }
        trigger() { this.cb([]); }
    }
    const warnings = [];
    const storage = options.storage || fakeStorage(options.stored);
    const win = {
        devicePixelRatio: 'dpr' in options ? options.dpr : 1,
        matchMedia: query => ({ matches: !!options.reduce && /reduced-motion/.test(query) }),
    };
    const env = {
        document: doc, window: win, storage, now: () => clock.t,
        raf: rafs.raf, caf: rafs.caf, setInterval: timers.setInterval, clearInterval: timers.clearInterval,
        ResizeObserver: FakeResizeObserver, warn: message => warnings.push(message),
    };
    if ('core' in options) env.core = options.core;
    const game = Game.create(env);
    const root = new FakeElement('div', doc);

    const h = {
        game, doc, root, stage, storage, rafs, timers, ro: { instances }, warnings, clock, win, handle: null, ctx: null, canvasRect: null,
        mount(mountOptions) { h.handle = game.mount(root, mountOptions); return h.handle; },
        el(selector) { return root.query(selector)[0] || null; },
        all(selector) { return root.query(selector); },
        get canvas() { return h.el('.jelly-canvas'); },
        /** 以 60fps 推进，直到没有排队的帧或超过 seconds 秒；返回跑了多少帧。 */
        run(seconds, fps = 60) {
            let frames = 0;
            for (let elapsed = 0; elapsed < seconds * 1000 && rafs.pending; elapsed += 1000 / fps) {
                clock.t += 1000 / fps;
                rafs.flush(clock.t);
                frames++;
            }
            return frames;
        },
        draws() { return h.ctx ? h.ctx._calls.filter(name => name === 'clearRect').length : 0; },
        down(x, y, extra = {}) { return h.canvas.dispatch('pointerdown', { pointerId: 1, button: 0, clientX: x, clientY: y, ...extra }); },
        move(x, y, extra = {}) { return h.canvas.dispatch('pointermove', { pointerId: 1, clientX: x, clientY: y, ...extra }); },
        up(extra = {}) { return h.canvas.dispatch('pointerup', { pointerId: 1, ...extra }); },
        center() { const m = Core.metrics(h.handle.world); return { x: m.cx, y: m.cy, m }; },
    };
    return h;
}

/** 坐着开场（减少动态效果）并跑到睡着，得到一个稳定的起点。 */
function settled(options = {}) {
    const h = harness({ reduce: true, ...options });
    h.mount();
    h.run(12);
    assert.equal(h.handle.world.asleep, true, '夹具：已睡着');
    return h;
}

const speedSum = world => world.points.reduce((sum, p) => sum + Math.hypot(p.x - p.px, p.y - p.py), 0);

// ---------- 纯函数 ----------

test('调色板：六种颜色，id 唯一、通道合法、亮色 > 主色 > 暗色，未知 id 回到默认', () => {
    assert.equal(Game.PALETTE.length, 6);
    assert.equal(new Set(Game.PALETTE.map(color => color.id)).size, 6);
    assert.ok(Object.isFrozen(Game.PALETTE));
    const luma = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    for (const color of Game.PALETTE) {
        assert.match(color.name, /^[\u4e00-\u9fa5]+$/, '名称是中文');
        for (const channel of [...color.base, ...color.light, ...color.dark]) assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255);
        assert.ok(luma(color.light) > luma(color.base) && luma(color.base) > luma(color.dark), `${color.id} 明暗层次`);
    }
    assert.equal(Game.paletteById('grape').id, 'grape');
    assert.equal(Game.paletteById('blueberry').id, Game.DEFAULT_COLOR);
    assert.equal(Game.paletteById(undefined).id, Game.DEFAULT_COLOR);
    assert.equal(Game.DEFAULT_COLOR, Game.PALETTE[0].id);
});

test('wrapAngle：归到 (−π, π]，2π 的整数倍是 0', () => {
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
    near(Game.wrapAngle(0), 0);
    near(Game.wrapAngle(Math.PI), Math.PI);
    near(Game.wrapAngle(-Math.PI), Math.PI);
    near(Game.wrapAngle(3 * Math.PI), Math.PI);
    near(Game.wrapAngle(2 * Math.PI), 0);
    near(Game.wrapAngle(-4 * Math.PI), 0);
    near(Game.wrapAngle(Math.PI + 0.5), -Math.PI + 0.5);
    near(Game.wrapAngle(-Math.PI - 0.5), Math.PI - 0.5);
    near(Game.wrapAngle(0.3), 0.3);
    near(Game.wrapAngle(-0.3), -0.3);
});

test('easeAngle：走最短的一边（越过 ±π 不绕远路）、与帧率无关、非法时间不动', () => {
    const next = Game.easeAngle(3, -3, 16, 90);
    assert.ok(next > 3 && next < Math.PI + 0.3, `从 3 去 −3 应沿正方向穿过 π，得到 ${next}`);
    assert.ok(Game.easeAngle(-3, 3, 16, 90) < -3, '反向同理');
    const once = Game.easeAngle(0.2, 2.0, 16, 90);
    const twice = Game.easeAngle(Game.easeAngle(0.2, 2.0, 8, 90), 2.0, 8, 90);
    assert.ok(Math.abs(once - twice) < 1e-9, '两个半步等于一整步');
    let angle = -2.5;
    for (let i = 0; i < 80; i++) angle = Game.easeAngle(angle, 2.5, 16, 90);
    assert.ok(Math.abs(Game.wrapAngle(angle - 2.5)) < 0.01, `最终到位 ${angle}`);
    assert.equal(Game.easeAngle(1, 2, 0, 90), 1);
    assert.equal(Game.easeAngle(1, 2, -5, 90), 1);
    assert.equal(Game.easeAngle(1, 2, 16, 0), 1);
    assert.equal(Game.easeAngle(1, 1, 16, 90), 1, '已在目标上');
});

test('formatDuration / formatCountdown：展示格式', () => {
    const cases = [[0, '0 秒'], [59, '59 秒'], [59.9, '59 秒'], [60, '1 分钟'], [119, '1 分钟'], [3599, '59 分钟'], [3600, '1 小时'], [3660, '1 小时 1 分'], [7325, '2 小时 2 分'], [-5, '0 秒'], [NaN, '0 秒'], [Infinity, '0 秒']];
    for (const [input, expected] of cases) assert.equal(Game.formatDuration(input), expected, String(input));
    for (const [input, expected] of [[60, '1:00'], [59.2, '1:00'], [59, '0:59'], [9, '0:09'], [0.1, '0:01'], [0, '0:00'], [-3, '0:00'], [600, '10:00']]) {
        assert.equal(Game.formatCountdown(input), expected, String(input));
    }
});

test('expression：折叠/空中/被拉得很长 → 惊讶；睡着 → 开心；其余平静', () => {
    const base = { folded: false, airborne: false, grabbed: false, asleep: false, stretch: 1 };
    assert.equal(Game.expression(base), 'calm');
    assert.equal(Game.expression({ ...base, folded: true }), 'surprised');
    assert.equal(Game.expression({ ...base, airborne: true }), 'surprised');
    assert.equal(Game.expression({ ...base, grabbed: true, stretch: 1.4 }), 'surprised');
    assert.equal(Game.expression({ ...base, grabbed: true, stretch: 1.3 }), 'calm', '轻轻拎着不惊讶');
    assert.equal(Game.expression({ ...base, stretch: 2 }), 'calm', '没被抓着时拉伸比不算（落地压扁也不惊讶）');
    assert.equal(Game.expression({ ...base, asleep: true }), 'happy');
    assert.equal(Game.expression({ ...base, asleep: true, grabbed: true }), 'calm', '被抓着不会是睡着的表情');
    assert.equal(Game.expression({ ...base, asleep: true, airborne: true }), 'surprised', '惊讶优先于开心');
});

test('faceLayout：位置贴质心偏上，比例随包围盒变化并夹在 0.7–1.35，眼睛左右对称', () => {
    const m = { cx: 300, cy: 200, width: 160, height: 160 };
    const layout = Game.faceLayout(m, 80, 0.25);
    assert.equal(layout.x, 300);
    assert.ok(layout.y < 200 && layout.y > 190, `脸略偏上：${layout.y}`);
    assert.equal(layout.angle, 0.25);
    assert.equal(layout.radius, 80);
    assert.equal(layout.sx, 1);
    assert.equal(layout.sy, 1);
    assert.ok(layout.eyeDx > 0 && layout.eyeRx > 0 && layout.eyeRy > layout.eyeRx, '眼睛是竖椭圆');
    assert.ok(layout.mouthY > layout.eyeY, '嘴在眼睛下面');
    const squashed = Game.faceLayout({ ...m, width: 220, height: 110 }, 80, 0);
    assert.ok(squashed.sx > 1.3 && squashed.sy < 0.75);
    const huge = Game.faceLayout({ ...m, width: 1000, height: 1000 }, 80, 0);
    const tiny = Game.faceLayout({ ...m, width: 1, height: 1 }, 80, 0);
    assert.deepEqual([huge.sx, huge.sy], [1.35, 1.35], '宽高两个方向的上限都是 1.35');
    assert.deepEqual([tiny.sx, tiny.sy], [0.7, 0.7], '宽高两个方向的下限都是 0.7');
    const doubled = Game.faceLayout(m, 160, 0);
    assert.equal(doubled.eyeDx, layout.eyeDx * 2, '各项尺寸与半径成正比');
});

test('shadowFor：贴地最大最浓，越高越小越淡，再高也有下限，不会出现负数', () => {
    const m = { cx: 100, width: 160, maxY: 388 };
    const onFloor = Game.shadowFor(m, 388, 80);
    assert.equal(onFloor.x, 100);
    assert.equal(onFloor.y, 390);
    assert.equal(onFloor.rx, 80);
    assert.ok(Math.abs(onFloor.alpha - 0.42) < 1e-9);
    assert.ok(Math.abs(onFloor.ry - 80 * 0.14) < 1e-9);
    const mid = Game.shadowFor({ ...m, maxY: 300 }, 388, 80);
    assert.ok(mid.rx < onFloor.rx && mid.alpha < onFloor.alpha && mid.alpha > 0);
    const high = Game.shadowFor({ ...m, maxY: -1000 }, 388, 80);
    assert.ok(high.rx >= 80 * 0.2 && high.rx < mid.rx);
    assert.ok(high.alpha > 0 && high.alpha < mid.alpha);
    assert.ok(Math.abs(high.rx - 80 * 0.55) < 1e-9, '再高也保留 55% 的宽度（缩小有上限）');
    assert.ok(Math.abs(high.alpha - 0.42 * 0.15) < 1e-9, '再高也保留 15% 的浓度（变淡有上限）');
    const narrow = Game.shadowFor({ cx: 0, width: 20, maxY: -1000 }, 388, 80);
    assert.ok(Math.abs(narrow.rx - 80 * 0.2) < 1e-9, '极窄的果冻也有最小的影子宽度');
    const below = Game.shadowFor({ ...m, maxY: 400 }, 388, 80);
    assert.equal(below.rx, onFloor.rx, '点略低于地面（数值误差）按贴地处理');
});

test('traceBody：每个点一段三次曲线、起止都在第一个点、曲线经过每个点、控制点按 Catmull-Rom', () => {
    const pts = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i / 8 * 2 * Math.PI) * 50, y: Math.sin(i / 8 * 2 * Math.PI) * 50 }));
    const calls = [];
    const ctx = new Proxy({}, { get: (target, key) => (...args) => { calls.push([String(key), args]); } });
    Game.traceBody(ctx, pts);
    assert.deepEqual(calls[0], ['beginPath', []]);
    assert.deepEqual(calls[1], ['moveTo', [pts[0].x, pts[0].y]]);
    const curves = calls.filter(([name]) => name === 'bezierCurveTo');
    assert.equal(curves.length, pts.length);
    curves.forEach(([, args], i) => {
        const next = pts[(i + 1) % pts.length];
        assert.deepEqual(args.slice(4), [next.x, next.y], `第 ${i} 段终点是下一个点`);
    });
    const n = pts.length;
    curves.forEach(([, args], i) => {                 // 每一段（含首尾回绕处）的控制点都按 Catmull-Rom 公式
        const p0 = pts[(i + n - 1) % n]; const p1 = pts[i]; const p2 = pts[(i + 1) % n]; const p3 = pts[(i + 2) % n];
        const expected = [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6];
        args.slice(0, 4).forEach((value, k) => assert.ok(Math.abs(value - expected[k]) < 1e-9, `第 ${i} 段控制点 ${k}`));
    });
    assert.equal(calls[calls.length - 1][0], 'closePath');
});

// ---------- 挂载与界面 ----------

test('挂载：舞台、画布（可聚焦、有说明）、六个颜色、按钮、累计时长与提醒开关齐全；没有休息倒计时', () => {
    const h = harness();
    const handle = h.mount();
    assert.ok(handle && h.game.isMounted());
    const canvas = h.canvas;
    assert.equal(canvas.tagName, 'CANVAS');
    assert.equal(canvas.getAttribute('tabindex'), '0');
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.match(canvas.getAttribute('aria-label'), /空格/, '读屏用户能知道怎么戳');
    const swatches = h.all('[data-jelly-color]');
    assert.deepEqual(swatches.map(s => s.getAttribute('data-jelly-color')), Game.PALETTE.map(color => color.id));
    assert.deepEqual(swatches.map(s => s.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false', 'false']);
    for (const swatch of swatches) {
        assert.equal(swatch.tagName, 'BUTTON');
        assert.equal(swatch.getAttribute('type'), 'button', '不是提交按钮');
        assert.match(swatch.getAttribute('aria-label'), /色$/);
        assert.match(swatch.style.props['--jelly-swatch'], /^rgb\(\d+,\d+,\d+\)$/);
    }
    assert.equal(h.el('[role="group"]').getAttribute('aria-label'), '果冻颜色');
    assert.equal(h.el('[data-jelly-poke]').textContent, '戳一下');
    assert.equal(h.el('[data-jelly-drop]').textContent, '重新掉落');
    assert.equal(h.el('.jelly-total').textContent, '累计放松 —');
    assert.equal(h.el('[data-jelly-offer]').textContent, '番茄钟结束时提醒我歇一会儿：开');
    assert.equal(h.el('[data-jelly-offer]').getAttribute('aria-pressed'), 'true');
    assert.equal(h.el('.jelly-rest'), null);
    assert.equal(h.el('[role="status"]').textContent, '', '读屏提示区开始是空的');
    assert.ok(h.el('.jelly-stage').children.includes(canvas));
    assert.equal(h.el('.jelly-hint').getAttribute('aria-hidden'), 'true', '操作提示是装饰，说明已在画布标签里');
    assert.equal(h.root.children.length, 1, '只往容器里放一个根节点');
});

test('像素缓冲 = 舞台尺寸 × 设备像素比（夹在 1–2），世界尺寸等于舞台的 CSS 尺寸', () => {
    for (const [dpr, expected] of [[1, 1], [2, 2], [3, 2], [1.5, 1.5], [0.5, 1], [undefined, 1], [NaN, 1], [0, 1]]) {
        const h = harness({ dpr });
        h.mount();
        const canvas = h.canvas;
        assert.equal(canvas.width, Math.round(640 * expected), `dpr=${dpr}`);
        assert.equal(canvas.height, Math.round(400 * expected), `dpr=${dpr}`);
        assert.equal(h.handle.world.width, 640);
        assert.equal(h.handle.world.height, 400);
    }
    const odd = harness({ dpr: 1.5, stage: { left: 0, top: 0, width: 641, height: 401 } });
    odd.mount();
    assert.equal(odd.canvas.width, 962, '961.5 四舍五入，不是向下取整');
    assert.equal(odd.canvas.height, 602);
});

test('舞台尺寸变化：经 ResizeObserver 缩放世界；同尺寸或小得离谱（还没布局好）都忽略', () => {
    const calls = [];
    const spyCore = { ...Core, resize(world, w, h) { calls.push([w, h]); return Core.resize(world, w, h); } };
    const h = harness({ core: spyCore });
    h.mount();
    assert.equal(calls.length, 0, '首次是创建世界而不是缩放');
    assert.equal(h.ro.instances.length, 1);
    assert.deepEqual(h.ro.instances[0].observed, [h.el('.jelly-stage')], '观察的是舞台');
    const observer = h.ro.instances[0];

    h.stage.width = 800; h.stage.height = 500;
    observer.trigger();
    assert.deepEqual(calls, [[800, 500]]);
    assert.equal(h.canvas.width, 800);
    assert.equal(h.handle.world.width, 800);
    observer.trigger();
    assert.equal(calls.length, 1, '同尺寸不重复缩放');

    h.stage.width = 10;
    observer.trigger();
    h.stage.width = 800; h.stage.height = 0;
    observer.trigger();
    assert.equal(calls.length, 1, '太小的尺寸（面板还没展开）不处理');
    assert.equal(h.handle.world.width, 800);

    h.stage.width = 700.7; h.stage.height = 420.7;
    observer.trigger();
    assert.deepEqual(calls[1], [701, 421], '读的是浏览器取整后的布局尺寸 clientWidth/Height');

    const widthWrites = h.canvas.widthWrites;
    const heightWrites = h.canvas.heightWrites;
    h.stage.height = 450;                          // 只变高度：宽度的像素缓冲没变就不重写（重写会清空画布状态）
    observer.trigger();
    assert.deepEqual(calls[2], [701, 450], '只变高度也要缩放');
    assert.equal(h.canvas.widthWrites, widthWrites);
    assert.equal(h.canvas.heightWrites, heightWrites + 1);
    h.stage.width = 720;                           // 只变宽度同理
    observer.trigger();
    assert.deepEqual(calls[3], [720, 450], '只变宽度也要缩放');
    assert.equal(h.canvas.widthWrites, widthWrites + 1);
    assert.equal(h.canvas.heightWrites, heightWrites + 1);
});

test('舞台正处在祖先的 scale 入场过渡里：世界按布局尺寸建立，不按缩放后的外接矩形；指针仍能准确换算', () => {
    // 游戏中心面板打开时是 scale(0.95) → 1 的弹簧过渡：外接矩形 608×380，布局尺寸仍是 640×400，ResizeObserver 不会因 transform 触发
    const stage = { left: 20, top: 30, width: 608, height: 380, layoutWidth: 640, layoutHeight: 400 };
    const h = harness({ stage, reduce: true });
    h.mount();
    assert.equal(h.handle.world.width, 640);
    assert.equal(h.handle.world.height, 400);
    assert.equal(h.canvas.width, 640);
    assert.equal(h.canvas.height, 400);
    h.run(12);
    const { x, y } = h.center();
    h.down(20 + x * 0.95, 30 + y * 0.95);           // 屏幕坐标 = 左上角 + 世界坐标 × 0.95
    assert.ok(h.handle.world.grab, '按缩放比例换算后点在果冻中心');
    h.move(20 + (x + 40) * 0.95, 30 + (y - 20) * 0.95);
    assert.ok(Math.abs(h.handle.world.pointer.x - (x + 40)) < 1e-9);
    assert.ok(Math.abs(h.handle.world.pointer.y - (y - 20)) < 1e-9);
    h.up();
    stage.width = 640; stage.height = 400;           // 过渡结束：外接矩形与布局尺寸一致，没有触发缩放
    stage.layoutWidth = undefined; stage.layoutHeight = undefined;
    h.ro.instances[0].trigger();
    assert.equal(h.handle.world.width, 640, '布局尺寸没变就不重复缩放');
});

test('挂载时舞台还没有尺寸：先不建世界、不排帧；尺寸出现后再开始', () => {
    const h = harness({ stage: { left: 0, top: 0, width: 0, height: 0 } });
    const handle = h.mount();
    assert.equal(handle.world, null);
    assert.equal(h.rafs.pending, 0);
    h.stage.width = 500; h.stage.height = 300;
    h.ro.instances[0].trigger();
    assert.ok(handle.world);
    assert.equal(handle.world.width, 500);
    assert.equal(h.rafs.pending, 1);
    assert.ok(h.run(1) > 0);
    assert.ok(h.draws() > 0);
});

test('开场：默认从上方掉下来；系统要求减少动态效果时直接坐着并用更大的阻尼', () => {
    const a = harness();
    a.mount();
    assert.equal(Core.metrics(a.handle.world).airborne, true, '开场在空中');
    assert.equal(a.handle.world.reduceMotion, false);

    const b = harness({ reduce: true });
    b.mount();
    const m = Core.metrics(b.handle.world);
    assert.equal(m.airborne, false);
    assert.ok(Math.abs(m.maxY - b.handle.world.floor) < 1e-6, '直接坐在地面上');
    assert.equal(b.handle.world.reduceMotion, true);
});

// ---------- 逐帧循环 ----------

test('逐帧循环：醒着每帧画一次并排下一帧；睡着补画最后一帧就停，之后没有排队的帧', () => {
    const h = harness();
    h.mount();
    assert.equal(h.rafs.pending, 1, '挂载后排了第一帧');
    h.rafs.flush(h.clock.t += 16);
    assert.equal(h.draws(), 1);
    assert.equal(h.rafs.pending, 1, '醒着：继续排下一帧');
    h.run(30);
    const world = h.handle.world;
    assert.equal(world.asleep, true, '落地、晃动之后睡着');
    assert.equal(h.rafs.pending, 0, '睡着后不再排帧');
    assert.equal(h.handle.running, false);
    const drawn = h.draws();
    assert.ok(drawn > 60, `晃了好几十帧（${drawn}）`);
    assert.equal(h.rafs.flush(h.clock.t += 16), 0, '没有帧可执行');
    assert.equal(h.draws(), drawn);
});

test('同一时刻多次请求只排一帧', () => {
    const h = settled();
    h.handle.poke(); h.handle.poke(); h.handle.drop(); h.handle.setColor('mint');
    assert.equal(h.rafs.pending, 1);
});

test('睡着时只补画、不推物理（核心的 step 不会因为睡着自己跳过）；碰一下才重新醒来', () => {
    const steps = [];
    const spyCore = { ...Core, step(world, dt) { steps.push(dt); return Core.step(world, dt); } };
    const h = settled({ core: spyCore });
    const before = steps.length;
    const drawsBefore = h.draws();
    const pose = h.handle.world.points.map(p => [p.x, p.y, p.px, p.py]);
    h.handle.setColor('mint');
    assert.equal(h.rafs.pending, 1);
    h.rafs.flush(h.clock.t += 16);
    assert.equal(steps.length, before, '补画那一帧没有调用 step');
    assert.equal(h.draws(), drawsBefore + 1, '但画了');
    assert.equal(h.rafs.pending, 0, '画完又睡');
    assert.deepEqual(h.handle.world.points.map(p => [p.x, p.y, p.px, p.py]), pose, '一个点都没动');

    h.clock.t += 5000;                              // 睡了很久
    h.handle.poke();
    assert.equal(h.handle.world.asleep, false, '戳一下，核心把 asleep 清掉');
    h.run(0.1);
    assert.ok(steps.length > before, '醒着的帧才推物理');
    assert.ok(Math.abs(steps[before] - 1000 / 60) < 1e-9, `醒来后第一帧按一个正常帧推进，而不是把睡过的 5 秒当成一帧（${steps[before]}）`);
});

test('页面不可见：停止逐帧、不再排帧；回到可见后若醒着就继续（第一帧不把隐藏的时间算进去）', () => {
    const steps = [];
    const spyCore = { ...Core, step(world, dt) { steps.push(dt); return Core.step(world, dt); } };
    const h = harness({ core: spyCore });
    h.mount();
    h.run(0.3);
    assert.equal(h.rafs.pending, 1);
    h.doc.hidden = true;
    h.doc.dispatch('visibilitychange');
    const drawn = h.draws();
    h.rafs.flush(h.clock.t += 16);
    assert.equal(h.draws(), drawn, '不可见时已排的帧发现不可见就退出，不画');
    assert.equal(h.rafs.pending, 0);
    h.handle.setColor('ocean');
    h.handle.poke();
    assert.equal(h.rafs.pending, 0, '不可见时任何请求都不排帧');

    h.clock.t += 5000;                              // 隐藏了很久
    h.doc.hidden = false;
    h.doc.dispatch('visibilitychange');
    assert.equal(h.rafs.pending, 1, '回到可见：醒着，继续');
    const stepsBefore = steps.length;
    h.rafs.flush(h.clock.t += 16);
    assert.ok(Math.abs(steps[stepsBefore] - 1000 / 60) < 1e-9, `回到可见后第一帧按一个正常帧推进（${steps[stepsBefore]}）`);
    assert.ok(h.ctx._stops.some(stop => stop.startsWith(`rgba(${Game.paletteById('ocean').light.join(',')}`)), '隐藏期间换的颜色在恢复后画出来');
});

test('页面不可见时挂载：不排帧，等可见后开始；一直不可见的时间不计入累计', () => {
    const h = harness();
    h.doc.hidden = true;
    h.mount();
    assert.equal(h.rafs.pending, 0);
    h.doc.hidden = false;
    h.doc.dispatch('visibilitychange');
    assert.equal(h.rafs.pending, 1);

    const stats = harness();
    stats.doc.hidden = true;
    stats.mount();
    stats.clock.t += 100 * 1000;
    stats.game.unmount();
    assert.equal(stats.storage.map.has('jellyPlaySeconds'), false, '一直不可见的 100 秒不计入');
});

test('帧时间戳回退（时钟调整、标签页恢复）时 dt 夹到 0，物理不会收到负数', () => {
    const steps = [];
    const spyCore = { ...Core, step(world, dt) { steps.push(dt); return Core.step(world, dt); } };
    const h = harness({ core: spyCore });
    h.mount();
    h.rafs.flush(5000);
    h.rafs.flush(4000);                             // 时间戳比上一帧还早
    assert.equal(steps.length, 2);
    assert.ok(steps.every(dt => dt >= 0));
    assert.equal(steps[1], 0);
});

test('指针按着时即使核心报告“睡着”，逐帧循环也不停（抓取由指针驱动）；松手后才停', () => {
    const alwaysAsleep = { ...Core, step(world, dt) { const steps = Core.step(world, dt); world.asleep = true; return steps; } };
    const h = settled({ core: alwaysAsleep });
    assert.equal(h.rafs.pending, 0);
    const { x, y } = h.center();
    h.down(x, y);
    assert.equal(h.rafs.pending, 1);
    assert.equal(h.run(1) > 30, true, '按着的一秒里一直有帧');
    assert.equal(h.rafs.pending, 1);
    h.up();
    h.run(1);
    assert.equal(h.rafs.pending, 0, '松手之后才停');
});

// ---------- 指针输入 ----------

test('按下果冻：抓住、捕获指针、聚焦画布、隐藏提示；移动跟随（夹在舞台内）；抬起放开', () => {
    const h = settled();
    const { x, y } = h.center();
    const world = h.handle.world;
    assert.equal(world.grab, null);
    const event = h.down(x, y);
    assert.equal(event.defaultPrevented, true);
    assert.ok(world.grab);
    assert.equal(h.canvas.captured, 1, '用指针捕获：拖出画布也能收到抬起');
    assert.ok(h.canvas.classList.contains('is-grabbing'));
    assert.ok(h.el('.jelly-game').classList.contains('is-quiet'));
    assert.equal(h.canvas.focused, 1, '点击后键盘可以接着戳');
    assert.equal(h.rafs.pending, 1, '睡着的果冻被抓住立刻重新开始逐帧');

    h.move(x + 50, y - 80);
    assert.equal(world.pointer.x, x + 50);
    assert.equal(world.pointer.y, y - 80);
    h.move(-500, 99999);
    assert.equal(world.pointer.x, 0, '指针被夹在舞台内');
    assert.equal(world.pointer.y, 400);

    h.up();
    assert.equal(world.grab, null);
    assert.equal(h.canvas.captured, null);
    assert.equal(h.canvas.classList.contains('is-grabbing'), false);
});

test('按在舞台空白处：什么也不抓、不拦截默认行为、不留痕迹', () => {
    const h = settled();
    const event = h.down(5, 5);
    assert.equal(event.defaultPrevented, false);
    assert.equal(h.handle.world.grab, null);
    assert.equal(h.canvas.captured, null);
    assert.equal(h.canvas.classList.contains('is-grabbing'), false);
    assert.equal(h.el('.jelly-game').classList.contains('is-quiet'), false);
    assert.equal(h.rafs.pending, 0);
});

test('只响应主键；抓着的时候其他指针的按下、移动、抬起都不起作用', () => {
    const h = settled();
    const { x, y } = h.center();
    for (const button of [1, 2]) {
        h.down(x, y, { button });
        assert.equal(h.handle.world.grab, null, `button=${button} 被忽略`);
    }
    h.down(x, y, { button: undefined });            // 没有 button 字段（部分触摸实现）仍然可以
    assert.ok(h.handle.world.grab);
    h.up();

    h.down(x, y);
    const grab = h.handle.world.grab;
    assert.ok(grab);
    h.down(x + 30, y, { pointerId: 2 });
    assert.equal(h.handle.world.grab, grab, '第二根手指不会重新抓');
    assert.equal(h.canvas.captured, 1);
    h.move(x + 100, y + 100, { pointerId: 2 });
    assert.notEqual(h.handle.world.pointer.x, x + 100, '其他指针的移动不拖动');
    h.up({ pointerId: 2 });
    assert.equal(h.handle.world.grab, grab, '其他指针抬起也不放手');
    h.up({ pointerId: 1 });
    assert.equal(h.handle.world.grab, null);
});

test('指针取消、丢失捕获都会放手；重复收到放手事件不出错', () => {
    for (const type of ['pointercancel', 'lostpointercapture']) {
        const h = settled();
        const { x, y } = h.center();
        h.down(x, y);
        h.move(x + 40, y - 40);
        h.canvas.dispatch(type, { pointerId: 1 });
        assert.equal(h.handle.world.grab, null, type);
        assert.equal(h.canvas.classList.contains('is-grabbing'), false, type);
        assert.equal(h.canvas.captured, null, type);
        h.canvas.dispatch(type, { pointerId: 1 });
        h.up();
        assert.equal(h.handle.world.grab, null);
    }
});

test('一次抓取只让核心放手一次（浏览器在释放捕获时同步触发 lostpointercapture 也不会放第二次）', () => {
    const releases = [];
    const spyCore = { ...Core, release(world) { const result = Core.release(world); releases.push(result); return result; } };
    const h = settled({ core: spyCore });
    const { x, y } = h.center();
    h.down(x, y);
    h.move(x + 80, y - 60);
    h.up();
    assert.deepEqual(releases, ['release'], '替身在释放捕获时会同步触发 lostpointercapture，若不防重入这里会多出一个 null');
    h.down(x, y);
    h.canvas.dispatch('pointercancel', { pointerId: 1 });
    assert.equal(releases.length, 2);
    h.up();
    h.canvas.dispatch('lostpointercapture', { pointerId: 1 });
    assert.equal(releases.length, 2, '没有在抓着时的放手事件一律忽略');
});

test('舞台缩放时核心会放开抓取，界面状态（样式、指针捕获）一并清掉，之后可以重新抓', () => {
    const h = settled();
    const { x, y } = h.center();
    h.down(x, y);
    assert.equal(h.canvas.classList.contains('is-grabbing'), true);
    assert.equal(h.canvas.captured, 1);
    h.stage.width = 700;
    h.ro.instances[0].trigger();
    assert.equal(h.handle.world.grab, null, '核心已放开');
    assert.equal(h.canvas.classList.contains('is-grabbing'), false, '界面不再显示“抓取中”');
    assert.equal(h.canvas.captured, null);
    h.move(x + 10, y);                              // 还没抬起的指针继续移动：不会拖动，也不出错
    assert.equal(h.handle.world.grab, null);
    h.up();
    const fresh = h.center();
    h.down(fresh.x, fresh.y);
    assert.ok(h.handle.world.grab, '重新按下可以再抓');
    h.up();
    h.run(15);
    assert.equal(h.handle.world.asleep, true, '之后能正常睡着，逐帧循环不会因残留的指针编号停不下来');
    assert.equal(h.rafs.pending, 0);
});

test('快速点一下 = 戳：果冻被推了一下；按住拖过再放开 = 普通松手', () => {
    const h = settled();
    const world = h.handle.world;
    const top = world.points[0];
    assert.ok(speedSum(world) < 2, `夹具：睡着时各点速度之和很小（实测约 1.0，这里 ${speedSum(world)}）`);
    h.down(top.x, top.y + 6);
    h.up();                                         // 同一时刻抬起：时间与位移都很小
    assert.equal(world.grab, null);
    assert.ok(speedSum(world) > 30, `戳之后各点有了速度（实测约 42，这里 ${speedSum(world)}）`);
    assert.ok(top.y - top.py > 5, `顶部被戳：速度朝下（实测约 10.5，这里 ${top.y - top.py}）`);
    assert.equal(world.asleep, false);
    h.run(10);
    assert.equal(world.asleep, true, '晃一阵之后又睡着');

    const { x, y } = h.center();
    h.down(x, y);
    h.move(x + 120, y - 60);
    const before = speedSum(world);
    h.up();
    assert.ok(Math.abs(speedSum(world) - before) < 1e-9, '拖过之后松手不会额外戳一下');
});

test('指针坐标按画布实际显示尺寸换算（画布被样式缩放时仍然点得准）', () => {
    const h = settled();
    const { x, y } = h.center();
    h.canvasRect = { left: 100, top: 50, width: 1280, height: 800 };     // 显示成 2 倍大，并偏移
    h.down(100 + x * 2, 50 + y * 2);
    assert.ok(h.handle.world.grab, '换算后点在果冻中心');
    h.move(100 + 2 * (x + 30), 50 + 2 * (y - 20));
    assert.ok(Math.abs(h.handle.world.pointer.x - (x + 30)) < 1e-9);
    assert.ok(Math.abs(h.handle.world.pointer.y - (y - 20)) < 1e-9);
    h.up();
    h.canvasRect = { left: 100, top: 50, width: 1280, height: 800 };
    h.down(x, y);
    assert.equal(h.handle.world.grab, null, '不换算会点偏');
});

// ---------- 键盘与按钮 ----------

test('键盘：画布上空格、回车（或 code=Space）戳一下并阻止页面滚动；其他按键不处理', () => {
    for (const init of [{ key: ' ' }, { key: 'Enter' }, { key: 'Spacebar', code: 'Space' }]) {
        const h = settled();
        const world = h.handle.world;
        const event = h.canvas.dispatch('keydown', init);
        assert.equal(event.defaultPrevented, true, JSON.stringify(init));
        const top = world.points[0];
        assert.ok(top.y - top.py > 5, `${JSON.stringify(init)}：戳在顶部，顶点速度朝下（实测约 11.7；若戳在底部只有约 0.04）：${top.y - top.py}`);
        assert.equal(world.asleep, false);
        assert.equal(h.rafs.pending, 1, '睡着的果冻被戳醒后开始逐帧');
        assert.ok(h.el('.jelly-game').classList.contains('is-quiet'));
    }
    const h = settled();
    for (const key of ['a', 'Tab', 'Escape', 'ArrowUp', 'Shift']) {
        const event = h.canvas.dispatch('keydown', { key });
        assert.equal(event.defaultPrevented, false, key);
    }
    assert.equal(h.handle.world.asleep, true, '其他按键没有戳到它');
    assert.equal(h.rafs.pending, 0);
});

test('按钮：“戳一下”同键盘；“重新掉落”把果冻重新放到高处，并清掉抓取状态', () => {
    const h = settled();
    h.el('[data-jelly-poke]').dispatch('click');
    assert.equal(h.handle.world.asleep, false);
    assert.ok(speedSum(h.handle.world) > 5);
    h.run(10);

    const { x, y } = h.center();
    h.down(x, y);
    assert.ok(h.handle.world.grab);
    h.el('[data-jelly-drop]').dispatch('click');
    const world = h.handle.world;
    assert.equal(world.grab, null);
    assert.equal(h.canvas.classList.contains('is-grabbing'), false);
    assert.equal(h.canvas.captured, null);
    assert.equal(Core.metrics(world).airborne, true, '回到高处');
    assert.equal(world.asleep, false);
    assert.equal(h.rafs.pending, 1);
    const stale = h.center();
    h.down(stale.x, stale.y);                       // 重置后可以立刻重新抓
    assert.ok(world.grab);
    h.up();
    h.run(15);
    assert.equal(world.asleep, true, '掉下来、晃一阵、再睡着');
    assert.ok(Math.abs(Core.metrics(world).maxY - world.floor) < 3, '最终坐在地上');
});

test('“重新掉落”即使在减少动态效果下也照做（是用户明确的操作）', () => {
    const h = settled();
    h.handle.drop();
    assert.equal(Core.metrics(h.handle.world).airborne, true);
});

// ---------- 颜色与本机数据 ----------

test('换颜色：按钮状态、存储、后续绘制都用新颜色；睡着时补画一帧', () => {
    const h = settled();
    const mint = Game.paletteById('mint');
    const strawberry = Game.paletteById('strawberry');
    const stopsOf = color => `rgba(${color.light.join(',')},0.970)`;
    assert.ok(h.ctx._stops.includes(stopsOf(strawberry)), '夹具：之前画的是草莓');
    assert.ok(!h.ctx._stops.includes(stopsOf(mint)));

    h.all('[data-jelly-color]')[2].dispatch('click');
    assert.equal(h.handle.colorId, 'mint');
    assert.deepEqual(h.all('[data-jelly-color]').map(s => s.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false', 'false', 'false']);
    assert.equal(h.storage.map.get('jellyColor'), 'mint');
    assert.equal(h.rafs.pending, 1);
    h.rafs.flush(h.clock.t += 16);
    assert.ok(h.ctx._stops.includes(stopsOf(mint)), '新颜色画出来了');
    assert.equal(h.rafs.pending, 0);
});

test('未知颜色编号回到默认并只存合法值；存储里的颜色在挂载时恢复，非法值被忽略', () => {
    const h = settled();
    h.handle.setColor('blueberry');
    assert.equal(h.handle.colorId, Game.DEFAULT_COLOR);
    assert.equal(h.storage.map.get('jellyColor'), Game.DEFAULT_COLOR, '不会把乱写的编号存进去');

    const restored = harness({ stored: { jellyColor: 'grape' } });
    restored.mount();
    assert.equal(restored.handle.colorId, 'grape');
    assert.equal(restored.all('[data-jelly-color]')[3].getAttribute('aria-pressed'), 'true');
    for (const bad of ['blueberry', '', '<script>', '__proto__']) {
        const other = harness({ stored: { jellyColor: bad } });
        other.mount();
        assert.equal(other.handle.colorId, Game.DEFAULT_COLOR, JSON.stringify(bad));
    }
});

test('存储读写抛错（隐私模式/配额）：照常工作，只是不记住', () => {
    const h = harness({ storage: fakeStorage({}, { failRead: true, failWrite: true }) });
    h.mount();
    h.run(0.5);
    h.handle.setColor('lemon');
    h.el('[data-jelly-offer]').dispatch('click');
    assert.equal(h.handle.colorId, 'lemon');
    assert.equal(h.el('[data-jelly-offer]').textContent, '番茄钟结束时提醒我歇一会儿：开', '写不进去，读回仍是默认');
    h.clock.t += 5000;
    assert.doesNotThrow(() => h.game.unmount());
    assert.equal(h.game.statText(), '—');
    assert.equal(h.game.restOfferEnabled(), true);
    assert.equal(h.game.setRestOfferEnabled(false), false, '写失败如实返回 false');
});

test('番茄钟提醒开关：默认开；点击后写入并更新文字与状态；再点恢复；对外接口同步', () => {
    const h = harness();
    h.mount();
    assert.equal(h.game.restOfferEnabled(), true);
    const toggle = h.el('[data-jelly-offer]');
    toggle.dispatch('click');
    assert.equal(h.storage.map.get('jellyRestOffer'), 'off');
    assert.equal(toggle.textContent, '番茄钟结束时提醒我歇一会儿：关');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(h.game.restOfferEnabled(), false);
    toggle.dispatch('click');
    assert.equal(h.storage.map.get('jellyRestOffer'), 'on');
    assert.equal(toggle.textContent, '番茄钟结束时提醒我歇一会儿：开');
    assert.equal(h.game.restOfferEnabled(), true);
    assert.equal(h.game.setRestOfferEnabled(false), true);
    assert.equal(h.game.restOfferEnabled(), false);
    for (const odd of ['', 'OFF', 'no', '0']) {
        h.storage.map.set('jellyRestOffer', odd);
        assert.equal(h.game.restOfferEnabled(), true, `只有明确的 "off" 才算关闭：${JSON.stringify(odd)}`);
    }
});

// ---------- 累计时长 ----------

test('累计时长：卸载时把打开期间的秒数计入；下次打开显示在页脚；statText 给大厅卡片用', () => {
    const h = harness();
    assert.equal(h.game.statText(), '—');
    h.mount();
    h.clock.t += 90 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), '90');
    assert.equal(h.game.statText(), '1 分钟');
    h.mount();
    assert.equal(h.el('.jelly-total').textContent, '累计放松 1 分钟');
    h.clock.t += 3600 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), String(90 + 1800), '一段最多计 30 分钟：忘了关也不会无限增长');
    assert.equal(h.game.statText(), '31 分钟', '1890 秒 = 31.5 分钟，向下取整');
});

test('累计时长：页面不可见的时间不算，回到可见重新计', () => {
    const h = harness();
    h.mount();
    h.clock.t += 40 * 1000;
    h.doc.hidden = true; h.doc.dispatch('visibilitychange');
    assert.equal(h.storage.map.get('jellyPlaySeconds'), '40', '隐藏时先结算');
    h.clock.t += 100 * 1000;                         // 不可见的 100 秒
    h.doc.hidden = false; h.doc.dispatch('visibilitychange');
    h.clock.t += 20 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), '60');
});

test('累计时长：页面本来就可见时又收到 visibilitychange，不会把已经过去的时间丢掉', () => {
    const h = harness();
    h.mount();
    h.clock.t += 30 * 1000;
    h.doc.dispatch('visibilitychange');              // 例如浏览器重复派发：状态没变
    h.clock.t += 30 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), '60');
});

test('累计时长：不足一秒不计；存储里的脏数据（负数、NaN、过大）被约束', () => {
    const h = harness();
    h.mount();
    h.clock.t += 400;
    h.game.unmount();
    assert.equal(h.storage.map.has('jellyPlaySeconds'), false);
    for (const [stored, expected] of [['-5', '—'], ['abc', '—'], ['NaN', '—'], ['Infinity', '—'], ['-Infinity', '—'], ['', '—'], ['0', '—'], ['59.9', '59 秒'], ['1e12', `${Math.floor(10000)} 小时`]]) {
        h.storage.map.set('jellyPlaySeconds', stored);
        assert.equal(h.game.statText(), expected, JSON.stringify(stored));
    }
    h.storage.map.set('jellyPlaySeconds', '-5');
    h.mount();
    h.clock.t += 90 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), '90', '负数的脏数据当作 0，不会把新的时长抵掉');

    const back = harness();
    back.mount();
    back.clock.t -= 5000;                          // 系统时间被回拨：这一段按 0 计，不是 −5
    back.doc.hidden = true; back.doc.dispatch('visibilitychange');
    back.doc.hidden = false; back.doc.dispatch('visibilitychange');
    back.clock.t += 20 * 1000;
    back.game.unmount();
    assert.equal(back.storage.map.get('jellyPlaySeconds'), '20', '回拨的时间不会抵掉之后的 20 秒');

    h.storage.map.set('jellyPlaySeconds', String(10000 * 3600 - 5));
    h.mount();
    h.clock.t += 60 * 1000;
    h.game.unmount();
    assert.equal(h.storage.map.get('jellyPlaySeconds'), String(10000 * 3600), '总量有上限');
});

// ---------- 休息模式 ----------

test('休息模式：显示倒计时与进度；到点后换成完成提示、显示“回去继续”、停掉定时器并通知读屏；点按钮回调一次', () => {
    const h = harness();
    let done = 0;
    h.mount({ rest: 60, onDone: () => { done++; } });
    const text = h.el('.jelly-rest-text');
    const fill = h.el('.jelly-rest-fill');
    const button = h.el('[data-jelly-done]');
    assert.equal(h.el('.jelly-rest').getAttribute('role'), 'timer');
    assert.equal(text.textContent, '歇一会儿 · 1:00');
    assert.equal(fill.style.width, '0.0%');
    assert.equal(button.getAttribute('hidden'), '', '完成前按钮是隐藏的');
    assert.equal(h.timers.active, 1);
    assert.deepEqual(h.timers.intervals, [250], '每 250 毫秒刷新一次（按墙钟算剩余，不累计误差）');

    h.clock.t += 30 * 1000; h.timers.tick();
    assert.equal(text.textContent, '歇一会儿 · 0:30');
    assert.equal(fill.style.width, '50.0%');
    h.clock.t += 29 * 1000 + 500; h.timers.tick();
    assert.equal(text.textContent, '歇一会儿 · 0:01', '向上取整：不会提前显示 0:00');
    assert.equal(button.getAttribute('hidden'), '');
    assert.equal(done, 0);

    h.clock.t += 600; h.timers.tick();
    assert.equal(text.textContent, '歇好了，回去继续吧');
    assert.equal(fill.style.width, '100.0%');
    assert.equal(button.getAttribute('hidden'), null, '按钮显示出来');
    assert.equal(h.el('[role="status"]').textContent, '休息时间到，回去继续吧');
    assert.equal(h.timers.active, 0, '到点后不再有定时器');
    h.timers.tick();
    assert.equal(done, 0, '到点本身不会替用户关闭界面');

    button.dispatch('click');
    assert.equal(done, 1);
    assert.equal(h.game.isMounted(), true, '关闭由调用方决定');
});

test('休息模式：果冻照常可玩；卸载时清掉定时器；没传 onDone 点按钮也不出错', () => {
    const h = harness();
    h.mount({ rest: 5 });
    h.run(1);
    assert.ok(h.draws() > 0);
    assert.equal(h.timers.active, 1);
    h.clock.t += 6000; h.timers.tick();
    assert.doesNotThrow(() => h.el('[data-jelly-done]').dispatch('click'));
    const other = harness();
    other.mount({ rest: 60 });
    assert.equal(other.timers.active, 1);
    other.game.unmount();
    assert.equal(other.timers.active, 0);
});

test('休息秒数的取值：非数字、零、负数视为不是休息模式；超过上限取 600；小数向下取整', () => {
    for (const rest of [undefined, null, 0, -5, NaN, 'abc', Infinity, 0.9]) {
        const h = harness();
        h.mount({ rest });
        assert.equal(h.el('.jelly-rest'), null, `rest=${rest}`);
        assert.equal(h.timers.active, 0, `rest=${rest}`);
    }
    const big = harness();
    big.mount({ rest: 99999 });
    assert.equal(big.el('.jelly-rest-text').textContent, '歇一会儿 · 10:00');
    const fraction = harness();
    fraction.mount({ rest: 59.9 });
    assert.equal(fraction.el('.jelly-rest-text').textContent, '歇一会儿 · 0:59');
    const text = harness();
    text.mount({ rest: '45' });
    assert.equal(text.el('.jelly-rest-text').textContent, '歇一会儿 · 0:45', '数字字符串也接受');
});

// ---------- 卸载与重复挂载 ----------

test('卸载：取消排队的帧、断开观察、移除全部监听、清掉定时器、清空容器；可重复调用', () => {
    const h = harness();
    h.mount({ rest: 60 });
    h.run(0.2);
    assert.equal(h.rafs.pending, 1);
    const canvas = h.canvas;
    const others = [h.el('[data-jelly-poke]'), h.el('[data-jelly-drop]'), h.el('[data-jelly-offer]'), h.el('[data-jelly-done]'), ...h.all('[data-jelly-color]')];
    assert.equal(canvas.listenerCount(), 7, '按下、移动、抬起、取消、丢失捕获、离开、按键');
    assert.ok(others.every(node => node.listenerCount() === 1));
    assert.equal(h.doc.listenerCount('visibilitychange'), 1);
    assert.equal(h.timers.active, 1);

    h.game.unmount();
    assert.equal(h.rafs.pending, 0, '排队的帧被取消');
    assert.equal(h.ro.instances[0].disconnected, true);
    assert.equal(canvas.listenerCount(), 0, '画布上的监听全部移除');
    assert.ok(others.every(node => node.listenerCount() === 0), '按钮上的监听全部移除');
    assert.equal(h.doc.listenerCount('visibilitychange'), 0);
    assert.equal(h.timers.active, 0);
    assert.equal(h.root.children.length, 0, '容器被清空');
    assert.equal(h.game.isMounted(), false);
    assert.doesNotThrow(() => h.game.unmount());
    assert.doesNotThrow(() => h.ro.instances[0].trigger());
});

test('卸载之后迟到的帧、迟到的观察回调什么也不做', () => {
    const calls = [];
    const spyCore = { ...Core, step(...args) { calls.push('step'); return Core.step(...args); }, resize(...args) { calls.push('resize'); return Core.resize(...args); } };
    const h = harness({ rafNoCancel: true, core: spyCore });
    h.mount();
    h.run(0.1);
    const stepsBefore = calls.length;
    const drawn = h.draws();
    h.game.unmount();
    assert.equal(h.rafs.pending, 1, '夹具：取消没生效，帧还排着');
    h.stage.width = 900;
    h.ro.instances[0].trigger();
    h.rafs.flush(h.clock.t += 16);
    assert.equal(h.draws(), drawn, '没有再画');
    assert.equal(calls.length, stepsBefore, '没有再推物理或缩放');
    assert.equal(h.rafs.pending, 0, '也没有再排帧');
});

test('卸载之后再调用句柄方法：不报错、不排帧', () => {
    const h = settled();
    const handle = h.handle;
    h.game.unmount();
    assert.doesNotThrow(() => { handle.poke(); handle.drop(); handle.setColor('mint'); });
    assert.equal(h.rafs.pending, 0);
    assert.equal(handle.running, false);
});

test('重复挂载：先卸载上一个（上一个的监听全部移除），只留一份', () => {
    const h = harness();
    h.mount();
    const first = h.canvas;
    h.mount();
    assert.notEqual(h.canvas, first);
    assert.equal(first.listenerCount(), 0);
    assert.equal(h.doc.listenerCount('visibilitychange'), 1);
    assert.equal(h.ro.instances.length, 2);
    assert.equal(h.ro.instances[0].disconnected, true);
    assert.equal(h.root.children.length, 1);
    assert.equal(h.all('.jelly-canvas').length, 1);
});

test('缺少依赖：没有核心、没有文档、没有容器时 mount 返回 null，什么也不创建', () => {
    const noCore = harness({ core: null });
    assert.equal(noCore.mount(), null);
    assert.equal(noCore.root.children.length, 0);
    assert.equal(noCore.game.isMounted(), false);
    const noDoc = Game.create({ document: null, window: null });
    assert.equal(noDoc.mount(new FakeElement('div', {})), null);
    const h = harness();
    assert.equal(h.game.mount(null), null);
    assert.equal(h.game.isMounted(), false);
});

// ---------- 故障自停 ----------

test('绘制抛错：不向外抛、记一条警告、标记失败并告知读屏，之后不再排帧也不再响应输入', () => {
    const h = harness({ throwOn: 'bezierCurveTo' });
    h.mount();
    assert.doesNotThrow(() => h.rafs.flush(h.clock.t += 16));
    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0], /果冻绘制失败：画布故障/);
    assert.equal(h.el('.jelly-stage').getAttribute('data-jelly-failed'), 'true');
    assert.equal(h.el('[role="status"]').textContent, '果冻暂时无法绘制');
    assert.equal(h.rafs.pending, 0);
    const { x, y } = h.center();
    assert.doesNotThrow(() => h.down(x, y));
    assert.doesNotThrow(() => h.handle.poke());
    assert.doesNotThrow(() => h.handle.setColor('mint'));
    assert.equal(h.rafs.pending, 0, '失败后不会再排帧');
    assert.equal(h.warnings.length, 1);
    assert.doesNotThrow(() => h.game.unmount());
});

test('数值异常：重置整只果冻继续玩（记一条警告）；重置后仍然异常才算失败', () => {
    let corrupted = false;
    const once = { ...Core, step(world, dt) { const steps = Core.step(world, dt); if (!corrupted) { corrupted = true; world.cx = NaN; } return steps; } };
    const h = harness({ core: once });
    h.mount();
    h.rafs.flush(h.clock.t += 16);
    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0], /数值异常/);
    assert.ok(Number.isFinite(h.handle.world.cx), '已重置');
    assert.equal(h.rafs.pending, 1, '继续逐帧');
    assert.equal(h.el('.jelly-stage').getAttribute('data-jelly-failed'), null);
    h.run(2);
    assert.equal(h.warnings.length, 1, '没有再出问题');

    const always = { ...Core, metrics(world) { return { ...Core.metrics(world), cx: NaN }; } };
    const bad = harness({ core: always });
    bad.mount();
    assert.doesNotThrow(() => bad.rafs.flush(bad.clock.t += 16));
    assert.equal(bad.el('.jelly-stage').getAttribute('data-jelly-failed'), 'true');
    assert.equal(bad.rafs.pending, 0);
    assert.ok(bad.warnings.some(message => /数值异常/.test(message)));
    assert.ok(bad.warnings.some(message => /重置后数值仍然异常/.test(message)));
});

test('数值异常：六个读数里任何一个不是有限数都会触发重置（不是只检查质心）', () => {
    for (const field of ['cx', 'cy', 'areaRatio', 'width', 'height', 'rotation']) {
        for (const bad of [NaN, Infinity]) {
            let corrupted = false;
            const core = {
                ...Core,
                metrics(world) {
                    const m = Core.metrics(world);
                    if (corrupted) return m;
                    corrupted = true;
                    return { ...m, [field]: bad };
                },
            };
            const h = harness({ core });
            h.mount();
            h.rafs.flush(h.clock.t += 16);
            assert.equal(h.warnings.length, 1, `${field}=${bad}`);
            assert.match(h.warnings[0], /数值异常/, `${field}=${bad}`);
            assert.equal(h.el('.jelly-stage').getAttribute('data-jelly-failed'), null, `${field}=${bad}：重置后继续玩`);
            assert.equal(h.rafs.pending, 1, `${field}=${bad}`);
        }
    }
});

test('数值异常时一并放开抓取：不会留下“正在抓取”的样式或捕获', () => {
    let corrupt = false;
    const spy = { ...Core, step(world, dt) { const steps = Core.step(world, dt); if (corrupt) { corrupt = false; world.cx = NaN; } return steps; } };
    const h = settled({ core: spy });
    const { x, y } = h.center();
    h.down(x, y);
    assert.equal(h.canvas.classList.contains('is-grabbing'), true);
    corrupt = true;
    h.rafs.flush(h.clock.t += 16);
    assert.equal(h.warnings.length, 1);
    assert.equal(h.canvas.classList.contains('is-grabbing'), false);
    assert.equal(h.canvas.captured, null);
    assert.equal(h.handle.world.grab, null);
    h.down(x, y);
    assert.equal(h.canvas.classList.contains('is-grabbing'), true, '之后还能重新抓');
});

test('画布没有 2D 上下文：给出说明、不排帧，输入与卸载不出错', () => {
    const h = harness({ noContext: true });
    h.mount();
    assert.equal(h.el('.jelly-stage').getAttribute('data-jelly-failed'), 'true');
    assert.match(h.el('[role="status"]').textContent, /无法显示/);
    assert.equal(h.rafs.pending, 0);
    assert.doesNotThrow(() => h.canvas.dispatch('keydown', { key: ' ' }));
    assert.doesNotThrow(() => h.handle.drop());
    assert.doesNotThrow(() => h.game.unmount());
});

// ---------- 绘制契约 ----------

/** 让 metrics 里的若干字段由测试强制指定，精确驱动表情与脸的朝向；freeze 为真时物理不推进（质心固定，世界始终醒着）。 */
function forcedCore(forced, { freeze = false } = {}) {
    return {
        ...Core,
        step: freeze ? () => 0 : Core.step,
        metrics(world) { return { ...Core.metrics(world), ...forced }; },
    };
}

/** 清空绘制记录，再推进一帧（60fps 的间隔）。 */
function frameOnce(h) {
    h.ctx._calls.length = 0;
    h.ctx._log.length = 0;
    h.clock.t += 1000 / 60;
    h.rafs.flush(h.clock.t);
}

/** 取出最近一帧里脸的各个部件（最后一次 translate 之后就是脸）。 */
function faceParts(h) {
    const log = h.ctx._log;
    const face = log.slice(log.map(([name]) => name).lastIndexOf('translate'));
    const find = name => face.find(([n]) => n === name)[1];
    return {
        ellipses: face.filter(([name]) => name === 'ellipse').map(([, args]) => args),
        arcs: face.filter(([name]) => name === 'arc').map(([, args]) => args),
        rotate: find('rotate')[0],
        scale: find('scale'),
    };
}

test('绘制：每帧先清屏、画地面、阴影、身体（封闭曲线 + 裁剪内部光泽 + 描边）、再画脸；状态成对保存/恢复', () => {
    const h = settled();
    h.handle.setColor('peach');
    frameOnce(h);
    const calls = h.ctx._calls;
    assert.equal(calls[0], 'clearRect', '先清屏');
    assert.deepEqual(h.ctx._log[0][1], [0, 0, 640, 400], '清的是整个世界');
    const index = name => calls.indexOf(name);
    assert.ok(index('fillRect') > index('clearRect'), '地面');
    assert.equal(calls.filter(name => name === 'bezierCurveTo').length, 3 * P.POINTS, '身体轮廓画三遍：填充、裁剪、描边，每遍每个点一段曲线');
    assert.equal(calls.filter(name => name === 'clip').length, 1, '内部光泽只裁剪一次');

    let depth = 0;
    let clipAt = -1;
    let clipDepth = 0;
    let outlineAt = -1;
    let outlineDepth = null;
    calls.forEach((name, i) => {
        if (name === 'save') depth++;
        else if (name === 'restore') depth--;
        else if (name === 'clip') { clipAt = i; clipDepth = depth; }
        else if (name === 'stroke' && clipAt >= 0 && outlineAt < 0) { outlineAt = i; outlineDepth = depth; }
    });
    assert.equal(depth, 0, '状态保存/恢复成对');
    assert.ok(clipDepth >= 1, '裁剪发生在保存的状态里');
    assert.ok(outlineDepth !== null && outlineDepth < clipDepth, '身体描边已退出裁剪状态，边缘不会被裁掉');
    assert.ok(calls.lastIndexOf('translate') > outlineAt, '脸最后画，盖在身体上');
    assert.ok(h.ctx._stops.includes('rgba(255,208,180,0.970)'), '身体用当前颜色（蜜桃）的亮色起头');
});

test('表情：平静 = 椭圆眼睛 + 小弧线嘴；惊讶 = 眼睛放大 + 圆嘴；开心 = 闭眼弧线 + 大弧线嘴；腮红始终有', () => {
    const forced = { airborne: false, folded: false, grabbed: false, asleep: false };
    const h = harness({ core: forcedCore(forced) });
    h.mount();
    const r = h.handle.world.radius;
    const layout = Game.faceLayout(Core.metrics(h.handle.world), r, 0);
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const isCheek = e => near(e[2], r * 0.09) && near(e[3], r * 0.055);
    const isEye = (e, big) => near(e[2], layout.eyeRx * big) && near(e[3], layout.eyeRy * big);

    frameOnce(h);                                               // 平静
    let parts = faceParts(h);
    assert.equal(parts.ellipses.length, 4);
    assert.equal(parts.ellipses.filter(isCheek).length, 2, '两片腮红');
    assert.equal(parts.ellipses.filter(e => isEye(e, 1)).length, 2, '两只眼睛');
    assert.deepEqual(parts.ellipses.filter(e => isEye(e, 1)).map(e => e[0]).sort((a, b) => a - b), [-layout.eyeDx, layout.eyeDx], '左右对称，没有指针时不偏');
    const calmMouth = parts.arcs.filter(a => near(a[3], Math.PI * 0.18));
    assert.equal(calmMouth.length, 1);
    assert.ok(near(calmMouth[0][2], layout.mouthW * 0.55 * 0.8) && near(calmMouth[0][4], Math.PI * 0.82), '小弧线嘴');
    assert.equal(parts.arcs.filter(a => near(a[2], layout.eyeRx * 0.3)).length, 2, '每只眼睛一个高光点');

    forced.airborne = true;                                    // 惊讶
    frameOnce(h);
    parts = faceParts(h);
    assert.equal(parts.ellipses.length, 5);
    assert.equal(parts.ellipses.filter(isCheek).length, 2);
    assert.equal(parts.ellipses.filter(e => isEye(e, 1.18)).length, 2, '眼睛放大到 1.18 倍');
    const mouth = parts.ellipses.filter(e => near(e[2], r * 0.05) && near(e[3], r * 0.07));
    assert.equal(mouth.length, 1, '圆嘴');
    assert.equal(parts.arcs.filter(a => near(a[3], Math.PI * 0.18)).length, 0, '没有弧线嘴');

    Object.assign(forced, { airborne: false, asleep: true });  // 开心
    frameOnce(h);
    parts = faceParts(h);
    assert.equal(parts.ellipses.length, 2, '只剩腮红，没有椭圆眼睛');
    assert.equal(parts.ellipses.filter(isCheek).length, 2);
    const closedEyes = parts.arcs.filter(a => near(a[3], Math.PI * 1.1) && near(a[4], Math.PI * 1.9));
    assert.equal(closedEyes.length, 2, '两条闭眼弧线');
    assert.ok(closedEyes.every(a => near(a[2], layout.eyeRx * 1.2)));
    const happyMouth = parts.arcs.filter(a => near(a[3], Math.PI * 0.18));
    assert.equal(happyMouth.length, 1);
    assert.ok(near(happyMouth[0][2], layout.mouthW * 0.55 * 1.25), '笑得更开');
});

test('眼睛看向指针：在右边就一起往右偏、在左边往左偏、上下同理；指针离开后回正', () => {
    const forced = { airborne: false, folded: false, grabbed: false, asleep: false };
    const h = harness({ core: forcedCore(forced, { freeze: true }) });      // 物理冻结：质心固定，指针相对质心的方向才是确定的
    h.mount();
    const r = h.handle.world.radius;
    const layout = Game.faceLayout(Core.metrics(h.handle.world), r, 0);
    const eyes = () => faceParts(h).ellipses.filter(e => Math.abs(e[2] - layout.eyeRx) < 1e-9);
    const meanX = () => eyes().reduce((sum, e) => sum + e[0], 0) / 2;
    const meanY = () => eyes().reduce((sum, e) => sum + e[1], 0) / 2;
    const { cx, cy } = Core.metrics(h.handle.world);

    frameOnce(h);
    assert.ok(Math.abs(meanX()) < 1e-9 && Math.abs(meanY() - layout.eyeY) < 1e-9, '没有指针：正视前方');

    h.move(cx + 250, cy);
    frameOnce(h);
    const right = meanX();
    assert.ok(right > 1 && right <= layout.lookRange / 0.7 + 1e-9, `向右偏 ${right}（上限 ${layout.lookRange / 0.7}）`);
    assert.ok(Math.abs(meanY() - layout.eyeY) < 1e-6, '水平方向的指针不会让眼睛上下偏');

    h.move(cx - 250, cy);
    frameOnce(h);
    assert.ok(Math.abs(meanX() + right) < 0.05, '左右对称');

    h.move(cx, cy + 300);
    frameOnce(h);
    assert.ok(meanY() - layout.eyeY > 1 && Math.abs(meanX()) < 1e-6, '指针在下方：向下看');
    h.move(cx, cy - 300);
    frameOnce(h);
    assert.ok(layout.eyeY - meanY() > 1, '指针在上方：向上看');

    h.move(cx + 250, cy);
    h.canvas.dispatch('pointerleave');
    frameOnce(h);
    assert.ok(Math.abs(meanX()) < 1e-9 && Math.abs(meanY() - layout.eyeY) < 1e-9, '指针离开：回正');
});

test('脸的朝向：被抓着或在空中时以较快的节奏跟着身体转；落地后以较慢的节奏回正（逐帧与 easeAngle 一致）', () => {
    const forced = { rotation: 0.8, grabbed: true, airborne: false };     // airborne 也要强制：下落中的真实读数是“在空中”，会让脸一直跟着转
    const h = harness({ core: forcedCore(forced, { freeze: true }) });
    h.mount();
    const dt = 1000 / 60;
    const angleNow = () => faceParts(h).rotate;
    let expected = 0;
    for (let i = 0; i < 6; i++) {
        frameOnce(h);
        expected = Game.easeAngle(expected, 0.8, dt, 90);
        assert.ok(Math.abs(angleNow() - expected) < 1e-9, `跟随第 ${i + 1} 帧：${angleNow()} vs ${expected}`);
    }
    assert.ok(expected > 0.3 && expected < 0.8, '正在靠近目标');

    forced.grabbed = false;                                     // 松手且不在空中：回正，节奏更慢
    for (let i = 0; i < 6; i++) {
        frameOnce(h);
        expected = Game.easeAngle(expected, 0, dt, 220);
        assert.ok(Math.abs(angleNow() - expected) < 1e-9, `回正第 ${i + 1} 帧`);
    }
    forced.airborne = true;                                     // 在空中同样跟着转
    frameOnce(h);
    expected = Game.easeAngle(expected, 0.8, dt, 90);
    assert.ok(Math.abs(angleNow() - expected) < 1e-9, '空中也跟着转');
});

test('睡着时脸直接到位（逐帧循环马上就停，不能让脸停在半路上）', () => {
    const forced = {};
    const h = settled({ core: forcedCore(forced) });
    assert.equal(h.rafs.pending, 0);
    Object.assign(forced, { rotation: 0.8, grabbed: true });
    h.handle.setColor('mint');
    frameOnce(h);
    assert.equal(faceParts(h).rotate, 0.8);
    forced.grabbed = false;
    h.handle.setColor('grape');
    frameOnce(h);
    assert.equal(faceParts(h).rotate, 0);
    assert.equal(h.rafs.pending, 0);
});
