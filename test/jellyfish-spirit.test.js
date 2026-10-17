// 水母起舞的“精神状态”：嗨 / 律动 / 爱表演 / 悠闲 / 犯困。
// 同一首歌里每只水母的收缩快慢、摇摆幅度、扭步、光晕与明暗都不同；全部是纯视觉，只读“是否在播放”。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jellyfish-core.js');
const Skin = require('../js/jellyfish.js');

const P = Core.PARAMS;
const IDS = ['hype', 'groove', 'showy', 'chill', 'sleepy'];
const NEUTRAL = { sway: 1, rate: 3.1, thrust: 1, shimmy: 0, glow: 1, bump: 1, alpha: 1 };
/** 每个表现参数在“中性值 + 五种精神状态”里的取值范围：逐帧变化按它归一，才能公平比较量纲不同的参数。 */
const RANGE = Object.fromEntries(Object.keys(NEUTRAL).map(key => {
    const values = [NEUTRAL[key], ...P.SPIRITS.map(s => s[key])];
    return [key, Math.max(...values) - Math.min(...values)];
}));

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
    const w = Core.createWorld({ width: 1440, height: 900, random: seeded(options.seed || 9), ...options });
    Core.reconcile(w, count, { instant: true });
    return w;
}

const dancing = (w, dance = 1) => { w.mood.dance = dance; w.moodTarget.dance = dance; return w; };

/** 锁定某种精神状态、起舞 seconds 秒：返回收缩次数、航向总变化量、水平/垂直走过的范围。 */
function perform(id, seconds, seed = 9) {
    const w = dancing(world(1, { seed, spirit: id }));
    const j = w.jellies[0];
    let pulses = 0, last = j.pulseT, total = 0, previous = j.heading;
    let xmin = Infinity, xmax = -Infinity;
    for (let i = 0; i < seconds * 62.5; i++) {
        Core.step(w, 16, { beat: null });
        if (j.pulseT < last) pulses++;
        last = j.pulseT;
        total += Math.abs(j.heading - previous); previous = j.heading;
        if (i > 600) { xmin = Math.min(xmin, j.x); xmax = Math.max(xmax, j.x); }
    }
    return { pulses, total, xspan: xmax - xmin, w, j };
}

// ---------- 表 ----------

test('精神状态表：五种、id 各不相同、全部冻结、参数有限且在合理范围', () => {
    assert.deepEqual(P.SPIRITS.map(s => s.id), IDS);
    assert.ok(Object.isFrozen(P.SPIRITS));
    for (const s of P.SPIRITS) {
        assert.ok(Object.isFrozen(s), s.id);
        assert.ok(Number.isInteger(s.every) && s.every >= 1 && s.every <= 4, `${s.id} every`);
        for (const key of ['sway', 'rate', 'thrust', 'glow', 'bump', 'alpha']) assert.ok(Number.isFinite(s[key]) && s[key] > 0, `${s.id}.${key}`);
        assert.ok(s.shimmy >= 0 && Number.isFinite(s.shimmy));
        assert.ok(s.alpha <= 1, `${s.id} 不会比平常更亮到溢出`);
    }
    const by = Object.fromEntries(P.SPIRITS.map(s => [s.id, s]));
    assert.ok(by.hype.every < by.groove.every && by.groove.every < by.chill.every && by.chill.every < by.sleepy.every, '越嗨越密、越困越疏');
    assert.ok(by.groove.sway > by.hype.sway && by.hype.sway > by.chill.sway && by.chill.sway > by.sleepy.sway, '律动摆得最大、犯困几乎不摆');
    assert.ok(by.sleepy.alpha < by.chill.alpha && by.chill.alpha <= 1);
    assert.ok(by.showy.shimmy > 0 && IDS.filter(id => id !== 'showy').every(id => by[id].shimmy === 0), '只有爱表演会扭步');
    assert.ok(by.hype.glow > 1 && by.sleepy.glow < 1);
});

// ---------- 分配与轮换 ----------

