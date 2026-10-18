// 水母皮肤与宿主的接线：在 vm 里真实运行 background-experience.js（间谍皮肤 + 真实皮肤两种），
// 以及设置页、index.html、CSS 与源码的静态契约。这是“业务替身 + 静态”层，不等同于真实 Chrome 扩展验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function makeSpySkin() {
    return {
        starts: 0, stops: 0, frames: [], active: false,
        hover: false, grabResult: false, dragged: false, hovers: [], grabs: [], drops: [], cancels: 0,
        start() { this.starts++; this.active = true; },
        stop() { this.stops++; this.active = false; },
        frame(options) { this.frames.push(options); return true; },
        isActive() { return this.active; },
        hoverAt(x, y) { this.hovers.push([x, y]); return this.hover; },
        grabAt(x, y) { this.grabs.push([x, y]); return this.grabResult; },
        drop(x, y) { this.drops.push([x, y]); return this.dragged; },
        cancel() { this.cancels++; return true; },
    };
}

/**
 * 宿主夹具。skin：'spy' 间谍皮肤 / 'real' 真实 jellyfish-core.js + jellyfish.js / 'none' 皮肤脚本缺席。
 * 间谍皮肤只记录宿主怎么调用它；真实皮肤验证整条链路画在宿主画布上。
 */
async function hostFixture({ effect = 'jellyfish', settings = {}, reduceMotion = false, saveData = false, skin = 'spy', memos, crumple = false, complete } = {}) {
    const listeners = new Map();
    const winListeners = new Map();
    const rootListeners = new Map();
    const clock = { now: 100 };
    class FakeElement {}
    const frames = new Map();
    const calls = new Map();
    const changed = [];
    let frameId = 0;
    const canvasState = {};
    const canvasContext = new Proxy(canvasState, {
        get(target, key) {
            if (key in target) return target[key];
            return () => {
                calls.set(String(key), (calls.get(String(key)) || 0) + 1);
                return { addColorStop() {} };
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    function element(extra = {}, record) {
        const classes = new Set();
        return Object.assign(new FakeElement(), {
            dataset: {}, style: { setProperty() {} }, id: '',
            classList: {
                contains: value => classes.has(value),
                add: value => classes.add(value), remove: value => classes.delete(value),
                toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
            },
            setAttribute() {},
            addEventListener(name, listener) { if (record) { if (!record.has(name)) record.set(name, []); record.get(name).push(listener); } },
            getContext: () => canvasContext,
        }, extra);
    }
    const body = element();
    const documentElement = element({}, rootListeners);
    const elements = new Map();
    for (const id of ['root', 'canvas', 'detail', 'time', 'toggle', 'hud', 'energy', 'energy-fill', 'status']) {
        elements.set(`background-experience-${id}`, element());
    }
    const document = {
        body, documentElement, hidden: false, readyState: 'loading',
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        addEventListener(name, listener) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(listener);
        },
    };
    const spy = makeSpySkin();
    const win = {
        addEventListener(name, listener) {
            if (!winListeners.has(name)) winListeners.set(name, []);
            winListeners.get(name).push(listener);
        },
        matchMedia: query => ({ matches: reduceMotion && String(query).includes('reduce'), addEventListener() {} }),
    };
    if (skin === 'spy') win.JellyfishSkin = spy;
    const bins = [];
    if (crumple) {
        win.TaskCrumple = { holdBin() { const bin = makeBin(); bins.push(bin); return bin; } };
    }
    const completions = [];
    if (complete) {
        win.memoManager = { completeTaskById(id) { completions.push(id); return complete(id); } };
    }
    const stored = { backgroundExperienceSettings: { visualEffect: effect, ...settings } };
    const context = vm.createContext({
        window: win, document, navigator: { connection: { saveData } },
        innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2, Element: FakeElement,
        performance: { now: () => clock.now },
        requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setInterval() { return 1; }, clearInterval() {},
        MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
        chrome: {
            runtime: { sendMessage() {} },
            storage: {
                sync: { get(key, callback) { return callback ? callback(stored) : Promise.resolve(stored); } },
                local: { get(key, callback) { const value = memos === undefined ? {} : { memos }; return callback ? callback(value) : Promise.resolve(value); } },
                onChanged: {
                    addListener(fn) { changed.push(fn); },
                    removeListener(fn) { const i = changed.indexOf(fn); if (i >= 0) changed.splice(i, 1); },
                },
            },
        },
    });
    if (skin === 'real') {
        vm.runInContext(read('js/jellyfish-core.js'), context, { filename: 'jellyfish-core.js' });
        vm.runInContext(read('js/jellyfish.js'), context, { filename: 'jellyfish.js' });
    }
    vm.runInContext(read('js/background-experience.js'), context, { filename: 'background-experience.js' });
    for (const listener of listeners.get('DOMContentLoaded') || []) listener();
    await tick();
    await tick();
    const fire = (map, name, event) => {
        for (const listener of [...(map.get(name) || [])]) {
            listener(event);
            if (event.stopped) break;
        }
        return event;
    };
    return {
        win, spy, frames, calls, changed, canvasContext, canvasState, documentElement, bins, completions, clock, body,
        root: elements.get('background-experience-root'),
        experience: win.backgroundExperience,
        render(now = 116) { for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); } },
        /** 在 document 上分发一个事件（name 即事件名）；extra 里可以放 target/button/buttons/pointerId/pointerType 等。 */
        dispatch(name, extra = {}) {
            const event = Object.assign({
                type: name, target: body, clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true,
                defaultPrevented: false, stopped: false,
                preventDefault() { this.defaultPrevented = true; },
                stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; },
            }, extra);
            return fire(listeners, name, event);
        },
        dispatchWindow(name, extra = {}) { return fire(winListeners, name, Object.assign({ type: name }, extra)); },
        dispatchRoot(name, extra = {}) { return fire(rootListeners, name, Object.assign({ type: name }, extra)); },
        newBackground() { return element({}); },
        newElement(extra) { return element(extra); },
    };
}

/** 纸篓替身（TaskCrumple.holdBin 的返回值）：记录被调用的次数与对准状态。 */
function makeBin() {
    const bin = {
        released: 0, gulps: 0, near: [],
        mouth: () => ({ x: 1345, y: 805 }),
        contains: (x, y) => x >= 1300 && x <= 1390 && y >= 760 && y <= 850,
        setNear(value) { bin.near.push(!!value); },
        gulp() { bin.gulps++; },
        release() { bin.released++; },
    };
    return bin;
}

const memo = (patch = {}) => Object.assign({ id: `m${Math.random()}`, title: 't', completed: false }, patch);

// ---------- 宿主接线（间谍皮肤） ----------

