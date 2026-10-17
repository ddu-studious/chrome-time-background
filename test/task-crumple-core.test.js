'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/task-crumple-core.js');

const P = Core.PARAMS;
const VIEW = { width: 1440, height: 900 };

// 固定种子的伪随机，保证多边形抖动可重复。
function seeded(seed = 7) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function numbers(text) {
    return (String(text).match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || []).map(Number);
}

test('参数冻结且彼此自洽：时间线总长在合理范围，同时数量有上限', () => {
    assert.ok(Object.isFrozen(P));
    assert.equal(P.POINTS % 4, 0, '多边形顶点数必须能被四边平分');
    assert.ok(P.CRUMPLE_MS + P.FLIGHT_MAX_MS + P.DROP_MS + P.SETTLE_MS <= 1500);
    assert.ok(P.CRUMPLE_MS + P.FLIGHT_MIN_MS + P.DROP_MS + P.SETTLE_MS >= 900);
    assert.ok(P.MAX_ACTIVE >= 1 && P.MAX_ACTIVE <= 4);
    assert.ok(P.CONFIRM_MS > P.CONFIRM_POLL_MS * 4, '确认窗口要容得下好几次轮询');
    assert.ok(P.WOBBLE_DEG !== 0);
});

test('visibleRect：完整可见、被列表裁剪、被视口裁剪、太小或完全在外', () => {
    const item = { left: 100, top: 200, width: 600, height: 120 };
    assert.deepEqual(pick(Core.visibleRect(item, null, VIEW)), { left: 100, top: 200, width: 600, height: 120 });

    // 条目上半部分滚出列表可视区
    const list = { left: 80, top: 260, width: 700, height: 400 };
    assert.deepEqual(pick(Core.visibleRect(item, list, VIEW)), { left: 100, top: 260, width: 600, height: 60 });

    // 视口裁剪（条目一半在屏幕下方之外）
    const low = { left: 100, top: 860, width: 600, height: 120 };
    assert.deepEqual(pick(Core.visibleRect(low, null, VIEW)), { left: 100, top: 860, width: 600, height: 40 });

    // 只露出一条缝：小于最小高度
    assert.equal(Core.visibleRect({ left: 100, top: 880, width: 600, height: 120 }, null, VIEW), null);
    // 太窄
    assert.equal(Core.visibleRect({ left: 100, top: 100, width: 60, height: 120 }, null, VIEW), null);
    // 与列表不相交
    assert.equal(Core.visibleRect(item, { left: 0, top: 500, width: 50, height: 50 }, VIEW), null);
    // 缺数据不抛
    assert.equal(Core.visibleRect(null, null, VIEW), null);
    assert.equal(Core.visibleRect({ left: NaN, top: 0, width: 10, height: 10 }, null, VIEW), null);
});

test('visibleRect 接受 left/top/right/bottom 形式（DOMRect 两种字段都有）', () => {
    const rect = Core.visibleRect({ left: 10, top: 20, right: 410, bottom: 140 }, null, VIEW);
    assert.deepEqual(pick(rect), { left: 10, top: 20, width: 400, height: 120 });
});

