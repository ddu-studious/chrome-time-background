// 水族馆核心：鱼种表、条目白名单与上限、群游、避让、命中与抓取。纯逻辑，不依赖 DOM。
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
const entry = (species, patch = {}) => Object.assign({ id: `e${++seq}`, species, addedAt: 1000 + seq }, patch);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: W, height: H, random: seeded(), lowPower: false }, extra));
const run = (w, seconds, input = {}, stepMs = 50) => {
    for (let t = 0; t < seconds * 1000; t += stepMs) Core.step(w, stepMs, input);
};
const allFinite = w => w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang, f.z, f.alpha].every(Number.isFinite));
const alive = w => w.fish.filter(f => f.state === 'alive' || f.state === 'entering');

test('物种表：恰好 9 种（8 种鱼 + 海龟）、id 唯一、群居/单条/大型分类与色位合法', () => {
    const ids = Core.SPECIES.map(s => s.id);
    assert.deepEqual([...ids].sort(), ['angel', 'clown', 'hammer', 'manta', 'neon', 'puffer', 'tang', 'turtle', 'whaleshark']);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ['neon', 'tang']) {
        const s = Core.speciesById(id);
        assert.equal(s.kind, 'school');
        assert.ok(s.group >= 4, `${id} 群居至少 4 条`);
    }
    for (const id of ['clown', 'puffer', 'angel', 'hammer', 'turtle']) {
        const s = Core.speciesById(id);
        assert.equal(s.kind, 'solo');
        assert.equal(s.group, 1);
    }
    for (const id of ['manta', 'whaleshark']) assert.equal(Core.speciesById(id).kind, 'large');
    for (const s of Core.SPECIES) {
        assert.ok(s.len > 0 && s.speed > 0);
        assert.ok(s.band[0] >= 0 && s.band[1] <= 1 && s.band[0] < s.band[1], `${s.id} 纵向带合法`);
        assert.ok(s.colors.length === 2 && s.colors.every(c => Number.isInteger(c) && c >= 0 && c <= 7), `${s.id} 色位 0..7`);
    }
    assert.equal(Core.speciesById('shark-bomb'), null);
    assert.ok(Object.isFrozen(Core.SPECIES) && Object.isFrozen(P));
});

test('normalizeEntries：只留白名单种类、合法 id 与时间，去重；非数组得到空', () => {
    const good = entry('neon');
    const { entries, dropped } = Core.normalizeEntries([
        good,
        { id: 'x1', species: 'dragon', addedAt: 1 },        // 未知种类
        { id: good.id, species: 'clown', addedAt: 2 },        // 重复 id
        { id: 'bad time', species: 'clown', addedAt: 'now' },   // 非法 id 与时间
        { id: 'x2', species: 'puffer', addedAt: -5 },          // 负时间
        null, 7, 'x',
        { id: 'ok2', species: 'angel', addedAt: 5 },
    ]);
    assert.deepEqual(entries.map(e => e.id), [good.id, 'ok2']);
    assert.equal(dropped, 7, '9 项里只保留 2 项');
    assert.deepEqual(entries[1], { id: 'ok2', species: 'angel', addedAt: 5 });
    for (const bad of [null, undefined, {}, 'x', 3]) assert.deepEqual(Core.normalizeEntries(bad).entries, []);
});

test('normalizeEntries：超过条目上限按先后截断；大型合计最多 2 个；省流量上限更小；渲染条数不超上限', () => {
    const many = Array.from({ length: 30 }, () => entry('clown'));
    assert.equal(Core.normalizeEntries(many).entries.length, P.MAX_ENTRIES);
    assert.equal(Core.normalizeEntries(many, true).entries.length, P.MAX_ENTRIES_LOW);

    const larges = [entry('manta'), entry('whaleshark'), entry('manta'), entry('clown')];
    const kept = Core.normalizeEntries(larges).entries;
    assert.deepEqual(kept.map(e => e.species), ['manta', 'whaleshark', 'clown']);

    const schools = Array.from({ length: 12 }, () => entry('neon'));
    const norm = Core.normalizeEntries(schools).entries;
    assert.ok(Core.renderCount(norm) <= P.MAX_FISH);
    const low = Core.normalizeEntries(schools, true).entries;
    assert.ok(Core.renderCount(low) <= P.MAX_FISH_LOW);
});

test('canAdd：unknown / full / large / render 各自的原因；正常返回 ok', () => {
    assert.deepEqual(Core.canAdd([], 'neon'), { ok: true });
    assert.deepEqual(Core.canAdd([], 'kraken'), { ok: false, reason: 'unknown' });
    const full = Array.from({ length: P.MAX_ENTRIES }, () => entry('clown'));
    assert.deepEqual(Core.canAdd(full, 'clown'), { ok: false, reason: 'full' });
});

test('canAdd：省流量下 6 个单条正好满、再加被拒；第 3 个大型被拒；群居放不下渲染上限被拒', () => {
    const six = Array.from({ length: P.MAX_ENTRIES_LOW }, () => entry('clown'));
    assert.equal(Core.canAdd(six.slice(0, 5), 'clown', true).ok, true);
    assert.equal(Core.canAdd(six, 'clown', true).reason, 'full');

    const twoLarge = [entry('manta'), entry('whaleshark')];
    assert.deepEqual(Core.canAdd(twoLarge, 'manta'), { ok: false, reason: 'large' });
    assert.equal(Core.canAdd(twoLarge, 'clown').ok, true);

    // 7 个群居（每个 5 条）= 35；再加一个群居 = 40，刚好；再加就超过 40
    const schools = Array.from({ length: 7 }, () => entry('neon'));
    assert.equal(Core.renderCount(schools), 35);
    assert.equal(Core.canAdd(schools, 'neon').ok, true);
    const eight = schools.concat(entry('neon'));
    assert.deepEqual(Core.canAdd(eight, 'neon'), { ok: false, reason: 'render' });
});

test('capacity：条目数、渲染条数、大型数与各自的上限；省流量用较低的上限；与 canAdd 的口径一致', () => {
    assert.deepEqual(Core.capacity([], false), { entries: 0, maxEntries: P.MAX_ENTRIES, fish: 0, maxFish: P.MAX_FISH, large: 0, maxLarge: P.MAX_LARGE, lowPower: false });
    const list = [entry('neon'), entry('clown'), entry('manta')];
    assert.deepEqual(Core.capacity(list, false), { entries: 3, maxEntries: 12, fish: 5 + 1 + 1, maxFish: 40, large: 1, maxLarge: 2, lowPower: false });
    assert.deepEqual(Core.capacity(list, true), { entries: 3, maxEntries: 6, fish: 7, maxFish: 16, large: 1, maxLarge: 2, lowPower: true });
    // 与 canAdd 同口径：条目数取数组长度，大型数、渲染条数不算未知种类
    const messy = [entry('neon'), { id: 'x', species: 'kraken', addedAt: 1 }];
    assert.equal(Core.capacity(messy, false).entries, 2);
    assert.equal(Core.capacity(messy, false).fish, 5);
    assert.deepEqual(Core.capacity(null, false), Core.capacity([], false));
    assert.deepEqual(Core.capacity(undefined), Core.capacity([], false));
    // 上限与 canAdd 的拒绝点一致：capacity 说满了，canAdd 一定拒绝
    const full = Array.from({ length: P.MAX_ENTRIES }, () => entry('clown'));
    const c = Core.capacity(full, false);
    assert.equal(c.entries >= c.maxEntries, true);
    assert.equal(Core.canAdd(full, 'clown').ok, false);
    const twoLarge = [entry('manta'), entry('whaleshark')];
    assert.equal(Core.capacity(twoLarge).large >= Core.capacity(twoLarge).maxLarge, true);
    assert.equal(Core.canAdd(twoLarge, 'manta').reason, 'large');
});