test('选水母：启动皮肤一次并调度一帧；每帧把宿主的画布、尺寸、时间步、强度、指针、调色板与省流量标记交给它', async () => {
    const f = await hostFixture();
    assert.equal(f.spy.starts, 1);
    assert.equal(f.root.dataset.visual, 'jellyfish');
    assert.equal(f.frames.size, 1, '水母需要逐帧绘制');
    f.render(116);
    assert.equal(f.spy.frames.length, 1);
    const options = f.spy.frames[0];
    assert.equal(options.ctx, f.canvasContext);
    assert.equal(options.width, 1440);
    assert.equal(options.height, 900);
    assert.ok(Number.isFinite(options.dt) && options.dt > 0 && options.dt <= 34, `dt=${options.dt}`);
    assert.equal(options.amount, f.experience.settings.intensity / 100);
    assert.equal(options.pointer, null, '还没有真实的指针位置：屏幕中心的占位值不能当成指针交给水母（否则它们会躲一个看不见的指针）');
    assert.equal(options.labels, true, '任务名默认显示');
    // 颜色由皮肤自己的七彩调色板（jellyfish.js 的 PALETTE）和每只水母的颜色编号决定；宿主的 COLORS 只给其他皮肤用，不能传给水母，
    // 否则默认调色板被覆盖，所有水母又只剩宿主那几种颜色
    assert.equal(options.colors, undefined);
    assert.equal(options.lowPower, false);
    assert.equal(f.canvasState.globalCompositeOperation, 'screen', '宿主按 screen 混合绘制，皮肤不需要自己设');
    assert.equal(f.frames.size, 1, '下一帧已排队');
});

test('数据节省模式：把 lowPower 传给皮肤；宿主本来就隔帧绘制（帧率减半），皮肤跟着减半', async () => {
    const f = await hostFixture({ saveData: true });
    f.render(116);
    assert.equal(f.spy.frames.length, 0, '第一帧被宿主跳过');
    f.render(132);
    assert.equal(f.spy.frames.length, 1, '两帧只画一次');
    assert.equal(f.spy.frames[0].lowPower, true);
});

test('切到别的皮肤或关闭总开关：停止水母并结束帧循环（静态皮肤没有空转帧）', async () => {
    const other = await hostFixture();
    other.experience.settings.visualEffect = 'depth';
    other.experience.applySettings();
    assert.equal(other.spy.active, false);
    assert.equal(other.spy.stops >= 1, true);
    assert.equal(other.frames.size, 0);
    assert.equal(other.root.dataset.visual, 'depth');

    const off = await hostFixture();
    off.experience.settings.enabled = false;
    off.experience.applySettings();
    assert.equal(off.spy.active, false);
    assert.equal(off.frames.size, 0);
    assert.equal(off.root.dataset.visual, 'none');
});

test('减少动态效果：水母直接视为没选皮肤（不启动、没有帧、色调层属性也不出现）；其他皮肤保持原行为', async () => {
    const jelly = await hostFixture({ reduceMotion: true });
    assert.equal(jelly.spy.starts, 0);
    assert.equal(jelly.spy.active, false);
    assert.equal(jelly.root.dataset.visual, 'none', '色调层按 data-visual 生效，不能留下一层没有内容的暗色');
    assert.equal(jelly.frames.size, 0);
    jelly.experience.setActive(true);          // 手势玩法唤醒后循环照常，但不会画水母
    jelly.render(116);
    assert.equal(jelly.spy.frames.length, 0);

    const liquid = await hostFixture({ reduceMotion: true, effect: 'liquid' });
    assert.equal(liquid.root.dataset.visual, 'liquid', '没有改动其他皮肤在减少动态效果下的行为');
    assert.equal(liquid.frames.size, 1);
    assert.equal(liquid.spy.starts, 0);
});

test('页面被隐藏或被工作台遮挡：取消帧并清屏、不再调用皮肤；恢复后继续', async () => {
    const f = await hostFixture();
    f.render(116);
    assert.equal(f.spy.frames.length, 1);
    f.experience.setSuspended(true);
    assert.equal(f.frames.size, 0);
    const clears = f.calls.get('clearRect') || 0;
    assert.ok(clears >= 1, '暂停时清掉画布上的水母');
    for (let i = 0; i < 30; i++) f.render(200 + i * 16);
    assert.equal(f.spy.frames.length, 1, '暂停期间不再调用皮肤');
    assert.equal(f.calls.get('clearRect') || 0, clears, '暂停期间没有逐帧清屏');
    f.experience.setSuspended(false);
    assert.equal(f.frames.size, 1);
    f.render(1000);
    assert.equal(f.spy.frames.length, 2);
    assert.ok(f.spy.frames[1].dt <= 34, '恢复的第一帧不会把隐藏时长当作一步');
});

test('皮肤自己停用（故障）：这一帧之后循环结束，宿主不再调用它', async () => {
    const f = await hostFixture();
    f.render(116);
    f.spy.active = false;                      // 皮肤自行判定故障
    f.render(132);
    assert.equal(f.frames.size, 0);
    const calls = f.spy.frames.length;
    for (let i = 0; i < 10; i++) f.render(148 + i * 16);
    assert.equal(f.spy.frames.length, calls);
});

test('手势玩法唤醒与休眠不会重复帧循环，也不会让水母停下', async () => {
    const f = await hostFixture();
    f.experience.setActive(true);
    assert.equal(f.frames.size, 1, '不能出现重复动画循环');
    f.experience.setActive(false);
    assert.equal(f.frames.size, 1, '水母是持续的背景，手势休眠不影响它');
    f.render(116);
    assert.equal(f.spy.frames.length, 1);
});

test('皮肤脚本缺席：宿主不抛错、不调度帧、不影响其他设置', async () => {
    const f = await hostFixture({ skin: 'none' });
    assert.equal(f.frames.size, 0);
    assert.equal(f.experience.settings.visualEffect, 'jellyfish');
    f.experience.settings.visualEffect = 'liquid';
    f.experience.applySettings();
    assert.equal(f.frames.size, 1, '其他皮肤照常');
});

// ---------- 真实皮肤 + 真实物理核心，画在宿主画布上 ----------

test('真实链路：存储里的未完成任务数 = 画在宿主画布上的水母数；切走后释放监听', async () => {
    const f = await hostFixture({ skin: 'real', memos: [memo(), memo(), memo({ completed: true }), memo({ status: 'failed' })] });
    const skin = f.win.JellyfishSkin;
    assert.equal(skin.state().pending, 2);
    for (let i = 0; i < 6; i++) f.render(116 + i * 16);
    assert.equal(skin.state().jellies, 2);
    assert.ok((f.calls.get('ellipse') || 0) >= 4 * 6 / 2, '每只水母每帧至少画钟罩与高光两个椭圆');
    assert.ok((f.calls.get('quadraticCurveTo') || 0) > 100, '触手与裙边');
    assert.equal(f.canvasState.globalCompositeOperation, 'screen');
    assert.ok(f.win.JellyfishCore, '物理核心已加载');

    const listenersBefore = f.changed.length;
    f.experience.settings.visualEffect = 'none';
    f.experience.applySettings();
    assert.equal(skin.state().started, false);
    assert.equal(f.changed.length, listenersBefore - 1, '水母自己的存储监听已移除');
    assert.equal(f.frames.size, 0);
});

