// 喂食之后成群小鱼会不会“散开不回来”——无头确定性模拟守卫（docs/technical/aquarium-20261017.md §6.3）。
//
// 为什么用统计而不是浏览器里的单次读数：真实 Chromium 里有水母，水母的躲避本来就会把鱼群拆开，单次读数的
// 0.5–1.5 倍区间连改动之前的代码也会超出，所以通过线只能看固定种子的大样本。这里直接驱动 aquarium-core 与
// aquarium-play-core（固定步长、没有水母与指针、不碰 DOM），结果逐位可重复。
//
// 口径：
//   散开程度 = 同一条目内、≥4 条的鱼组里，鱼与鱼两两距离的平均（所有组的所有鱼对一起平均）；
//   比值     = 喂食后最后 3 秒的散开程度 ÷ 喂食前 0.45 秒的基线；
//   通过线   = 喂食组的中位数在 0.8–1.25，且超出 0.5–1.5 的比例，比不喂食的对照组多不超过 10 个百分点。
// 10 个百分点是判断值，不是由数据推出来的；校准时（400 个种子）的实测是中位数 1.01、多 5.8 个百分点。
// 已知并接受：约 6% 的喂食会让同组的鱼追不同的饲料后分成两拨，十几秒内没有聚拢（核心鱼群模型本来的特性被吸引点触发）。
//
// 这条线是一把粗尺子：反向对照里“饲料吃不掉、不下沉、600 秒才过期”只超出线 1.8 个百分点（11.8% 对 10%），
// 而“吸引范围与力度过大”（2.0%）、“吃到的距离过大”（0%）都抓不到（一次性的 /tmp 实验，数字在技术文档 §6.3）。
// 所以它只管“之后是否聚拢”，不要当作喂食行为的总体守卫。反向对照的测试若哪天变红（反向对照居然通过了线），
// 先判断是这条线失去了灵敏度，还是核心鱼群变了，再决定改哪边；不要为了让测试变绿而不加判断地收紧或放宽线。
//
// 加大样本：AQ_SCHOOL_SEEDS=2000 node --test test/aquarium-school-regroup.test.js（默认与下限都是 400 个，约 15–20 秒）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/aquarium-core.js');
const Play = require('../js/aquarium-play-core.js');

const SEEDS = (() => {
    const raw = process.env.AQ_SCHOOL_SEEDS;
    if (raw === undefined || raw === '') return 400;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 400 || n > 5000) throw new Error(`AQ_SCHOOL_SEEDS 必须是 400–5000 的整数（线是在 400 个种子上校准的，再少功效不够），收到 ${raw}`);
    return n;
})();
const MUTANT_SEEDS = 400;

const GATE = Object.freeze({ MEDIAN: Object.freeze([0.8, 1.25]), BAND: Object.freeze([0.5, 1.5]), MAX_EXTRA_PP: 10 });

