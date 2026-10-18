// 互动子项目对画法的两处小改动：拉尾时脊柱的尾端位移（spineOf 的 pull），吃到饲料后的变亮与光晕（drawFish 的 extras）。
// 没有玩法状态时，画出来的每一笔必须与改动之前完全一致——按种类钉住绘制调用的哈希（数字取到小数点后 4 位，颜色字符串本来就取整）。
// 需要重新生成哈希时：在改动前的提交上用同一个 recorder 与场景跑一遍即可（见本文件的 GOLD_SCENARIOS）。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Core = require('../js/aquarium-core.js');
const Aquarium = require('../js/aquarium.js');

const { SHAPES, geometry, drawFish } = Aquarium;
const PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];

function recorder() {
    const calls = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => {
                calls.push([String(key), args]);
                return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop(o, c) { calls.push(['addColorStop', [o, c]]); } } : undefined;
            };
        },
        set(target, key, value) { calls.push(['set:' + String(key), [value]]); target[key] = value; return true; },
    });
}
const round = v => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
const fishOf = (species, extra = {}) => Object.assign({ species, x: 200, y: 150, ang: 0.3, len: Core.speciesById(species).len * 3, z: 0.95, alpha: 1, phase: 1.1, turn: 0.4, flip: 1 }, extra);
const log = (species, fishExtra, view, extras) => {
    const ctx = recorder();
    drawFish(ctx, fishOf(species, fishExtra), PALETTE, Object.assign({ amount: 0.9, night: 0, lowPower: false }, view), extras);
    return ctx._calls.map(([n, a]) => [n, a.map(round)]);
};
const sets = (calls, name) => calls.filter(([n]) => n === `set:${name}`).map(([, a]) => a[0]);
const alphaOf = css => Number(/, ([\d.]+)\)$/.exec(css)[1]);

const GOLD_SCENARIOS = [
    [{}, {}],
    [{ z: 0.4 }, {}],
    [{}, { night: 0.6 }],
    [{}, { lowPower: true }],
    [{ scoopT: 0.5, flip: -0.5 }, { night: 0.2 }],
];
const GOLD = {
    neon: 'fd86f6176ce43467', tang: 'fdee4ce17b56cdd8', clown: '4c91781322140894', puffer: '11801381e87978eb',
    angel: '3eff4f2328fc7e66', hammer: 'c24a88631760c450', manta: '286862276db6ab51', whaleshark: '1914a4943a106bff',
};
const goldOf = (id, extras) => {
    const h = crypto.createHash('sha1');
    for (const [fishExtra, view] of GOLD_SCENARIOS) h.update(JSON.stringify(log(id, fishExtra, view, extras)));
    return h.digest('hex').slice(0, 16);
};

test('黄金画法：没有 extras（缺省、null、空对象、无变亮无拉尾、非法值）时，8 种鱼 5 个场景的每一笔与改动之前一致', () => {
    for (const spec of Core.SPECIES) {
        assert.equal(goldOf(spec.id, undefined), GOLD[spec.id], `${spec.id}：没有 extras`);
        for (const extras of [null, {}, { pull: null, fed: 0 }, { pull: { x: NaN, y: 1 }, fed: NaN }, { pull: { x: 1 }, fed: 'x' }, { fed: -3 }]) {
            assert.equal(goldOf(spec.id, extras), GOLD[spec.id], `${spec.id}：${JSON.stringify(extras)}`);
        }
    }
});

test('spineOf：没有 pull 时与原来的公式一致；pull 按站位权重叠加，头不动、尾端拉满；非法 pull 不影响', () => {
    const fish = fishOf('hammer', { phase: 2.2, turn: -0.5 });
    const shape = SHAPES.hammer;
    const len = 60;
    const base = geometry.spineOf(fish, shape, len);
    const amp = (shape.amp || 0.12) * len;
    const bend = -0.5 * len * 0.12;
    [0, 0.25, 0.5, 0.75, 1].forEach((u, i) => {
        assert.ok(Math.abs(base[i].x - len * (0.5 - u)) < 1e-9);
        assert.ok(Math.abs(base[i].y - (Math.sin(2.2 - u * 2.4) * amp * Math.pow(u, 1.4) + bend * Math.pow(u, 1.5))) < 1e-9);
    });
    const pulled = geometry.spineOf(fish, shape, len, { x: -10, y: 4 });
    assert.deepEqual([pulled[0].x, pulled[0].y], [base[0].x, base[0].y], '鼻子不动');
    assert.deepEqual([pulled[1].x, pulled[1].y], [base[1].x, base[1].y], '前身不动');
    assert.ok(Math.abs(pulled[4].x - (base[4].x - 10)) < 1e-9 && Math.abs(pulled[4].y - (base[4].y + 4)) < 1e-9, '尾端拉满');
    assert.ok(Math.abs(pulled[3].x - (base[3].x - 5)) < 1e-9 && Math.abs(pulled[2].x - (base[2].x - 1.2)) < 1e-9, '中间按权重');
    for (const bad of [null, undefined, {}, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1 }]) {
        assert.deepEqual(geometry.spineOf(fish, shape, len, bad), base, JSON.stringify(bad));
    }
});

