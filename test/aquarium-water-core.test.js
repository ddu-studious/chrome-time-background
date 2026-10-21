// 水体层纯逻辑（js/aquarium-water-core.js）：渲染尺寸、帧节流、着色器时间、潮汐与岸线浪的时间线、uniform 取值。
// 属于“业务替身 + 静态”层：这里只守数字合同；画面好不好看、着色器能否编译链接由真实浏览器验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-water-core.js');

const P = Core.PARAMS;

test('PARAMS：冻结、数值关系自洽（省流量不比常规更清晰/更快）；岸线几何不遮壁纸、不出页面', () => {
    assert.ok(Object.isFrozen(P) && Object.isFrozen(P.SET_AMPS), '整张表与一组浪的大小都冻结');
    assert.ok(P.SCALE > 0 && P.SCALE <= 1);
    assert.ok(P.SCALE_LOW > 0 && P.SCALE_LOW <= P.SCALE, '省流量的分辨率比例不高于常规');
    assert.ok(P.FPS_LOW > 0 && P.FPS_LOW <= P.FPS, '省流量的帧率不高于常规');
    assert.ok(P.MAX_PIXELS >= 100000 && P.MAX_PIXELS <= 1000000, '像素上限是个有界的小数字（半分辨率、只有底部一条带子）');
    assert.ok(P.MIN_SIDE >= 16);
    assert.ok(P.AMOUNT_BASE > 0 && P.AMOUNT_BASE + P.AMOUNT_SPAN <= 1.0001, '强度映射不会超过 1');
    assert.ok(P.TIME_WRAP >= 3600);
    // 不遮壁纸的硬界线：带子只占页面底部不到一半；岸线最高处（含起伏）与水的渐隐范围都落在带子里，水不会在带子顶上被硬切
    assert.ok(P.BAND > 0.2 && P.BAND < 0.5, `带子高度 ${P.BAND}：壁纸大部分原样可见`);
    assert.ok(Core.shoreTopMax() < P.BAND * 0.75, `岸线最高处 ${Core.shoreTopMax().toFixed(3)} 留出足够的渐隐空间（带子 ${P.BAND}）`);
    assert.ok(P.TOP_MID - P.TIDE_AMP > 0.08, '涨潮时水线退到最高处也不贴着页面底边，沙滩一直露得出来');
    assert.ok(P.TOP_MID + P.TIDE_AMP + P.APPROACH_DIST + 0.004 <= P.BAND, '下一道浪的起点不会超出带子（超出的部分会被渐隐吃掉）');
    assert.ok(P.REACH > 0 && P.REACH_TIDE >= 0 && P.REACH_TIDE < 0.5);
    assert.ok(P.SET_AMPS.length >= 3 && P.SET_AMPS.every(v => v > 0 && v <= 1) && Math.max(...P.SET_AMPS) === 1, '一组浪里有大有小，最大的是 1');
    assert.ok(P.RISE > 0.1 && P.RISE < 0.5, '冲上沙滩只占浪周期的一小段（来得急、退得缓）');
    assert.ok(P.APPROACH > 0.3 && P.APPROACH < 0.9 && P.SHEAR > 0 && P.SHEAR < 1 && P.AMP_WOBBLE >= 0 && P.AMP_WOBBLE < 0.5);
    assert.ok(P.LAT_A >= 0 && P.LAT_B >= 0 && P.RILL >= 0 && P.LAT_A + P.LAT_B + P.RILL < 0.05, '水线沿横向的起伏远小于浪的冲刷深度');
});

// ---------- renderSize ----------

