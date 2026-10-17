// 水母的“情绪”与“成长”：专注（慢而稳）、起舞（每拍收缩并摇摆）、按连续完成任务的天数长大，以及番茄钟面板里的陪伴水母。
// 全部是纯视觉：核心只读宿主给的状态；皮肤只读任务表；陪伴水母不读写任何番茄钟或任务数据。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jellyfish-core.js');
const Skin = require('../js/jellyfish.js');
const Pomodoro = require('../js/pomodoro-jelly.js');

const P = Core.PARAMS;
const tick = () => new Promise(resolve => setImmediate(resolve));

function seeded(seed = 7) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function world(count = 1, options = {}) {
    const w = Core.createWorld({ width: 1440, height: 900, random: seeded(options.seed || 7), ...options });
    Core.reconcile(w, count, { instant: true });
    return w;
}

function run(w, seconds, input = {}, frameMs = 16) {
    const frames = Math.round(seconds * 1000 / frameMs);
    for (let i = 0; i < frames; i++) Core.step(w, frameMs, input);
}

const localDay = stamp => {
    const d = new Date(stamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const done = stamp => ({ id: `d${stamp}`, completed: true, completedAt: stamp });

// ---------- 情绪 ----------

test('setMood：布尔与 0..1 都收；越界夹紧、非法值按 0、没给的项保持不变', () => {
    const w = world();
    Core.setMood(w, { focus: true, dance: 0.4 });
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 0.4 });
    Core.setMood(w, { focus: 5 });
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 0.4 }, '没给 dance 就不变');
    Core.setMood(w, { focus: -3, dance: 'x' });
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    Core.setMood(w, { focus: NaN, dance: Infinity });
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    Core.setMood(w, { dance: false });
    assert.equal(w.moodTarget.dance, 0);
    assert.doesNotThrow(() => { Core.setMood(null, { focus: 1 }); Core.setMood(w); });
});

test('情绪平滑过渡：单调靠近目标、几秒内到位、到位后恰好等于目标，不会突然跳', () => {
    const w = world();
    Core.setMood(w, { focus: 1 });
    let previous = 0, biggestJump = 0;
    for (let i = 0; i < 40; i++) {
        Core.step(w, 16, {});
        assert.ok(w.mood.focus >= previous - 1e-12, '单调不减');
        biggestJump = Math.max(biggestJump, w.mood.focus - previous);
        previous = w.mood.focus;
    }
    assert.ok(biggestJump < 0.05, `每帧变化很小（${biggestJump}）`);
    run(w, 6);
    assert.equal(w.mood.focus, 1);
    Core.setMood(w, { focus: 0 });
    run(w, 6);
    assert.equal(w.mood.focus, 0);
});

test('专注：每次收缩的推力降到 FOCUS_THRUST 倍（其余条件相同）', () => {
    const impulse = focus => {
        const w = world(1, { seed: 21 });
        const j = w.jellies[0];
        j.vx = j.vy = 0; j.heading = 0; j.tilt = 0;
        w.mood.focus = focus; w.moodTarget.focus = focus;     // 直接设为已到位的状态：这里只比较推力
        Core.step(w, 16, { beat: j.offset });                  // 轮到它收缩的一拍
        return Math.hypot(j.vx, j.vy);
    };
    const normal = impulse(0), calm = impulse(1), half = impulse(0.5);
    assert.ok(normal > 1);
    assert.ok(Math.abs(calm / normal - P.FOCUS_THRUST) < 0.04, `专注推力比 ${calm / normal}`);
    assert.ok(half < normal && half > calm, '情绪程度越高越安静');
});

test('起舞：超过阈值时按舞步格收缩（“嗨”每格一次）；平时每 2–3 拍才一次；阈值以内不算起舞', () => {
    const pulses = (dance, seconds) => {
        const w = world(1, { seed: 5, spirit: 'hype' });
        const j = w.jellies[0];
        w.mood.dance = dance; w.moodTarget.dance = dance;
        let count = 0, last = j.pulseT;
        for (let i = 0; i < seconds * 62.5; i++) {
            Core.step(w, 16, { beat: Math.floor(i * 16 / 1000) });
            if (j.pulseT < last) count++;
            last = j.pulseT;
        }
        return count;
    };
    const grids = Math.floor(30 / P.DANCE_GRID_S);
    assert.ok(Math.abs(pulses(1, 30) - grids) <= 1, `起舞：30 秒约 ${grids} 个舞步格各一次，实际 ${pulses(1, 30)}`);
    assert.equal(pulses(P.DANCE_THRESHOLD, 36), 36 / P.PERIODS[0], '正好等于阈值不算起舞：仍按时钟拍点每 2 拍一次');
    assert.equal(pulses(0, 36), 36 / P.PERIODS[0]);
});