test('画拉尾：pull 把尾端拉长（身体与尾鳍的路径变了），其余种类也一样；弹簧回到 0 时与没有拉尾画得一样', () => {
    for (const spec of Core.SPECIES) {
        const plain = JSON.stringify(log(spec.id, {}, {}));
        const pulled = JSON.stringify(log(spec.id, {}, {}, { pull: { x: -8, y: 3 }, fed: 0 }));
        assert.notEqual(pulled, plain, `${spec.id} 的画法没有随 pull 改变`);
        assert.equal(JSON.stringify(log(spec.id, {}, {}, { pull: { x: 0, y: 0 }, fed: 0 })), plain, `${spec.id}：pull 为 0 应与没有一样`);
    }
});

test('画变亮：fed 越大不透明度越高（最多加 25%），近处的鱼多一圈光晕；省流量没有光晕但仍变亮；超出 0…1 的值被夹住', () => {
    const bodyAlpha = (extras, view = {}) => {
        const calls = log('puffer', { z: 0.4 }, view, extras);                 // z 小：远处，不画渐变，身体是一个纯色
        return alphaOf(sets(calls, 'fillStyle').at(-1) ? sets(calls, 'fillStyle').find(s => /^rgba/.test(s)) : 'rgba(0, 0, 0, 0)');
    };
    const a0 = bodyAlpha({ pull: null, fed: 0 }, { amount: 0.6 });
    const a1 = bodyAlpha({ pull: null, fed: 1 }, { amount: 0.6 });
    assert.ok(a1 > a0 * 1.1, `变亮 ${a0} → ${a1}`);
    assert.equal(JSON.stringify(log('puffer', {}, {}, { fed: 5 })), JSON.stringify(log('puffer', {}, {}, { fed: 1 })), 'fed 夹到 1');
    assert.equal(JSON.stringify(log('puffer', {}, {}, { fed: -5 })), JSON.stringify(log('puffer', {}, {}, { fed: 0 })), 'fed 夹到 0');
    const count = (calls, name) => calls.filter(([n]) => n === name).length;
    const near = count(log('puffer', {}, {}, { fed: 1 }), 'createRadialGradient') - count(log('puffer', {}, {}), 'createRadialGradient');
    assert.equal(near, 1, '吃饱的鱼多一圈光晕');
    const haloAlpha = fed => alphaOf(log('puffer', {}, {}, { fed }).find(([n, a]) => n === 'addColorStop' && a[0] === 0)[1][1]);
    assert.ok(haloAlpha(1) > 0.1 && haloAlpha(0.5) > 0.03 && haloAlpha(1) > haloAlpha(0.5), `光晕随 fed 变强：${haloAlpha(0.5)} → ${haloAlpha(1)}`);
    const low = count(log('puffer', {}, { lowPower: true }, { fed: 1 }), 'createRadialGradient');
    assert.equal(low, 0, '省流量不画光晕');
    assert.ok(alphaOf(sets(log('clown', {}, { lowPower: true }, { fed: 1 }), 'fillStyle').find(s => /^rgba/.test(s))) >= 0, '省流量仍能画');
    const fedLow = log('puffer', { z: 0.4 }, { lowPower: true, amount: 0.6 }, { fed: 1 });
    const plainLow = log('puffer', { z: 0.4 }, { lowPower: true, amount: 0.6 });
    assert.notEqual(JSON.stringify(fedLow), JSON.stringify(plainLow), '省流量下不透明度仍然加亮');
});

test('画法对坏的 extras 不抛错：pull 与 fed 的各种怪值', () => {
    for (const extras of [{ pull: { x: 1e9, y: -1e9 }, fed: 1 }, { pull: { x: 'a', y: null }, fed: Infinity }, 5, 'x', [], () => 1]) {
        assert.doesNotThrow(() => log('manta', {}, {}, extras), String(extras));
    }
});
