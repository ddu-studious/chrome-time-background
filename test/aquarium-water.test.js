// 水体层控制器（js/aquarium-water.js）+ 着色器源码合同 + 样式 / index.html / 设置页的静态契约。
// 控制器用假 document / 假 WebGL 上下文跑：只证明“怎么建、怎么画、怎么失败、怎么清理”，不证明着色器能在真实 GPU 上编译链接与好看——
// 那一层由真实 Chromium 的页面验证承担（见 docs/technical/aquarium-water-20261019.md 与 aquarium-shore-20261020.md）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Water = require('../js/aquarium-water.js');
const Shader = require('../js/aquarium-water-shader.js');
const Core = require('../js/aquarium-water-core.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const P = Core.PARAMS;

// ---------- 夹具 ----------

function makeGl(options = {}) {
    const log = [];
    const gl = {
        log,
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLE_STRIP: 8,
        loseContextCalls: 0,
        createShader: type => { const item = { kind: 'shader', type }; log.push(['createShader', type]); return item; },
        shaderSource: (item, source) => { item.source = source; log.push(['shaderSource', item.type]); },
        compileShader: item => { log.push(['compileShader', item.type]); },
        getShaderParameter: (item) => !(options.failCompile && item.type === options.failCompile),
        getShaderInfoLog: () => 'ERROR: 0:1: boom',
        deleteShader: item => { log.push(['deleteShader', item.type]); },
        createProgram: () => { log.push(['createProgram']); return { kind: 'program', id: log.filter(entry => entry[0] === 'createProgram').length }; },
        attachShader: () => log.push(['attachShader']),
        linkProgram: () => log.push(['linkProgram']),
        getProgramParameter: () => !options.failLink,
        useProgram: program => log.push(['useProgram', program.id]),
        deleteProgram: () => log.push(['deleteProgram']),
        createBuffer: () => { log.push(['createBuffer']); return { kind: 'buffer' }; },
        bindBuffer: () => log.push(['bindBuffer']),
        bufferData: (target, data) => log.push(['bufferData', Array.from(data)]),
        deleteBuffer: () => log.push(['deleteBuffer']),
        getAttribLocation: (program, name) => { log.push(['getAttribLocation', name]); return 0; },
        enableVertexAttribArray: () => log.push(['enableVertexAttribArray']),
        vertexAttribPointer: (...args) => log.push(['vertexAttribPointer', ...args]),
        getUniformLocation: (program, name) => ({ name }),
        viewport: (...args) => log.push(['viewport', ...args]),
        uniform2f: (loc, a, b) => log.push(['uniform2f', loc.name, a, b]),
        uniform1f: (loc, a) => log.push(['uniform1f', loc.name, a]),
        drawArrays: (...args) => { if (options.failDraw) throw new Error('draw failed'); log.push(['drawArrays', ...args]); },
        getExtension: name => {
            if (name === 'WEBGL_lose_context') return { loseContext: () => { gl.loseContextCalls++; } };
            if (name === 'WEBGL_debug_renderer_info' && !options.noRendererInfo) return { UNMASKED_RENDERER_WEBGL: 37446 };
            return null;
        },
        getParameter: key => { if (options.throwOnParameter) throw new Error('blocked'); return key === 37446 ? (options.renderer || 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)') : null; },
    };
    return gl;
}

function makeDoc({ gl = makeGl(), contextNull = false, withRoot = true, withBody = true, getContextThrows = false } = {}) {
    const events = { created: [], contextArgs: [] };
    const body = {
        children: [],
        insertBefore(node, ref) { node.parentNode = body; body.children.splice(body.children.indexOf(ref), 0, node); },
        appendChild(node) { node.parentNode = body; body.children.push(node); },
        removeChild(node) { body.children.splice(body.children.indexOf(node), 1); node.parentNode = null; },
    };
    const rootElement = { id: 'background-experience-root', parentNode: body };
    if (withRoot) body.children.push(rootElement);
    const doc = {
        body: withBody ? body : null,
        getElementById: id => (id === 'background-experience-root' && withRoot ? rootElement : null),
        createElement(tag) {
            assert.equal(tag, 'canvas');
            const classes = new Set();
            const listeners = {};
            const canvas = {
                className: '', width: 0, height: 0, attrs: {}, listeners, removed: false, parentNode: null,
                setAttribute(name, value) { this.attrs[name] = value; },
                classList: { add: name => classes.add(name), contains: name => classes.has(name) },
                addEventListener(name, fn) { listeners[name] = fn; },
                getContext(type, options) {
                    events.contextArgs.push([type, options]);
                    if (getContextThrows) throw new Error('context blocked');
                    return contextNull ? null : gl;
                },
                remove() { this.removed = true; if (this.parentNode) this.parentNode.removeChild(this); },
            };
            events.created.push(canvas);
            return canvas;
        },
    };
    return { doc, gl, body, rootElement, events };
}

function make(overrides = {}, docOptions = {}) {
    const fixture = makeDoc(docOptions);
    const warnings = [];
    const water = Water.create(Object.assign({
        document: fixture.doc,
        warn: message => warnings.push(message),
        now: () => 0,
        hour: () => 14,
        nightAmount: hour => (hour >= 20 || hour < 6 ? 1 : 0),
    }, overrides));
    return Object.assign(fixture, { water, warnings });
}

const FRAME = { width: 1440, height: 900, now: 1000 };
const uniformCalls = (gl, name) => gl.log.filter(entry => (entry[0] === 'uniform1f' || entry[0] === 'uniform2f') && entry[1] === name);
const draws = gl => gl.log.filter(entry => entry[0] === 'drawArrays').length;

// ---------- 启动与建立 ----------

test('start() 没有任何副作用：不建画布、不取上下文；frame() 在启动前返回 false', () => {
    const f = make();
    assert.equal(f.water.frame(FRAME), false);
    f.water.start();
    assert.equal(f.events.created.length, 0, 'start 之后、第一帧之前没有画布');
    assert.equal(f.events.contextArgs.length, 0);
    assert.equal(f.water.isActive(), true);
    assert.deepEqual(f.water.state(), { started: true, failed: false, reason: '', lost: false, frames: 0, width: 0, height: 0, hasCanvas: false, level: 0, armed: false });
    f.water.start();
    assert.equal(f.events.created.length, 0, '重复 start 无副作用');
});

test('第一帧：建画布（类名、aria-hidden、半分辨率、只有页面底部一条带子的高度）、取 WebGL1 上下文（固定参数）、插到根容器之前、画一次、淡入类在画完之后才加', () => {
    const f = make();
    f.water.start();
    assert.equal(f.water.frame(FRAME), true);
    assert.equal(f.events.created.length, 1);
    const canvas = f.events.created[0];
    assert.equal(canvas.className, 'aq-water');
    assert.equal(canvas.attrs['aria-hidden'], 'true');
    assert.equal(canvas.width, 720);
    assert.equal(canvas.height, 153, '1440×900 的页面：带子高 900 × 0.34 = 306，半分辨率 153');
    assert.deepEqual(f.events.contextArgs, [['webgl', Water.CONTEXT_OPTIONS]]);
    assert.deepEqual({ ...Water.CONTEXT_OPTIONS }, {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
        powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
    });
    assert.ok(Object.isFrozen(Water.CONTEXT_OPTIONS));
    assert.deepEqual(f.body.children.map(node => node.id || node.className), ['aq-water', 'background-experience-root'], '画布在宿主根容器之前（壁纸之上、鱼与水母之下）');
    assert.equal(draws(f.gl), 1);
    assert.deepEqual(f.gl.log.find(entry => entry[0] === 'bufferData')[1], [-1, -1, 1, -1, -1, 1, 1, 1]);
    assert.ok(f.gl.log.some(entry => entry[0] === 'viewport' && entry[3] === 720 && entry[4] === 153));
    assert.equal(canvas.classList.contains('is-on'), true, '第一帧画完后淡入');
    assert.equal(f.water.state().frames, 1);
    assert.equal(f.water.state().hasCanvas, true);
});

test('编译用的就是着色器模块里的两段源码；链接后取 aPos 与全部登记的 uniform', () => {
    const f = make();
    f.water.start();
    f.water.frame(FRAME);
    const created = f.gl.log.filter(entry => entry[0] === 'createShader').map(entry => entry[1]);
    assert.deepEqual(created, [1, 2], '先顶点后片元');
    const names = f.gl.log.filter(entry => entry[0] === 'getAttribLocation').map(entry => entry[1]);
    assert.deepEqual(names, ['aPos']);
    for (const name of Shader.UNIFORMS) assert.ok(uniformCalls(f.gl, name).length >= 1, `${name} 在第一帧被写入`);
});

test('没有宿主根容器就追加到 body；没有 body 或没有 document 则记为失败（只警告一次）', () => {
    const noRoot = make({}, { withRoot: false });
    noRoot.water.start();
    assert.equal(noRoot.water.frame(FRAME), true);
    assert.deepEqual(noRoot.body.children.map(node => node.className), ['aq-water']);

    const noBody = make({}, { withBody: false });
    noBody.water.start();
    assert.equal(noBody.water.frame(FRAME), false);
    assert.equal(noBody.water.state().failed, true);
    assert.equal(noBody.warnings.length, 1);
    assert.match(noBody.warnings[0], /body/);

    const noDoc = Water.create({ document: null, warn: () => {}, now: () => 0, hour: () => 0, nightAmount: () => 0 });
    noDoc.start();
    assert.equal(noDoc.frame(FRAME), false);
    assert.equal(noDoc.state().failed, true);
});

test('页面尺寸无效：不建画布、也不算失败', () => {
    const f = make();
    f.water.start();
    for (const bad of [{ width: 0, height: 900 }, { width: NaN, height: NaN }, {}, { width: -5, height: 10 }]) assert.equal(f.water.frame(Object.assign({ now: 1000 }, bad)), false);
    assert.equal(f.events.created.length, 0);
    assert.equal(f.water.state().failed, false);
    assert.equal(f.water.frame(FRAME), true, '尺寸恢复后正常画');
});

// ---------- 节流、尺寸与 uniform ----------

test('帧率节流：到点才画（被节流的帧仍返回 true）；省流量更慢', () => {
    const f = make();
    f.water.start();
    f.water.frame({ ...FRAME, now: 1000 });
    assert.equal(f.water.frame({ ...FRAME, now: 1010 }), true);
    assert.equal(draws(f.gl), 1, '10 ms 后还没到点，不重画');
    f.water.frame({ ...FRAME, now: 1000 + 1000 / P.FPS });
    assert.equal(draws(f.gl), 2);

    const low = make();
    low.water.start();
    low.water.frame({ ...FRAME, now: 1000, lowPower: true });
    low.water.frame({ ...FRAME, now: 1000 + 1000 / P.FPS + 1, lowPower: true });
    assert.equal(draws(low.gl), 1, '省流量 15 fps：33 ms 还不到点');
    low.water.frame({ ...FRAME, now: 1000 + 1000 / P.FPS_LOW, lowPower: true });
    assert.equal(draws(low.gl), 2);
    assert.equal(low.events.created[0].width, Math.round(1440 * P.SCALE_LOW), '省流量用更小的画布');
});

test('窗口尺寸变化：只在到点的帧里改画布大小并更新视口', () => {
    const f = make();
    f.water.start();
    f.water.frame({ ...FRAME, now: 1000 });
    const canvas = f.events.created[0];
    f.water.frame({ width: 1000, height: 600, now: 1005 });
    assert.equal(canvas.width, 720, '被节流的帧不动画布');
    f.water.frame({ width: 1000, height: 600, now: 1100 });
    assert.equal(canvas.width, 500);
    assert.equal(canvas.height, 102, '600 × 0.34 × 0.5');
    assert.deepEqual(f.gl.log.filter(entry => entry[0] === 'viewport').at(-1), ['viewport', 0, 0, 500, 102]);
    assert.deepEqual(uniformCalls(f.gl, 'uRes').at(-1), ['uniform2f', 'uRes', 500, 102]);
    assert.equal(f.water.state().width, 500);
    assert.equal(f.water.state().height, 102);
});

test('uniform：时间/强度/夜晚/质量/带子比例/宽高比/水线与浪按核心规则写入；night:false 表示白天；nightHour 可覆盖本机时间', () => {
    const f = make({ hour: () => 22 });
    f.water.start();
    f.water.frame({ ...FRAME, now: 2500, amount: 0.5 });
    const last = name => uniformCalls(f.gl, name).at(-1).at(-1);
    assert.equal(last('uTime'), 2.5);
    assert.ok(Math.abs(last('uAmount') - (P.AMOUNT_BASE + P.AMOUNT_SPAN * 0.5)) < 1e-12);
    assert.equal(last('uNight'), 1, '本机 22 点');
    assert.equal(last('uQuality'), 1);
    assert.equal(last('uBand'), P.BAND);
    assert.equal(last('uAspect'), 1.6, '页面 1440×900');
    const tide = Core.tideOf(2.5);
    assert.equal(last('uTop'), tide.top);
    assert.equal(last('uReach'), tide.reach);
    assert.equal(last('uTideV'), tide.tideV);

    f.water.frame({ ...FRAME, now: 3000, night: false });
    assert.equal(last('uNight'), 0, '夜晚效果被设置关掉时按白天算');
    f.water.frame({ ...FRAME, now: 3100, nightHour: 12 });
    assert.equal(last('uNight'), 0);
    f.water.frame({ ...FRAME, now: 3200, nightHour: 23 });
    assert.equal(last('uNight'), 1);
    f.water.frame({ ...FRAME, now: 3300, lowPower: true });
    assert.equal(last('uQuality'), 0);
    f.water.frame({ width: 2560, height: 1080, now: 3500 });
    assert.equal(last('uAspect'), 2560 / 1080, '窗口形状变了，宽高比跟着变（横向起伏的空间频率与鱼看到的是同一份）');
});

test('没有宿主传 now 时用自己的时钟；夜晚曲线缺席时按白天', () => {
    let clock = 4000;
    const f = make({ now: () => clock, nightAmount: undefined });
    f.water.start();
    f.water.frame({ width: 1440, height: 900 });
    assert.equal(uniformCalls(f.gl, 'uTime').at(-1).at(-1), 4);
    assert.equal(uniformCalls(f.gl, 'uNight').at(-1).at(-1), 0);
    clock = 5000;
    f.water.frame({ width: 1440, height: 900, now: NaN });
    assert.equal(uniformCalls(f.gl, 'uTime').at(-1).at(-1), 5);
});

// ---------- 失败：只关水体层，不抛错，不重试 ----------

test('没有 WebGL（含只有软件渲染时 failIfMajorPerformanceCaveat 的拒绝）：记失败、只警告一次、不留画布', () => {
    const f = make({}, { contextNull: true });
    f.water.start();
    assert.equal(f.water.frame(FRAME), false);
    assert.equal(f.water.state().failed, true);
    assert.equal(f.water.state().hasCanvas, false);
    assert.equal(f.warnings.length, 1);
    assert.match(f.warnings[0], /WebGL/);
    assert.equal(f.body.children.length, 1, '只剩宿主根容器');
    for (let i = 0; i < 5; i++) assert.equal(f.water.frame({ ...FRAME, now: 2000 + i * 50 }), false);
    assert.equal(f.events.created.length, 1, '失败后不反复重建');
    assert.equal(f.warnings.length, 1);
    assert.equal(f.water.isActive(), false);
});

test('getContext 抛错同样只是失败', () => {
    const f = make({}, { getContextThrows: true });
    f.water.start();
    assert.doesNotThrow(() => f.water.frame(FRAME));
    assert.equal(f.water.state().failed, true);
});

test('顶点或片元着色器编译失败：带日志警告、删除着色器、移除画布、不留半成品', () => {
    for (const failCompile of [1, 2]) {
        const f = make({}, { gl: makeGl({ failCompile }) });
        f.water.start();
        assert.equal(f.water.frame(FRAME), false);
        assert.equal(f.water.state().failed, true);
        assert.match(f.warnings[0], /编译失败/);
        assert.match(f.warnings[0], /boom/, '带着色器日志');
        assert.ok(f.gl.log.some(entry => entry[0] === 'deleteShader'));
        assert.equal(f.events.created[0].removed, true);
        assert.equal(draws(f.gl), 0);
    }
});

test('链接失败：失败、清理', () => {
    const f = make({}, { gl: makeGl({ failLink: true }) });
    f.water.start();
    assert.equal(f.water.frame(FRAME), false);
    assert.equal(f.water.state().failed, true);
    assert.match(f.warnings[0], /链接失败/);
    assert.equal(f.events.created[0].removed, true);
});

test('绘制抛错：整层关闭、清理上下文，之后不再画；stop 之后重新 start 才会再试一次', () => {
    const gl = makeGl({ failDraw: true });
    const f = make({}, { gl });
    f.water.start();
    assert.equal(f.water.frame(FRAME), false);
    assert.equal(f.water.state().failed, true);
    assert.match(f.warnings[0], /绘制出错/);
    assert.equal(f.events.created[0].removed, true);
    assert.equal(gl.loseContextCalls, 1, '主动释放 GPU 上下文');
    assert.equal(f.water.frame({ ...FRAME, now: 2000 }), false);
    assert.equal(f.warnings.length, 1);

    f.water.stop();
    f.water.start();
    assert.equal(f.water.state().failed, false, '重新启动清除失败状态，允许再试');
    assert.equal(f.water.frame({ ...FRAME, now: 3000 }), false, '这个替身仍然画不了');
    assert.equal(f.events.created.length, 2, '新的一次尝试用新画布');
});

// ---------- 软件渲染与帧率自监控 ----------

test('只有 CPU 软件渲染（SwiftShader / llvmpipe / 各种 Software）：不启用、留一条警告、不留画布；读不到渲染器名称则按硬件处理', () => {
    for (const renderer of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Apple Software Renderer', 'Microsoft Basic Render Driver']) {
        const f = make({}, { gl: makeGl({ renderer }) });
        f.water.start();
        assert.equal(f.water.frame(FRAME), false, renderer);
        assert.equal(f.water.state().failed, true);
        assert.match(f.warnings[0], /软件渲染/);
        assert.equal(f.events.created[0].removed, true);
        assert.equal(draws(f.gl), 0, '一帧都没画');
    }
    for (const options of [{ noRendererInfo: true }, { throwOnParameter: true }]) {
        const f = make({}, { gl: makeGl(options) });
        f.water.start();
        assert.equal(f.water.frame(FRAME), true, JSON.stringify(options));
        assert.equal(f.water.state().failed, false);
    }
    const real = make({}, { gl: makeGl({ renderer: 'ANGLE (Intel, ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics, Unspecified Version)' }) });
    real.water.start();
    assert.equal(real.water.frame(FRAME), true, '集成显卡不算软件渲染');
});

/** 把一个流畅（16 ms 一帧）的页面喂给控制器，直到监护开始（此时统计窗口是空的）；返回当前时刻。 */
function armWater(water, start = 1000) {
    let now = start;
    while (!water.state().armed) {
        if (now > start + 120000) throw new Error('监护一直没有开始');
        now += 16;
        water.frame({ width: 1440, height: 900, now });
    }
    return now;
}

test('帧率自监控：页面流畅过之后变慢 → 先降到省流量画法（更小的画布、更低的帧率）；仍然偏慢 → 整层关闭并警告一次', () => {
    const f = make();
    f.water.start();
    let now = armWater(f.water);
    const step = (gap, count) => { for (let i = 0; i < count; i++) { now += gap; f.water.frame({ width: 1440, height: 900, now }); } };
    assert.equal(f.water.state().level, 0, '正常帧率不降级');
    assert.equal(f.water.state().armed, true, '页面流畅过，开始监护');
    assert.equal(f.events.created[0].width, 720);
    step(55, P.GOV_MIN_SAMPLES);           // 约 18 fps：低于 25 fps 的门槛，刚好一个窗口
    assert.equal(f.water.state().level, 1);
    assert.equal(f.water.state().failed, false);
    step(55, 3);                           // 省流量帧率更低，多走几帧才有到点的帧去改画布尺寸
    assert.equal(f.events.created[0].width, Math.round(1440 * P.SCALE_LOW), '降级后用省流量尺寸');
    assert.equal(uniformCalls(f.gl, 'uQuality').at(-1).at(-1), 0, '降级后少一层焦散、没有颗粒与气泡');
    step(55, P.GOV_MIN_SAMPLES - 3);       // 降级之后还是慢：第二个窗口
    assert.equal(f.water.state().failed, true);
    assert.equal(f.water.state().level, 2);
    assert.equal(f.warnings.length, 1);
    assert.match(f.warnings[0], /帧率过低/);
    assert.equal(f.events.created[0].removed, true);
    assert.equal(f.water.frame({ width: 1440, height: 900, now: now + 16 }), false);
});

test('帧率自监控：页面启动期的卡顿不关海水层；页面一直不流畅就等到上限再监护；被暂停（间隔超过 1 秒）不算慢；降级后恢复流畅不会关闭；重新启动重新计', () => {
    // 页面刚打开：预热期里每帧 150 ms，之后流畅——海水层一直活着，不降级
    const boot = make();
    boot.water.start();
    let now = 0;
    for (let i = 0; i < 25; i++) { now += 150; boot.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(boot.water.state().failed, false, '预热期内再慢也不关');
    assert.equal(boot.water.state().level, 0);
    assert.equal(boot.water.state().armed, false);
    for (let i = 0; i < 300; i++) { now += 16; boot.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(boot.water.state().failed, false, '启动卡顿过去之后页面流畅，海水层还在');
    assert.equal(boot.water.state().level, 0);
    assert.equal(boot.water.state().armed, true);
    assert.equal(boot.warnings.length, 0);

    // 页面一直卡（每帧 150 ms，机器本身很忙）：不会在启动期被关，要等到上限之后才开始监护、之后才降级与关闭
    const busy = make();
    busy.water.start();
    now = 0;
    for (let i = 0; i < Math.floor(20000 / 150); i++) { now += 150; busy.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(busy.water.state().failed, false, '头 20 秒页面一直卡也不关');
    assert.equal(busy.water.state().level, 0);
    assert.equal(busy.water.state().armed, false);
    while (!busy.water.state().failed && now < 200000) { now += 150; busy.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(busy.water.state().failed, true, '一直不流畅，最终还是关');
    assert.ok(now >= P.GOV_SETTLE_MAX_MS, `不早于等待上限（${now} ms）`);
    assert.match(busy.warnings[0], /帧率过低/);

    // 被暂停（页面切走又回来）：这些间隔不计入；一半的间隔都是暂停也不算慢
    const paused = make();
    paused.water.start();
    now = 0;
    for (let round = 0; round < 40; round++) {
        now += 5000;                              // 页面被切走又回来：第一帧的间隔是 5 秒
        now += 16; paused.water.frame({ width: 1440, height: 900, now });
        now += 16; paused.water.frame({ width: 1440, height: 900, now });
    }
    assert.equal(paused.water.state().armed, true, '暂停的间隔不计入，剩下的是流畅的帧');
    assert.equal(paused.water.state().level, 0);
    assert.equal(paused.water.state().failed, false);

    const recover = make();
    recover.water.start();
    now = armWater(recover.water);
    for (let i = 0; i < P.GOV_MIN_SAMPLES; i++) { now += 55; recover.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(recover.water.state().level, 1);
    for (let i = 0; i < 80; i++) { now += 16; recover.water.frame({ width: 1440, height: 900, now }); }
    assert.equal(recover.water.state().failed, false, '降级后恢复流畅就一直保持降级、不关闭');
    assert.equal(recover.water.state().level, 1, '只降不升，避免来回切换');

    busy.water.stop();
    busy.water.start();
    assert.equal(busy.water.state().level, 0, '重新启动：监控重新计');
    assert.equal(busy.water.state().armed, false);
    assert.equal(busy.water.state().failed, false);
});

test('宿主已经要求省流量：自监控不改变它，只是在它之上再降级', () => {
    const f = make();
    f.water.start();
    let now = 0;
    for (let i = 0; i < 5; i++) { now += 40; f.water.frame({ width: 1440, height: 900, now, lowPower: true }); }
    assert.equal(f.events.created[0].width, Math.round(1440 * P.SCALE_LOW));
    assert.equal(f.water.state().level, 0);
});

// ---------- 上下文丢失 / 恢复 ----------

test('上下文丢失：阻止默认行为以便恢复；丢失期间不画但仍算在运行；恢复后重建并继续', () => {
    const f = make();
    f.water.start();
    f.water.frame({ ...FRAME, now: 1000 });
    const canvas = f.events.created[0];
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    canvas.listeners.webglcontextlost(event);
    assert.equal(event.prevented, true);
    assert.equal(f.water.state().lost, true);
    const before = draws(f.gl);
    assert.equal(f.water.frame({ ...FRAME, now: 2000 }), true);
    assert.equal(draws(f.gl), before, '丢失期间不画');

    const programsBefore = f.gl.log.filter(entry => entry[0] === 'createProgram').length;
    canvas.listeners.webglcontextrestored();
    assert.equal(f.water.state().lost, false);
    assert.equal(f.gl.log.filter(entry => entry[0] === 'createProgram').length, programsBefore + 1, '恢复后重新编译链接');
    assert.equal(f.water.frame({ ...FRAME, now: 2001 }), true);
    assert.equal(draws(f.gl), before + 1, '恢复后第一帧不被节流');
    assert.equal(f.warnings.length, 0);
});

test('上下文恢复后重建失败：整层关闭', () => {
    const gl = makeGl();
    const f = make({}, { gl });
    f.water.start();
    f.water.frame(FRAME);
    const canvas = f.events.created[0];
    canvas.listeners.webglcontextlost({ preventDefault() {} });
    gl.getProgramParameter = () => false;
    canvas.listeners.webglcontextrestored();
    assert.equal(f.water.state().failed, true);
    assert.match(f.warnings[0], /恢复后重建失败/);
    assert.equal(canvas.removed, true);
});

// ---------- 停止与清理 ----------

test('stop()：移除画布、释放程序与缓冲、主动丢弃上下文；之后 frame 返回 false；再 start 会重建全新的画布', () => {
    const f = make();
    f.water.start();
    f.water.frame(FRAME);
    const first = f.events.created[0];
    f.water.stop();
    assert.equal(first.removed, true);
    assert.deepEqual(f.body.children.map(node => node.id || node.className), ['background-experience-root']);
    for (const name of ['deleteProgram', 'deleteShader', 'deleteBuffer']) assert.ok(f.gl.log.some(entry => entry[0] === name), name);
    assert.equal(f.gl.loseContextCalls, 1);
    assert.equal(f.water.isActive(), false);
    assert.equal(f.water.frame(FRAME), false);
    assert.equal(f.water.state().hasCanvas, false);

    f.water.stop();
    assert.equal(f.gl.loseContextCalls, 1, '重复 stop 无副作用');

    f.water.start();
    assert.equal(f.water.frame({ ...FRAME, now: 5000 }), true);
    assert.equal(f.events.created.length, 2);
    assert.notEqual(f.events.created[1], first);
    assert.equal(f.water.state().frames, 1);
});

test('旧画布迟到的上下文事件不影响新画布：stop 主动丢弃上下文会让浏览器稍后在旧画布上触发 webglcontextlost，期间可能已经 start 并建好了新画布', () => {
    const f = make();
    f.water.start();
    f.water.frame(FRAME);
    const old = f.events.created[0];
    const staleLost = old.listeners.webglcontextlost;
    const staleRestored = old.listeners.webglcontextrestored;
    f.water.stop();
    f.water.start();
    assert.equal(f.water.frame({ ...FRAME, now: 5000 }), true);
    assert.equal(f.events.created.length, 2);
    const fresh = f.events.created[1];
    const before = draws(f.gl);
    // 旧画布的事件此时才到（真实浏览器里 loseContext 的事件是异步派发的）
    if (staleLost) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; staleLost(event); assert.equal(event.prevented, false, '旧画布的事件不得被当作“可恢复”处理'); }
    if (staleRestored) staleRestored();
    assert.equal(f.water.state().lost, false, '新画布没有被误标为丢失');
    assert.equal(f.water.frame({ ...FRAME, now: 6000 }), true);
    assert.equal(draws(f.gl), before + 1, '新画布照常绘制');
    assert.equal(fresh.removed, false);
    assert.equal(f.water.state().failed, false);
});

test('stop 时摘掉旧画布的上下文监听（有 removeEventListener 时）', () => {
    const f = make();
    f.water.start();
    f.water.frame(FRAME);
    const old = f.events.created[0];
    const removed = [];
    old.removeEventListener = (name, fn) => { removed.push([name, fn === old.listeners[name]]); };
    f.water.stop();
    assert.deepEqual(removed.sort(), [['webglcontextlost', true], ['webglcontextrestored', true]]);
});

// ---------- 源码合同 ----------

test('控制器源码：不自建 RAF/定时器，不联网，不碰存储与任务数据，不用 innerHTML/eval', () => {
    const text = read('js/aquarium-water.js');
    const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /requestAnimationFrame|setInterval|setTimeout|innerHTML|insertAdjacentHTML|\beval\(|new Function|fetch\(|XMLHttpRequest|sendMessage|chrome\.|localStorage|sessionStorage|indexedDB|\bmemos\b|completeTaskById/);
    assert.match(code, /CONTEXT_OPTIONS/);
    assert.match(code, /failIfMajorPerformanceCaveat: true/, '只有软件渲染时宁可不画');
});

test('着色器源码合同：声明的 uniform 与登记名单一致且都用到；没有纹理、扩展、导数；循环上界是常量；只写一次 gl_FragColor', () => {
    assert.ok(Object.isFrozen(Shader) && Object.isFrozen(Shader.UNIFORMS));
    assert.equal(new Set(Shader.UNIFORMS).size, Shader.UNIFORMS.length, '名单没有重复');
    const fragment = Shader.FRAGMENT;
    const declared = [...fragment.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map(match => match[1]);
    assert.deepEqual([...declared].sort(), [...Shader.UNIFORMS].sort(), '片元着色器声明的 uniform 与登记名单一一对应');
    for (const name of Shader.UNIFORMS) {
        const uses = fragment.match(new RegExp(`\\b${name}\\b`, 'g')).length;
        assert.ok(uses >= 2, `${name} 声明之后确实被使用`);
    }
    assert.doesNotMatch(fragment, /texture2D|sampler2D|samplerCube|#extension|dFdx|dFdy|fwidth|\bdiscard\b/);
    assert.doesNotMatch(fragment, /https?:|import\s|url\(/);
    const loops = [...fragment.matchAll(/for\s*\(([^)]*)\)/g)].map(match => match[1]);
    assert.ok(loops.length >= 2);
    for (const header of loops) assert.match(header, /^int \w+ = -?\d+;\s*\w+ <=? -?\d+;\s*\w+\+\+$/, `循环必须是常量上界（WebGL1 要求）：${header}`);
    assert.equal((fragment.match(/gl_FragColor\s*=/g) || []).length, 1);
    assert.match(fragment, /gl_FragColor = vec4\(clamp\(pre, 0\.0, 1\.0\), clamp\(a, 0\.0, 1\.0\)\)/, '预乘 alpha 输出：水面以上 alpha 为 0，壁纸原样透过来');
    assert.match(fragment, /a = max\(a, max\(pre\.r, max\(pre\.g, pre\.b\)\)\);/, '预乘值必须合法（颜色分量不超过 alpha），否则合成结果取决于实现');
    assert.match(fragment, /#ifdef GL_FRAGMENT_PRECISION_HIGH[\s\S]*precision highp float;[\s\S]*#else[\s\S]*precision mediump float;/, '片元精度有 mediump 后备');
    assert.match(Shader.VERTEX, /attribute vec2 aPos;/);
    assert.match(Shader.VERTEX, /gl_Position = vec4\(aPos, 0\.0, 1\.0\)/);
});

test('着色器源码：省流量分支存在（没有水下光斑与水面碎光），夜晚与强度由 uniform 驱动', () => {
    const fragment = Shader.FRAGMENT;
    const gated = [...fragment.matchAll(/if \(uQuality > 0\.5 && ([^)]*)\) \{/g)].map(match => match[1]);
    assert.equal(gated.length, 2, '水下光斑与水面碎光两处都受省流量开关控制');
    assert.match(fragment, /add \*= uAmount;/, '强度缩放“加上去的光”');
    assert.match(fragment, /float k = mix\(0\.62, 1\.0, uAmount\);\s*pre \*= k;\s*a \*= k;/, '强度同时缩放沙与水的不透明度');
    assert.match(fragment, /mix\([^;]*night\)/);
});

test('着色器与核心共用同一条水线：常数、浪的大小与一生、相位、横向起伏的公式都与核心逐项一致；水舌噪声有上界', () => {
    const fragment = Shader.FRAGMENT;
    const constant = name => { const found = new RegExp(`const float ${name} = ([\\d.]+);`).exec(fragment); assert.ok(found, `着色器里有 ${name}`); return Number(found[1]); };
    for (const name of ['WAVE_PERIOD', 'RISE', 'SHEAR', 'APPROACH', 'APPROACH_DIST', 'AMP_WOBBLE', 'LAT_A', 'LAT_B', 'LAT_PERIOD_A', 'LAT_PERIOD_B', 'RILL']) {
        assert.equal(constant(name), P[name], `${name} 与核心相同（改一边必须改另一边）`);
    }
    const amps = /float setAmp\(float k\) \{\s*return k < 0\.5 \? ([\d.]+) : \(k < 1\.5 \? ([\d.]+) : \(k < 2\.5 \? ([\d.]+) : ([\d.]+)\)\);\s*\}/.exec(fragment);
    assert.ok(amps, '一组浪的大小：四档');
    assert.deepEqual(amps.slice(1).map(Number), [...P.SET_AMPS], '与核心 SET_AMPS 相同');
    assert.equal(P.SET_AMPS.length, 4, '着色器里写死了四档');
    // 浪的一生：冲上去 1 - (1 - u)²，退下来 1 - v^1.6；速度是它的导数
    assert.match(fragment, /if \(phi < RISE\) \{ float u = phi \/ RISE; return 1\.0 - \(1\.0 - u\) \* \(1\.0 - u\); \}\s*float v = \(phi - RISE\) \/ \(1\.0 - RISE\);\s*return 1\.0 - pow\(v, 1\.6\);/);
    assert.match(fragment, /if \(phi < RISE\) \{ float u = phi \/ RISE; return 2\.0 \* \(1\.0 - u\) \/ RISE; \}\s*float v = \(phi - RISE\) \/ \(1\.0 - RISE\);\s*return -1\.6 \* pow\(max\(v, 0\.0001\), 0\.6\) \/ \(1\.0 - RISE\);/);
    // 水线本身：相位（斜着来）、浪的大小（带横向强弱）、横向起伏、水线 = 最高处 - 深度 × 大小 × 一生 + 起伏 + 水舌
    assert.match(fragment, /float h = uv\.y \* uBand;\s*float xp = uv\.x \* uAspect;/, '高度以页面高度为 1、从页面底边往上量；横向位置乘宽高比');
    assert.match(fragment, /float ph = t \/ WAVE_PERIOD - SHEAR \* uv\.x;\s*float n = floor\(ph\);\s*float phi = ph - n;\s*float k4 = mod\(n, 4\.0\);/);
    assert.match(fragment, /float amp = setAmp\(k4\) \* \(1\.0 \+ AMP_WOBBLE \* sin\(xp \* 3\.1 \+ k4 \* 1\.9\)\);/);
    assert.match(fragment, /float lat = LAT_A \* sin\(xp \* 2\.3 \+ PI2 \/ LAT_PERIOD_A \* t\) \+ LAT_B \* sin\(xp \* 5\.9 - PI2 \/ LAT_PERIOD_B \* t \+ 1\.7\);/);
    assert.match(fragment, /float rill = \(fbm2\(vec2\(xp \* 11\.0 \+ k4 \* 5\.3, 1\.7 \+ k4\)\) - 0\.5\) \* RILL \* \(0\.3 \+ r\);/, '水舌：噪声减 0.5（上界 +0.5）× RILL × (0.3 + r)，核心的岸线最高处按这个上界留余量');
    assert.match(fragment, /float hF = uTop - uReach \* amp \* r \+ lat \+ rill;/);
    assert.match(fragment, /float fbm2\(vec2 p\) \{ return 0\.55 \* vnoise2\(p\) \+ 0\.30 \* vnoise2\(p \* 2\.07 \+ 3\.1\) \+ 0\.15 \* vnoise2\(p \* 4\.3 \+ 7\.7\); \}/, '噪声的权重之和是 1，所以 fbm 取值在 [0, 1)');
    // 水的渐隐范围必须落在带子里：水线最高处之上 0.12（水的不透明度在 0.06…0.12 之间渐隐为 0），带子顶上再留渐隐
    assert.match(fragment, /\(1\.0 - smoothstep\(0\.06, 0\.12, dd\)\)/);
    assert.ok(Core.shoreTopMax() + 0.12 < P.BAND, '水在带子顶上之前就已经透明了');
    assert.match(fragment, /float fadeTop = 1\.0 - smoothstep\(uBand \* 0\.80, uBand, h\);/, '带子上沿渐隐：不能有硬边');
    assert.match(fragment, /pre \*= fadeTop;\s*a \*= fadeTop;/);
    // 不遮壁纸的静态底线：沙的不透明度有上界（水线以上的水更薄）；沙只在水线之下
    const sand = /float sandA = mix\(([\d.]+), ([\d.]+), wet\) \* sandVis;/.exec(fragment);
    assert.ok(sand && Number(sand[1]) <= Number(sand[2]) && Number(sand[2]) <= 0.7, `沙的不透明度 ${sand && sand.slice(1, 3)} 不超过 0.7（壁纸细节至少留 30%）`);
    const water = /float waterA = sea \* \(([\d.]+) \+ ([\d.]+) \* smoothstep\(0\.0, 0\.05, dd\)\)/.exec(fragment);
    assert.ok(water && Number(water[1]) + Number(water[2]) <= 0.35, '水线之上的水体不透明度不超过 0.35：壁纸清楚地透过来');
});

test('shore(now)：只有水体层真的在显示时才给出岸线位置（此刻水线能到的最高处，占页面高度的比例，从页面底边往上量），其余一律 null；与核心同一份数字', () => {
    const f = make();
    assert.equal(f.water.shore(1000), null, '没启动');
    f.water.start();
    assert.equal(f.water.shore(1000), null, '启动了但还没画出第一帧（画布还不存在）');
    f.water.frame({ ...FRAME, now: 1000 });
    const expected = at => Core.shoreTopAt(Core.shaderTime(at));
    assert.equal(f.water.shore(1000), expected(1000));
    assert.equal(f.water.shore(31400), expected(31400), '取调用者给的时间，不是上一帧的时间（鱼比水线的重画更勤）');
    assert.notEqual(f.water.shore(1000), f.water.shore(42900), '岸线确实随潮汐在变');
    // 画了不止一帧之后仍然给出岸线（只在第一帧之后才有岸线这个判断不能写成“只有恰好一帧”）
    for (const now of [1200, 1400, 1600]) f.water.frame({ ...FRAME, now });
    assert.ok(f.water.state().frames >= 3, `至少画了 3 帧，实际 ${f.water.state().frames}`);
    assert.equal(f.water.shore(1600), expected(1600), '画了好几帧之后仍然有岸线');
    const clockless = make({ now: () => 7000 });
    clockless.water.start();
    clockless.water.frame({ width: 1440, height: 900 });
    assert.equal(clockless.water.shore(NaN), expected(7000), '没给有效时间就用控制器自己的时钟');
    assert.equal(f.water.surface, undefined, '旧的水面接口已经去掉（宿主与鱼只认岸线）');
    f.water.stop();
    assert.equal(f.water.shore(1000), null, '停了就没有岸线');

    const broken = make({}, { gl: makeGl({ failCompile: 2 }) });
    broken.water.start();
    broken.water.frame(FRAME);
    assert.equal(broken.water.state().failed, true);
    assert.equal(broken.water.shore(1000), null, '失败关闭后没有岸线，鱼不用躲');
});

// ---------- 样式 / 页面 / 设置的静态契约 ----------

function cssBlock(css, selector) {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `缺 ${selector}`);
    return css.slice(start, css.indexOf('}', start));
}

test('样式：海水画布固定在页面底部、高度等于核心的 BAND、不接收事件、用普通混合（不能用 screen：壁纸是 body 的背景，screen 看不到它）；层级在壁纸之上、宿主根容器之下；遮挡时隐藏；减少动态效果无过渡', () => {
    const css = read('css/aquarium.css');
    const rule = cssBlock(css, '.aq-water');
    assert.match(rule, /position: fixed/);
    assert.match(rule, /left: 0;/);
    assert.match(rule, /right: 0;/);
    assert.match(rule, /bottom: 0;/);
    assert.doesNotMatch(rule, /inset: 0|top:/, '不再铺满整页：画布只有底部一条带子，带子之外没有这张画布的任何像素（壁纸不会被遮）');
    const height = /height: ([\d.]+)%;/.exec(rule);
    assert.ok(height, '高度是百分比');
    assert.ok(Math.abs(Number(height[1]) / 100 - P.BAND) < 1e-9, `样式高度 ${height[1]}% 必须等于核心的 BAND ${P.BAND}（着色器按这个比例换算位置，不一致水线就错位）`);
    assert.match(rule, /pointer-events: none/);
    assert.doesNotMatch(rule, /mix-blend-mode/, '普通混合：画布输出的是预乘 alpha，水线以上渐隐为透明；screen 在 body 自成堆叠上下文时看不到壁纸，旧版因此把壁纸整个盖住');
    assert.match(rule, /opacity: 0/);
    assert.match(css, /\.aq-water\.is-on \{ opacity: 1; \}/);
    const waterZ = Number(/z-index: (\d+)/.exec(rule)[1]);
    const bgx = read('css/background-experience.css');
    const rootZ = Number(/z-index: (\d+)/.exec(cssBlock(bgx, '.bgx-root'))[1]);
    assert.ok(waterZ >= 1 && waterZ < rootZ, `海水层（${waterZ}）要在宿主根容器（${rootZ}）下面，否则会盖住鱼和水母；同时要高于壁纸层 0`);
    assert.match(css, /body\.home-background-suspended \.aq-water \{ display: none !important; \}/);
    assert.match(css, /html\.reduce-motion \.aq-water \{ transition: none; \}/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.aq-water \{ transition: none; \}/);
    assert.doesNotMatch(rule, /backdrop-filter|filter:/, '画布不叠滤镜');
});

test('index.html：三个水体脚本先于宿主、核心先于着色器先于控制器；样式钉子已更新', () => {
    const html = read('index.html');
    const idx = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(idx('js/aquarium.js?v=9') < idx('js/aquarium-water-core.js?v=3'));
    assert.ok(idx('js/aquarium-water-core.js?v=3') < idx('js/aquarium-water-shader.js?v=3'));
    assert.ok(idx('js/aquarium-water-shader.js?v=3') < idx('js/aquarium-water.js?v=3'));
    assert.ok(idx('js/aquarium-water.js?v=3') < idx('js/background-experience.js?v=21'));
    idx('css/aquarium.css?v=7');
    for (const file of ['js/aquarium-water-core.js', 'js/aquarium-water-shader.js', 'js/aquarium-water.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('设置页：有海水效果开关，默认开，保存键 aquariumWater；文案如实说明范围与限制', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumWater" checked/);
    const found = /<span class="sp-field-label">海水效果<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(found, '开关的标签是“海水效果”');
    const hint = found[1];
    assert.match(hint, /选了“水族馆”时/);
    assert.match(hint, /沙滩岸线/);                           // 2026-10-20：画面是页面底部的岸线，海浪冲上沙滩再退下去
    assert.match(hint, /潮水约一分钟一涨一落/);
    assert.match(hint, /壁纸其余部分原样/);                    // 如实说明：水只占底部一条，其余不遮壁纸
    assert.match(hint, /不会游进沙滩/);
    assert.match(hint, /用手拖着鱼时不受此限/);                // 如实说明：拖着鱼可以拖出水线以下（用户 2026-10-20 选择保持）
    assert.match(hint, /WebGL/);
    assert.match(hint, /不读也不写任何数据/);
    assert.match(hint, /软件渲染/);
    assert.match(hint, /省流量/);
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumWater: true,/);
    assert.match(page, /aquariumWater: stored\.aquariumWater !== false/);
    assert.match(page, /\['set-bgAquariumWater', 'aquariumWater', element => element\.checked\]/);
    assert.match(page, /aquariumWater\.checked = bgExperienceSettings\.aquariumWater/);
});