test('真实链路：任务存储变化后，下一帧起数量跟上（新增游进来，完成的游走）', async () => {
    const pool = Array.from({ length: 5 }, () => memo());        // 同一批任务：水母按任务 id 对应
    const f = await hostFixture({ skin: 'real', memos: pool.slice(0, 3) });
    const skin = f.win.JellyfishSkin;
    for (let i = 0; i < 4; i++) f.render(116 + i * 16);
    assert.equal(skin.state().jellies, 3);
    const emit = next => { for (const fn of [...f.changed]) fn({ memos: { newValue: next } }, 'local'); };
    emit(pool);
    assert.equal(skin.state().pending, 5);
    for (let i = 0; i < 4; i++) f.render(200 + i * 16);
    assert.equal(skin.state().jellies, 5);
    emit(pool.slice(0, 1));
    assert.equal(skin.state().pending, 1);
    const states = skin._world().jellies.map(j => j.state).sort();
    assert.equal(states.filter(s => s === 'leaving').length, 4, '多出来的 4 只开始离开');
    assert.equal(skin._world().jellies.find(j => j.state !== 'leaving').taskId, pool[0].id, '留下的是还没完成的那个任务的水母');
    // 不相关的存储区不触发
    for (const fn of [...f.changed]) fn({ memos: { newValue: pool.slice(0, 3) } }, 'sync');
    assert.equal(skin.state().pending, 1);
});

test('真实链路 + 减少动态效果：真实皮肤不启动、不监听、画布上什么都没有', async () => {
    const baseline = await hostFixture({ skin: 'real', reduceMotion: true });
    const listenersBefore = baseline.changed.length;
    const f = await hostFixture({ skin: 'real', reduceMotion: true, memos: [memo(), memo()] });
    assert.equal(f.win.JellyfishSkin.state().started, false);
    assert.equal(f.changed.length, listenersBefore);
    f.experience.setActive(true);
    for (let i = 0; i < 5; i++) f.render(116 + i * 16);
    assert.equal(f.calls.get('ellipse') || 0, 0);
});

// ---------- 设置页与归一化 ----------

function makeElement(id) {
    const listeners = {};
    const el = {
        id, listeners, value: '', checked: false, children: [], style: {}, dataset: {}, disabled: false, textContent: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
        appendChild(child) { el.children.push(child); },
        replaceChildren(...children) { el.children = children; },
        querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false,
        focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, getContext: () => null,
        fire(name) { for (const fn of listeners[name] || []) fn({ target: el }); },
    };
    return el;
}

function settingsSandbox(stored) {
    const elements = new Map();
    const document = {
        readyState: 'complete', body: makeElement('body'), documentElement: makeElement('html'), title: '',
        getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
        querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
        createElement: tag => makeElement(tag), createDocumentFragment: () => makeElement('fragment'),
        hidden: false,
    };
    const store = stored ? { backgroundExperienceSettings: stored } : {};
    const saved = [];
    const chrome = {
        storage: {
            sync: {
                get: async keys => (typeof keys === 'string' ? { [keys]: store[keys] } : {}),
                set: async value => { saved.push(JSON.parse(JSON.stringify(value))); Object.assign(store, value); },
            },
            local: { get: async () => ({}), set: async () => {} },
            onChanged: { addListener() {} },
        },
        runtime: { sendMessage() {}, getManifest: () => ({ version: '0' }), onMessage: { addListener() {} } },
        i18n: { getMessage: () => '' },
    };
    const win = {
        document, chrome, addEventListener() {},
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        location: { hash: '', search: '', href: '' }, history: { replaceState() {} },
        localStorage: { getItem: () => null, setItem() {} },
        innerWidth: 1280, innerHeight: 720, performance: { now: () => 0 },
    };
    win.window = win;
    const context = vm.createContext({
        ...win, window: win, document, chrome, console, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {}, navigator: { language: 'zh-CN' }, URL,
        fetch: async () => ({ ok: false, json: async () => ({}) }), Intl,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}, getComputedStyle: () => ({}),
        CustomEvent: class {}, Event: class {}, MutationObserver: class { observe() {} },
        IntersectionObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
        AudioContext: undefined, webkitAudioContext: undefined,
    });
    return { context, document, saved };
}

async function loadSettingsPage(stored) {
    const box = settingsSandbox(stored);
    vm.runInContext(read('js/settings-page.js'), box.context, { filename: 'settings-page.js' });
    await tick(); await tick();
    box.select = box.document.getElementById('set-bgVisualEffect');
    return box;
}

test('设置页：已保存的 jellyfish 还原到下拉框；改下拉框保存 jellyfish；读取时把未知取值归一化回默认', async () => {
    const restored = await loadSettingsPage({ visualEffect: 'jellyfish' });
    assert.equal(restored.select.value, 'jellyfish');

    const box = await loadSettingsPage({ enabled: true, clockLiquid: false });
    box.select.value = 'jellyfish';
    box.select.fire('change');
    await tick();
    const last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.visualEffect, 'jellyfish');
    assert.equal(last.clockLiquid, false, '不影响其他设置');

    // 保存沿用既有做法（原样写入），归一化发生在读取时：设置页加载与宿主 normalizeSettings 各有一道（见下一条测试）
    for (const bad of ['jellyfish ', 'Jellyfish', '<img src=x onerror=alert(1)>', 7]) {
        const loaded = await loadSettingsPage({ visualEffect: bad });
        assert.equal(loaded.select.value, 'depth', JSON.stringify(bad));
    }
});

test('background-experience.js 的归一化：认识 jellyfish，不认识的取值回到 depth', () => {
    const document = {
        readyState: 'complete', hidden: false, body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
        getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    };
    const win = {
        document, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {},
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, performance: { now: () => 0 },
        chrome: { storage: { sync: { get: async () => ({}) }, onChanged: { addListener() {} } } },
    };
    win.window = win;
    const context = vm.createContext({
        ...win, window: win, document, console, navigator: {}, performance: win.performance, innerWidth: 1280, innerHeight: 720,
        chrome: win.chrome, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
        AudioContext: undefined, webkitAudioContext: undefined,
    });
    vm.runInContext(read('js/background-experience.js'), context, { filename: 'background-experience.js' });
    const { normalizeSettings } = win.BackgroundExperience;
    assert.equal(normalizeSettings({ visualEffect: 'jellyfish' }).visualEffect, 'jellyfish');
    for (const bad of ['Jellyfish', 'jellyfish ', '', null, 7, { toString: () => 'jellyfish' }, '../jellyfish']) {
        assert.equal(normalizeSettings({ visualEffect: bad }).visualEffect, 'depth', JSON.stringify(bad));
    }
});

// ---------- 页面与源码的静态契约 ----------

test('settings.html：水母选项在“v2 视觉风格”下拉框里，说明写清数量规则、秒针与减少动态效果', () => {
    const html = read('settings.html');
    const field = html.slice(html.indexOf('v2 视觉风格'), html.indexOf('</select>', html.indexOf('id="set-bgVisualEffect"')));
    assert.match(field, /<option value="jellyfish">水族馆<\/option>/);
    assert.match(field, /未完成的任务数/);
    assert.match(field, /最多 8 只/);
    assert.match(field, /一只水母对应一个任务/);
    assert.match(field, /每只主色都不一样/);
    assert.match(field, /有纯色，也有双色、渐变和七彩的/);
    assert.match(field, /秒数收缩/);
    assert.match(field, /减少动态效果/);
});

