const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');
const Play = require('../js/aquarium-play-core.js');

const P = Play.PARAMS;

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
const entry = (species, extra = {}) => Object.assign({ id: `e${++seq}`, species, addedAt: 1 }, extra);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: 1280, height: 720, random: seeded(), lowPower: false }, extra));
const cruise = (w, f) => Core.cruiseSpeed(w, f);

/** 一条停在 (x, y) 朝东的鱼（已淡入、静止），其余条目的鱼由 others 给出。返回 { w, play, fish }。 */
function tank(species = 'clown', { others = [], extra = {}, x = 500, y = 400 } = {}) {
    const w = world(extra);
    Core.reconcile(w, [entry(species), ...others.map(([s]) => entry(s))], { instant: true });
    const fish = w.fish[0];
    Object.assign(fish, { x, y, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' });
    return { w, play: Play.create(), fish };
}
/** 把别的鱼放在离 (cx, cy) 为 d 的正东方，静止。 */
function place(f, cx, cy, d) { Object.assign(f, { x: cx + d, y: cy, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' }); }
const run = (w, play, seconds, dtMs = 50) => { for (let i = 0; i < seconds * 1000 / dtMs; i++) { Core.step(w, dtMs); Play.step(play, w, dtMs); } };

// ---------- 创建与基本约束 ----------

test('create：一份空状态，所有计数为 0，随机不用 Math.random（没有 world.random 也不会被调用）', () => {
    const play = Play.create();
    assert.deepEqual(Play.counts(play), { ripples: 0, bubbles: 0, pellets: 0, fed: 0, pulls: 0 });
    assert.equal(play.time, 0);
});

// ---------- 戳 ----------

test('戳：被戳的鱼朝远离点击处的方向窜出去，速度约为巡航速度的 POKE_DASH 倍，嘴边冒 2–3 个泡，点击处出现一圈涟漪', () => {
    const { w, play, fish } = tank('clown');
    const r = Play.poke(play, w, fish, { x: fish.x - 20, y: fish.y });          // 点在鱼身西侧 20 px
    assert.equal(r.ok, true);
    assert.ok(Math.abs(Math.hypot(fish.vx, fish.vy) - cruise(w, fish) * P.POKE_DASH) < 1e-6);
    assert.ok(fish.vx > 0 && Math.abs(fish.vy) < 1e-6, '点在西边，向东窜');
    const c = Play.counts(play);
    assert.equal(c.ripples, 1);
    assert.ok(c.bubbles >= 2 && c.bubbles <= 3, `泡 ${c.bubbles}`);
    const mouth = { x: fish.x + Math.cos(fish.ang) * fish.len * 0.45, y: fish.y + Math.sin(fish.ang) * fish.len * 0.45 };
    for (const b of play.bubbles) assert.ok(Math.hypot(b.x - mouth.x, b.y - mouth.y) < 8 * w.scale, '泡在嘴边');
});

test('戳：点在鱼心附近（不到 POKE_CENTER 个体长）时没有“远离”的方向，朝鱼头方向窜', () => {
    const { w, play, fish } = tank('hammer');
    fish.ang = Math.PI / 2;                                                    // 朝南
    assert.equal(Play.poke(play, w, fish, { x: fish.x, y: fish.y }).ok, true);
    assert.ok(Math.abs(fish.vx) < 1e-6 && fish.vy > 0, `速度 ${fish.vx}, ${fish.vy}`);
    const t = tank('hammer');
    t.fish.ang = 0;
    assert.equal(Play.poke(t.play, t.w, t.fish, { x: t.fish.x + 0.5 * P.POKE_CENTER * t.fish.len, y: t.fish.y }).ok, true);
    assert.ok(t.fish.vx > 0, '刚好在阈值之内仍朝鱼头');
});

test('冲击波：范围内的别的鱼被推离点击处，越近越强；范围外不动；大型鱼只有 SHOCK_LARGE 倍的反应', () => {
    const { w, play, fish } = tank('clown', { others: [['puffer'], ['angel'], ['manta'], ['tang']] });
    const [near, mid] = ['puffer', 'angel'].map(id => w.fish.find(f => f.species === id));
    const big = w.fish.find(f => f.species === 'manta');
    const outside = w.fish.filter(f => f.species === 'tang');
    for (const f of w.fish) if (f !== fish) place(f, 500, 400, 5000);
    place(near, 500, 400, 30);
    place(mid, 500, 400, 0.6 * (P.SHOCK_R * w.scale + mid.len));
    place(big, 500, 400, 20);
    const r = Play.poke(play, w, fish, { x: 500, y: 400 });
    assert.equal(r.ok, true);
    assert.equal(r.pushed, 3);
    const speed = f => Math.hypot(f.vx, f.vy);
    const expected = (f, d, factor = 1) => (1 - d / (P.SHOCK_R * w.scale + f.len)) * factor * cruise(w, f) * P.SHOCK_DASH;
    assert.ok(near.vx > 0 && Math.abs(speed(near) - expected(near, 30)) < 1e-6, `近处 ${speed(near)}`);
    assert.ok(Math.abs(speed(mid) - expected(mid, 0.6 * (P.SHOCK_R * w.scale + mid.len))) < 1e-6, `中间 ${speed(mid)}`);
    assert.ok(Math.abs(speed(big) - expected(big, 20, P.SHOCK_LARGE)) < 1e-6, `大型鱼 ${speed(big)}`);
    assert.ok(speed(near) > speed(mid));
    for (const f of outside) assert.equal(speed(f), 0, '范围外的鱼不动');
});

test('冲击波：成群的小鱼同样被推开；离开中和被抓着的鱼不受影响；正好压在点击处的鱼朝自己的鱼头方向被推', () => {
    const { w, play, fish } = tank('clown', { others: [['neon'], ['hammer'], ['puffer']] });
    for (const f of w.fish) if (f !== fish) place(f, 500, 400, 5000);
    const school = w.fish.filter(f => f.species === 'neon');
    school.forEach((f, i) => place(f, 500, 400, 40 + i * 8));
    const hammer = w.fish.find(f => f.species === 'hammer');
    place(hammer, 500, 400, 30); hammer.state = 'leaving';
    const puffer = w.fish.find(f => f.species === 'puffer');
    place(puffer, 500, 400, 0);
    puffer.ang = Math.PI / 2;
    Play.poke(play, w, fish, { x: 500, y: 400 });
    for (const f of school) assert.ok(f.vx > 0, '小鱼被推开');
    assert.equal(Math.hypot(hammer.vx, hammer.vy), 0);
    assert.ok(Math.abs(puffer.vx) < 1e-9 && puffer.vy > 0, `压在点击处的鱼朝鱼头（南）方向，速度 ${puffer.vx}, ${puffer.vy}`);
});

test('戳：同一条鱼 0.4 秒内不重复响应（不产生涟漪、泡、速度变化），别的鱼不受影响，过了冷却可以再戳', () => {
    const { w, play, fish } = tank('clown', { others: [['angel']] });
    const other = w.fish.find(f => f.species === 'angel');
    place(other, 500, 400, 600);
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true);
    run(w, play, 0.3);
    const before = JSON.stringify([Play.counts(play), fish.vx, fish.vy, play.bubbles]);
    assert.deepEqual(Play.poke(play, w, fish, { x: 480, y: 400 }), { ok: false, reason: 'cooldown' });
    assert.equal(JSON.stringify([Play.counts(play), fish.vx, fish.vy, play.bubbles]), before, '被拒绝的戳什么都不改');
    assert.equal(Play.poke(play, w, other, { x: 1000, y: 400 }).ok, true, '别的鱼不受冷却影响');
    run(w, play, 0.15);
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true, '过了冷却可以再戳');
});

test('戳：坏输入与不能戳的鱼被拒绝且什么都不改（不抛错）', () => {
    const { w, play, fish } = tank('clown');
    const before = JSON.stringify([Play.counts(play), fish.vx, fish.vy, [...play.pokedAt]]);
    const bad = [
        [null, { x: 1, y: 1 }], [fish, null], [fish, { x: NaN, y: 1 }], [fish, { x: 1, y: Infinity }], [fish, {}], [{ x: 1 }, { x: 1, y: 1 }],
        [Object.assign({}, fish), { x: 1, y: 1 }],                              // 不在 world 里的鱼
    ];
    for (const [f, at] of bad) assert.deepEqual(Play.poke(play, w, f, at), { ok: false, reason: 'invalid' });
    for (const state of ['leaving', 'held']) {
        const saved = fish.state;
        fish.state = state;
        assert.deepEqual(Play.poke(play, w, fish, { x: 480, y: 400 }), { ok: false, reason: 'state' });
        fish.state = saved;
    }
    assert.equal(JSON.stringify([Play.counts(play), fish.vx, fish.vy, [...play.pokedAt]]), before);
});

test('戳：淡入中的鱼也可以戳；涟漪最多 3 圈（省流量 1 圈）、泡最多 24 个（省流量 8 个），超出时丢最老的', () => {
    const { w, play, fish } = tank('clown');
    fish.state = 'entering';
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true);
    fish.state = 'alive';
    for (let i = 0; i < 12; i++) { play.pokedAt.clear(); assert.equal(Play.poke(play, w, fish, { x: 400 + i, y: 400 }).ok, true); }
    assert.equal(play.ripples.length, P.MAX_RIPPLES);
    assert.deepEqual(play.ripples.map(r => r.x), [409, 410, 411], '留下的是最近的 3 圈');
    assert.ok(play.bubbles.length <= P.MAX_BUBBLES);
    const low = tank('clown', { extra: { lowPower: true } });
    for (let i = 0; i < 12; i++) { low.play.pokedAt.clear(); Play.poke(low.play, low.w, low.fish, { x: 400 + i, y: 400 }); }
    assert.equal(low.play.ripples.length, P.MAX_RIPPLES_LOW);
    assert.ok(low.play.bubbles.length <= P.MAX_BUBBLES_LOW);
    assert.equal(low.play.bubbles.length, P.MAX_BUBBLES_LOW, '泡多到顶满');
});

test('涟漪与泡：涟漪 RIPPLE_S 后消失；泡一路上浮、左右摇摆，到寿命或出了画面就消失', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    const ys = play.bubbles.map(b => b.y);
    run(w, play, 0.3);
    assert.equal(play.ripples.length, 1);
    play.bubbles.forEach((b, i) => assert.ok(b.y < ys[i] - 3, '泡在上浮'));
    run(w, play, P.RIPPLE_S);
    assert.equal(play.ripples.length, 0);
    run(w, play, 4);
    assert.equal(play.bubbles.length, 0);
    const edge = tank('clown', { y: 10 });
    Play.poke(edge.play, edge.w, edge.fish, { x: 480, y: 10 });
    run(edge.w, edge.play, 1.4);                                              // 短于泡的最短寿命，所以消失只能是因为出了画面
    assert.ok(edge.play.bubbles.every(b => b.y > -20), '出了画面的泡被丢掉');
});

test('泡：上浮时左右轻轻摇摆（水平位置不是一条直线，幅度也不大）', () => {
    const { w, play, fish } = tank('clown', { y: 600 });
    Play.poke(play, w, fish, { x: 480, y: 600 });
    const track = play.bubbles.map(() => []);
    for (let i = 0; i < 20; i++) { Play.step(play, w, 50); play.bubbles.forEach((b, j) => track[j].push(b.x)); }
    for (const xs of track) {
        const range = Math.max(...xs) - Math.min(...xs);
        assert.ok(range > 0.5 * w.scale && range < 8 * w.scale, `水平摆动范围 ${range}`);
    }
});

test('step：dt 非法或太小什么都不做；单步最长 50 ms；冷却记录过期后被清掉', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    for (const bad of [NaN, Infinity, undefined, 'x', 0, -5, 0.01]) { Play.step(play, w, bad); assert.equal(play.time, 0, String(bad)); }
    Play.step(play, w, 5000);
    assert.ok(Math.abs(play.time - 0.05) < 1e-12);
    assert.equal(play.pokedAt.size, 1);
    for (let i = 0; i < 9; i++) Play.step(play, w, 50);
    assert.equal(play.pokedAt.size, 0, '0.4 秒后冷却记录被清掉');
});