test('renderSize：按比例缩小并取整；省流量更小', () => {
    assert.deepEqual(Core.renderSize({ width: 1000, height: 600 }), { w: 500, h: 300 });
    const low = Core.renderSize({ width: 1000, height: 600, lowPower: true });
    assert.deepEqual(low, { w: Math.round(1000 * P.SCALE_LOW), h: Math.round(600 * P.SCALE_LOW) });
    assert.ok(low.w < 500 && low.h < 300);
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

// ---------- bandSize ----------

test('bandSize：画布只有页面底部的一条带子——高度按 BAND 取，再按比例缩；省流量更小', () => {
    assert.deepEqual(Core.bandSize({ width: 1440, height: 900 }), { w: 720, h: Math.round(900 * P.BAND * P.SCALE) });
    assert.deepEqual(Core.bandSize({ width: 1440, height: 900 }), { w: 720, h: 153 });
    const low = Core.bandSize({ width: 1440, height: 900, lowPower: true });
    assert.deepEqual(low, { w: 432, h: 92 });
    const full = Core.bandSize({ width: 1440, height: 900 });
    assert.ok(Math.abs(full.w * full.h - 1440 * 900 * P.SCALE * P.SCALE * P.BAND) < 1500, '像素数只有整页半分辨率画布的 BAND 倍');
});

test('bandSize：超大屏被像素上限压住并保持带子的宽高比；无效尺寸返回 null；很小的页面抬到下限', () => {
    for (const [width, height] of [[5120, 2880], [7680, 4320], [3840, 2160], [10000, 600]]) {
        const size = Core.bandSize({ width, height });
        assert.ok(size.w * size.h <= P.MAX_PIXELS * 1.01, `${width}x${height} -> ${size.w}x${size.h}`);
        const ratio = width / (height * P.BAND);
        assert.ok(Math.abs(size.w / size.h - ratio) / ratio < 0.05, '带子的宽高比基本不变');
    }
    for (const bad of [{}, { width: 0, height: 900 }, { width: 1440, height: 0 }, { width: NaN, height: 900 }, { width: 1440, height: Infinity }, { width: '1440', height: 900 }, { width: 1440, height: '900' }, { width: -1, height: -1 }]) {
        assert.equal(Core.bandSize(bad), null, JSON.stringify(bad));
    }
    assert.equal(Core.bandSize(), null);
    assert.equal(Core.bandSize(null), null);
    assert.deepEqual(Core.bandSize({ width: 60, height: 60 }), { w: P.MIN_SIDE, h: P.MIN_SIDE });
    assert.deepEqual(Core.bandSize({ width: 1, height: 1 }), { w: P.MIN_SIDE, h: P.MIN_SIDE }, '一个像素的页面也是合法尺寸：抬到下限，而不是被当成无效');
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

test('uniformsFor：夜晚夹在 0…1；质量由省流量决定；带子比例固定；宽高比取自页面尺寸（缺失或不合法时按 16:9）', () => {
    const u = o => Core.uniformsFor(Object.assign({ now: 1000, amount: 0.5, night: 0 }, o));
    assert.equal(u({ night: -1 }).night, 0);
    assert.equal(u({ night: 2 }).night, 1);
    assert.equal(u({ night: 0.4 }).night, 0.4);
    assert.equal(u({ night: NaN }).night, 0);
    assert.equal(u({ night: undefined }).night, 0);
    assert.equal(u({ lowPower: true }).quality, 0);
    assert.equal(u({ lowPower: false }).quality, 1);
    assert.equal(u({}).quality, 1);
    assert.equal(u({}).band, P.BAND);
    assert.equal(u({ now: 2500 }).time, 2.5);
    assert.equal(u({ width: 1440, height: 900 }).aspect, 1.6);
    assert.equal(u({ width: 2560, height: 1080 }).aspect, 2560 / 1080);
    for (const bad of [{}, { width: 0, height: 900 }, { width: 1440, height: 0 }, { width: NaN, height: 900 }, { width: -5, height: 900 }, { width: Infinity, height: 900 }]) {
        assert.equal(u(bad).aspect, 16 / 9, JSON.stringify(bad));
    }
});

test('uniformsFor：只返回着色器认识的这九项，且全是有限数字；潮汐三项与 tideOf 同一份数字', () => {
    const out = Core.uniformsFor({ now: 12345, amount: 0.7, night: 0.3, width: 1440, height: 900 });
    assert.deepEqual(Object.keys(out).sort(), ['amount', 'aspect', 'band', 'night', 'quality', 'reach', 'tideV', 'time', 'top']);
    for (const value of Object.values(out)) assert.ok(Number.isFinite(value));
    const tide = Core.tideOf(out.time);
    for (const key of ['top', 'reach', 'tideV']) assert.equal(out[key], tide[key], key);
    assert.doesNotThrow(() => Core.uniformsFor());
    assert.doesNotThrow(() => Core.uniformsFor(null));
    for (const bad of [NaN, Infinity, -Infinity, -5, undefined, null, '12']) {
        const safe = Core.uniformsFor({ now: bad, amount: 0.5, night: 0 });
        for (const value of Object.values(safe)) assert.ok(Number.isFinite(value), `now=${String(bad)}`);
    }
});

// ---------- 潮汐（tideOf） ----------

const grid = (from, to, step) => { const out = []; for (let t = from; t <= to + 1e-9; t += step) out.push(t); return out; };

test('潮汐与浪的周期：都是着色器时间回绕周期的约数（回绕那一刻水线连续）；潮汐一个来回要“看得出涨落”', () => {
    assert.ok(P.TIDE_PERIOD > 0 && P.TIME_WRAP % P.TIDE_PERIOD === 0, 'TIDE_PERIOD 必须整除 TIME_WRAP');
    assert.ok(P.WAVE_PERIOD > 0 && P.TIME_WRAP % P.WAVE_PERIOD === 0, 'WAVE_PERIOD 必须整除 TIME_WRAP');
    assert.ok(P.TIME_WRAP % (P.WAVE_PERIOD * P.SET_AMPS.length) === 0, '一组浪的长度也整除 TIME_WRAP（回绕后仍是同一个浪的同一阶段）');
    assert.ok(P.TIDE_PERIOD >= 30 && P.TIDE_PERIOD <= 120, '潮汐一个来回要“看得出涨落”又不能快得像水在晃');
    assert.ok(P.WAVE_PERIOD >= 6 && P.WAVE_PERIOD <= 14, '浪的节奏接近真实海滩（每个浪约 8–12 秒）');
    for (const key of ['LAT_PERIOD_A', 'LAT_PERIOD_B']) assert.ok(P[key] > 0 && P.TIME_WRAP % P[key] === 0, `${key} 必须整除 TIME_WRAP（横向起伏随时间漂移，回绕那一刻不能跳）`);
    for (const t of [0, 7.3, 31.4, 59.9]) {
        const a = Core.tideOf(t);
        const b = Core.tideOf(t + P.TIME_WRAP);
        for (const key of ['high', 'tideV', 'top', 'reach']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${key}@${t}`);
        const x = 0.37;
        const f1 = Core.frontAt({ xn: x, aspect: 1.6, time: t, top: a.top, reach: a.reach });
        const f2 = Core.frontAt({ xn: x, aspect: 1.6, time: t + P.TIME_WRAP, top: a.top, reach: a.reach });
        assert.ok(Math.abs(f1 - f2) < 1e-6, `水线在回绕前后连续@${t}：${f1} vs ${f2}`);
    }
});

test('tideOf：水线最远处在 TOP_MID ± TIDE_AMP 之内，涨潮时更低、浪冲得更深，且真的涨落了；以 TIDE_PERIOD 为周期', () => {
    let min = Infinity; let max = -Infinity;
    for (const t of grid(0, P.TIDE_PERIOD, 0.05)) {
        const { top, reach, high } = Core.tideOf(t);
        min = Math.min(min, top); max = Math.max(max, top);
        assert.ok(top >= P.TOP_MID - P.TIDE_AMP - 1e-9 && top <= P.TOP_MID + P.TIDE_AMP + 1e-9, `t=${t} top=${top}`);
        assert.ok(Math.abs(top - (P.TOP_MID - P.TIDE_AMP * high)) < 1e-12, 'top 随潮位线性变化：涨潮（high 大）时水线低');
        assert.ok(Math.abs(reach - P.REACH * (1 + P.REACH_TIDE * high)) < 1e-12, 'reach 随潮位线性变化：涨潮时浪冲得更深');
    }
    assert.ok(max - min >= P.TIDE_AMP * 1.5, `一个周期里水线至少涨落 ${P.TIDE_AMP * 1.5}（实际 ${(max - min).toFixed(4)}）`);
    for (const t of [0, 3.7, 20, 41.2]) assert.ok(Math.abs(Core.tideOf(t).top - Core.tideOf(t + P.TIDE_PERIOD).top) < 1e-9, `周期性@${t}`);
});

test('tideOf：快涨慢落——潮位上升的那段时间比下降的短，最大上升速度比最大下降速度大', () => {
    const step = 0.01;
    let rising = 0; let falling = 0; let fastestUp = 0; let fastestDown = 0;
    for (const t of grid(0, P.TIDE_PERIOD - step, step)) {
        const v = (Core.tideOf(t + step).high - Core.tideOf(t).high) / step;       // 潮位上升（涨潮）为正
        if (v > 0) rising += step; else falling += step;
        fastestUp = Math.max(fastestUp, v); fastestDown = Math.min(fastestDown, v);
    }
    assert.ok(rising < falling - 1, `上升 ${rising.toFixed(1)} 秒 / 下降 ${falling.toFixed(1)} 秒`);
    assert.ok(fastestUp > -fastestDown * 1.15, `最大上升速度 ${fastestUp.toFixed(4)} / 最大下降速度 ${(-fastestDown).toFixed(4)}`);
});

test('tideOf：tideV 的符号与潮位涨落方向一致（涨潮为正），范围 -1…1', () => {
    const step = 0.01;
    let agree = 0; let total = 0;
    for (const t of grid(0, P.TIDE_PERIOD - step, 0.37)) {
        const tide = Core.tideOf(t);
        assert.ok(tide.tideV >= -1 && tide.tideV <= 1);
        assert.ok(tide.high >= -1 && tide.high <= 1);
        const v = (Core.tideOf(t + step).high - Core.tideOf(t).high) / step;
        if (Math.abs(v) < 0.002) continue;
        total++;
        if ((v > 0) === (tide.tideV > 0)) agree++;
    }
    assert.ok(total > 50 && agree === total, `方向一致 ${agree}/${total}`);
});

test('tideOf：非有限输入按 0 秒算，结果全是有限数字', () => {
    const zero = Core.tideOf(0);
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, '12', {}]) {
        const out = Core.tideOf(bad);
        for (const [key, value] of Object.entries(out)) { assert.ok(Number.isFinite(value), `${String(bad)} ${key}`); assert.equal(value, zero[key], `${String(bad)} ${key}`); }
    }
    assert.doesNotThrow(() => Core.tideOf());
    for (const value of Object.values(Core.tideOf(-13.7))) assert.ok(Number.isFinite(value));
});

test('潮汐：最小周期就是 TIDE_PERIOD（不是它的一半）——一个周期里潮位恰有一次最高、一次最低', () => {
    // 变异检查：把 TAU 改成 4π（频率翻倍，周期减半）时，“以 TIDE_PERIOD 为周期”的检查仍然通过——半个周期的整数倍也是周期。
    let count = 0;
    let previous = 0;
    for (let t = 0; t < P.TIDE_PERIOD; t += 0.01) {
        const sign = Math.sign(Core.tideOf(t + 0.01).high - Core.tideOf(t).high);
        if (sign !== 0 && previous !== 0 && sign !== previous) count++;
        if (sign !== 0) previous = sign;
    }
    assert.equal(count, 2, '一个潮汐周期里潮位一次涨到最高、一次落到最低');
    for (const t of [3.7, 20]) assert.ok(Math.abs(Core.tideOf(t).top - Core.tideOf(t + P.TIDE_PERIOD / 2).top) > 0.003, `半个潮汐周期之后水线不同@${t}`);
});

test('tideOf：负时间按周期回绕——相差整数个潮汐周期的两刻状态相同', () => {
    for (const t of [-13.7, -0.4, -59.9, -100]) {
        const a = Core.tideOf(t);
        const b = Core.tideOf(t + 120);
        for (const key of ['high', 'tideV', 'top', 'reach']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${key}@${t}：${a[key]} ≠ ${b[key]}`);
    }
});

test('tideOf：曲线形状钉在现在的数字上（潮位的不对称波形与由它得到的水线、冲刷深度）——改曲线要有意识地重钉', () => {
    // 数字取自 2026-10-20 的实现。tideV 是潮位导数按最大速度归一，high 是归一后的潮位，二者的常数（0.2、0.4、0.8、1.2、1.4）各自只在这里被钉住。
    const gold = [
        // 秒,    high,                 tideV,                 top,                 reach
        [0, 0.11955934848325382, 0.9133447740991902, 0.1458154228030861, 0.08601625446210766],
        [7.3, 0.697808533967813, 0.319099648979758, 0.12557670131112653, 0.09093137253872641],
        [13.7, 0.7416944853062652, -0.14990404647890637, 0.12404069301428071, 0.09130440312510327],
        [31.4, 0.026282370304220547, -0.575299610139935, 0.14908011703935228, 0.08522340014758588],
        [42.9, -0.8720039529760717, -0.4231978714075257, 0.1805201383541625, 0.0775879663997034],
        [58.1, -0.0994945440309288, 0.9631236701788151, 0.1534823090410825, 0.08415429637573711],
        [-13.7, -0.9720046632458381, -0.039669034317781626, 0.18402016321360432, 0.07673796036241039],
    ];
    for (const [t, high, tideV, top, reach] of gold) {
        const out = Core.tideOf(t);
        for (const [key, expected] of [['high', high], ['tideV', tideV], ['top', top], ['reach', reach]]) {
            assert.ok(Math.abs(out[key] - expected) < 1e-9, `t=${t} ${key}：${out[key]} ≠ ${expected}`);
        }
    }
});

// ---------- 浪：大小、一生、水线 ----------

test('waveAmp：按一组浪的大小依次取（超出一组取模、负数与小数先取整、非有限当 0）', () => {
    assert.deepEqual([0, 1, 2, 3].map(Core.waveAmp), [...P.SET_AMPS]);
    assert.equal(Core.waveAmp(4), Core.waveAmp(0));
    assert.equal(Core.waveAmp(7), Core.waveAmp(3));
    assert.equal(Core.waveAmp(-1), Core.waveAmp(3), '负数从另一头数');
    assert.equal(Core.waveAmp(-4), Core.waveAmp(0));
    assert.equal(Core.waveAmp(1.9), Core.waveAmp(1), '小数先向下取整');
    for (const bad of [NaN, Infinity, undefined, null, '2']) assert.equal(Core.waveAmp(bad), Core.waveAmp(0), String(bad));
});

test('rush：一个浪的一生——0 起、冲上沙滩到 1（RISE 处）、再退回 0；首尾连续，冲上去先快后慢、退下来先慢后快', () => {
    assert.equal(Core.rush(0), 0);
    assert.equal(Core.rush(P.RISE), 1);
    assert.equal(Core.rush(1), 0, '周期末尾回到 0：与下一个浪的起点连续');
    let previous = 0;
    for (const phi of grid(0.005, P.RISE, 0.005)) { const v = Core.rush(phi); assert.ok(v >= previous - 1e-12, `冲上去单调 phi=${phi.toFixed(3)}`); previous = v; }
    for (const phi of grid(P.RISE + 0.005, 1, 0.005)) { const v = Core.rush(phi); assert.ok(v <= previous + 1e-12, `退下来单调 phi=${phi.toFixed(3)}`); assert.ok(v >= -1e-12 && v <= 1 + 1e-12); previous = v; }
    // 先快后慢：冲上去的前一半时间走了大半的路；先慢后快：退下来的前一半时间只退了不到一半
    assert.ok(Core.rush(P.RISE / 2) > 0.7, `冲上去一半时间已到 ${Core.rush(P.RISE / 2).toFixed(2)}`);
    const mid = P.RISE + (1 - P.RISE) / 2;
    assert.ok(Core.rush(mid) > 0.5, `退下来一半时间还留着 ${Core.rush(mid).toFixed(2)}`);
    assert.equal(Core.rush(-1), 0);
    assert.equal(Core.rush(2), 0);
    for (const bad of [NaN, Infinity, undefined, null]) assert.equal(Core.rush(bad), 0, String(bad));
});

test('rushVel：就是 rush 对 phi 的导数（冲上去为正、退下去为负，在最高处接近 0）', () => {
    const h = 1e-6;
    for (const phi of [0.02, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.98]) {
        const numeric = (Core.rush(phi + h) - Core.rush(phi - h)) / (2 * h);
        assert.ok(Math.abs(Core.rushVel(phi) - numeric) < 1e-3 * Math.max(1, Math.abs(numeric)), `phi=${phi}：${Core.rushVel(phi)} vs ${numeric}`);
    }
    assert.ok(Core.rushVel(0.1) > 0 && Core.rushVel(0.5) < 0);
    assert.ok(Math.abs(Core.rushVel(P.RISE)) < 0.05, '浪冲到最高处时水线几乎停住');
    assert.ok(Core.rushVel(0.01) > Core.rushVel(0.2), '冲上去越来越慢');
    assert.ok(Core.rushVel(0.9) < Core.rushVel(0.4), '退下来越来越快（负得更多）');
    for (const bad of [NaN, Infinity, undefined]) assert.equal(Core.rushVel(bad), Core.rushVel(0), String(bad));
    assert.equal(Core.rushVel(1.7), Core.rushVel(1), 'phi 超出 0…1 先夹回去（与 rush 一致）：周期之外不会得到别的速度');
    assert.equal(Core.rushVel(-0.4), Core.rushVel(0));
});

test('frontAt：水线 = 最高处 − 冲刷深度 × 浪的大小 × 浪的一生 + 横向起伏——逐项钉住（用“深度为 0”的同刻对照把浪的那一项单独量出来）', () => {
    const expectedWave = (xn, aspect, time, reach) => {
        const ph = time / P.WAVE_PERIOD - P.SHEAR * xn;
        const n = Math.floor(ph);
        const k = ((n % 4) + 4) % 4;
        const amp = P.SET_AMPS[k] * (1 + P.AMP_WOBBLE * Math.sin(xn * aspect * 3.1 + k * 1.9));
        return -reach * amp * Core.rush(ph - n);
    };
    for (const xn of [0, 0.31, 0.5, 0.97, 1]) {
        for (const aspect of [0.56, 1, 1.2, 1.6, 2.4]) {                       // 竖屏与方屏也是合法的宽高比，不会被当成缺省
            for (const time of [0.4, 2.3, 5.9, 11.7, 20.2, 33.3, 41.6, 100.1]) {
                const deep = Core.frontAt({ xn, aspect, time, top: 0.15, reach: 0.085 });
                const flat = Core.frontAt({ xn, aspect, time, top: 0.15, reach: 0 });
                assert.ok(Math.abs((deep - flat) - expectedWave(xn, aspect, time, 0.085)) < 1e-12, `xn=${xn} aspect=${aspect} t=${time}`);
            }
        }
    }
    // 起伏与最高处：reach 为 0 时 = top + 横向起伏（两项正弦，幅度 LAT_A、LAT_B）
    let maxLat = 0;
    for (const time of grid(0, 120, 0.7)) for (const xn of grid(0, 1, 0.02)) {
        const lat = Core.frontAt({ xn, aspect: 1.6, time, top: 0.15, reach: 0 }) - 0.15;
        assert.ok(Math.abs(lat) <= P.LAT_A + P.LAT_B + 1e-12);
        maxLat = Math.max(maxLat, Math.abs(lat));
    }
    assert.ok(maxLat > (P.LAT_A + P.LAT_B) * 0.8, `横向起伏真的在起伏（最大 ${maxLat.toFixed(4)}）`);
    assert.equal(Core.frontAt({ xn: 0.5, aspect: 1.6, time: 12.3, top: 0.15, reach: 0.085 }), Core.frontAt({ xn: 0.5, aspect: 1.6, time: 12.3 }), '缺省的 top / reach 是平均潮位');
    assert.equal(Core.frontAt({}), Core.frontAt({ xn: 0.5, aspect: 16 / 9, time: 0, top: P.TOP_MID, reach: P.REACH }), '缺省：中间、16:9、0 秒、平均潮位');
    assert.ok(Math.abs(Core.frontAt({ xn: 0.3, aspect: 1.6, time: 12.3, top: 0.15, reach: 0.085 }) - 0.0895416339771833) < 1e-12, '数字钉子（改公式要有意识地重钉）');
    assert.ok(Math.abs(Core.frontAt({ xn: 0.8, aspect: 2, time: 40.1, top: 0.14, reach: 0.09 }) - 0.09888536372100437) < 1e-12);
    // xn 夹在 0…1：两边之外就是最左边、最右边
    assert.equal(Core.frontAt({ xn: 3, aspect: 1.6, time: 12.3 }), Core.frontAt({ xn: 1, aspect: 1.6, time: 12.3 }));
    assert.equal(Core.frontAt({ xn: -2, aspect: 1.6, time: 12.3 }), Core.frontAt({ xn: 0, aspect: 1.6, time: 12.3 }));
    // 宽高比不是正数（0、负数、非有限、缺失）时按 16:9
    const wide = Core.frontAt({ xn: 0.37, aspect: 16 / 9, time: 12.3 });
    for (const bad of [0, -2, NaN, Infinity, undefined, null]) assert.equal(Core.frontAt({ xn: 0.37, aspect: bad, time: 12.3 }), wide, `aspect=${String(bad)} 按 16:9`);
});

test('frontAt：浪是斜着来的（右边比左边晚 SHEAR 个周期）、成组（一组里依次是 SET_AMPS）、冲刷深度与浪的大小成正比', () => {
    const peakTime = (xn, n) => {
        // 第 n 个浪冲得最深的时刻：phi = RISE，即 time / WAVE_PERIOD - SHEAR × xn = n + RISE
        const time = P.WAVE_PERIOD * (n + P.RISE + P.SHEAR * xn);
        const wave = Core.frontAt({ xn, aspect: 1.6, time, top: 0.15, reach: 0.085 }) - Core.frontAt({ xn, aspect: 1.6, time, top: 0.15, reach: 0 });
        return { time, depth: -wave };
    };
    assert.ok(Math.abs((peakTime(1, 2).time - peakTime(0, 2).time) - P.SHEAR * P.WAVE_PERIOD) < 1e-9, '最右边的浪比最左边晚 SHEAR × WAVE_PERIOD 秒');
    // 在最高点前后各 0.3 秒的位置，水线都没有它深（真是最深的那一刻）
    for (const xn of [0, 0.5, 1]) {
        const here = peakTime(xn, 5);
        for (const dt of [-0.3, 0.3]) {
            const near = Core.frontAt({ xn, aspect: 1.6, time: here.time + dt, top: 0.15, reach: 0.085 }) - Core.frontAt({ xn, aspect: 1.6, time: here.time + dt, top: 0.15, reach: 0 });
            assert.ok(-near < here.depth, `xn=${xn} dt=${dt}`);
        }
    }
    const depths = [0, 1, 2, 3].map(k => peakTime(0, k).depth / 0.085);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(depths[k] - P.SET_AMPS[k] * (1 + P.AMP_WOBBLE * Math.sin(k * 1.9))) < 1e-12, `第 ${k} 个浪的大小`);
    assert.ok(Math.abs(peakTime(0, 6).depth - peakTime(0, 2).depth) < 1e-12, '一组四个，第 5、6 个浪是下一组的第 1、2 个');
    const small = Core.frontAt({ xn: 0.4, aspect: 1.6, time: 9.9, top: 0.15, reach: 0.04 }) - Core.frontAt({ xn: 0.4, aspect: 1.6, time: 9.9, top: 0.15, reach: 0 });
    const big = Core.frontAt({ xn: 0.4, aspect: 1.6, time: 9.9, top: 0.15, reach: 0.08 }) - Core.frontAt({ xn: 0.4, aspect: 1.6, time: 9.9, top: 0.15, reach: 0 });
    assert.ok(Math.abs(big - 2 * small) < 1e-12, '冲刷深度翻倍则浪的那一项翻倍');
});

test('frontAt：任何潮位、任何横向位置、任何时刻，水线都在页面里（不低于页面底边），也不高于“岸线最高处”', () => {
    let lowest = 1; let highest = 0;
    for (const time of grid(0, 240, 0.5)) {
        const tide = Core.tideOf(time);
        for (const xn of grid(0, 1, 0.025)) for (const aspect of [1.2, 1.78, 2.4]) {
            const f = Core.frontAt({ xn, aspect, time, top: tide.top, reach: tide.reach });
            lowest = Math.min(lowest, f); highest = Math.max(highest, f);
            assert.ok(f >= 0, `水线掉到页面外：t=${time} xn=${xn} -> ${f}`);
            assert.ok(f <= Core.shoreTopAt(time) + 1e-12 && f <= Core.shoreTopMax() + 1e-12, `水线高过岸线最高处：t=${time} xn=${xn} -> ${f} > ${Core.shoreTopAt(time)}`);
        }
    }
    assert.ok(lowest < 0.03, `涨潮的大浪真的会冲到靠近页面底边（最低 ${lowest.toFixed(4)}）`);
    assert.ok(highest > 0.15, `落潮时水线退得够高（最高 ${highest.toFixed(4)}）`);
});

// ---------- 岸线：鱼要避开的那条线 ----------

test('shoreTopAt / shoreTopMax：此刻水线能到的最高处 = 退得最远的水线 + 起伏与水舌的上界；常数上界不小于任何时刻也不虚高；整个范围都在带子里、不遮壁纸', () => {
    // 前提：浪每冲深一点，水线下降得比水舌噪声上升得快——否则“水舌的上界在 rush = 0 时取得”这个说法不成立
    const minReach = P.REACH * (1 - P.REACH_TIDE);
    assert.ok(minReach * Math.min(...P.SET_AMPS) * (1 - P.AMP_WOBBLE) >= 0.5 * P.RILL, '水舌的上界确实在浪退得最远时取到');
    const pad = P.LAT_A + P.LAT_B + P.RILL * 0.5 * 0.3;
    let peak = 0;
    for (const t of grid(0, 240, 0.05)) {
        const tide = Core.tideOf(t);
        const top = Core.shoreTopAt(t);
        assert.ok(Math.abs(top - (tide.top + pad)) < 1e-12);
        assert.ok(top <= Core.shoreTopMax() + 1e-9, `t=${t} ${top} > ${Core.shoreTopMax()}`);
        peak = Math.max(peak, top);
    }
    assert.ok(Core.shoreTopMax() - peak < 0.01, `常数上界贴着真实最大值：${Core.shoreTopMax().toFixed(4)} vs ${peak.toFixed(4)}`);
    assert.ok(Math.abs(Core.shoreTopMax() - (P.TOP_MID + P.TIDE_AMP + pad)) < 1e-12);
    assert.ok(Math.abs(Core.shoreTopMax() - 0.1985) < 1e-12, '数字钉子：0.15 + 0.035 + 0.0135');
    assert.ok(Core.shoreTopMax() < P.BAND, '岸线最高处在带子里');
    assert.equal(Core.shoreTopAt(NaN), Core.shoreTopAt(0));
    // 带着水舌噪声的上界：最极端的噪声取值（fbm 是 [0,1) 的值，减 0.5 后最大 +0.5）仍不越过 shoreTopAt
    for (const t of grid(0, 120, 1.3)) for (const xn of grid(0, 1, 0.1)) {
        const tide = Core.tideOf(t);
        const f = Core.frontAt({ xn, aspect: 1.6, time: t, top: tide.top, reach: tide.reach });
        const phi = ((t / P.WAVE_PERIOD - P.SHEAR * xn) % 1 + 1) % 1;
        assert.ok(f + 0.5 * P.RILL * (0.3 + Core.rush(phi)) <= Core.shoreTopAt(t) + 1e-12, `水舌最大时也不越过岸线最高处 t=${t} xn=${xn}`);
    }
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