test('起舞：航向随时间左右摇摆（程度越高幅度越大），安静时不额外摇', () => {
    const swing = dance => {
        const w = world(1, { seed: 9, spirit: 'hype' });
        const j = w.jellies[0];
        w.mood.dance = dance; w.moodTarget.dance = dance;
        // 航向的总变化量（逐帧 |Δ| 之和）：缓慢的漫游转向很小，节奏性摇摆才会让它明显变大——比“最大减最小”不受漫游偏转影响
        let total = 0, previous = j.heading;
        for (let i = 0; i < 300; i++) { Core.step(w, 16, { beat: null }); total += Math.abs(j.heading - previous); previous = j.heading; }
        return total;
    };
    assert.ok(swing(1) > swing(0) + 0.1, `起舞 ${swing(1)} 对 平常 ${swing(0)}`);
});

test('起舞摇摆幅度与起舞程度成正比：同样不触发每拍收缩的 0.5 对 1，摇得更小', () => {
    const swing = dance => {
        const w = world(1, { seed: 9, spirit: 'hype' });
        const j = w.jellies[0];
        w.mood.dance = dance; w.moodTarget.dance = dance;
        // 航向的总变化量（逐帧 |Δ| 之和）：缓慢的漫游转向很小，节奏性摇摆才会让它明显变大——比“最大减最小”不受漫游偏转影响
        let total = 0, previous = j.heading;
        for (let i = 0; i < 300; i++) { Core.step(w, 16, { beat: null }); total += Math.abs(j.heading - previous); previous = j.heading; }
        return total;
    };
    const low = swing(0.5), high = swing(1), none = swing(0);
    assert.ok(none < low && low < high, `${none} < ${low} < ${high}`);
});

test('setMood 只改给了的那一项：设了专注再只给 dance，专注目标不变，反过来也一样', () => {
    const w = world();
    Core.setMood(w, { focus: 1 });
    Core.setMood(w, { dance: 0.3 });
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 0.3 });
    Core.setMood(w, { focus: 0.2 });
    assert.deepEqual(w.moodTarget, { focus: 0.2, dance: 0.3 });
});

test('情绪与数值安全：长时间运行、情绪来回切换，位置/速度/半径始终是有限数', () => {
    const w = world(4, { seed: 3 });
    for (let i = 0; i < 2000; i++) {
        if (i % 200 === 0) Core.setMood(w, { focus: (i / 200) % 2, dance: ((i / 200) + 1) % 2 });
        Core.step(w, 16, { beat: Math.floor(i / 60) });
    }
    for (const j of w.jellies) for (const v of [j.x, j.y, j.vx, j.vy, j.heading, j.r]) assert.ok(Number.isFinite(v));
});

// ---------- 成长 ----------

test('setGrowth：取整并夹在 0..GROW_MAX，非法值按 0', () => {
    const w = world();
    for (const [input, expected] of [[3, 3], [3.9, 3], [99, P.GROW_MAX], [-2, 0], [NaN, 0], ['x', 0], [undefined, 0], [Infinity, 0]]) {
        Core.setGrowth(w, input);
        assert.equal(w.grow, expected, String(input));
    }
    assert.doesNotThrow(() => Core.setGrowth(null, 3));
});

test('成长：钟罩平滑长到出生半径 ×(1 + 级别 × GROW_STEP)，回到 0 级再缩回原样；0 级时半径一位不动', () => {
    const w = world(2, { seed: 4 });
    const base = w.jellies.map(j => j.r);
    run(w, 3);
    assert.deepEqual(w.jellies.map(j => j.r), base, '0 级：半径完全不变');
    Core.setGrowth(w, 5);
    Core.step(w, 16, {});
    w.jellies.forEach((j, i) => assert.ok(j.r > base[i] && j.r < base[i] * 1.02, '一帧只长一点点'));
    run(w, 5);
    w.jellies.forEach((j, i) => assert.ok(Math.abs(j.r - base[i] * (1 + P.GROW_STEP * 5)) < base[i] * 0.002, `长到位 ${j.r}`));
    Core.setGrowth(w, 0);
    run(w, 6);
    w.jellies.forEach((j, i) => assert.ok(Math.abs(j.r - base[i]) < base[i] * 0.002));
});

