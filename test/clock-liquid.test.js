const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/clock-liquid-core.js');
const Liquid = require('../js/clock-liquid.js');

function makeEnv(options = {}) {
    const log = { fillText: [], put: 0, ops: [], canvases: [], removed: [], observers: [], listeners: {}, winListeners: {}, appended: [] };
    const frames = new Map();
    const timers = new Map();
    let frameId = 0, timerId = 0, clock = 1000;
    const bodyClasses = new Set(options.bodyClasses || []);

    // options.srcRect(w, h) → { x0, y0, x1, y1 }（设备像素，含端点）：源画布里“有字”的矩形；缺省时源画布全透明。
    // 控制器按它算文字包围盒，所以文字层只上传这块附近。可在运行中替换 f.setSrcRect，模拟文字重画后变了位置。
    let srcRect = options.srcRect || null;
    const ctx2d = {
        fillText(ch, x, y) { log.fillText.push({ ch, x, y, align: ctx2d.textAlign, alpha: ctx2d.globalAlpha, font: ctx2d.font }); },
        clearRect(...args) { log.clear = (log.clear || 0) + 1; log.ops.push({ op: 'clearRect', args }); }, measureText: () => ({ fontBoundingBoxAscent: 80 }),
        getImageData: (x, y, w, h) => {
            log.read = (log.read || 0) + 1;
            const data = new Uint8ClampedArray(w * h * 4);
            const rect = typeof srcRect === 'function' ? srcRect(w, h) : srcRect;
            if (rect) {
                for (let py = rect.y0; py <= rect.y1; py++) for (let px = rect.x0; px <= rect.x1; px++) { const o = (py * w + px) * 4; data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255; }
            }
            return { data, width: w, height: h };
        },
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData(image, dx, dy, ...dirty) { log.put++; log.ops.push({ op: 'putImageData', width: image.width, height: image.height, dx, dy, dirty }); },
        drawImage(source, ...args) { log.ops.push({ op: 'drawImage', source, args }); },
        globalAlpha: 1,
        letterSpacing: '0px',
    };
    const makeCanvas = () => {
        const classes = new Set();
        const canvas = {
            className: '', width: 0, height: 0, style: {}, classes,
            classList: { add: name => classes.add(name), contains: name => classes.has(name) },
            setAttribute() {},
            getContext: (kind, attrs) => { log.contextArgs = (log.contextArgs || []).concat([[kind, attrs]]); return options.noContext ? null : ctx2d; },
            remove() { log.removed.push(canvas); },
        };
        log.canvases.push(canvas);
        return canvas;
    };

    // 每一行文字一个替身元素；geom 决定 Range 量出来的矩形（hidden 等价于 display:none，宽度为 0）。
    const elements = {};
    const mainContent = {};      // 时钟容器外面那层页面（真实页面里是 main.main-content，容器两侧的空白处命中的就是它）
    const wrapper = { parentElement: mainContent, contains: node => Object.values(elements).includes(node) || node === wrapper };
    function makeElement(id, text, geom) {
        const classes = new Set();
        const textNode = { nodeType: 3, nodeValue: text };
        const element = {
            id, firstChild: textNode, geom, classes,
            classList: {
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name),
            },
            closest: () => wrapper,
        };
        textNode.owner = element;
        elements[id] = element;
        return element;
    }
    const element = makeElement('time', '12:34:56', { left: 100, top: 60, charW: options.timeCharW || 40, h: 100 });
    if (options.group) {
        makeElement('date', '2026年1月31日 星期六', { left: 130, top: 175, charW: 20, h: 36 });
        makeElement('lunar', '农历丙午年九月初五', { left: 150, top: 215, charW: 18, h: 28 });
        makeElement('holiday', '重阳节', { left: 200, top: 250, charW: 16, h: 24, hidden: !!options.hiddenHoliday });
    }
    const textNode = element.firstChild;
    const elClasses = element.classes;
    const range = {
        el: null, node: null, mode: 'all', index: 0,
        selectNodeContents(el) { this.el = el; this.mode = 'all'; },
        setStart(node, index) { this.node = node; this.mode = 'char'; this.index = index; },
        setEnd() {},
        getBoundingClientRect() {
            let rect;
            if (this.mode === 'all') {
                const g = this.el.geom;
                rect = g.hidden
                    ? { left: 0, top: 0, width: 0, height: 0 }
                    : { left: g.left, top: g.top, width: String(this.el.firstChild.nodeValue).length * g.charW, height: g.h };
            } else {
                const g = this.node.owner.geom;
                rect = { left: g.left + this.index * g.charW, top: g.top, width: g.charW - 4, height: g.h };
            }
            return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };   // 与真实 DOMRect 一致
        },
    };
    const doc = {
        hidden: !!options.hidden,
        documentElement: { clientWidth: options.clientWidth ?? 1440 },     // 视口宽度（不含滚动条）
        body: {
            classList: { contains: name => bodyClasses.has(name) },
            appendChild(node) { log.appended.push(node); log.ops.push({ op: 'appendChild', node }); },
        },
        getElementById: id => elements[id] || null,
        createElement: () => makeCanvas(),
        createRange: () => range,
        addEventListener(name, fn, opts) { log.listeners[name] = { fn, opts }; },
    };
    const win = {
        devicePixelRatio: options.dpr || 1,
        innerWidth: options.innerWidth ?? 1440,
        backgroundExperience: options.experience,
        matchMedia: () => ({ matches: !!options.reduceMotion }),
        navigator: { connection: { saveData: !!options.saveData } },
        getComputedStyle: node => ({
            fontSize: '88px', fontStyle: 'normal', fontWeight: '700', fontFamily: 'sans-serif', letterSpacing: '-2px',
            color: 'rgb(255, 255, 255)', textShadow: 'rgba(0, 0, 0, 0.2) 2px 2px 20px 0px',
            ...(options.styleFor ? options.styleFor(node) : {}),
        }),
        addEventListener(name, fn) { log.winListeners[name] = fn; },
    };
    class FakeObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; this.observed = []; log.observers.push(this); }
        observe(node) { this.observed.push(node); }
        disconnect() { this.disconnected = true; }
    }
    log.idle = [];
    const env = {
        document: doc, window: win, MutationObserver: FakeObserver,
        requestAnimationFrame(cb) { frames.set(++frameId, cb); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(cb) { timers.set(++timerId, cb); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        now: () => clock,
    };
    if (options.idle) env.requestIdleCallback = (cb, opts) => { log.idle.push({ cb, opts }); return log.idle.length; };
    const liquid = Liquid.create(env);
    liquid.init();
    return {
        liquid, log, frames, timers, doc, win, element, textNode, bodyClasses, elClasses, wrapper, mainContent, elements,
        setSrcRect(rect) { srcRect = rect; },
        // 事件时间戳与动画帧时间共用同一个时钟（真实浏览器里两者都来自同一时间原点）。
        move(x, y, extra = {}) {
            clock += extra.dt ?? 16;
            log.listeners.pointermove.fn({ clientX: x, clientY: y, timeStamp: clock, buttons: 0, target: element, ...extra });
        },
        advance(ms) { clock += ms; },
        time() { return clock; },
        frame(ms = 16) {
            clock += ms;
            for (const [id, cb] of [...frames]) { frames.delete(id); cb(clock); }
        },
        fireTimers() { for (const [id, cb] of [...timers]) { timers.delete(id); cb(); } },
        runIdle(n) { for (let i = 0; i < n && frames.size; i++) this.frame(); },
        /** 在文字上快速划几下 */
        swipe() { this.move(150, 110); this.move(185, 112); this.move(220, 114); },
    };
}

test('空闲时没有帧调度、没有定时器，只挂一个被动 pointermove 监听', () => {
    const f = makeEnv();
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.log.listeners.pointermove.opts.passive, true);
    f.move(10, 10); f.move(500, 500); f.move(700, 20);
    assert.equal(f.frames.size, 0, '指针不在时钟上时什么都不做');
    assert.equal(f.log.appended.length, 0);
});

