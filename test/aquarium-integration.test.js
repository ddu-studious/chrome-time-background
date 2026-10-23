// 水族馆（鱼）与背景体验宿主的接线：在 vm 里真实运行 background-experience.js（间谍水族馆/间谍皮肤，以及真实皮肤 + 真实水族馆的整链路），
// 以及 index.html / 设置页 / 源码的静态契约。这是“业务替身 + 静态”层，不等同于真实 Chrome 扩展验证。
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
        frame(options) { this.frames.push(options); if (this.order) this.order.push('jelly'); return true; },
        isActive() { return this.active; },
        hoverAt(x, y) { this.hovers.push([x, y]); return this.hover; },
        grabAt(x, y) { this.grabs.push([x, y]); return this.grabResult; },
        drop(x, y) { this.drops.push([x, y]); return this.dragged; },
        cancel() { this.cancels++; return true; },
        bells() { return [{ x: 100, y: 200, r: 40 }]; },
    };
}

function makeSpyAquarium(order) {
    return {
        starts: 0, stops: 0, frames: [], active: false,
        hover: false, grabResult: false, dragged: false, hovers: [], grabs: [], drops: [], cancels: 0,
        start() { this.starts++; this.active = true; },
        stop() { this.stops++; this.active = false; },
        frame(options) { this.frames.push(options); if (order) order.push('fish'); return true; },
        isActive() { return this.active; },
        hoverAt(x, y) { this.hovers.push([x, y]); return this.hover; },
        grabAt(x, y) { this.grabs.push([x, y]); return this.grabResult; },
        drop(x, y) { this.drops.push([x, y]); return this.dragged; },
        cancel() { this.cancels++; return true; },
    };
}

function makeSpyWater(order) {
    return {
        starts: 0, stops: 0, frames: [], active: false, shoreValue: null, shoreCalls: [],
        shore(now) { this.shoreCalls.push(now); return this.shoreValue; },
        start() { this.starts++; this.active = true; },
        stop() { this.stops++; this.active = false; },
        frame(options) { this.frames.push(options); if (order) order.push('water'); return true; },
        isActive() { return this.active; },
    };
}

/**
 * 宿主夹具。aquarium：'spy' 间谍水族馆 / 'real' 真实核心 + 玩法 + 捕食 + 控制器 / 'real-noplay' 没有玩法脚本 / 'real-nopred' 没有捕食脚本。
 * skin：'spy' 间谍皮肤 / 'real' 真实 jellyfish-core.js + jellyfish.js / 'none' 皮肤脚本缺席。
 * 间谍皮肤只记录宿主怎么调用它；真实皮肤验证整条链路画在宿主画布上。
 */