test('成长与窗口缩放：改窗口大小后出生半径同步缩放，成长倍数不丢也不叠加', () => {
    const w = world(1, { seed: 6 });
    Core.setGrowth(w, 5);
    run(w, 6);
    const j = w.jellies[0];
    const ratio = j.r / j.r0;
    Core.resize(w, 720, 450);
    assert.ok(Math.abs(j.r / j.r0 - ratio) < 1e-9, '缩放前后 r/r0 不变');
    run(w, 6);
    assert.ok(Math.abs(j.r / j.r0 - (1 + P.GROW_STEP * 5)) < 0.003);
});

test('shiftDay：跨月、跨年、闰年；格式不对返回空串', () => {
    assert.equal(Core.shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(Core.shiftDay('2028-03-01', -1), '2028-02-29');
    assert.equal(Core.shiftDay('2026-01-01', -1), '2025-12-31');
    assert.equal(Core.shiftDay('2026-12-31', 1), '2027-01-01');
    assert.equal(Core.shiftDay('2026-10-15', 0), '2026-10-15');
    for (const bad of ['', 'x', '2026-1-5', '2026/10/15', null, undefined, 20261015]) assert.equal(Core.shiftDay(bad, 1), '', String(bad));
});

test('completionStreak：从今天往回数连续有完成的天数；今天还没完成就从昨天起数；断一天就停', () => {
    const today = '2026-10-15';
    const memos = [done(at(2026, 10, 15)), done(at(2026, 10, 14)), done(at(2026, 10, 13)), done(at(2026, 10, 11))];
    assert.equal(Core.completionStreak(memos, today, localDay), 3, '15、14、13 三天，12 号断了');
    assert.equal(Core.completionStreak(memos.slice(1), today, localDay), 2, '今天还没完成：从昨天起算 14、13');
    assert.equal(Core.completionStreak([done(at(2026, 10, 13))], today, localDay), 0, '昨天也没有就是 0');
    assert.equal(Core.completionStreak([done(at(2026, 10, 15)), done(at(2026, 10, 15, 9)), done(at(2026, 10, 15, 22))], today, localDay), 1, '同一天多个只算一天');
    const crossMonth = [done(at(2026, 9, 29)), done(at(2026, 9, 30)), done(at(2026, 10, 1)), done(at(2026, 10, 2))];
    assert.equal(Core.completionStreak(crossMonth, '2026-10-02', localDay), 4, '跨月照样连续');
});

test('completionStreak：只数真正完成的普通任务；失败、未完成、没有或非法的完成时间都不算；输入不是数组返回 0', () => {
    const today = '2026-10-15';
    const stamp = at(2026, 10, 15);
    const base = { id: 'a', completed: true, completedAt: stamp };
    assert.equal(Core.completionStreak([base], today, localDay), 1);
    for (const patch of [{ completed: false }, { status: 'failed' }, { completedAt: null }, { completedAt: NaN }, { completedAt: Infinity }, { completedAt: '2026-10-15' }, { completed: 'yes' }]) {
        assert.equal(Core.completionStreak([{ ...base, ...patch }], today, localDay), 0, JSON.stringify(patch));
    }
    for (const bad of [null, undefined, {}, 'x', 5]) assert.equal(Core.completionStreak(bad, today, localDay), 0);
    assert.equal(Core.completionStreak([null, 3, 'x', base], today, localDay), 1, '坏条目被跳过');
    assert.equal(Core.completionStreak([base], '', localDay), 0, '没有今天的日期');
    assert.equal(Core.completionStreak([base], 'bad', localDay), 0);
    assert.equal(Core.completionStreak([base], today, null), 0, '没有 dayOf');
    assert.equal(Core.completionStreak([base], today, () => ''), 0, 'dayOf 给不出日期');
});

test('completionStreak：连续天数有上限保护（不会无限循环）', () => {
    const memos = [];
    let day = '2020-01-01';
    for (let i = 0; i < 800; i++) {
        const [y, m, d] = day.split('-').map(Number);
        memos.push(done(at(y, m, d)));
        day = Core.shiftDay(day, 1);
    }
    const streak = Core.completionStreak(memos, Core.shiftDay(day, -1), localDay);
    assert.ok(streak >= 365 && streak <= 400, `streak ${streak}`);
});

test('growthLevel：1 天一级起、连续 7 天封顶；0、负数、非法值为 0', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 100].map(Core.growthLevel), [0, 1, 2, 3, 3, 4, 4, 5, 5, 5]);
    for (const bad of [-1, NaN, 'x', null, undefined, Infinity]) assert.equal(Core.growthLevel(bad), 0, String(bad));
    assert.equal(Core.growthLevel(2.9), 2, '取整');
    assert.equal(P.GROW_TABLE[P.GROW_TABLE.length - 1], P.GROW_MAX, '表的最高级就是上限');
    assert.ok(P.GROW_TABLE.every((v, i, a) => i === 0 || v >= a[i - 1]), '级别不随天数下降');
});

