const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/wallpaper-weave-core.js');
const Weave = require('../js/wallpaper-weave.js');

const tick = () => new Promise(resolve => setImmediate(resolve));
const item = name => ({ url: `https://images.example.com/${name}.jpg` });

function makeEnv({ renderer = 'ok', drawThrows = false, random = () => 0, failStyles = [] } = {}) {
    const log = { images: [], appended: [], removed: 0, draws: [], disposed: 0, renderers: 0, classes: [], requests: [], canvases: 0 };
    const frames = new Map();
    const timers = new Map();
    let frameId = 0, timerId = 0, clock = 0;
    const canvas = () => {
        log.canvases++;
        const listeners = {};
        const c = {
            className: '', width: 0, height: 0, listeners,
            classList: { add(name) { log.classes.push(name); } },
            setAttribute() {},
            addEventListener(name, fn) { listeners[name] = fn; },
            remove() { log.removed++; },
        };
        return c;
    };
    class FakeImage {
        constructor() { log.images.push(this); }
        set src(value) { this._src = value; }
        get src() { return this._src; }
    }
    const env = {
        document: { body: { appendChild(c) { log.appended.push(c); } }, createElement: () => canvas() },
        window: { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 },
        Image: FakeImage,
        requestAnimationFrame(cb) { frames.set(++frameId, cb); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(cb) { timers.set(++timerId, cb); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        now: () => clock,
        random: () => random(),
        createRenderer(canvasElement, options) {
            log.requests.push(options);
            if (renderer === 'none') return null;
            if (failStyles.includes(options.style)) return null;
            log.renderers++;
            return {
                draw(p) { if (drawThrows) throw new Error('boom'); log.draws.push(p); },
                dispose() { log.disposed++; },
            };
        },
    };
    return {
        env, log,
        loadAll(ok = true) {
            for (const image of log.images) {
                if (image._done) continue;
                image._done = true;
                ok ? image.onload?.() : image.onerror?.();
            }
        },
        advance(ms) {
            clock += ms;
            for (const [id, cb] of [...frames]) { frames.delete(id); cb(clock); }
        },
        fireTimers() { for (const [id, cb] of [...timers]) { timers.delete(id); cb(); } },
        frames, timers,
    };
}

test('加载完成后逐帧播放，结束时画布保持在最后一帧，release 后淡出并清理', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    assert.equal(f.log.images.length, 2);
    assert.ok(f.log.images.every(image => image.crossOrigin === 'anonymous'), '必须带 CORS 才能读成纹理');
    f.loadAll();
    await tick();
    assert.equal(f.log.appended.length, 1);
    assert.equal(f.log.appended[0].className, 'wallpaper-weave-canvas');
    f.advance(0);
    f.advance(Core.DURATION_MS / 2);
    f.advance(Core.DURATION_MS);
    const result = await promise;
    assert.equal(result.played, true);
    assert.equal(f.log.draws[f.log.draws.length - 1], 1, '最后一帧进度恰为 1');
    assert.ok(f.log.draws.every((value, index, all) => index === 0 || value >= all[index - 1]), '进度单调');
    assert.equal(f.log.removed, 0, 'release 之前画布还在，遮住 body 背景的切换');
    assert.equal(f.frames.size, 0, '结束后没有遗留的帧调度');
    result.release();
    assert.ok(f.log.classes.includes('is-releasing'));
    f.fireTimers();
    assert.equal(f.log.removed, 1);
    assert.equal(f.log.disposed, 1);
    result.release();
    assert.equal(f.log.disposed, 1, '重复 release 不重复释放');
});

test('图加载失败：不播放，并把对应地址记为不可跨域，之后 canPlay 直接拒绝', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.log.images[0]._done = true; f.log.images[0].onload();
    f.log.images[1]._done = true; f.log.images[1].onerror();
    const result = await promise;
    assert.equal(result.played, false);
    assert.equal(result.reason, 'load-failed');
    assert.equal(f.log.appended.length, 0);
    assert.equal(weave.blocked.has(item('b').url), true);
    assert.equal(weave.blocked.has(item('a').url), false);
    assert.equal(weave.canPlay({ from: item('a'), to: item('b') }).reason, 'blocked');
    assert.equal(weave.canPlay({ from: item('a'), to: item('c') }).ok, true);
});