test('在文字上快速划过：盖上画布、原文字变透明、按 DOM 实测位置逐字绘制', () => {
    const f = makeEnv({ dpr: 2 });
    f.swipe();
    assert.equal(f.liquid.isRunning(), true);
    assert.equal(f.log.appended.length, 1);
    assert.equal(f.log.appended[0].className, 'clock-liquid-canvas');
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), true);
    assert.deepEqual(f.log.fillText.slice(0, 8).map(item => item.ch), ['1', '2', ':', '3', '4', ':', '5', '6']);
    // 画布横向铺满视口（左边 = 0），纵向上沿 = 文字范围上沿 − PAD，设备像素比 2。第 i 个字符画在字符格中心：
    // 格左边 100+40i，格宽 36，字距 -2 → 中心 = 左 + (36 − (−2)) / 2 = 左 + 19，再减去画布左边（0）。
    const canvasLeft = 0, canvasTop = 60 - Liquid.PAD;
    assert.equal(f.log.fillText[0].x, (100 + 19 - canvasLeft) * 2);
    assert.equal(f.log.fillText[1].x, (140 + 19 - canvasLeft) * 2);
    assert.equal(f.log.fillText[0].align, 'center', '居中绘制，才能让比例字形与 DOM 的等宽数字格对齐');
    // 基线 = 字符矩形顶(60) + ascent(80/dpr=40)，相对画布顶
    assert.equal(f.log.fillText[0].y, (60 + 40 - canvasTop) * 2);
    assert.equal(f.frames.size, 1);
});

test('停手后自动恢复：画布淡出、原文字还原、观察者与帧调度全部清理', () => {
    const f = makeEnv();
    f.swipe();
    f.runIdle(2000);
    assert.equal(f.liquid.isRunning(), false, '应在有限帧内自愈');
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false, '原文字恢复可见');
    assert.equal(f.frames.size, 0);
    assert.equal(f.log.observers[0].disconnected, true);
    const canvas = f.log.canvases.find(item => item.className === 'clock-liquid-canvas');
    assert.equal(canvas.classes.has('is-fading'), true);
    assert.equal(f.log.removed.includes(canvas), false, '淡出期间画布还在');
    f.fireTimers();
    assert.equal(f.log.removed.includes(canvas), true);
});