test('index.html：先核心、再皮肤、最后宿主；没有远程脚本，版本号已递增', () => {
    const html = read('index.html');
    const core = html.indexOf('js/jellyfish-core.js');
    const skin = html.indexOf('js/jellyfish.js');
    const host = html.indexOf('js/background-experience.js');
    assert.ok(core > 0 && core < skin && skin < host);
    assert.equal(html.split('js/jellyfish-core.js').length - 1, 1);
    assert.equal(html.split('js/jellyfish.js').length - 1, 1);
    const tags = html.slice(core - 20, host + 80).match(/<script[^>]*>/g);
    assert.ok(tags.every(tag => !/https?:/.test(tag)), '不引用远程脚本');
    assert.match(html, /css\/background-experience\.css\?v=6/);
    assert.match(html, /js\/background-experience\.js\?v=12/);
});

test('CSS：水母色调层只在 data-visual=jellyfish 时出现，用宿主的强度变量，不引入外部资源', () => {
    const css = read('css/background-experience.css');
    const match = css.match(/\.bgx-root\[data-visual="jellyfish"\] \.bgx-tone\s*\{([^}]*)\}/);
    assert.ok(match, '缺少水母色调层规则');
    assert.match(match[1], /opacity:\s*var\(--bgx-tone-opacity\)/);
    assert.match(match[1], /linear-gradient/);
    assert.doesNotMatch(match[1], /url\(|@import/);
    assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
});

test('jellyfish.js 自包含：自己不写任何存储、不发请求、不拼 HTML、不执行动态代码、不自建调度；唯一的写出口是 completeTaskById', () => {
    const source = read('js/jellyfish.js');
    // 只检查真正执行的代码：去掉块注释和整行/行尾注释（行尾 // 前必须是空白，不会误伤字符串里的地址，而地址本来就被下面的规则禁止）
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    for (const [pattern, why] of [
        [/\beval\s*\(/, 'eval'], [/new Function/, 'new Function'], [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XHR'],
        [/sendMessage|connectNative|WebSocket/, '消息/网络'], [/localStorage|sessionStorage|indexedDB/, '页面存储'],
        [/innerHTML|outerHTML|insertAdjacentHTML|document\.write/, 'HTML 注入'],
        [/\.set\s*\(|\.remove\s*\(|\.clear\s*\(/, '存储写入'], [/chrome\.storage\.(sync|session|managed)/, '其他存储区'],
        [/requestAnimationFrame|setInterval|setTimeout/, '自建调度（调度由宿主 RAF 负责）'],
        [/https?:\/\//, '外部地址'],
    ]) assert.doesNotMatch(code, pattern, why);
    const gets = code.match(/\.get\s*\(\s*['"][^'"]+['"]/g) || [];
    assert.deepEqual(gets, [".get('memos'"], '只读任务表这一个键');
    // 完成任务只经 memo 层统一入口：defaultComplete 是整个文件里唯一碰 memoManager 的地方，且只用 completeTaskById
    const body = code.match(/function defaultComplete[\s\S]*?\n    }\n/);
    assert.ok(body, '找不到 defaultComplete');
    assert.match(body[0], /win\.memoManager/);
    assert.deepEqual(body[0].match(/manager\.\w+/g), ['manager.completeTaskById', 'manager.completeTaskById']);
    assert.doesNotMatch(code.replace(body[0], ''), /memoManager|completeTaskById/, '其余代码不接触任务管理器');
    const core = read('js/jellyfish-core.js');
    assert.doesNotMatch(core, /\bchrome\b|\bdocument\b|\bwindow\.|localStorage/, '核心是不碰宿主环境的纯计算');
});

test('与其他模块互不耦合：任务、时钟、主脚本、Dock、后台都不引用水母皮肤', () => {
    for (const file of ['js/memo.js', 'js/ticker.js', 'js/clock.js', 'js/main.js', 'js/dock-manager.js', 'js/background.js', 'js/alarm-center.js']) {
        assert.doesNotMatch(read(file), /JellyfishSkin|JellyfishCore|jellyfish/i, file);
    }
    const host = read('js/background-experience.js');
    assert.match(host, /window\.JellyfishSkin/);
    assert.equal((host.match(/JellyfishSkin/g) || []).length, 1, '宿主只在 skin() 一处取皮肤，其余都经它');
    assert.doesNotMatch(host, /JellyfishCore|TaskCrumple|memoManager|completeTaskById/, '宿主不直接碰物理核心、纸篓和任务管理器：抓取与完成都在皮肤里');
});

// ---------- 宿主的指针转发：抓取 / 悬停 / 光标 / 吞 click（间谍皮肤） ----------

const bgTarget = f => { const el = f.newBackground(); el.classList.add('main-layout'); return el; };
const grabbableClass = f => f.documentElement.classList.contains('jellyfish-grabbable');
const grabbingClass = f => f.documentElement.classList.contains('jellyfish-grabbing');

test('指针：没收到真实位置前不交给皮肤；之后交真实指针对象；离开页面就收回；再次进入恢复', async () => {
    const f = await hostFixture();
    f.render(116);
    assert.equal(f.spy.frames[0].pointer, null);
    f.dispatch('pointermove', { clientX: 300, clientY: 200, buttons: 0 });
    f.render(132);
    assert.equal(f.spy.frames[1].pointer, f.experience.pointer);
    assert.deepEqual([f.experience.pointer.x, f.experience.pointer.y], [300, 200]);
    f.dispatchRoot('pointerleave', { pointerType: 'mouse' });
    f.render(148);
    assert.equal(f.spy.frames[2].pointer, null, '离开页面后水母不再躲一个看不见的指针');
    f.dispatch('pointermove', { clientX: 310, clientY: 210, buttons: 0 });
    f.render(164);
    assert.equal(f.spy.frames[3].pointer, f.experience.pointer);
});

test('指针：拖着水母时即使指针离开页面也保留（按住时窗口外仍会收到移动）；放开后恢复“已离开”', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.dispatch('pointerdown', { clientX: 400, clientY: 300, target: bgTarget(f) });
    f.dispatchRoot('pointerleave', { pointerType: 'mouse' });
    f.render(116);
    assert.equal(f.spy.frames.at(-1).pointer, f.experience.pointer, '拖着水母：保留指针');
    f.dispatch('pointerup', { clientX: -20, clientY: 300, buttons: 0 });
    f.dispatchRoot('pointerleave', { pointerType: 'mouse' });
    f.render(132);
    assert.equal(f.spy.frames.at(-1).pointer, null);
});

test('悬停：鼠标在空白背景上移到可抓的水母上，光标类出现；移开、离开页面、移到别的元素上、触摸都不出现', async () => {
    const f = await hostFixture();
    const bg = bgTarget(f);
    f.spy.hover = true;
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, target: bg });
    assert.equal(grabbableClass(f), true);
    assert.deepEqual(f.spy.hovers.at(-1), [500, 300]);
    f.spy.hover = false;
    f.dispatch('pointermove', { clientX: 900, clientY: 300, buttons: 0, target: bg });
    assert.equal(grabbableClass(f), false, '移开');
    f.spy.hover = true;
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, target: bg });
    f.dispatchRoot('pointerleave', { pointerType: 'mouse' });
    assert.equal(grabbableClass(f), false, '离开页面');
    const asked = f.spy.hovers.length;
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, target: f.newElement({ id: 'dock' }) });
    assert.equal(grabbableClass(f), false, '指针在别的元素上（水母在它们下面，抓不到）');
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, pointerType: 'touch', target: bg });
    assert.equal(grabbableClass(f), false, '触摸没有悬停');
    assert.equal(f.spy.hovers.length, asked, '这两种情况根本不询问皮肤');
});