function pick(rect) {
    return rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

test('originOf：勾选框中心在可见范围内就用它，否则取左侧中线（宽度不足时取一半）', () => {
    const visible = { left: 100, top: 200, width: 600, height: 120, right: 700, bottom: 320 };
    assert.deepEqual(Core.originOf(visible, { left: 110, top: 240, width: 20, height: 20 }), { x: 20, y: 50 });
    // 勾选框被裁到可见范围之外
    assert.deepEqual(Core.originOf(visible, { left: 110, top: 120, width: 20, height: 20 }), { x: 24, y: 60 });
    // 没有勾选框 / 尺寸为 0
    assert.deepEqual(Core.originOf(visible, null), { x: 24, y: 60 });
    assert.deepEqual(Core.originOf(visible, { left: 110, top: 240, width: 0, height: 0 }), { x: 24, y: 60 });
    // 很窄的可见区域
    const narrow = { left: 0, top: 0, width: 90, height: 40, right: 90, bottom: 40 };
    assert.deepEqual(Core.originOf(narrow, null), { x: 24, y: 20 });
});

test('binPlacement：落在列表右下角，同时多组向左依次排开，且始终留在视口内', () => {
    const list = { left: 121, top: 298, width: 1198, height: 534 };
    const first = Core.binPlacement(list, VIEW, 0);
    assert.equal(first.left, 121 + 1198 - P.BIN_W - P.BIN_INSET_X);
    assert.equal(first.top, 298 + 534 - P.BIN_H - P.BIN_INSET_Y);
    assert.equal(first.mouthX, first.left + P.BIN_W / 2);
    assert.equal(first.mouthY, first.top + P.BIN_MOUTH_Y);

    const second = Core.binPlacement(list, VIEW, 1);
    assert.equal(first.left - second.left, P.BIN_W + P.BIN_GAP);
    assert.equal(second.top, first.top);

    // 列表伸出视口：夹回安全边距内
    const tall = { left: 1300, top: 500, width: 600, height: 900 };
    const clamped = Core.binPlacement(tall, VIEW, 0);
    assert.ok(clamped.left + P.BIN_W <= VIEW.width - P.MARGIN);
    assert.ok(clamped.top + P.BIN_H <= VIEW.height - P.MARGIN);

    // 没有列表：视口右下角
    const corner = Core.binPlacement(null, VIEW, 0);
    assert.equal(corner.left, VIEW.width - P.BIN_W - 24);
    assert.equal(corner.top, VIEW.height - P.BIN_H - 24);

    // 极小视口也不出现负数
    const tiny = Core.binPlacement(null, { width: 30, height: 30 }, 2);
    assert.ok(tiny.left >= P.MARGIN && tiny.top >= P.MARGIN);
    // 非数字的 slot 当作 0
    assert.equal(Core.binPlacement(list, VIEW, 'x').left, first.left);
});

test('flightMs / liftFor：随距离增长并夹在上下限内', () => {
    assert.equal(Core.flightMs(0), P.FLIGHT_MIN_MS);
    assert.equal(Core.flightMs(-50), P.FLIGHT_MIN_MS);
    assert.equal(Core.flightMs(1e6), P.FLIGHT_MAX_MS);
    let previous = 0;
    for (const distance of [0, 100, 300, 600, 1000, 2000]) {
        const value = Core.flightMs(distance);
        assert.ok(value >= previous);
        previous = value;
    }
    assert.equal(Core.liftFor(0), P.LIFT_MIN);
    assert.equal(Core.liftFor(1e6), P.LIFT_MAX);
    assert.ok(Core.liftFor(600) > P.LIFT_MIN && Core.liftFor(600) < P.LIFT_MAX);
});

test('arc：起终点精确，水平单调，中点高出直线 lift，旋转到 spin', () => {
    const points = Core.arc(800, 300, 120, 12, 540);
    assert.equal(points.length, 13);
    assert.deepEqual({ x: points[0].x, y: points[0].y, rot: points[0].rot }, { x: 0, y: 0, rot: 0 });
    const last = points[points.length - 1];
    assert.equal(last.x, 800);
    assert.equal(last.y, 300);
    assert.equal(last.rot, 540);
    for (let i = 1; i < points.length; i++) assert.ok(points[i].x > points[i - 1].x);
    const mid = points[6];
    assert.equal(mid.u, 0.5);
    assert.equal(mid.y, 300 * 0.5 - 120, '中点 = 直线中点再抬高 lift');
    // 终点在起点下方时，弧线顶点仍高于起点
    assert.ok(Math.min(...points.map(p => p.y)) < 0);
    // 步数下限是 2（3 个点）；没给步数（0 / undefined）用默认步数
    assert.equal(Core.arc(10, 10, 5, 1).length, 3);
    assert.equal(Core.arc(10, 10, 5, 0).length, P.FLIGHT_STEPS + 1);
    assert.equal(Core.arc(10, 10, 5).length, P.FLIGHT_STEPS + 1);
    // 没给旋转角时用默认
    assert.equal(Core.arc(10, 10, 5, 4).pop().rot, P.SPIN_DEG);
    assert.equal(Core.arc(10, 10, 5, 4, 0).pop().rot, 0);
});

test('crumpledPolygons：各阶段顶点数一致才能插值；矩形精确、球形在圆内、坐标在 0–100', () => {
    const polys = Core.crumpledPolygons(seeded());
    const counts = Object.values(polys).map(text => (text.match(/,/g) || []).length + 1);
    assert.deepEqual(new Set(counts), new Set([P.POINTS]));
    for (const text of Object.values(polys)) {
        assert.match(text, /^polygon\(/);
        for (const value of numbers(text)) assert.ok(value >= 0 && value <= 100, text);
    }

    // 矩形：四个角都在，且每条边 POINTS/4 个点
    const rect = numbers(polys.rect);
    const pairs = [];
    for (let i = 0; i < rect.length; i += 2) pairs.push([rect[i], rect[i + 1]]);
    for (const corner of [[0, 0], [100, 0], [100, 100], [0, 100]]) {
        assert.ok(pairs.some(p => p[0] === corner[0] && p[1] === corner[1]), `缺少角 ${corner}`);
    }
    assert.equal(pairs.length, P.POINTS);

    // 球：每个点到圆心 50,50 的距离都≈50
    const ball = numbers(polys.ball);
    for (let i = 0; i < ball.length; i += 2) {
        assert.ok(Math.abs(Math.hypot(ball[i] - 50, ball[i + 1] - 50) - 50) < 0.2);
    }

    // 种子相同则完全一致；换种子会有变化（抖动确实存在）
    assert.deepEqual(Core.crumpledPolygons(seeded(7)), polys);
    assert.notEqual(Core.crumpledPolygons(seeded(8)).c2, polys.c2);
    // 没传 random 也能工作
    assert.match(Core.crumpledPolygons().c1, /^polygon\(/);
});

test('选择器：任务 id 里的引号、反斜杠、换行都被转义，不能改变选择器结构', () => {
    assert.equal(Core.escapeAttr('abc-123'), 'abc-123');
    assert.equal(Core.escapeAttr('a"b'), 'a\\"b');
    assert.equal(Core.escapeAttr('a\\b'), 'a\\\\b');
    assert.equal(Core.escapeAttr('a\nb\rc'), 'a\\a b\\d c');

    const evil = 'x"] , body { display:none } [data-id="y';
    const selector = Core.doneSelector(evil);
    // 每个引号前都有反斜杠：整个 id 仍在同一个属性值里
    const inner = selector.slice(selector.indexOf('[data-id="') + 10, selector.indexOf('"].completed'));
    assert.ok(!/(^|[^\\])"/.test(inner), `id 内出现未转义的引号：${inner}`);

    assert.ok(Core.doneSelector('t1').includes('.completed:not(.tc-clone)'));
    assert.ok(!Core.anySelector('t1').includes('.completed'));
    for (const text of [Core.doneSelector('t1'), Core.anySelector('t1')]) {
        assert.ok(text.includes('.sidebar-task-item[data-id="t1"]'));
        assert.ok(text.includes('.panel-task-item[data-id="t1"]'));
        assert.ok(text.includes(`:not(.${Core.CLONE_CLASS})`), '克隆体不能被当成真实条目');
    }
});

test('freeSlot：取最小空位，占满返回 -1，接受数组或 Set', () => {
    assert.equal(Core.freeSlot(new Set()), 0);
    assert.equal(Core.freeSlot([0, 2]), 1);
    assert.equal(Core.freeSlot(new Set([1])), 0);
    assert.equal(Core.freeSlot(undefined), 0);
    const all = Array.from({ length: P.MAX_ACTIVE }, (_, i) => i);
    assert.equal(Core.freeSlot(all), -1);
    assert.equal(Core.freeSlot(all.slice(1)), 0, '空出最小的位置就用它');
});

test('decide：不支持 / 关闭 / 减少动态 / 省流量 / 页面隐藏 / 已满，按固定优先级给出原因', () => {
    const base = { supported: true, enabled: true, reduceMotion: false, saveData: false, hidden: false, active: 0 };
    assert.deepEqual(Core.decide(base), { ok: true, reason: '' });
    assert.equal(Core.decide({ ...base, supported: false }).reason, 'unsupported');
    assert.equal(Core.decide({ ...base, enabled: false }).reason, 'disabled');
    assert.equal(Core.decide({ ...base, reduceMotion: true }).reason, 'reduce-motion');
    assert.equal(Core.decide({ ...base, saveData: true }).reason, 'save-data');
    assert.equal(Core.decide({ ...base, hidden: true }).reason, 'hidden');
    assert.equal(Core.decide({ ...base, active: P.MAX_ACTIVE }).reason, 'busy');
    assert.equal(Core.decide({ ...base, active: P.MAX_ACTIVE - 1 }).ok, true);
    // 多个原因同时存在时，先报优先级高的
    assert.equal(Core.decide({ ...base, enabled: false, reduceMotion: true, hidden: true }).reason, 'disabled');
    assert.equal(Core.decide({ ...base, reduceMotion: true, saveData: true }).reason, 'reduce-motion');
    // 缺字段不抛：视为不支持
    assert.equal(Core.decide().ok, false);
    assert.equal(Core.decide({}).reason, 'unsupported');
});

// ---- 时间线 ----

const SCENES = {
    '典型宽卡片': { visible: rectInfo(133, 464, 1174, 127), checkbox: [155, 480], mouth: Core.binPlacement({ left: 121, top: 298, width: 1198, height: 534 }, VIEW, 0) },
    '最小可见块': { visible: rectInfo(100, 700, 80, 28), checkbox: null, mouth: Core.binPlacement({ left: 80, top: 100, width: 400, height: 700 }, VIEW, 0) },
    '超大卡片': { visible: rectInfo(0, 100, 1600, 300), checkbox: [20, 120], mouth: Core.binPlacement(null, VIEW, 0) },
    '纸篓就在旁边': { visible: rectInfo(1100, 700, 200, 60), checkbox: [1120, 730], mouth: Core.binPlacement({ left: 100, top: 100, width: 1250, height: 700 }, VIEW, 0) },
    '第三组纸篓': { visible: rectInfo(133, 464, 1174, 127), checkbox: [155, 480], mouth: Core.binPlacement({ left: 121, top: 298, width: 1198, height: 534 }, VIEW, 2) },
};

function rectInfo(left, top, width, height) {
    return { left, top, width, height, right: left + width, bottom: top + height };
}

function build(sceneName, random) {
    const scene = SCENES[sceneName];
    const origin = Core.originOf(scene.visible, scene.checkbox && { left: scene.checkbox[0] - 10, top: scene.checkbox[1] - 10, width: 20, height: 20 });
    const plan = Core.timeline({ visible: scene.visible, origin, mouth: { x: scene.mouth.mouthX, y: scene.mouth.mouthY } }, random || seeded());
    return { scene, origin, plan };
}

test('timeline：各场景下每条关键帧序列 offset 在 [0,1] 内单调不减，且都以 offset=1 结束', () => {
    for (const name of Object.keys(SCENES)) {
        const { plan } = build(name);
        for (const key of ['paper', 'shade', 'ball', 'bin']) {
            const frames = plan[key];
            assert.ok(frames.length >= 2, `${name}.${key}`);
            assert.equal(frames[0].offset, 0, `${name}.${key} 起点`);
            assert.equal(frames[frames.length - 1].offset, 1, `${name}.${key} 终点`);
            for (let i = 1; i < frames.length; i++) {
                assert.ok(frames[i].offset >= frames[i - 1].offset, `${name}.${key}[${i}] offset 倒退`);
                assert.ok(frames[i].offset <= 1);
            }
        }
        assert.ok(0 < plan.a && plan.a < plan.b && plan.b < plan.c && plan.c < 1, name);
        const phases = P.CRUMPLE_MS + plan.flight + P.DROP_MS + P.SETTLE_MS;
        assert.equal(plan.total, phases, name);
        assert.ok(plan.total >= 900 && plan.total <= 1500, `${name} 总长 ${plan.total}`);
    }
});

test('timeline：纸片从原样开始、以纸团大小结束；纸团在纸片消失之前就已经淡入（交叠，不留空档）', () => {
    for (const name of Object.keys(SCENES)) {
        const { scene, plan } = build(name);
        const first = plan.paper[0];
        assert.match(first.transform, /scale\(1, 1\)/);
        assert.equal(first.opacity, 1);

        const atBall = plan.paper.find(frame => frame.offset === plan.a);
        assert.ok(atBall, `${name} 缺少 offset=a 的纸片帧`);
        const [sx, sy] = numbers(atBall.transform.match(/scale\([^)]*\)/)[0]);
        assert.ok(Math.abs(sx * scene.visible.width - P.BALL) < 0.05, `${name} 宽度收到 ${sx * scene.visible.width}`);
        assert.ok(Math.abs(sy * scene.visible.height - P.BALL) < 0.05, `${name} 高度收到 ${sy * scene.visible.height}`);
        assert.equal(atBall.opacity, 0);

        // 纸团先淡入：在 a*0.7 之前不可见，在 a 之前完全可见
        const ball = plan.ball;
        assert.equal(ball[0].opacity, 0);
        const hiddenUntil = ball.find(frame => frame.opacity === 1);
        assert.ok(hiddenUntil.offset < plan.a, `${name} 纸团应在纸片消失前出现`);
        const paperGoneAt = plan.paper.find(frame => frame.opacity === 0).offset;
        assert.ok(hiddenUntil.offset <= paperGoneAt, name);
    }
});

test('timeline：纸张底色在揉皱前半程就完全不透明（点击后列表立刻重绘，半透明克隆会与上移的下一张卡片叠成重影）', () => {
    for (const name of Object.keys(SCENES)) {
        const { plan } = build(name);
        const opaque = plan.shade.find(frame => frame.opacity === 1);
        assert.ok(opaque.offset <= plan.a * 0.5, `${name} 底色应在 ${plan.a * 0.5} 之前不透明，实际 ${opaque.offset}`);
        // 并且是单调变浓，不会闪
        for (let i = 1; i < plan.shade.length; i++) assert.ok(plan.shade[i].opacity >= plan.shade[i - 1].opacity);
    }
});

test('timeline：揉皱中段的长宽比不会退化成细长薄片（宽卡片也一样）', () => {
    const { scene, plan } = build('典型宽卡片');
    const stages = plan.paper.filter(frame => frame.offset > 0 && frame.offset < plan.a);
    assert.equal(stages.length, 3);
    let previousWidth = scene.visible.width;
    for (const frame of stages) {
        const [sx, sy] = numbers(frame.transform.match(/scale\([^)]*\)/)[0]);
        const width = sx * scene.visible.width, height = sy * scene.visible.height;
        assert.ok(width < previousWidth, '横向要持续收拢');
        previousWidth = width;
        if (frame === stages[stages.length - 1]) assert.ok(width / height < 2, `收尾阶段应接近方形，实际 ${(width / height).toFixed(2)}:1`);
        if (frame === stages[1]) assert.ok(width / height < 5, `中段不应是细长薄片，实际 ${(width / height).toFixed(2)}:1`);
    }
});

test('timeline：纸团起点 = 纸片最终形状的真实中心（独立用矩阵重算一遍）', () => {
    for (const name of Object.keys(SCENES)) {
        const { scene, origin, plan } = build(name);
        const sx = P.BALL / scene.visible.width, sy = P.BALL / scene.visible.height;
        const theta = P.PAPER_FINAL_DEG * Math.PI / 180;
        // 变换 = 以 origin 为原点：先缩放，再旋转。把包围盒中心代进去。
        const cx = scene.visible.width / 2 - origin.x, cy = scene.visible.height / 2 - origin.y;
        const sxv = cx * sx, syv = cy * sy;
        const rx = sxv * Math.cos(theta) - syv * Math.sin(theta);
        const ry = sxv * Math.sin(theta) + syv * Math.cos(theta);
        const expectX = scene.visible.left + origin.x + rx;
        const expectY = scene.visible.top + origin.y + ry;
        assert.ok(Math.abs(plan.ballStart.x - expectX) < 1e-9, `${name} x`);
        assert.ok(Math.abs(plan.ballStart.y - expectY) < 1e-9, `${name} y`);
        // 起点 + 位移 = 纸篓口
        assert.ok(Math.abs(plan.ballStart.x + plan.land.dx - scene.mouth.mouthX) < 1e-9);
        assert.ok(Math.abs(plan.ballStart.y + plan.land.dy - scene.mouth.mouthY) < 1e-9);
    }
});

test('timeline：纸团飞行段从零位移出发，终点正好是纸篓口，随后沉入纸篓并消失', () => {
    for (const name of Object.keys(SCENES)) {
        const { plan } = build(name);
        const ball = plan.ball;
        const launch = ball.find(frame => frame.offset === plan.a && frame.opacity === 1);
        assert.ok(launch, `${name} 缺少起飞帧`);
        assert.match(launch.transform, /^translate\(0px, 0px\)/);

        const arrive = ball.filter(frame => frame.offset === plan.b).pop();
        const [tx, ty] = numbers(arrive.transform.match(/translate\([^)]*\)/)[0]);
        assert.ok(Math.abs(tx - plan.land.dx) < 0.01 && Math.abs(ty - plan.land.dy) < 0.01, `${name} 终点 ${tx},${ty}`);

        const sunk = ball.find(frame => frame.offset === plan.c);
        const [sxv, syv] = numbers(sunk.transform.match(/translate\([^)]*\)/)[0]);
        assert.ok(Math.abs(sxv - plan.land.dx) < 0.01);
        assert.ok(Math.abs(syv - (plan.land.dy + P.DROP_PX)) < 0.01, '下沉到纸篓口以下');
        assert.equal(ball[ball.length - 1].opacity, 0);

        // 飞行段 x 位移单调（不会往回飞）
        const flight = ball.filter(frame => frame.offset >= plan.a && frame.offset <= plan.b && frame.opacity === 1);
        const xs = flight.map(frame => numbers(frame.transform.match(/translate\([^)]*\)/)[0])[0]);
        const sign = Math.sign(plan.land.dx) || 1;
        for (let i = 1; i < xs.length; i++) assert.ok((xs[i] - xs[i - 1]) * sign >= -1e-9, name);
    }
});