test('继续划动会推迟恢复（不会在划动中途被自动结束）', () => {
    const f = makeEnv();
    f.swipe();
    for (let i = 0; i < 60; i++) {
        f.move(150 + (i % 20) * 8, 110 + (i % 5) * 4);
        f.frame();
    }
    assert.equal(f.liquid.isRunning(), true);
});

test('慢速悬停、按住鼠标、不在文字区域都不会启动', () => {
    const f = makeEnv();
    f.move(150, 110, { dt: 16 });
    f.move(151, 110, { dt: 16 });
    assert.equal(f.liquid.isRunning(), false, '位移太小');
    f.move(150, 110, { dt: 16 });
    f.move(190, 110, { dt: 400 });
    assert.equal(f.liquid.isRunning(), false, '速度太慢');
    f.move(900, 600);                                  // 先离开时钟，避免上一步的位移被算进下一次移动
    f.move(150, 110, { buttons: 1 }); f.move(190, 110, { buttons: 1 });
    assert.equal(f.liquid.isRunning(), false, '按下鼠标时留给背景玩法');
    f.move(900, 600); f.move(940, 600);
    assert.equal(f.liquid.isRunning(), false, '不在文字上');
});

test('被浮层盖住（事件目标不在时钟里）不启动', () => {
    const f = makeEnv();
    const overlay = {};
    f.move(150, 110, { target: overlay });
    f.move(190, 112, { target: overlay });
    assert.equal(f.liquid.isRunning(), false);
});

test('各类禁用状态都不启动：设置关闭、背景体验关闭、减少动态效果、省流量、页面隐藏、工作台遮挡、手势世界唤醒', () => {
    const cases = {
        '液态时钟关闭': { experience: { settings: { enabled: true, clockLiquid: false } } },
        '背景体验关闭': { experience: { settings: { enabled: false, clockLiquid: true } } },
        '减少动态效果': { reduceMotion: true },
        '省流量': { saveData: true },
        '页面隐藏': { hidden: true },
        'B 站工作台': { bodyClasses: ['bili-panel-open'] },
        'YouTube 工作台': { bodyClasses: ['youtube-workbench-open'] },
        '虎牙工作台': { bodyClasses: ['huya-workbench-open'] },
        '手势世界唤醒': { experience: { settings: {}, active: true } },
    };
    for (const [name, options] of Object.entries(cases)) {
        const f = makeEnv(options);
        f.swipe();
        assert.equal(f.liquid.isRunning(), false, name);
        assert.equal(f.log.appended.length, 0, name);
        assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false, name);
    }
});

test('运行中遇到阻断状态：下一帧立即收尾并还原文字', () => {
    for (const trip of [
        f => { f.doc.hidden = true; },
        f => { f.bodyClasses.add('bili-panel-open'); },
        f => { f.win.backgroundExperience = { settings: {}, active: true }; },
        f => { f.win.backgroundExperience = { settings: { clockLiquid: false } }; },
    ]) {
        const f = makeEnv();
        f.swipe();
        assert.equal(f.liquid.isRunning(), true);
        trip(f);
        f.frame();
        assert.equal(f.liquid.isRunning(), false);
        assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false);
        assert.equal(f.frames.size, 0);
    }
});

test('窗口尺寸变化立即收尾；运行时间有硬上限', () => {
    const f = makeEnv();
    f.swipe();
    f.log.winListeners.resize();
    assert.equal(f.liquid.isRunning(), false);
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false);

    const g = makeEnv();
    g.swipe();
    // 持续有能量输入也不能无限运行
    for (let t = 0; t < 30000 && g.liquid.isRunning(); t += 500) {
        g.move(150 + (t / 500) % 20, 110);
        g.frame(500);
    }
    assert.equal(g.liquid.isRunning(), false);
});

test('文字每秒变化：观察者回调重绘源文字', () => {
    const f = makeEnv();
    f.swipe();
    const before = f.log.fillText.length;
    f.textNode.nodeValue = '12:34:57';
    f.log.observers[0].callback();
    assert.equal(f.log.fillText.length - before, 8);
    assert.equal(f.log.fillText.slice(-2)[1].ch, '7');
});

test('画布创建失败时绝不能留下透明的时钟：不加类、不插入画布', () => {
    const f = makeEnv({ noContext: true });
    f.swipe();
    assert.equal(f.liquid.isRunning(), false);
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false);
    assert.equal(f.log.appended.length, 0);
});

test('文字节点不是纯文本（量不到字符）时不启动', () => {
    const f = makeEnv();
    f.element.firstChild = { nodeType: 1 };
    f.swipe();
    assert.equal(f.liquid.isRunning(), false);
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false);
});