test('resize：涟漪与泡的位置按比例缩放，坏比例被忽略', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    const r = { ...play.ripples[0] };
    const b = { ...play.bubbles[0] };
    Play.resize(play, 0, 1); Play.resize(play, NaN, 1); Play.resize(play, 1, -2);
    assert.deepEqual([play.ripples[0].x, play.ripples[0].y], [r.x, r.y]);
    Play.resize(play, 2, 0.5);
    assert.deepEqual([play.ripples[0].x, play.ripples[0].y], [r.x * 2, r.y * 0.5]);
    assert.deepEqual([play.bubbles[0].x, play.bubbles[0].y], [b.x * 2, b.y * 0.5]);
});

test('确定性：同一个种子、同样的操作，两份玩法状态逐位一致；随机只来自 world.random', () => {
    const play1 = () => {
        const { w, play, fish } = tank('clown', { others: [['tang'], ['angel']] });
        for (let i = 0; i < 6; i++) { Play.poke(play, w, w.fish[i % w.fish.length], { x: 300 + i * 80, y: 380 }); run(w, play, 0.5); }
        return JSON.stringify([play.ripples, play.bubbles, [...play.pokedAt], w.fish.map(f => [f.x, f.y, f.vx, f.vy])]);
    };
    assert.equal(play1(), play1());
});