test('timeline：纸篓在纸团起飞前就已经出现；晃动从纸团到达开始，正好在时间线末尾结束；光圈落在入篓之后', () => {
    for (const name of Object.keys(SCENES)) {
        const { plan } = build(name);
        const visibleAt = plan.bin.find(frame => frame.opacity === 1);
        assert.ok(visibleAt.offset <= plan.a, `${name} 纸篓应先于纸团起飞出现`);
        assert.equal(plan.bin[plan.bin.length - 1].opacity, 0);
        // 纸篓在纸团入篓后还要停留一会才淡出
        const fadeStart = plan.bin.filter(frame => frame.opacity === 1).pop().offset;
        assert.ok(fadeStart > plan.c, name);

        assert.equal(plan.wobble.delay, P.CRUMPLE_MS + plan.flight);
        assert.equal(plan.wobble.delay + plan.wobble.duration, plan.total, '晃动正好收在时间线末尾');
        assert.equal(plan.wobble.from, P.WOBBLE_DEG);

        assert.ok(plan.pulse.delay > P.CRUMPLE_MS + plan.flight && plan.pulse.delay < plan.total, name);
        assert.equal(plan.pulse.duration, P.PULSE_MS);
    }
});

test('timeline：飞行时长随距离变化；纸篓近则短、远则长；落点相同的第三组纸篓更靠左', () => {
    const far = build('典型宽卡片').plan;
    const near = build('纸篓就在旁边').plan;
    assert.ok(far.flight > near.flight);
    assert.ok(far.distance > near.distance);
    assert.ok(near.flight >= P.FLIGHT_MIN_MS && far.flight <= P.FLIGHT_MAX_MS);
    const third = build('第三组纸篓').plan;
    assert.ok(third.land.dx < far.land.dx, '第三组纸篓在左边，水平位移更小');
});