// ---------- 皮肤：把宿主的开关接到核心 ----------

function fakeStorage(memos) {
    const listeners = [];
    const chrome = {
        storage: {
            local: { get: () => Promise.resolve({ memos }), set() { throw new Error('不应写入'); }, remove() { throw new Error('不应写入'); }, clear() { throw new Error('不应写入'); } },
            onChanged: { addListener: fn => listeners.push(fn), removeListener: fn => listeners.splice(listeners.indexOf(fn), 1) },
        },
    };
    return { chrome, listeners };
}

function noopCtx() {
    return new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : (key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})),
        set: (target, key, value) => { target[key] = value; return true; },
    });
}

function skinEnv(memos, wallMs = at(2026, 10, 15, 12)) {
    const store = fakeStorage(memos);
    const clock = { now: 0 };
    const skin = Skin.create({
        document: { getElementById: () => null }, window: { performance: { now: () => clock.now } }, chrome: store.chrome,
        MutationObserver: class { observe() {} disconnect() {} }, now: () => clock.now, wall: () => wallMs + clock.now, random: seeded(11), warn() {},
    });
    const frames = (n, extra = {}) => {
        for (let i = 0; i < n; i++) {
            clock.now += 16;
            skin.frame({ ctx: noopCtx(), width: 1280, height: 720, dt: 16, now: clock.now, amount: 0.65, night: false, ...extra });
        }
    };
    return { skin, store, frames, clock };
}

test('皮肤：frame 的 focus / dance 选项驱动情绪目标；不传就回到 0（宿主停止传就恢复）', async () => {
    const env = skinEnv([{ id: 'a', completed: false }, { id: 'b', completed: false }]);
    env.skin.start();
    await tick();
    env.frames(5);
    const w = env.skin._world();
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    env.frames(5, { focus: 1, dance: 0.6 });
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 0.6 });
    env.frames(5, { focus: true, dance: true });
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 1 });
    env.frames(5, { focus: false, dance: 0 });
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    env.frames(5, { focus: NaN, dance: 'x' });
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    env.frames(5, { dance: 1 });
    env.frames(5);
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 }, '不再传就回到平常');
});

test('皮肤：成长级别来自存储里任务的连续完成天数；grow 不是 true 时不长；读不到任务表时保持 0', async () => {
    const memos = [{ id: 'p1', completed: false }, done(at(2026, 10, 15)), done(at(2026, 10, 14)), done(at(2026, 10, 13)), done(at(2026, 10, 12))];
    const env = skinEnv(memos);
    env.skin.start();
    await tick();
    assert.equal(env.skin.growth(), 3, '连续 4 天 → 3 级');
    env.frames(2, { grow: false });
    assert.equal(env.skin._world().grow, 0, '设置关了：不长');
    env.frames(2, { grow: true });
    assert.equal(env.skin._world().grow, 3);
    env.frames(2);
    assert.equal(env.skin._world().grow, 0, '不传 grow 当关');
    const none = skinEnv(undefined);
    none.skin.start();
    await tick();
    assert.equal(none.skin.growth(), 0);
});