async function hostFixture({ effect = 'jellyfish', settings = {}, reduceMotion = false, saveData = false, skin = 'spy', memos, crumple = false, complete, aquarium = 'spy', water = 'none', localData = {}, order } = {}) {
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
    spy.order = order;
    const spyAq = makeSpyAquarium(order);
    const win = {
        addEventListener(name, listener) {
            if (!winListeners.has(name)) winListeners.set(name, []);
            winListeners.get(name).push(listener);
        },
        matchMedia: query => ({ matches: reduceMotion && String(query).includes('reduce'), addEventListener() {} }),
    };
    if (skin === 'spy') win.JellyfishSkin = spy;
    if (aquarium === 'spy') win.Aquarium = spyAq;
    const spyWater = makeSpyWater(order);
    if (water === 'spy') win.AquariumWater = spyWater;
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
        setTimeout() { return 0; }, clearTimeout() {}, // 失焦休息的计时器在这里只需存在，不真正计时
        setInterval() { return 1; }, clearInterval() {},
        MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
        chrome: {
            runtime: { sendMessage() {} },
            storage: {
                sync: { get(key, callback) { return callback ? callback(stored) : Promise.resolve(stored); } },
                local: { get(key, callback) { const value = Object.assign({}, memos === undefined ? {} : { memos }, localData); return callback ? callback(value) : Promise.resolve(value); } },
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
    if (aquarium === 'real' || aquarium === 'real-noplay' || aquarium === 'real-nopred') {
        vm.runInContext(read('js/aquarium-core.js'), context, { filename: 'aquarium-core.js' });
        if (aquarium !== 'real-noplay') {   // real-noplay：玩法脚本缺席（加载失败）时鱼层照常工作
            vm.runInContext(read('js/aquarium-play-core.js'), context, { filename: 'aquarium-play-core.js' });
            vm.runInContext(read('js/aquarium-play.js'), context, { filename: 'aquarium-play.js' });
        }
        if (aquarium === 'real') vm.runInContext(read('js/aquarium-predation-core.js'), context, { filename: 'aquarium-predation-core.js' });       // real-nopred：捕食脚本缺席时鱼层照常工作
        vm.runInContext(read('js/aquarium.js'), context, { filename: 'aquarium.js' });
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
        win, spy, spyAq, spyWater, frames, calls, changed, canvasContext, canvasState, documentElement, bins, completions, clock, body,
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



const htmlClass = (f, name) => f.documentElement.classList.contains(name);

// ---------- 启停 ----------

test('选水母且水族馆开着（默认）：启动水族馆一次；关闭开关、换皮肤、切到减少动态效果都停掉它', async () => {
    const f = await hostFixture();
    assert.equal(f.spyAq.starts, 1);
    assert.equal(f.spyAq.active, true);

    f.experience.settings.aquariumFish = false;
    f.experience.applySettings();
    assert.equal(f.spyAq.active, false, '关掉“水族馆”开关后鱼层停止，皮肤仍在运行');
    assert.equal(f.spy.active, true);
    f.experience.settings.aquariumFish = true;
    f.experience.applySettings();
    assert.equal(f.spyAq.active, true, '重新打开又启动');

    f.experience.settings.visualEffect = 'depth';
    f.experience.applySettings();
    assert.equal(f.spyAq.active, false, '换成别的皮肤：水族馆跟着停');

    const off = await hostFixture({ settings: { aquariumFish: false } });
    assert.equal(off.spyAq.starts, 0, '设置里关着：从一开始就不启动，也就不读存储、没有托盘');
    const reduce = await hostFixture({ reduceMotion: true });
    assert.equal(reduce.spyAq.starts, 0, '减少动态效果下水母视为没选皮肤，鱼也不出现');
    const other = await hostFixture({ effect: 'liquid' });
    assert.equal(other.spyAq.starts, 0, '没选水母皮肤：不启动水族馆');
});

test('水族馆脚本缺席或皮肤缺席：宿主不抛错、水母照常', async () => {
    const noAq = await hostFixture({ aquarium: 'none' });
    noAq.render(116);
    assert.equal(noAq.spy.frames.length, 1);
    noAq.dispatch('pointerdown', { clientX: 5, clientY: 5 });
    noAq.dispatch('pointerup', { clientX: 5, clientY: 5 });
    const noSkin = await hostFixture({ skin: 'none' });
    noSkin.render(116);
    assert.equal(noSkin.spyAq.starts, 0, '水母皮肤脚本缺席时 syncJellyfish 直接返回：鱼也不动（保持原有的“皮肤缺席 = 空操作”）');
});

// ---------- 画帧 ----------

test('每帧先画鱼再画水母；鱼拿到宿主的画布、尺寸、时间步、强度、指针、省流量、夜晚开关与水母钟罩（只读）', async () => {
    const order = [];
    const f = await hostFixture({ order });
    f.render(116);
    assert.deepEqual(order, ['fish', 'jelly'], '鱼在水母后面（先画）');
    const o = f.spyAq.frames[0];
    assert.equal(o.ctx, f.canvasContext);
    assert.equal(o.width, 1440);
    assert.equal(o.height, 900);
    assert.ok(Number.isFinite(o.dt) && o.dt > 0 && o.dt <= 34);
    assert.equal(o.amount, f.experience.settings.intensity / 100);
    assert.equal(o.pointer, null);
    assert.equal(o.lowPower, false);
    assert.equal(o.night, true);
    assert.deepEqual(o.bells, [{ x: 100, y: 200, r: 40 }]);
    assert.equal(o.colors, undefined);

    const night = await hostFixture({ settings: { jellyfishNight: false }, saveData: true });
    night.render(116); night.render(132);
    assert.equal(night.spyAq.frames[0].night, false);
    assert.equal(night.spyAq.frames[0].lowPower, true);
});

test('皮肤没有 bells 方法（旧皮肤、替身）时宿主照常画鱼：钟罩是空数组，不抛错、不影响水母', async () => {
    // 变异检查：把守卫写成“皮肤存在就调用 bells()”时，没有 bells 的皮肤会让每一帧抛 TypeError，旧测试的间谍皮肤总带 bells，没人发现。
    const f = await hostFixture();
    delete f.spy.bells;
    assert.doesNotThrow(() => f.render(116));
    const isEmptyArray = value => Array.isArray(value) && value.length === 0;       // 宿主在 vm 里创建的数组与测试的 Array 不同源，deepEqual 会比原型
    assert.ok(isEmptyArray(f.spyAq.frames[0].bells), '没有钟罩可读时给空数组');
    assert.equal(f.spy.frames.length, 1, '水母照常画');
    f.spy.bells = 'not a function';
    assert.doesNotThrow(() => f.render(132));
    assert.ok(isEmptyArray(f.spyAq.frames[1].bells), 'bells 不是函数时同样给空数组');
});

test('水族馆自己停用（画法出错）后宿主不再调用它，水母不受影响', async () => {
    const f = await hostFixture();
    f.render(116);
    f.spyAq.active = false;
    f.render(132);
    f.render(148);
    assert.equal(f.spyAq.frames.length, 1);
    assert.equal(f.spy.frames.length, 3);
});

test('页面被隐藏或被工作台遮挡：不再调用鱼层；恢复后继续', async () => {
    const f = await hostFixture();
    f.render(116);
    f.experience.setSuspended(true);
    for (let i = 0; i < 10; i++) f.render(200 + i * 16);
    assert.equal(f.spyAq.frames.length, 1);
    f.experience.setSuspended(false);
    f.render(1000);
    assert.equal(f.spyAq.frames.length, 2);
});

// ---------- 抓取路由 ----------

test('只有鱼：悬停时光标变手；按下抓鱼；松手交给水族馆（不碰水母）；拖过则吞掉随后的 click', async () => {
    const f = await hostFixture();
    f.spyAq.hover = true;
    f.dispatch('pointermove', { clientX: 300, clientY: 300, buttons: 0 });
    assert.equal(htmlClass(f, 'jellyfish-grabbable'), true);
    assert.deepEqual(f.spy.hovers.at(-1), [300, 300], '先问水母');
    assert.deepEqual(f.spyAq.hovers.at(-1), [300, 300], '水母没命中再问鱼');

    f.spyAq.grabResult = true;
    const down = f.dispatch('pointerdown', { clientX: 300, clientY: 300 });
    assert.equal(down.defaultPrevented, true);
    assert.equal(f.experience.grab.kind, 'fish');
    assert.equal(htmlClass(f, 'jellyfish-grabbing'), true);
    assert.equal(htmlClass(f, 'jellyfish-grabbable'), false);
    assert.equal(f.experience.pointer.down, false, '不再当作背景玩法的按下');

    f.spyAq.dragged = true;
    f.dispatch('pointerup', { clientX: 700, clientY: 800, buttons: 0 });
    assert.deepEqual(f.spyAq.drops, [[700, 800]]);
    assert.equal(f.spy.drops.length, 0);
    assert.equal(f.experience.grab, null);
    assert.equal(htmlClass(f, 'jellyfish-grabbing'), false);
    const click = f.dispatch('click', { clientX: 700, clientY: 800 });
    assert.equal(click.defaultPrevented, true, '拖过之后的 click 被吞掉');
});

test('重叠时水母优先：水母抓到了就不再问鱼；松手交给水母', async () => {
    const f = await hostFixture();
    f.spy.grabResult = true;
    f.spyAq.grabResult = true;
    f.dispatch('pointerdown', { clientX: 400, clientY: 400 });
    assert.equal(f.experience.grab.kind, 'jelly');
    assert.equal(f.spyAq.grabs.length, 0, '水母已经抓住，鱼没有被问');
    f.dispatch('pointerup', { clientX: 400, clientY: 400, buttons: 0 });
    assert.equal(f.spy.drops.length, 1);
    assert.equal(f.spyAq.drops.length, 0);

    const hoverJelly = await hostFixture();
    hoverJelly.spy.hover = true;
    hoverJelly.spyAq.hover = true;
    hoverJelly.dispatch('pointermove', { clientX: 10, clientY: 10, buttons: 0 });
    assert.equal(hoverJelly.spyAq.hovers.length, 0, '悬停也是水母优先');
});

test('不抢任务条等非空白目标；非主键/非主指针不抓；水族馆关闭或页面隐藏时不抓鱼', async () => {
    const f = await hostFixture();
    f.spyAq.grabResult = true;
    const notBg = f.newElement();
    f.dispatch('pointerdown', { target: notBg, clientX: 5, clientY: 5 });
    f.dispatch('pointerdown', { button: 2, clientX: 5, clientY: 5 });
    f.dispatch('pointerdown', { isPrimary: false, clientX: 5, clientY: 5 });
    assert.equal(f.spyAq.grabs.length, 0);
    assert.equal(f.experience.grab, null);

    const off = await hostFixture({ settings: { aquariumFish: false } });
    off.spyAq.grabResult = true;
    off.dispatch('pointerdown', { clientX: 5, clientY: 5 });
    assert.equal(off.spyAq.grabs.length, 0);

    const hidden = await hostFixture();
    hidden.spyAq.grabResult = true;
    hidden.experience.setSuspended(true);
    hidden.dispatch('pointerdown', { clientX: 5, clientY: 5 });
    assert.equal(hidden.spyAq.grabs.length, 0);
});

test('水族馆开关是抓鱼的独立条件：即便水族馆对象还在运行，设置关着也不抓、不悬停', async () => {
    const f = await hostFixture();
    f.spyAq.grabResult = true;
    f.spyAq.hover = true;
    f.experience.settings.aquariumFish = false;            // 只改设置、不 applySettings：宿主自己也要拦住
    f.dispatch('pointermove', { clientX: 5, clientY: 5, buttons: 0 });
    f.dispatch('pointerdown', { clientX: 5, clientY: 5 });
    assert.equal(f.spyAq.hovers.length, 0);
    assert.equal(f.spyAq.grabs.length, 0);
    assert.equal(f.experience.grab, null);
});

test('关掉“水母任务名与抓取”不影响抓鱼（鱼不绑任务）；反过来关掉水族馆开关会放开正抓着的鱼', async () => {
    const f = await hostFixture({ settings: { jellyfishTasks: false } });
    f.spyAq.grabResult = true;
    f.dispatch('pointerdown', { clientX: 5, clientY: 5 });
    assert.equal(f.experience.grab.kind, 'fish');
    f.experience.settings.jellyfishTasks = true;
    f.experience.settings.jellyfishTasks = false;
    f.experience.applySettings();
    assert.equal(f.experience.grab?.kind, 'fish', '关水母抓取开关不放开正抓着的鱼');
    f.experience.settings.aquariumFish = false;
    f.experience.applySettings();
    assert.equal(f.experience.grab, null);
    assert.equal(f.spyAq.cancels, 1, '放开交给水族馆的 cancel，不会落网兜');
    assert.equal(f.spyAq.drops.length, 0);
});

test('Esc、失焦、指针取消、页面隐藏、在窗口外放开：放开鱼且不落网兜', async () => {
    const make = async () => { const f = await hostFixture(); f.spyAq.grabResult = true; f.dispatch('pointerdown', { clientX: 5, clientY: 5 }); assert.equal(f.experience.grab.kind, 'fish'); return f; };
    const esc = await make();
    esc.dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.spyAq.cancels, 1);
    assert.equal(esc.experience.grab, null);
    const blur = await make();
    blur.dispatchWindow('blur');
    assert.equal(blur.spyAq.cancels, 1);
    const cancel = await make();
    cancel.dispatch('pointercancel');
    assert.equal(cancel.spyAq.cancels, 1);
    const hide = await make();
    hide.experience.setSuspended(true);
    assert.equal(hide.spyAq.cancels, 1);
    const outside = await make();
    outside.spyAq.dragged = true;
    outside.dispatch('pointermove', { clientX: 9, clientY: 9, buttons: 0 });
    assert.equal(outside.spyAq.drops.length, 1, '在窗口外放开没有 pointerup：按放开处理');
    assert.equal(outside.spyAq.cancels, 0);
});

test('鱼与水母都不在指针下：背景玩法照常开始（不被吞掉）', async () => {
    const f = await hostFixture();
    f.experience.setActive(true);
    f.dispatch('pointerdown', { clientX: 50, clientY: 60 });
    assert.equal(f.experience.pointer.down, true);
    assert.equal(f.experience.grab, null);
});

// ---------- 真实皮肤 + 真实水族馆整链路 ----------

test('整链路：真实水族馆读到存储里的鱼，画在宿主画布上；真实水母提供钟罩位置；换皮肤后鱼停', async () => {
    const entries = [
        { id: 'a1', species: 'clown', addedAt: 1 },
        { id: 'a2', species: 'neon', addedAt: 2 },
        { id: 'a3', species: 'whaleshark', addedAt: 3 },
    ];
    const f = await hostFixture({ skin: 'real', aquarium: 'real', localData: { aquariumV1: { v: 1, fish: entries } } });
    await tick(); await tick();
    const aq = f.win.Aquarium;
    assert.equal(aq.isActive(), true);
    const bells = f.win.JellyfishSkin.bells();
    assert.ok(Array.isArray(bells));
    for (const b of bells) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && b.r > 0);
    for (let i = 0; i < 20; i++) f.render(116 + i * 16);
    assert.ok(aq.state().fish >= 7, `1 + 5 + 1 条鱼，实际 ${aq.state().fish}`);
    assert.ok((f.calls.get('fill') || 0) > 0, '鱼画在了宿主画布上');
    f.experience.settings.visualEffect = 'depth';
    f.experience.applySettings();
    assert.equal(aq.isActive(), false);
});

test('整链路：存储里没有鱼时鱼层一笔不画', async () => {
    const f = await hostFixture({ skin: 'real', aquarium: 'real' });
    await tick(); await tick();
    const before = f.calls.get('quadraticCurveTo') || 0;
    for (let i = 0; i < 5; i++) f.render(116 + i * 16);
    assert.equal(f.calls.get('quadraticCurveTo') || 0, before, '没有鱼：没有身体曲线');
});


const HAMMER = { aquariumV1: { v: 1, fish: [{ id: 'h1', species: 'hammer', addedAt: 1 }] } };

/** 真实水族馆里放一条静止、朝东的小锤头鲨在 (x, y)，返回它。skin 用间谍（永远抓不到水母），免得随机的水母恰好挡在鱼上。 */
async function fishAt(x, y, { aquarium = 'real' } = {}) {
    const f = await hostFixture({ skin: 'spy', aquarium, localData: HAMMER });
    await tick(); await tick();
    f.render(116);
    const fish = f.win.Aquarium._world().fish[0];
    Object.assign(fish, { x, y, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' });
    return { f, fish };
}

test('整链路：点一下真实的鱼 = 戳（涟漪画在宿主画布上、鱼窜开、不吞随后的 click）；拖过 6 px 不算戳', async () => {
    const { f, fish } = await fishAt(700, 400);
    const aq = f.win.Aquarium;
    assert.equal(aq._play(), null, '没戳之前没有玩法状态');
    const arcs = () => f.calls.get('arc') || 0;
    let before = arcs();
    f.render(132);
    const perFrame = arcs() - before;
    f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
    assert.equal(f.experience.grab.kind, 'fish');
    f.dispatch('pointerup', { clientX: 720, clientY: 400, buttons: 0 });
    assert.equal(f.experience.grab, null);
    assert.equal(f.experience.swallowClickUntil, 0, '点一下不吞随后的 click');
    assert.equal(aq._play().ripples.length, 1, '真实的玩法核心被调用了：出现一圈涟漪');
    assert.ok(Math.hypot(fish.vx, fish.vy) > 0, '被戳的鱼窜开');
    before = arcs();
    f.render(148);
    assert.ok(arcs() - before >= perFrame + 3, `涟漪的三道圈画在了宿主画布上：${arcs() - before} 对 ${perFrame}`);
    // 这个夹具里没有 DOM（没有网兜这个落点）：拖过 6 px 时鱼原样放回，既不算戳也不吞 click
    const drag = await fishAt(700, 400);
    drag.f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
    drag.f.dispatch('pointermove', { clientX: 760, clientY: 440, buttons: 1 });
    drag.f.render(132);
    assert.equal(drag.fish.held, null, '没有落点：原样放回');
    drag.f.dispatch('pointerup', { clientX: 760, clientY: 440, buttons: 0 });
    assert.equal(drag.f.win.Aquarium._play(), null, '拖过不是戳，按在前半身也没有拉尾记录');
    const Core = require('../js/aquarium-core.js');
    // 鱼是被拴着游的，不是纸片：放回时带着自己的速度（不是 0），上限是巡航速度的 GLIDE_MULT 倍；没有被戳由上一行“没有玩法状态”证明
    const glide = Core.cruiseSpeed(drag.f.win.Aquarium._world(), drag.fish) * Core.PARAMS.GLIDE_MULT;
    assert.ok(Math.hypot(drag.fish.vx, drag.fish.vy) <= glide + 1e-6, `放回时速度 ${Math.hypot(drag.fish.vx, drag.fish.vy)} 不超过滑行上限 ${glide}`);
});

test('整链路：按在后半身 = 拉尾抓取接通宿主指针；没有落点时拖过 6 px 就原样放回，不留拉尾状态', async () => {
    const { f, fish } = await fishAt(700, 400);
    const aq = f.win.Aquarium;
    f.dispatch('pointerdown', { clientX: 680, clientY: 400, buttons: 1 });
    assert.equal(fish.held.tail, true, '后半身：拉尾抓取');
    assert.equal(aq._play().pulls.size, 1, '拉尾记录已建立');
    f.dispatch('pointermove', { clientX: 740, clientY: 440, buttons: 1 });
    f.render(132);
    assert.equal(fish.held, null, '没有落点：放回');
    assert.equal(fish.state, 'alive');
    assert.equal(aq._play().pulls.size, 0, '拉尾记录同时清掉，没有残留的弹簧');
    f.dispatch('pointerup', { clientX: 740, clientY: 440, buttons: 0 });
    assert.equal(f.experience.grab, null);
    for (let i = 0; i < 10; i++) f.render(148 + i * 16);
    assert.equal(aq.state().failed, false);
    assert.equal(aq.state().playFailed, false);
});

test('整链路：玩法脚本缺席（加载失败）时鱼层照常工作，点一下鱼与原来一样', async () => {
    const { f, fish } = await fishAt(700, 400, { aquarium: 'real-noplay' });
    const aq = f.win.Aquarium;
    assert.equal(aq.isActive(), true);
    f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
    assert.equal(f.experience.grab.kind, 'fish');
    f.dispatch('pointerup', { clientX: 720, clientY: 400, buttons: 0 });
    assert.equal(aq._play(), null);
    assert.equal(fish.vx, 0);
    assert.equal(fish.vy, 0);
    f.dispatch('pointerdown', { clientX: 680, clientY: 400, buttons: 1 });
    assert.ok(!fish.held.tail, '没有玩法就没有拉尾');
    for (let i = 0; i < 5; i++) f.render(132 + i * 16);
    assert.equal(aq.state().failed, false);
    assert.equal(aq.state().playFailed, false);
});

// ---------- 海水层（js/aquarium-water.js）与宿主的接线 ----------

test('海水层：选水母皮肤且设置开着（默认）才启动；关开关、换皮肤、减少动态效果都会停；脚本缺席时宿主照常', async () => {
    const f = await hostFixture({ water: 'spy' });
    assert.equal(f.spyWater.starts, 1);
    assert.equal(f.spyWater.active, true);

    f.experience.settings.aquariumWater = false;
    f.experience.applySettings();
    assert.equal(f.spyWater.active, false, '关掉“海水效果”：只停水体，鱼和水母照常');
    assert.equal(f.spy.active, true);
    assert.equal(f.spyAq.active, true);
    f.experience.settings.aquariumWater = true;
    f.experience.applySettings();
    assert.equal(f.spyWater.active, true, '重新打开又启动');

    f.experience.settings.visualEffect = 'depth';
    f.experience.applySettings();
    assert.equal(f.spyWater.active, false, '换成别的皮肤：海水层跟着停');

    const off = await hostFixture({ water: 'spy', settings: { aquariumWater: false } });
    assert.equal(off.spyWater.starts, 0, '设置里关着：从一开始就不启动，也就没有画布与 WebGL');
    const noFish = await hostFixture({ water: 'spy', settings: { aquariumFish: false } });
    assert.equal(noFish.spyWater.starts, 1, '海水与小鱼开关互不影响');
    assert.equal(noFish.spyAq.starts, 0);
    const reduce = await hostFixture({ water: 'spy', reduceMotion: true });
    assert.equal(reduce.spyWater.starts, 0, '减少动态效果下水母视为没选皮肤，海水层也不出现');
    const other = await hostFixture({ water: 'spy', effect: 'liquid' });
    assert.equal(other.spyWater.starts, 0, '没选水母皮肤：不启动');

    const absent = await hostFixture({ water: 'none' });
    absent.render(116);
    absent.render(132);
    assert.equal(absent.spy.frames.length, 2, '海水层脚本缺席：水母照常画');
    assert.equal(absent.spyAq.frames.length, 2);
});

test('海水层：每帧先于鱼与水母；拿到页面尺寸、宿主时间戳、强度、省流量与夜晚开关', async () => {
    const order = [];
    const f = await hostFixture({ water: 'spy', order });
    f.render(116);
    assert.deepEqual(order, ['water', 'fish', 'jelly'], '水体最先（最下面），再是鱼，最后水母');
    const o = f.spyWater.frames[0];
    assert.equal(o.width, 1440);
    assert.equal(o.height, 900);
    assert.equal(o.now, 116, '用宿主 RAF 的时间戳，节流与着色器时间都基于它');
    assert.equal(o.amount, f.experience.settings.intensity / 100);
    assert.equal(o.lowPower, false);
    assert.equal(o.night, true);
    assert.equal(o.ctx, undefined, '海水层有自己的画布，不拿宿主的 2D 上下文');

    const lowNight = await hostFixture({ water: 'spy', settings: { jellyfishNight: false }, saveData: true });
    lowNight.render(116); lowNight.render(132);      // 省流量时宿主隔帧绘制，与鱼层的同类用例一样多画一帧
    assert.equal(lowNight.spyWater.frames[0].night, false);
    assert.equal(lowNight.spyWater.frames[0].lowPower, true);
});

test('海水层：把此刻的岸线（水线能到的最高处，占页面高度的比例、从页面底边往上量）交给鱼层的 shore 选项；水体没在显示、没有 shore 方法或返回 null 时为 null，鱼不避岸线', async () => {
    const f = await hostFixture({ water: 'spy' });
    f.spyWater.shoreValue = 0.21;
    f.render(116);
    assert.equal(f.spyWater.shoreCalls.at(-1), 116, '用宿主 RAF 的时间戳问岸线');
    assert.equal(f.spyAq.frames.at(-1).shore, 0.21);
    assert.equal('surface' in f.spyAq.frames.at(-1), false, '旧的 surface 选项已经去掉');
    f.spyWater.shoreValue = null;
    f.render(132);
    assert.equal(f.spyAq.frames.at(-1).shore, null, '水体还没画出来：null');
    f.spyWater.shoreValue = 0.3;
    f.spyWater.active = false;
    f.render(148);
    assert.equal(f.spyAq.frames.at(-1).shore, null, '水体停用后不再问岸线，鱼不避岸线');
    const noMethod = await hostFixture({ water: 'spy' });
    delete noMethod.spyWater.shore;
    noMethod.render(116);
    assert.equal(noMethod.spyAq.frames.at(-1).shore, null, '旧版海水层没有 shore 方法：不抛错');
    const none = await hostFixture({ water: 'none' });
    none.render(116);
    assert.equal(none.spyAq.frames.at(-1).shore, null, '海水层脚本缺席：null');
});

test('海水层：自己停用（失败）后宿主不再调用；页面被隐藏或工作台遮挡时不调用，恢复后继续；水母不受影响', async () => {
    const f = await hostFixture({ water: 'spy' });
    f.render(116);
    f.spyWater.active = false;
    f.render(132);
    f.render(148);
    assert.equal(f.spyWater.frames.length, 1);
    assert.equal(f.spy.frames.length, 3);

    const g = await hostFixture({ water: 'spy' });
    g.render(116);
    g.experience.setSuspended(true);
    for (let i = 0; i < 10; i++) g.render(200 + i * 16);
    assert.equal(g.spyWater.frames.length, 1);
    g.experience.setSuspended(false);
    g.render(1000);
    assert.equal(g.spyWater.frames.length, 2);
});

test('海水层：设置规范化——只有明确 false 才关，缺省与怪值都开', async () => {
    for (const [value, expected] of [[undefined, true], [true, true], [false, false], [0, true], [null, true], ['false', true]]) {
        const f = await hostFixture({ water: 'spy', settings: { aquariumWater: value } });
        assert.equal(f.experience.settings.aquariumWater, expected, String(value));
        assert.equal(f.spyWater.starts, expected ? 1 : 0, String(value));
    }
});

// ---------- 写实动物（js/aquarium-real.js）与宿主的接线 ----------

test('写实动物：宿主把设置传给鱼层——缺省与怪值都开，只有明确 false 才关；每一帧都传', async () => {
    for (const [value, expected] of [[undefined, true], [true, true], [false, false], [0, true], [null, true], ['false', true], ['', true]]) {
        const f = await hostFixture({ settings: { aquariumRealistic: value } });
        f.render(116);
        f.render(132);
        assert.equal(f.experience.settings.aquariumRealistic, expected, String(value));
        assert.ok(f.spyAq.frames.length >= 1, String(value));
        for (const frame of f.spyAq.frames) assert.equal(frame.realistic, expected, `${String(value)}：每一帧都带着设置`);
    }
});

test('写实动物：改设置立即生效（applySettings 之后下一帧带新值），不需要重启鱼层', async () => {
    const f = await hostFixture();
    f.render(116);
    assert.equal(f.spyAq.frames.at(-1).realistic, true);
    f.experience.settings.aquariumRealistic = false;
    f.experience.applySettings();
    f.render(132);
    assert.equal(f.spyAq.frames.at(-1).realistic, false);
    assert.equal(f.spyAq.stops, 0, '只是换画法，鱼层没有停过（start 对已运行的鱼层本来就是空操作）');
    assert.equal(f.spyAq.active, true);
});

test('写实动物：鱼层脚本里没有 AquariumReal（加载失败）时，真实水族馆照常画卡通鱼，不抛错', async () => {
    const f = await hostFixture({ skin: 'real', aquarium: 'real', localData: { aquariumV1: { v: 1, fish: [{ id: 'c1', species: 'clown', addedAt: 1 }, { id: 'c2', species: 'hammer', addedAt: 2 }] } } });
    await tick(); await tick();
    for (let i = 0; i < 12; i++) f.render(116 + i * 16);
    assert.equal(f.win.Aquarium.state().failed, false);
    assert.ok((f.calls.get('fill') || 0) > 0);
});

// ---------- 大鱼吃小鱼（js/aquarium-predation-core.js）与宿主的接线 ----------

test('大鱼吃小鱼：宿主把设置传给鱼层——缺省与怪值都开，只有明确 false 才关；每一帧都传', async () => {
    for (const [value, expected] of [[undefined, true], [true, true], [false, false], [0, true], [null, true], ['false', true], ['', true]]) {
        const f = await hostFixture({ settings: { aquariumPredation: value } });
        f.render(116);
        f.render(132);
        assert.equal(f.experience.settings.aquariumPredation, expected, String(value));
        assert.ok(f.spyAq.frames.length >= 1, String(value));
        for (const frame of f.spyAq.frames) assert.equal(frame.predation, expected, `${String(value)}：每一帧都带着设置`);
    }
});

test('大鱼吃小鱼：改设置立即生效（applySettings 之后下一帧带新值），不需要重启鱼层', async () => {
    const f = await hostFixture();
    f.render(116);
    assert.equal(f.spyAq.frames.at(-1).predation, true);
    f.experience.settings.aquariumPredation = false;
    f.experience.applySettings();
    f.render(132);
    assert.equal(f.spyAq.frames.at(-1).predation, false);
    assert.equal(f.spyAq.stops, 0, '只是开关捕食，鱼层没有停过');
    assert.equal(f.spyAq.active, true);
});

test('大鱼吃小鱼：真实整链路——默认开（有捕食状态，鲨鱼已登记为捕食者）；设置里关掉后状态丢弃；省流量模式不开；捕食脚本缺席时照常画', async () => {
    const stored = { aquariumV1: { v: 1, fish: [{ id: 'h1', species: 'hammer', addedAt: 1 }, { id: 'c1', species: 'clown', addedAt: 2 }, { id: 'n1', species: 'neon', addedAt: 3 }] } };
    const on = await hostFixture({ skin: 'real', aquarium: 'real', localData: stored });
    await tick(); await tick();
    for (let i = 0; i < 40; i++) on.render(116 + i * 16);
    assert.ok(on.win.Aquarium._pred(), '默认开：有捕食状态');
    assert.equal(on.win.Aquarium._pred().hunters.size, 1, '小锤头鲨登记为捕食者（小丑鱼与霓虹灯鱼不是）');
    assert.equal(on.win.Aquarium.state().predationFailed, false);
    on.experience.settings.aquariumPredation = false;
    on.experience.applySettings();
    on.render(116 + 41 * 16);
    assert.equal(on.win.Aquarium._pred(), null, '关掉：状态丢弃');

    const off = await hostFixture({ skin: 'real', aquarium: 'real', settings: { aquariumPredation: false }, localData: stored });
    await tick(); await tick();
    for (let i = 0; i < 40; i++) off.render(116 + i * 16);
    assert.equal(off.win.Aquarium._pred(), null, '设置关着：从来没有捕食状态');

    const saving = await hostFixture({ skin: 'real', aquarium: 'real', saveData: true, localData: stored });
    await tick(); await tick();
    for (let i = 0; i < 40; i++) saving.render(116 + i * 16);
    assert.equal(saving.win.Aquarium._pred(), null, '省流量模式不捕食');
    assert.equal(saving.win.Aquarium.state().predationFailed, false);

    const missing = await hostFixture({ skin: 'real', aquarium: 'real-nopred', localData: stored });
    await tick(); await tick();
    for (let i = 0; i < 40; i++) missing.render(116 + i * 16);
    assert.equal(missing.win.Aquarium.state().failed, false);
    assert.equal(missing.win.Aquarium.state().predationFailed, false);
    assert.equal(missing.win.Aquarium._pred(), null, '没有捕食脚本：只是没有捕食');
    assert.ok((missing.calls.get('fill') || 0) > 0, '鱼照常画');
});

// ---------- 个体大小差异（aquarium-core.js 的 sizeOf）与宿主的接线 ----------

test('个体大小：宿主把设置传给鱼层——缺省与怪值都开，只有明确 false 才关；每一帧都传', async () => {
    for (const [value, expected] of [[undefined, true], [true, true], [false, false], [0, true], [null, true], ['false', true], ['', true]]) {
        const f = await hostFixture({ settings: { aquariumSizes: value } });
        f.render(116);
        f.render(132);
        assert.equal(f.experience.settings.aquariumSizes, expected, String(value));
        assert.ok(f.spyAq.frames.length >= 1, String(value));
        for (const frame of f.spyAq.frames) assert.equal(frame.sizes, expected, `${String(value)}：每一帧都带着设置`);
    }
});

test('个体大小：改设置立即生效（applySettings 之后下一帧带新值），不需要重启鱼层', async () => {
    const f = await hostFixture();
    f.render(116);
    assert.equal(f.spyAq.frames.at(-1).sizes, true);
    f.experience.settings.aquariumSizes = false;
    f.experience.applySettings();
    f.render(132);
    assert.equal(f.spyAq.frames.at(-1).sizes, false);
    assert.equal(f.spyAq.stops, 0, '只是开关大小差异，鱼层没有停过');
    assert.equal(f.spyAq.active, true);
});

test('个体大小：真实整链路——默认开（小鱼大小各不相同、大鱼为 1）；设置里关掉后下一帧全部回到标准体长；名单与存储不变', async () => {
    const stored = { aquariumV1: { v: 1, fish: [{ id: 'h1', species: 'hammer', addedAt: 1 }, { id: 'c1', species: 'clown', addedAt: 2 }, { id: 'n1', species: 'neon', addedAt: 3 }] } };
    const on = await hostFixture({ skin: 'real', aquarium: 'real', localData: stored });
    await tick(); await tick();
    for (let i = 0; i < 6; i++) on.render(116 + i * 16);
    const before = on.win.Aquarium._world();
    assert.equal(before.sizes, true, '默认开');
    assert.equal(on.win.Aquarium.state().sizes, true);
    const neon = before.fish.filter(f => f.species === 'neon');
    assert.equal(neon.length, 5);
    assert.ok(new Set(neon.map(f => f.size)).size >= 4, '同一群里每条大小不同');
    assert.equal(before.fish.find(f => f.species === 'hammer').size, 1, '小锤头鲨按真实比例');
    assert.notEqual(before.fish.find(f => f.species === 'clown').size, 1, '这个小丑鱼条目的大小不是正好 1（由条目 id 决定）');
    on.experience.settings.aquariumSizes = false;
    on.experience.applySettings();
    on.render(116 + 7 * 16);
    const after = on.win.Aquarium._world();
    assert.notEqual(after, before, '切换重建世界');
    assert.equal(after.sizes, false);
    assert.ok(after.fish.every(f => f.size === 1), '关掉：全部回到标准体长');
    assert.equal(on.win.Aquarium.state().sizes, false);
    assert.deepEqual(Array.from(on.win.Aquarium.entries(), e => e.id), ['h1', 'c1', 'n1'], '名单不变（Array.from 转成本测试的 Array，跨 vm 上下文比较原型会不同）');
});

// ---------- 静态契约 ----------

test('源码合同：鱼层不自建 RAF/定时器/画布，不 innerHTML/eval/联网，不碰任务/备忘录存储；只写 aquariumV1', () => {
    const aq = read('js/aquarium.js');
    const core = read('js/aquarium-core.js');
    const playCore = read('js/aquarium-play-core.js');
    const playUi = read('js/aquarium-play.js');
    const predCore = read('js/aquarium-predation-core.js');
    for (const [name, text] of [['aquarium.js', aq], ['aquarium-core.js', core], ['aquarium-play-core.js', playCore], ['aquarium-play.js', playUi], ['aquarium-predation-core.js', predCore]]) {
        assert.doesNotMatch(text, /requestAnimationFrame|setInterval|innerHTML|insertAdjacentHTML|\beval\(|new Function|fetch\(|XMLHttpRequest|sendMessage|chrome\.storage\.sync|document\.createElement\(.canvas/, name);
        assert.doesNotMatch(text, /\bmemos\b|completeTaskById|memoManager|TaskCrumple/, `${name} 不读写任务数据、不碰纸篓`);
    }
    const code = core.replace(/\/\/.*$/gm, '').replace(/^\(function \(root, factory\)[\s\S]*?\}\)\(typeof window[^\n]*\n/, '');   // 去掉注释与 UMD 外壳
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|\bDate\b|chrome\./, '核心是纯逻辑：不碰 DOM、时钟与 chrome');
    assert.equal((code.match(/Math\.random/g) || []).length, 1, '随机源只作为 createWorld 的默认参数出现，其余全部走 world.random');
    assert.match(code, /random = Math\.random/);
    const playCode = playCore.replace(/\/\/.*$/gm, '').replace(/^\(function \(root, factory\)[\s\S]*?\}\)\(typeof window[^\n]*\n/, '');
    assert.doesNotMatch(playCode, /\bdocument\b|\bwindow\b|\bDate\b|chrome\.|Math\.random/, '玩法核心同样是纯逻辑：不碰 DOM、时钟、chrome，随机数全部走 world.random');
    const predCode = predCore.replace(/\/\/.*$/gm, '').replace(/^\(function \(root, factory\)[\s\S]*?\}\)\(typeof window[^\n]*\n/, '');
    assert.doesNotMatch(predCode, /\bdocument\b|\bwindow\b|\bDate\b|chrome\.|Math\.random/, '捕食核心同样是纯逻辑：不碰 DOM、时钟、chrome，随机数来自 create 时从 world.random 取的种子');
    assert.doesNotMatch(playUi, /chrome\.|localStorage|sessionStorage|indexedDB|Math\.random/, '玩法的画法与按钮不碰任何存储；饲料位置等随机量来自玩法核心');
    assert.equal((aq.match(/area\.set\(/g) || []).length, 1, '只有一处写存储');
    assert.doesNotMatch(aq, /area\.(remove|clear)\(/, '不删除、不清空存储');
    assert.match(aq, /STORAGE_KEY = 'aquariumV1'/);
});

test('解耦：水母代码不认识水族馆（鱼读水母，水母不读鱼）；宿主只多出设置、鱼层调用与抓取路由', () => {
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(read(file), /[Aa]quarium|\bfish\b/i, file);
    const skin = read('js/jellyfish.js');
    assert.match(skin, /bells: \(\) => \(world \? world\.jellies\.map\(j => \(\{ x: j\.x, y: j\.y, r: j\.r \}\)\) : \[\]\)/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumFish: source\.aquariumFish !== false/);
    assert.match(host, /aquariumFish: true,/);
    assert.match(host, /aquariumWater: source\.aquariumWater !== false/);
    assert.match(host, /aquariumWater: true,/);
    for (const file of ['js/aquarium.js', 'js/aquarium-core.js', 'js/aquarium-play.js', 'js/aquarium-play-core.js', 'js/aquarium-predation-core.js']) assert.doesNotMatch(read(file), /AquariumWater|aquarium-water/, `${file}：鱼层不认识海水层，二者只通过宿主各自调用`);
    for (const file of ['js/aquarium-water.js', 'js/aquarium-water-core.js', 'js/aquarium-water-shader.js']) assert.doesNotMatch(read(file), /window\.Aquarium\b|JellyfishSkin|JellyfishCore\.(?!nightAmount)/, `${file}：海水层只读水母的夜晚曲线，不读鱼和水母的状态`);
});

test('index.html：脚本顺序与版本钉子（核心、玩法核心、玩法画法先于控制器，都在水母之后宿主之前）、样式已链接', () => {
    const html = read('index.html');
    const idx = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(idx('js/jellyfish.js?v=6') < idx('js/aquarium-core.js?v=8'));
    assert.ok(idx('js/aquarium-core.js?v=8') < idx('js/aquarium-play-core.js?v=3'));
    assert.ok(idx('js/aquarium-play-core.js?v=3') < idx('js/aquarium-play.js?v=1'));
    assert.ok(idx('js/aquarium-play.js?v=1') < idx('js/aquarium.js?v=9'));
    // 捕食核心依赖核心与玩法核心（用它的嘴位置与泡），先于控制器
    assert.ok(idx('js/aquarium-play-core.js?v=3') < idx('js/aquarium-predation-core.js?v=1'));
    assert.ok(idx('js/aquarium-predation-core.js?v=1') < idx('js/aquarium.js?v=9'));
    // 水流/海洋雪与光束：纯逻辑先于画法，画法先于控制器；都在捕食之后、写实之前
    assert.ok(idx('js/aquarium-predation-core.js?v=1') < idx('js/aquarium-flow-core.js?v=1'));
    assert.ok(idx('js/aquarium-flow-core.js?v=1') < idx('js/aquarium-light-core.js?v=1'));
    assert.ok(idx('js/aquarium-light-core.js?v=1') < idx('js/aquarium-ambient.js?v=1'));
    assert.ok(idx('js/aquarium-ambient.js?v=1') < idx('js/aquarium.js?v=9'));
    assert.ok(idx('js/aquarium-ambient.js?v=1') < idx('js/aquarium-sound-core.js?v=1'));
    assert.ok(idx('js/aquarium-sound-core.js?v=1') < idx('js/aquarium-sound.js?v=1'));
    assert.ok(idx('js/aquarium-sound.js?v=1') < idx('js/background-experience.js?v=21'));
    assert.ok(idx('js/aquarium.js?v=9') < idx('js/background-experience.js?v=21'));
    // 写实动物：路径工具 → 骨架求值 → 画笔 → 骨架数据 → 写实画法，全部先于控制器
    assert.ok(idx('js/jelly-species-shapes.js?v=4') < idx('js/marine-rig.js?v=1'));
    assert.ok(idx('js/marine-rig.js?v=1') < idx('js/marine-rig-canvas.js?v=2'));
    assert.ok(idx('js/marine-rig-canvas.js?v=2') < idx('js/marine-rig-data.js?v=1'));
    assert.ok(idx('js/marine-rig-data.js?v=1') < idx('js/aquarium-real.js?v=4'));
    assert.ok(idx('js/aquarium-yaw.js?v=1') < idx('js/aquarium-real.js?v=4'), '侧视转身的伪 3D 投影是纯几何、没有依赖，先于写实画法');
    assert.ok(idx('js/aquarium-real.js?v=4') < idx('js/aquarium.js?v=9'));
    assert.ok(idx('js/aquarium-core.js?v=8') < idx('js/aquarium-real.js?v=4'), '写实画法按核心的物种表工作，核心先加载');
    idx('css/aquarium.css?v=7');
    for (const file of ['css/aquarium.css', 'js/aquarium-play-core.js', 'js/aquarium-play.js', 'js/aquarium-predation-core.js', 'js/aquarium-yaw.js', 'js/aquarium-flow-core.js', 'js/aquarium-light-core.js', 'js/aquarium-ambient.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('设置页：有“写实动物”开关，默认开，保存键 aquariumRealistic，文案如实写明范围；鱼名单里有海龟', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumRealistic" checked/);
    const found = /<span class="sp-field-label">写实动物<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(found, '开关的标签是“写实动物”');
    for (const name of ['小锤头鲨', '蝠鲼', '海龟', '鲸鲨']) assert.ok(found[1].includes(name), `说明里要列出 ${name}`);
    assert.match(found[1], /关掉|关闭/, '说明里写了关掉会怎样');
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumRealistic: true,/);
    assert.match(page, /aquariumRealistic: stored\.aquariumRealistic !== false/);
    assert.match(page, /\['set-bgAquariumRealistic', 'aquariumRealistic', element => element\.checked\]/);
    assert.match(page, /aquariumRealistic\.checked = bgExperienceSettings\.aquariumRealistic/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumRealistic: source\.aquariumRealistic !== false/);
    assert.match(host, /aquariumRealistic: true,/);
    assert.match(host, /realistic: this\.settings\.aquariumRealistic/);
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(read(file), /aquariumRealistic|AquariumReal|MarineRig/, `${file} 不认识写实动物`);
});

test('设置页：有“大鱼吃小鱼”开关，默认开，保存键 aquariumPredation，文案如实写明谁吃谁、多久一次、怎么补回、什么不参与；宿主三处与设置页四处都接上', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumPredation" checked/);
    const found = /<span class="sp-field-label">大鱼吃小鱼<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(found, '开关的标签是“大鱼吃小鱼”');
    const hint = found[1];
    for (const name of ['小锤头鲨', '霓虹灯鱼', '蓝吊', '小丑鱼', '神仙鱼']) assert.ok(hint.includes(name), `说明里要列出 ${name}`);
    for (const name of ['河豚', '海龟', '蝠鲼', '鲸鲨']) assert.ok(hint.includes(name), `说明里要写明 ${name} 不参与`);
    assert.match(hint, /水母永远不会被吃/);
    assert.match(hint, /省流量模式下不会捕食/);
    assert.match(hint, /两三分钟/);
    assert.match(hint, /25 秒/);
    assert.match(hint, /75 秒/);
    assert.match(hint, /刷新页面也会全部恢复/);
    assert.match(hint, /不读也不写任何数据/);
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumPredation: true,/);
    assert.match(page, /aquariumPredation: stored\.aquariumPredation !== false/);
    assert.match(page, /\['set-bgAquariumPredation', 'aquariumPredation', element => element\.checked\]/);
    assert.match(page, /aquariumPredation\.checked = bgExperienceSettings\.aquariumPredation/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumPredation: source\.aquariumPredation !== false/);
    assert.match(host, /aquariumPredation: true,/);
    assert.match(host, /predation: this\.settings\.aquariumPredation/);
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(read(file), /aquariumPredation|AquariumPredation|predation/i, `${file} 不认识捕食`);
});

test('设置页：有“水流与海洋雪”“水下光束”开关，默认关，只有明确 true 才开；宿主与设置页四处都接上', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumFlow"/);
    assert.doesNotMatch(html, /id="set-bgAquariumFlow" checked/, '默认关');
    assert.match(html, /id="set-bgAquariumRays"/);
    assert.doesNotMatch(html, /id="set-bgAquariumRays" checked/, '默认关');
    const flowHint = /<span class="sp-field-label">水流与海洋雪<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    const raysHint = /<span class="sp-field-label">水下光束<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(flowHint && raysHint);
    assert.match(flowHint[1], /不遮住壁纸/);
    assert.match(flowHint[1], /省流量模式下不显示/);
    assert.match(flowHint[1], /默认关闭/);
    assert.match(raysHint[1], /先失去红色/);
    assert.match(raysHint[1], /默认关闭/);
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumFlow: false,/);
    assert.match(page, /aquariumRays: false,/);
    assert.match(page, /aquariumFlow: stored\.aquariumFlow === true/);
    assert.match(page, /aquariumRays: stored\.aquariumRays === true/);
    assert.match(page, /\['set-bgAquariumFlow', 'aquariumFlow', element => element\.checked\]/);
    assert.match(page, /\['set-bgAquariumRays', 'aquariumRays', element => element\.checked\]/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumFlow: source\.aquariumFlow === true/);
    assert.match(host, /aquariumRays: source\.aquariumRays === true/);
    assert.match(host, /aquariumFlow: false,/);
    assert.match(host, /aquariumRays: false,/);
    assert.match(host, /flow: this\.settings\.aquariumFlow/);
    assert.match(host, /rays: this\.settings\.aquariumRays/);
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(read(file), /aquariumFlow|aquariumRays|AquariumFlow|AquariumLight|AquariumAmbient/, `${file} 不认识氛围层`);
});

test('设置页：有“水下环境音”开关，默认关；宿主接上；须用户手势；脚本已挂', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumSound"/);
    assert.doesNotMatch(html, /id="set-bgAquariumSound" checked/, '默认关');
    const hint = /<span class="sp-field-label">水下环境音<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(hint);
    assert.match(hint[1], /点一下才会响/);
    assert.match(hint[1], /省流量模式下不响/);
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumSound: false,/);
    assert.match(page, /aquariumSound: stored\.aquariumSound === true/);
    assert.match(page, /\['set-bgAquariumSound', 'aquariumSound', element => element\.checked\]/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumSound: source\.aquariumSound === true/);
    assert.match(host, /aquariumSound: false,/);
    assert.match(host, /syncAquariumSound/);
    const idx = read('index.html');
    assert.ok(idx.includes('js/aquarium-sound-core.js?v=1'));
    assert.ok(idx.includes('js/aquarium-sound.js?v=1'));
    assert.ok(idx.indexOf('js/aquarium-sound-core.js?v=1') < idx.indexOf('js/aquarium-sound.js?v=1'));
    assert.ok(idx.indexOf('js/aquarium-sound.js?v=1') < idx.indexOf('js/background-experience.js?v=21'));
});

test('设置页：有水族馆开关，默认开，保存键 aquariumFish，脚本版本已更新', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumFish" checked/);
    assert.ok(html.includes('js/settings-page.js?v=20'));
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumFish: true,/);
    assert.match(page, /aquariumFish: stored\.aquariumFish !== false/);
    assert.match(page, /\['set-bgAquariumFish', 'aquariumFish', element => element\.checked\]/);
});

test('设置页文案：视觉风格叫“水族馆”（取值仍是 jellyfish），说明里不再出现“深海水母”；小鱼的名字与数字跟鱼种表和上限一致，没有旧叫法', () => {
    const Core = require('../js/aquarium-core.js');
    const html = read('settings.html');
    assert.match(html, /<option value="jellyfish">水族馆<\/option>/);
    assert.doesNotMatch(html, /深海水母/, '用户看得到的文案里不再叫深海水母');
    const style = html.slice(html.indexOf('v2 视觉风格'), html.indexOf('</select>', html.indexOf('id="set-bgVisualEffect"')));
    assert.match(style, /“水族馆”：/);
    assert.match(style, /小鱼/, '视觉风格的说明提到可以放入小鱼');
    const found = /<span class="sp-field-label">水族馆小鱼<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(found, '小鱼开关的标签是“水族馆小鱼”');
    const hint = found[1];
    for (const spec of Core.SPECIES) assert.ok(hint.includes(spec.name), `说明里要有 ${spec.name}`);
    assert.doesNotMatch(hint, /霓虹脂鲤/);
    assert.doesNotMatch(hint, /(?<!小)锤头鲨/, '旧叫法“锤头鲨”应是“小锤头鲨”');
    const P = Core.PARAMS;
    assert.ok(hint.includes(`最多 ${P.MAX_ENTRIES} 个`), '写明条目上限');
    assert.ok(hint.includes(`省流量模式 ${P.MAX_ENTRIES_LOW} 个`), '写明省流量上限');
    assert.ok(hint.includes(`大型鱼最多 ${P.MAX_LARGE} 条`), '写明大型鱼上限');
    assert.match(hint, /#1/, '说明列表里同种多个会编号');
    assert.match(hint, /选了“水族馆”时/);
    assert.match(hint, /点一下鱼.*戳/, '说明里写了怎么戳');
    assert.match(hint, /后半身.*拉/, '说明里写了拉鱼尾');
    assert.match(hint, /喂食/, '说明里写了喂食');
    assert.match(hint, /不保存/, '说明里写了这些互动不保存');
});

test('样式：托盘、面板、网兜类名与源码里的类名一致；网兜不接收事件', () => {
    const css = read('css/aquarium.css');
    const aq = read('js/aquarium.js') + read('js/aquarium-play.js');
    for (const cls of ['aq-ui', 'aq-toggle', 'aq-panel', 'aq-species', 'aq-list', 'aq-item', 'aq-catch', 'aq-status', 'aq-net', 'aq-net-on', 'aq-net-near', 'aq-empty', 'aq-capacity', 'aq-reason', 'aq-item-meta', 'aq-feed-row', 'aq-feed', 'aq-feed-hint', 'aq-feed-ghost']) {
        assert.ok(css.includes(`.${cls}`), `css 缺 .${cls}`);
        assert.ok(aq.includes(cls), `源码缺 ${cls}`);
    }
    assert.match(css, /\.aq-net \{[^}]*pointer-events: none/);
    assert.match(css, /\.aq-panel\[hidden\] \{ display: none; \}/);
    // 原因行没有内容时用 hidden 属性藏起来。这条规则现在对显示没有影响（.aq-reason 没写 display），只是防线：以后谁给 .aq-reason 加了 display，空的原因框就会一直露着
    assert.match(css, /\.aq-reason\[hidden\] \{ display: none; \}/);
    assert.match(css, /\.aq-feed-row\[hidden\] \{ display: none; \}/, '玩法停用时收起的提示行真的会消失');
});

test('样式：喂食按钮可拖（touch-action: none）、禁用有样式；拖出去的饲料团不接收事件且比托盘高', () => {
    const css = read('css/aquarium.css');
    const rule = selector => { const start = css.indexOf(`${selector} {`); assert.ok(start >= 0, `缺 ${selector}`); return css.slice(start, css.indexOf('}', start)); };
    assert.match(rule('.aq-feed'), /touch-action: none/);
    assert.match(css, /\.aq-feed:disabled \{[^}]*opacity/);
    const ghost = rule('.aq-feed-ghost');
    assert.match(ghost, /pointer-events: none/);
    assert.match(ghost, /position: fixed/);
    const ghostZ = Number(/z-index: (\d+)/.exec(ghost)[1]);
    const trayZ = Number(/z-index: (\d+)/.exec(rule('.aq-ui'))[1]);
    assert.ok(ghostZ > trayZ, `饲料团（${ghostZ}）要盖在托盘（${trayZ}）上`);
    assert.match(css, /html\.reduce-motion[^{]*\.aq-feed[^{]*\{ transition: none; \}/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.aq-net, \.aq-toggle, \.aq-feed \{ transition: none; \}/);
});

test('样式：网兜不遮挡被拖着的鱼——没有磨砂模糊、实心底色几乎透明、网线不粗，提示文字单独成胶囊浮在网兜上方', () => {
    const css = read('css/aquarium.css');
    const block = selector => {
        const start = css.indexOf(`${selector} {`);
        assert.ok(start >= 0, `缺 ${selector}`);
        return css.slice(start, css.indexOf('}', start));
    };
    const GRADIENT = /repeating-linear-gradient\((?:[^()]|\([^()]*\))*\)/g;
    const alphas = text => [...text.matchAll(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(\.?\d*\.?\d+)\s*\)/g)].map(m => Number(m[1]));
    for (const selector of ['.aq-net', '.aq-net.aq-net-near']) {
        const rule = block(selector);
        assert.doesNotMatch(rule, /backdrop-filter/, `${selector} 不能有磨砂模糊：鱼画在网兜下面的画布上，模糊会让被拖着的鱼看不见`);
        for (const decl of rule.split(';').filter(item => /background/.test(item))) {
            const flat = decl.replace(GRADIENT, '');
            for (const a of alphas(flat)) assert.ok(a <= 0.16, `${selector} 的实心底色不透明度 ${a} 太高，会盖住鱼：${decl.trim().replace(/\s+/g, ' ')}`);
            for (const a of alphas(decl)) assert.ok(a <= 0.3, `${selector} 的网线不透明度 ${a} 太高`);
        }
    }
    for (const m of block('.aq-net').matchAll(/repeating-linear-gradient\([^,]+,[^)]*\)\s*0\s+(\d+)px/g)) assert.ok(Number(m[1]) <= 1, '网线保持 1px 细线');
    const label = block('.aq-net-label');
    assert.match(label, /position: absolute/);
    assert.match(label, /bottom: 100%/);
    assert.match(label, /border-radius: 999px/);
    assert.match(label, /background:/);
});