test('加载超时同样视为失败', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.fireTimers();
    const result = await promise;
    assert.equal(result.played, false);
    assert.equal(result.reason, 'load-failed');
    // 超时之后迟到的 onload 不能让已结束的流程再次推进
    f.loadAll();
    await tick();
    assert.equal(f.log.appended.length, 0);
});

test('没有 WebGL：不创建画布，不播放', async () => {
    const f = makeEnv({ renderer: 'none' });
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.loadAll();
    const result = await promise;
    assert.deepEqual({ played: result.played, reason: result.reason }, { played: false, reason: 'no-webgl' });
    assert.equal(f.log.appended.length, 0);
});

test('加载中被新一轮取代：旧一轮返回 superseded，不创建画布', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const first = weave.play({ from: item('a'), to: item('b') });
    await tick();
    const second = weave.play({ from: item('a'), to: item('c') });
    await tick();
    f.loadAll();
    const firstResult = await first;
    assert.equal(firstResult.played, false);
    assert.equal(firstResult.reason, 'superseded');
    f.advance(0); f.advance(Core.DURATION_MS);
    const secondResult = await second;
    assert.equal(secondResult.played, true);
    assert.equal(f.log.appended.length, 1, '只有最新一轮出现画布');
    secondResult.release();
});

test('播放途中取消：立即移除画布、释放渲染器、没有遗留帧', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.loadAll();
    await tick();
    f.advance(0);
    f.advance(300);
    weave.cancel('suspended');
    const result = await promise;
    assert.deepEqual({ played: result.played, reason: result.reason }, { played: false, reason: 'suspended' });
    assert.equal(f.log.removed, 1);
    assert.equal(f.log.disposed, 1);
    assert.equal(f.frames.size, 0);
    const draws = f.log.draws.length;
    f.advance(500);
    assert.equal(f.log.draws.length, draws, '取消后不再绘制');
});

test('绘制抛错：收尾并释放，不留画布', async () => {
    const f = makeEnv({ drawThrows: true });
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.loadAll();
    await tick();
    f.advance(0);
    const result = await promise;
    assert.equal(result.reason, 'draw-failed');
    assert.equal(f.log.removed, 1);
    assert.equal(f.log.disposed, 1);
});

test('WebGL 上下文丢失：收尾', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.loadAll();
    await tick();
    f.log.appended[0].listeners.webglcontextlost({ preventDefault() {} });
    const result = await promise;
    assert.equal(result.reason, 'context-lost');
    assert.equal(f.log.removed, 1);
});

test('下一次转场的旧图复用上一次的新图，不再重复下载', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    let promise = weave.play({ from: item('a'), to: item('b') });
    await tick();
    f.loadAll();
    await tick();
    f.advance(0); f.advance(Core.DURATION_MS);
    (await promise).release();
    f.fireTimers();
    const before = f.log.images.length;
    promise = weave.play({ from: item('b'), to: item('c') });
    await tick();
    assert.equal(f.log.images.length - before, 1, '只下载新的目标图');
    f.loadAll();
    await tick();
    f.advance(0); f.advance(Core.DURATION_MS);
    assert.equal((await promise).played, true);
});

test('缺少 DOM 或参数时安全返回，不抛错', async () => {
    const weave = Weave.create({ document: null, window: null });
    assert.equal((await weave.play({ from: item('a'), to: item('b') })).played, false);
    const f = makeEnv();
    const normal = Weave.create(f.env);
    assert.equal((await normal.play({ from: null, to: item('b') })).reason, 'unavailable');
    normal.cancel();
});

// ---- 多种转场风格：随机、固定、回退 -------------------------------------------------------

async function playOnce(f, weave, options = {}) {
    const promise = weave.play({ from: item('a'), to: item('b'), ...options });
    await tick();
    f.loadAll();
    await tick();
    return promise;
}

async function finish(f, weave, options) {
    const promise = weave.play({ from: item('a'), to: item('b'), ...options });
    await tick();
    f.loadAll();
    await tick();
    f.advance(0);
    f.advance(5000);
    return promise;
}