test('悬停：设置关闭、减少动态效果、页面被隐藏时都不询问皮肤也没有光标类', async () => {
    const off = await hostFixture({ settings: { jellyfishTasks: false } });
    off.spy.hover = true;
    off.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0 });
    assert.equal(off.spy.hovers.length, 0);
    assert.equal(grabbableClass(off), false);

    const reduced = await hostFixture({ reduceMotion: true });
    reduced.spy.hover = true;
    reduced.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0 });
    assert.equal(reduced.spy.hovers.length, 0);

    const hidden = await hostFixture();
    hidden.experience.setSuspended(true);
    hidden.spy.hover = true;
    hidden.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0 });
    assert.equal(hidden.spy.hovers.length, 0);
});

test('运行中关掉“任务名与抓取”：光标类立刻撤掉、水母本身照常游（labels 变 false），再打开恢复悬停与任务名', async () => {
    const f = await hostFixture();
    const bg = bgTarget(f);
    f.spy.hover = true;
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, target: bg });
    assert.equal(grabbableClass(f), true, '先悬停在水母上');
    const stops = f.spy.stops;
    f.experience.settings.jellyfishTasks = false;
    f.experience.applySettings();
    assert.equal(grabbableClass(f), false, '不用等指针再动一下，光标类就撤掉');
    assert.equal(f.spy.stops, stops, '只是不再给抓取，水母本身不停');
    assert.equal(f.spy.active, true);
    f.render(116);
    assert.equal(f.spy.frames.at(-1).labels, false);
    f.experience.settings.jellyfishTasks = true;
    f.experience.applySettings();
    f.dispatch('pointermove', { clientX: 500, clientY: 300, buttons: 0, target: bg });
    assert.equal(grabbableClass(f), true, '再打开：又能悬停');
    f.render(132);
    assert.equal(f.spy.frames.at(-1).labels, true);
});

test('任务名开关：jellyfishTasks 决定交给皮肤的 labels；设置页的值经归一化，只有 false 才关闭', async () => {
    const on = await hostFixture();
    on.render(116);
    assert.equal(on.spy.frames[0].labels, true);
    const off = await hostFixture({ settings: { jellyfishTasks: false } });
    off.render(116);
    assert.equal(off.spy.frames[0].labels, false);
    const { DEFAULTS, normalizeSettings } = on.win.BackgroundExperience;
    assert.equal(DEFAULTS.jellyfishTasks, true);
    assert.equal(normalizeSettings(undefined).jellyfishTasks, true);
    assert.equal(normalizeSettings({ jellyfishTasks: false }).jellyfishTasks, false);
    for (const value of [0, null, '', 'false', 'off', {}, [], NaN, undefined]) {
        assert.equal(normalizeSettings({ jellyfishTasks: value }).jellyfishTasks, true, `非布尔 false 不算关闭：${JSON.stringify(value)}`);
    }
    assert.equal(normalizeSettings({ jellyfishTasks: false }).visualEffect, 'depth', '不影响其他字段');
});

test('按下：只在空白背景上按主键、且正好按在水母身上才抓；抓住就拦下这次按下，并且不再交给背景玩法', async () => {
    const f = await hostFixture();
    f.experience.setActive(true);                         // 背景玩法已唤醒：抓水母要优先于它
    f.spy.grabResult = true;
    const down = f.dispatch('pointerdown', { clientX: 420, clientY: 310, target: bgTarget(f), pointerId: 7 });
    assert.deepEqual(f.spy.grabs, [[420, 310]]);
    assert.equal(down.defaultPrevented, true, '拦下默认行为：不选中文字、不开始原生拖拽');
    assert.equal(grabbingClass(f), true, '抓着时整页是抓取手势');
    assert.equal(f.experience.grab.id, 7);
    assert.equal(f.experience.pointer.down, false, '背景玩法没有开始笔触');
    assert.equal(f.experience.world.strokes.length, 0);
});

test('按下：没抓到水母时原样走背景玩法（笔触照常开始）；其他不满足的条件一律不去问皮肤', async () => {
    const f = await hostFixture();
    f.experience.setActive(true);
    f.spy.grabResult = false;
    const down = f.dispatch('pointerdown', { clientX: 420, clientY: 310, target: bgTarget(f) });
    assert.equal(f.spy.grabs.length, 1, '问了但没抓到');
    assert.equal(f.experience.grab, null);
    assert.equal(grabbingClass(f), false);
    assert.equal(down.defaultPrevented, true, '这是背景玩法自己的 preventDefault，行为不变');
    assert.equal(f.experience.pointer.down, true);
    assert.equal(f.experience.world.strokes.length, 1);

    const g = await hostFixture();
    g.spy.grabResult = true;
    const cases = {
        '右键': { button: 2 },
        '中键': { button: 1 },
        '次要指针': { isPrimary: false },
        '按在别的元素上（面板、按钮、时钟文字）': { target: g.newElement({ id: 'dock' }) },
    };
    for (const [name, extra] of Object.entries(cases)) {
        const before = g.spy.grabs.length;
        const event = g.dispatch('pointerdown', { clientX: 420, clientY: 310, ...extra });
        assert.equal(g.spy.grabs.length, before, name);
        assert.equal(event.defaultPrevented, false, name);
        assert.equal(g.experience.grab, null, name);
    }
});

test('按下：设置关闭、页面隐藏、减少动态效果（皮肤没启动）、皮肤脚本缺席时都抓不到', async () => {
    const off = await hostFixture({ settings: { jellyfishTasks: false } });
    off.spy.grabResult = true;
    off.dispatch('pointerdown', { clientX: 420, clientY: 310 });
    assert.equal(off.spy.grabs.length, 0);

    const hidden = await hostFixture();
    hidden.spy.grabResult = true;
    hidden.experience.setSuspended(true);
    hidden.dispatch('pointerdown', { clientX: 420, clientY: 310 });
    assert.equal(hidden.spy.grabs.length, 0);

    const reduced = await hostFixture({ reduceMotion: true });
    reduced.spy.grabResult = true;
    reduced.dispatch('pointerdown', { clientX: 420, clientY: 310 });
    assert.equal(reduced.spy.grabs.length, 0);

    const missing = await hostFixture({ skin: 'none' });
    assert.doesNotThrow(() => missing.dispatch('pointerdown', { clientX: 420, clientY: 310 }));
    assert.doesNotThrow(() => missing.dispatch('pointermove', { clientX: 420, clientY: 310, buttons: 0 }));
    assert.doesNotThrow(() => missing.dispatch('pointerup', { clientX: 420, clientY: 310 }));
    assert.equal(missing.experience.grab, null);
});