test('再次启动时会先清掉还在淡出的旧画布', () => {
    const f = makeEnv();
    f.swipe();
    f.runIdle(2000);
    const old = f.log.canvases.find(item => item.className === 'clock-liquid-canvas');
    assert.equal(f.log.removed.includes(old), false);
    f.move(900, 600);
    f.swipe();
    assert.equal(f.log.removed.includes(old), true);
    assert.equal(f.liquid.isRunning(), true);
});

test('stop 可重复调用，没有运行实例时也不抛错', () => {
    const f = makeEnv();
    f.liquid.stop();
    f.swipe();
    f.liquid.stop();
    f.liquid.stop();
    assert.equal(f.liquid.isRunning(), false);
});

// ---- 整块文字（时间 + 日期 + 农历 + 节日） --------------------------------------------------

const nonSpace = text => [...text].filter(ch => ch !== ' ').length;

test('整块文字：所有可见行一起被画布接管，画布覆盖它们的并集，停手后全部还原', () => {
    const f = makeEnv({ group: true });
    f.swipe();
    assert.equal(f.liquid.isRunning(), true);
    for (const id of ['time', 'date', 'lunar', 'holiday']) {
        assert.equal(f.elements[id].classes.has(Liquid.ACTIVE_CLASS), true, `${id} 应被设为透明`);
    }
    const expected = ['12:34:56', '2026年1月31日 星期六', '农历丙午年九月初五', '重阳节'].reduce((sum, text) => sum + nonSpace(text), 0);
    assert.equal(f.log.fillText.length, expected, '每一行的每个字符都画进了源画布');
    // 纵向并集：上 60（时间）、下 274（节日 250+24），外扩 PAD；横向不再跟着文字走，铺满整个视口（1440）
    const canvas = f.log.appended[0];
    assert.equal(canvas.style.left, '0px');
    assert.equal(canvas.style.top, `${60 - Liquid.PAD}px`);
    assert.equal(canvas.style.width, '1440px');
    assert.equal(canvas.style.height, `${(274 - 60) + Liquid.PAD * 2}px`);
    assert.equal(f.log.observers[0].observed.length, 4, '四行都被观察，文字变化时重绘');

    f.runIdle(2000);
    assert.equal(f.liquid.isRunning(), false);
    for (const id of ['time', 'date', 'lunar', 'holiday']) {
        assert.equal(f.elements[id].classes.has(Liquid.ACTIVE_CLASS), false, `${id} 应恢复可见`);
    }
});

test('整块文字：划到日期行（不在时间数字上）也能启动', () => {
    const f = makeEnv({ group: true });
    f.move(200, 195, { target: f.elements.date });
    f.move(260, 197, { target: f.elements.date });
    assert.equal(f.liquid.isRunning(), true);
    // 单独的时间行不覆盖这里，旧行为（只认时间）下不会启动
    const g = makeEnv();
    g.move(200, 195); g.move(260, 197);
    assert.equal(g.liquid.isRunning(), false);
});

test('整块文字：隐藏的行（display:none，宽度 0）不参与，也不会被设为透明', () => {
    const f = makeEnv({ group: true, hiddenHoliday: true });
    f.swipe();
    assert.equal(f.liquid.isRunning(), true);
    assert.equal(f.elements.holiday.classes.has(Liquid.ACTIVE_CLASS), false);
    assert.equal(f.elements.date.classes.has(Liquid.ACTIVE_CLASS), true);
    const canvas = f.log.appended[0];
    assert.equal(canvas.style.height, `${(243 - 60) + Liquid.PAD * 2}px`, '并集只算可见行（农历行底 215+28=243）');
});

test('整块文字：量不到字符的行保持原样可见，不会被画布“吃掉”', () => {
    const f = makeEnv({ group: true });
    f.elements.lunar.firstChild = { nodeType: 1 };
    f.swipe();
    assert.equal(f.liquid.isRunning(), true);
    assert.equal(f.elements.lunar.classes.has(Liquid.ACTIVE_CLASS), false);
    assert.equal(f.elements.time.classes.has(Liquid.ACTIVE_CLASS), true);
});

test('整块文字：某一行文字变空后重新计算，该行恢复可见，其余继续', () => {
    const f = makeEnv({ group: true });
    f.swipe();
    f.elements.holiday.firstChild.nodeValue = '';
    f.log.observers[0].callback();
    assert.equal(f.elements.holiday.classes.has(Liquid.ACTIVE_CLASS), false);
    assert.equal(f.elements.time.classes.has(Liquid.ACTIVE_CLASS), true);
    assert.equal(f.liquid.isRunning(), true);
});

test('整块文字：每一行按自己的不透明度和字号绘制（日期 .95 不能被画成不透明）', () => {
    const f = makeEnv({
        group: true,
        styleFor: node => (node && node.id === 'date' ? { opacity: '0.95', fontSize: '28.8px', fontWeight: '500' } : {}),
    });
    f.swipe();
    const fullDraws = f.log.fillText.filter(item => /700 88px/.test(item.font));     // 时间、农历、节日用默认样式
    const dateDraws = f.log.fillText.filter(item => /500 28\.8px/.test(item.font));
    assert.equal(fullDraws.length, nonSpace('12:34:56') + nonSpace('农历丙午年九月初五') + nonSpace('重阳节'));
    assert.equal(dateDraws.length, nonSpace('2026年1月31日 星期六'));
    assert.ok(fullDraws.every(item => item.alpha === 1));
    assert.ok(dateDraws.every(item => Math.abs(item.alpha - 0.95) < 1e-9), '日期行的 globalAlpha = 0.95');
});

