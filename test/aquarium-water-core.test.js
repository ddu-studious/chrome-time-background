// 水体层纯逻辑（js/aquarium-water-core.js）：渲染尺寸、帧节流、着色器时间与 uniform 取值。
// 属于“业务替身 + 静态”层：这里只守数字合同；画面好不好看、着色器能否编译链接由真实浏览器验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-water-core.js');

const P = Core.PARAMS;

test('PARAMS：冻结、数值关系自洽（省流量不比常规更清晰/更快）', () => {
    assert.ok(Object.isFrozen(P));
    assert.ok(P.SCALE > 0 && P.SCALE <= 1);
    assert.ok(P.SCALE_LOW > 0 && P.SCALE_LOW <= P.SCALE, '省流量的分辨率比例不高于常规');
    assert.ok(P.FPS_LOW > 0 && P.FPS_LOW <= P.FPS, '省流量的帧率不高于常规');
    assert.ok(P.MAX_PIXELS >= 100000 && P.MAX_PIXELS <= 1000000, '像素上限是个有界的小数字（半分辨率画布）');
    assert.ok(P.MIN_SIDE >= 16);
    assert.ok(P.AMOUNT_BASE > 0 && P.AMOUNT_BASE + P.AMOUNT_SPAN <= 1.0001, '强度映射不会超过 1');
    assert.ok(P.SUN_X > 0 && P.SUN_X < 1);
    assert.ok(P.TIME_WRAP >= 3600);
});

// ---------- renderSize ----------

test('renderSize：按比例缩小并取整；省流量更小', () => {
    assert.deepEqual(Core.renderSize({ width: 1440, height: 900 }), { w: 720, h: 450 });
    const low = Core.renderSize({ width: 1440, height: 900, lowPower: true });
    assert.deepEqual(low, { w: Math.round(1440 * P.SCALE_LOW), h: Math.round(900 * P.SCALE_LOW) });
    assert.ok(low.w < 720 && low.h < 450);
});

test('renderSize：超大屏被像素上限压住，并保持宽高比', () => {
    for (const [width, height] of [[5120, 2880], [7680, 4320], [3840, 2160], [10000, 600]]) {
        const size = Core.renderSize({ width, height });
        assert.ok(size.w * size.h <= P.MAX_PIXELS * 1.01, `${width}x${height} -> ${size.w}x${size.h}`);
        assert.ok(Math.abs(size.w / size.h - width / height) / (width / height) < 0.05, '宽高比基本不变');
    }
    const huge = Core.renderSize({ width: 5120, height: 2880 });
    assert.ok(huge.w * huge.h > P.MAX_PIXELS * 0.8, '压到上限附近而不是缩得过头');
});

test('renderSize：无效的页面尺寸返回 null（不建画布）；很小的页面把边长抬到下限', () => {
    for (const bad of [{}, { width: 0, height: 900 }, { width: 1440, height: 0 }, { width: -1, height: -1 }, { width: NaN, height: 900 }, { width: 1440, height: Infinity }, { width: '1440', height: 900 }, { width: null, height: null }, { width: undefined, height: 900 }]) {
        assert.equal(Core.renderSize(bad), null, JSON.stringify(bad));
    }
    assert.deepEqual(Core.renderSize({ width: 40, height: 40 }), { w: P.MIN_SIDE, h: P.MIN_SIDE }, '很小的页面：边长抬到 MIN_SIDE，而不是建出 0 或 1 像素的画布');
    assert.equal(Core.renderSize(), null);
    assert.equal(Core.renderSize(null), null);
});

test('renderSize：永远是正整数', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1511, 982], [2560, 1440], [390, 844], [844, 390]]) {
        for (const lowPower of [false, true]) {
            const size = Core.renderSize({ width: w, height: h, lowPower });
            if (!size) continue;
            assert.ok(Number.isInteger(size.w) && Number.isInteger(size.h) && size.w >= P.MIN_SIDE && size.h >= P.MIN_SIDE);
        }
    }
});