test('松手：由皮肤判断是否落进纸篓；只有拖过才吞掉随后的那次 click，且只吞一次、过期不吞', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.spy.dragged = true;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310, target: bgTarget(f) });
    f.dispatch('pointermove', { clientX: 900, clientY: 700, target: bgTarget(f) });
    assert.equal(f.spy.hovers.length, 0, '抓着的时候不再询问悬停');
    f.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    assert.deepEqual(f.spy.drops, [[1340, 800]]);
    assert.equal(f.experience.grab, null);
    assert.equal(grabbingClass(f), false);
    const click = f.dispatch('click', { clientX: 1340, clientY: 800 });
    assert.equal(click.defaultPrevented, true);
    assert.equal(click.stopped, true, '页面不会把它当成点了空白处');
    assert.equal(f.dispatch('click', { clientX: 1340, clientY: 800 }).stopped, false, '只吞一次');

    // 点一下没拖：不吞
    f.spy.dragged = false;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310, target: bgTarget(f) });
    f.dispatch('pointerup', { clientX: 420, clientY: 310, buttons: 0 });
    assert.equal(f.dispatch('click', {}).stopped, false);

    // 拖过但这次 click 没来（别处放开），过期后到来的 click 不吞
    f.spy.dragged = true;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310, target: bgTarget(f) });
    f.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    f.clock.now += 1000;
    assert.equal(f.dispatch('click', {}).stopped, false);
});

test('松手：别的指针抬起不结束抓取；同一指针的抬起才结束', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310, pointerId: 5 });
    f.dispatch('pointerup', { clientX: 10, clientY: 10, pointerId: 6, buttons: 0 });
    assert.equal(f.spy.drops.length, 0);
    assert.ok(f.experience.grab);
    f.dispatch('pointerup', { clientX: 430, clientY: 320, pointerId: 5, buttons: 0 });
    assert.equal(f.spy.drops.length, 1);
    assert.equal(f.experience.grab, null);
});

test('在窗口外放开按键没收到 pointerup：下一次移动发现没有按键了，按放开处理', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310 });
    f.dispatch('pointermove', { clientX: 600, clientY: 400, buttons: 1 });
    assert.equal(f.spy.drops.length, 0, '还按着');
    f.dispatch('pointermove', { clientX: 620, clientY: 410, buttons: 0 });
    assert.deepEqual(f.spy.drops, [[620, 410]]);
    assert.equal(f.experience.grab, null);
    assert.equal(grabbingClass(f), false);
});

test('打断：失焦 / 指针取消 / Esc / 页面隐藏 / 关闭水母皮肤 / 关闭任务名开关 —— 放开水母、不判定落点、清掉光标类', async () => {
    const interruptions = {
        '窗口失焦': f => f.dispatchWindow('blur'),
        '指针取消': f => f.dispatch('pointercancel'),
        '按 Esc': f => f.dispatch('keydown', { key: 'Escape' }),
        '页面被隐藏': f => f.experience.setSuspended(true),
        '切到别的皮肤': f => { f.experience.settings.visualEffect = 'depth'; f.experience.applySettings(); },
        '总开关关闭': f => { f.experience.settings.enabled = false; f.experience.applySettings(); },
        // 另一个标签页/设置页在拖动途中把“任务名与抓取”关掉：已抓着的水母放开，松手时不能再完成任务
        '关闭任务名开关': f => { f.experience.settings.jellyfishTasks = false; f.experience.applySettings(); },
    };
    for (const [name, interrupt] of Object.entries(interruptions)) {
        const f = await hostFixture();
        f.spy.grabResult = true;
        f.spy.dragged = true;
        f.dispatch('pointerdown', { clientX: 420, clientY: 310 });
        assert.ok(f.experience.grab, name);
        const cancels = f.spy.cancels;
        interrupt(f);
        assert.equal(f.experience.grab, null, name);
        assert.ok(f.spy.cancels > cancels, `${name}：通知皮肤放开`);
        assert.equal(f.spy.drops.length, 0, `${name}：不判定落点`);
        assert.equal(grabbingClass(f), false, name);
        assert.equal(f.dispatch('click', {}).stopped, false, `${name}：被打断不吞 click`);
    }
    // 没在抓的时候按 Esc 什么也不做
    const idle = await hostFixture();
    idle.dispatch('keydown', { key: 'Escape' });
    assert.equal(idle.spy.cancels, 0);
});

test('打断之后：随后到来的 pointerup 不会再触发落点判定（抓取已经结束）', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.dispatch('pointerdown', { clientX: 420, clientY: 310, pointerId: 3 });
    f.dispatchWindow('blur');
    f.dispatch('pointerup', { clientX: 1340, clientY: 800, pointerId: 3, buttons: 0 });
    assert.equal(f.spy.drops.length, 0);
});

// ---------- 抓取全链路：真实宿主 + 真实皮肤 + 真实物理核心 + 纸篓与 memoManager 替身 ----------

function deferredPromise() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function chainFixture(options = {}) {
    const pool = options.memos || [memo({ id: 't1', title: '写周报' }), memo({ id: 't2', title: '买牛奶' }), memo({ id: 't3', title: '约牙医' })];
    const gate = deferredPromise();
    const f = await hostFixture({ skin: 'real', memos: pool, crumple: options.crumple !== false, complete: options.complete || (() => gate.promise), settings: options.settings, reduceMotion: options.reduceMotion });
    f.clockT = 116;
    f.frames_ = count => { for (let i = 0; i < count; i++) f.render(f.clockT += 16); };
    f.gate = gate;
    f.frames_(110);                                       // 让水母游进来、变得可抓
    f.skin = f.win.JellyfishSkin;
    f.place = (id, x, y) => {
        const world = f.skin._world();
        world.jellies.forEach((j, i) => {
            const mine = j.taskId === id;
            j.x = mine ? x : 120 + i * 160; j.y = mine ? y : 700;
            j.vx = j.vy = 0; j.tilt = 0; j.heading = 0; j.pulseT = 99; j.homeAt = Infinity;
        });
        return world.jellies.find(j => j.taskId === id);
    };
    return f;
}