test('笔刷半径随划动速度变大：快速甩过去搅动的范围比慢慢划更大', () => {
    const radii = [];
    const original = Core.smear;
    Core.smear = (field, cx, cy, radius, px, py) => { radii.push(radius); return original(field, cx, cy, radius, px, py); };
    try {
        const slow = makeEnv();
        slow.move(150, 110, { dt: 16 });
        slow.move(165, 110, { dt: 60 });          // 0.25 px/ms：刚过启动门槛
        assert.equal(slow.liquid.isRunning(), true);
        const fast = makeEnv();
        fast.move(150, 110, { dt: 16 });
        fast.move(290, 110, { dt: 16 });          // 8.75 px/ms
        assert.equal(fast.liquid.isRunning(), true);
        assert.equal(radii.length, 2);
        assert.ok(radii[1] > radii[0] * 1.5, `快 ${radii[1]} 应明显大于慢 ${radii[0]}`);
        assert.ok(radii[1] <= Core.PARAMS.smearRadius * (1 + Core.PARAMS.brushGrowth) + 1e-9, '有上限');
    } finally {
        Core.smear = original;
    }
});

test('画布总像素有上限：超宽视口在 2 倍屏上会自动降低分辨率，仍不低于 1 倍；常见笔记本视口保持 2 倍', () => {
    const wide = makeEnv({ dpr: 2, clientWidth: 3840, group: true });     // 画布横向铺满整个视口，4K 宽时像素最多
    wide.swipe();
    assert.equal(wide.liquid.isRunning(), true);
    const canvas = wide.log.appended[0];
    assert.ok(canvas.width * canvas.height <= Liquid.MAX_PIXELS * 1.02, `像素 ${canvas.width * canvas.height}`);
    assert.ok(canvas.width >= parseFloat(canvas.style.width), '不低于 1 倍');
    assert.ok(canvas.width < parseFloat(canvas.style.width) * 2, '确实降过分辨率');

    for (const width of [1440, 1512, 1728]) {                             // 常见 2 倍屏笔记本的视口宽度（14/16 寸 MacBook 等）
        const laptop = makeEnv({ dpr: 2, clientWidth: width, group: true });
        laptop.swipe();
        const laptopCanvas = laptop.log.appended[0];
        assert.equal(laptopCanvas.width, width * 2, `${width} 宽应保持 2 倍（像素 ${laptopCanvas.width * laptopCanvas.height}）`);
    }
});

test('慢机器自适应：渲染平滑耗时过长时隔帧绘制，模拟步数不受影响；变快后回到每帧绘制', () => {
    const f = makeEnv();
    const originalRender = Core.renderLayers, originalStep = Core.step;
    let renders = 0, steps = 0, cost = 20;
    Core.renderLayers = function (...args) { renders++; f.advance(cost); return originalRender.apply(this, args); };
    Core.step = function (...args) { steps++; return originalStep.apply(this, args); };
    try {
        const run = frames => {
            renders = 0; steps = 0;
            const began = f.time();
            for (let i = 0; i < frames; i++) {
                f.move(150 + (i % 20) * 8, 110 + (i % 5) * 4, { dt: 0 });     // 持续划动，避免被判定静止而结束
                f.frame(17);
            }
            return { renders, steps, elapsed: f.time() - began };
        };
        f.swipe();
        assert.equal(f.liquid.isRunning(), true);
        run(4);                                              // 让平滑耗时越过阈值
        const slow = run(40);
        assert.ok(slow.renders >= 18 && slow.renders <= 24, `慢时约隔帧绘制一次，实际 ${slow.renders}/40`);
        // 渲染占掉的时间也是真实时间：模拟步数应等于经过的时间 / 步长（不因为隔帧绘制而变少）。
        assert.ok(Math.abs(slow.steps - slow.elapsed / (1000 / 60)) <= 4, `模拟步数 ${slow.steps} 应约等于 ${(slow.elapsed / (1000 / 60)).toFixed(1)}`);

        cost = 1;
        run(12);                                             // 平滑耗时回落到 FAST 阈值以下
        const fast = run(30);
        assert.ok(fast.renders >= 28, `变快后每帧绘制，实际 ${fast.renders}/30`);
    } finally {
        Core.renderLayers = originalRender;
        Core.step = originalStep;
    }
});

test('渲染一直很快时从不降级：每一个前进了模拟的帧都会绘制', () => {
    const f = makeEnv();
    const originalRender = Core.renderLayers;
    let renders = 0;
    Core.renderLayers = function (...args) { renders++; f.advance(2); return originalRender.apply(this, args); };
    try {
        f.swipe();
        renders = 0;
        for (let i = 0; i < 40; i++) {
            f.move(150 + (i % 20) * 8, 110 + (i % 5) * 4, { dt: 0 });
            f.frame(17);
        }
        assert.ok(renders >= 38, `实际 ${renders}/40`);
    } finally {
        Core.renderLayers = originalRender;
    }
});