test('同屏五只水母五种精神状态各不相同，换随机种子也一样', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const w = world(5, { seed });
        const ids = w.jellies.map(j => Core.spiritOf(w, j).id);
        assert.equal(new Set(ids).size, 5, `seed ${seed}：${ids}`);
    }
});

test('只有一两只时也各有各的；不同种子的起点位会变（不是永远从“嗨”开始）', () => {
    const first = new Set();
    for (let seed = 1; seed <= 24; seed++) first.add(Core.spiritOf(world(1, { seed }), world(1, { seed }).jellies[0]).id);
    assert.ok(first.size >= 3, `第一只的精神状态有 ${first.size} 种`);
    const w = world(2, { seed: 4 });
    assert.notEqual(Core.spiritOf(w, w.jellies[0]).id, Core.spiritOf(w, w.jellies[1]).id);
    // 相邻出生的两只在表里隔两位（环形）：不是“嗨 + 律动”这样相近的两档
    for (const seed of [1, 2, 3, 4, 5]) {
        const two = world(2, { seed });
        const [a, b] = two.jellies.map(j => IDS.indexOf(Core.spiritOf(two, j).id));
        assert.ok([2, 3].includes(((b - a) % 5 + 5) % 5), `seed ${seed}：${a} → ${b}`);
    }
});

test('固定精神状态：spirit 选项锁定所有水母；写错的名字不生效（仍按序号轮换）', () => {
    const locked = world(3, { spirit: 'sleepy' });
    assert.ok(locked.jellies.every(j => Core.spiritOf(locked, j).id === 'sleepy'));
    assert.equal(locked.spiritLock, 'sleepy');
    for (const bad of ['dancer', '', 5, {}, undefined]) {
        const w = world(5, { spirit: bad });
        assert.equal(w.spiritLock, null, String(bad));
        assert.equal(new Set(w.jellies.map(j => Core.spiritOf(w, j).id)).size, 5);
    }
});

test('起舞累计每 SPIRIT_S 秒整体轮换一位：每只都换成另一种、同屏仍各不相同；不起舞时不计时也不轮换', () => {
    const w = dancing(world(5, { seed: 3 }));
    const snapshot = () => w.jellies.map(j => Core.spiritOf(w, j).id);
    const before = snapshot();
    for (let i = 0; i < (P.SPIRIT_S - 1) * 62.5; i++) Core.step(w, 16, { beat: null });
    assert.deepEqual(snapshot(), before, '还没到轮换时间');
    for (let i = 0; i < 2 * 62.5; i++) Core.step(w, 16, { beat: null });
    const after = snapshot();
    assert.equal(new Set(after).size, 5, '轮换后仍各不相同');
    after.forEach((id, i) => assert.notEqual(id, before[i], `第 ${i} 只换了一种`));

    const quiet = world(5, { seed: 3 });
    const was = quiet.jellies.map(j => Core.spiritOf(quiet, j).id);
    for (let i = 0; i < 90 * 62.5; i++) Core.step(quiet, 16, { beat: Math.floor(i / 62.5) });
    assert.equal(quiet.danceTime, 0, '不起舞时不累计');
    assert.deepEqual(quiet.jellies.map(j => Core.spiritOf(quiet, j).id), was);
    const half = dancing(world(1), P.DANCE_THRESHOLD);
    for (let i = 0; i < 40 * 62.5; i++) Core.step(half, 16, {});
    assert.equal(half.danceTime, 0, '起舞程度没超过阈值也不计');
});

test('出生不额外消耗随机数：锁定与否，同一种子生出来的水母完全一样（颜色、位置、外观）', () => {
    const a = world(5, { seed: 11 });
    const b = world(5, { seed: 11, spirit: 'chill' });
    const core = w => w.jellies.map(j => [j.x, j.y, j.color, j.seed, j.r, JSON.stringify(j.look)]);
    assert.deepEqual(core(a), core(b));
});

// ---------- 表现 ----------