test('随机戳 60 秒：数量始终有界，所有数字有限（并且真的戳了很多次，不是空跑）', () => {
    const { w, play } = tank('clown', { others: [['tang'], ['neon'], ['hammer'], ['manta'], ['puffer'], ['angel']] });
    const rnd = seeded(99);
    let accepted = 0;
    for (let i = 0; i < 1200; i++) {
        if (i % 7 === 0 && Play.poke(play, w, w.fish[Math.floor(rnd() * w.fish.length)], { x: rnd() * 1280, y: rnd() * 720 }).ok) accepted++;
        Core.step(w, 50, { pointer: null });
        Play.step(play, w, 50);
        const c = Play.counts(play);
        assert.ok(c.ripples <= P.MAX_RIPPLES && c.bubbles <= P.MAX_BUBBLES && play.pokedAt.size <= w.fish.length);
    }
    assert.ok(accepted >= 100, `被接受的戳 ${accepted} 次`);
    assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
    assert.ok(play.bubbles.every(b => [b.x, b.y, b.r].every(Number.isFinite)));
});

// ---------- 喂食 ----------

const pelletsOf = play => play.pellets.map(p => [p.x, p.y]);

test('撒饲料（从上部落下）：默认 6 粒，横向在中间 60% 里，高度在屏幕上部，每粒各自有 id、下沉速度、相位', () => {
    const { w, play } = tank('clown');
    const r = Play.sprinkle(play, w);
    assert.deepEqual(r, { ok: true, count: P.SPRINKLE_COUNT });
    assert.equal(play.pellets.length, 6);
    for (const p of play.pellets) {
        assert.ok(p.x >= w.width * P.SPRINKLE_X0 && p.x <= w.width * P.SPRINKLE_X1, `x ${p.x}`);
        assert.ok(Math.abs(p.y - w.height * P.SPRINKLE_Y) <= 5 * w.scale + 1e-9, `y ${p.y}`);
        assert.ok(p.sink >= P.PELLET_SINK * w.scale * 0.85 && p.sink <= P.PELLET_SINK * w.scale * 1.15);
    }
    assert.equal(new Set(play.pellets.map(p => p.id)).size, 6);
    assert.ok(new Set(play.pellets.map(p => Math.round(p.x))).size >= 4, '横向是随机散开的，不是一条线');
});

test('撒饲料（落在指定处）：每粒在 ±DROP_SPREAD 个像素内散开（乘视口缩放），始终在画布里；可指定粒数', () => {
    const { w, play } = tank('clown');
    assert.deepEqual(Play.sprinkle(play, w, { x: 600, y: 300, count: 4 }), { ok: true, count: 4 });
    for (const p of play.pellets) {
        assert.ok(Math.abs(p.x - 600) <= P.DROP_SPREAD * w.scale && Math.abs(p.y - 300) <= P.DROP_SPREAD * w.scale);
    }
    const edge = tank('clown');
    Play.sprinkle(edge.play, edge.w, { x: 3, y: edge.w.height - 2, count: 12 });
    for (const p of edge.play.pellets) assert.ok(p.x >= 0 && p.y <= edge.w.height && p.x <= edge.w.width && p.y >= 0);
});

test('撒饲料：0.8 秒冷却内被拒绝（什么都不改）；同屏满了返回 busy；只放得下几粒时只落那几粒；省流量上限 8', () => {
    const { w, play } = tank('clown');
    assert.equal(Play.sprinkle(play, w).ok, true);
    const before = JSON.stringify(pelletsOf(play));
    assert.deepEqual(Play.sprinkle(play, w), { ok: false, reason: 'cooldown' });
    assert.equal(JSON.stringify(pelletsOf(play)), before);
    for (let i = 0; i < 15; i++) Play.step(play, w, 50);                      // 0.75 秒：还在冷却
    assert.equal(Play.sprinkle(play, w).reason, 'cooldown');
    Play.step(play, w, 50);                                                    // 0.8 秒
    assert.equal(Play.sprinkle(play, w).ok, true);
    while (play.pellets.length < P.MAX_PELLETS - 3) { play.lastSprinkle = -Infinity; Play.sprinkle(play, w, { count: 1 }); }
    play.lastSprinkle = -Infinity;
    assert.deepEqual(Play.sprinkle(play, w), { ok: true, count: 3 }, '放得下 3 粒就只落 3 粒');
    assert.equal(play.pellets.length, P.MAX_PELLETS);
    play.lastSprinkle = -Infinity;
    assert.deepEqual(Play.sprinkle(play, w), { ok: false, reason: 'busy' });
    const low = tank('clown', { extra: { lowPower: true } });
    assert.deepEqual(Play.sprinkle(low.play, low.w), { ok: true, count: 6 });
    low.play.lastSprinkle = -Infinity;
    assert.deepEqual(Play.sprinkle(low.play, low.w), { ok: true, count: 2 });
    assert.equal(low.play.pellets.length, P.MAX_PELLETS_LOW);
});

test('撒饲料：坏输入被拒绝且什么都不改（只给 x 不给 y、非有限数、粒数不是 1…12 的整数、opts 不是对象按没给处理）', () => {
    const { w, play } = tank('clown');
    for (const opts of [{ x: 1 }, { y: 1 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 'a', y: 2 }, { count: 0 }, { count: 1.5 }, { count: 13 }, { count: -1 }, { count: '6' }, { count: NaN }, { x: 1, y: 1, count: 99 }]) {
        assert.deepEqual(Play.sprinkle(play, w, opts), { ok: false, reason: 'invalid' }, JSON.stringify(opts));
    }
    assert.equal(play.pellets.length, 0);
    assert.equal(play.lastSprinkle, -Infinity, '被拒绝的撒不开启冷却');
    for (const opts of [null, 7, 'x', undefined]) { play.lastSprinkle = -Infinity; assert.equal(Play.sprinkle(play, w, opts).ok, true, String(opts)); }
});