test('空闲预热：页面空闲时用 8×8 小画布提前付掉“整页第一次用 2D 画布”的一次性初始化，只做一次', () => {
    const f = makeEnv({ idle: true });
    assert.equal(f.log.idle.length, 1, '只登记一个空闲回调');
    assert.equal(f.log.idle[0].opts.timeout, 5000, '有超时上限，不会无限等');
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0, '预热不引入定时器');
    assert.equal(f.log.canvases.length, 0, '空闲回调触发之前什么都不创建');
    f.log.idle[0].cb();
    assert.equal(f.log.canvases.length, 1);
    assert.equal(f.log.canvases[0].width, 8);
    assert.equal(f.log.canvases[0].height, 8);
    assert.deepEqual(f.log.contextArgs[0], ['2d', { willReadFrequently: true }]);
    assert.equal(f.log.clear, 1);
    assert.equal(f.log.read, 1);
    assert.equal(f.log.fillText.length, 1, '连文字栅格化一起预热');
    assert.equal(f.log.appended.length, 0, '预热画布不进 DOM');
    f.log.idle[0].cb();
    assert.equal(f.log.canvases.length, 1, '重复触发不会再建');
});

test('空闲预热：功能被禁用时不做，没有 requestIdleCallback 的环境也不报错', () => {
    for (const options of [{ reduceMotion: true }, { saveData: true }, { experience: { settings: { enabled: true, clockLiquid: false } } }]) {
        const f = makeEnv({ idle: true, ...options });
        f.log.idle[0].cb();
        assert.equal(f.log.canvases.length, 0, JSON.stringify(options));
    }
    const plain = makeEnv();
    assert.equal(plain.log.idle.length, 0);
    assert.equal(plain.timers.size, 0);
});

test('空闲预热：画布不可用或抛错时静默，第一次划动仍照常工作', () => {
    const f = makeEnv({ idle: true, noContext: true });
    assert.doesNotThrow(() => f.log.idle[0].cb());
    const g = makeEnv({ idle: true });
    g.doc.createElement = () => { throw new Error('boom'); };
    assert.doesNotThrow(() => g.log.idle[0].cb());
});

// ---- 横向全屏（2026-10-15）：画布与触发带横向铺满整个视口，纵向仍是文字块 ------------------------
// 替身里的文字块（只有时间行）：x∈[100,420]、y∈[60,160]；视口 1440 宽。

test('横向全屏：时钟那一行的任何横向位置快速划过都会启动，不必落在文字上', () => {
    for (const [from, to] of [[10, 50], [600, 640], [1000, 1060], [1300, 1260], [1430, 1390]]) {
        const f = makeEnv();
        f.move(from, 110); f.move(to, 112);
        assert.equal(f.liquid.isRunning(), true, `${from}→${to}`);
    }
});

test('横向全屏：纵向仍只认文字块上下各一小段，其余高度不会误触发', () => {
    const top = 60, bottom = 160;
    for (const y of [top - Liquid.TRIGGER_MARGIN, bottom + Liquid.TRIGGER_MARGIN, 110]) {
        const f = makeEnv();
        f.move(900, y); f.move(960, y);
        assert.equal(f.liquid.isRunning(), true, `y=${y} 在带内`);
    }
    for (const y of [top - Liquid.TRIGGER_MARGIN - 1, bottom + Liquid.TRIGGER_MARGIN + 1, 5, 700]) {
        const f = makeEnv();
        f.move(900, y); f.move(960, y);
        assert.equal(f.liquid.isRunning(), false, `y=${y} 在带外`);
    }
});

test('横向全屏：画布与场横向铺满视口，远离文字的划动作用在正确的格上', () => {
    const calls = [];
    const original = Core.smear;
    Core.smear = (field, cx, cy, ...rest) => { calls.push({ cx, cy, cols: field.cols }); return original(field, cx, cy, ...rest); };
    try {
        const f = makeEnv();
        f.move(1000, 110); f.move(1060, 112);
        assert.equal(f.liquid.isRunning(), true);
        const canvas = f.log.appended[0];
        assert.equal(canvas.style.left, '0px');
        assert.equal(canvas.style.width, '1440px');
        assert.equal(canvas.style.height, `${100 + Liquid.PAD * 2}px`, '纵向仍是文字块 + PAD');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].cols, Math.ceil(1440 / Liquid.CELL));
        assert.equal(calls[0].cx, 1060 / Liquid.CELL, '画布左边是 0，格坐标 = clientX / 格宽');
        assert.equal(calls[0].cy, (112 - (60 - Liquid.PAD)) / Liquid.CELL);
    } finally {
        Core.smear = original;
    }
});

test('横向全屏：画布宽度取 documentElement.clientWidth（不含滚动条），取不到再用 innerWidth', () => {
    const a = makeEnv({ clientWidth: 1425, innerWidth: 1440 });
    a.swipe();
    assert.equal(a.log.appended[0].style.width, '1425px');
    const b = makeEnv({ clientWidth: 0, innerWidth: 1366 });
    b.swipe();
    assert.equal(b.log.appended[0].style.width, '1366px');
});