test('reconcile：群居条目生成多条同 entry 的鱼，单条生成一条；instant 直接 alive，否则 entering', () => {
    const w = world();
    const school = entry('neon');
    const solo = entry('clown');
    Core.reconcile(w, [school, solo], { instant: true });
    const inSchool = w.fish.filter(f => f.entry === school.id);
    assert.equal(inSchool.length, Core.speciesById('neon').group);
    assert.equal(w.fish.filter(f => f.entry === solo.id).length, 1);
    assert.ok(w.fish.every(f => f.state === 'alive' && f.alpha === 1));
    assert.ok(w.fish.every(f => f.x >= 0 && f.x <= W && f.y >= 0 && f.y <= H), 'instant 时都在屏幕内');

    const w2 = world();
    Core.reconcile(w2, [solo]);
    assert.equal(w2.fish[0].state, 'entering');
    run(w2, P.ENTER_S + 0.5);
    assert.equal(w2.fish[0].state, 'alive');
    assert.equal(w2.fish[0].alpha, 1);
});

test('reconcile：from 指定入场点；重复调用不重复生成；移除条目后淡出并从世界消失', () => {
    const w = world();
    const a = entry('puffer');
    Core.reconcile(w, [a], { from: { x: 1200, y: 700 } });
    assert.ok(Math.hypot(w.fish[0].x - 1200, w.fish[0].y - 700) < 60, '从指定点附近入场');
    Core.reconcile(w, [a]);
    Core.reconcile(w, [a]);
    assert.equal(w.fish.length, 1, '重复整理不重复生成');

    Core.reconcile(w, []);
    assert.equal(w.fish[0].state, 'leaving');
    run(w, P.LEAVE_S + 0.5);
    assert.equal(w.fish.length, 0);
});

test('reconcile：省流量时按渲染上限生成，不会生成超出的鱼', () => {
    const w = world({ lowPower: true });
    const entries = Array.from({ length: 6 }, () => entry('neon'));
    Core.reconcile(w, entries, { instant: true });
    assert.ok(w.fish.length <= P.MAX_FISH_LOW);
    assert.ok(w.fish.length > 0);
});

test('step：长时间推进后鱼始终在屏幕附近，坏输入不产生 NaN', () => {
    const w = world();
    const entries = [entry('neon'), entry('tang'), entry('clown'), entry('puffer'), entry('angel'), entry('hammer'), entry('manta'), entry('whaleshark')];
    Core.reconcile(w, entries, { instant: true });
    const margin = P.MARGIN + 200;
    for (let t = 0; t < 120; t += 0.05) {
        Core.step(w, 50, {});
        assert.ok(allFinite(w));
        for (const f of w.fish) assert.ok(f.x > -margin && f.x < W + margin && f.y > -margin && f.y < H + margin, `鱼跑出屏幕：${f.x},${f.y}`);
    }
    Core.step(w, 0, {});
    Core.step(w, -5, {});
    Core.step(w, NaN, {});
    Core.step(w, 50, { pointer: { x: NaN, y: 3 } });
    Core.step(w, 50, { pointer: null, bells: [{ x: NaN, y: 1, r: 1 }, null, { x: 5, y: 5, r: -3 }] });
    assert.ok(allFinite(w));
});

test('纵向分布：多个种子下 120 秒——不挤在最上方（< 35%）、不沉在底部（最下三分之一 < 60%）、中段有鱼，并且绝大多数时间待在自己种类的纵向带里', () => {
    const kinds = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark', 'clown', 'angel', 'puffer', 'neon'];
    for (const seed of [7, 11, 23]) {
        const w = world({ random: seeded(seed) });
        Core.reconcile(w, kinds.map(k => entry(k)), { instant: true });
        run(w, 10);                                      // 先让群游稳定
        let top = 0; let a = 0; let b = 0; let c = 0; let total = 0; let strayed = 0;
        for (let t = 0; t < 120; t += 0.05) {
            Core.step(w, 50, {});
            for (const f of w.fish) {
                const v = f.y / H;
                const band = Core.speciesById(f.species).band;
                total++;
                if (v < 0.2) top++;
                if (v < 1 / 3) a++; else if (v < 2 / 3) b++; else c++;
                if (v < band[0] - 0.12 || v > band[1] + 0.12) strayed++;
            }
        }
        assert.ok(top / total < 0.35, `种子 ${seed}：最上方 20% 占比 ${(top / total).toFixed(2)}`);
        assert.ok(c / total < 0.6, `种子 ${seed}：最下三分之一占比 ${(c / total).toFixed(2)}`);
        assert.ok(b / total >= 0.2, `种子 ${seed}：中段占比 ${(b / total).toFixed(2)}`);
        assert.ok(a / total >= 0.04, `种子 ${seed}：上三分之一至少偶尔有鱼（大型与锤头鲨的带延伸到那里）：${(a / total).toFixed(3)}`);
        assert.ok(strayed / total < 0.05, `种子 ${seed}：离开自己的带超过 0.12 屏高的时间占比 ${(strayed / total).toFixed(3)}`);
    }
});

test('纵向带：被惊到带外（太高或太低）的鱼，没有“家”也会自己游回本种的带里', () => {
    for (const [name, startY] of [['太高', 0.12 * H], ['太低', 0.98 * H]]) {
        const w = world();
        const e = entry('clown');                                   // 带 [0.5, 0.92]
        Core.reconcile(w, [e], { instant: true });
        delete w.groups[e.id];
        const f = w.fish[0];
        f.x = 640; f.y = startY; f.vx = 46; f.vy = 0; f.ang = 0;
        let sum = 0; let n = 0;
        for (let t = 0; t < 30; t += 0.05) {
            Core.step(w, 50, {});
            if (t >= 20) { sum += f.y / H; n++; }
        }
        const mean = sum / n;
        assert.ok(mean > 0.42 && mean < 1.0, `${name}：最后 10 秒平均高度 ${mean.toFixed(2)}，应回到带 [0.5, 0.92] 附近`);
    }
});

test('群游：同一条目的鱼不会无限发散；不同条目不被强制聚拢', () => {
    const w = world();
    const school = entry('neon');
    const other = entry('tang');
    Core.reconcile(w, [school, other], { instant: true });
    run(w, 60);
    let sum = 0; let n = 0;
    for (let t = 0; t < 30; t += 0.05) {
        Core.step(w, 50, {});
        const mine = w.fish.filter(f => f.entry === school.id);
        for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) { sum += Math.hypot(mine[i].x - mine[j].x, mine[i].y - mine[j].y); n++; }
    }
    assert.ok(sum / n < W * 0.5, `同群平均间距 ${(sum / n).toFixed(0)}`);
    const a = w.fish.filter(f => f.entry === school.id);
    const b = w.fish.filter(f => f.entry === other.id);
    assert.ok(a.length > 0 && b.length > 0);
});