test('收缩快慢：嗨与爱表演每个舞步格一次，律动隔格，悠闲隔两格，犯困隔三格', () => {
    const seconds = 42;
    for (const s of P.SPIRITS) {
        const expected = seconds / (P.DANCE_GRID_S * s.every);
        const { pulses } = perform(s.id, seconds);
        assert.ok(Math.abs(pulses - expected) <= 1.5, `${s.id}：${seconds} 秒应约 ${expected.toFixed(1)} 次，实际 ${pulses}`);
    }
    const counts = Object.fromEntries(IDS.map(id => [id, perform(id, seconds).pulses]));
    assert.ok(counts.hype > counts.groove && counts.groove > counts.chill && counts.chill > counts.sleepy, JSON.stringify(counts));
});

test('同一个舞步格上不同精神状态“踩在同一个拍子里”：每次收缩都落在格子边界上', () => {
    const w = dancing(world(5, { seed: 6 }));
    const lastPulse = new Map(w.jellies.map(j => [j, j.pulseT]));
    for (let i = 0; i < 40 * 62.5; i++) {
        Core.step(w, 16, { beat: null });
        for (const j of w.jellies) {
            if (j.pulseT < lastPulse.get(j)) {
                const into = w.danceTime % P.DANCE_GRID_S;
                assert.ok(into < 0.03 || P.DANCE_GRID_S - into < 0.03, `收缩发生在格内 ${into.toFixed(3)} 秒处`);
            }
            lastPulse.set(j, j.pulseT);
        }
    }
});

test('摇摆：律动摆得最大、犯困几乎不摆；嗨比悠闲更快（相同时间内航向变化更多）', () => {
    const tv = Object.fromEntries(IDS.map(id => [id, perform(id, 40).total]));
    assert.ok(tv.sleepy < tv.chill && tv.chill < tv.hype, JSON.stringify(tv));
    assert.ok(tv.sleepy < tv.hype / 2.5, `犯困 ${tv.sleepy.toFixed(1)} 远小于嗨 ${tv.hype.toFixed(1)}`);
    assert.ok(tv.groove > tv.chill * 2, `律动 ${tv.groove.toFixed(1)} 对悠闲 ${tv.chill.toFixed(1)}`);
});

test('走动范围：嗨与爱表演四处游，犯困原地附近', () => {
    const span = Object.fromEntries(IDS.map(id => [id, perform(id, 60).xspan]));
    assert.ok(span.sleepy < span.hype * 0.6, JSON.stringify(span));
    assert.ok(span.showy > span.sleepy * 1.5);
});

test('爱表演：每次收缩向左右交替扭一步；其余精神状态没有横向扭步', () => {
    const kicks = id => {
        const w = dancing(world(1, { seed: 14, spirit: id }));
        const j = w.jellies[0];
        const list = [];
        let last = j.pulseT;
        for (let i = 0; i < 20 * 62.5; i++) {
            j.heading = 0; j.vx = 0;              // 航向为 0：收缩本身没有横向分量，横向速度只能来自扭步
            Core.step(w, 16, { beat: null });
            if (j.pulseT < last) list.push(j.vx);
            last = j.pulseT;
        }
        return list;
    };
    const showy = kicks('showy');
    assert.ok(showy.length >= 10, `扭了 ${showy.length} 步`);
    // 缓动：刚开始 shimmy 还没到位，取后半段
    const tail = showy.slice(Math.floor(showy.length / 2));
    for (let i = 1; i < tail.length; i++) assert.ok(Math.sign(tail[i]) !== Math.sign(tail[i - 1]) && tail[i] !== 0, `第 ${i} 步与上一步方向相反`);
    assert.ok(Math.abs(tail[0]) > 20, `扭步速度 ${tail[0]}`);
    for (const id of IDS.filter(id => id !== 'showy')) assert.ok(kicks(id).every(v => Math.abs(v) < 1e-6), `${id} 没有扭步`);
});