test('横向全屏：量不到视口宽度时不启动，也不会留下透明的时钟', () => {
    const f = makeEnv({ clientWidth: 0, innerWidth: 0 });
    f.swipe();
    assert.equal(f.liquid.isRunning(), false);
    assert.equal(f.log.appended.length, 0);
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), false);
});

test('横向全屏：时钟容器和它外面的页面本身算“在页面上”，浮层不算', () => {
    const page = makeEnv();
    page.move(1000, 110, { target: page.mainContent }); page.move(1060, 112, { target: page.mainContent });
    assert.equal(page.liquid.isRunning(), true, '两侧空白处命中的是 main，应当启动');
    const wrapped = makeEnv();
    wrapped.move(1000, 110, { target: wrapped.wrapper }); wrapped.move(1060, 112, { target: wrapped.wrapper });
    assert.equal(wrapped.liquid.isRunning(), true, '时钟容器本身（文字块两侧）也应当启动');
    const covered = makeEnv();
    const overlay = {};
    covered.move(1000, 110, { target: overlay }); covered.move(1060, 112, { target: overlay });
    assert.equal(covered.liquid.isRunning(), false, '被浮层盖住时，即使在横带里也不启动');
});

// ---- 分层绘制（2026-10-15）：文字层只上传近区，涟漪层是 cols×rows 的小画布，由 drawImage 放大铺满整幅 -----------
// 横向铺满整个视口后，每帧整幅 putImageData 在 2 倍屏上要写 2–2.4M 像素，主线程撑不住；
// 所以只把“文字附近”这一小块用脏矩形上传，其余整幅涟漪（每格 1 个像素）交给 GPU 的 drawImage 放大。
// 替身里文字块（时间行）在画布内的像素矩形（1×）：x∈[100,420)、y∈[PAD, PAD+100)（画布上沿 = 文字上沿 − PAD）。
const TEXT_1X = { x0: 100, y0: Liquid.PAD, x1: 419, y1: Liquid.PAD + 99 };

test('分层绘制：静止的首帧只上传文字块那一小块（脏矩形 = 文字包围盒），没有涟漪层，且先画好再挂进页面', () => {
    const f = makeEnv({ srcRect: TEXT_1X });
    f.swipe();
    const puts = f.log.ops.filter(op => op.op === 'putImageData');
    assert.equal(puts.length, 1, '静止首帧只有文字层一次上传');
    const [put] = puts;
    assert.equal(put.width, 1440);
    assert.equal(put.height, 100 + Liquid.PAD * 2, '文字层与画布同大小');
    assert.deepEqual([put.dx, put.dy], [0, 0]);
    assert.deepEqual(put.dirty, [100, Liquid.PAD, 320, 100], '脏矩形恰好是文字包围盒');
    assert.equal(f.log.ops.filter(op => op.op === 'drawImage').length, 0, '场是静止的，不需要涟漪层');
    // 先把静止首帧画进画布，同一任务内再挂进 DOM 并让原文字透明，否则会闪一下。
    const order = f.log.ops.map(op => op.op);
    assert.ok(order.indexOf('putImageData') < order.indexOf('appendChild'), `顺序：${order.join(',')}`);
    assert.equal(f.elClasses.has(Liquid.ACTIVE_CLASS), true);
});

test('分层绘制：运动帧 = 清空整幅 → 文字层脏矩形 → 涟漪小画布上传 → drawImage 放大铺满整幅', () => {
    const f = makeEnv({ srcRect: TEXT_1X });
    f.swipe();
    const visible = f.log.appended[0];
    const cols = Math.ceil(1440 / Liquid.CELL), rows = Math.ceil((100 + Liquid.PAD * 2) / Liquid.CELL);
    let ops = null;
    for (let i = 0; i < 10 && !ops; i++) {
        const mark = f.log.ops.length;
        f.frame();
        const frameOps = f.log.ops.slice(mark);
        if (frameOps.some(op => op.op === 'drawImage')) ops = frameOps;     // 涟漪成形前的几帧可能没有涟漪层
    }
    assert.ok(ops, '划动之后几帧内应当出现涟漪层');
    assert.deepEqual(ops.map(item => item.op), ['clearRect', 'putImageData', 'putImageData', 'drawImage']);
    const [clear, text, ripple, draw] = ops;
    assert.deepEqual(clear.args, [0, 0, visible.width, visible.height], '先清空整幅画布，旧涟漪不会残留');

    // 文字层：脏矩形落在画布之内、盖住文字、而且明显小于整幅。
    assert.equal(text.width, visible.width);
    assert.equal(text.height, visible.height);
    const [x, y, w, h] = text.dirty;
    assert.ok(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= visible.width && y + h <= visible.height, `脏矩形 ${text.dirty}`);
    assert.ok(x <= 100 && y <= Liquid.PAD && x + w >= 420 && y + h >= Liquid.PAD + 100, `脏矩形要盖住文字：${text.dirty}`);
    assert.ok(w * h < visible.width * visible.height * 0.6, `只上传近区，实际 ${(100 * w * h / (visible.width * visible.height)).toFixed(0)}% 的画布`);

    // 涟漪层：每格一个像素的小画布，不进 DOM，整个放大到整幅画布（横向全屏）。
    assert.equal(ripple.width, cols);
    assert.equal(ripple.height, rows);
    assert.deepEqual(ripple.dirty, [], '涟漪层整幅上传（只有 cols×rows 个像素）');
    assert.notEqual(draw.source, visible);
    assert.equal(f.log.appended.includes(draw.source), false, '涟漪小画布不进 DOM');
    assert.equal(draw.source.width, cols);
    assert.equal(draw.source.height, rows);
    assert.deepEqual(draw.args, [0, 0, cols, rows, 0, 0, visible.width, visible.height], '把整个小画布放大铺满整幅');
});