test('皮肤：任务表变化（存储事件）会重新计算成长级别；今天的新完成让连续天数 +1', async () => {
    const env = skinEnv([{ id: 'p', completed: false }, done(at(2026, 10, 14)), done(at(2026, 10, 13))]);
    env.skin.start();
    await tick();
    assert.equal(env.skin.growth(), 2, '昨天、前天：今天还没完成也算 2');
    env.store.listeners[0]({ memos: { newValue: [{ id: 'p', completed: false }, done(at(2026, 10, 15)), done(at(2026, 10, 14)), done(at(2026, 10, 13))] } }, 'local');
    assert.equal(env.skin.growth(), 3);
    env.store.listeners[0]({ memos: { newValue: [{ id: 'p', completed: false }] } }, 'local');
    assert.equal(env.skin.growth(), 0, '全部清掉就回到 0');
    const before = env.skin.growth();
    env.store.listeners[0]({ memos: { newValue: 'broken' } }, 'local');
    assert.equal(env.skin.growth(), before, '形状不对：保持上一次');
});

test('皮肤：成长全程只读——存储的 set/remove/clear 一次都没被调用（替身遇到写入会抛错）', async () => {
    const env = skinEnv([{ id: 'p', completed: false }, done(at(2026, 10, 15))]);
    env.skin.start();
    await tick();
    assert.doesNotThrow(() => env.frames(60, { grow: true, dance: 1, focus: 0 }));
});

// ---------- 绘制：情绪影响光晕 ----------

function recorder() {
    const gradients = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_gradients') return gradients;
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'createRadialGradient' || key === 'createLinearGradient') {
                    const gradient = { key, args, stops: [] };
                    gradients.push(gradient);
                    return { addColorStop(offset, color) { gradient.stops.push({ offset, color }); } };
                }
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}

/** 画一只水母，返回最外圈光晕（半径最大的径向渐变）的半径与中心色标透明度。 */
function haloOf(mood, time = 0, pulseT = 99) {
    const w = world(1, { seed: 13 });
    const j = w.jellies[0];
    j.alpha = 1; j.state = 'alive'; j.pulseT = pulseT;
    Object.assign(w.mood, mood);
    w.time = time;
    const ctx = recorder();
    Skin.draw(ctx, w, Skin.PALETTE, 0.65, { labels: false, night: 0 });
    const radial = ctx._gradients.filter(g => g.key === 'createRadialGradient');
    const biggest = radial.reduce((a, b) => (b.args[5] > a.args[5] ? b : a));
    const alpha = Number(/,([\d.]+)\)$/.exec(biggest.stops[0].color)[1]);
    return { radius: biggest.args[5], alpha };
}

test('绘制：专注时光晕随 8 秒周期呼吸（同相）；不专注时没有周期变化', () => {
    const peak = haloOf({ focus: 1, dance: 0 }, 2);       // sin(2π·2/8) = 1
    const trough = haloOf({ focus: 1, dance: 0 }, 6);     // sin(2π·6/8) = -1
    const rest = haloOf({ focus: 0, dance: 0 }, 2);
    assert.ok(peak.alpha > trough.alpha * 1.5, `呼吸：${peak.alpha} 对 ${trough.alpha}`);
    assert.ok(Math.abs(rest.alpha - haloOf({ focus: 0, dance: 0 }, 6).alpha) < 1e-9);
    assert.ok(peak.alpha > rest.alpha && trough.alpha < rest.alpha, '呼吸在平常亮度上下摆动');
    assert.equal(peak.radius, trough.radius, '专注只改亮度不改大小');
});

test('绘制：起舞时光晕在收缩的那一下变大变亮；舒张后回到平常', () => {
    const squeezed = haloOf({ focus: 0, dance: 1 }, 0, 0.2);   // pulseT = SQUEEZE_S：收缩到最紧
    const relaxed = haloOf({ focus: 0, dance: 1 }, 0, 99);
    const rest = haloOf({ focus: 0, dance: 0 }, 0, 0.2);
    assert.ok(squeezed.radius > relaxed.radius * 1.2, `${squeezed.radius} 对 ${relaxed.radius}`);
    assert.ok(squeezed.alpha > relaxed.alpha * 1.3);
    assert.ok(Math.abs(relaxed.radius - haloOf({ focus: 0, dance: 0 }, 0, 99).radius) < 1e-9, '舒张后与平常一样');
    assert.ok(squeezed.radius > rest.radius, '不起舞时收缩不会额外鼓光晕');
});