test('timeline：同样的输入与种子得到完全一致的结果；弧线顶点不低于起点和终点', () => {
    const one = build('典型宽卡片', seeded(3)).plan;
    const two = build('典型宽卡片', seeded(3)).plan;
    assert.deepEqual(one, two);
    const lifts = one.ball.filter(frame => frame.offset >= one.a && frame.offset <= one.b && frame.opacity === 1)
        .map(frame => numbers(frame.transform.match(/translate\([^)]*\)/)[0])[1]);
    assert.ok(Math.min(...lifts) < Math.min(0, one.land.dy), '顶点要高于起点与终点');
});

test('timeline：输出里只有描述数据（可序列化），不含函数或 DOM 引用', () => {
    const { plan } = build('典型宽卡片');
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});

// ---------- 抓取水母时的纸篓（2026-10-15）：纸篓只是视觉落点，几何复用 binPlacement ----------

test('inBinZone：纸篓外框向四周放大 BIN_HOT 以内都算对准（边界含），再远不算；坏输入一律 false', () => {
    const bin = Core.binPlacement(null, { width: 1440, height: 900 }, 0);
    const hot = P.BIN_HOT;
    assert.ok(hot >= 24 && hot <= 80, '放大量合理：够容错、又不会离得老远就算');
    const cx = bin.left + bin.width / 2, cy = bin.top + bin.height / 2;
    assert.equal(Core.inBinZone(bin, cx, cy), true);
    assert.equal(Core.inBinZone(bin, bin.mouthX, bin.mouthY), true);
    assert.equal(Core.inBinZone(bin, bin.left - hot, cy), true, '左边界');
    assert.equal(Core.inBinZone(bin, bin.left - hot - 1, cy), false);
    assert.equal(Core.inBinZone(bin, bin.left + bin.width + hot, cy), true, '右边界');
    assert.equal(Core.inBinZone(bin, bin.left + bin.width + hot + 1, cy), false);
    assert.equal(Core.inBinZone(bin, cx, bin.top - hot), true, '上边界');
    assert.equal(Core.inBinZone(bin, cx, bin.top - hot - 1), false);
    assert.equal(Core.inBinZone(bin, cx, bin.top + bin.height + hot), true, '下边界');
    assert.equal(Core.inBinZone(bin, cx, bin.top + bin.height + hot + 1), false);
    assert.equal(Core.inBinZone(bin, 5, 5), false, '屏幕另一头');
    for (const bad of [[NaN, 1], [1, NaN], [Infinity, 0], ['700', '800'], [undefined, undefined], [null, null]]) {
        assert.equal(Core.inBinZone(bin, ...bad), false, String(bad));
    }
    assert.equal(Core.inBinZone(null, cx, cy), false);
    assert.equal(Core.inBinZone(undefined, cx, cy), false);
    // 多组同时出现时向左排开的纸篓，对准区跟着各自走
    const second = Core.binPlacement(null, { width: 1440, height: 900 }, 1);
    assert.equal(Core.inBinZone(second, second.mouthX, second.mouthY), true);
    assert.ok(second.left < bin.left);
});

test('抓取用纸篓的时间参数：出现/收起不拖沓，晃动沿用落入+晃动的总长，兜底远长于一次正常抓取', () => {
    for (const key of ['BIN_HOT', 'HOLD_FADE_MS', 'HOLD_MAX_MS', 'NEAR_SCALE']) assert.ok(Number.isFinite(P[key]) && P[key] > 0, key);
    assert.ok(P.HOLD_FADE_MS >= 120 && P.HOLD_FADE_MS <= 400);
    assert.ok(P.NEAR_SCALE > 1 && P.NEAR_SCALE <= 1.4, '对准时纸篓略微放大，不夸张');
    assert.ok(P.HOLD_MAX_MS >= 30000, '用户可能抓着水母想一会儿，兜底不能太短');
    assert.ok(Object.isFrozen(P));
});