test('精神状态是渐变的：切换时参数逐帧缓动、不突变；不起舞后回到中性值', () => {
    const w = world(1, { spirit: 'sleepy' });
    const j = w.jellies[0];
    assert.deepEqual({ ...j.dz }, NEUTRAL, '出生时是中性值');
    dancing(w);
    let previous = { ...j.dz }, biggest = 0;
    for (let i = 0; i < 6 * 62.5; i++) {
        Core.step(w, 16, { beat: null });
        for (const key of Object.keys(previous)) biggest = Math.max(biggest, Math.abs(j.dz[key] - previous[key]) / RANGE[key]);
        previous = { ...j.dz };
    }
    assert.ok(biggest < 0.03, `每帧最大变化 ${biggest}`);
    assert.ok(Math.abs(j.dz.thrust - 0.6) < 0.02 && Math.abs(j.dz.sway - 0.2) < 0.02, '6 秒后基本到位');
    dancing(w, 0);
    for (let i = 0; i < 8 * 62.5; i++) Core.step(w, 16, { beat: null });
    for (const [key, value] of Object.entries(NEUTRAL)) assert.ok(Math.abs(j.dz[key] - value) < 0.02, `${key} 回到 ${value}`);
});

test('轮换瞬间也是渐变：越过 SPIRIT_S 时每只水母的参数没有跳变', () => {
    const w = dancing(world(5, { seed: 3 }));
    let previous = w.jellies.map(j => ({ ...j.dz }));
    let biggest = 0;
    for (let i = 0; i < (P.SPIRIT_S + 6) * 62.5; i++) {
        Core.step(w, 16, { beat: null });
        w.jellies.forEach((j, n) => {
            for (const key of Object.keys(j.dz)) biggest = Math.max(biggest, Math.abs(j.dz[key] - previous[n][key]) / RANGE[key]);
            previous[n] = { ...j.dz };
        });
    }
    assert.ok(biggest < 0.03, `每帧最大变化 ${biggest}`);
});

test('起舞时也停在各自漫游点附近：收缩更密但纵向推力按间隔折算，不会一路游到屏幕顶端', () => {
    for (const [seed, count] of [[3, 6], [11, 8], [23, 5]]) {
        const w = dancing(world(count, { seed }));
        const ys = [];
        for (let frame = 0; frame < 180 * 62.5; frame++) {
            Core.step(w, 16, { beat: null });
            if (frame % 63 === 0 && frame > 625) for (const j of w.jellies) ys.push(j.y / w.height);
        }
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const top = ys.filter(y => y < 0.2).length / ys.length;
        assert.ok(top < 0.1, `seed ${seed}：顶部 20% 以内占 ${(top * 100).toFixed(0)}%`);
        assert.ok(mean > 0.35 && mean < 0.7, `seed ${seed}：平均高度 ${mean.toFixed(2)}`);
        for (const j of w.jellies) assert.ok(Number.isFinite(j.x + j.y + j.vx + j.vy + j.heading));
    }
});

test('锁定“嗨”时：安静（不起舞）的行为与没有锁定完全相同', () => {
    const play = spirit => {
        const w = world(4, { seed: 8, spirit });
        for (let i = 0; i < 20 * 62.5; i++) Core.step(w, 16, { beat: Math.floor(i / 62.5) });
        return JSON.stringify(w.jellies.map(j => [j.x, j.y, j.heading]));
    };
    assert.equal(play('hype'), play(null));
});

// ---------- 皮肤 ----------