test('全链路：抓住 → 拖出纸篓 → 对准 → 松手：completeTaskById 恰好一次（用任务 id）；回执 ok 后水母被吃掉、纸篓吞一下；随后的 click 被吞掉', async () => {
    const f = await chainFixture();
    const jelly = f.place('t1', 600, 300);
    assert.ok(jelly && jelly.state === 'alive' && jelly.alpha > 0.9, '水母已就位');
    const bg = bgTarget(f);

    f.dispatch('pointermove', { clientX: 600, clientY: 300, buttons: 0, target: bg });
    assert.equal(grabbableClass(f), true, '鼠标在水母上：光标变手');
    const down = f.dispatch('pointerdown', { clientX: 600, clientY: 300, target: bg });
    assert.equal(down.defaultPrevented, true);
    assert.equal(grabbingClass(f), true);
    assert.equal(grabbableClass(f), false);
    assert.equal(f.bins.length, 0, '没拖动之前不出纸篓');

    f.dispatch('pointermove', { clientX: 700, clientY: 380 });
    f.frames_(2);
    assert.equal(f.bins.length, 1, '拖过阈值才出纸篓');
    for (const [x, y] of [[900, 500], [1200, 700], [1340, 800]]) { f.dispatch('pointermove', { clientX: x, clientY: y }); f.frames_(8); }
    const bin = f.bins[0];
    assert.equal(bin.near.at(-1), true, '对准纸篓');
    assert.ok(Math.hypot(jelly.x - 1340, jelly.y - 800) < 200, '水母跟着指针');

    f.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    assert.deepEqual(f.completions, ['t1'], '完成入口恰好一次，参数是任务 id');
    assert.equal(jelly.busy !== null && jelly.busy !== undefined, true, '停在篓口等回执');
    assert.equal(bin.gulps, 0);
    f.frames_(5);
    assert.deepEqual(f.completions, ['t1'], '等待期间不会重复发出');

    f.gate.resolve({ ok: true });
    await tick();
    assert.equal(jelly.state, 'eating');
    assert.equal(bin.gulps, 1);
    assert.equal(bin.released, 0);

    const click = f.dispatch('click', { clientX: 1340, clientY: 800 });
    assert.equal(click.stopped, true);
    assert.equal(f.dispatch('click', {}).stopped, false);

    f.frames_(60);
    assert.ok(!f.skin._world().jellies.includes(jelly), '被吃掉的水母已移除');
    assert.deepEqual([...f.skin._world().jellies.map(j => j.taskId)].sort(), ['t2', 't3'], '其余任务的水母不受影响');
    assert.equal(f.completions.length, 1);
});

test('全链路：完成失败（回执 ok:false）→ 水母放回去、纸篓收起、没有被吃掉；任务名单没变所以水母仍在', async () => {
    const f = await chainFixture({ complete: () => Promise.resolve({ ok: false, reason: 'failed' }) });
    const jelly = f.place('t2', 500, 280);
    f.dispatch('pointerdown', { clientX: 500, clientY: 280, target: bgTarget(f) });
    f.dispatch('pointermove', { clientX: 800, clientY: 500 });
    f.frames_(3);
    f.dispatch('pointermove', { clientX: 1340, clientY: 800 });
    f.frames_(10);
    f.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    await tick();
    f.frames_(4);
    assert.deepEqual(f.completions, ['t2']);
    assert.equal(f.bins[0].gulps, 0);
    assert.equal(f.bins[0].released, 1);
    assert.ok(f.skin._world().jellies.includes(jelly));
    assert.equal(jelly.state === 'eating' || jelly.state === 'leaving', false);
    assert.equal(!!jelly.held, false);
    assert.equal(!!jelly.busy, false);
});

test('全链路：松手时不在纸篓里 → 放开、收起纸篓、完全不调用完成入口', async () => {
    const f = await chainFixture();
    f.place('t3', 500, 280);
    f.dispatch('pointerdown', { clientX: 500, clientY: 280, target: bgTarget(f) });
    f.dispatch('pointermove', { clientX: 800, clientY: 500 });
    f.frames_(4);
    f.dispatch('pointerup', { clientX: 800, clientY: 500, buttons: 0 });
    f.frames_(4);
    assert.deepEqual(f.completions, []);
    assert.equal(f.bins[0].released, 1);
    assert.equal(f.bins[0].gulps, 0);
    assert.equal(f.dispatch('click', {}).stopped, true, '拖过一段：这次 click 也要吞');
});

test('全链路：点一下水母（没拖动）= 只是点了空白背景：不出纸篓、不完成、不吞 click', async () => {
    const f = await chainFixture();
    f.place('t1', 500, 280);
    f.dispatch('pointerdown', { clientX: 500, clientY: 280, target: bgTarget(f) });
    f.dispatch('pointerup', { clientX: 502, clientY: 281, buttons: 0 });
    assert.equal(f.bins.length, 0);
    assert.deepEqual(f.completions, []);
    assert.equal(f.dispatch('click', {}).stopped, false);
});

test('全链路：抓着时失焦 → 水母放回去、纸篓收起、没有任何完成请求；等回执期间失焦不打断已发出的请求', async () => {
    const f = await chainFixture();
    const jelly = f.place('t1', 500, 280);
    f.dispatch('pointerdown', { clientX: 500, clientY: 280, target: bgTarget(f) });
    f.dispatch('pointermove', { clientX: 900, clientY: 600 });
    f.frames_(4);
    f.dispatchWindow('blur');
    f.frames_(3);
    assert.equal(f.bins[0].released, 1);
    assert.deepEqual(f.completions, []);
    assert.equal(!!jelly.held, false);

    // 另一只：落进纸篓、等回执时失焦——请求已经发出，失焦不再有影响，回执 ok 仍会让水母被吃掉
    const g = await chainFixture();
    const j2 = g.place('t2', 500, 280);
    g.dispatch('pointerdown', { clientX: 500, clientY: 280, target: bgTarget(g) });
    g.dispatch('pointermove', { clientX: 900, clientY: 600 });
    g.frames_(3);
    g.dispatch('pointermove', { clientX: 1340, clientY: 800 });
    g.frames_(10);
    g.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    g.dispatchWindow('blur');
    g.frames_(2);
    assert.deepEqual(g.completions, ['t2']);
    g.gate.resolve({ ok: true });
    await tick();
    assert.equal(j2.state, 'eating');
});

test('全链路：关闭“任务名与抓取”：水母仍按任务整理，但不画任务名、抓不到', async () => {
    const f = await chainFixture({ settings: { jellyfishTasks: false } });
    const jelly = f.place('t1', 600, 300);
    assert.ok(jelly);
    assert.equal(f.skin.state().pending, 3);
    assert.equal(f.calls.get('fillText') || 0, 0, '不画任务名');
    const down = f.dispatch('pointerdown', { clientX: 600, clientY: 300, target: bgTarget(f) });
    assert.equal(down.defaultPrevented, false);
    assert.equal(f.experience.grab, null);
    assert.equal(!!jelly.held, false);
});

test('全链路：纸篓脚本缺席（没加载或被限制）→ 拖动开始时放回水母、绝不去完成任务', async () => {
    const f = await chainFixture({ crumple: false });
    const jelly = f.place('t1', 600, 300);
    f.dispatch('pointerdown', { clientX: 600, clientY: 300, target: bgTarget(f) });
    f.dispatch('pointermove', { clientX: 900, clientY: 600 });
    f.frames_(3);
    f.dispatch('pointerup', { clientX: 1340, clientY: 800, buttons: 0 });
    f.frames_(3);
    assert.deepEqual(f.completions, []);
    assert.equal(!!jelly.held, false);
    assert.ok(f.skin._world().jellies.includes(jelly));
});