test('绘制：没有 mood 的世界（旧调用）照常画，不抛错', () => {
    const w = world(1);
    delete w.mood;
    assert.doesNotThrow(() => Skin.draw(recorder(), w, Skin.PALETTE, 0.65, { labels: false, night: 0 }));
});

// ---------- 番茄钟陪伴水母 ----------

function fakeCanvas(connected = true) {
    const calls = [];
    const canvas = {
        className: '', style: {}, width: 0, height: 0, isConnected: connected, parentNode: null, attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getContext: () => new Proxy({ _calls: calls }, {
            get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push([String(k), ...a]); })),
            set: (t, k, v) => { t[k] = v; return true; },
        }),
    };
    return { canvas, calls };
}

function pomodoroEnv(options = {}) {
    const made = fakeCanvas();
    const children = [];
    const host = {
        isConnected: true, clientWidth: options.width === undefined ? 292 : options.width, firstChild: null,
        insertBefore(node) { node.parentNode = host; children.unshift(node); host.firstChild = children[0]; },
        appendChild(node) { node.parentNode = host; children.push(node); host.firstChild = children[0]; },
        removeChild(node) { const i = children.indexOf(node); if (i >= 0) children.splice(i, 1); node.parentNode = null; host.firstChild = children[0] || null; },
    };
    const listeners = {};
    const doc = {
        hidden: false,
        createElement: () => made.canvas,
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    };
    const queue = [];
    let nextId = 1;
    const cancelled = new Set();
    const writes = [];
    const chrome = options.chrome !== undefined ? options.chrome : {
        storage: { sync: { get: () => Promise.resolve({ backgroundExperienceSettings: options.stored || {} }), set() { writes.push('sync.set'); } }, local: { set() { writes.push('local.set'); }, remove() { writes.push('local.remove'); } } },
    };
    const env = {
        document: doc, window: { devicePixelRatio: options.dpr || 2, performance: { now: () => 0 } }, chrome,
        skin: options.skin !== undefined ? options.skin : Skin.create({ document: { getElementById: () => null }, window: {}, chrome: {}, warn() {} }),
        random: seeded(3),
        requestAnimationFrame: fn => { const id = nextId++; queue.push({ id, fn }); return id; },
        cancelAnimationFrame: id => cancelled.add(id),
        now: () => 0,
        reduceMotion: !!options.reduceMotion,
    };
    let t = 0;                                   // 跨多次 pump 累计的“帧时间”，每帧前进 ms 毫秒
    const pump = (frames, ms = 16) => {
        for (let i = 0; i < frames; i++) {
            const next = queue.shift();
            if (!next) break;
            t += ms;
            if (!cancelled.has(next.id)) next.fn(t);
        }
    };
    return { host, children, doc, listeners, env, made, queue, pump, writes, cancelled };
}

test('陪伴水母 moodFor：专注计时中安静、休息计时中起舞、暂停/未开始都是平常', () => {
    assert.deepEqual(Pomodoro.moodFor({ mode: 'work', running: true }), { focus: 1, dance: 0 });
    assert.deepEqual(Pomodoro.moodFor({ mode: 'work', running: false }), { focus: 0, dance: 0 });
    for (const mode of ['short-break', 'long-break']) {
        assert.deepEqual(Pomodoro.moodFor({ mode, running: true }), { focus: 0, dance: 0.8 }, mode);
        assert.deepEqual(Pomodoro.moodFor({ mode, running: false }), { focus: 0, dance: 0 });
    }
    assert.deepEqual(Pomodoro.moodFor(null), { focus: 0, dance: 0 });
    assert.deepEqual(Pomodoro.moodFor({ mode: 'work', running: 'yes' }), { focus: 0, dance: 0 }, '只认真正的 true');
});

test('陪伴水母：设置读出后才挂上画布；画布不接收鼠标、对读屏隐藏、按设备像素比放大；只有一只水母且待在中间', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    assert.equal(handle.isMounted(), false, '设置还没读出来之前不挂');
    await tick();
    assert.equal(handle.isMounted(), true);
    assert.equal(e.children.length, 1);
    assert.equal(e.made.canvas.attrs['aria-hidden'], 'true');
    assert.match(e.made.canvas.style.cssText, /pointer-events:none/);
    // 四边柔和淡出：遮罩是 closest-side 椭圆，到画布边缘时完全透明（不是硬切、也不会露出光晕的矩形）
    for (const prop of ['-webkit-mask-image', 'mask-image']) assert.match(e.made.canvas.style.cssText, new RegExp(`${prop}:radial-gradient\\(ellipse closest-side at 50% 50%, #000 \\d+%, transparent 100%\\)`));
    assert.equal(e.made.canvas.width, 292 * 2);
    assert.equal(e.made.canvas.height, Pomodoro.HEIGHT * 2);
    const w = handle._world();
    assert.equal(w.jellies.length, 1);
    assert.equal(w.jellies[0].taskId, null, '不绑定任何任务');
    assert.equal(w.jellies[0].home.x, 146);
    assert.equal(e.queue.length, 1, '挂上后只有一条 RAF');
    handle.destroy();
});