test('避让光标：快速移动的指针靠近时鱼获得远离的速度；慢速指针不惊动', () => {
    const make = () => {
        const w = world();
        const e = entry('puffer');
        Core.reconcile(w, [e], { instant: true });
        const f = w.fish[0];
        f.x = 600; f.y = 360; f.vx = 0; f.vy = 0;
        return { w, f };
    };
    const fast = make();
    // 指针从左边快速逼近（停在鱼左侧 45 px，不穿过鱼）
    for (const x of [440, 480, 520, 555]) Core.step(fast.w, 16, { pointer: { x, y: 360 } });
    assert.ok(fast.f.vx > 0, `鱼应被推向右侧远离指针：vx=${fast.f.vx}`);

    const slow = make();
    let sx = 570;
    for (let i = 0; i < 6; i++) { sx += 0.2; Core.step(slow.w, 16, { pointer: { x: sx, y: 360 } }); }
    const speedSlow = Math.hypot(slow.f.vx, slow.f.vy);
    const speedFast = Math.hypot(fast.f.vx, fast.f.vy);
    assert.ok(speedFast > speedSlow, '快指针比慢指针更惊动');
});

test('避让钟罩：落在钟罩半径内的鱼被推出去；即使它的“家”就在钟罩正中，之后也始终不再进入钟罩', () => {
    const w = world();
    const e = entry('clown');
    Core.reconcile(w, [e], { instant: true });
    const f = w.fish[0];
    const bell = { x: 640, y: 400, r: 60 };
    f.x = 650; f.y = 405;
    const g = w.groups[e.id];
    g.hx = bell.x; g.hy = bell.y; g.next = 1e9;          // 家就在钟罩中心：鱼一直想往里游
    let worst = Infinity;
    for (let t = 0; t < 30; t += 0.05) {
        Core.step(w, 50, { bells: [bell] });
        if (t > 2) worst = Math.min(worst, Math.hypot(f.x - bell.x, f.y - bell.y));
    }
    assert.ok(worst >= bell.r, `鱼进入了钟罩：最近 ${worst.toFixed(1)} < ${bell.r}`);
});

test('群游聚合：没有“家”时散在一小片里的同群鱼靠聚合与对齐保持在一起，不会各奔东西', () => {
    const w = world();
    const school = entry('neon');
    Core.reconcile(w, [school], { instant: true });
    delete w.groups[school.id];                          // 去掉“家”：只剩分离、对齐、聚合
    const mine = w.fish.filter(f => f.entry === school.id);
    mine.forEach((f, i) => { f.x = 640 + Math.cos(i * 1.3) * 50; f.y = 400 + Math.sin(i * 1.3) * 50; });
    run(w, 25);
    let sum = 0; let n = 0;
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) { sum += Math.hypot(mine[i].x - mine[j].x, mine[i].y - mine[j].y); n++; }
    assert.ok(sum / n < 160, `无家时平均间距 ${(sum / n).toFixed(0)}`);
});

test('边界：软边界把朝外游的鱼拉回来；位置硬夹在屏幕外一圈之内；远在天边的鱼一步就被夹回', () => {
    const w = world();
    const e = entry('clown');
    Core.reconcile(w, [e], { instant: true });
    delete w.groups[e.id];
    const f = w.fish[0];
    f.x = 10; f.y = 400; f.vx = -45; f.vy = 0; f.ang = Math.PI;
    let minX = Infinity;
    for (let t = 0; t < 4; t += 0.05) { Core.step(w, 50, {}); minX = Math.min(minX, f.x); }
    assert.ok(minX > -20, `软边界没拉回：最左到 ${minX.toFixed(1)}`);

    f.x = 99999; f.y = -99999;
    Core.step(w, 50, {});
    assert.ok(f.x <= W + P.MARGIN + f.len + 1 && f.y >= -P.MARGIN - f.len - 1, `硬夹紧失效：${f.x},${f.y}`);
});

test('step：非法或非正的时间步什么都不做（世界时间与鱼的位置都不变）', () => {
    const w = world();
    Core.reconcile(w, [entry('clown'), entry('tang')], { instant: true });
    run(w, 1);
    const snap = JSON.stringify(w.fish.map(f => [f.x, f.y, f.vx, f.vy]));
    const time = w.time;
    for (const bad of [0, -5, NaN, Infinity, 'x', undefined]) Core.step(w, bad, {});
    assert.equal(w.time, time);
    assert.equal(JSON.stringify(w.fish.map(f => [f.x, f.y, f.vx, f.vy])), snap);
    Core.step(w, 1000, {});        // 过长的步按 50 ms 算
    assert.ok(Math.abs(w.time - time - P.MAX_DT) < 1e-9);
});

test('命中与抓取：alive 可命中；leaving、held、过淡的不命中；抓住后跟随指针，松手恢复游动', () => {
    const w = world();
    const e = entry('hammer');
    Core.reconcile(w, [e], { instant: true });
    const f = w.fish[0];
    f.x = 500; f.y = 300; f.vx = 0; f.vy = 0;
    assert.equal(Core.hitTest(w, 500, 300), f);
    assert.equal(Core.hitTest(w, 5, 5), null);
    assert.equal(Core.hitTest(w, NaN, 1), null);

    assert.equal(Core.grab(w, f, 500, 300), true);
    assert.equal(f.state, 'held');
    assert.equal(Core.hitTest(w, 500, 300), null, '被抓着的不再命中');
    assert.equal(Core.grab(w, f, 500, 300), false, '已被抓着不能再抓');
    for (let i = 0; i < 40; i++) Core.step(w, 50, { pointer: { x: 900, y: 200 } });
    assert.ok(Math.hypot(f.x - 900, f.y - 200) < 40, `抓着时跟随指针：${f.x},${f.y}`);

    Core.release(w, f, { vx: 0, vy: 0 });
    assert.equal(f.state, 'alive');
    run(w, 2);
    assert.ok(allFinite(w));

    f.alpha = 0.1;
    assert.equal(Core.hitTest(w, f.x, f.y), null, '淡入未出来的不命中');
});

test('同时只能抓一条；松手带走的速度有上限，坏速度当作 0', () => {
    const w = world();
    Core.reconcile(w, [entry('hammer'), entry('angel')], { instant: true });
    const [a, b] = w.fish;
    a.x = 300; a.y = 300; b.x = 800; b.y = 400;
    assert.equal(Core.grab(w, a, 300, 300), true);
    assert.equal(Core.grab(w, b, 800, 400), false, '已经抓着一条，不能再抓第二条');
    Core.release(w, a, { vx: 99999, vy: 0 });
    assert.ok(Math.hypot(a.vx, a.vy) <= P.THROW_MAX + 1e-9, `松手速度 ${Math.hypot(a.vx, a.vy)}`);
    assert.equal(Core.grab(w, b, 800, 400), true, '放开之后又可以抓');
    Core.release(w, b, { vx: NaN, vy: 5 });
    assert.equal(b.vx, 0);
    assert.equal(b.vy, 0);
    Core.release(w, b, { vx: 1, vy: 1 });        // 没被抓着时松手：无事发生
    assert.equal(b.vx, 0);
});

test('命中：重叠时取 z 更大（更近）的；dismiss 之后不再命中并在淡出后消失', () => {
    const w = world();
    const e1 = entry('clown');
    const e2 = entry('angel');
    Core.reconcile(w, [e1, e2], { instant: true });
    const [a, b] = w.fish;
    a.x = b.x = 640; a.y = b.y = 360; a.z = 0.4; b.z = 0.9;
    assert.equal(Core.hitTest(w, 640, 360), b);
    Core.dismiss(w, e2.id);
    assert.equal(b.state, 'leaving');
    assert.equal(Core.hitTest(w, 640, 360), a);
    run(w, P.LEAVE_S + 0.5);
    assert.ok(!w.fish.includes(b));
    assert.ok(w.fish.includes(a));
});

