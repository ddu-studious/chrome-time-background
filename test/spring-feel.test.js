// 弹簧手感：曲线性质与 FLIP 回弹逻辑（用假元素和假 animate，不依赖浏览器）。
const test = require('node:test');
const assert = require('node:assert/strict');
const Spring = require('../js/spring-feel.js');

// ---- 假 DOM ----
function fakeElement(key, rect, extras = {}) {
    const element = {
        dataset: key === null ? {} : { springKey: key },
        rect: { left: 0, top: 0, width: 40, height: 40, ...rect },
        calls: [],
        animations: extras.animations || [],
        getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; },
        getAnimations() { return this.animations; },
    };
    if (extras.animate !== null) {
        element.animate = extras.animate || function (keyframes, options) {
            const animation = { keyframes, options, id: '', cancelled: false, cancel() { this.cancelled = true; } };
            element.calls.push(animation);
            return animation;
        };
    }
    return element;
}
const container = elements => ({ querySelectorAll: () => elements });
const win = ({ reduce = false, linear = true } = {}) => ({
    matchMedia: query => ({ matches: reduce && query.includes('reduce') }),
    CSS: { supports: (property, value) => linear && /linear\(/.test(value) },
});

// ---- 曲线 ----
test('预设：起点 0、终点 1，末尾平稳收敛，采样数固定', () => {
    for (const name of Spring.PRESET_NAMES) {
        const samples = Spring.samples(name);
        assert.equal(samples.length, Spring.POINTS + 1);
        assert.equal(samples[0], 0);
        assert.equal(samples[samples.length - 1], 1);
        assert.equal(Spring.value(name, 0), 0);
        assert.equal(Spring.value(name, -1), 0);
        assert.equal(Spring.value(name, Spring.PRESETS[name].settle), 1);
        assert.equal(Spring.value(name, Spring.PRESETS[name].settle + 5), 1);
        for (const tail of samples.slice(-4)) assert.ok(Math.abs(tail - 1) < 0.01, `${name} 末段应贴近 1：${tail}`);
        // 末点强制为 1 带来的最大跳变不超过 0.5%
        assert.ok(Math.abs(1 - samples[samples.length - 2]) < 0.005, `${name} 末点跳变过大`);
    }
});

test('回弹强度按 snappy < soft < bouncy 递增，且都有可感知的过冲', () => {
    const [snappy, soft, bouncy] = ['snappy', 'soft', 'bouncy'].map(Spring.peak);
    assert.ok(snappy > 1.02 && snappy < 1.07, `snappy ${snappy}`);
    assert.ok(soft > 1.08 && soft < 1.16, `soft ${soft}`);
    assert.ok(bouncy > 1.2 && bouncy < 1.35, `bouncy ${bouncy}`);
    assert.ok(snappy < soft && soft < bouncy);
});

test('曲线越过 1 之前单调上升（先冲过去、再回来，不会中途倒退）', () => {
    for (const name of Spring.PRESET_NAMES) {
        const samples = Spring.samples(name);
        const crossing = samples.findIndex(value => value >= 1);
        assert.ok(crossing > 0);
        for (let i = 1; i <= crossing; i += 1) assert.ok(samples[i] > samples[i - 1], `${name} 第 ${i} 点`);
        const after = samples.slice(crossing);
        assert.ok(after.some(value => value > 1.001), `${name} 应有过冲`);
        // 欠冲（回落到 1 以下）只出现在阻尼更小的预设里：snappy 是“一次过冲后从上方收敛”，欠冲发生在曲线结束之后。
        if (name === 'snappy') {
            const top = after.indexOf(Math.max(...after));
            for (let i = top + 1; i < after.length; i += 1) assert.ok(after[i] <= after[i - 1], `snappy 过冲峰值后应单调回到 1（第 ${i} 点）`);
        } else {
            assert.ok(after.some(value => value < 1 && value > 0.9), `${name} 应有回落`);
        }
        // 欠冲幅度必须小于过冲幅度：弹簧在衰减
        const under = Math.max(0, 1 - Math.min(...after));
        assert.ok(under < Math.max(...after) - 1, `${name} 欠冲应小于过冲`);
    }
});

test('linear() 字符串格式、时长与未知预设', () => {
    for (const name of Spring.PRESET_NAMES) {
        const text = Spring.linear(name);
        assert.match(text, /^linear\(0, (-?\d+(\.\d+)?, )+1\)$/);
        assert.equal(text.split(', ').length, Spring.POINTS + 1);
        assert.equal(Spring.durationMs(name), Math.round(Spring.PRESETS[name].settle * 1000));
    }
    assert.throws(() => Spring.value('wobbly', 0.1), RangeError);
    assert.throws(() => Spring.linear('wobbly'), RangeError);
    assert.throws(() => Spring.easing('wobbly'), RangeError);
});

test('预设对象不可被改写', () => {
    assert.ok(Object.isFrozen(Spring.PRESETS));
    assert.ok(Object.isFrozen(Spring.PRESETS.soft));
    assert.throws(() => { 'use strict'; Spring.PRESETS.soft.zeta = 0.1; }, TypeError);
});

test('easing：支持 linear() 用真弹簧，否则退回单次过冲 cubic-bezier', () => {
    assert.equal(Spring.easing('soft', win()), Spring.linear('soft'));
    assert.equal(Spring.easing('soft', win({ linear: false })), Spring.FALLBACKS.soft);
    assert.equal(Spring.easing('soft', null), Spring.FALLBACKS.soft, '没有 window（Node/无 CSS.supports）时也有可用缓动');
    for (const name of Spring.PRESET_NAMES) assert.match(Spring.FALLBACKS[name], /^cubic-bezier\(/);
});

// ---- FLIP ----
test('capture：记录有键且有尺寸的元素，跳过无键与零尺寸，并取消自己上一轮的回弹', () => {
    const mine = { id: Spring.ANIMATION_ID, cancelled: false, cancel() { this.cancelled = true; } };
    const others = { id: 'something-else', cancelled: false, cancel() { this.cancelled = true; } };
    const a = fakeElement('a', { left: 10, top: 5 }, { animations: [mine, others] });
    const hidden = fakeElement('hidden', { width: 0, height: 0 });
    const keyless = fakeElement(null, { left: 99 });
    const before = Spring.capture(container([a, hidden, keyless]));
    assert.deepEqual([...before.keys()], ['a']);
    assert.deepEqual(before.get('a'), { left: 10, top: 5 });
    assert.equal(mine.cancelled, true, '自己的旧回弹被取消');
    assert.equal(others.cancelled, false, '别人的动画不动');
});

test('capture：容器缺失或 getBoundingClientRect 抛错都不会抛出', () => {
    assert.equal(Spring.capture(null).size, 0);
    assert.equal(Spring.capture({}).size, 0);
    const broken = fakeElement('x', {});
    broken.getBoundingClientRect = () => { throw new Error('detached'); };
    assert.equal(Spring.capture(container([broken])).size, 0);
});

test('settle：位置变了的元素从旧位置弹回新位置（独立 translate 属性）', () => {
    const moved = fakeElement('moved', { left: 100, top: 20 });
    const still = fakeElement('still', { left: 50, top: 20 });
    const before = new Map([['moved', { left: 160, top: 26 }], ['still', { left: 50, top: 20 }]]);
    const result = Spring.settle(container([moved, still]), before, { win: win() });
    assert.deepEqual(result, { animated: 1, skipped: 1 });
    assert.equal(still.calls.length, 0);
    assert.equal(moved.calls.length, 1);
    const [animation] = moved.calls;
    assert.deepEqual(animation.keyframes, [{ translate: '60px 6px' }, { translate: '0px 0px' }]);
    assert.equal(animation.options.easing, Spring.linear('bouncy'), '短距离保持 bouncy');
    assert.equal(animation.options.duration, Spring.durationMs('bouncy'));
    assert.equal(animation.options.fill, 'none');
    assert.equal(animation.id, Spring.ANIMATION_ID);
    assert.ok(!JSON.stringify(animation.keyframes).includes('transform'), '不使用 transform，避免覆盖 Dock 效果的内联 transform');
});

test('settle：预设与时长可选；不支持 linear() 时用回退缓动', () => {
    const moved = fakeElement('m', { left: 0 });
    Spring.settle(container([moved]), new Map([['m', { left: 30, top: 0 }]]), { win: win({ linear: false }), preset: 'soft', duration: 333 });
    assert.equal(moved.calls[0].options.easing, Spring.FALLBACKS.soft);
    assert.equal(moved.calls[0].options.duration, 333);
});

test('settle：位移越长越降级，过冲不会冲出很远（bouncy 27% × 400px 会冲出 110px）', () => {
    const near = fakeElement('near', { left: 0 });
    const mid = fakeElement('mid', { left: 0 });
    const far = fakeElement('far', { left: 0 });
    const before = new Map([
        ['near', { left: Spring.LONG_MOVE, top: 0 }],
        ['mid', { left: Spring.LONG_MOVE + 1, top: 0 }],
        ['far', { left: Spring.VERY_LONG_MOVE + 1, top: 0 }],
    ]);
    Spring.settle(container([near, mid, far]), before, { win: win() });
    assert.equal(near.calls[0].options.easing, Spring.linear('bouncy'), '恰好 140px 仍是 bouncy');
    assert.equal(mid.calls[0].options.easing, Spring.linear('soft'));
    assert.equal(far.calls[0].options.easing, Spring.linear('snappy'));
    assert.equal(mid.calls[0].options.duration, Spring.durationMs('soft'));
    assert.equal(far.calls[0].options.duration, Spring.durationMs('snappy'));
    // 像素过冲被压住：最远一档的像素过冲不得大于近距离一档的 2 倍
    const pixels = (name, distance) => (Spring.peak(name) - 1) * distance;
    assert.ok(pixels('snappy', Spring.VERY_LONG_MOVE + 1) < 2 * pixels('bouncy', Spring.LONG_MOVE));
    assert.ok(pixels('snappy', Spring.MAX_MOVE) < pixels('bouncy', Spring.MAX_MOVE) / 4, '降级后的过冲远小于不降级');
});

test('presetForDistance：预设是上限，只降不升', () => {
    assert.equal(Spring.presetForDistance('bouncy', 10), 'bouncy');
    assert.equal(Spring.presetForDistance('bouncy', 200), 'soft');
    assert.equal(Spring.presetForDistance('bouncy', 500), 'snappy');
    assert.equal(Spring.presetForDistance('soft', 10), 'soft');
    assert.equal(Spring.presetForDistance('soft', 500), 'snappy');
    assert.equal(Spring.presetForDistance('snappy', 10), 'snappy', '上限是 snappy 就不会变得更弹');
    assert.equal(Spring.presetForDistance('snappy', 500), 'snappy');
});

test('settle：未知的上限预设不抛错、不动画', () => {
    const moved = fakeElement('m', { left: 0 });
    let result;
    assert.doesNotThrow(() => { result = Spring.settle(container([moved]), new Map([['m', { left: 30, top: 0 }]]), { win: win(), preset: 'wobbly' }); });
    assert.deepEqual(result, { animated: 0, skipped: 0 });
    assert.equal(moved.calls.length, 0);
});

test('settle：小位移与异常大位移不做动画，边界值按规则处理', () => {
    const tiny = fakeElement('tiny', { left: 0 });
    const justOver = fakeElement('over', { left: 0 });
    const huge = fakeElement('huge', { left: 0 });
    const edgeBig = fakeElement('edgeBig', { left: 0 });
    const before = new Map([
        ['tiny', { left: Spring.MIN_MOVE - 0.01, top: 0 }],
        ['over', { left: Spring.MIN_MOVE + 0.01, top: 0 }],
        ['huge', { left: Spring.MAX_MOVE + 1, top: 0 }],
        ['edgeBig', { left: Spring.MAX_MOVE, top: 0 }],
    ]);
    const result = Spring.settle(container([tiny, justOver, huge, edgeBig]), before, { win: win() });
    assert.equal(tiny.calls.length, 0);
    assert.equal(huge.calls.length, 0, '超过上限多半是窗口缩放，不做回弹');
    assert.equal(justOver.calls.length, 1);
    assert.equal(edgeBig.calls.length, 1);
    assert.deepEqual(result, { animated: 2, skipped: 2 });
});

test('settle：减少动态效果时一个动画都不启动', () => {
    const moved = fakeElement('m', { left: 0 });
    const result = Spring.settle(container([moved]), new Map([['m', { left: 80, top: 0 }]]), { win: win({ reduce: true }) });
    assert.deepEqual(result, { animated: 0, skipped: 0 });
    assert.equal(moved.calls.length, 0);
});

test('settle：新增元素与已移除元素不参与；before 为空直接返回', () => {
    const added = fakeElement('added', { left: 0 });
    const result = Spring.settle(container([added]), new Map([['removed', { left: 50, top: 0 }]]), { win: win() });
    assert.deepEqual(result, { animated: 0, skipped: 0 });
    assert.equal(added.calls.length, 0);
    assert.deepEqual(Spring.settle(container([added]), new Map(), { win: win() }), { animated: 0, skipped: 0 });
    assert.deepEqual(Spring.settle(container([added]), null, { win: win() }), { animated: 0, skipped: 0 });
});

test('settle：没有 animate、animate 抛错、元素已脱离文档，都不抛出且不计数', () => {
    const noAnimate = fakeElement('a', { left: 0 }, { animate: null });
    const throwing = fakeElement('b', { left: 0 }, { animate() { throw new Error('unsupported'); } });
    const detached = fakeElement('c', { left: 0, width: 0, height: 0 });
    const before = new Map([['a', { left: 40, top: 0 }], ['b', { left: 40, top: 0 }], ['c', { left: 40, top: 0 }]]);
    let result;
    assert.doesNotThrow(() => { result = Spring.settle(container([noAnimate, throwing, detached]), before, { win: win() }); });
    assert.equal(result.animated, 0);
});

test('settle：同时回弹的元素数量有上限', () => {
    const elements = Array.from({ length: Spring.MAX_ANIMATED + 8 }, (_, i) => fakeElement('k' + i, { left: 0 }));
    const before = new Map(elements.map((element, i) => ['k' + i, { left: 30, top: 0 }]));
    const result = Spring.settle(container(elements), before, { win: win() });
    assert.equal(result.animated, Spring.MAX_ANIMATED);
    assert.equal(elements.filter(element => element.calls.length).length, Spring.MAX_ANIMATED);
});

test('自定义键函数与选择器：selector 原样传给 querySelectorAll', () => {
    const seen = [];
    const element = fakeElement(null, { left: 0 });
    element.dataset = { dockAppId: 'music' };
    const host = { querySelectorAll: selector => { seen.push(selector); return [element]; } };
    const options = { selector: '.dock-btn', key: el => 'app:' + el.dataset.dockAppId, win: win() };
    const before = Spring.capture(host, options);
    assert.deepEqual([...before.keys()], ['app:music']);
    element.rect.left = -45;
    // 元素向左移了 45px，所以应从右侧 45px 处（旧位置）弹回
    assert.equal(Spring.settle(host, before, options).animated, 1);
    assert.equal(element.calls[0].keyframes[0].translate, '45px 0px');
    assert.deepEqual(seen, ['.dock-btn', '.dock-btn']);
});

test('键函数抛错的元素被跳过而不是中断整批', () => {
    const bad = fakeElement('bad', { left: 0 });
    const good = fakeElement('good', { left: 0 });
    const options = { key: el => { if (el === bad) throw new Error('boom'); return el.dataset.springKey; }, win: win() };
    const before = Spring.capture(container([bad, good]), options);
    assert.deepEqual([...before.keys()], ['good']);
});