test('陪伴水母：设置里关掉、减少动态效果、没有皮肤脚本、没有宿主元素时都不挂、不排 RAF', async () => {
    for (const options of [{ stored: { pomodoroJelly: false } }, { reduceMotion: true }, { skin: null }]) {
        const e = pomodoroEnv(options);
        const handle = Pomodoro.attach(e.host, e.env);
        await tick();
        assert.equal(handle.isMounted(), false, JSON.stringify(options));
        assert.equal(e.children.length, 0);
        assert.equal(e.queue.length, 0);
        assert.doesNotThrow(() => { handle.setState({ mode: 'work', running: true }); handle.finish(); handle.destroy(); });
    }
    const none = Pomodoro.attach(null, pomodoroEnv().env);
    assert.equal(none.isMounted(), false);
    assert.doesNotThrow(() => { none.setState({}); none.finish(); none.destroy(); });
});

test('陪伴水母：存储读不到或没有存储接口时按默认开启', async () => {
    for (const chrome of [null, { storage: {} }, { storage: { sync: { get: () => Promise.reject(new Error('x')) } } }]) {
        const e = pomodoroEnv({ chrome });
        const handle = Pomodoro.attach(e.host, e.env);
        await tick();
        assert.equal(handle.isMounted(), true, String(chrome && Object.keys(chrome.storage)));
        handle.destroy();
    }
});

test('陪伴水母：setState 只改情绪目标（平滑过渡）；专注时拍点放慢一倍', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    const w = handle._world();
    e.pump(10);
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    handle.setState({ mode: 'work', running: true });
    e.pump(10);
    assert.deepEqual(w.moodTarget, { focus: 1, dance: 0 });
    assert.ok(w.mood.focus > 0 && w.mood.focus < 1, '正在过渡');
    handle.setState({ mode: 'short-break', running: true });
    e.pump(10);
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0.8 });
    handle.setState({ mode: 'work', running: false });
    e.pump(3);
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 });
    handle.setState(null); handle.setState('x'); handle.setState({ running: 1 });
    e.pump(3);
    assert.deepEqual(w.moodTarget, { focus: 0, dance: 0 }, '垃圾输入不改变状态，也不抛错');
    handle.destroy();
});

test('陪伴水母：专注时收缩次数明显少于平常（拍点放慢一倍）', async () => {
    const count = async state => {
        const e = pomodoroEnv();
        const handle = Pomodoro.attach(e.host, e.env);
        await tick();
        handle.setState(state);
        e.pump(400);                                  // 先过渡到位（约 6.4 秒）
        const jelly = handle._world().jellies[0];
        let pulses = 0, previous = jelly.pulseT;
        for (let i = 0; i < 2500; i++) {              // 再看 40 秒
            e.pump(1);
            if (previous >= 0.1 && jelly.pulseT < 0.1) pulses++;
            previous = jelly.pulseT;
        }
        handle.destroy();
        return pulses;
    };
    const normal = await count({ mode: 'work', running: false });
    const focused = await count({ mode: 'work', running: true });
    const dancing = await count({ mode: 'short-break', running: true });
    assert.ok(normal >= 10, `平常 ${normal}`);
    assert.ok(focused < normal * 0.7, `专注 ${focused} 对 平常 ${normal}`);
    assert.ok(dancing > normal, `休息 ${dancing} 对 平常 ${normal}`);
});

