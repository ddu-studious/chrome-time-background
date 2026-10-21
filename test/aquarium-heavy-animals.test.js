// 水族馆的大个子（2026-10-19）：体长按真实比例、笨重动物的游动（弧线转弯、侧视的“缩短—换面—伸长”转身）、
// 屏幕顶部与岸线（海水层的岸线输入）、放入时从近的一侧游进来、抓着时是“被拴着的游泳者”而不是纸片。
// 小鱼的轨迹与改动之前逐位一致由 aquarium-core.test.js 的黄金轨迹守住；这里守住大个子的体型表与行为不变量。
// 数字取自这台机器上的种子化模拟（脚本在 /tmp，不入库），阈值留了余量；画面观感靠真实 Chromium 截图判断，不在这里。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');

const P = Core.PARAMS;
const W = 1280;
const H = 720;

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

let seq = 0;
const entry = (species, patch = {}) => Object.assign({ id: `h${++seq}`, species, addedAt: 1000 + seq }, patch);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: W, height: H, random: seeded(), lowPower: false }, extra));
const solo = (species, seed = 1, size = {}) => {
    const w = world(Object.assign({ random: seeded(seed) }, size));
    Core.reconcile(w, [entry(species)], { instant: true });
    return { w, f: w.fish[0], spec: Core.speciesById(species) };
};
const SIDE_HEAVY = ['hammer', 'whaleshark'];
const HEAVY = ['hammer', 'manta', 'whaleshark'];
const FRAME_MS = 1000 / 60;

// ---------- 体长表 ----------

test('体长表：大型动物的 len = 真实体长 × PX_PER_M，小鱼保持可看清的体长（不小于按比例的值），鲨鱼之间的比例就是真实比例', () => {
    assert.equal(Core.PX_PER_M, 56);
    for (const s of Core.SPECIES) {
        assert.ok(Number.isFinite(s.meters) && s.meters > 0, `${s.id} 要有真实体长`);
        assert.ok(s.len >= Math.round(s.meters * Core.PX_PER_M) - 1, `${s.id}：len ${s.len} 不应小于按比例的 ${(s.meters * Core.PX_PER_M).toFixed(1)}`);
    }
    for (const id of ['hammer', 'turtle', 'manta', 'whaleshark']) {
        const s = Core.speciesById(id);
        assert.ok(Math.abs(s.len - s.meters * Core.PX_PER_M) <= 1, `${id} 按真实比例：${s.len} ≈ ${(s.meters * Core.PX_PER_M).toFixed(1)}`);
    }
    const [hammer, manta, whale, turtle] = ['hammer', 'manta', 'whaleshark', 'turtle'].map(Core.speciesById);
    assert.ok(Math.abs(whale.len / hammer.len - whale.meters / hammer.meters) < 0.02, '鲸鲨与锤头鲨的体长比 = 真实体长比');
    assert.ok(whale.len > manta.len && manta.len > hammer.len && hammer.len > turtle.len, '真实体型的大小顺序：鲸鲨 > 蝠鲼 > 锤头鲨 > 海龟');
    assert.ok(whale.len >= 500 && manta.len >= 250 && hammer.len >= 130, '鲨鱼不再是几十 px 的小玩意');
    for (const id of ['neon', 'tang', 'clown', 'puffer', 'angel']) assert.ok(Core.speciesById(id).len < hammer.len, `${id} 比鲨鱼小`);
});