test('默认每次随机：不与上一次连续重复，八种风格都会出现，渲染器拿到的就是选中的风格', async () => {
    let value = 0;
    const f = makeEnv({ random: () => { value = (value * 7919 + 0.1234567) % 1; return value; } });
    const weave = Weave.create(f.env);
    const seen = [];
    for (let i = 0; i < 80; i++) {
        const result = await finish(f, weave);
        assert.equal(result.played, true);
        assert.ok(Core.STYLE_IDS.includes(result.style), result.style);
        assert.equal(f.log.requests[f.log.requests.length - 1].style, result.style, '渲染器拿到的风格与返回值一致');
        seen.push(result.style);
        result.release();
        f.fireTimers();
    }
    for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `第 ${i} 次与上一次重复`);
    assert.equal(new Set(seen).size, Core.STYLE_IDS.length, `只出现了 ${[...new Set(seen)].join(',')}`);
});

test('设置里固定某一种风格：每次都用它，且使用该风格自己的时长', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    for (let i = 0; i < 3; i++) {
        const promise = weave.play({ from: item('a'), to: item('b'), style: 'ink' });
        await tick();
        f.loadAll();
        await tick();
        f.advance(0);
        f.advance(Core.durationFor('ink') - 1);
        assert.equal(f.frames.size, 1, '还没到该风格的时长，仍在播放');
        f.advance(1);
        const result = await promise;
        assert.equal(result.style, 'ink');
        assert.equal(f.log.draws[f.log.draws.length - 1], 1);
        result.release();
        f.fireTimers();
    }
    assert.ok(f.log.requests.every(request => request.style === 'ink'));
});

test('未知或被手改坏的风格值按随机处理，不会抛错也不会选出不存在的风格', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    for (const bad of ['bogus', '', null, 42, '__proto__', 'Ripple']) {
        const result = await finish(f, weave, { style: bad });
        assert.equal(result.played, true, String(bad));
        assert.ok(Core.STYLE_IDS.includes(result.style), `${bad} → ${result.style}`);
        result.release();
        f.fireTimers();
    }
});

test('显式传入 duration 优先于风格默认时长', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = weave.play({ from: item('a'), to: item('b'), style: 'swirl', duration: 400 });
    await tick();
    f.loadAll();
    await tick();
    f.advance(0);
    f.advance(400);
    assert.equal((await promise).played, true);
});

test('某种风格的着色器编不过：同一次播放里用新画布改用编织重试，并且本页内不再抽到它', async () => {
    const f = makeEnv({ failStyles: ['ripple'] });
    const weave = Weave.create(f.env);
    const canvasesBefore = f.log.canvases;
    const result = await finish(f, weave, { style: 'ripple' });
    assert.equal(result.played, true);
    assert.equal(result.style, 'weave', '回退到编织');
    assert.deepEqual(f.log.requests.map(request => request.style), ['ripple', 'weave'], '先试选中的，再试编织');
    assert.equal(f.log.canvases - canvasesBefore, 2, '失败的画布不复用');
    assert.equal(f.log.appended.length, 1, '只有成功的那块画布进入页面');
    assert.equal(weave.broken.has('ripple'), true);
    result.release();
    f.fireTimers();

    // 之后的随机里不会再出现 ripple；即使用户固定了它，也直接用编织而不是再编译一次
    let value = 0;
    const g = makeEnv({ failStyles: ['ripple'], random: () => { value = (value * 7919 + 0.321) % 1; return value; } });
    const weave2 = Weave.create(g.env);
    await finish(g, weave2, { style: 'ripple' });
    const picked = [];
    for (let i = 0; i < 40; i++) { const r = await finish(g, weave2); picked.push(r.style); r.release(); g.fireTimers(); }
    assert.ok(!picked.includes('ripple'));
    const pinned = await finish(g, weave2, { style: 'ripple' });
    assert.equal(pinned.style, 'weave');
    assert.equal(g.log.requests[g.log.requests.length - 1].style, 'weave');
});

test('编织本身也建不起来（没有 WebGL）：不播放，不把风格标记为损坏', async () => {
    const f = makeEnv({ renderer: 'none' });
    const weave = Weave.create(f.env);
    const result = await playOnce(f, weave, { style: 'zoom' });
    assert.deepEqual({ played: result.played, reason: result.reason }, { played: false, reason: 'no-webgl' });
    assert.deepEqual(f.log.requests.map(request => request.style), ['zoom', 'weave']);
    assert.equal(weave.broken.size, 0, 'WebGL 整体不可用不是某种风格的问题');
    assert.equal(f.log.appended.length, 0);
});