test('饲料：慢慢下沉并左右轻摆，到 14 秒或沉出画面就消失', () => {
    const { w, play } = tank('puffer', { x: 100, y: 100 });
    Play.sprinkle(play, w, { x: 1000, y: 200, count: 3 });
    const y0 = play.pellets.map(p => p.y);
    const x0 = play.pellets.map(p => p.x);
    for (let i = 0; i < 20; i++) Play.step(play, w, 50);                      // 1 秒
    play.pellets.forEach((p, i) => {
        assert.ok(Math.abs(p.y - y0[i] - p.sink) < 1e-6, '每秒下沉 sink 个像素');
        assert.ok(p.x !== x0[i], '左右在摆');
    });
    for (let i = 0; i < 11 * 20; i++) Play.step(play, w, 50);                // 12 秒：高度 200 + 12×40×0.8 = 584 < 720，还在
    assert.equal(play.pellets.length, 3);
    for (let i = 0; i < 3 * 20; i++) Play.step(play, w, 50);                 // 15 秒：已过 14 秒寿命
    assert.equal(play.pellets.length, 0);
    const deep = tank('puffer', { x: 100, y: 100 });
    Play.sprinkle(deep.play, deep.w, { x: 1000, y: 700, count: 2 });
    for (let i = 0; i < 20 * 2; i++) Play.step(deep.play, deep.w, 50);       // 2 秒后沉出 720 + 20
    assert.equal(deep.play.pellets.length, 0, '沉出画面的饲料被丢掉');
});

test('attractors：每粒饲料一个吸引点，范围、权重、速度倍数取自参数（范围乘视口缩放）；没有饲料时是空的', () => {
    const { w, play } = tank('clown');
    assert.equal(Play.attractors(play, w).length, 0);
    assert.equal(Play.attractors(play, w), Play.attractors(play, w), '没有饲料时返回同一个空数组，不每帧分配');
    Play.sprinkle(play, w, { x: 600, y: 300, count: 3 });
    const list = Play.attractors(play, w);
    assert.equal(list.length, 3);
    list.forEach((a, i) => {
        assert.deepEqual(a, { x: play.pellets[i].x, y: play.pellets[i].y, reach: P.ATTRACT_REACH * w.scale, weight: P.ATTRACT_W, boost: P.ATTRACT_BOOST });
    });
});