// 布置与计时同真实 Chromium 里的整缸喂食实测（1440×900，12 个条目，两个成群条目各 5 条）。
const DT = 1000 / 60;                       // 毫秒，固定步长
const WARM_S = 3.0;                         // 先游 3 秒再开始记录
const FEED_AT_S = WARM_S + 0.45;            // 基线窗口是 [WARM_S, FEED_AT_S)，之后第一次喂食
const SECOND_FEED_S = FEED_AT_S + 1.1;      // 1.1 秒后第二次（冷却已过）
const END_S = WARM_S + 17.0;                // 记录到 20 秒，最后 3 秒是比较窗口
const SPECIES = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark', 'clown', 'angel', 'puffer', 'hammer'];
const ENTRIES = SPECIES.map((species, i) => ({ id: `${species}-${i + 1}`, species, addedAt: i + 1 }));

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 同一条目内、≥4 条的鱼组：所有鱼对的平均距离；没有这样的组返回 null。 */
function spreadOf(w) {
    const groups = new Map();
    for (const f of w.fish) {
        if (!groups.has(f.entry)) groups.set(f.entry, []);
        groups.get(f.entry).push(f);
    }
    let sum = 0;
    let n = 0;
    for (const g of groups.values()) {
        if (g.length < 4) continue;
        for (let i = 0; i < g.length; i++) {
            for (let j = i + 1; j < g.length; j++) { sum += Math.hypot(g[i].x - g[j].x, g[i].y - g[j].y); n++; }
        }
    }
    return n ? sum / n : null;
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/** 跑一个种子。feed 为假时是不喂食的对照；P 是玩法核心（默认用真实的，反向对照传改过参数的副本）。 */
function simulate(seed, feed, P = Play) {
    const w = Core.createWorld({ width: 1440, height: 900, random: seeded(seed), lowPower: false });
    Core.reconcile(w, ENTRIES, { instant: true });
    const play = P.create();
    const base = [];
    const last = [];
    const sprinkles = [];
    let t = 0;
    const steps = Math.round(END_S * 1000 / DT);
    for (let i = 0; i < steps; i++) {
        if (feed && sprinkles.length === 0 && t >= FEED_AT_S) sprinkles.push(P.sprinkle(play, w));
        if (feed && sprinkles.length === 1 && t >= SECOND_FEED_S) sprinkles.push(P.sprinkle(play, w));
        Core.step(w, DT, { pointer: null, attractors: feed ? P.attractors(play, w) : undefined });
        if (feed) P.step(play, w, DT);
        t += DT / 1000;
        if ((t >= WARM_S && t < FEED_AT_S) || t >= END_S - 3) {
            const s = spreadOf(w);
            if (s === null) throw new Error(`种子 ${seed}：t=${t.toFixed(2)} 秒时没有 ≥4 条的鱼组，散开程度无定义（布置变了？）`);
            (t < FEED_AT_S ? base : last).push(s);
        }
    }
    assert.ok(base.length > 0 && last.length > 0, '基线或比较窗口里没有采到样');
    const c = P.counts(play);
    return { seed, ratio: mean(last) / mean(base), sprinkles, pelletsAtEnd: c.pellets, fedAtEnd: c.fed };
}

function summarize(ratios) {
    assert.ok(ratios.length > 0, '没有样本');
    for (const r of ratios) assert.ok(Number.isFinite(r), `散开程度比值不是有限数：${r}`);
    const sorted = ratios.slice().sort((a, b) => a - b);
    const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return {
        n: ratios.length,
        median: q(0.5),
        p95: q(0.95),
        max: sorted[sorted.length - 1],
        outOfBand: ratios.filter(v => v < GATE.BAND[0] || v > GATE.BAND[1]).length,
        above2: ratios.filter(v => v > 2).length,
    };
}

/** 通过线。多出的比例用整数交叉相乘比较，刚好 10 个百分点不会被浮点误差判错。 */
function verdict(control, feed) {
    const problems = [];
    if (!(feed.median >= GATE.MEDIAN[0] && feed.median <= GATE.MEDIAN[1])) {
        problems.push(`喂食组中位数 ${feed.median.toFixed(2)} 不在 ${GATE.MEDIAN[0]}–${GATE.MEDIAN[1]}`);
    }
    const extraPp = 100 * (feed.outOfBand / feed.n - control.outOfBand / control.n);
    const within = (feed.outOfBand * control.n - control.outOfBand * feed.n) * 100 <= GATE.MAX_EXTRA_PP * feed.n * control.n;
    if (!within) problems.push(`喂食组超出 ${GATE.BAND[0]}–${GATE.BAND[1]} 的比例比对照多 ${extraPp.toFixed(1)} 个百分点，超过 ${GATE.MAX_EXTRA_PP}`);
    return { ok: problems.length === 0, problems, extraPp };
}

/** 在内存里改玩法核心源码里的几个 PARAMS 数字再加载（不写盘、不动真实模块），用来做反向对照。 */
function loadPlayCoreWith(overrides) {
    let src = fs.readFileSync(path.join(__dirname, '..', 'js', 'aquarium-play-core.js'), 'utf8');
    for (const [key, value] of Object.entries(overrides)) {
        const re = new RegExp(`(\\b${key}:\\s*)[0-9.]+`, 'g');
        const hits = src.match(re) || [];
        assert.equal(hits.length, 1, `玩法核心源码里应当恰好有一处 ${key}: 数字，找到 ${hits.length} 处`);
        src = src.replace(re, (_, head) => head + value);
    }
    const mod = { exports: {} };
    const load = vm.compileFunction(src, ['module', 'require'], { filename: 'aquarium-play-core.mutated.js' });
    load(mod, id => {
        assert.equal(id, './aquarium-core.js', `反向对照的加载器只认核心模块，收到 ${id}`);
        return Core;
    });
    return mod.exports;
}

const summaryLine = (label, s) => `${label}：${s.n} 个种子，中位数 ${s.median.toFixed(2)}，p95 ${s.p95.toFixed(2)}，最大 ${s.max.toFixed(2)}，超出 ${GATE.BAND[0]}–${GATE.BAND[1]} 的 ${s.outOfBand} 个（${(100 * s.outOfBand / s.n).toFixed(1)}%），其中超过 2 倍的 ${s.above2} 个`;
const seedsFrom = (n, feed, P) => Array.from({ length: n }, (_, i) => simulate(i + 1, feed, P));

// 对照组与喂食组整个文件各算一次，几个测试共用。
let cache = null;
function runs() {
    if (!cache) {
        const control = seedsFrom(SEEDS, false);
        const feed = seedsFrom(SEEDS, true);
        cache = { control, feed, controlSummary: summarize(control.map(r => r.ratio)), feedSummary: summarize(feed.map(r => r.ratio)) };
    }
    return cache;
}

// ---------- 通过线本身（合成数据，快） ----------

const synthetic = (n, outOfBand, inside = 1.0, outside = 2.0) => summarize([...Array(n - outOfBand).fill(inside), ...Array(outOfBand).fill(outside)]);

test('通过线：中位数与超出比例都在线内就通过（校准时的实测：中位数 1.01、多 5.8 个百分点）', () => {
    const v = verdict(synthetic(400, 0), synthetic(400, 23));
    assert.equal(v.ok, true, v.problems.join('；'));
    assert.ok(Math.abs(v.extraPp - 5.75) < 1e-9);
});

test('通过线：喂食组中位数高于 1.25 或低于 0.8 都不通过，边界上的通过', () => {
    const control = synthetic(400, 0);
    for (const m of [1.3, 0.75]) {
        const v = verdict(control, summarize(Array(400).fill(m)));
        assert.equal(v.ok, false);
        assert.ok(v.problems.some(p => p.includes('中位数')), v.problems.join('；'));
    }
    for (const m of [1.25, 0.8]) assert.equal(verdict(control, summarize(Array(400).fill(m))).ok, true, `中位数 ${m} 在线上，应当通过`);
});

test('通过线：比对照多 10 个百分点刚好通过，再多一个种子就不通过（对照组自己超出的部分不计）', () => {
    assert.equal(verdict(synthetic(400, 0), synthetic(400, 40)).ok, true);
    const over = verdict(synthetic(400, 0), synthetic(400, 41));
    assert.equal(over.ok, false);
    assert.ok(over.problems.some(p => p.includes('百分点')), over.problems.join('；'));
    assert.equal(verdict(synthetic(400, 20), synthetic(400, 60)).ok, true, '对照组 5%、喂食组 15%，只多 10 个百分点');
    assert.equal(verdict(synthetic(400, 20), synthetic(400, 61)).ok, false);
});

test('通过线：低于 0.5 与高于 1.5 一样算超出，样本数不同也按比例比较', () => {
    const lowSide = summarize([...Array(350).fill(1.0), ...Array(50).fill(0.4)]);
    assert.equal(lowSide.outOfBand, 50);
    assert.equal(verdict(synthetic(400, 0), lowSide).ok, false);
    assert.equal(verdict(synthetic(400, 0), synthetic(100, 10)).ok, true, '10/100 = 10%，刚好在线上');
    assert.equal(verdict(synthetic(400, 0), synthetic(100, 11)).ok, false);
});

test('统计：没有样本或有非有限的比值直接报错，不会悄悄通过', () => {
    assert.throws(() => summarize([]), /没有样本/);
    assert.throws(() => summarize([1, NaN]), /不是有限数/);
    assert.throws(() => summarize([1, Infinity]), /不是有限数/);
});

test('反向对照的加载器：改的数字必须在源码里恰好有一处，改完之后真的生效，真实模块不受影响', () => {
    const mutant = loadPlayCoreWith({ PELLET_SINK: 0, EAT_R_PAD: 0 });
    assert.equal(mutant.PARAMS.PELLET_SINK, 0);
    assert.equal(mutant.PARAMS.EAT_R_PAD, 0);
    assert.equal(mutant.PARAMS.PELLET_LIFE_S, Play.PARAMS.PELLET_LIFE_S, '没有点名的参数保持原值');
    assert.notEqual(Play.PARAMS.PELLET_SINK, 0, '真实模块的参数不能被反向对照改掉');
    assert.throws(() => loadPlayCoreWith({ NO_SUCH_PARAM: 1 }), /恰好有一处 NO_SUCH_PARAM/);
});

// ---------- 模拟本身 ----------

test('模拟可重复：同一个种子跑两次逐位相同，喂食与不喂食的结果不同', () => {
    const a = simulate(9, true);
    const b = simulate(9, true);
    assert.equal(a.ratio, b.ratio);
    assert.equal(a.fedAtEnd, b.fedAtEnd);
    assert.notEqual(simulate(9, false).ratio, a.ratio, '不喂食与喂食的鱼群轨迹应当不同，否则喂食根本没有作用到鱼');
});

// ---------- 真实模拟的通过线 ----------

test(`喂食之后成群小鱼的回聚（${SEEDS} 个种子）：中位数在 ${GATE.MEDIAN[0]}–${GATE.MEDIAN[1]}，超出比例比对照多不超过 ${GATE.MAX_EXTRA_PP} 个百分点`, t => {
    const { control, feed, controlSummary, feedSummary } = runs();
    // 先确认喂食真的发生了，否则喂食组等于对照组，通过线会空转。
    for (const r of feed) {
        assert.equal(r.sprinkles.length, 2, `种子 ${r.seed}：应当撒了两次`);
        for (const s of r.sprinkles) assert.deepEqual(s, { ok: true, count: Play.PARAMS.SPRINKLE_COUNT }, `种子 ${r.seed}：撒饲料被拒绝`);
        assert.equal(r.pelletsAtEnd, 0, `种子 ${r.seed}：记录结束时饲料应当已吃完或过期（改了饲料寿命要重新核对计时）`);
        assert.ok(r.fedAtEnd >= 1, `种子 ${r.seed}：没有任何一条鱼吃到饲料`);
    }
    for (const r of control) assert.equal(r.sprinkles.length, 0);
    t.diagnostic(summaryLine('不喂食（对照）', controlSummary));
    t.diagnostic(summaryLine('喂食', feedSummary));
    const v = verdict(controlSummary, feedSummary);
    t.diagnostic(`喂食组比对照多 ${v.extraPp.toFixed(1)} 个百分点`);
    assert.equal(v.ok, true, v.problems.join('；'));
});

test(`通过线抓得到回聚失败的一种（反向对照，${MUTANT_SEEDS} 个种子）：饲料吃不掉、不下沉、600 秒才过期时必须不通过`, t => {
    const mutantPlay = loadPlayCoreWith({ PELLET_SINK: 0, PELLET_LIFE_S: 600, EAT_R_LEN: 0, EAT_R_PAD: 0 });
    const { control } = runs();
    const mutant = seedsFrom(MUTANT_SEEDS, true, mutantPlay);
    for (const r of mutant) {
        assert.equal(r.pelletsAtEnd, 2 * Play.PARAMS.SPRINKLE_COUNT, `种子 ${r.seed}：两次撒下的饲料应当一粒都没少（反向对照的改动没有生效？）`);
        assert.equal(r.fedAtEnd, 0, `种子 ${r.seed}：吃到的距离为 0，不应当有鱼吃到饲料`);
    }
    const mutantSummary = summarize(mutant.map(r => r.ratio));
    const controlSame = summarize(control.slice(0, MUTANT_SEEDS).map(r => r.ratio));
    t.diagnostic(summaryLine('反向对照（饲料吃不掉）', mutantSummary));
    const v = verdict(controlSame, mutantSummary);
    t.diagnostic(`反向对照比对照多 ${v.extraPp.toFixed(1)} 个百分点：${v.problems.join('；') || '通过了（线失去了灵敏度？）'}`);
    assert.equal(v.ok, false, '饲料永远吃不掉的版本通过了通过线：先判断是线失去了灵敏度，还是核心鱼群变了（见文件头注释）');
});