test('播放被取消或绘制失败时，返回值仍带着实际使用的风格，方便诊断', async () => {
    const f = makeEnv();
    const weave = Weave.create(f.env);
    const promise = playOnce(f, weave, { style: 'mosaic' });
    await tick();
    weave.cancel('suspended');
    const result = await promise;
    assert.equal(result.reason, 'suspended');
    assert.equal(result.style, 'mosaic');
});

test('每次播放的种子取自注入的随机源：不同次播放种子不同', async () => {
    let n = 0;
    const f = makeEnv({ random: () => { n += 0.173; return n % 1; } });
    const weave = Weave.create(f.env);
    for (let i = 0; i < 3; i++) { const r = await finish(f, weave); r.release(); f.fireTimers(); }
    const seeds = f.log.requests.map(request => request.seed);
    assert.equal(new Set(seeds).size, 3);
});

// ---- 着色器源码的静态检查（真实编译在 Chromium 里逐风格实测，见技术文档） ------------------

test('每种已注册风格都有完整着色器：一个入口、一个 transition()、端点直通', () => {
    assert.deepEqual(Object.keys(Weave.FRAGMENTS).sort(), [...Core.STYLE_IDS].sort());
    for (const id of Core.STYLE_IDS) {
        const source = Weave.FRAGMENTS[id];
        assert.equal((source.match(/void main\(\)/g) || []).length, 1, `${id}: main 只能有一个`);
        assert.equal((source.match(/vec3 transition\(vec2 uv, float p\)/g) || []).length, 1, `${id}: transition 只能有一个`);
        assert.match(source, /if \(uProgress <= 0\.0\) \{ gl_FragColor = vec4\(texFrom\(vUv\)\.rgb, 1\.0\); return; \}/, `${id}: 进度 0 直接输出旧图`);
        assert.match(source, /if \(uProgress >= 1\.0\) \{ gl_FragColor = vec4\(texTo\(vUv\)\.rgb, 1\.0\); return; \}/, `${id}: 进度 1 直接输出新图`);
        // 括号必须配平（真实编译之外的最低限度防线）
        for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
            assert.equal(source.split(open).length, source.split(close).length, `${id}: ${open}${close} 不配平`);
        }
        assert.ok(Weave.BODIES[id].trim().length > 100, id);
    }
    assert.equal(Object.keys(Weave.BODIES).length, Core.STYLE_IDS.length, '没有多余的着色器实现');
});

test('着色器里写死常数的 smoothstep 必须 edge0 < edge1（反向边界在 GLSL 里结果未定义）', () => {
    for (const id of Core.STYLE_IDS) {
        const pattern = /smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g;
        let match;
        while ((match = pattern.exec(Weave.FRAGMENTS[id]))) {
            assert.ok(Number(match[1]) < Number(match[2]), `${id}: smoothstep(${match[1]}, ${match[2]}, …)`);
        }
        // 边界含变量的写法（如 smoothstep(thr - w, thr + w, x)）：必须是“减在前、加在后”的对称形式。
        for (const dynamic of Weave.FRAGMENTS[id].matchAll(/smoothstep\(\s*(\w+) - (\w+),\s*(\w+) \+ (\w+),/g)) {
            assert.equal(dynamic[1], dynamic[3], `${id}: ${dynamic[0]}`);
            assert.equal(dynamic[2], dynamic[4], `${id}: ${dynamic[0]}`);
        }
    }
});

test('着色器只用 GLSL ES 1.00 允许的写法：没有 texelFetch、整型位运算、动态循环上界', () => {
    for (const id of Core.STYLE_IDS) {
        const source = Weave.FRAGMENTS[id];
        assert.doesNotMatch(source, /texelFetch|textureLod|\bin\s+vec|\bout\s+vec|#version/, id);
        for (const match of source.matchAll(/for \(int \w+ = 0; \w+ < (\w+);/g)) assert.match(match[1], /^\d+$/, `${id}: 循环上界必须是常量`);
    }
});

test('createRenderer 对未登记的风格用编织，没有 WebGL 时返回 null', () => {
    const canvas = { getContext: () => null };
    assert.equal(Weave.createRenderer(canvas, { fromImage: {}, toImage: {}, width: 10, height: 10, seed: 1, style: 'zoom' }), null);
    const throwing = { getContext() { throw new Error('no gl'); } };
    assert.equal(Weave.createRenderer(throwing, { fromImage: {}, toImage: {}, width: 10, height: 10, seed: 1 }), null);
});