test('dismiss：整个群居条目的鱼一起离开，被抓着的那条也一起消失', () => {
    const w = world();
    const school = entry('neon');
    Core.reconcile(w, [school], { instant: true });
    const held = w.fish[0];
    Core.grab(w, held, held.x, held.y);
    Core.dismiss(w, school.id);
    assert.ok(w.fish.every(f => f.state === 'leaving'));
    run(w, P.LEAVE_S + 0.5, { pointer: { x: 10, y: 10 } });
    assert.equal(w.fish.length, 0);
});

test('确定性：同一个随机种子产生同一份轨迹', () => {
    const trace = () => {
        const w = world({ random: seeded(42) });
        Core.reconcile(w, [{ id: 'a', species: 'neon', addedAt: 1 }, { id: 'b', species: 'manta', addedAt: 2 }], { instant: true });
        run(w, 20);
        return w.fish.map(f => [f.x.toFixed(3), f.y.toFixed(3), f.ang.toFixed(3)].join());
    };
    assert.deepEqual(trace(), trace());
});

test('resize：鱼按比例跟着屏幕缩放且保持有限数值', () => {
    const w = world();
    Core.reconcile(w, [entry('tang'), entry('clown')], { instant: true });
    run(w, 5);
    Core.resize(w, W / 2, H / 2);
    run(w, 5);
    assert.ok(allFinite(w));
    assert.equal(w.width, W / 2);
    for (const f of w.fish) assert.ok(f.x > -400 && f.x < W / 2 + 400 && f.y > -400 && f.y < H / 2 + 400);
});

// ---------- 到家后不原地打转（2026-10-17 回看时发现：单条/大型鱼到“家”之后围着家 2–3 px 绕圈，朝向每秒转 1~2 圈） ----------

const SPIN_RATE = 3;            // rad/s：超过就算在“转圈”（正常转弯远低于这个数）
const SOLO_AND_LARGE = ['clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'];

/**
 * 推进 seconds 秒（60 fps 步长，与真实 rAF 一致）并观察：
 * spin 鱼头朝向转得过快的鱼·帧占比；vspin 速度方向转得过快的占比（只压住朝向的转速而鱼仍在原地抖动，这一项会露馅）；
 * idle 几乎没在移动（低于巡航速度 30%）的占比；meanSpeed 平均速度；maxHome 离“家”最远的距离。
 */
function observe(w, seconds, { fromSeconds = 0, home = null } = {}) {
    const stepMs = 1000 / 60;
    const dtS = stepMs / 1000;
    const prevAng = new Map(w.fish.map(f => [f.id, f.ang]));
    const prevVel = new Map(w.fish.map(f => [f.id, Math.atan2(f.vy, f.vx)]));
    const last = new Map(w.fish.map(f => [f.id, { x: f.x, y: f.y }]));
    const path = new Map();
    let n = 0; let spin = 0; let vspin = 0; let idle = 0; let maxHome = 0; let measured = 0;
    for (let t = 0; t < seconds * 1000; t += stepMs) {
        Core.step(w, stepMs, {});
        const counting = t / 1000 >= fromSeconds;
        for (const f of w.fish) {
            const a = prevAng.get(f.id); prevAng.set(f.id, f.ang);
            const va = Math.atan2(f.vy, f.vx); const pv = prevVel.get(f.id); prevVel.set(f.id, va);
            const p = last.get(f.id); last.set(f.id, { x: f.x, y: f.y });
            if (!counting) continue;
            n++;
            if (Math.abs(Core.angleDiff(a, f.ang)) / dtS > SPIN_RATE) spin++;
            if (Math.abs(Core.angleDiff(pv, va)) / dtS > SPIN_RATE) vspin++;
            const moved = Math.hypot(f.x - p.x, f.y - p.y);
            const cruise = Core.speciesById(f.species).speed * w.scale * (1 - P.Z_SPEED + P.Z_SPEED * f.z);
            if (moved / dtS < 0.3 * cruise) idle++;
            path.set(f.id, (path.get(f.id) || 0) + moved);
            if (home) maxHome = Math.max(maxHome, Math.hypot(f.x - home.hx, f.y - home.hy));
        }
        if (counting) measured += dtS;
    }
    const speeds = [...path.values()].map(d => d / measured);
    const count = Math.max(1, n);
    return { spin: spin / count, vspin: vspin / count, idle: idle / count, meanSpeed: speeds.reduce((a, b) => a + b, 0) / Math.max(1, speeds.length), maxHome };
}

const pct = x => `${(x * 100).toFixed(0)}%`;

test('到家后不原地打转：单条与大型鱼换了多个种子，40 秒里朝向与速度方向转得过快（> 3 rad/s）的时间都不到 5%，几乎不停在原地，平均速度不低于巡航的 60%', () => {
    for (const species of SOLO_AND_LARGE) {
        const spec = Core.speciesById(species);
        for (const seed of [1, 2, 3, 5, 7, 11]) {
            const w = world({ random: seeded(seed) });
            Core.reconcile(w, [entry(species)], { instant: true });
            const z = w.fish[0].z;
            const r = observe(w, 40);
            assert.ok(r.spin < 0.05, `${species} 种子 ${seed}：朝向转圈占比 ${pct(r.spin)} 应小于 5%`);
            assert.ok(r.vspin < 0.05, `${species} 种子 ${seed}：速度方向转圈占比 ${pct(r.vspin)} 应小于 5%`);
            assert.ok(r.idle < 0.2, `${species} 种子 ${seed}：几乎不动的时间占 ${pct(r.idle)} 应小于 20%`);
            const cruise = spec.speed * w.scale * (1 - P.Z_SPEED + P.Z_SPEED * z);
            assert.ok(r.meanSpeed > 0.6 * cruise, `${species} 种子 ${seed}：平均速度 ${r.meanSpeed.toFixed(1)} px/s 应不低于巡航速度 ${cruise.toFixed(1)} 的 60%`);
        }
    }
});

test('家一直不换也不转圈：把“家”钉住 60 秒，鱼到家附近后继续缓慢漫游（不原地转、不停住、不飘远）', () => {
    for (const species of SOLO_AND_LARGE) {
        for (const seed of [2, 5, 11]) {
            const w = world({ random: seeded(seed) });
            const e = entry(species);
            Core.reconcile(w, [e], { instant: true });
            const group = w.groups[e.id];
            group.next = Infinity;                       // 不让它换家
            const r = observe(w, 60, { fromSeconds: 20, home: group });
            assert.ok(r.spin < 0.05, `${species} 种子 ${seed}：钉住家后朝向转圈占比 ${pct(r.spin)}`);
            assert.ok(r.vspin < 0.05, `${species} 种子 ${seed}：钉住家后速度方向转圈占比 ${pct(r.vspin)}`);
            assert.ok(r.idle < 0.2, `${species} 种子 ${seed}：钉住家后几乎不动的时间占 ${pct(r.idle)}`);
            assert.ok(r.maxHome > 8, `${species} 种子 ${seed}：离家最远只有 ${r.maxHome.toFixed(1)} px，鱼停在家里没有漫游`);
            assert.ok(r.maxHome < P.HOME_NEAR * w.scale * 1.6, `${species} 种子 ${seed}：离家最远 ${r.maxHome.toFixed(0)} px，仍应在家附近`);
        }
    }
});