test('体长表：各种常见视口里最长的鲸鲨也不超过屏宽的一半（鱼的 z 最大时体长 = len × 视口缩放）', () => {
    for (const [width, height] of [[800, 600], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
        const w = world({ width, height });
        const longest = Core.speciesById('whaleshark').len * w.scale;
        assert.ok(longest <= width * 0.5, `${width}×${height}：鲸鲨 ${longest.toFixed(0)} px 超过屏宽的一半`);
    }
});

test('笨重系数：小鱼恒为 1；大个子按 AGILE_LEN × 缩放 ÷ 体长缩小、下限 0.25；只有侧视的大个子走转身模型', () => {
    const w = world();
    Core.reconcile(w, ['neon', 'clown', 'turtle', 'hammer', 'manta', 'whaleshark'].map(id => entry(id)), { instant: true });
    let heavy = 0;
    for (const f of w.fish) {
        const spec = Core.speciesById(f.species);
        const agile = Core.agileOf(w, f);
        if (f.len <= P.AGILE_LEN * w.scale) {
            assert.equal(agile, 1, `${f.species} 是小个子：恒为 1`);
            assert.equal(Core.isHeavySide(w, f), false);
        } else {
            heavy++;
            assert.ok(agile < 1 && agile >= 0.25, `${f.species} 笨重系数 ${agile}`);
            assert.equal(agile, Math.max(0.25, P.AGILE_LEN * w.scale / f.len), `${f.species}：系数的公式`);
            assert.equal(Core.isHeavySide(w, f), !spec.top, `${f.species}：只有侧视的才走转身模型`);
        }
    }
    assert.equal(heavy, 3, '锤头鲨、蝠鲼、鲸鲨是笨重的，海龟与小鱼不是');
    const huge = { species: 'whaleshark', len: 10000 };
    assert.equal(Core.agileOf(w, huge), 0.25, '下限 0.25');
});

// ---------- 屏幕顶部与岸线 ----------

test('屏幕顶部：大个子自由游 90 秒（多个种子），身体上缘（鱼心 y − 体长 × half）始终不高于屏幕顶端', () => {
    for (const species of HEAVY) {
        for (const seed of [1, 2, 3, 4]) {
            const { w, f, spec } = solo(species, seed);
            let min = Infinity;
            for (let i = 0; i < 90 * 20; i++) {
                Core.step(w, 50, {});
                min = Math.min(min, f.y - f.len * spec.half);
            }
            assert.ok(min >= -1, `${species} 种子 ${seed}：身体上缘最高到了 ${min.toFixed(1)}（负数 = 探出屏幕顶部）`);
        }
    }
});

test('岸线：input.shore（px，从屏幕顶往下量）写进 world.shoreY（夹在屏高的 50%…100%），非有限或缺失时为 null；seabedOf 随之有值或为 null', () => {
    const { w, spec } = solo('clown');
    assert.equal(w.shoreY, null, '新世界不知道岸线');
    assert.equal(Core.seabedOf(w, spec, 30), null, '没有岸线信息：没有限制');
    Core.step(w, 50, { shore: 560 });
    assert.equal(w.shoreY, 560);
    assert.equal(Core.seabedOf(w, spec, 30), 560 - 30 * spec.half - P.SHORE_GAP * w.scale, '鱼心最大纵坐标 = 岸线 − 半个身高 − 间隙');
    Core.step(w, 50, { shore: 99999 });
    assert.equal(w.shoreY, H, '夹在屏高以内');
    Core.step(w, 50, { shore: -50 });
    assert.equal(w.shoreY, H * 0.5, '至多升到屏高的一半（岸线不会把整个鱼缸吞掉）');
    for (const bad of [NaN, Infinity, 'x', null, undefined]) {
        Core.step(w, 50, { shore: 560 });
        Core.step(w, 50, { shore: bad });
        assert.equal(w.shoreY, null, `坏岸线 ${String(bad)} 当作没有`);
    }
    Core.step(w, 50, {});
    assert.equal(w.shoreY, null, '没给 shore：鱼不避岸线');
    assert.equal(Core.surfaceFloor, undefined, '旧的水面避让已经去掉');
});

test('岸线：第一次知道岸线时各群重新挑家（家不在沙滩上）；稳定后鱼体下缘留在岸线之上（小鱼、大个子都是），岸线在本种活动带下沿以下的动物不受影响', () => {
    const shore = H * 0.8;                                                     // 与真实潮汐最高处（页面高度的 19.85%）同量级
    for (const seed of [4, 5, 6]) {
        const w = world({ random: seeded(seed) });
        Core.reconcile(w, ['neon', 'tang', 'clown', 'angel', 'hammer', 'manta', 'whaleshark', 'turtle'].map(id => entry(id)), { instant: true });
        assert.equal(w.shoreY, null);
        Core.step(w, 50, { shore });
        assert.equal(w.shoreY, shore);
        for (const f of w.fish) {
            const spec = Core.speciesById(f.species);
            const sea = Core.seabedOf(w, spec, spec.len * w.scale);
            const limit = Math.min(sea, spec.band[1] * H);
            assert.ok(w.groups[f.entry].hy <= limit + 1e-9, `${f.species} 种子 ${seed}：家 ${w.groups[f.entry].hy.toFixed(0)} 应当在 ${limit.toFixed(0)} 以上（岸线 ${shore}）`);
        }
        const gaps = new Map();
        for (let i = 0; i < 120 * 20; i++) {
            Core.step(w, 50, { shore });
            if (w.time < 6) continue;
            for (const f of w.fish) {
                const spec = Core.speciesById(f.species);
                gaps.set(f.species, Math.min(gaps.has(f.species) ? gaps.get(f.species) : Infinity, shore - (f.y + f.len * spec.half)));
            }
        }
        assert.equal(gaps.size, 8);
        for (const [species, gap] of gaps) assert.ok(gap >= -1, `${species} 种子 ${seed}：稳定后身体下缘低于岸线 ${(-gap).toFixed(1)} px`);
    }
});

test('岸线：只在岸线高过本种活动带下沿时才改变行为（活动带整体在岸线之上的大个子，有没有岸线轨迹逐位相同）', () => {
    // 锤头鲨、蝠鲼、鲸鲨的带下沿都在屏高的 60–65%，真实岸线最高在 80% 附近：它们从不碰到岸线，行为与没有海水层时完全一样
    for (const species of HEAVY) {
        const trace = shore => {
            const { w, f } = solo(species, 9);
            const out = [];
            for (let i = 0; i < 20 * 20; i++) { Core.step(w, 50, { shore }); if (i % 20 === 19) out.push([f.x, f.y, f.vx, f.vy, f.ang]); }
            return out;
        };
        assert.deepEqual(trace(H * 0.8), trace(null), `${species}：岸线在带下沿以下，轨迹与没有岸线一致`);
    }
});

test('岸线：潮水涨得很快时鱼被平滑地压回水里（每帧位移有上限、最终稳定在岸线之上），不会瞬移', () => {
    // 真实潮汐最快约 4 px/s；这里用 187 px/s 的涨速（1.6 秒涨 300 px），比真实快 50 倍，是对避让逻辑的压力测试
    for (const [species, seed] of [['clown', 3], ['clown', 4], ['whaleshark', 4], ['manta', 4]]) {
        const { w, f, spec } = solo(species, seed);
        for (let i = 0; i < 20; i++) Core.step(w, 50, { shore: 700 });
        let last = { x: f.x, y: f.y };
        let worst = 0;
        for (let i = 0; i < 100; i++) {
            Core.step(w, 16, { shore: 700 - Math.min(i * 6, 300) });         // 岸线在 100 帧里从 700 涨到 400 px
            worst = Math.max(worst, Math.hypot(f.x - last.x, f.y - last.y));
            last = { x: f.x, y: f.y };
            assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
        }
        assert.ok(worst < 40, `${species} 种子 ${seed}：岸线涨起来时单帧最大位移 ${worst.toFixed(1)} px`);
        for (let i = 0; i < 400; i++) Core.step(w, 16, { shore: 400 });
        assert.ok(400 - (f.y + f.len * spec.half) >= -1, `${species} 种子 ${seed}：涨完 6 秒后身体下缘仍低于岸线`);
    }
});

test('岸线 × 抓取：抓着的鱼可以被拖到岸线以下（不受岸线避让约束），松手后被平滑压回水里——每帧位移有上限、不瞬移（小鱼与大个子都是）', () => {
    // 这是设计取舍而不是遗漏（用户 2026-10-20 确认保持现状）：抓着的鱼跟着指针走，被拖出水面、拖进沙滩都可以，松手后落回岸线之上。
    // 要改成“拖着也留在水里”必须有意识地更新这条测试。
    for (const species of ['clown', 'hammer', 'whaleshark']) {
        const { w, f, spec } = solo(species, 6);
        const shore = 500;
        Core.step(w, FRAME_MS, { shore });
        Object.assign(f, { x: 640, y: 300, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
        const limit = Core.seabedOf(w, spec, f.len);
        assert.ok(Number.isFinite(limit) && limit < shore, `${species}：岸线避让线 ${limit}`);
        assert.equal(Core.grab(w, f, f.x, f.y), true, `${species}：抓得到`);
        for (let i = 0; i < 120; i++) {                                         // 指针用 1 秒从水中拖到岸线以下 120 px，再停 1 秒
            const t = Math.min(1, i / 60);
            Core.step(w, FRAME_MS, { shore, pointer: { x: 640, y: 300 + (shore + 120 - 300) * t } });
        }
        assert.equal(f.state, 'held', `${species}：还抓着`);
        assert.ok(f.y > limit + 20, `${species}：抓着时鱼心 ${f.y.toFixed(0)} 在岸线避让线 ${limit.toFixed(0)} 之下——不被岸线推回水里`);
        Core.release(w, f);
        let last = { x: f.x, y: f.y };
        let worst = 0;
        for (let i = 0; i < 60 * 8; i++) {
            Core.step(w, FRAME_MS, { shore });
            worst = Math.max(worst, Math.hypot(f.x - last.x, f.y - last.y));
            last = { x: f.x, y: f.y };
            assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${species}：位置有限`);
        }
        const gap = shore - (f.y + f.len * spec.half);
        assert.ok(gap >= -1.5, `${species}：松手 8 秒后身体下缘低于岸线 ${(-gap).toFixed(1)} px`);
        assert.ok(worst < 40, `${species}：落回水里时单帧最大位移 ${worst.toFixed(1)} px`);
    }
});

test('岸线：第一次知道岸线时，只有家落在沙滩里的群重新挑家；家已经在岸线之上的群，家与换家计划都不动', () => {
    const w = world({ random: seeded(8) });
    Core.reconcile(w, [entry('clown'), entry('neon'), entry('hammer')], { instant: true });
    const [clown, neon, hammer] = ['clown', 'neon', 'hammer'].map(id => w.fish.find(f => f.species === id));
    const shore = 576;
    const sea = Core.seabedOf({ shoreY: shore, scale: w.scale }, Core.speciesById('clown'), 30 * w.scale);
    w.groups[clown.entry].hy = 650;                                            // 家在沙滩里
    w.groups[neon.entry].hy = 300;
    w.groups[hammer.entry].hy = 305;
    const before = { neon: w.groups[neon.entry].next, hammer: w.groups[hammer.entry].next, clown: w.groups[clown.entry].next };
    Core.step(w, 50, { shore });
    assert.equal(w.groups[neon.entry].hy, 300, '霓虹灯鱼的家在岸线之上：不动');
    assert.equal(w.groups[neon.entry].next, before.neon, '换家计划也不动');
    assert.equal(w.groups[hammer.entry].hy, 305, '锤头鲨的家在岸线之上：不动');
    assert.equal(w.groups[hammer.entry].next, before.hammer);
    assert.notEqual(w.groups[clown.entry].hy, 650, '小丑鱼的家在沙滩里：重新挑了');
    assert.ok(w.groups[clown.entry].hy <= sea + 1e-9, `新家 ${w.groups[clown.entry].hy.toFixed(0)} 在岸线避让线 ${sea.toFixed(0)} 之上`);
    assert.ok(w.groups[clown.entry].next > w.time, '重新挑过：下一次换家在将来');
    // 之后岸线只是在变，不再触发“第一次”：家在沙滩里的群也不会被逐帧重挑（家被潮水淹了只影响游向，见下一条）
    const hy = w.groups[clown.entry].hy;
    Core.step(w, 50, { shore: shore - 30 });
    assert.equal(w.groups[clown.entry].hy, hy, '岸线只是在动：家不重挑');
});

test('岸线：家在岸线以下（潮水涨上来了）时，鱼朝岸线上方的那一点游，而不是一直往沙滩里顶（长时间贴在岸线上滑）', () => {
    // 家固定在岸线以下 80 px，其余都是真实的动力学。没有这条规则时，小丑鱼平均只高出岸线避让线 9 px（一直顶着），有了以后约 42 px
    for (const [species, seed] of [['clown', 1], ['clown', 2], ['angel', 1], ['tang', 3]]) {
        const w = world({ random: seeded(seed) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        const spec = Core.speciesById(species);
        const shore = 576;
        Core.step(w, 50, { shore });
        const group = w.groups[f.entry];
        let sum = 0;
        let n = 0;
        let over = 0;
        for (let i = 0; i < 20 * 40; i++) {
            group.hy = shore + 80; group.next = 1e9;
            Core.step(w, 50, { shore });
            if (w.time > 5) { const gap = Core.seabedOf(w, spec, f.len) - f.y; sum += gap; n++; over = Math.max(over, -gap); }
        }
        assert.ok(sum / n > 25, `${species} 种子 ${seed}：平均高出岸线避让线 ${(sum / n).toFixed(1)} px（被家往沙滩里拽着顶就只有约 9）`);
        assert.ok(over < 8, `${species} 种子 ${seed}：最多陷进避让线 ${over.toFixed(1)} px（间隙本身 ${(P.SHORE_GAP * w.scale).toFixed(1)} px）`);
    }
});

test('岸线 × 换家：岸线压低了本种活动带的下沿时，新家取在 [max(带上沿, 屏幕顶上限), 岸线避让线] 里且两端都用得上——蝠鲼的下界是屏幕顶上限（高过带上沿），鲸鲨的下界是带上沿（高过屏幕顶上限）', () => {
    // 1280×720（缩放 0.878）：蝠鲼带 [72, 432] px、屏幕顶上限 123.1；鲸鲨带 [144, 432] px、屏幕顶上限 102.6。
    // 岸线 520 px 时两者的避让线（396.9、417.4）都落在带下沿 432 以上，所以走“岸线压低了带下沿”的那条分支。
    const shore = 520;
    for (const species of ['manta', 'whaleshark']) {
        const w = world({ random: seeded(12) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        const spec = Core.speciesById(species);
        const group = w.groups[f.entry];
        Core.step(w, 50, { shore });                                           // 第一次知道岸线
        const lenPx = spec.len * w.scale;
        const ceil = lenPx * spec.half + P.TOP_PAD * w.scale;
        const top = spec.band[0] * H;
        const bottom = spec.band[1] * H;
        const low = Math.max(top, ceil);
        const sea = Core.seabedOf(w, spec, lenPx);
        assert.ok(species === 'manta' ? ceil > top : top > ceil, `${species}：这条测试要覆盖“屏幕顶上限高过带上沿”（蝠鲼）与“带上沿高过屏幕顶上限”（鲸鲨）两种情形`);
        assert.ok(sea < bottom && sea > low + 100, `${species}：避让线 ${sea.toFixed(1)} 在 (${low.toFixed(1)}, ${bottom.toFixed(1)}) 之内（否则测的不是这条分支）`);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < 400; i++) {
            group.next = 0;                                                    // 逼它每帧换一次家
            Core.step(w, 50, { shore });
            min = Math.min(min, group.hy);
            max = Math.max(max, group.hy);
        }
        assert.ok(min >= low - 1e-9, `${species}：新家最高到了 ${min.toFixed(1)}，应不高于 ${low.toFixed(1)}（身体不探出屏幕顶、也不高出本种的带）`);
        assert.ok(max <= sea + 1e-9, `${species}：新家最低到了 ${max.toFixed(1)}，应不低于避让线 ${sea.toFixed(1)}`);
        assert.ok(min < low + 0.1 * (sea - low), `${species}：上端取得到（最高 ${min.toFixed(1)}）`);
        assert.ok(max > sea - 0.1 * (sea - low), `${species}：下端取得到（最低 ${max.toFixed(1)}）`);
    }
});

test('岸线：第一次知道岸线时，已被捞走的条目（群被丢掉、鱼还在淡出）不影响其余的群重新挑家，也不抛错', () => {
    const w = world({ random: seeded(14) });
    const gone = entry('clown');
    const stay = entry('angel');
    Core.reconcile(w, [gone, stay], { instant: true });
    Core.dismiss(w, gone.id);
    assert.equal(w.groups[gone.id], undefined, '捞走的条目：群已丢掉');
    assert.ok(w.fish.some(f => f.entry === gone.id && f.state === 'leaving'), '但它的鱼还在淡出，仍在鱼列表里');
    w.groups[stay.id].hy = 700;                                                // 留下的鱼，家在沙滩里
    const spec = Core.speciesById('angel');
    const sea = Core.seabedOf({ shoreY: 576, scale: w.scale }, spec, spec.len * w.scale);
    assert.doesNotThrow(() => Core.step(w, 50, { shore: 576 }));
    assert.notEqual(w.groups[stay.id].hy, 700, '留下的群照常重挑了家');
    assert.ok(w.groups[stay.id].hy <= sea + 1e-9, `新家 ${w.groups[stay.id].hy.toFixed(0)} 在岸线避让线 ${sea.toFixed(0)} 之上`);
    assert.equal(w.groups[gone.id], undefined, '捞走的条目不会被重新建出群');
});

test('岸线 × 屏幕顶：屏幕很矮、岸线又很高，大个子的上下限互相矛盾时以屏幕顶为准（身体不探出屏幕），不抖动、不出现非有限数', () => {
    const w = Core.createWorld({ width: 800, height: 300, random: seeded(2), lowPower: false });
    Core.reconcile(w, [entry('manta'), entry('whaleshark')], { instant: true });
    let minTop = Infinity;
    let jitter = 0;
    const last = new Map();
    for (let i = 0; i < 20 * 60; i++) {
        Core.step(w, 50, { shore: 150 });                                       // 岸线夹到屏高的 50%
        for (const f of w.fish) {
            const spec = Core.speciesById(f.species);
            assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx) && Number.isFinite(f.vy), `${f.species}：状态有限`);
            if (w.time > 6) minTop = Math.min(minTop, f.y - f.len * spec.half);
            if (last.has(f.id) && w.time > 2) jitter = Math.max(jitter, Math.abs(f.y - last.get(f.id)));       // 前 2 秒是岸线第一次出现时的一次性收拢（按 LIMIT_EASE 平滑压回，不计抖动）
            last.set(f.id, f.y);
        }
    }
    assert.ok(minTop >= -1, `身体上缘最高到了 ${minTop.toFixed(1)}（负数 = 探出屏幕顶部）`);
    assert.ok(jitter < 30, `单帧最大纵向位移 ${jitter.toFixed(1)} px`);
});

// ---------- 放入 ----------

test('放入：大个子不在托盘位置凭空淡入，而是从离托盘近的一侧、本种的高度游进来，朝向屏内；小鱼仍在托盘位置淡入', () => {
    const tray = y => ({ x: 0, y });
    for (const species of HEAVY) {
        for (const [fromX, right] of [[W - 80, true], [80, false]]) {
            const w = world({ random: seeded(5) });
            const e = entry(species);
            Core.reconcile(w, [e], { from: Object.assign(tray(H - 60), { x: fromX }) });
            const f = w.fish[0];
            const spec = Core.speciesById(species);
            if (right) { assert.ok(f.x > W, `${species}：从右侧屏外进入 ${f.x}`); assert.ok(Math.cos(f.ang) < 0, `${species} 朝向屏内（向左）`); }
            else { assert.ok(f.x < 0, `${species}：从左侧屏外进入 ${f.x}`); assert.ok(Math.cos(f.ang) > 0, `${species} 朝向屏内（向右）`); }
            assert.ok(Math.abs(f.y - w.groups[e.id].hy) <= 20 * w.scale + 1, `${species}：高度在本种的家附近`);
            assert.ok(f.y >= spec.band[0] * H - 40 && f.y <= spec.band[1] * H + 40, `${species}：高度在本种的纵向带里 ${f.y}`);
            for (let i = 0; i < 12 * 20; i++) Core.step(w, 50, {});
            assert.ok(f.x >= 0 && f.x <= W, `${species}：12 秒后已经游进屏幕 ${f.x}`);
        }
    }
    const w = world({ random: seeded(5) });
    Core.reconcile(w, [entry('neon')], { from: { x: 300, y: 650 } });
    for (const f of w.fish) assert.ok(Math.abs(f.x - 300) <= 12 && Math.abs(f.y - 650) <= 12, '小鱼从托盘位置附近淡入');
});

// ---------- 弧线转弯与侧视转身 ----------

test('弧线转弯（俯视的蝠鲼）：自由游时速度方向的转速不超过 ARC_YAW × 笨重系数（不贴着屏幕顶时），不会刹停再掉头', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const { w, f, spec } = solo('manta', seed);
        let last = Math.atan2(f.vy, f.vx);
        let worst = 0;
        let slowest = Infinity;
        for (let i = 0; i < 120 * 20; i++) {
            Core.step(w, 50, {});
            const head = Math.atan2(f.vy, f.vx);
            const rate = Math.abs(Core.angleDiff(last, head)) / 0.05;
            last = head;
            if (f.y - f.len * spec.half < 8) continue;                     // 顶着屏幕顶部滑行时竖直速度会被收掉，朝向变化不算转弯
            worst = Math.max(worst, rate / (P.ARC_YAW * Core.agileOf(w, f)));
            slowest = Math.min(slowest, Math.hypot(f.vx, f.vy) / Core.cruiseSpeed(w, f));
        }
        assert.ok(worst <= 1.001, `种子 ${seed}：转速达到上限的 ${worst.toFixed(2)} 倍`);
        assert.ok(slowest > 0.3, `种子 ${seed}：转弯时最慢降到巡航速度的 ${slowest.toFixed(2)}（刹停再掉头）`);
    }
});

test('侧视转身（小锤头鲨、鲸鲨）：状态量合法，换面只发生在身体最短的那一刻，转身需要时间，朝向始终在现在的面上、俯仰不超过自由游上限', () => {
    for (const species of SIDE_HEAVY) {
        let flips = 0;
        for (const seed of [1, 2, 3, 4]) {
            const { w, f } = solo(species, seed);
            Core.step(w, FRAME_MS, {});                       // 第一步给出初始的面向
            let lastFace = f.face;
            let lastFlipAt = null;
            let lastXs = 1;
            let minAlign = Infinity;
            let maxPitch = 0;
            let maxFlipStep = 0;
            let maxXsStep = 0;
            let lastFlipVal = f.flip;
            let lastPhase = f.phase;
            let worstBeatErr = 0;
            for (let i = 0; i < 120 * 60; i++) {
                Core.step(w, FRAME_MS, {});
                // 自由游时的摆尾频率 = 0.7 + 沿游向的速度 ÷ 体长 × 0.9（圈/s）
                worstBeatErr = Math.max(worstBeatErr, Math.abs((f.phase - lastPhase) / (Math.PI * 2) / (FRAME_MS / 1000) - (0.7 + f.sp / Math.max(1, f.len) * 0.9)));
                lastPhase = f.phase;
                assert.ok(f.face === 1 || f.face === -1, `${species}：face 只能是 ±1`);
                assert.ok(f.xs >= 0 && f.xs <= 1 && f.yaw >= 0 && f.yaw < 1, `${species}：xs ${f.xs}、yaw ${f.yaw} 越界`);
                if (f.face !== lastFace) {
                    flips++;
                    assert.ok(f.xs < 0.15, `${species}：换面时身体应当最短（xs ${f.xs}）`);
                    if (lastFlipAt !== null) assert.ok(w.time - lastFlipAt >= 0.9, `${species}：两次换面只隔 ${(w.time - lastFlipAt).toFixed(2)} 秒（转身要时间）`);
                    lastFlipAt = w.time;
                    lastFace = f.face;
                }
                if (w.time > 1) minAlign = Math.min(minAlign, Math.cos(f.ang) * f.face);
                maxPitch = Math.max(maxPitch, Math.min(Math.abs(Core.angleDiff(0, f.ang)), Math.abs(Core.angleDiff(Math.PI, f.ang))));
                maxFlipStep = Math.max(maxFlipStep, Math.abs(f.flip - lastFlipVal));
                lastFlipVal = f.flip;
                maxXsStep = Math.max(maxXsStep, Math.abs(f.xs - lastXs));
                lastXs = f.xs;
                if (f.xs > 0.3 && Math.abs(f.vx) > 0.5) assert.equal(Math.sign(f.vx), f.face, `${species}：身体伸展时水平速度要朝着面向的那一侧`);
            }
            assert.ok(minAlign > 0.7, `${species} 种子 ${seed}：朝向与面向的一致程度最低 ${minAlign.toFixed(2)}`);
            assert.ok(maxPitch <= P.FREE_PITCH + 0.02, `${species} 种子 ${seed}：自由游的俯仰最大 ${maxPitch.toFixed(3)}（上限 ${P.FREE_PITCH}）`);
            assert.ok(maxFlipStep <= 0.31, `${species}：翻面每帧变化 ${maxFlipStep.toFixed(3)} 应不超过 0.3`);
            assert.ok(maxXsStep < 0.06, `${species}：身体伸缩每帧变化 ${maxXsStep.toFixed(3)} 太突然`);
            assert.ok(worstBeatErr < 1e-6, `${species} 种子 ${seed}：摆尾频率与公式的最大偏差 ${worstBeatErr}`);
        }
        assert.ok(flips >= 2, `${species}：4 个种子 × 120 秒里应当至少转过几次身（${flips}）`);
    }
});

test('侧视大个子的漫游以水平为主：屏幕上看到的俯仰中位数小于 20°（各向同性的漫游时锤头鲨约 30°，看上去一直在俯冲）；屏幕速度的俯仰任何时候都不超过 FREE_PITCH，转身中也一样', () => {
    assert.ok(P.WANDER_PITCH > 0 && P.WANDER_PITCH < 1, '漫游竖直分量的比例要登记，小于 1');
    for (const species of SIDE_HEAVY) {
        const apparent = [];
        let worstVelocityPitch = 0;
        let steepWhileLong = 0;
        let samples = 0;
        for (const seed of [1, 2, 3, 4]) {
            const { w, f } = solo(species, seed);
            for (let i = 0; i < 60 * 20; i++) {
                Core.step(w, 50, {});
                if (w.time < 2) continue;
                const xs = Number.isFinite(f.xs) ? f.xs : 1;
                // 画法先按 ang 转、再沿屏幕横向压缩 xs：身体轴线在屏幕上的角度（折到 0…90°）
                const a = Math.abs(Math.atan2(Math.sin(f.ang), xs * Math.cos(f.ang)));
                const app = a > Math.PI / 2 ? Math.PI - a : a;
                apparent.push(app);
                worstVelocityPitch = Math.max(worstVelocityPitch, Math.atan2(Math.abs(f.vy), Math.abs(f.vx)));
                if (xs >= 0.25) { samples++; if (app > Math.PI / 4) steepWhileLong++; }
            }
        }
        apparent.sort((x, y) => x - y);
        const median = apparent[Math.floor(apparent.length / 2)];
        assert.ok(median < 20 * Math.PI / 180, `${species}：屏幕上俯仰的中位数 ${(median * 180 / Math.PI).toFixed(1)}°（应小于 20°）`);
        assert.ok(worstVelocityPitch <= P.FREE_PITCH + 1e-6, `${species}：屏幕速度的俯仰最大 ${worstVelocityPitch.toFixed(3)} rad（上限 ${P.FREE_PITCH}），转身时竖直速度要跟着 xs 一起收`);
        assert.equal(steepWhileLong, 0, `${species}：身体还有 25% 以上长度时，看起来的俯仰不应超过 45°（${steepWhileLong}/${samples}）`);
    }
});

test('侧视转身：被屏幕边缘挡回（想去的方向与现在的面相反）时才开始转，转身中屏幕横向速度先收到接近 0 再反向，转完朝里游', () => {
    for (const species of SIDE_HEAVY) {
        const { w, f } = solo(species, 2);
        w.groups[f.entry].next = Infinity;
        const cruise = Core.cruiseSpeed(w, f);
        Object.assign(f, { x: W - 30, y: 330, ang: 0, face: 1, flip: 1, flipTo: 1, yaw: 0, xs: 1, sp: cruise, vx: cruise, vy: 0, hvx: undefined });
        let turned = false;
        let minSpeedWhileTurning = Infinity;
        let started = false;
        for (let i = 0; i < 40 * 20 && !turned; i++) {
            Core.step(w, 50, {});
            if (f.yaw > 0) { started = true; minSpeedWhileTurning = Math.min(minSpeedWhileTurning, Math.abs(f.vx)); }
            if (f.face === -1 && f.yaw === 0) turned = true;
        }
        assert.equal(started, true, `${species}：被边缘挡回时开始转身`);
        assert.equal(turned, true, `${species}：40 秒内完成了转身`);
        assert.ok(minSpeedWhileTurning < cruise * 0.3, `${species}：转身中屏幕横向速度降到 ${minSpeedWhileTurning.toFixed(1)}（巡航 ${cruise.toFixed(1)}）`);
        for (let i = 0; i < 10 * 20; i++) Core.step(w, 50, {});
        assert.ok(f.vx < -5, `${species}：转完身朝屏内（向西）游：vx ${f.vx.toFixed(1)}`);
        assert.ok(f.x < W - 30 + 1, `${species}：已经朝屏内走了：x ${f.x.toFixed(0)}`);
    }
});

test('侧视转身：速度被外界直接改过（戳、重新放置）后以改后的为准，状态不残留旧值', () => {
    const { w, f } = solo('hammer', 3);
    for (let i = 0; i < 40; i++) Core.step(w, 50, {});
    for (let i = 0; i < 20 * 60 && f.yaw !== 0; i++) Core.step(w, 50, {});               // 等它不在转身（转身中的屏幕速度本来就被投影压低）
    assert.equal(f.yaw, 0, '60 秒内总有直着游的时候');
    f.vx = 0; f.vy = 0;                                        // 外界把它按停了
    Core.step(w, 16, {});
    assert.ok(Math.hypot(f.vx, f.vy) < Core.cruiseSpeed(w, f) * 0.2, `按停后下一帧只剩一点速度：${Math.hypot(f.vx, f.vy).toFixed(2)}`);
    f.vx = f.face * 200; f.vy = 0;                             // 外界给了一个冲量
    Core.step(w, 16, {});
    assert.ok(Math.abs(f.vx) > 100, `冲量被采纳：${f.vx.toFixed(1)}`);
    for (let i = 0; i < 20 * 10; i++) Core.step(w, 50, {});
    assert.ok(Math.hypot(f.vx, f.vy) <= Core.cruiseSpeed(w, f) * P.FLEE_CAP + 1e-6, '冲量会回落到正常速度范围内');
    // 只改了一个分量也算“被外界改过”（变异检查：把判断写成“两个分量都变了才算”时，这里的冲量被当作没发生）
    for (let i = 0; i < 20 * 60 && f.yaw !== 0; i++) Core.step(w, 50, {});
    assert.equal(f.yaw, 0, '又直着游了');
    for (let i = 0; i < 20 * 10; i++) Core.step(w, 50, {});                                // 回到巡航，速度不再被限制
    f.vx += f.face * 70;                                       // 只给横向一个冲量，竖直分量原样不动
    const vyBefore = f.vy;
    Core.step(w, 16, {});
    assert.ok(Math.abs(f.vx) > 90, `只改横向速度的冲量也被采纳：${f.vx.toFixed(1)}`);
    assert.ok(Math.abs(f.vy - vyBefore) < 5, `竖直分量没有被连带改掉：${vyBefore.toFixed(2)} → ${f.vy.toFixed(2)}`);
    const vxKept = f.vx;
    f.vy += 80;                                                // 只给竖直一个冲量
    Core.step(w, 16, {});
    assert.ok(Math.abs(f.vx - vxKept) < Math.abs(vxKept) * 0.2 + 5, `横向分量大体保持：${vxKept.toFixed(1)} → ${f.vx.toFixed(1)}`);
    assert.ok(f.vy > 20, `只改竖直速度的冲量也被采纳（限在 FREE_PITCH 以内）：${f.vy.toFixed(1)}`);
});

test('水母钟罩：大个子鱼心不进入 钟罩半径 + 体长 × BELL_KEEP（有上限）的范围，钟罩压在它的家上也一样', () => {
    for (const species of [...HEAVY, 'clown']) {
        for (const seed of [1, 2, 3]) {
            const { w, f } = solo(species, seed);
            const bell = { x: w.groups[f.entry].hx, y: w.groups[f.entry].hy, r: 70 };
            let worst = Infinity;
            for (let i = 0; i < 90 * 20; i++) {
                Core.step(w, 50, { bells: [bell] });
                if (w.time < 3) continue;
                const keep = bell.r + Math.min(f.len * P.BELL_KEEP, P.BELL_LEN_CAP * w.scale);
                worst = Math.min(worst, Math.hypot(f.x - bell.x, f.y - bell.y) / keep);
            }
            assert.ok(worst > 0.95, `${species} 种子 ${seed}：最近到了避让距离的 ${worst.toFixed(2)}`);
        }
    }
});

// ---------- 抓着：被拴着的游泳者 ----------

/** 抓住鱼的前半身，指针先向右匀速走 2 秒，再画半径 150 的圆 4 秒，最后停住 1.5 秒；每帧回调 observe(f, pointer, t)。 */
function dragRun(species, observe, { seed = 3 } = {}) {
    const w = world({ random: seeded(seed) });
    Core.reconcile(w, [entry(species)], { instant: true });
    const f = w.fish[0];
    Object.assign(f, { x: 500, y: 380, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
    const gx = f.x + f.len * 0.15;
    const gy = f.y + f.len * 0.02;
    assert.equal(Core.grab(w, f, gx, gy), true);
    let pointer = { x: gx, y: gy };
    for (let i = 0; i < 7.5 * 60; i++) {
        const t = i / 60;
        if (t < 2) pointer = { x: gx + 300 * t, y: gy };
        else if (t < 6) { const a = (t - 2) * 1.5; pointer = { x: gx + 600 + 150 * Math.sin(a), y: gy + 150 * (1 - Math.cos(a)) }; }
        Core.step(w, FRAME_MS, { pointer });
        observe(f, pointer, t, w);
    }
    return { w, f, pointer };
}

test('抓着：被拴着的游泳者——抓点始终跟着指针，每帧位移有上限，朝向转速有上限，不倒立，翻面平滑，一直在划水', () => {
    for (const species of ['clown', 'hammer', 'turtle', 'manta', 'whaleshark']) {
        const spec = Core.speciesById(species);
        let worstErr = 0;
        let worstDisp = 0;
        let worstTurn = 0;
        let worstPitch = 0;
        let worstFlip = 0;
        let minBeat = Infinity;
        let maxBeat = 0;
        let worstBeatErr = 0;
        let last = null;
        const run = dragRun(species, (f, pointer, t, w) => {
            const h = f.held;
            const c = Math.cos(f.ang);
            const s = Math.sin(f.ang);
            const xsH = Number.isFinite(f.xs) && !spec.top ? f.xs : 1;
            worstErr = Math.max(worstErr, Math.hypot(f.x + xsH * (h.gx * c - h.gy * s) - pointer.x, f.y + h.gx * s + h.gy * c - pointer.y));
            if (last) {
                worstDisp = Math.max(worstDisp, Math.hypot(f.x - last.x, f.y - last.y));
                if (f.face === last.face) worstTurn = Math.max(worstTurn, Math.abs(Core.angleDiff(last.ang, f.ang)) / (FRAME_MS / 1000));
                worstFlip = Math.max(worstFlip, Math.abs(f.flip - last.flip));
                const beat = (f.phase - last.phase) / (Math.PI * 2) / (FRAME_MS / 1000);
                minBeat = Math.min(minBeat, beat);
                maxBeat = Math.max(maxBeat, beat);
                // 摆尾频率随速度（以体长/秒计）线性增加：公式本身也要钉住，只测上下限时把“速度 ÷ 体长”写成“速度 × 体长”也不会被发现
                const expectedBeat = Core.clamp(P.HOLD_BEAT_MIN + P.HOLD_BEAT_GAIN * Math.hypot(f.vx, f.vy) / Math.max(1, f.len), P.HOLD_BEAT_MIN, P.HOLD_BEAT_MAX);
                worstBeatErr = Math.max(worstBeatErr, Math.abs(beat - expectedBeat));
            }
            if (!spec.top) worstPitch = Math.max(worstPitch, Math.min(Math.abs(Core.angleDiff(0, f.ang)), Math.abs(Core.angleDiff(Math.PI, f.ang))));
            last = { x: f.x, y: f.y, ang: f.ang, flip: f.flip, phase: f.phase, face: f.face };
            assert.equal(f.state, 'held');
            assert.ok(w.fish.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.ang)), `${species}：坐标有限`);
        });
        assert.ok(worstErr <= Math.max(24, 0.06 * run.f.len), `${species}：抓点离指针最远 ${worstErr.toFixed(1)} px（体长 ${run.f.len.toFixed(0)}）`);
        assert.ok(worstDisp <= 12, `${species}：单帧位移最大 ${worstDisp.toFixed(1)} px（指针最快 300 px/s ≈ 5 px/帧）`);
        assert.ok(worstTurn <= P.HOLD_YAW_MAX + 0.5, `${species}：朝向转速最大 ${worstTurn.toFixed(2)} rad/s（上限 ${P.HOLD_YAW_MAX}）`);
        assert.ok(worstFlip <= 0.31, `${species}：翻面每帧变化 ${worstFlip.toFixed(3)}`);
        assert.ok(minBeat >= P.HOLD_BEAT_MIN - 1e-6, `${species}：摆尾最慢 ${minBeat.toFixed(2)} 圈/s，被抓着也要一直划水（下限 ${P.HOLD_BEAT_MIN}）`);
        assert.ok(maxBeat > P.HOLD_BEAT_MIN * 1.3 && maxBeat <= P.HOLD_BEAT_MAX + 1e-6, `${species}：快的时候摆得更快 ${maxBeat.toFixed(2)} 圈/s`);
        assert.ok(worstBeatErr < 1e-6, `${species}：摆尾频率与 HOLD_BEAT_MIN + HOLD_BEAT_GAIN × 速度/体长 的最大偏差 ${worstBeatErr}`);
        // 侧视的大个子（转身模型）整个过程朝向都不越过俯仰上限；小鱼转身时仍会从竖直方向转过去（它们小，靠翻面缓动掩过去）
        if (run.w.fish.length && Core.isHeavySide(run.w, run.f)) assert.ok(worstPitch <= P.HOLD_PITCH_MAX + 0.02, `${species}：朝向离水平线最多 ${worstPitch.toFixed(3)}（上限 ${P.HOLD_PITCH_MAX}）`);
    }
});

test('抓着：侧视的大个子被拖到反方向时转身——身体先缩短、换面、再伸长，被抓的点不跳（朝东、朝西，抓点在中线上、下、上方都一样）', () => {
    // 变异检查（2026-10-19）：只测“抓点在中线上、朝东”时，换面时不镜像 held.gy、朝西的鱼不转身这两处都没人发现。
    for (const species of SIDE_HEAVY) {
        for (const [face, ly] of [[1, 0], [-1, 0], [1, 0.1], [-1, -0.1], [1, -0.1]]) {
            const w = world({ random: seeded(3) });
            Core.reconcile(w, [entry(species)], { instant: true });
            const f = w.fish[0];
            Object.assign(f, { x: 640, y: 360, vx: 0, vy: 0, ang: face > 0 ? 0 : Math.PI, flip: face, flipTo: face, alpha: 1, state: 'alive', face, yaw: 0, xs: 1, sp: 0 });
            const gx = f.x + face * f.len * 0.2;                              // 抓前半身（朝东的鱼在东边，朝西的鱼在西边）
            const gy = f.y + f.len * ly;
            const label = `${species} 朝${face > 0 ? '东' : '西'} 抓点偏 ${ly}`;
            assert.equal(Core.grab(w, f, gx, gy), true, `${label}：抓得到`);
            let pointer = { x: gx, y: gy };
            for (let i = 0; i < 30; i++) Core.step(w, FRAME_MS, { pointer });
            const faceBefore = f.face;
            const anchorOf = () => {
                const c = Math.cos(f.ang);
                const s = Math.sin(f.ang);
                return { x: f.x + f.xs * (f.held.gx * c - f.held.gy * s), y: f.y + f.held.gx * s + f.held.gy * c };
            };
            let minXs = 1;
            let swappedAt = null;
            let worstJump = 0;
            let last = anchorOf();
            for (let i = 0; i < 6 * 60; i++) {                                   // 向相反的方向匀速拖 6 秒，240 px/s
                pointer = { x: gx - face * 240 * (i / 60), y: gy };
                Core.step(w, FRAME_MS, { pointer });
                minXs = Math.min(minXs, f.xs);
                if (swappedAt === null && f.face !== faceBefore) swappedAt = i;
                const anchor = anchorOf();
                worstJump = Math.max(worstJump, Math.hypot(anchor.x - pointer.x, anchor.y - pointer.y) - Math.hypot(last.x - pointer.x, last.y - pointer.y));
                last = anchor;
            }
            assert.notEqual(swappedAt, null, `${label}：向反方向拖了 6 秒应当换面`);
            assert.ok(minXs < 0.15, `${label}：换面时身体缩短到 ${minXs.toFixed(2)}`);
            assert.equal(f.face, -faceBefore);
            assert.ok(f.xs > 0.9, `${label}：转完身体伸展回来 ${f.xs.toFixed(2)}`);
            // 抓点偏离中线时，换面那一刻抓点的位置（held.gy）也要镜像，否则抓点在屏幕上会跳 2 × gy（锤头鲨约 16 px、鲸鲨约 57 px，实测）；正常只剩弹簧的追赶（约 5 px）
            assert.ok(worstJump < Math.max(10, 0.03 * f.len), `${label}：换面时抓点离指针的距离单帧最多变远 ${worstJump.toFixed(1)} px`);
            assert.ok(Math.cos(f.ang) * f.face > 0.7, `${label}：朝向与新的面一致`);
        }
    }
});

test('松手：没给速度就带走鱼自己的速度（上限是巡航的 GLIDE_MULT 倍）并按 GLIDE_RATE 衰减，鱼顺势游一段再恢复巡游；给了速度（甩出）以给的为准并夹在 THROW_MAX', () => {
    for (const species of ['clown', 'hammer', 'manta', 'whaleshark']) {
        const run = dragRun(species, () => {});
        const { w, f } = run;
        // 指针刚停住 1.5 秒，鱼接近静止；再往东拖一下让它带着速度
        let pointer = run.pointer;
        for (let i = 0; i < 20; i++) { pointer = { x: pointer.x + 6, y: pointer.y }; Core.step(w, FRAME_MS, { pointer }); }
        const cruise = Core.cruiseSpeed(w, f);
        const before = Math.hypot(f.vx, f.vy);
        assert.ok(before > cruise * 0.5, `${species}：松手前在拖动中的速度 ${before.toFixed(1)}`);
        Core.release(w, f);
        assert.equal(f.state, 'alive');
        assert.equal(f.held, null);
        const after = Math.hypot(f.vx, f.vy);
        assert.ok(after <= cruise * P.GLIDE_MULT + 1e-6, `${species}：松手后速度 ${after.toFixed(1)} 不超过上限 ${(cruise * P.GLIDE_MULT).toFixed(1)}`);
        assert.ok(after >= Math.min(before, cruise * P.GLIDE_MULT) * 0.99, `${species}：不是纸片，松手不会一下停死（${after.toFixed(1)} / ${before.toFixed(1)}）`);
        let settled = null;
        for (let i = 0; i < 20 * 20; i++) {
            Core.step(w, 50, {});
            if (settled === null && f.glide === 0) settled = w.time;
            assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
        }
        assert.notEqual(settled, null, `${species}：滑行会衰减完`);
        assert.ok(Math.hypot(f.vx, f.vy) <= cruise * P.FLEE_CAP + 1e-6, `${species}：最后回到正常速度范围`);
    }
    const { w, f } = solo('clown', 2);
    f.state = 'held'; f.held = { tail: false, gx: 0, gy: 0, lastX: 0, lastY: 0, pvx: 0, pvy: 0, aim: 0, w: 0 };
    Core.release(w, f, { vx: 5000, vy: 0 });
    assert.equal(Math.hypot(f.vx, f.vy), P.THROW_MAX, '甩出去的速度夹在 THROW_MAX');
    f.state = 'held'; f.held = { tail: false, gx: 0, gy: 0, lastX: 0, lastY: 0, pvx: 0, pvy: 0, aim: 0, w: 0 };
    Core.release(w, f, { vx: NaN, vy: 3 });
    assert.equal(Math.hypot(f.vx, f.vy), 0, '坏速度当作 0');
});

test('抓着：指针缺失时绳子是松的——鱼带着速度滑行、朝速度方向游，不飞走、不转圈', () => {
    for (const species of ['clown', 'hammer', 'manta']) {
        const w = world({ random: seeded(4) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        Object.assign(f, { x: 640, y: 360, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
        assert.equal(Core.grab(w, f, f.x, f.y), true);
        for (let i = 0; i < 30; i++) Core.step(w, FRAME_MS, { pointer: { x: 640 + i * 5, y: 360 + i * 3 } });      // 斜着拖：x、y 两个分量都有速度
        // 刚松绳的那一刻速度不会清零：只剩水的阻力，按 exp(−2.5 t) 衰减，鱼朝原来的方向滑出去一段（清零就是纸片突然停在原地）
        const dt = FRAME_MS / 1000;
        const v0 = Math.hypot(f.vx, f.vy);
        const [vx0, vy0] = [f.vx, f.vy];
        const heading0 = Math.atan2(f.vy, f.vx);
        const [x0, y0] = [f.x, f.y];
        assert.ok(v0 > 100 && Math.abs(vx0) > 50 && Math.abs(vy0) > 30, `${species}：松绳前在拖动中的速度 ${v0.toFixed(1)}（${vx0.toFixed(0)}, ${vy0.toFixed(0)}）`);
        Core.step(w, FRAME_MS, { pointer: null });
        assert.ok(Math.abs(Math.hypot(f.vx, f.vy) / v0 - Math.exp(-2.5 * dt)) < 0.002, `${species}：松绳后一帧的速度比 ${(Math.hypot(f.vx, f.vy) / v0).toFixed(4)}，水的阻力应为 ${Math.exp(-2.5 * dt).toFixed(4)}`);
        assert.ok(Math.abs(f.vx / vx0 - Math.exp(-2.5 * dt)) < 0.002 && Math.abs(f.vy / vy0 - Math.exp(-2.5 * dt)) < 0.002, `${species}：x、y 两个分量都按同一个比例衰减（${(f.vx / vx0).toFixed(4)}, ${(f.vy / vy0).toFixed(4)}）`);
        for (let i = 0; i < 29; i++) Core.step(w, FRAME_MS, { pointer: null });
        assert.ok(Math.abs(Math.hypot(f.vx, f.vy) / v0 - Math.exp(-2.5 * 30 * dt)) < 0.01, `${species}：松绳半秒后的速度比 ${(Math.hypot(f.vx, f.vy) / v0).toFixed(4)}，应为 ${Math.exp(-2.5 * 30 * dt).toFixed(4)}`);
        const glide = (v0 / 2.5) * (1 - Math.exp(-2.5 * 30 * dt));              // 阻力下半秒内滑过的距离
        const slid = Math.hypot(f.x - x0, f.y - y0);
        assert.ok(slid > glide * 0.95 && slid < glide * 1.05, `${species}：松绳半秒内滑了 ${slid.toFixed(1)} px（按阻力应约 ${glide.toFixed(1)}）`);
        assert.ok(Math.abs(Core.angleDiff(heading0, Math.atan2(f.vy, f.vx))) < 0.01, `${species}：滑行时方向不变`);
        for (let i = 0; i < 150; i++) Core.step(w, FRAME_MS, { pointer: null });
        assert.equal(f.state, 'held');
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Math.hypot(f.vx, f.vy) < 400, `${species}：速度 ${Math.hypot(f.vx, f.vy)}`);
        assert.ok(Math.abs(f.x - 640) < 700, `${species}：松绳后滑行的距离有限 ${f.x.toFixed(0)}`);
    }
});

// ---------- 命中（抓取椭圆随体长放大） ----------

test('命中：抓得到的范围跟着体长放大（大个子的身体比默认椭圆窄，用 hit 收紧），椭圆外一点点点不到，里面点得到', () => {
    for (const species of HEAVY) {
        const { w, f, spec } = solo(species, 2);
        Object.assign(f, { x: 600, y: 360, ang: 0, alpha: 1, state: 'alive' });
        const hit = spec.hit || [0.6, 0.35];
        const rx = f.len * hit[0] * P.HIT_SCALE + P.HIT_PAD;
        const ry = f.len * hit[1] * P.HIT_SCALE + P.HIT_PAD;
        assert.equal(Core.hitTest(w, 600 + rx * 0.95, 360), f, `${species}：椭圆里面点得到（前端）`);
        assert.equal(Core.hitTest(w, 600 - rx * 0.95, 360), f, `${species}：椭圆里面点得到（后端）`);
        assert.equal(Core.hitTest(w, 600, 360 + ry * 0.95), f, `${species}：椭圆里面点得到（侧面）`);
        assert.equal(Core.hitTest(w, 600 + rx * 1.05, 360), null, `${species}：椭圆外点不到`);
        assert.equal(Core.hitTest(w, 600, 360 + ry * 1.05), null, `${species}：椭圆外点不到（侧面）`);
        assert.ok(rx > 40, `${species}：抓得到的半长 ${rx.toFixed(0)} px，足够大`);
    }
});

// ---------- 变异检查补上的缺口（2026-10-19）：系统性变异检查里存活、且不是等价变异的那些 ----------
// 每条都对应“把某处改坏了而全套测试仍然通过”的情形；改坏的位置与结果见技术文档 aquarium-tide-size-drag-20261019.md 的验证一节。

const same = (a, b, label) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${label}：${a} ≠ ${b}`);
/** 被抓的点现在在世界里的位置（只用于没有转身横向缩短的鱼：小鱼、俯视的大个子）。 */
const heldAt = f => {
    const c = Math.cos(f.ang);
    const s = Math.sin(f.ang);
    return { x: f.x + f.held.gx * c - f.held.gy * s, y: f.y + f.held.gx * s + f.held.gy * c };
};
/** 一条已经转过角度 ang 的鱼，抓它身上“沿鱼身朝头 0.2 个体长、向侧面偏 0.05 个体长”的一点。 */
function grabRotated(species, ang, seed = 4) {
    const w = world({ random: seeded(seed) });
    Core.reconcile(w, [entry(species)], { instant: true });
    const f = w.fish[0];
    Object.assign(f, { x: 600, y: 350, vx: 0, vy: 0, ang, flip: Math.cos(ang) < 0 ? -1 : 1, flipTo: Math.cos(ang) < 0 ? -1 : 1, alpha: 1, state: 'alive', face: Math.cos(ang) < 0 ? -1 : 1 });
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const gx = f.x + f.len * (0.2 * c - 0.05 * s);
    const gy = f.y + f.len * (0.2 * s + 0.05 * c);
    assert.equal(Core.grab(w, f, gx, gy), true, `${species} 转过 ${ang} 后抓得到`);
    return { w, f, gx, gy };
}

test('放入（几何）：大个子紧贴屏幕边缘外游进来、朝向偏差不超过 ±0.25 rad、高度在家的 ±20 px（按缩放）内、托盘在哪一半屏幕就从哪一侧进；没有托盘位置时从屏幕下方进；刚放进来的鱼各项状态是初始值', () => {
    for (const species of HEAVY) {
        const offsets = [];
        for (let seed = 1; seed <= 12; seed++) {
            for (const [fromX, right] of [[W * 0.51, true], [W * 0.49, false]]) {
                const w = world({ random: seeded(seed) });
                const e = entry(species);
                Core.reconcile(w, [e], { from: { x: fromX, y: H - 60 } });
                const f = w.fish[0];
                const home = w.groups[e.id];
                const label = `${species} 种子 ${seed} 托盘在${right ? '右' : '左'}半边`;
                same(f.x, right ? W + f.len * 0.3 : -f.len * 0.3, `${label}：紧贴边缘外 0.3 个体长`);
                assert.ok(Math.abs(Core.angleDiff(right ? Math.PI : 0, f.ang)) <= 0.25 + 1e-9, `${label}：朝向屏内、偏差不超过 0.25 rad，实际 ${f.ang.toFixed(3)}`);
                assert.ok(Math.abs(f.y - home.hy) <= 20 * w.scale + 1e-9, `${label}：高度在家的 ±20 px 内，偏差 ${(f.y - home.hy).toFixed(1)}`);
                if (right) offsets.push(f.y - home.hy);
            }
        }
        assert.ok(Math.max(...offsets) - Math.min(...offsets) > 10, `${species}：入口高度有随机的错落（12 个种子的范围 ${(Math.max(...offsets) - Math.min(...offsets)).toFixed(1)} px）`);
    }
    // 没有托盘位置：从屏幕底边下面进来——大个子在 0.35 个体长处，小鱼与海龟在 1 个体长处
    for (const [species, k] of [['whaleshark', 0.35], ['manta', 0.35], ['hammer', 0.35], ['clown', 1], ['turtle', 1]]) {
        const w = world({ random: seeded(7) });
        Core.reconcile(w, [entry(species)]);
        for (const f of w.fish) same(f.y, H + f.len * k, `${species}：从屏幕下方进入的高度`);
    }
    // “大个子”按屏宽的 BIG_ENTRY 比例判断：1920×1080 里小锤头鲨（约 180 px）也要从边上进，海龟（约 90 px）不算，仍在托盘位置附近淡入
    const wide = world({ width: 1920, height: 1080, random: seeded(3) });
    Core.reconcile(wide, [entry('hammer'), entry('turtle')], { from: { x: 1500, y: 1000 } });
    const [hammer, turtle] = wide.fish;
    assert.ok(hammer.x > 1920, `1920 宽的屏上小锤头鲨从右侧屏外进入：${hammer.x.toFixed(0)}`);
    assert.ok(Math.abs(turtle.x - 1500) <= 12 && Math.abs(turtle.y - 1000) <= 12, `海龟在托盘位置附近淡入：(${turtle.x.toFixed(0)}, ${turtle.y.toFixed(0)})`);
    const fresh = world({ random: seeded(2) });
    Core.reconcile(fresh, [entry('neon'), entry('whaleshark')], { instant: true });
    for (const f of fresh.fish) assert.deepEqual([f.cooldown, f.turn, f.glide, f.held], [0, 0, 0, null], `${f.species} 刚放进来时没有冷却、没有弯身、没有滑行、没被抓`);
    // 随机数固定为 0.9 时，入口的高度偏移与朝向偏差都取“正”的一侧：y = 家 + 0.4 × 40 × 缩放，朝向 = 屏内方向 + 0.2 rad（符号写反了，随机范围看上去仍然一样）
    for (const species of HEAVY) {
        for (const [fromX, right] of [[W * 0.51, true], [W * 0.49, false]]) {
            const w = world({ random: () => 0.9 });
            const e = entry(species);
            Core.reconcile(w, [e], { from: { x: fromX, y: H - 60 } });
            const f = w.fish[0];
            same(f.y - w.groups[e.id].hy, 0.4 * 40 * w.scale, `${species} 托盘在${right ? '右' : '左'}半边：入口高度相对家的偏移`);
            same(f.ang, (right ? Math.PI : 0) + 0.4 * 0.5, `${species} 托盘在${right ? '右' : '左'}半边：入口朝向`);
        }
    }
});

test('改变窗口大小：位置、速度、沿游向的速度 sp 与体长按各自的比例缩放（大个子的 sp 不残留旧尺寸）', () => {
    for (const species of ['whaleshark', 'hammer']) {
        const { w, f } = solo(species, 3);
        for (let i = 0; i < 200; i++) Core.step(w, 50, {});
        assert.ok(f.sp > 5 && Math.abs(f.vx) > 1, `${species}：缩放前在游（sp ${f.sp}）`);
        const before = { x: f.x, y: f.y, vx: f.vx, vy: f.vy, sp: f.sp, len: f.len, scale: w.scale };
        Core.resize(w, 1920, 1080);
        const factor = w.scale / before.scale;
        assert.ok(factor > 1.3, `${species}：视口缩放变了 ${factor.toFixed(3)} 倍`);
        same(f.x, before.x * 1920 / W, `${species} x`);
        same(f.y, before.y * 1080 / H, `${species} y`);
        same(f.vx, before.vx * factor, `${species} vx`);
        same(f.vy, before.vy * factor, `${species} vy`);
        same(f.sp, before.sp * factor, `${species} 沿游向的速度`);
        same(f.len, before.len * factor, `${species} 体长`);
    }
    // 没有 sp 这个字段的小鱼缩放之后仍然没有（不能被乘成 NaN 后留在对象上）
    const small = solo('clown', 3);
    assert.equal(small.f.sp, undefined, '小鱼本来没有 sp');
    Core.resize(small.w, 1920, 1080);
    assert.equal(small.f.sp, undefined, '缩放之后仍然没有 sp');
});

test('松手：以高于正常上限的速度松手，速度不会在一两帧内被截到上限，而是按阻力与 GLIDE_RATE 慢慢收（小鱼与大个子都是）', () => {
    // 变异检查：把“滑行中”的判断或衰减写坏时，鱼在松手后的第一帧就被截到 FLEE_CAP × 巡航速度（掉 25% 以上），而旧测试只量松手那一刻。
    for (const species of ['clown', 'tang', 'angel', 'hammer', 'whaleshark']) {
        const { w, f } = solo(species, 2);
        Object.assign(f, { x: 500, y: 400, vx: 0, vy: 0, alpha: 1, state: 'alive' });
        const cruise = Core.cruiseSpeed(w, f);
        assert.equal(Core.grab(w, f, f.x, f.y), true);
        const give = 3.4 * cruise;
        assert.ok(give > P.FLEE_CAP * cruise * 1.25, '给的速度明显高于正常上限');
        Core.release(w, f, { vx: give, vy: 0 });
        same(f.glide, give, `${species}：滑行上限从松手速度开始`);
        Core.step(w, FRAME_MS, {});
        assert.ok(Math.hypot(f.vx, f.vy) > give * 0.95, `${species}：一帧后速度 ${Math.hypot(f.vx, f.vy).toFixed(1)}，不应被截到上限 ${(P.FLEE_CAP * cruise).toFixed(1)}（给的是 ${give.toFixed(1)}）`);
        assert.ok(f.glide > P.FLEE_CAP * cruise && f.glide < give, `${species}：滑行上限在往下衰减但还没到头 ${f.glide.toFixed(1)}`);
        if (species === 'whaleshark') {                           // 笨重：自己回归得慢，半秒后速度仍明显高于正常上限，靠 GLIDE_RATE 的衰减放行
            for (let i = 1; i < 30; i++) Core.step(w, FRAME_MS, {});
            assert.ok(Math.hypot(f.vx, f.vy) > P.FLEE_CAP * cruise * 1.05, `${species}：半秒后速度 ${Math.hypot(f.vx, f.vy).toFixed(1)} 仍高于正常上限 ${(P.FLEE_CAP * cruise).toFixed(1)}`);
        }
    }
});

test('抓着：指针不在时，平滑后的指针速度（x、y 两个分量）每帧按 HOLD_PV_RATE 衰减、一秒后接近 0——指针再出现时不会带着陈旧的速度冲一下', () => {
    for (const species of ['clown', 'hammer']) {
        const w = world({ random: seeded(4) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        Object.assign(f, { x: 640, y: 360, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
        assert.equal(Core.grab(w, f, f.x, f.y), true);
        for (let i = 0; i < 30; i++) Core.step(w, FRAME_MS, { pointer: { x: 640 + i * 6, y: 360 + i * 4 } });       // 斜着走：x、y 都有速度
        const h = f.held;
        const [vx0, vy0] = [h.pvx, h.pvy];
        assert.ok(vx0 > 100 && vy0 > 60, `${species}：指针速度 (${vx0.toFixed(0)}, ${vy0.toFixed(0)})`);
        Core.step(w, FRAME_MS, { pointer: null });
        const k = 1 - Math.min(1, P.HOLD_PV_RATE * FRAME_MS / 1000);
        assert.ok(Math.abs(h.pvx / vx0 - k) < 1e-9 && Math.abs(h.pvy / vy0 - k) < 1e-9, `${species}：一帧后两个分量都乘 ${k.toFixed(4)}（实际 ${(h.pvx / vx0).toFixed(4)}、${(h.pvy / vy0).toFixed(4)}）`);
        for (let i = 0; i < 60; i++) Core.step(w, FRAME_MS, { pointer: null });
        assert.ok(Math.hypot(h.pvx, h.pvy) < 0.01 * Math.hypot(vx0, vy0), `${species}：一秒后指针速度 ${Math.hypot(h.pvx, h.pvy).toExponential(2)}`);
    }
});

test('抓取：被抓的点按抓取瞬间的姿态记进鱼的本地坐标（鱼已经转过角度也一样），初始的指针速度、角速度、游向都是确定的值', () => {
    // 旧测试都从“鱼朝正东”开始抓，cos = 1、sin = 0，本地坐标公式里带 sin 的项和“除以 cos”都无从暴露。
    for (const species of ['clown', 'tang', 'manta', 'turtle']) {
        for (const ang of [Math.PI / 2, -2.2, 0.7]) {
            const { f, gx, gy } = grabRotated(species, ang);
            const h = f.held;
            const label = `${species} 朝向 ${ang}`;
            same(h.gx, P.HOLD_OFFSET * f.len * 0.2, `${label}：本地 x（沿鱼身）`);
            same(h.gy, P.HOLD_OFFSET * f.len * 0.05, `${label}：本地 y（侧面）`);
            const p = heldAt(f);
            same(p.x, f.x + P.HOLD_OFFSET * (gx - f.x), `${label}：被抓的点在世界里的 x`);
            same(p.y, f.y + P.HOLD_OFFSET * (gy - f.y), `${label}：被抓的点在世界里的 y`);
            assert.deepEqual([h.pvx, h.pvy, h.w, h.aim, h.lastX, h.lastY, h.tail], [0, 0, 0, ang, gx, gy, false], `${label}：抓取瞬间的初始状态`);
        }
    }
});

test('抓着：鱼转身是绕着被抓的那一点转的——指针停在被抓点上、鱼转几十度的过程中，这一点纹丝不动（抓点偏离中线、鱼已经斜着也一样）', () => {
    for (const species of ['clown', 'tang', 'manta', 'turtle']) {
        for (const ang of [Math.PI / 2, -2.2]) {
            const { w, f } = grabRotated(species, ang);
            const h = f.held;
            const target = heldAt(f);
            h.lastX = target.x; h.lastY = target.y;                          // 指针就停在被抓点上：没有速度、没有拉力，鱼只剩转身
            h.aim = 0;                                                      // 想朝正东，要转几十度
            let worst = 0;
            for (let i = 0; i < 40; i++) {
                Core.step(w, FRAME_MS, { pointer: { x: target.x, y: target.y } });
                const now = heldAt(f);
                worst = Math.max(worst, Math.hypot(now.x - target.x, now.y - target.y));
            }
            assert.ok(Math.abs(Core.angleDiff(ang, f.ang)) > 0.3, `${species} 朝向 ${ang}：这段时间里确实转了 ${Math.abs(Core.angleDiff(ang, f.ang)).toFixed(2)} rad`);
            assert.ok(worst < 1e-6, `${species} 朝向 ${ang}：被抓的点最多移动了 ${worst.toExponential(2)} px`);
        }
    }
});

test('抓着：指针一直不动时鱼保持原来的朝向（只围着它在 HOLD_WANDER 以内轻轻摆），不会自己转向正东', () => {
    for (const [species, ang] of [['clown', Math.PI], ['tang', -2.0], ['manta', Math.PI], ['hammer', Math.PI], ['whaleshark', Math.PI]]) {
        const w = world({ random: seeded(4) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        const face = Math.cos(ang) < 0 ? -1 : 1;
        Object.assign(f, { x: 640, y: 360, vx: 0, vy: 0, ang, flip: face, flipTo: face, alpha: 1, state: 'alive', face });
        const gx = f.x + Math.cos(ang) * f.len * 0.1;
        const gy = f.y + Math.sin(ang) * f.len * 0.1;
        assert.equal(Core.grab(w, f, gx, gy), true);
        let worst = 0;
        for (let i = 0; i < 5 * 60; i++) {
            Core.step(w, FRAME_MS, { pointer: { x: gx, y: gy } });
            worst = Math.max(worst, Math.abs(Core.angleDiff(ang, f.ang)));
        }
        assert.ok(worst < P.HOLD_WANDER + 0.2, `${species}：指针不动时朝向最多偏离 ${worst.toFixed(2)} rad（摆动幅度 ${P.HOLD_WANDER}）`);
        assert.equal(f.face, face, `${species}：没有换面`);
    }
});

test('抓着：指针一帧里跳到几千 px 外（换显示器、窗口切换），鱼心的位移仍不超过 HOLD_MAX_SPEED × dt，方向朝着新的指针（x、y 两个分量按同一个比例收）', () => {
    for (const species of ['clown', 'hammer']) {
        const w = world({ random: seeded(4) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        Object.assign(f, { x: 640, y: 360, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
        assert.equal(Core.grab(w, f, f.x, f.y), true);
        for (let i = 0; i < 10; i++) Core.step(w, FRAME_MS, { pointer: { x: 640, y: 360 } });
        const [x0, y0] = [f.x, f.y];
        Core.step(w, 50, { pointer: { x: x0 + 3000, y: y0 + 4000 } });
        const d = Math.hypot(f.x - x0, f.y - y0);
        assert.ok(d <= P.HOLD_MAX_SPEED * 0.05 + 1e-6, `${species}：一帧位移 ${d.toFixed(1)} px，上限 ${P.HOLD_MAX_SPEED * 0.05} px`);
        assert.ok(d > P.HOLD_MAX_SPEED * 0.05 * 0.5, `${species}：确实被拉过去了 ${d.toFixed(1)} px`);
        assert.ok(Math.abs(Math.atan2(f.y - y0, f.x - x0) - Math.atan2(4000, 3000)) < 0.05, `${species}：位移方向朝着新的指针：${Math.atan2(f.y - y0, f.x - x0).toFixed(3)}`);
        assert.ok(Math.hypot(f.vx, f.vy) <= P.HOLD_MAX_SPEED + 1e-6, `${species}：速度 ${Math.hypot(f.vx, f.vy).toFixed(0)}`);
    }
});

test('抓着：指针消失（绳子松了）后鱼心只随速度移动——转身不再绕着旧的抓点转，每帧位移就是速度 × 时间（不会被“拽”一下）', () => {
    for (const species of ['clown', 'manta']) {
        const w = world({ random: seeded(4) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const f = w.fish[0];
        Object.assign(f, { x: 500, y: 450, vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, alpha: 1, state: 'alive', face: 1 });
        const gx = f.x + f.len * 0.3;
        const gy = f.y + f.len * 0.05;
        assert.equal(Core.grab(w, f, gx, gy), true);
        let p = { x: gx, y: gy };
        for (let i = 0; i < 25; i++) { p = { x: p.x + 8, y: p.y }; Core.step(w, FRAME_MS, { pointer: p }); }       // 向东
        for (let i = 0; i < 25; i++) { p = { x: p.x, y: p.y - 8 }; Core.step(w, FRAME_MS, { pointer: p }); }       // 再向北：鱼头要转向北
        const dt = FRAME_MS / 1000;
        let prev = { x: f.x, y: f.y, ang: f.ang };
        let lowest = Infinity;
        let highest = 0;
        let turned = 0;
        for (let i = 0; i < 20; i++) {
            Core.step(w, FRAME_MS, { pointer: null });
            const ratio = Math.hypot(f.x - prev.x, f.y - prev.y) / (Math.hypot(f.vx, f.vy) * dt);
            lowest = Math.min(lowest, ratio);
            highest = Math.max(highest, ratio);
            turned = Math.max(turned, Math.abs(Core.angleDiff(prev.ang, f.ang)));
            prev = { x: f.x, y: f.y, ang: f.ang };
        }
        assert.ok(turned > 0.005, `${species}：松绳后还在转（单帧最多 ${turned.toFixed(4)} rad），否则下面的检查没有意义`);
        // 只受水的阻力时，每帧位移是各子步“衰减后的速度 × 子步时长”之和，比帧末速度 × dt 大约 1.0105 倍，且每一帧都一样；
        // 若转身还绕着旧抓点补偿，鱼心每帧会多出一个与转角成正比的位移（实测小鱼偏 0.5%、蝠鲼最多偏 3.4%）。
        assert.ok(lowest > 1.009 && highest < 1.012, `${species}：每帧位移 ÷ (速度 × dt) 在 ${lowest.toFixed(4)}–${highest.toFixed(4)}（应恒为约 1.0105）`);
    }
});

// ---------- 变异检查补上的缺口（第二批，2026-10-19） ----------

test('黄金轨迹（大型动物贴边）：小锤头鲨、蝠鲼、鲸鲨、海龟被放在四边与四角附近游 20 秒（含时变岸线），轨迹摘要被钉住——边界转向、纵向带上下沿、岸线避让、转身与滑行的每个分支', () => {
    // 这些数字是 2026-10-19 当前实现（行为经属性测试与真实浏览器目检）的摘要，不是外部真值：让“顺手改一个系数”变成一次有意识的更新。
    const kinds = ['hammer', 'manta', 'whaleshark', 'turtle', 'hammer', 'whaleshark', 'manta', 'turtle'];
    const cases = [
        [1280, 720, 31, false, 170178.02427472334],
        [1920, 1080, 32, true, 232645.15833543526],        // 带岸线（2026-10-20 由时变水面改成时变岸线后重新生成；不带岸线的三条与改动之前逐位相同）
        [800, 600, 33, true, 122692.41147390376],
        [800, 600, 34, false, 128479.27915273515],        // 缩放 0.75、没有岸线：小锤头鲨靠“身体不探出屏幕顶”的上限，这里它归“大个子”
        [2560, 1440, 35, false, 324126.94879915495],      // 缩放 1.5：海龟（70 px × 1.5 = 105 px）仍是小鱼，不受屏幕顶上限约束
    ];
    for (const [width, height, seed, withShore, expected] of cases) {
        const w = Core.createWorld({ width, height, random: seeded(seed), lowPower: false });
        Core.reconcile(w, kinds.map((species, i) => ({ id: `g${i}`, species, addedAt: 1 })), { instant: true });
        const spots = [[4, 3], [width - 4, 3], [4, height - 3], [width - 4, height - 3], [width / 2, 2], [width / 2, height - 2], [3, height / 2], [width - 3, height / 2]];
        w.fish.forEach((f, i) => {
            const [x, y] = spots[i % spots.length];
            Object.assign(f, { x, y, vx: (i % 2 ? -1 : 1) * 30, vy: (i % 3 - 1) * 25, alpha: 1, state: 'alive' });
        });
        let acc = 0;
        for (let i = 0; i < 400; i++) {
            Core.step(w, 50, { shore: withShore ? height * 0.8 + 30 * Math.sin(i / 7) : null });
            if (i % 20 === 19) acc += w.fish.reduce((a, f) => a + f.x + f.y + f.vx + f.vy + 50 * f.ang + 20 * (f.xs || 0) + (f.sp || 0), 0);
        }
        assert.ok(Math.abs(acc - expected) < 1e-6, `${width}×${height} 种子 ${seed}：${acc} ≠ ${expected}`);
    }
});

test('侧视大个子缺字段或字段非法时补出合理的值：face 不是 ±1 时按朝向取（朝西 −1、朝东 1），合法时保留；sp 缺失时取速度；坐标与速度保持有限', () => {
    for (const species of SIDE_HEAVY) {
        for (const bad of [undefined, 0, 7, NaN, '1', null]) {
            for (const [ang, expected] of [[Math.PI, -1], [0, 1]]) {
                const { w, f } = solo(species, 5);
                Object.assign(f, { x: 640, y: 360, ang, vx: expected * 50, vy: 0, face: bad, yaw: 0, xs: 1, sp: 50, alpha: 1, state: 'alive' });
                Core.step(w, 50, {});
                assert.equal(f.face, expected, `${species}：face = ${String(bad)}、朝${expected < 0 ? '西' : '东'}时补成 ${expected}`);
            }
        }
        // 合法的 face 要保留——哪怕朝向与它暂时不一致（转身进行中、被外力推了一下）
        for (const [face, ang] of [[1, Math.PI], [-1, 0]]) {
            const { w, f } = solo(species, 5);
            Object.assign(f, { x: 640, y: 360, ang, vx: -face * 50, vy: 0, face, yaw: 0.3, xs: 0.59, sp: 50, alpha: 1, state: 'alive' });
            Core.step(w, 50, {});
            assert.equal(f.face, face, `${species}：face = ${face} 是合法值，不能按朝向改掉`);
        }
        // sp 缺失 → 取当前速度
        const { w, f } = solo(species, 5);
        Object.assign(f, { x: 640, y: 360, ang: 0, vx: 60, vy: 10, face: 1, yaw: 0, xs: 1, alpha: 1, state: 'alive' });
        delete f.sp;
        Core.step(w, 50, {});
        assert.ok(Number.isFinite(f.sp) && f.sp > 20 && f.sp < 120, `${species}：sp 缺失时按速度补出，现为 ${f.sp}`);
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx) && Number.isFinite(f.vy) && Number.isFinite(f.ang) && Number.isFinite(f.xs), `${species}：补出之后坐标与速度有限`);
        // yaw 是负数（坏数据）→ 归 0，身体不被压扁
        {
            const bad = solo(species, 5);
            Object.assign(bad.f, { x: 640, y: 360, ang: 0, vx: 50, vy: 0, face: 1, yaw: -0.5, xs: 1, sp: 50, alpha: 1, state: 'alive' });
            Core.step(bad.w, 50, {});
            assert.ok(bad.f.yaw >= 0 && bad.f.yaw < 0.1 && bad.f.xs > 0.95, `${species}：yaw 为负数时归 0（现为 ${bad.f.yaw}），身体不被压扁（xs ${bad.f.xs}）`);
        }
        // 速度被外界直接改过时，转身中沿游向的速度 sp 按 max(xs, 0.25) 折算：xs 比 0.25 小时按 0.25 算（身体被压得很扁时不会把一点点横向速度放大成天文数字）
        {
            const kick = solo(species, 5);
            const yaw = 0.46;
            Object.assign(kick.f, { x: 640, y: 360, ang: 0, vx: 0, vy: 0, face: 1, yaw, xs: Math.abs(Math.cos(Math.PI * yaw)), sp: 20, alpha: 1, state: 'alive' });
            kick.f.vx = 40;
            Core.step(kick.w, 50, {});
            assert.ok(kick.f.sp > 95 && kick.f.sp < 125, `${species}：转身中被外界给了 40 px/s 的横向速度，sp 按 40 ÷ 0.25 折算后再衰减，实测 ${kick.f.sp.toFixed(1)}（按 0.5 折算只有约 78）`);
        }
    }
});

test('换家间隔 = (HOME_MIN_S + 随机 × HOME_SPAN_S) ÷ clamp(AGILE_LEN ÷ 体长, 0.25, 1)：小鱼与海龟 10–20 秒，大个子按笨重系数拉长，鲸鲨用到 0.25 的下限', () => {
    for (const species of ['clown', 'turtle', 'hammer', 'manta', 'whaleshark']) {
        const spec = Core.speciesById(species);
        const factor = Core.clamp(P.AGILE_LEN / spec.len, 0.25, 1);
        const lo = P.HOME_MIN_S / factor;
        const hi = (P.HOME_MIN_S + P.HOME_SPAN_S) / factor;
        let min = Infinity;
        let max = 0;
        for (let seed = 1; seed <= 80; seed++) {
            const w = world({ random: seeded(seed) });
            const e = entry(species);
            Core.reconcile(w, [e], { instant: true });
            const interval = w.groups[e.id].next - w.time;
            min = Math.min(min, interval);
            max = Math.max(max, interval);
        }
        assert.ok(min >= lo - 1e-9 && max <= hi + 1e-9, `${species}：换家间隔应在 ${lo.toFixed(1)}–${hi.toFixed(1)} 秒，实测 ${min.toFixed(1)}–${max.toFixed(1)}`);
        assert.ok(min < lo + (hi - lo) * 0.15 && max > hi - (hi - lo) * 0.15, `${species}：80 个种子应覆盖到区间两端附近，实测 ${min.toFixed(1)}–${max.toFixed(1)}`);
    }
    assert.equal(Core.clamp(P.AGILE_LEN / Core.speciesById('whaleshark').len, 0.25, 1), 0.25, '鲸鲨的笨重系数确实顶在下限 0.25 上，否则这条测试没有意义');
});

test('松手后滑行中：侧视大个子沿游向的速度 sp 不超过当前的滑行上限 glide，否则画法里的“速度”与实际速度会越拉越开', () => {
    for (const species of SIDE_HEAVY) {
        for (const give of [250, 450, 600]) {
            const w = world({ random: seeded(2) });
            Core.reconcile(w, [entry(species)], { instant: true });
            const f = w.fish[0];
            Object.assign(f, { x: 500, y: 400, alpha: 1, state: 'alive', vx: 0, vy: 0 });
            assert.equal(Core.grab(w, f, f.x, f.y), true);
            Core.release(w, f, { vx: give, vy: 0 });
            let checked = 0;
            for (let i = 0; i < 120; i++) {
                Core.step(w, FRAME_MS, {});
                if (f.glide > 0) { checked++; assert.ok(f.sp <= f.glide + 1e-6, `${species} 甩出 ${give}：第 ${i + 1} 帧 sp ${f.sp.toFixed(2)} 超过 glide ${f.glide.toFixed(2)}`); }
            }
            assert.ok(checked >= 30, `${species} 甩出 ${give}：至少有 30 帧还在滑行（实际 ${checked}），否则这条检查没有意义`);
        }
    }
});

test('水母钟罩（大个子）：鱼心离钟罩中心近于 钟罩半径 + min(0.4 × 体长, BELL_LEN_CAP × 缩放) 时被位置推出去（推出量 = 差值 × min(1, 10 dt)），哪怕钟罩很小；再远就不推', () => {
    // 变异检查：开始偏转的距离（reach）比位置推出的距离（keep）小时，位置推出会被整个跳过——只有钟罩小、鱼大时才会这样。
    for (const species of HEAVY) {
        const run = (d, r = 20) => {
            const w = world({ random: seeded(9) });
            Core.reconcile(w, [entry(species)], { instant: true });
            const f = w.fish[0];
            Object.assign(f, { x: 640, y: 360, alpha: 1, state: 'alive', vx: 0, vy: 0, ang: 0, flip: 1, flipTo: 1, face: 1, sp: 0, yaw: 0, xs: 1 });
            const keep = r + Math.min(f.len * P.BELL_KEEP, P.BELL_LEN_CAP * w.scale);
            Core.step(w, 50, { bells: d === null ? [] : [{ x: 640 - d, y: 360, r }] });
            return { x: f.x, keep };
        };
        const free = run(null);
        for (const inside of [-20, -6]) {
            const pushed = run(free.keep + inside).x - free.x;
            assert.ok(Math.abs(pushed + inside * 0.5) < 0.3, `${species}：离 keep 内 ${-inside} px 时被推出 ${pushed.toFixed(3)} px，应约 ${(-inside * 0.5).toFixed(1)}`);
        }
        const outside = run(free.keep + 6).x - free.x;
        assert.ok(Math.abs(outside) < 0.1, `${species}：在 keep 之外 6 px 不做位置推出（实测偏移 ${outside.toFixed(3)} px）`);
    }
});