function recorder() {
    const gradients = [];
    return new Proxy({}, {
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

function halo(dz, { dance = 1, pulseT = 0.2 } = {}) {
    const w = world(1, { seed: 13 });
    const j = w.jellies[0];
    j.alpha = 1; j.state = 'alive'; j.pulseT = pulseT;
    Object.assign(j.dz, dz);
    w.mood.dance = dance;
    const ctx = recorder();
    Skin.draw(ctx, w, Skin.PALETTE, 0.65, { labels: false, night: 0 });
    const radial = ctx._gradients.filter(g => g.key === 'createRadialGradient');
    const biggest = radial.reduce((a, b) => (b.args[5] > a.args[5] ? b : a));
    return { radius: biggest.args[5], alpha: Number(/,([\d.]+)\)$/.exec(biggest.stops[0].color)[1]) };
}

test('光晕：嗨的光晕随收缩鼓得更大更亮，犯困的更小更暗；不起舞时精神状态不起作用', () => {
    const by = Object.fromEntries(P.SPIRITS.map(s => [s.id, s]));
    const hype = halo(by.hype), sleepy = halo(by.sleepy), plain = halo({});
    assert.ok(hype.radius > plain.radius && plain.radius > sleepy.radius, `${hype.radius} > ${plain.radius} > ${sleepy.radius}`);
    assert.ok(hype.alpha > plain.alpha && plain.alpha > sleepy.alpha, `${hype.alpha} > ${plain.alpha} > ${sleepy.alpha}`);
    const quietHype = halo(by.hype, { dance: 0 }), quietSleepy = halo(by.sleepy, { dance: 0 });
    assert.equal(quietHype.radius, quietSleepy.radius);
    assert.ok(Math.abs(quietHype.alpha - quietSleepy.alpha) < 1e-9, '没有起舞时各状态一样');
});

test('明暗：犯困的整体更暗，且只在起舞时；没有 dz 的旧水母照常绘制', () => {
    const dim = halo({ alpha: 0.78 }), plain = halo({});
    assert.ok(dim.alpha < plain.alpha * 0.85, `${dim.alpha} 对 ${plain.alpha}`);
    assert.equal(dim.radius, plain.radius, '只改明暗不改大小');
    assert.ok(Math.abs(halo({ alpha: 0.78 }, { dance: 0 }).alpha - halo({}, { dance: 0 }).alpha) < 1e-9);
    const w = world(2);
    for (const j of w.jellies) delete j.dz;
    assert.doesNotThrow(() => Skin.draw(recorder(), w, Skin.PALETTE, 0.65, { labels: false, night: 0 }));
    const broken = world(1);
    broken.jellies[0].dz = { glow: NaN, bump: 'x', alpha: Infinity };
    assert.doesNotThrow(() => Skin.draw(recorder(), broken, Skin.PALETTE, 0.65, { labels: false, night: 0 }));
});

// ---------- 参数真的按精神状态落到物理上 ----------

test('收缩力度：横向冲量与精神状态的 thrust 成正比（嗨约为犯困的两倍），都到位后再测', () => {
    const impulse = id => {
        const w = dancing(world(1, { seed: 9, spirit: id }));
        const j = w.jellies[0];
        for (let i = 0; i < 10 * 62.5; i++) Core.step(w, 16, { beat: null });   // 参数缓动到位
        for (let i = 0; i < 600; i++) {
            j.heading = Math.PI / 4; j.vx = 0; j.vy = 0; j.home = { x: j.x, y: j.y }; j.homeAt = 1e9;
            const before = j.pulseT;
            Core.step(w, 16, { beat: null });
            if (j.pulseT < before) return j.vx;
        }
        return NaN;
    };
    const hype = impulse('hype'), sleepy = impulse('sleepy');
    const want = P.SPIRITS[0].thrust / P.SPIRITS[4].thrust;
    assert.ok(Math.abs(hype / sleepy / want - 1) < 0.15, `嗨 ${hype.toFixed(1)} 对 犯困 ${sleepy.toFixed(1)}，应约 ${want.toFixed(2)} 倍`);
});

test('摇摆快慢：相位推进速度等于精神状态的 rate；幅度只随 sway，不随快慢变化', () => {
    for (const s of P.SPIRITS) {
        const w = dancing(world(1, { seed: 9, spirit: s.id }));
        const j = w.jellies[0];
        for (let i = 0; i < 12 * 62.5; i++) Core.step(w, 16, { beat: null });
        const start = j.swayPhase;
        for (let i = 0; i < 10 * 62.5; i++) Core.step(w, 16, { beat: null });
        assert.ok(Math.abs((j.swayPhase - start) / 10 / s.rate - 1) < 0.03, `${s.id}：相位每秒推进 ${((j.swayPhase - start) / 10).toFixed(2)}，应为 ${s.rate}`);
    }
    // 单帧里“起舞”比“不起舞”多出来的航向变化，就是摇摆项：增量 ∝ sway·rate/3.1，对时间积分后的摆幅 = DANCE_SWAY·sway/3.1，只随 sway
    const sway = (rate, swayAmp) => {
        const make = () => {
            const w = world(1, { seed: 9 });
            for (let i = 0; i < 100; i++) Core.step(w, 16, { beat: null });
            return w;
        };
        const a = make(), b = make();
        for (const [w, d] of [[a, 1], [b, 0]]) {
            const j = w.jellies[0];
            Object.assign(j.dz, { rate, sway: swayAmp });
            j.swayPhase = Math.PI / 2 - j.seed * 2 * Math.PI - rate * 0.016;     // 下一帧 sin = 1
            w.mood.dance = d; w.moodTarget.dance = d;
        }
        Core.step(a, 16, { beat: null }); Core.step(b, 16, { beat: null });
        return a.jellies[0].heading - b.jellies[0].heading;
    };
    const base = sway(3.1, 1);
    assert.ok(base > 0.003, `基准摇摆增量 ${base}`);
    assert.ok(Math.abs(sway(6.2, 1) / base - 2) < 0.2, '快慢翻倍 → 单帧增量翻倍（对时间积分后的摆幅不变）');
    assert.ok(Math.abs(sway(3.1, 0.5) / base - 0.5) < 0.1, '幅度减半 → 增量减半');
});

test('光晕亮度：dz.glow 单独起作用（只在起舞时，随起舞程度渐入）', () => {
    const plain = halo({ glow: 1 }), bright = halo({ glow: 1.35 }), dark = halo({ glow: 0.7 });
    assert.ok(Math.abs(bright.alpha / plain.alpha - 1.35) < 0.02, `${bright.alpha / plain.alpha}`);
    assert.ok(Math.abs(dark.alpha / plain.alpha - 0.7) < 0.02);
    assert.equal(bright.radius, plain.radius, 'glow 只管亮度');
    assert.ok(Math.abs(halo({ glow: 1.35 }, { dance: 0 }).alpha - halo({ glow: 1 }, { dance: 0 }).alpha) < 1e-9);
    const half = halo({ glow: 1.35 }, { dance: 0.5 });
    assert.ok(half.alpha > halo({ glow: 1 }, { dance: 0.5 }).alpha && half.alpha < halo({ glow: 1.35 }, { dance: 1 }).alpha);
});

test('起舞时水母不会跑出屏幕：扭步与摇摆的横向速度大，软边界回推要挡得住（原 0.9 的回推下约 1% 的时间中心在屏幕外、最多 140 px）', () => {
    for (const [W, H, seed] of [[1280, 720, 1], [1512, 860, 2], [1280, 720, 3]]) {
        const w = dancing(Core.createWorld({ width: W, height: H, random: seeded(seed) }));
        Core.reconcile(w, 6, { instant: true });
        let n = 0, outside = 0, worst = 0;
        for (let frame = 0; frame < 200 * 62.5; frame++) {
            Core.step(w, 16, { beat: null });
            if (frame % 31 === 0 && frame > 625) {
                for (const j of w.jellies) {
                    n++;
                    const out = Math.max(0, -j.x, j.x - W, -j.y, j.y - H);
                    if (out > 0) outside++;
                    worst = Math.max(worst, out);
                }
            }
        }
        assert.ok(outside / n < 0.003, `${W}×${H} seed ${seed}：中心在屏幕外占 ${(outside / n * 100).toFixed(2)}%`);
        assert.ok(worst < 40, `${W}×${H} seed ${seed}：最远超出 ${worst.toFixed(0)} px`);
    }
});