// ---------- frameDue ----------

test('frameDue：按目标帧率节流（容忍一毫秒的调度抖动）', () => {
    const interval = 1000 / P.FPS;
    assert.equal(Core.frameDue({ now: 1000, last: 1000 }), false);
    assert.equal(Core.frameDue({ now: 1000 + interval * 0.5, last: 1000 }), false);
    assert.equal(Core.frameDue({ now: 1000 + interval - 0.5, last: 1000 }), true, '差不到 1 ms 也算到点，否则 60 Hz 屏上会隔帧丢到 20 fps');
    assert.equal(Core.frameDue({ now: 1000 + interval, last: 1000 }), true);
    assert.equal(Core.frameDue({ now: 1000 + 500, last: 1000 }), true);
});

test('frameDue：省流量更慢', () => {
    const lowInterval = 1000 / P.FPS_LOW;
    assert.equal(Core.frameDue({ now: 1000 + 1000 / P.FPS + 2, last: 1000, lowPower: true }), false);
    assert.equal(Core.frameDue({ now: 1000 + lowInterval, last: 1000, lowPower: true }), true);
});

test('frameDue：非法时间——now 非有限不画；last 非有限或时钟倒退立即画', () => {
    assert.equal(Core.frameDue({ now: NaN, last: 0 }), false);
    assert.equal(Core.frameDue({ now: Infinity, last: 0 }), false);
    assert.equal(Core.frameDue({ now: undefined, last: 0 }), false);
    assert.equal(Core.frameDue({ now: 500, last: -Infinity }), true, '第一帧');
    assert.equal(Core.frameDue({ now: 500, last: NaN }), true);
    assert.equal(Core.frameDue({ now: 500, last: 900 }), true, '时钟倒退（页面时间被重置）不能卡住');
});

// ---------- shaderTime ----------

test('shaderTime：毫秒转秒并按周期回绕，保持 float 精度；无效值回 0', () => {
    assert.equal(Core.shaderTime(0), 0);
    assert.equal(Core.shaderTime(2500), 2.5);
    assert.equal(Core.shaderTime(P.TIME_WRAP * 1000), 0);
    assert.ok(Math.abs(Core.shaderTime((P.TIME_WRAP + 3) * 1000) - 3) < 1e-9);
    for (const ms of [1e3, 1e6, 1e9, 1e12]) {
        const t = Core.shaderTime(ms);
        assert.ok(t >= 0 && t < P.TIME_WRAP, `${ms} -> ${t}`);
    }
    for (const bad of [NaN, Infinity, -Infinity, -5, undefined, null, '12']) assert.equal(Core.shaderTime(bad), 0, String(bad));
});

// ---------- uniformsFor ----------

test('uniformsFor：强度映射到 [BASE, BASE+SPAN]，缺省按 0.65', () => {
    const at = amount => Core.uniformsFor({ now: 0, amount, night: 0 }).amount;
    assert.ok(Math.abs(at(0) - P.AMOUNT_BASE) < 1e-9);
    assert.ok(Math.abs(at(1) - (P.AMOUNT_BASE + P.AMOUNT_SPAN)) < 1e-9);
    assert.ok(Math.abs(at(0.65) - (P.AMOUNT_BASE + P.AMOUNT_SPAN * 0.65)) < 1e-9);
    assert.ok(Math.abs(at(undefined) - at(0.65)) < 1e-9);
    assert.ok(Math.abs(at(NaN) - at(0.65)) < 1e-9, '非有限视为缺省');
    assert.ok(at(5) <= P.AMOUNT_BASE + P.AMOUNT_SPAN + 1e-9, '超出范围被夹住');
    assert.ok(at(-3) >= P.AMOUNT_BASE - 1e-9);
    assert.ok(at(0.2) < at(0.8), '强度单调');
});