test('成群的鱼不受影响：两种群居鱼 40 秒里同样几乎不转圈，且群仍然聚在一起', () => {
    for (const species of ['neon', 'tang']) {
        const w = world({ random: seeded(5) });
        Core.reconcile(w, [entry(species)], { instant: true });
        const r = observe(w, 40);
        assert.ok(r.spin < 0.05, `${species} 朝向转圈占比 ${pct(r.spin)}`);
        assert.ok(r.vspin < 0.05, `${species} 速度方向转圈占比 ${pct(r.vspin)}`);
        const cx = w.fish.reduce((sum, f) => sum + f.x, 0) / w.fish.length;
        const cy = w.fish.reduce((sum, f) => sum + f.y, 0) / w.fish.length;
        for (const f of w.fish) assert.ok(Math.hypot(f.x - cx, f.y - cy) < 520, `${species} 群里的鱼没有各奔东西`);
    }
});

test('漫游相位：每个条目生成时定下、之后不变；同一条目的鱼共用它，不同条目大多不同', () => {
    const w = world({ random: seeded(9) });
    const entries = Array.from({ length: 6 }, () => entry('clown'));
    Core.reconcile(w, entries, { instant: true });
    const before = entries.map(e => w.groups[e.id].wp);
    assert.ok(before.every(v => Number.isFinite(v) && v >= 0 && v < 1));
    assert.ok(new Set(before).size > 1);
    assert.ok(before.some(v => v < 0.5) && before.some(v => v >= 0.5), '顺时针与逆时针的条目都有（这批种子下）');
    run(w, 60);
    assert.deepEqual(entries.map(e => w.groups[e.id].wp), before);
});

// ---------- 翻面：朝左游时身体要翻过来（背鳍始终朝上）。原来按 cos(朝向) 的正负一帧翻过去：每次转身背鳍都会跳到另一侧，
// ---------- 在竖直附近来回晃的鱼会一帧一闪。现在目标面带滞回、当前面（−1…1）缓动过去，换面时身体像打了个滚。 ----------

const rad = deg => deg * Math.PI / 180;
const FRAME = 1 / 60;

test('updateFlip：目标面带滞回——朝向刚越过竖直线不换面，越过 FLIP_HYST 才换；对称，且只在越过后才动', () => {
    const f = { ang: 0, flip: 1, flipTo: 1 };
    const beyond = Math.asin(P.FLIP_HYST) * 180 / Math.PI;           // 朝向越过竖直线多少度时 |cos| 刚好等于 FLIP_HYST
    // 朝右一路转到竖直线以后一小段：还是朝右那一面
    for (const deg of [0, 45, 80, 90, 90 + beyond - 1]) {
        f.ang = rad(deg); Core.updateFlip(f, FRAME);
        assert.equal(f.flipTo, 1, `${deg.toFixed(1)}° 仍是朝右的一面`);
    }
    assert.equal(f.flip, 1, '没换面就不动');
    // 越过滞回：换成朝左的一面
    f.ang = rad(90 + beyond + 1); Core.updateFlip(f, FRAME);
    assert.equal(f.flipTo, -1);
    // 同样的幅度往回晃：不会马上换回来
    for (const deg of [90 + beyond + 1, 100, 90, 90 - beyond + 1]) {
        f.ang = rad(deg); Core.updateFlip(f, FRAME);
        assert.equal(f.flipTo, -1, `${deg.toFixed(1)}° 仍是朝左的一面`);
    }
    f.ang = rad(90 - beyond - 1); Core.updateFlip(f, FRAME);
    assert.equal(f.flipTo, 1);
    // 朝上一侧（−90° 附近）对称
    const g = { ang: rad(-80), flip: 1, flipTo: 1 };
    for (const deg of [-90, -90 - beyond + 1]) { g.ang = rad(deg); Core.updateFlip(g, FRAME); assert.equal(g.flipTo, 1, `${deg.toFixed(1)}°`); }
    g.ang = rad(-90 - beyond - 1); Core.updateFlip(g, FRAME);
    assert.equal(g.flipTo, -1);
});

test('updateFlip：当前面向目标面缓动——单调、不过冲、换面经过 0、一直朝左就稳定在 −1', () => {
    const f = { ang: Math.PI, flip: 1, flipTo: 1 };
    const seen = [f.flip];
    for (let i = 0; i < 90; i++) { Core.updateFlip(f, FRAME); seen.push(f.flip); }
    assert.equal(f.flipTo, -1);
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1] + 1e-12, '单调向 −1');
    assert.ok(seen.every(v => v >= -1 - 1e-12 && v <= 1 + 1e-12), '不过冲');
    assert.ok(seen.some(v => Math.abs(v) < 0.3), '换面要经过接近 0 的中间态（身体打个滚），而不是一帧翻过去');
    assert.ok(f.flip < -0.99, `朝左游 1.5 秒后稳定：${f.flip}`);
    // 坏的时间步不改变状态
    const before = { ...f };
    Core.updateFlip(f, NaN); Core.updateFlip(f, -1); Core.updateFlip(f, 0);
    assert.equal(f.flip, before.flip);
    // 缺字段的鱼（旧数据）按朝向补出
    const old = { ang: Math.PI };
    Core.updateFlip(old, FRAME);
    assert.ok(Number.isFinite(old.flip) && old.flipTo === -1);
});