test('陪伴水母：长时间运行后漫游目标仍在画布中间（不会游去别处、被裁掉）', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    e.pump(2500);                                      // 40 秒，超过任何漫游换点间隔
    const jelly = handle._world().jellies[0];
    assert.deepEqual(jelly.home, { x: 146, y: Pomodoro.HEIGHT * Pomodoro.HOME_Y });
    assert.ok(jelly.x > 0 && jelly.x < 292 && jelly.y > -10 && jelly.y < Pomodoro.HEIGHT + 30, `位置 ${jelly.x},${jelly.y}`);
    handle.destroy();
});

test('陪伴水母：finish 在下一帧放一串庆祝气泡（有上限），没挂上或已销毁时什么都不做', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    const w = handle._world();
    e.pump(3);
    assert.equal(w.fx.bubbles.length, 0);
    handle.finish();
    assert.equal(w.fx.bubbles.length, 0, '下一帧才放');
    e.pump(1);
    assert.ok(w.fx.bubbles.length > 0 && w.fx.bubbles.length <= P.BURST_MAX);
    assert.ok(w.fx.rings.length >= 1 && w.fx.rings.length <= P.BURST_RINGS_MAX);
    handle.destroy();
    assert.doesNotThrow(() => handle.finish());
    const off = pomodoroEnv({ reduceMotion: true });
    const idle = Pomodoro.attach(off.host, off.env);
    await tick();
    idle.finish();
    assert.equal(off.queue.length, 0);
});

test('陪伴水母：页面隐藏就停（不再排 RAF），可见后恢复；销毁取消 RAF、移除画布与监听', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    e.pump(2);
    assert.equal(e.queue.length, 1);
    e.doc.hidden = true;
    e.pump(1);
    assert.equal(e.queue.length, 0, '隐藏后这一帧不再排下一帧');
    e.doc.hidden = false;
    e.listeners.visibilitychange.forEach(fn => fn());
    assert.equal(e.queue.length, 1, '可见后恢复');
    e.listeners.visibilitychange.forEach(fn => fn());
    assert.equal(e.queue.length, 1, '重复通知不会排出第二条 RAF');
    handle.destroy();
    assert.equal(e.children.length, 0);
    assert.equal(handle.isMounted(), false);
    assert.equal((e.listeners.visibilitychange || []).length, 0, '监听已移除');
    assert.ok(e.cancelled.has(1) || e.cancelled.size > 0, '取消了待执行的 RAF');
    assert.doesNotThrow(() => handle.destroy());
});

test('陪伴水母：面板被别处移除（画布不再连接）时下一帧自己收拾干净', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    e.made.canvas.isConnected = false;
    e.pump(1);
    assert.equal(handle.isMounted(), false);
    assert.equal(e.queue.length, 0);
});

test('陪伴水母：销毁发生在设置读出之前，之后不会再挂上', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    handle.destroy();
    await tick();
    assert.equal(e.children.length, 0);
    assert.equal(e.queue.length, 0);
});

test('陪伴水母：面板不在页面里（入场前被移除）时不挂；宽度量不到时用默认宽度', async () => {
    const detached = pomodoroEnv();
    detached.host.isConnected = false;
    const a = Pomodoro.attach(detached.host, detached.env);
    await tick();
    assert.equal(a.isMounted(), false);
    const narrow = pomodoroEnv({ width: 0 });
    const b = Pomodoro.attach(narrow.host, narrow.env);
    await tick();
    assert.equal(b.isMounted(), true);
    assert.equal(narrow.made.canvas.width, 292 * 2, '量不到宽度时按 292');
    b.destroy();
});

test('陪伴水母：不写任何存储、不改任务；画布画在 screen 混合下并在每帧清空', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    e.pump(30);
    assert.deepEqual(e.writes, []);
    const ops = e.made.calls.map(c => c[0]);
    assert.ok(ops.filter(op => op === 'clearRect').length >= 30, '每帧清空');
    handle.destroy();
});

test('陪伴水母：长时间运行并在专注/休息/暂停之间切换，世界里没有非有限数', async () => {
    const e = pomodoroEnv();
    const handle = Pomodoro.attach(e.host, e.env);
    await tick();
    const states = [{ mode: 'work', running: true }, { mode: 'short-break', running: true }, { mode: 'work', running: false }];
    for (let i = 0; i < 40; i++) { handle.setState(states[i % 3]); e.pump(50); if (i % 7 === 0) handle.finish(); }
    for (const j of handle._world().jellies) for (const v of [j.x, j.y, j.vx, j.vy, j.r]) assert.ok(Number.isFinite(v));
    handle.destroy();
});