test('uniformsFor：夜晚夹在 0…1；质量由省流量决定；太阳位置固定', () => {
    const u = o => Core.uniformsFor(Object.assign({ now: 1000, amount: 0.5, night: 0 }, o));
    assert.equal(u({ night: -1 }).night, 0);
    assert.equal(u({ night: 2 }).night, 1);
    assert.equal(u({ night: 0.4 }).night, 0.4);
    assert.equal(u({ night: NaN }).night, 0);
    assert.equal(u({ night: undefined }).night, 0);
    assert.equal(u({ lowPower: true }).quality, 0);
    assert.equal(u({ lowPower: false }).quality, 1);
    assert.equal(u({}).quality, 1);
    assert.equal(u({}).sunX, P.SUN_X);
    assert.equal(u({ now: 2500 }).time, 2.5);
});

test('uniformsFor：只返回着色器认识的这五项，且全是有限数字', () => {
    const out = Core.uniformsFor({ now: 12345, amount: 0.7, night: 0.3 });
    assert.deepEqual(Object.keys(out).sort(), ['amount', 'night', 'quality', 'sunX', 'time']);
    for (const value of Object.values(out)) assert.ok(Number.isFinite(value));
    assert.doesNotThrow(() => Core.uniformsFor());
    assert.doesNotThrow(() => Core.uniformsFor(null));
});

// ---------- isSoftwareRenderer ----------

test('isSoftwareRenderer：识别 SwiftShader / llvmpipe / softpipe / Software / Basic Render；硬件显卡与异常输入都不是', () => {
    for (const name of [
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)',
        'Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'softpipe', 'Apple Software Renderer', 'Microsoft Basic Render Driver', 'Mesa Software Rasterizer',
    ]) assert.equal(Core.isSoftwareRenderer(name), true, name);
    for (const name of [
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)',
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'AMD Radeon Pro 5500M OpenGL Engine', '',
    ]) assert.equal(Core.isSoftwareRenderer(name), false, name);
    for (const bad of [undefined, null, 5, {}, [], NaN]) assert.equal(Core.isSoftwareRenderer(bad), false, String(bad));
});

// ---------- createGovernor ----------

function drive(governor, gap, count, start = 0) {
    let now = start;
    for (let i = 0; i < count; i++) { now += gap; governor.observe(now); }
    return now;
}

/** 把一个流畅（16 ms 一帧）的页面喂到刚好开始监护：返回当前时刻（此时统计窗口是空的）。 */
function armUp(governor, start = 0) {
    let now = start;
    while (!governor.armed()) {
        if (now > start + 120000) throw new Error('监护一直没有开始');
        now += 16;
        governor.observe(now);
    }
    return now;
}

test('createGovernor：GOV 参数自洽；流畅时（60 fps 与 30 fps）一直是 0 级，预热之后开始监护', () => {
    assert.ok(P.GOV_SLOW_MS > 1000 / 30 && P.GOV_MAX_GAP > P.GOV_SLOW_MS && P.GOV_MIN_SAMPLES >= 10);
    assert.ok(P.GOV_WARMUP_MS >= 2000 && P.GOV_SETTLE_MAX_MS > P.GOV_WARMUP_MS, '预热至少 2 秒，等页面流畅的上限比预热长');
    assert.equal(P.GOV_STOP_MS, undefined, '没有“直接关闭线”：不论多慢都先降到 1 级、下一个窗口仍慢才关闭');
    for (const gap of [16.7, 33]) {
        const governor = Core.createGovernor();
        assert.equal(governor.level(), 0);
        assert.equal(governor.armed(), false, '一开始还没有监护');
        drive(governor, gap, 600);
        assert.equal(governor.level(), 0, `${gap} ms 一帧不降级`);
        assert.equal(governor.armed(), true, '页面流畅：预热之后开始监护');
    }
});