test('翻面状态：新鱼的当前面与目标面等于朝向决定的那一面；推进中始终在 −1…1，每帧变化有上限（背鳍不会突然跳边）', () => {
    for (const seed of [1, 2, 3]) {
        const w = world({ random: seeded(seed) });
        Core.reconcile(w, ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'].map(s => entry(s)), { instant: true });
        for (const f of w.fish) {
            const side = Math.cos(f.ang) < 0 ? -1 : 1;
            assert.equal(f.flipTo, side);
            assert.equal(f.flip, side);
        }
        const prev = new Map(w.fish.map(f => [f.id, f.flip]));
        const maxStep = 2 * P.FLIP_RATE * FRAME * 1.001;
        for (let i = 0; i < 60 * 60; i++) {
            Core.step(w, 1000 / 60, {});
            for (const f of w.fish) {
                assert.ok(f.flip >= -1 - 1e-9 && f.flip <= 1 + 1e-9, `flip 越界 ${f.flip}`);
                assert.ok(Math.abs(f.flip - prev.get(f.id)) <= maxStep, `${f.species} 一帧变了 ${Math.abs(f.flip - prev.get(f.id)).toFixed(3)}，超过 ${maxStep.toFixed(3)}`);
                prev.set(f.id, f.flip);
            }
        }
    }
});

test('翻面不闪烁：多个种子 60 秒，目标面换边的最短间隔 ≥ 0.12 秒（原来按 cos 正负翻，最短只有 17 毫秒）', () => {
    let minGap = Infinity; let flips = 0;
    for (const seed of [1, 2, 3, 5, 7, 11]) {
        const w = world({ random: seeded(seed) });
        Core.reconcile(w, ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'].map(s => entry(s)), { instant: true });
        const state = new Map(w.fish.map(f => [f.id, { side: f.flipTo, at: 0 }]));
        for (let i = 0; i < 60 * 60; i++) {
            Core.step(w, 1000 / 60, {});
            const now = (i + 1) / 60;
            for (const f of w.fish) {
                const s = state.get(f.id);
                if (f.flipTo !== s.side) { minGap = Math.min(minGap, now - s.at); flips++; s.side = f.flipTo; s.at = now; }
            }
        }
    }
    assert.ok(flips > 20, `应当确实有转身（${flips} 次），否则这个测试没测到东西`);
    assert.ok(minGap >= 0.12, `换边最短间隔 ${minGap.toFixed(3)} 秒`);
});

test('被抓着的鱼也会翻面：指针把它往左拖，朝向转向左边后当前面稳定在 −1', () => {
    const w = world();
    Core.reconcile(w, [entry('angel')], { instant: true });
    const f = w.fish[0];
    f.x = 700; f.y = 300; f.vx = 0; f.vy = 0; f.ang = 0; f.flip = 1; f.flipTo = 1;
    assert.equal(Core.grab(w, f, 700, 300), true);
    for (let i = 0; i < 90; i++) Core.step(w, 1000 / 60, { pointer: { x: 700 - i * 5, y: 300 } });
    assert.ok(Math.cos(f.ang) < -0.9, `朝向已转向左：${f.ang}`);
    assert.equal(f.flipTo, -1);
    assert.ok(f.flip < -0.9, `被抓着时当前面也要跟上：${f.flip}`);
});

// ---------- 捞起动画：拖进网兜松手后，鱼游向网兜、缩小，先保持清晰再淡出（原来只是在原地淡出 0.35 秒，像凭空消失） ----------

const FRAME_MS = 1000 / 60;

test('捞起：dismiss 带落点时，鱼被拉向落点、边游边缩，先保持清晰再淡出，最后移除；单条与成群都一样', () => {
    for (const species of ['angel', 'neon']) {
        const w = world();
        const e = entry(species);
        Core.reconcile(w, [e], { instant: true });
        w.fish.forEach((f, i) => { f.x = 200 + i * 40; f.y = 150; f.vx = 0; f.vy = 0; });
        const target = { x: 640, y: 640 };
        const before = w.fish.map(f => Math.hypot(f.x - target.x, f.y - target.y));
        Core.dismiss(w, e.id, { to: target });
        assert.ok(w.fish.every(f => f.state === 'leaving' && f.leaveTo));

        run(w, 0.15, {}, FRAME_MS);
        for (const f of w.fish) {
            assert.equal(f.alpha, 1, `${species}：前 ${P.SCOOP_FADE_AT * 100}% 的时间保持清晰，让人看清鱼被捞起来`);
            assert.ok(f.scoopT > 0.2 && f.scoopT < P.SCOOP_FADE_AT, `进度 ${f.scoopT}`);
        }
        run(w, 0.3, {}, FRAME_MS);
        w.fish.forEach((f, i) => {
            const d = Math.hypot(f.x - target.x, f.y - target.y);
            assert.ok(d < before[i] * 0.2, `${species}：游近了 ${d.toFixed(0)} / ${before[i].toFixed(0)}`);
            assert.ok(d < P.SCOOP_SPREAD * w.scale + 24, `${species}：聚在落点附近 ${d.toFixed(0)}`);
            assert.ok(f.alpha < 1, '后半段开始淡出');
        });
        run(w, P.SCOOP_S, {}, FRAME_MS);
        assert.equal(w.fish.length, 0, `${species}：动画结束后移除`);
    }
});

test('捞起：成群的鱼落点互相错开（不叠成一条），且都在落点附近 SCOOP_SPREAD 范围内', () => {
    const w = world();
    const e = entry('neon');
    Core.reconcile(w, [e], { instant: true });
    const target = { x: 640, y: 640 };
    Core.dismiss(w, e.id, { to: target });
    const points = w.fish.map(f => f.leaveTo);
    assert.equal(points.length, 5);
    const half = P.SCOOP_SPREAD * w.scale / 2;
    for (const p of points) assert.ok(Math.abs(p.x - target.x) <= half + 1e-9 && Math.abs(p.y - target.y) <= half + 1e-9, `${p.x},${p.y} 超出范围`);
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) > 1, `第 ${i}、${j} 条的落点重叠`);
    }
});

test('捞起：没有落点、落点非法、或落点缺字段时，仍是原来的原地淡出（LEAVE_S），不产生 NaN', () => {
    for (const options of [undefined, {}, { to: null }, { to: 5 }, { to: { x: NaN, y: 3 } }, { to: { x: 3 } }, { to: { x: Infinity, y: 0 } }]) {
        const w = world();
        const e = entry('clown');
        Core.reconcile(w, [e], { instant: true });
        const f = w.fish[0];
        Core.dismiss(w, e.id, options);
        assert.equal(f.state, 'leaving');
        assert.equal(f.leaveTo, undefined, JSON.stringify(options));
        run(w, P.LEAVE_S / 2, {}, FRAME_MS);
        assert.ok(f.alpha > 0 && f.alpha < 1, '淡出进行中');
        assert.ok(allFinite(w));
        run(w, P.LEAVE_S + 0.1, {}, FRAME_MS);
        assert.equal(w.fish.length, 0);
    }
});

test('捞起：被抓着的鱼也能带落点离开；离开的鱼不能再被命中或抓住', () => {
    const w = world();
    const e = entry('hammer');
    Core.reconcile(w, [e], { instant: true });
    const f = w.fish[0];
    f.x = 500; f.y = 300;
    assert.equal(Core.grab(w, f, 500, 300), true);
    Core.dismiss(w, e.id, { to: { x: 700, y: 620 } });
    assert.equal(f.state, 'leaving');
    assert.equal(f.held, null);
    assert.equal(Core.hitTest(w, f.x, f.y), null);
    assert.equal(Core.grab(w, f, f.x, f.y), false);
    run(w, 0.3, { pointer: { x: 50, y: 50 } }, FRAME_MS);
    assert.ok(Math.hypot(f.x - 700, f.y - 620) < 60, `${f.x},${f.y}`);
});

test('捞起：同一个种子、同样的落点，轨迹确定', () => {
    const trace = () => {
        const w = world({ random: seeded(77) });
        const e = entry('tang');
        Core.reconcile(w, [e], { instant: true });
        run(w, 3, {}, FRAME_MS);
        Core.dismiss(w, e.id, { to: { x: 600, y: 650 } });
        run(w, 0.3, {}, FRAME_MS);
        return w.fish.map(f => [f.x.toFixed(4), f.y.toFixed(4), f.scoopT.toFixed(4)].join()).join('|');
    };
    assert.equal(trace(), trace());
});

// ---------- 互动子项目（戳、拉尾、喂食）对核心的三处小改动 ----------
// 改动之前先钉住现状：没有玩法输入时，游动必须与改动之前一致（黄金数字取自改动之前的核心）。