test('吃：游着的鱼碰到饲料（距离 < 0.45×体长 + 4）就吃掉，同一粒只被吃一次；吃到的变亮并冒 2 个泡', () => {
    const { w, play, fish } = tank('clown');
    const eatR = P.EAT_R_LEN * fish.len + P.EAT_R_PAD;
    play.pellets.push({ id: 1, x: fish.x + eatR + 5, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
    play.pellets.push({ id: 2, x: fish.x + eatR - 3, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(play, w, 50);
    assert.deepEqual(play.pellets.map(p => p.id), [1], '近的被吃，远的还在');
    assert.ok(play.fed.has(fish.id));
    assert.equal(play.bubbles.length, P.EAT_BUBBLES);
    assert.equal(Play.extrasOf(play, fish).fed, 0, '吃到的这一帧还没亮');
    Play.step(play, w, 50);
    const extras = Play.extrasOf(play, fish);
    assert.ok(extras.fed > 0 && extras.fed <= 1, `下一帧开始亮 ${extras.fed}`);
});

test('吃：两条鱼同样近时只有先出现的那条吃到；更近的那条优先；离开中、被抓着、淡入中的鱼不吃', () => {
    const t = tank('clown', { others: [['angel'], ['puffer'], ['hammer']] });
    const { w, play } = t;
    const [a, b, c, d] = w.fish;
    for (const f of w.fish) place(f, 500, 400, 5000);
    place(a, 500, 400, 0); place(b, 500, 400, 0);
    play.pellets.push({ id: 1, x: 500, y: 400, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(play, w, 50);
    assert.deepEqual([...play.fed.keys()], [a.id], '一样近：先出现的吃');
    const t2 = tank('clown', { others: [['angel']] });
    const [near, far] = t2.w.fish;
    place(far, 500, 400, 6); place(near, 500, 400, 3);
    t2.play.pellets.push({ id: 1, x: 500, y: 400, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(t2.play, t2.w, 50);
    assert.deepEqual([...t2.play.fed.keys()], [near.id], '更近的吃');
    for (const state of ['leaving', 'held', 'entering']) {
        const s = tank('clown');
        s.fish.state = state;
        s.play.pellets.push({ id: 1, x: s.fish.x, y: s.fish.y, t: 0, ph: 0, sink: 0, life: 14 });
        Play.step(s.play, s.w, 50);
        assert.equal(s.play.pellets.length, 1, `${state} 的鱼不吃`);
        assert.equal(s.play.fed.size, 0);
    }
});

test('吃（大个子）：按嘴吃——饲料离嘴不到 体长 × EAT_R_MOUTH + EAT_R_PAD 才算吃到，离鱼心再近、离嘴远也不吃；小鱼仍按离鱼心的距离', () => {
    for (const species of ['hammer', 'manta', 'whaleshark']) {
        const { w, play, fish } = tank(species);
        assert.ok(Core.agileOf(w, fish) < 1, `${species} 是大个子`);
        const mouth = { x: fish.x + fish.len * 0.45, y: fish.y };
        const eatR = P.EAT_R_MOUTH * fish.len + P.EAT_R_PAD;
        const pellet = (id, x, y) => play.pellets.push({ id, x, y, t: 0, ph: 0, sink: 0, life: 14 });
        pellet(1, fish.x, fish.y);                                   // 就在鱼心上：离嘴 0.45 个体长，吃不到
        pellet(2, mouth.x + eatR + 5, mouth.y);                       // 嘴前面一点：吃不到
        pellet(3, mouth.x + eatR - 3, mouth.y);                       // 嘴边：吃到
        Play.step(play, w, 50);
        assert.deepEqual(play.pellets.map(p => p.id).sort(), [1, 2], `${species}：只有嘴边的被吃`);
        assert.ok(play.fed.has(fish.id));
    }
    // 小鱼：鱼心上的饲料就能吃到（原来的规则，数值不变）
    const small = tank('clown');
    small.play.pellets.push({ id: 1, x: small.fish.x, y: small.fish.y, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(small.play, small.w, 50);
    assert.equal(small.play.pellets.length, 0);
});

test('吃（大个子）：转身时（xs < 1）身体沿屏幕横向缩短，嘴跟着收回来——饲料在缩短后的嘴边才算吃到', () => {
    for (const species of ['hammer', 'whaleshark']) {
        const { w, play, fish } = tank(species);
        fish.xs = 0.2;
        const eatR = P.EAT_R_MOUTH * fish.len + P.EAT_R_PAD;
        const shortMouth = fish.x + fish.len * 0.45 * 0.2;
        const fullMouth = fish.x + fish.len * 0.45;
        play.pellets.push({ id: 1, x: fullMouth, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });         // 没缩短时的嘴位置：现在已经离嘴很远
        play.pellets.push({ id: 2, x: shortMouth + eatR - 3, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
        Play.step(play, w, 50);
        assert.deepEqual(play.pellets.map(p => p.id), [1], `${species}：嘴随身体缩短`);
        assert.ok(play.bubbles.length >= P.EAT_BUBBLES);
        const mouthBubble = play.bubbles[0];
        assert.ok(Math.abs(mouthBubble.x - shortMouth) < 10 * w.scale, `${species}：泡冒在缩短后的嘴边 ${mouthBubble.x.toFixed(1)} / ${shortMouth.toFixed(1)}`);
    }
});

test('吃（大个子）：鱼朝着竖直、朝西时（俯视的蝠鲼可以头朝正上正下），嘴在鱼心的上方、下方、西侧 0.45 个体长处——只有那里的饲料算吃到；转身缩短（xs）只缩横向，竖直的嘴不动', () => {
    // 变异检查：只测了朝东时，嘴的 y 分量（sin）与 x 分量（cos）互换、或 y 也被 xs 缩短，都没有测试发现。
    for (const [ang, dx, dy] of [[Math.PI / 2, 0, 1], [-Math.PI / 2, 0, -1], [Math.PI, -1, 0]]) {
        for (const xs of [1, 0.2]) {
            const { w, play, fish } = tank('manta');
            Object.assign(fish, { ang, xs });
            const eatR = P.EAT_R_MOUTH * fish.len + P.EAT_R_PAD;
            const reach = fish.len * 0.45;
            const pellet = (id, x, y) => play.pellets.push({ id, x, y, t: 0, ph: 0, sink: 0, life: 14 });
            const mx = fish.x + dx * reach * (dx ? xs : 1);                           // 只有横向分量随 xs 缩短
            const my = fish.y + dy * reach;
            pellet(1, mx + dx * (eatR - 3), my + dy * (eatR - 3));                    // 嘴边（朝头的方向再出去一点）：吃到
            pellet(2, fish.x + reach, fish.y);                                        // 朝东时嘴的位置：现在不是嘴（竖直时离嘴 0.64 个体长；朝西时在尾巴那头）
            pellet(3, fish.x - dx * reach, fish.y - dy * reach);                      // 鱼的另一头：不是嘴
            Play.step(play, w, 50);
            const label = `朝向 ${ang.toFixed(2)}、xs ${xs}`;
            assert.deepEqual(play.pellets.map(p => p.id).sort(), [2, 3], `${label}：只有头那一端的嘴边被吃`);
            assert.ok(play.bubbles.length >= P.EAT_BUBBLES, `${label}：吃到后冒泡`);
            const bubble = play.bubbles[0];
            assert.ok(Math.abs(bubble.x - mx) < 10 * w.scale && Math.abs(bubble.y - my) < 10 * w.scale, `${label}：泡冒在嘴边 (${bubble.x.toFixed(1)}, ${bubble.y.toFixed(1)}) / (${mx.toFixed(1)}, ${my.toFixed(1)})`);
        }
    }
});

test('戳（大个子）：被戳只是游快一点——冲刺倍数按笨重系数缩小，不会像小鱼那样窜出去；小鱼仍是 POKE_DASH 倍', () => {
    for (const species of ['hammer', 'manta', 'whaleshark']) {
        const { w, play, fish } = tank(species);
        const agile = Core.agileOf(w, fish);
        assert.ok(agile < 1);
        assert.equal(Play.poke(play, w, fish, { x: fish.x - 20, y: fish.y }).ok, true);
        const mult = Math.hypot(fish.vx, fish.vy) / cruise(w, fish);
        assert.ok(Math.abs(mult - (1 + (P.POKE_DASH - 1) * agile)) < 1e-9, `${species}：冲刺 ${mult.toFixed(3)} 倍`);
        assert.ok(mult > 1 && mult < P.POKE_DASH, `${species}：比巡航快、比小鱼慢`);
    }
    const { w, play, fish } = tank('clown');
    assert.equal(Play.poke(play, w, fish, { x: fish.x - 20, y: fish.y }).ok, true);
    assert.ok(Math.abs(Math.hypot(fish.vx, fish.vy) / cruise(w, fish) - P.POKE_DASH) < 1e-9);
});

test('变亮：吃到后 FED_IN_S 内亮起、保持，最后 FED_OUT_S 内渐渐暗下，到 20 秒记录清掉；再吃一粒从头续满 20 秒', () => {
    const { w, play, fish } = tank('clown');
    play.pellets.push({ id: 1, x: fish.x, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(play, w, 50);
    const level = () => Play.extrasOf(play, fish).fed;
    assert.equal(level(), 0, '吃到的这一帧是 0');
    Play.step(play, w, 50);
    assert.ok(Math.abs(level() - 0.05 / P.FED_IN_S) < 1e-9, '下一帧亮了一小截');
    for (let i = 0; i < 5; i++) Play.step(play, w, 50);
    assert.equal(level(), 1);
    for (let i = 0; i < 20 * 15; i++) Play.step(play, w, 50);                // 吃到后第 15.3 秒
    assert.equal(level(), 1);
    for (let i = 0; i < 20 * 3; i++) Play.step(play, w, 50);                 // 第 18.3 秒：剩 1.7 秒，在渐暗里
    assert.ok(level() > 0.4 && level() < 0.7, `渐暗中 ${level()}`);
    play.pellets.push({ id: 2, x: fish.x, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
    Play.step(play, w, 50);                                                    // 再吃一粒：续满 20 秒
    for (let i = 0; i < 20 * 10; i++) Play.step(play, w, 50);
    assert.equal(level(), 1);
    for (let i = 0; i < 20 * 12; i++) Play.step(play, w, 50);
    assert.equal(play.fed.size, 0);
    assert.equal(Play.extrasOf(play, fish), Play.extrasOf(play, { id: 'nobody' }), '没有玩法状态时返回同一个冻结对象，不分配');
    assert.deepEqual(Play.extrasOf(play, fish), { pull: null, fed: 0 });
});

test('和核心一起：范围内的鱼游向饲料并吃到，范围外的鱼不理会', () => {
    let ate = 0;
    for (let seed = 1; seed <= 6; seed++) {
        const { w, play, fish } = tank('clown', { extra: { random: seeded(seed) }, others: [['angel']] });
        const bystander = w.fish[1];
        place(bystander, 500, 400, 3000);
        bystander.x = 3000; bystander.y = 400;
        Play.sprinkle(play, w, { x: 700, y: 400, count: 1 });
        for (let i = 0; i < 300 && play.pellets.length; i++) {
            Core.step(w, 50, { attractors: Play.attractors(play, w) });
            Play.step(play, w, 50);
        }
        if (play.fed.has(fish.id)) ate++;
        assert.ok(!play.fed.has(bystander.id));
    }
    assert.ok(ate >= 5, `6 个种子里只有 ${ate} 次吃到`);
});

test('随机撒与戳 120 秒：饲料、泡、涟漪、变亮记录的数量始终有界，数字有限（并且真的撒了、戳了、吃到了，不是空跑）', () => {
    const { w, play } = tank('clown', { others: [['tang'], ['neon'], ['hammer'], ['manta'], ['puffer'], ['angel']] });
    const rnd = seeded(5);
    let sprinkled = 0;
    let poked = 0;
    let peakFed = 0;
    for (let i = 0; i < 2400; i++) {
        if (i % 23 === 0 && Play.sprinkle(play, w, rnd() < 0.5 ? undefined : { x: rnd() * 1280, y: rnd() * 720 }).ok) sprinkled++;
        if (i % 37 === 0 && Play.poke(play, w, w.fish[Math.floor(rnd() * w.fish.length)], { x: rnd() * 1280, y: rnd() * 720 }).ok) poked++;
        Core.step(w, 50, { attractors: Play.attractors(play, w) });
        Play.step(play, w, 50);
        const c = Play.counts(play);
        peakFed = Math.max(peakFed, c.fed);
        assert.ok(c.pellets <= P.MAX_PELLETS && c.bubbles <= P.MAX_BUBBLES && c.ripples <= P.MAX_RIPPLES && c.fed <= w.fish.length);
    }
    assert.ok(sprinkled >= 50 && poked >= 30 && peakFed >= 5, `撒 ${sprinkled} 次、戳 ${poked} 次、同时变亮最多 ${peakFed} 条`);
    assert.ok(play.pellets.every(p => [p.x, p.y].every(Number.isFinite)));
    assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
});

// ---------- 拉尾 ----------

/** 抓住一条鱼的后半身（拉尾）：鱼在 (500, 400) 朝东，按在西侧 0.3 个体长处；返回 { w, play, fish, pointer }，pointer 是当前指针（可被 drive 推进）。 */
function holdTail(species = 'hammer', extra = {}) {
    const t = tank(species, extra);
    const gx = t.fish.x - t.fish.len * 0.3;
    assert.equal(Play.isTailZone(t.fish, gx, t.fish.y), true);
    assert.equal(Core.grab(t.w, t.fish, gx, t.fish.y, { tail: true }), true);
    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: true });
    t.pointer = { x: gx, y: t.fish.y };
    return t;
}
/** 让指针以 (vx, vy) px/s 运动 seconds 秒，鱼与玩法状态一起推进。 */
function drive(t, vx, vy, seconds) {
    for (let i = 0; i < seconds * 20; i++) {
        t.pointer = { x: t.pointer.x + vx * 0.05, y: t.pointer.y + vy * 0.05 };
        Core.step(t.w, 50, { pointer: t.pointer });
        Play.step(t.play, t.w, 50);
    }
}
const pullOf = t => t.play.pulls.get(t.fish.id);

test('isTailZone：只有后半身（本地 x ≤ 0）算，随鱼的朝向转；成群小鱼、坏输入一律不算', () => {
    const { fish } = tank('clown');
    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y), true);
    assert.equal(Play.isTailZone(fish, fish.x, fish.y), true, '正好在中线上算后半身');
    assert.equal(Play.isTailZone(fish, fish.x + 0.1, fish.y), false);
    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y + 8), true, '后半身偏上下一点也算');
    fish.ang = Math.PI;                                                       // 朝西：尾巴在东侧
    assert.equal(Play.isTailZone(fish, fish.x + 10, fish.y), true);
    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y), false);
    fish.ang = -Math.PI / 2;                                                  // 朝北：尾巴在南侧
    assert.equal(Play.isTailZone(fish, fish.x, fish.y + 10), true);
    assert.equal(Play.isTailZone(fish, fish.x, fish.y - 10), false);
    for (const species of ['neon', 'tang']) {
        const s = tank(species);
        assert.equal(Play.isTailZone(s.fish, s.fish.x - 5, s.fish.y), false, `${species} 不做拉尾`);
    }
    for (const species of ['puffer', 'angel', 'hammer', 'manta', 'whaleshark']) {
        const s = tank(species);
        assert.equal(Play.isTailZone(s.fish, s.fish.x - 5, s.fish.y), true, `${species} 可以拉尾`);
    }
    assert.equal(Play.isTailZone(null, 1, 1), false);
    assert.equal(Play.isTailZone(fish, NaN, 1), false);
    assert.equal(Play.isTailZone(fish, -Infinity, fish.y), false, '无穷远不算后半身');
    assert.equal(Play.isTailZone(fish, fish.x - 5, Infinity), false);
    assert.equal(Play.isTailZone({ ...fish, species: 'kraken' }, fish.x - 5, fish.y), false);
    assert.equal(Play.isTailZone({ ...fish, ang: NaN }, fish.x - 5, fish.y), false);
});

test('beginHold / endHold：只接受用拉尾方式抓住、且在 world 里的鱼；没有记录时 endHold 返回 state', () => {
    const t = tank('hammer');
    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '没抓住');
    assert.equal(Core.grab(t.w, t.fish, t.fish.x, t.fish.y), true);
    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '普通抓取不是拉尾');
    assert.deepEqual(Play.beginHold(t.play, t.w, null), { ok: false, reason: 'state' });
    Core.release(t.w, t.fish);
    assert.equal(Core.grab(t.w, t.fish, t.fish.x - 5, t.fish.y, { tail: true }), true);
    assert.deepEqual(Play.beginHold(t.play, t.w, { ...t.fish }), { ok: false, reason: 'state' }, '不在 world 里的副本');
    assert.equal(t.play.pulls.size, 0);
    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '还没有记录');
    assert.deepEqual(Play.endHold(t.play, t.w, null), { ok: false, reason: 'state' });
    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: true });
    assert.equal(t.play.pulls.size, 1);
});

test('拉伸：拖着走时弹簧趋向“指针速度 × PULL_GAIN”的位移，方向是指针运动方向（折算到鱼本地坐标），不超过体长 × PULL_MAX 与绝对上限', () => {
    const t = holdTail('hammer');
    drive(t, 300, 0, 1.5);                                                     // 向东拖：鱼头已转向西，本地 −x 就是指针运动的方向
    const p = pullOf(t);
    const expected = Math.min(300 * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
    assert.ok(Math.abs(p.x + expected) < 0.5, `拉伸 ${p.x}，预期 ≈ ${-expected}`);
    assert.ok(Math.abs(p.y) < 0.5, `横向 ${p.y}`);
    const extras = Play.extrasOf(t.play, t.fish);
    assert.ok(extras.pull.x < 0);
    assert.notEqual(extras.pull, pullOf(t), '给画法的是副本，不是内部状态');
    assert.deepEqual(extras.pull, { x: pullOf(t).x, y: pullOf(t).y });
    const slow = holdTail('hammer');
    drive(slow, 60, 0, 1.5);
    assert.ok(Math.abs(pullOf(slow).x + 60 * P.PULL_GAIN) < 0.3, '慢速拖：拉伸小，与速度成正比');
    const still = holdTail('hammer');
    drive(still, 0, 0, 1);
    assert.ok(Math.abs(pullOf(still).x) < 1e-6 && Math.abs(pullOf(still).y) < 1e-6, '指针不动：不拉伸');
});

test('拉伸上限：快速拖时不超过 体长 × PULL_MAX，大鱼不超过绝对上限 PULL_ABS × 视口缩放', () => {
    const small = holdTail('puffer');
    drive(small, 1500, 0, 1.5);
    assert.ok(Math.hypot(pullOf(small).x, pullOf(small).y) <= P.PULL_MAX * small.fish.len + 1e-6);
    assert.ok(Math.hypot(pullOf(small).x, pullOf(small).y) > 0.8 * P.PULL_MAX * small.fish.len, '快速拖能拉到接近上限');
    const big = holdTail('whaleshark');
    drive(big, 1500, 0, 1.5);
    const m = Math.hypot(pullOf(big).x, pullOf(big).y);
    assert.ok(m <= P.PULL_ABS * big.w.scale + 1e-6 && m > 0.8 * P.PULL_ABS * big.w.scale, `大鱼 ${m}`);
    assert.ok(P.PULL_ABS * big.w.scale < P.PULL_MAX * big.fish.len, '这条鱼的体长上限更大，所以是绝对上限在起作用');
});

test('拉伸方向：指针速度折算到鱼本地坐标——鱼头朝南、指针向东拖时，目标在本地 −y 方向（逐轴核对符号）', () => {
    const t = holdTail('hammer');
    t.fish.ang = Math.PI / 2;                                                  // 朝南：本地 +x 指向南，本地 +y 指向西
    t.fish.held.pvx = 300; t.fish.held.pvy = 0;                                // 指针向东：本地坐标里是 −y
    for (let i = 0; i < 40; i++) Play.step(t.play, t.w, 50);                   // 只推进玩法状态，鱼和指针速度不动
    const expected = Math.min(300 * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
    assert.ok(Math.abs(pullOf(t).y + expected) < 0.2 && Math.abs(pullOf(t).x) < 0.2, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}，预期 (0, ${-expected})`);
    t.fish.held.pvx = -200; t.fish.held.pvy = -100;                            // 指针向西北：本地 x = uy·(+1)... 逐分量核对
    for (let i = 0; i < 40; i++) Play.step(t.play, t.w, 50);
    const sp = Math.hypot(200, 100);
    const mag = Math.min(sp * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
    // ang = 90°：本地 x = ux·cos + uy·sin = uy；本地 y = −ux·sin + uy·cos = −ux
    assert.ok(Math.abs(pullOf(t).x - (-100 / sp) * mag) < 0.2 && Math.abs(pullOf(t).y - (200 / sp) * mag) < 0.2, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}`);
});

test('拉伸方向：垂直方向拖时弹簧永远有限，突然改向也一样（俯视的蝠鲼鱼头可以正对北，侧视的锤头鲨受俯仰限制、拉伸带一点本地 y 分量）', () => {
    const t = holdTail('manta');
    drive(t, 0, 300, 1.5);                                                     // 向南拖：鱼头转向北，本地 −x 指向南，所以仍是 −x
    assert.ok(pullOf(t).x < -1 && Math.abs(pullOf(t).y) < 0.5, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}`);
    drive(t, 150, 0, 0.3);                                                     // 突然改向东拖：转身过程中会有横向分量
    assert.ok([pullOf(t).x, pullOf(t).y, pullOf(t).vx, pullOf(t).vy].every(Number.isFinite));
    const side = holdTail('hammer');
    drive(side, 0, 300, 1.5);                                                  // 侧视：鱼头最多抬到 HOLD_PITCH_MAX，指针运动方向在鱼本地坐标里不再正好是 −x
    assert.ok(side.fish.held && Math.abs(side.fish.ang) <= Core.PARAMS.HOLD_PITCH_MAX + 1e-3, `朝向 ${side.fish.ang}`);
    assert.ok(pullOf(side).x < -1 && Math.abs(pullOf(side).y) < Math.abs(pullOf(side).x), `拉伸 ${pullOf(side).x}, ${pullOf(side).y}`);
    drive(side, 150, 0, 0.3);
    assert.ok([pullOf(side).x, pullOf(side).y, pullOf(side).vx, pullOf(side).vy].every(Number.isFinite));
});

test('松手：鱼朝鱼头方向冲一下（RELEASE_DASH × 巡航速度）、冒 2 个泡；尾巴回弹一次（过零、反向幅度小于第一次的 25%）后在 2 秒内停稳并清掉记录', () => {
    const t = holdTail('hammer');
    drive(t, 300, 0, 1.5);
    const peak = pullOf(t).x;
    assert.ok(peak < -1);
    const bubbles = t.play.bubbles.length;
    Core.release(t.w, t.fish, { vx: 300, vy: 0 });
    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: true });
    const dash = Core.cruiseSpeed(t.w, t.fish) * P.RELEASE_DASH;
    assert.ok(Math.abs(t.fish.vx - Math.cos(t.fish.ang) * dash) < 1e-9 && Math.abs(t.fish.vy - Math.sin(t.fish.ang) * dash) < 1e-9);
    assert.equal(t.play.bubbles.length, bubbles + P.RELEASE_BUBBLES);
    let maxBack = 0;
    let crossed = false;
    let steps = 0;
    while (pullOf(t) && steps < 100) {
        Core.step(t.w, 50, {});
        Play.step(t.play, t.w, 50);
        steps++;
        const p = pullOf(t);
        if (p && p.x > 0) { crossed = true; maxBack = Math.max(maxBack, p.x); }
    }
    assert.ok(steps <= 40, `停稳用了 ${steps} 帧`);
    assert.ok(crossed, '回弹过零');
    assert.ok(maxBack < 0.25 * -peak, `回弹幅度 ${maxBack} 应小于第一次拉伸 ${-peak} 的 25%`);
    assert.equal(t.play.pulls.size, 0);
});

test('松手时鱼已经不是 alive（例如刚被捞起）：只回弹，不冲刺、不冒泡、速度不变', () => {
    const t = holdTail('hammer');
    drive(t, 300, 0, 1);
    Core.release(t.w, t.fish, { vx: 300, vy: 0 });
    t.fish.state = 'leaving';
    const v = [t.fish.vx, t.fish.vy];
    const bubbles = t.play.bubbles.length;
    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: true });
    assert.deepEqual([t.fish.vx, t.fish.vy], v);
    assert.equal(t.play.bubbles.length, bubbles);
});

test('quiet：没拖就松手（或被捞起）时直接清掉弹簧——没有冲刺、没有泡、速度不变', () => {
    const t = holdTail('hammer');
    drive(t, 300, 0, 0.5);
    Core.release(t.w, t.fish);
    const v = [t.fish.vx, t.fish.vy];
    const bubbles = t.play.bubbles.length;
    assert.deepEqual(Play.endHold(t.play, t.w, t.fish, { quiet: true }), { ok: true });
    assert.equal(t.play.pulls.size, 0);
    assert.deepEqual([t.fish.vx, t.fish.vy], v);
    assert.equal(t.play.bubbles.length, bubbles);
});

test('清理：鱼被捞走（离开中）或不在了，弹簧记录下一步就清掉（不等回弹）；被别处放开（没走 endHold）自己回到 0 并清掉，不冲刺', () => {
    const gone = holdTail('hammer');
    drive(gone, 300, 0, 1);
    assert.ok(Math.abs(pullOf(gone).x) > 1, '拉着时有拉伸');
    gone.fish.state = 'leaving';
    Play.step(gone.play, gone.w, 50);
    assert.equal(gone.play.pulls.size, 0);
    const missing = holdTail('hammer');
    missing.w.fish.length = 0;
    Play.step(missing.play, missing.w, 50);
    assert.equal(missing.play.pulls.size, 0);
    const freed = holdTail('hammer');
    drive(freed, 300, 0, 1);
    Core.release(freed.w, freed.fish);
    const v = [freed.fish.vx, freed.fish.vy];
    for (let i = 0; i < 60; i++) { Play.step(freed.play, freed.w, 50); }
    assert.equal(freed.play.pulls.size, 0, '放开后弹簧自己回到 0 并被清掉');
    assert.equal(freed.play.bubbles.length, 0, '没有 endHold 就没有泡');
    assert.ok(v.every(Number.isFinite));
});

test('被前半身的普通抓取接手：旧的拉尾弹簧目标回到 0（不读不存在的指针速度），停稳后清掉，没有 NaN', () => {
    const t = holdTail('hammer');
    drive(t, 400, 0, 1);
    assert.ok(Math.abs(pullOf(t).x) > 1);
    Core.release(t.w, t.fish);                                                  // 松手但没走 endHold：记录还在
    const gx = t.fish.x + t.fish.len * 0.3;
    assert.equal(Core.grab(t.w, t.fish, gx, t.fish.y), true);                   // 改用前半身抓住同一条鱼
    assert.equal(t.fish.held.tail, false);
    t.pointer = { x: gx, y: t.fish.y };
    for (let i = 0; i < 80; i++) {
        t.pointer = { x: t.pointer.x + 15, y: t.pointer.y };
        Core.step(t.w, 50, { pointer: t.pointer });
        Play.step(t.play, t.w, 50);
        const p = pullOf(t);
        if (p) assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite), `第 ${i} 步弹簧有限`);
    }
    assert.equal(t.fish.state, 'held', '仍被前半身抓着');
    assert.equal(t.play.pulls.size, 0, '旧弹簧回到 0 后清掉（不必等放开）');
});

test('拉尾 60 秒随机操作：弹簧、速度、朝向始终有限，记录数不超过鱼数（并且真的抓了、放了很多次，不是空跑）', () => {
    const t = tank('clown', { others: [['hammer'], ['puffer'], ['angel'], ['manta'], ['whaleshark']] });
    const rnd = seeded(21);
    let held = null;
    let holds = 0;
    let releases = 0;
    let pointer = { x: 600, y: 400 };
    for (let i = 0; i < 1200; i++) {
        if (!held && i % 30 === 0) {
            const alive = t.w.fish.filter(f => f.state === 'alive');
            const f = alive[Math.floor(rnd() * alive.length)];
            const gx = f.x - Math.cos(f.ang) * f.len * 0.3;           // 后半身（鱼心往鱼尾方向 0.3 个体长）
            const gy = f.y - Math.sin(f.ang) * f.len * 0.3;
            if (Play.isTailZone(f, gx, gy) && Core.grab(t.w, f, gx, gy, { tail: true })) {
                assert.deepEqual(Play.beginHold(t.play, t.w, f), { ok: true });
                held = f;
                holds++;
                pointer = { x: gx, y: gy };
            }
        } else if (held && i % 45 === 0) {
            Core.release(t.w, held, { vx: rnd() * 600 - 300, vy: 0 });
            if (rnd() < 0.5) Play.endHold(t.play, t.w, held); else Play.endHold(t.play, t.w, held, { quiet: true });
            held = null;
            releases++;
        }
        pointer = { x: Math.max(0, Math.min(1280, pointer.x + (rnd() - 0.5) * 60)), y: Math.max(0, Math.min(720, pointer.y + (rnd() - 0.5) * 40)) };
        Core.step(t.w, 50, { pointer });
        Play.step(t.play, t.w, 50);
        assert.ok(t.play.pulls.size <= t.w.fish.length);
    }
    assert.ok(holds >= 10 && releases >= 10, `抓了 ${holds} 次、放了 ${releases} 次`);
    assert.ok(t.w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
    for (const p of t.play.pulls.values()) assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite));
});