test('createGovernor：预热期不计——刚打开页面时再卡也不降级；预热之后页面流畅了才开始监护，启动期的卡顿不算在海水层头上', () => {
    const governor = Core.createGovernor();
    let now = drive(governor, 200, Math.floor((P.GOV_WARMUP_MS - 100) / 200));       // 预热里整整几秒每帧 200 ms（页面启动的卡顿）
    assert.equal(governor.level(), 0);
    assert.equal(governor.armed(), false);
    now = drive(governor, 16, 100, now);
    assert.equal(governor.armed(), true, '启动卡顿过去、页面流畅了：开始监护');
    drive(governor, 16, 600, now);
    assert.equal(governor.level(), 0, '一直流畅就一直是 0 级');
});

test('createGovernor：一直不流畅的页面（机器本身很忙）不会被早早关掉——等到 GOV_SETTLE_MAX_MS 才开始监护，开始监护的那个窗口不扣分，之后每个偏慢的窗口降一级', () => {
    const governor = Core.createGovernor();
    let now = 0;
    let first = null;
    while (!governor.armed()) {
        if (now > 200000) throw new Error('监护一直没有开始');
        now += 100;
        if (first === null) first = now;
        governor.observe(now);
        if (!governor.armed()) assert.equal(governor.level(), 0, `还没开始监护，不降级（${now - first} ms）`);
    }
    assert.ok(now - first >= P.GOV_SETTLE_MAX_MS, `等到上限才开始监护（${now - first} ms）`);
    assert.ok(now - first < P.GOV_SETTLE_MAX_MS + 5000, '上限一到、下一个窗口结束就开始，不再多等');
    assert.equal(governor.level(), 0, '开始监护的那个窗口只是开始，不扣分');
    const steps = [];
    for (let i = 0; i < 3 * (P.GOV_MIN_SAMPLES + 1) && governor.level() < 2; i++) {
        now += 100;
        const before = governor.level();
        governor.observe(now);
        if (governor.level() !== before) steps.push(governor.level());
    }
    assert.deepEqual(steps, [1, 2], '之后每个偏慢的窗口降一级：先 1 级（省流量），下一个仍慢才关闭');
});

test('createGovernor：页面流畅过之后变慢——第一个偏慢的窗口 → 1 级，第二个 → 2 级（再慢的窗口也只降一级）；只升不降', () => {
    const slow = Core.createGovernor();
    let now = armUp(slow);
    now = drive(slow, 200, P.GOV_MIN_SAMPLES, now);            // 中位数 200 ms（约 5 fps）也只是先降一级
    assert.equal(slow.level(), 1);
    now = drive(slow, 50, P.GOV_MIN_SAMPLES, now);
    assert.equal(slow.level(), 2);
    drive(slow, 16, 200, now);
    assert.equal(slow.level(), 2, '关闭之后不会自己回来');

    const degraded = Core.createGovernor();
    now = armUp(degraded);
    now = drive(degraded, 50, P.GOV_MIN_SAMPLES, now);
    assert.equal(degraded.level(), 1);
    drive(degraded, 16, 400, now);
    assert.equal(degraded.level(), 1, '降级后恢复流畅：保持在 1 级，不升回 0');
});

test('createGovernor：用中位数而不是平均数——偶发的卡顿帧不触发降级；窗口没攒满不判定', () => {
    const governor = Core.createGovernor();
    let now = armUp(governor);
    for (let i = 0; i < 400; i++) { now += i % 10 === 0 ? 300 : 16; governor.observe(now); }       // 十分之一的帧卡 300 ms，中位数仍是 16
    assert.equal(governor.level(), 0);
    const early = Core.createGovernor();
    drive(early, 200, P.GOV_MIN_SAMPLES - 2, armUp(early));
    assert.equal(early.level(), 0, '样本不够不判定');
});

test('createGovernor：间隔超过 GOV_MAX_GAP（页面被暂停）、时间倒退、非有限时间都不计入', () => {
    const governor = Core.createGovernor();
    let now = 0;
    for (let i = 0; i < 100; i++) { now += (i % 5 === 0) ? P.GOV_MAX_GAP + 500 : 16; governor.observe(now); }
    assert.equal(governor.level(), 0);
    for (const bad of [NaN, Infinity, undefined, null]) assert.equal(governor.observe(bad), 0);
    assert.equal(governor.observe(now - 100), 0, '时间倒退不计入');
    const garbage = Core.createGovernor();
    for (let i = 0; i < 100; i++) garbage.observe(NaN);
    assert.equal(garbage.level(), 0);
});