const GOLDEN_SPECIES = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'];
function goldenSwim(input = {}) {
    const w = world({ random: seeded(11) });
    Core.reconcile(w, GOLDEN_SPECIES.map((species, i) => ({ id: `g${i}`, species, addedAt: 1 })), { instant: true });
    const bells = [{ x: 640, y: 360, r: 70 }];
    for (let i = 0; i < 400; i++) {
        const t = i * 0.05;
        const pointer = i % 40 < 20 ? { x: 300 + 200 * Math.cos(t), y: 300 + 150 * Math.sin(t * 1.3) } : null;
        Core.step(w, 50, Object.assign({ pointer, bells }, input));
    }
    return w;
}
const snapshot = w => JSON.stringify(w.fish.map(f => [f.x, f.y, f.vx, f.vy, f.ang, f.flip]));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ≠ ${expected}`);

test('黄金轨迹：没有吸引点时，8 种鱼 20 秒后的位置、速度、朝向与改动之前一致（互动子项目不得改变现有游动）', () => {
    const w = goldenSwim();
    assert.equal(w.fish.length, 16);
    const gold = {
        g0: [705.344486133521, 588.2347657994214, 65.14135651571006, 19.42880201542292, -5.980011358017851],
        g2: [345.43035968153856, 489.02791584275315, 28.180906534799124, -24.612685108283955, 11.8368789206577],
        g5: [224.88224393111503, 402.22460528978957, 48.7691695714345, -9.270831817105435, 12.325458801927024],
        g7: [230.27177569410733, 397.94394729097576, 9.20894274624747, -18.955318066811326, 5.151750429387654],
    };
    for (const [entryId, expected] of Object.entries(gold)) {
        const f = w.fish.find(item => item.entry === entryId);
        ['x', 'y', 'vx', 'vy', 'ang'].forEach((key, i) => near(f[key], expected[i], `${entryId}.${key}`));
    }
    near(w.fish.reduce((a, f) => a + f.x + f.y + f.vx + f.vy + f.ang, 0), 17469.65719267365, '全部鱼的总和');
});

test('黄金轨迹：普通抓取（不是拉尾）时，被抓着的鱼的位置、速度与朝向与改动之前一致', () => {
    const w = world({ random: seeded(5) });
    Core.reconcile(w, [entry('hammer', { id: 'h0' })], { instant: true });
    const f = w.fish[0];
    f.x = 400; f.y = 300; f.vx = 0; f.vy = 0; f.ang = 0.3; f.alpha = 1; f.state = 'alive';
    assert.equal(Core.grab(w, f, 400, 300), true);
    for (let i = 0; i < 40; i++) Core.step(w, 50, { pointer: { x: 400 + i * 12, y: 300 - i * 4 }, bells: [] });
    [['x', 862.8571428571429], ['y', 145.71428571428572], ['vx', 239.99999999999955], ['vy', -80.00000000000011], ['ang', -0.3217505530114353], ['flip', 1]]
        .forEach(([key, expected]) => near(f[key], expected, key));
});

test('cruiseSpeed：种类速度 × 视口缩放 × 深度系数；未知种类为 0', () => {
    const w = world();
    Core.reconcile(w, [entry('clown')], { instant: true });
    const f = w.fish[0];
    near(Core.cruiseSpeed(w, f), Core.speciesById('clown').speed * w.scale * (1 - P.Z_SPEED + P.Z_SPEED * f.z), 'cruise');
    assert.equal(Core.cruiseSpeed(w, { species: 'kraken', z: 1 }), 0);
});

const lone = (species, seed = 3) => {
    const w = world({ random: seeded(seed) });
    Core.reconcile(w, [entry(species)], { instant: true });
    const f = w.fish[0];
    f.x = 500; f.y = 400; f.alpha = 1; f.state = 'alive';
    return { w, f };
};
const lure = (x, y, extra = {}) => Object.assign({ x, y, reach: 400, weight: 2.5, boost: 1.5 }, extra);

test('吸引点：没有、为空或全是坏数据时轨迹与没有玩法时逐位一致；远在范围外的吸引点同样不起作用', () => {
    const base = snapshot(goldenSwim());
    const bad = [undefined, [], null, 'x', [null], [{}], [{ x: NaN, y: 1, reach: 1, weight: 1, boost: 1 }], [{ x: 1, y: 1, reach: 0, weight: 1, boost: 1 }], [{ x: 1, y: 1, reach: -5, weight: 1, boost: 1 }]];
    for (const attractors of bad) assert.equal(snapshot(goldenSwim({ attractors })), base, JSON.stringify(attractors));
    const a = lone('clown');
    const b = lone('clown');
    for (let i = 0; i < 100; i++) { Core.step(a.w, 50, {}); Core.step(b.w, 50, { attractors: [lure(5000, 5000)] }); }
    assert.equal(snapshot(a.w), snapshot(b.w));
});

test('吸引点：范围内的鱼被拉向它——8 个种子里 10 秒内都游到离它不到一个体长的地方，没有吸引点的对照组做不到', () => {
    let reached = 0;
    let controlReached = 0;
    for (let seed = 1; seed <= 8; seed++) {
        const t = lone('clown', seed);
        const c = lone('clown', seed);
        let best = Infinity;
        let bestControl = Infinity;
        for (let i = 0; i < 200; i++) {
            Core.step(t.w, 50, { attractors: [lure(700, 400)] });
            Core.step(c.w, 50, {});
            best = Math.min(best, Math.hypot(t.f.x - 700, t.f.y - 400));
            bestControl = Math.min(bestControl, Math.hypot(c.f.x - 700, c.f.y - 400));
        }
        if (best < t.f.len) reached++;
        if (bestControl < t.f.len) controlReached++;
    }
    assert.equal(reached, 8, `8 个种子里只有 ${reached} 个游到了吸引点`);
    assert.ok(controlReached <= 2, `对照组有 ${controlReached} 个碰巧也到了，这个测试不能证明吸引`);
});

test('吸引点：靠近时游得更快（boost 放大期望速度），瞬时速度不超过 巡航速度 × FLEE_CAP', () => {
    const { w, f } = lone('clown', 2);
    const cruise = Core.cruiseSpeed(w, f);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < 40; i++) {
        Core.step(w, 50, { attractors: [lure(900, 400, { reach: 600 })] });
        const s = Math.hypot(f.vx, f.vy);
        sum += s;
        max = Math.max(max, s);
    }
    assert.ok(sum / 40 > cruise * 1.15, `前 2 秒平均速度 ${sum / 40} 应明显高于巡航 ${cruise}`);
    assert.ok(max <= cruise * P.FLEE_CAP + 1e-6, `速度 ${max} 超过上限`);
});

test('吸引点：权重夹在 0–3、速度倍数夹在 0.5–2.5，夸张的数字不放大', () => {
    const run2 = attractor => {
        const { w } = lone('puffer', 6);
        for (let i = 0; i < 120; i++) Core.step(w, 50, { attractors: [attractor] });
        return snapshot(w);
    };
    assert.equal(run2(lure(800, 380, { weight: 99 })), run2(lure(800, 380, { weight: 3 })));
    assert.equal(run2(lure(800, 380, { boost: 99 })), run2(lure(800, 380, { boost: 2.5 })));
    assert.equal(run2(lure(800, 380, { boost: 0 })), run2(lure(800, 380, { boost: 0.5 })));
    assert.equal(run2(lure(800, 380, { weight: -4 })), run2(lure(800, 380, { weight: 0 })));
});

test('吸引点：同时有几个在范围内时，朝最近的那个游（与它们的先后顺序无关）', () => {
    const toward = order => {
        const { w, f } = lone('clown', 5);
        const near1 = lure(650, 400);       // 150 px
        const far1 = lure(500, 700, { reach: 600 });   // 300 px，在另一个方向
        for (let i = 0; i < 40; i++) Core.step(w, 50, { attractors: order ? [near1, far1] : [far1, near1] });
        return { dNear: Math.hypot(f.x - 650, f.y - 400), dFar: Math.hypot(f.x - 500, f.y - 700) };
    };
    for (const order of [true, false]) {
        const r = toward(order);
        assert.ok(r.dNear < 80 && r.dFar > 250, `顺序 ${order}：离近的 ${r.dNear.toFixed(0)}，离远的 ${r.dFar.toFixed(0)}`);
    }
});

test('吸引点只拉游着的鱼：离开中的鱼不受影响，被抓着的鱼只跟指针', () => {
    const leaving = attractors => {
        const { w } = lone('clown', 9);
        Core.dismiss(w, w.fish[0].entry);
        for (let i = 0; i < 4; i++) Core.step(w, 50, { attractors });
        return snapshot(w);
    };
    assert.equal(leaving([lure(520, 400)]), leaving(undefined));
    const held = attractors => {
        const { w, f } = lone('clown', 9);
        assert.equal(Core.grab(w, f, 500, 400), true);
        for (let i = 0; i < 20; i++) Core.step(w, 50, { pointer: { x: 520, y: 380 }, attractors });
        return snapshot(w);
    };
    assert.equal(held([lure(900, 400)]), held(undefined));
});

// 拉尾几何：鱼在 (600, 300) 朝东，抓它后半身（尾巴在西侧）的一点（本地 y 偏移 ly 个体长），再沿 axis 方向、按 dir 的正负拖约 200 px/s，最后让指针停住一会儿。
function dragTail(options, dir, { seed = 4, ly = 0, axis = 'x', still = 20 } = {}) {
    const { w, f } = lone('hammer', seed);
    f.x = 600; f.y = 300; f.vx = 0; f.vy = 0; f.ang = 0; f.flip = 1; f.flipTo = 1;
    const gx0 = f.x - f.len * 0.3;
    const gy0 = 300 + f.len * ly;
    assert.equal(Core.grab(w, f, gx0, gy0, options), true);
    let pointer = { x: gx0, y: gy0 };
    for (let i = 0; i < 40; i++) {
        pointer = axis === 'x' ? { x: gx0 + dir * i * 10, y: gy0 } : { x: gx0, y: gy0 + dir * i * 10 };
        Core.step(w, 50, { pointer });
    }
    for (let i = 0; i < still; i++) Core.step(w, 50, { pointer });
    return { w, f, pointer };
}
// 被抓的那一点现在在世界里的位置（拉尾时它应该就在指针下）
const heldPoint = f => {
    const c = Math.cos(f.ang);
    const s = Math.sin(f.ang);
    return { x: f.x + f.held.gx * c - f.held.gy * s, y: f.y + f.held.gx * s + f.held.gy * c };
};
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('抓取：held.tail 只在 tail 选项为真时为真（没有选项、tail:false 都是普通抓取）', () => {
    for (const [options, expected] of [[undefined, false], [{}, false], [{ tail: false }, false], [{ tail: true }, true]]) {
        const { w, f } = lone('clown');
        assert.equal(Core.grab(w, f, f.x, f.y, options), true);
        assert.equal(f.held.tail, expected);
    }
});

test('拉尾：向西拖（朝着尾巴所在的一侧）时鱼头仍朝东，鱼身拖在指针东边，被抓的那一点就在指针下', () => {
    const { f, pointer } = dragTail({ tail: true }, -1);
    assert.ok(Math.cos(f.ang) > 0.95, `朝向 ${f.ang}`);
    assert.ok(Math.abs(f.x - pointer.x - 0.24 * f.len) < 0.03 * f.len, `鱼心应在指针东边 0.24 个体长，实际 ${(f.x - pointer.x) / f.len}`);
    assert.ok(gap(heldPoint(f), pointer) < 3, `被抓的点离指针 ${gap(heldPoint(f), pointer)} px`);
});

test('拉尾：向东拖（朝着鱼头的方向）时，鱼绕被抓的点转过来，鱼头朝西、鱼身拖在指针西边，被抓的点就在指针下', () => {
    const { f, pointer } = dragTail({ tail: true }, 1);
    assert.ok(Math.cos(f.ang) < -0.95, `朝向 ${f.ang}`);
    assert.ok(Math.abs(pointer.x - f.x - 0.24 * f.len) < 0.03 * f.len, `鱼心应在指针西边 0.24 个体长，实际 ${(pointer.x - f.x) / f.len}`);
    assert.ok(gap(heldPoint(f), pointer) < 3, `被抓的点离指针 ${gap(heldPoint(f), pointer)} px`);
});

test('拉尾：抓的点不在鱼的中线上、拖的方向是竖直的，也一样——鱼头朝与指针运动相反的方向，被抓的点始终在指针下', () => {
    const east = dragTail({ tail: true }, 1, { ly: 0.2 });
    assert.ok(gap(heldPoint(east.f), east.pointer) < 3, `向东拖：离指针 ${gap(heldPoint(east.f), east.pointer)} px`);
    const south = dragTail({ tail: true }, 1, { axis: 'y' });
    assert.ok(Math.sin(south.f.ang) < -0.95, `向南拖鱼头应朝北，朝向 ${south.f.ang}`);
    assert.ok(gap(heldPoint(south.f), south.pointer) < 3, `向南拖：离指针 ${gap(heldPoint(south.f), south.pointer)} px`);
    const north = dragTail({ tail: true }, -1, { axis: 'y', ly: -0.15 });
    assert.ok(Math.sin(north.f.ang) > 0.95, `向北拖鱼头应朝南，朝向 ${north.f.ang}`);
    assert.ok(gap(heldPoint(north.f), north.pointer) < 3, `向北拖：离指针 ${gap(heldPoint(north.f), north.pointer)} px`);
});

test('拉尾：转身过程中鱼心每帧的位移不超过抓取的速度上限，坐标始终有限；普通抓取向东拖，鱼头朝东', () => {
    const { w, f } = lone('hammer', 4);
    f.x = 600; f.y = 300; f.ang = 0;
    assert.equal(Core.grab(w, f, f.x - f.len * 0.3, 300, { tail: true }), true);
    let last = { x: f.x, y: f.y };
    for (let i = 0; i < 40; i++) {
        Core.step(w, 50, { pointer: { x: f.x - f.len * 0.3 + i * 10, y: 300 } });
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.ang));
        assert.ok(Math.hypot(f.x - last.x, f.y - last.y) <= P.HOLD_MAX_SPEED * 0.05 + 1e-6);
        last = { x: f.x, y: f.y };
    }
    assert.ok(Math.cos(dragTail(undefined, 1).f.ang) > 0.95, '普通抓取：鱼头朝运动的方向');
});

test('拉尾：指针中途消失再出现，不会因为位移被当成一次极大的速度而让鱼头乱转', () => {
    const { w, f } = lone('hammer', 4);
    f.x = 600; f.y = 300; f.ang = 0;
    const grabX = f.x - f.len * 0.3;
    assert.equal(Core.grab(w, f, grabX, 300, { tail: true }), true);
    for (let i = 0; i < 10; i++) Core.step(w, 50, { pointer: { x: grabX, y: 300 } });
    for (let i = 0; i < 4; i++) Core.step(w, 50, { pointer: null });
    const before = f.ang;
    Core.step(w, 50, { pointer: { x: grabX + 400, y: 300 } });      // 指针回来时已经在 400 px 外
    assert.ok(Math.abs(f.held.pvx) < 1e-6 && Math.abs(Core.angleDiff(before, f.ang)) < 0.05, `速度 ${f.held.pvx}，朝向变化 ${Core.angleDiff(before, f.ang)}`);
});