test('分层绘制：源画布里没有任何字（量不出包围盒）时不上传文字层，涟漪层照常绘制，也不会抛错', () => {
    const f = makeEnv();                  // 默认源画布全透明
    f.swipe();
    assert.equal(f.log.ops.filter(op => op.op === 'putImageData').length, 0, '静止首帧什么都不上传');
    let draws = 0;
    for (let i = 0; i < 6; i++) {
        const mark = f.log.ops.length;
        assert.doesNotThrow(() => f.frame());
        const ops = f.log.ops.slice(mark);
        assert.equal(ops.filter(op => op.op === 'putImageData' && op.width === 1440).length, 0, '没有文字层上传');
        draws += ops.filter(op => op.op === 'drawImage').length;
    }
    assert.ok(draws > 0, '涟漪层仍然画出来');
});

test('分层绘制：文字被重画后（MutationObserver）包围盒随之更新，上传范围盖住新位置', () => {
    const f = makeEnv({ srcRect: TEXT_1X });
    f.swipe();
    f.frame();
    // 文字内容变了：新的文字块挪到右边。
    f.setSrcRect({ x0: 900, y0: 80, x1: 1100, y1: 140 });
    f.log.observers[0].callback();
    const mark = f.log.ops.length;
    for (let i = 0; i < 3; i++) f.frame(17);       // 一帧不足一个模拟步长（16.67 ms）时不绘制，所以给足时间
    const text = f.log.ops.slice(mark).find(op => op.op === 'putImageData' && op.width === 1440);
    assert.ok(text, '重画之后的几帧内仍然上传文字层');
    const [x, y, w, h] = text.dirty;
    assert.ok(x <= 900 && x + w >= 1101 && y <= 80 && y + h >= 141, `脏矩形要盖住新位置：${text.dirty}`);
    assert.ok(x > 420, `不应还停留在旧位置：${text.dirty}`);
});

test('分层绘制：2 倍屏时包围盒与脏矩形用设备像素，涟漪层仍按场格、放大到整幅设备像素', () => {
    const calls = [];
    const original = Core.renderLayers;
    Core.renderLayers = function (field, src, text, ripple, width, height, opts) {
        calls.push({ cols: field.cols, rows: field.rows, width, height, opts });
        return original.apply(this, arguments);
    };
    try {
        const f = makeEnv({ dpr: 2, srcRect: { x0: 200, y0: Liquid.PAD * 2, x1: 839, y1: Liquid.PAD * 2 + 199 } });
        f.swipe();
        const visible = f.log.appended[0];
        assert.equal(visible.width, 2880);
        assert.equal(visible.height, (100 + Liquid.PAD * 2) * 2);
        let ops = null;
        for (let i = 0; i < 10 && !ops; i++) {
            const mark = f.log.ops.length;
            f.frame();
            const frameOps = f.log.ops.slice(mark);
            if (frameOps.some(op => op.op === 'drawImage')) ops = frameOps;
        }
        assert.ok(ops);
        assert.ok(calls.length >= 2);
        for (const call of calls) {
            assert.equal(call.opts.scale, 2, '位移按设备像素换算');
            assert.deepEqual(call.opts.textBounds, { left: 200, top: Liquid.PAD * 2, right: 840, bottom: Liquid.PAD * 2 + 200 });
            assert.equal(call.width, visible.width);
            assert.equal(call.height, visible.height);
        }
        const text = ops.find(op => op.op === 'putImageData' && op.width === visible.width);
        const [x, y, w, h] = text.dirty;
        assert.ok(x <= 200 && x + w >= 840 && y <= Liquid.PAD * 2 && y + h >= Liquid.PAD * 2 + 200, `脏矩形要盖住文字：${text.dirty}`);
        const draw = ops.find(op => op.op === 'drawImage');
        const { cols, rows } = calls[0];
        assert.equal(cols, Math.ceil(1440 / Liquid.CELL), '场格不随设备像素比变化');
        assert.deepEqual(draw.args, [0, 0, cols, rows, 0, 0, visible.width, visible.height]);
    } finally {
        Core.renderLayers = original;
    }
});