test('全链路：任务名绘制出来了（有 fillText），并且水母数 = 未完成任务数', async () => {
    const f = await chainFixture();
    f.frames_(10);
    assert.equal(f.skin.state().jellies, 3);
    assert.ok((f.calls.get('fillText') || 0) > 0, '隐约显示任务名');
});

// ---------- “水母任务名与抓取”开关：设置页与样式 ----------

test('设置页：水母任务名与抓取开关——默认开，只有保存的 false 才关；改动只写自己这个字段并保留其他设置', async () => {
    for (const stored of [undefined, {}, { jellyfishTasks: true }, { jellyfishTasks: 0 }, { jellyfishTasks: 'false' }, { jellyfishTasks: null }]) {
        const box = await loadSettingsPage(stored);
        assert.equal(box.document.getElementById('set-bgJellyfishTasks').checked, true, JSON.stringify(stored));
    }
    const off = await loadSettingsPage({ jellyfishTasks: false });
    assert.equal(off.document.getElementById('set-bgJellyfishTasks').checked, false);

    const box = await loadSettingsPage({ enabled: true, clockLiquid: false, visualEffect: 'jellyfish' });
    const toggle = box.document.getElementById('set-bgJellyfishTasks');
    toggle.checked = false;
    toggle.fire('change');
    await tick();
    let last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.jellyfishTasks, false);
    assert.equal(last.clockLiquid, false, '其他设置保留');
    assert.equal(last.visualEffect, 'jellyfish');
    toggle.checked = true;
    toggle.fire('change');
    await tick();
    last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.jellyfishTasks, true);
});

test('settings.html：有“水母任务名与抓取”开关（默认勾选），说明写清任务名、纸篓、等同点圆圈、失败放回与关闭后的效果', () => {
    const html = read('settings.html');
    assert.match(html, /<input type="checkbox" id="set-bgJellyfishTasks" checked>/);
    assert.equal(html.split('id="set-bgJellyfishTasks"').length - 1, 1);
    const start = html.indexOf('水母任务名与抓取');
    const field = html.slice(start, html.indexOf('</div>', html.indexOf('sp-field-hint', start)));
    assert.match(field, /隐约显示/);
    assert.match(field, /纸篓/);
    assert.match(field, /和在任务面板里点圆圈完全一样/);
    assert.match(field, /放回原处并提示/);
    assert.match(field, /关闭后水母不再显示任务名，也不能被抓住/);
});

test('CSS：抓取光标只靠 html 上的两个类名；抓着时整页抓取手势并禁止选中文字；不引入外部资源', () => {
    const css = read('css/background-experience.css');
    const hover = css.match(/html\.jellyfish-grabbable[^{]*\{([^}]*)\}/g) || [];
    assert.ok(hover.length >= 1);
    assert.ok(hover.every(rule => /cursor:\s*grab;/.test(rule)));
    const grabbing = css.match(/html\.jellyfish-grabbing\s*,\s*html\.jellyfish-grabbing \*\s*\{([^}]*)\}/);
    assert.ok(grabbing, '缺少抓取中的整页规则');
    assert.match(grabbing[1], /cursor:\s*grabbing\s*!important/);
    assert.match(grabbing[1], /user-select:\s*none\s*!important/);
    assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
});

// ---------- 夜晚荧光开关（2026-10-15）：宿主、设置页、HTML ----------

test('夜晚荧光开关：jellyfishNight 决定交给皮肤的 night，默认开，只有 false 才关；运行中切换立即生效且水母不停', async () => {
    const on = await hostFixture();
    on.render(116);
    assert.equal(on.spy.frames[0].night, true);
    const off = await hostFixture({ settings: { jellyfishNight: false } });
    off.render(116);
    assert.equal(off.spy.frames[0].night, false);
    const { DEFAULTS, normalizeSettings } = on.win.BackgroundExperience;
    assert.equal(DEFAULTS.jellyfishNight, true);
    assert.equal(normalizeSettings(undefined).jellyfishNight, true);
    assert.equal(normalizeSettings({ jellyfishNight: false }).jellyfishNight, false);
    for (const value of [0, null, '', 'false', 'off', {}, [], NaN, undefined]) {
        assert.equal(normalizeSettings({ jellyfishNight: value }).jellyfishNight, true, `非布尔 false 不算关闭：${JSON.stringify(value)}`);
    }
    assert.equal(normalizeSettings({ jellyfishNight: false }).jellyfishTasks, true, '与任务名开关互不影响');
    const stops = on.spy.stops;
    on.experience.settings.jellyfishNight = false;
    on.experience.applySettings();
    on.render(132);
    assert.equal(on.spy.frames.at(-1).night, false);
    assert.equal(on.spy.stops, stops, '只是不再加夜晚效果，水母本身不停');
    assert.equal(on.spy.active, true);
});

test('设置页：夜晚荧光开关——默认开，只有保存的 false 才关；改动只写自己这个字段并保留其他设置', async () => {
    for (const stored of [undefined, {}, { jellyfishNight: true }, { jellyfishNight: 0 }, { jellyfishNight: 'false' }, { jellyfishNight: null }]) {
        const box = await loadSettingsPage(stored);
        assert.equal(box.document.getElementById('set-bgJellyfishNight').checked, true, JSON.stringify(stored));
    }
    const off = await loadSettingsPage({ jellyfishNight: false });
    assert.equal(off.document.getElementById('set-bgJellyfishNight').checked, false);

    const box = await loadSettingsPage({ enabled: true, clockLiquid: false, jellyfishTasks: false, visualEffect: 'jellyfish' });
    const toggle = box.document.getElementById('set-bgJellyfishNight');
    toggle.checked = false;
    toggle.fire('change');
    await tick();
    let last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.jellyfishNight, false);
    assert.equal(last.jellyfishTasks, false, '其他设置保留');
    assert.equal(last.clockLiquid, false);
    assert.equal(last.visualEffect, 'jellyfish');
    toggle.checked = true;
    toggle.fire('change');
    await tick();
    last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.jellyfishNight, true);
});

test('settings.html：有“水母夜晚荧光”开关（默认勾选且只出现一次），说明写清时间段、只读本机时钟与关闭后的效果；脚本版本号已更新', () => {
    const html = read('settings.html');
    assert.match(html, /<input type="checkbox" id="set-bgJellyfishNight" checked>/);
    assert.equal(html.split('id="set-bgJellyfishNight"').length - 1, 1);
    const start = html.indexOf('水母夜晚荧光');
    const field = html.slice(start, html.indexOf('</div>', html.indexOf('sp-field-hint', start)));
    assert.match(field, /晚上 8 点到次日早上 6 点/);
    assert.match(field, /只读本机时钟/);
    assert.match(field, /昼夜一个样/);
    const index = read('index.html');
    for (const [file, version] of [['jellyfish-core.js', 6], ['jellyfish.js', 6], ['background-experience.js', 12]]) {
        assert.ok(index.includes(`js/${file}?v=${version}`), `${file} 版本号`);
    }
});