test('createGovernor：预热期里偶然的流畅窗口不算数——不能凭刚打开时的几秒流畅就开始监护，之后启动期的卡顿才不被扣分', () => {
    const governor = Core.createGovernor();
    let now = drive(governor, 16, Math.floor((P.GOV_WARMUP_MS - 400) / 16));       // 预热里页面一时流畅（足够攒满好几个窗口）
    assert.equal(governor.armed(), false, '预热期内不开始监护');
    now = drive(governor, 200, 60, now);                                            // 预热结束后页面真正的启动卡顿
    assert.equal(governor.level(), 0, '启动卡顿不扣分');
    assert.equal(governor.armed(), false, '预热之后页面没流畅过，仍在等');
});

test('createGovernor：边界——中位数恰好等于 GOV_SLOW_MS 算流畅（开始监护、也不降级）；间隔恰好等于 GOV_MAX_GAP 仍计入', () => {
    const edge = Core.createGovernor();
    let now = drive(edge, P.GOV_SLOW_MS, Math.ceil(P.GOV_WARMUP_MS / P.GOV_SLOW_MS) + P.GOV_MIN_SAMPLES + 2);
    assert.equal(edge.armed(), true, '恰好 40 ms 一帧：流畅，开始监护');
    drive(edge, P.GOV_SLOW_MS, 4 * P.GOV_MIN_SAMPLES, now);
    assert.equal(edge.level(), 0, '恰好等于慢线不算慢');

    const limit = Core.createGovernor();
    now = armUp(limit);
    drive(limit, P.GOV_MAX_GAP, P.GOV_MIN_SAMPLES, now);
    assert.equal(limit.level(), 1, '间隔恰好是 GOV_MAX_GAP：仍是页面的真实卡顿，计入');

    const paused = Core.createGovernor();
    now = armUp(paused);
    drive(paused, P.GOV_MAX_GAP + 1, 4 * P.GOV_MIN_SAMPLES, now);
    assert.equal(paused.level(), 0, '再长一毫秒就当作页面被暂停过，不计入');
});

test('createGovernor：时间倒退的观察不进窗口（否则负数间隔会把中位数拉低、盖住真实的卡顿）', () => {
    const governor = Core.createGovernor();
    let now = armUp(governor);
    for (let i = 0; i < 4 * P.GOV_MIN_SAMPLES && governor.level() === 0; i++) {
        now += 100; governor.observe(now);       // 真实的一步：间隔 100 ms
        now -= 10; governor.observe(now);        // 两次倒退：不计
        now -= 10; governor.observe(now);
    }
    assert.equal(governor.level(), 1, '只有前进的间隔进窗口：中位数 100 ms，降到 1 级');
});

test('createGovernor：取中位数不是最小值——窗口里有一部分流畅帧，多数帧仍慢，就是慢', () => {
    const governor = Core.createGovernor();
    let now = armUp(governor);
    const pattern = [16, 16, 16, 16, 16, 16, 16, 16, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    assert.equal(pattern.length, P.GOV_MIN_SAMPLES);
    for (const gap of pattern) { now += gap; governor.observe(now); }
    assert.equal(governor.level(), 1, '12 个慢的、8 个快的：中位数是慢的');
});

test('核心是纯逻辑：不碰 DOM、时钟、随机数与 chrome', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const text = fs.readFileSync(path.join(__dirname, '..', 'js', 'aquarium-water-core.js'), 'utf8');
    const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\(function \(root, factory\)[\s\S]*?\}\)\(typeof window[^\n]*\n/, '');
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|\bDate\b|chrome\.|Math\.random|requestAnimationFrame|setTimeout|setInterval|performance\./);
});
