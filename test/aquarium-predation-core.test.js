// 水族馆的大鱼吃小鱼（2026-10-19，js/aquarium-predation-core.js）：谁能吃谁、成本函数、狩猎状态机、命中、吞咽与补员、猎物的反应、
// 与水母的结构性隔离、关闭时与没有这一层逐位一致、种子化的统计校准。
// 状态机的用例在“冻结”的世界里做（不调 Core.step，鱼的位置由用例摆好，时间手动推进），这样每个阶段都能被单独看见；
// 与真实游动的配合由末尾的整链路用例和统计用例守住。数字取自这台机器上的种子化模拟（脚本在 /tmp，不入库），阈值留了余量；
// 画面观感与真实 Chrome 里的表现不在这里。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/aquarium-core.js');
const Play = require('../js/aquarium-play-core.js');
const Pred = require('../js/aquarium-predation-core.js');

const PP = Pred.PARAMS;
const W = 1440;
const H = 900;
const FPS = 30;

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
const entry = (species, patch = {}) => Object.assign({ id: `q${++seq}`, species, addedAt: 1000 + seq }, patch);
const spec = id => Core.speciesById(id);

// ---------- 冻结的竞技场 ----------

/**
 * 一条或几条小锤头鲨 + 若干猎物条目（每个条目一个物种名）。所有鱼静止、朝右、完全淡入；位置由用例摆。
 * 返回 ctx：w 世界、pred 捕食状态、sharks（鱼）、prey（每个条目一个数组）、log（bubbles 回调的记录）。
 */
function arena({ prey = [], sharks = 1, seed = 1, width = W, height = H, lowPower = false } = {}) {
    const w = Core.createWorld({ width, height, random: seeded(seed), lowPower });
    const sharkEntries = Array.from({ length: sharks }, () => entry('hammer'));
    const preyEntries = prey.map(species => entry(species));
    Core.reconcile(w, sharkEntries.concat(preyEntries), { instant: true });
    for (const f of w.fish) { f.vx = 0; f.vy = 0; f.ang = 0; f.alpha = 1; f.state = 'alive'; }
    const group = e => w.fish.filter(f => f.entry === e.id);
    const ctx = { w, sharks: sharkEntries.flatMap(group), prey: preyEntries.map(group), log: [] };
    ctx.pred = Pred.create(w);
    ctx.bubbles = (x, y, count) => ctx.log.push({ x, y, count, time: w.time });
    sharkEntries.forEach((_, i) => put(ctx.sharks[i], 200 + i * 5, H * 0.4 + i * 30));
    return ctx;
}
const put = (f, x, y, ang = 0) => { f.x = x; f.y = y; f.ang = ang; f.vx = 0; f.vy = 0; return f; };
const mouth = f => Play.mouthOf(f);
/** 嘴前方 d px（沿 +x）、再偏 dy px 的位置。 */
const ahead = (shark, d, dy = 0) => ({ x: mouth(shark).x + d, y: mouth(shark).y + dy });
const placeAt = (f, p) => put(f, p.x, p.y);
const hunterOf = (ctx, shark = ctx.sharks[0]) => ctx.pred.hunters.get(shark.id);
const phaseOf = (ctx, shark = ctx.sharks[0]) => (hunterOf(ctx, shark) || {}).phase;
const stats = ctx => Pred.summary(ctx.pred).stats;

/** 推进 seconds 秒（每秒 30 步，世界时间手动加）；hunger 给了就在每步之后把所有捕食者的饥饿度钉在这个值。 */
function tick(ctx, seconds, { hunger = null, fps = FPS } = {}) {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) {
        ctx.w.time += 1 / fps;
        Pred.step(ctx.pred, ctx.w, 1000 / fps, { enabled: true, bubbles: ctx.bubbles });
        if (hunger !== null) for (const s of ctx.sharks) { const h = ctx.pred.hunters.get(s.id); if (h) h.hunger = hunger; }
    }
}
/** 让所有鱼都过了“刚被看到”的豁免期，而且捕食者不饿。 */
const calm = ctx => tick(ctx, PP.ENTER_SAFE_S + 0.3, { hunger: 0 });
/** 一直不饿到某个时刻之前不狩猎；之后把饥饿度调到 1。 */
const starve = (ctx, shark = ctx.sharks[0]) => { hunterOf(ctx, shark).hunger = 1; };
/** 5 条霓虹灯鱼挤在嘴前方 45 px 左右：在警戒半径以内，又够不着（吃不到）。 */
const flock = (ctx, shark = ctx.sharks[0], group = ctx.prey[0]) => group.forEach((f, i) => put(f, mouth(shark).x + 45 + i * 2, mouth(shark).y + (i - 2) * 4));
const countCalls = fn => { const g = (...args) => { g.calls++; return fn(...args); }; g.calls = 0; return g; };

// ---------- 规则表 ----------

test('谁能吃谁：9×9 全部组合，只有小锤头鲨吃霓虹灯鱼、蓝吊、小丑鱼、神仙鱼', () => {
    const eats = { hammer: ['neon', 'tang', 'clown', 'angel'] };                 // 独立的字面量：不从被测的表里推
    for (const a of Core.SPECIES) {
        for (const b of Core.SPECIES) {
            assert.equal(Pred.canEat(a, b), (eats[a.id] || []).includes(b.id), `${a.id} 吃 ${b.id}`);
        }
    }
});

test('谁能吃谁：按真实体长（meters）与 gape 判断，不看像素体长；水母、坏数据一律不能吃也不能被吃', () => {
    const shark = { diet: 'predator', gape: 0.3, meters: 2, len: 140 };
    assert.equal(Pred.canEat(shark, { diet: 'prey', meters: 0.6, len: 500 }), true, '刚好 0.6 = 0.3 × 2：能吃，像素体长再大也不看');
    assert.equal(Pred.canEat(shark, { diet: 'prey', meters: 0.61, len: 5 }), false, '真实体长超过一点就吃不了，像素体长再小也一样');
    assert.equal(Pred.canEat(shark, { diet: 'predator', meters: 0.1 }), false, '捕食者之间不互吃');
    assert.equal(Pred.canEat(shark, { meters: 0.1 }), false, '没有 diet 的不是猎物（河豚、海龟、蝠鲼、鲸鲨）');
    assert.equal(Pred.canEat({ diet: 'prey', gape: 0.3, meters: 2 }, { diet: 'prey', meters: 0.1 }), false, '猎物不吃东西');
    assert.equal(Pred.canEat({ diet: 'predator', meters: 2 }, { diet: 'prey', meters: 0.1 }), false, '没有 gape 吃不了');
    assert.equal(Pred.canEat(Object.assign({}, shark, { gape: NaN }), { diet: 'prey', meters: 0.1 }), false);
    assert.equal(Pred.canEat(shark, { diet: 'prey', meters: NaN }), false);
    assert.equal(Pred.canEat(shark, { diet: 'prey' }), false);
    assert.equal(Pred.canEat(spec('hammer'), { id: 'jellyfish', kind: 'jelly', meters: 0.1 }), false, '水母不在物种表里，也没有 diet');
    for (const bad of [null, undefined, 0, '', {}, [], 'neon']) {
        assert.equal(Pred.canEat(shark, bad), false);
        assert.equal(Pred.canEat(bad, spec('neon')), false);
    }
});

test('成本函数就是论文的 C = d (1 + β1·S + β2·E/π)：β1 = 0.5、β2 = 0.2，转向代价夹在 0…π', () => {
    assert.equal(PP.BETA_SCHOOL, 0.5);
    assert.equal(PP.BETA_TURN, 0.2);
    const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}：${a} ≠ ${b}`);
    close(Pred.costOf(100, false, 0), 100, '单条、正前方');
    close(Pred.costOf(100, true, 0), 150, '在鱼群里');
    close(Pred.costOf(100, false, Math.PI), 120, '正后方');
    close(Pred.costOf(100, true, Math.PI), 170, '鱼群里的正后方');
    close(Pred.costOf(100, false, Math.PI / 2), 110, '侧面');
    close(Pred.costOf(0, true, 1), 0, '距离为 0');
    close(Pred.costOf(100, false, -2), 100, '负的转向代价当 0');
    close(Pred.costOf(100, false, 10), 120, '超过 π 的当 π');
});

test('命中概率：单独的 0.7，在鱼群里 0.35，都在 0.15…0.85 以内', () => {
    assert.equal(Pred.catchChance(false), 0.7);
    assert.ok(Math.abs(Pred.catchChance(true) - 0.35) < 1e-12);
    assert.ok(PP.P_MIN <= Pred.catchChance(true) && Pred.catchChance(false) <= PP.P_MAX);
    assert.ok(Pred.catchChance(true) < Pred.catchChance(false), '鱼群里更难得手');
});

test('是不是在鱼群里：同条目存活的同伴 ≥ 3 条、而且全都在聚合半径以内；离开中的与别的条目不算', () => {
    const ctx = arena({ prey: ['neon', 'clown'] });
    const [neon] = ctx.prey;
    const [clown] = ctx.prey[1];
    const radius = Core.PARAMS.COH_R * neon[0].len;
    neon.forEach((f, i) => put(f, 600 + i * 10, 400));
    assert.equal(Pred.inSchool(ctx.w, neon[0]), true, '5 条挤在一起');
    put(neon[4], 600 + radius * 1.1, 400);
    assert.equal(Pred.inSchool(ctx.w, neon[0]), false, '有一条离得太远：整群不算在鱼群里（同伴要全都在半径以内）');
    neon[4].state = 'leaving';
    assert.equal(Pred.inSchool(ctx.w, neon[0]), true, '离开中的不算同伴');
    neon[3].state = 'leaving';
    assert.equal(Pred.inSchool(ctx.w, neon[0]), false, '剩下 2 条同伴，不够 3 条');
    assert.equal(Pred.inSchool(ctx.w, clown), false, '单条的鱼永远不在鱼群里');
    put(clown, 600, 400);
    neon[3].state = 'alive'; neon[4].state = 'alive'; put(neon[4], 610, 400); put(neon[3], 605, 400);
    assert.equal(Pred.inSchool(ctx.w, clown), false, '别的条目的鱼在旁边也不算');
});

test('冲刺速度：不低于 2.6 倍巡航、比猎物的速度上限快 1.2 倍、不超过 4.5 倍', () => {
    const ctx = arena({ prey: ['neon', 'tang', 'clown', 'angel'] });
    const shark = ctx.sharks[0];
    for (const group of ctx.prey) {
        const prey = group[0];
        const expected = Math.min(4.5, Math.max(2.6, 1.2 * Core.cruiseSpeed(ctx.w, prey) * 2.6 / Core.cruiseSpeed(ctx.w, shark)));
        assert.ok(Math.abs(Pred.strikeBoost(ctx.w, shark, prey) - expected) < 1e-9, `${prey.species}`);
        assert.ok(Pred.strikeBoost(ctx.w, shark, prey) >= 2.6 && Pred.strikeBoost(ctx.w, shark, prey) <= 4.5);
    }
    assert.ok(Pred.strikeBoost(ctx.w, shark, ctx.prey[0][0]) > Pred.strikeBoost(ctx.w, shark, ctx.prey[2][0]), '霓虹灯鱼比小丑鱼快，要追上得更快');
});

test('随机流：同一个种子同一串数，不同种子不同，都在 [0, 1)', () => {
    const a = Pred.seededRandom(42);
    const b = Pred.seededRandom(42);
    const c = Pred.seededRandom(43);
    const as = Array.from({ length: 50 }, a);
    assert.deepEqual(as, Array.from({ length: 50 }, b));
    assert.notDeepEqual(as, Array.from({ length: 50 }, c));
    assert.ok(as.every(v => v >= 0 && v < 1));
    assert.equal(new Set(as).size, 50);
});

test('校准过的参数钉子：改它们必须重跑种子化模拟（见技术文档“校准”一节）并同步文档', () => {
    const pinned = {
        HUNGER_RATE: 1 / 240, MEAL: 0.6, HUNGER_START: 0.2, HUNGER_SPAN: 0.4, HUNGER_THRESHOLD: 0.5, PICK_S: 0.5, SWITCH_RATIO: 0.7, SENSE_LEN: 6, SENSE_MAX: 0.5,
        SENSE_LOSE: 1.5, REACH_BAND: 0.5, BETA_SCHOOL: 0.5, BETA_TURN: 0.2, SCHOOL_MATES: 3, HUNT_W: 2.2, HUNT_BOOST: 1.3, LEAD_MAX_S: 1, STRIKE_R: 1.2, STRIKE_CONE: 0.8,
        STRIKE_S: 1.4, STRIKE_BOOST_MIN: 2.6, STRIKE_BOOST_MAX: 4.5, STRIKE_PREY: 1.2, STRIKE_ACCEL: 3, HUNT_MAX_S: 12, P_SOLO: 0.7, P_SCHOOL: 0.35, P_MIN: 0.15, P_MAX: 0.85,
        HANDLE_S: 1, HANDLE_PACE: 0.6, BUBBLES: 3, REST_MIN_S: 6, REST_MAX_S: 10, FAIL_LIMIT: 3, GIVEUP_S: 20, KILL_GAP_S: 20, VACANT_SHARE: 0.3, ALERT_LEN: 0.8, ALERT_PAD: 20,
        ALERT_MAX: 450, REACT_S: 0.25, PANIC_S: 0.3, FLEE_BOOST: 2.2, FLEE_RESPONSE: 8, SAFE_S: 4, ENTER_SAFE_S: 3, MIN_ALPHA: 0.9, REFILL_SCHOOL_S: 25, REFILL_SOLO_S: 75,
    };
    assert.deepEqual(Object.assign({}, PP), pinned);
    assert.ok(Object.isFrozen(PP));
    assert.ok(PP.REST_MIN_S <= PP.REST_MAX_S && PP.REFILL_SCHOOL_S < PP.REFILL_SOLO_S && PP.STRIKE_BOOST_MIN <= PP.STRIKE_BOOST_MAX && PP.P_MIN < PP.P_MAX);
});

// ---------- 状态机（冻结的世界） ----------

test('不饿不狩猎：猎物就在嘴边，饥饿度低于阈值时 30 秒里一次追击都没有，也不写任何目标点', () => {
    const ctx = arena({ prey: ['clown'] });
    placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 100));
    tick(ctx, 0.1, { hunger: 0 });
    tick(ctx, 30, { hunger: PP.HUNGER_THRESHOLD - 0.01 });
    assert.equal(stats(ctx).hunts, 0);
    assert.equal(ctx.sharks[0].goal, null);
    assert.equal(phaseOf(ctx), 'cruise');
});

test('饿了就去追：先在豁免期（刚被看到的 3 秒）之后才会选目标，选定后写目标点（逼近的权重与速度、位置就是猎物）', () => {
    const ctx = arena({ prey: ['clown'] });
    const [shark] = ctx.sharks;
    const clown = ctx.prey[0][0];
    placeAt(clown, ahead(shark, 400, 20));
    tick(ctx, 0.1, { hunger: 1 });
    tick(ctx, PP.ENTER_SAFE_S - 0.5, { hunger: 1 });
    assert.equal(stats(ctx).hunts, 0, '刚看到的鱼 3 秒之内不当目标');
    tick(ctx, 1.2, { hunger: 1 });
    assert.equal(stats(ctx).hunts, 1);
    assert.equal(phaseOf(ctx), 'hunt');
    assert.equal(hunterOf(ctx).targetId, clown.id);
    assert.deepEqual(shark.goal, { x: clown.x, y: clown.y, w: PP.HUNT_W, boost: PP.HUNT_BOOST, accel: undefined });
});

test('冲刺：嘴到猎物不到 1.2 倍体长且猎物在朝向前方 0.8 弧度以内才转入冲刺；猎物在身后时留在逼近阶段（大个子转不过身）', () => {
    const near = arena({ prey: ['clown'] });
    calm(near);
    placeAt(near.prey[0][0], ahead(near.sharks[0], PP.STRIKE_R * near.sharks[0].len * 0.9));
    starve(near);
    tick(near, 0.7);
    assert.equal(phaseOf(near), 'strike');
    assert.equal(stats(near).strikes, 1);
    const goal = near.sharks[0].goal;
    assert.equal(goal.accel, PP.STRIKE_ACCEL);
    assert.equal(goal.w, PP.HUNT_W);
    assert.ok(Math.abs(goal.boost - Pred.strikeBoost(near.w, near.sharks[0], near.prey[0][0])) < 1e-9);

    const far = arena({ prey: ['clown'] });
    calm(far);
    placeAt(far.prey[0][0], ahead(far.sharks[0], PP.STRIKE_R * far.sharks[0].len * 1.2));
    starve(far);
    tick(far, 2);
    assert.equal(phaseOf(far), 'hunt', '太远：继续逼近');
    assert.equal(stats(far).strikes, 0);

    const behind = arena({ prey: ['clown'] });
    calm(behind);
    placeAt(behind.prey[0][0], ahead(behind.sharks[0], -2 * mouth(behind.sharks[0]).x + 2 * behind.sharks[0].x - 60, 0));
    behind.prey[0][0].x = mouth(behind.sharks[0]).x - 100;
    starve(behind);
    tick(behind, 2);
    assert.equal(phaseOf(behind), 'hunt', '猎物在身后 100 px：距离够近但不在前方锥里');
    assert.equal(stats(behind).strikes, 0);
    behind.prey[0][0].x = mouth(behind.sharks[0]).x + 100;                         // 绕到了前面
    tick(behind, 0.3);
    assert.equal(phaseOf(behind), 'strike');
});

test('命中：够得着时只掷一次骰子（再多帧也不增加成功率）；骰子过了就吃——猎物进入 leaving/eaten、登记空缺、嘴边冒泡、饥饿度 −0.6、进入吞咽、放慢', () => {
    const ctx = arena({ prey: ['clown'] });
    const [shark] = ctx.sharks;
    const clown = ctx.prey[0][0];
    calm(ctx);
    placeAt(clown, ahead(shark, 10));
    ctx.pred.rnd = countCalls(() => 0);                                            // 骰子永远过
    starve(ctx);
    const t0 = ctx.w.time;
    tick(ctx, 0.6);
    assert.equal(clown.state, 'leaving');
    assert.equal(clown.eaten, true);
    assert.deepEqual(clown.leaveTo, mouth(shark));
    assert.equal(ctx.w.vacancies.length, 1);
    assert.equal(ctx.w.vacancies[0].entry, clown.entry);
    assert.equal(ctx.w.vacancies[0].species, 'clown');
    assert.ok(ctx.w.vacancies[0].due > t0 + PP.REFILL_SOLO_S - 1 && ctx.w.vacancies[0].due < t0 + 0.6 + PP.REFILL_SOLO_S + 0.05, `单条的鱼约 ${PP.REFILL_SOLO_S} 秒后补回`);
    assert.equal(ctx.log.length, 1, '冒一次泡');
    assert.deepEqual([ctx.log[0].x, ctx.log[0].y], [mouth(shark).x, mouth(shark).y]);
    assert.ok(ctx.log[0].count === PP.BUBBLES || ctx.log[0].count === PP.BUBBLES + 1);
    assert.ok(Math.abs(hunterOf(ctx).hunger - (1 - PP.MEAL + PP.HUNGER_RATE * 0.0)) < 0.02, `饥饿度降到约 ${1 - PP.MEAL}：${hunterOf(ctx).hunger}`);
    assert.equal(phaseOf(ctx), 'handle');
    assert.deepEqual(shark.goal, { x: shark.x, y: shark.y, w: 0, boost: PP.HANDLE_PACE });
    const s = stats(ctx);
    assert.equal(s.captures, 1);
    assert.equal(s.chases.length, 1);
    tick(ctx, PP.HANDLE_S + 0.2);
    assert.equal(phaseOf(ctx), 'cruise', '吞咽结束回到巡航');
    assert.equal(shark.goal, null);
});

test('群居的猎物 25 秒补回，单条的 75 秒；骰子没过就不吃，一次冲刺在够得着的范围里无论多少帧只掷一次', () => {
    const school = arena({ prey: ['neon'] });
    calm(school);
    placeAt(school.prey[0][0], ahead(school.sharks[0], 10));
    school.prey[0].slice(1).forEach((f, i) => put(f, 900 + i * 12, 700));
    school.pred.rnd = () => 0;
    starve(school);
    const t0 = school.w.time;
    tick(school, 0.6);
    assert.equal(school.w.vacancies.length, 1);
    assert.ok(Math.abs(school.w.vacancies[0].due - (t0 + 0.1 + PP.REFILL_SCHOOL_S)) < 0.7, `群居 ${PP.REFILL_SCHOOL_S} 秒`);

    const miss = arena({ prey: ['clown'] });
    calm(miss);
    placeAt(miss.prey[0][0], ahead(miss.sharks[0], 10));
    miss.pred.rnd = countCalls(() => 0.999);
    starve(miss);
    tick(miss, PP.STRIKE_S + 0.3);
    assert.equal(miss.prey[0][0].state, 'alive', '没吃到');
    assert.equal(miss.w.vacancies.length, 0);
    assert.equal(stats(miss).captures, 0);
    assert.equal(stats(miss).ended.roll, 1);
    assert.equal(miss.pred.rnd.calls, 2, '一次掷骰子 + 一次决定恢复多久；够得着的好几十帧里没有再掷');
    assert.equal(phaseOf(miss), 'rest');
});

test('失败之后恢复 6–10 秒再狩猎；连续失败 3 次放弃 20 秒', () => {
    const lowRoll = arena({ prey: ['clown'] });
    calm(lowRoll);
    placeAt(lowRoll.prey[0][0], ahead(lowRoll.sharks[0], 10));
    lowRoll.pred.rnd = () => 0.999;
    starve(lowRoll);
    tick(lowRoll, PP.STRIKE_S + 0.2, { hunger: 1 });
    const h = hunterOf(lowRoll);
    assert.equal(h.phase, 'rest');
    const rest = h.restUntil - lowRoll.w.time;
    assert.ok(rest > 9 && rest <= PP.REST_MAX_S + 0.05, `rnd≈1 时恢复约 ${PP.REST_MAX_S} 秒：${rest.toFixed(2)}`);
    tick(lowRoll, rest - 0.5, { hunger: 1 });
    assert.equal(phaseOf(lowRoll), 'rest', '恢复期里不狩猎');
    tick(lowRoll, 1.2, { hunger: 1 });
    assert.notEqual(phaseOf(lowRoll), 'rest');

    const quick = arena({ prey: ['clown'] });
    calm(quick);
    placeAt(quick.prey[0][0], ahead(quick.sharks[0], 10));
    quick.pred.rnd = () => 0;                                                      // 骰子永远 0：恢复 6 秒；命中永远通过——所以改让猎物够不着来制造失败
    starve(quick);
    quick.prey[0][0].state = 'held';                                               // 一直抓着：永远不是合格目标
    tick(quick, 1, { hunger: 1 });
    assert.equal(stats(quick).hunts, 0);

    const ctx = arena({ prey: ['clown'] });
    calm(ctx);
    placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 120, 90));                        // 够不着：冲刺里嘴到不了
    ctx.pred.rnd = () => 0;                                                        // 每次失败后恢复 REST_MIN_S
    starve(ctx);
    const times = [];
    let lastHunts = 0;
    for (let i = 0; i < 90 * FPS; i++) {
        tick(ctx, 1 / FPS, { hunger: 1 });
        if (stats(ctx).hunts !== lastHunts) { lastHunts = stats(ctx).hunts; times.push(ctx.w.time); }
    }
    assert.ok(stats(ctx).giveups >= 1, '连续失败 3 次后放弃');
    assert.ok(times.length >= 4, `90 秒里追了 ${times.length} 次`);
    assert.ok(times[3] - times[2] >= PP.GIVEUP_S - 1, `第 3 次失败之后至少隔 ${PP.GIVEUP_S} 秒才再追：${(times[3] - times[2]).toFixed(1)} 秒`);
    assert.ok(times[1] - times[0] < PP.GIVEUP_S, '前几次之间只隔恢复期');
});

test('追击的失败原因：目标不再合格（被抓住）/ 追得太久 / 跑出感知范围 / 冲刺结束都没碰到 / 被戳了，都记进统计并转入恢复', () => {
    const held = arena({ prey: ['clown'] });
    calm(held);
    placeAt(held.prey[0][0], ahead(held.sharks[0], 300));
    starve(held);
    tick(held, 0.7);
    assert.equal(phaseOf(held), 'hunt');
    held.prey[0][0].state = 'held';
    tick(held, 0.1);
    assert.equal(phaseOf(held), 'rest');
    assert.equal(stats(held).ended.ineligible, 1);
    assert.equal(held.sharks[0].goal, null, '失败之后不再有目标点');

    const slow = arena({ prey: ['clown'] });
    calm(slow);
    placeAt(slow.prey[0][0], ahead(slow.sharks[0], 400));                          // 一直追不到（世界冻结）
    starve(slow);
    tick(slow, PP.HUNT_MAX_S + 1.2);
    assert.equal(stats(slow).ended.timeout, 1);
    assert.ok(stats(slow).chases[0] >= PP.HUNT_MAX_S && stats(slow).chases[0] < PP.HUNT_MAX_S + 0.2, `追了 ${stats(slow).chases[0]} 秒`);

    const lost = arena({ prey: ['clown'] });
    calm(lost);
    const sense = Math.min(PP.SENSE_LEN * lost.sharks[0].len, W * PP.SENSE_MAX);
    placeAt(lost.prey[0][0], ahead(lost.sharks[0], sense * 0.9));
    starve(lost);
    tick(lost, 0.7);
    assert.equal(phaseOf(lost), 'hunt');
    placeAt(lost.prey[0][0], ahead(lost.sharks[0], sense * (PP.SENSE_LOSE + 0.05)));
    lost.prey[0][0].x = Math.min(lost.prey[0][0].x, W - 5);
    if (Math.hypot(lost.prey[0][0].x - mouth(lost.sharks[0]).x, lost.prey[0][0].y - mouth(lost.sharks[0]).y) <= sense * PP.SENSE_LOSE) lost.sharks[0].x = 20;
    tick(lost, 0.1);
    assert.equal(stats(lost).ended.sense, 1);

    const never = arena({ prey: ['clown'] });
    calm(never);
    placeAt(never.prey[0][0], ahead(never.sharks[0], 100));
    never.pred.rnd = () => 0;
    starve(never);
    tick(never, PP.STRIKE_S + 0.6);
    assert.equal(stats(never).ended.never, 1, '冲刺了但嘴一直够不着');
    assert.equal(stats(never).captures, 0);

    const poked = arena({ prey: ['clown'] });
    calm(poked);
    placeAt(poked.prey[0][0], ahead(poked.sharks[0], 100));
    starve(poked);
    tick(poked, 0.7);
    assert.equal(phaseOf(poked), 'strike');
    assert.equal(Pred.disturb(poked.pred, poked.w, poked.sharks[0]), true);
    assert.equal(phaseOf(poked), 'rest');
    assert.equal(stats(poked).ended.disturbed, 1);
    assert.equal(poked.sharks[0].goal, null);
});

test('戳捕食者：只有冲刺中的才被中止；其它阶段、别的鱼、没有记录的鱼什么都不改', () => {
    const ctx = arena({ prey: ['clown'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    const clown = ctx.prey[0][0];
    assert.equal(Pred.disturb(ctx.pred, ctx.w, shark), false, '巡航中');
    assert.equal(Pred.disturb(ctx.pred, ctx.w, clown), false, '猎物');
    assert.equal(Pred.disturb(ctx.pred, ctx.w, null), false);
    assert.equal(Pred.disturb(ctx.pred, ctx.w, { id: 99999 }), false);
    placeAt(clown, ahead(shark, 300));
    starve(ctx);
    tick(ctx, 0.7);
    assert.equal(phaseOf(ctx), 'hunt');
    assert.equal(Pred.disturb(ctx.pred, ctx.w, shark), false, '逼近阶段不被打断');
    assert.equal(phaseOf(ctx), 'hunt');
    assert.equal(stats(ctx).ended.disturbed, undefined);
});

test('豁免：被抓着的、刚松手的（4 秒内）、刚淡入的（3 秒内）、还在淡入的、没完全淡入的都不是目标', () => {
    const ctx = arena({ prey: ['clown', 'angel'] });
    const [shark] = ctx.sharks;
    const [clown] = ctx.prey[0];
    const [angel] = ctx.prey[1];
    placeAt(clown, ahead(shark, 300));
    placeAt(angel, ahead(shark, 360, 40));
    clown.state = 'held';
    angel.state = 'entering'; angel.alpha = 0.3;
    tick(ctx, 0.1, { hunger: 0 });
    tick(ctx, 6, { hunger: 1 });
    assert.equal(stats(ctx).hunts, 0, '抓着的与还在淡入的都不是目标');

    clown.state = 'alive';                                                         // 松手
    tick(ctx, PP.SAFE_S - 0.2, { hunger: 1 });                                     // > ENTER_SAFE_S + PICK_S：没有“被抓过”的保护，这时早已选上它了
    assert.equal(stats(ctx).hunts, 0, `松手 ${PP.SAFE_S} 秒之内是安全的`);
    angel.state = 'alive'; angel.alpha = 0.8;
    tick(ctx, 1.4, { hunger: 1 });
    assert.equal(hunterOf(ctx).targetId, clown.id, '松手满 4 秒后可以追；没完全淡入（alpha < 0.9）的鱼仍然不行');
    assert.equal(stats(ctx).hunts, 1);

    const fresh = arena({ prey: ['clown'] });
    calm(fresh);
    const old = fresh.prey[0][0];
    fresh.w.fish = fresh.w.fish.filter(f => f !== old);                            // 原来的那条没了，补回的是一条新的鱼（新的 id）
    assert.equal(Core.enterOne(fresh.w, old.entry, 'clown'), true);
    const born = fresh.w.fish[fresh.w.fish.length - 1];
    assert.equal(born.state, 'entering');
    placeAt(born, ahead(fresh.sharks[0], 300));
    tick(fresh, 1, { hunger: 1 });
    assert.equal(stats(fresh).hunts, 0, '还在淡入：不是目标');
    born.state = 'alive'; born.alpha = 1;                                          // 淡入完成
    const seen = fresh.w.time;
    tick(fresh, PP.ENTER_SAFE_S - 0.4, { hunger: 1 });
    assert.equal(stats(fresh).hunts, 0, '刚能被看到的 3 秒之内不当目标');
    tick(fresh, 1.2, { hunger: 1 });
    assert.equal(stats(fresh).hunts, 1);
    assert.ok(fresh.w.time - seen >= PP.ENTER_SAFE_S);
});

test('够不着的不追：高度在捕食者活动带之外（上下各多半个体长）、或者超出感知半径的猎物不会成为目标', () => {
    const band = arena({ prey: ['clown'] });
    calm(band);
    const [shark] = band.sharks;
    const spc = spec('hammer');
    placeAt(band.prey[0][0], { x: mouth(shark).x + 250, y: spc.band[1] * H + shark.len * PP.REACH_BAND + 30 });
    starve(band);
    tick(band, 3, { hunger: 1 });
    assert.equal(stats(band).hunts, 0, '在带下方');
    placeAt(band.prey[0][0], { x: mouth(shark).x + 250, y: spc.band[1] * H + shark.len * PP.REACH_BAND - 20 });
    tick(band, 1, { hunger: 1 });
    assert.equal(stats(band).hunts, 1, '带的边缘以内就追');

    const sense = arena({ prey: ['clown'] });
    calm(sense);
    const radius = Math.min(PP.SENSE_LEN * sense.sharks[0].len, W * PP.SENSE_MAX);
    placeAt(sense.prey[0][0], ahead(sense.sharks[0], radius + 20));
    starve(sense);
    tick(sense, 3, { hunger: 1 });
    assert.equal(stats(sense).hunts, 0, '超出感知半径');
    placeAt(sense.prey[0][0], ahead(sense.sharks[0], radius - 20));
    tick(sense, 1, { hunger: 1 });
    assert.equal(stats(sense).hunts, 1);
});

test('不是猎物的不追：河豚、海龟、蝠鲼、鲸鲨离得再近、饿成什么样都不当目标；水母根本不在这个世界里', () => {
    const ctx = arena({ prey: ['puffer', 'turtle', 'manta', 'whaleshark', 'hammer'] });
    const [shark] = ctx.sharks;
    ctx.prey.slice(0, 4).forEach((group, i) => placeAt(group[0], ahead(shark, 150 + i * 5, 10 * i)));
    put(ctx.prey[4][0], mouth(shark).x + 200, mouth(shark).y);                     // 另一条小锤头鲨
    ctx.sharks.push(ctx.prey[4][0]);
    tick(ctx, 0.1, { hunger: 0 });
    tick(ctx, 20, { hunger: 1 });
    assert.equal(stats(ctx).hunts, 0);
});

test('挑目标：成本最小的合格猎物；在鱼群里的更“贵”、在身后的更“贵”', () => {
    const lone = arena({ prey: ['clown', 'neon'] });
    calm(lone);
    const [shark] = lone.sharks;
    const [clown] = lone.prey[0];
    const neon = lone.prey[1];
    neon.forEach((f, i) => put(f, mouth(shark).x + 300 + (i % 3) * 8, mouth(shark).y + 5 + Math.floor(i / 3) * 8));
    placeAt(clown, ahead(shark, 300 * 1.4, 0));                                    // 鱼群里的 300 px 成本 450，单条的 420 px 成本 420：选单条
    starve(lone);
    tick(lone, 0.7);
    assert.equal(hunterOf(lone).targetId, clown.id);

    const farLone = arena({ prey: ['clown', 'neon'] });
    calm(farLone);
    const neon2 = farLone.prey[1];
    neon2.forEach((f, i) => put(f, mouth(farLone.sharks[0]).x + 300 + (i % 3) * 8, mouth(farLone.sharks[0]).y + 5 + Math.floor(i / 3) * 8));
    placeAt(farLone.prey[0][0], ahead(farLone.sharks[0], 300 * 1.6, 0));          // 480 > 450：选鱼群里的
    starve(farLone);
    tick(farLone, 0.7);
    assert.ok(neon2.some(f => f.id === hunterOf(farLone).targetId));

    const turn = arena({ prey: ['clown', 'angel'] });
    calm(turn);
    const t = turn.sharks[0];
    placeAt(turn.prey[0][0], { x: mouth(t).x - 200, y: mouth(t).y });             // 身后 200：成本 200 × 1.2 = 240
    placeAt(turn.prey[1][0], ahead(t, 230));                                       // 正前 230
    starve(turn);
    tick(turn, 0.7);
    assert.equal(hunterOf(turn).targetId, turn.prey[1][0].id, '正前 230（成本 230）比身后 200（成本 240）便宜');
    const turn2 = arena({ prey: ['clown', 'angel'] });
    calm(turn2);
    const t2 = turn2.sharks[0];
    placeAt(turn2.prey[0][0], { x: mouth(t2).x - 200, y: mouth(t2).y });
    placeAt(turn2.prey[1][0], ahead(t2, 260));
    starve(turn2);
    tick(turn2, 0.7);
    assert.equal(hunterOf(turn2).targetId, turn2.prey[0][0].id, '身后 200（成本 240）比正前 260 便宜');
});

test('追的过程中换目标要新目标便宜到现有的 0.7 倍以下，免得来回切', () => {
    const run = ratio => {
        const ctx = arena({ prey: ['clown', 'angel'] });
        calm(ctx);
        const [shark] = ctx.sharks;
        const [a] = ctx.prey[0];
        const [b] = ctx.prey[1];
        placeAt(a, ahead(shark, 400));
        placeAt(b, ahead(shark, 600));
        starve(ctx);
        tick(ctx, 0.7);
        assert.equal(hunterOf(ctx).targetId, a.id);
        placeAt(b, ahead(shark, 400 * ratio));                                     // 新目标的成本 = 400 × ratio，现有目标 400
        tick(ctx, 0.6);
        return { switched: hunterOf(ctx).targetId === b.id, ctx };
    };
    assert.equal(run(0.75).switched, false, '便宜 25%：不换');
    assert.equal(run(0.65).switched, true, '便宜 35%：换');
});

test('吞咽时被吞的鱼的落点逐帧跟着嘴走；鱼或捕食者没了就不再跟，也不出错', () => {
    const ctx = arena({ prey: ['clown'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    const clown = ctx.prey[0][0];
    placeAt(clown, ahead(shark, 10));
    ctx.pred.rnd = () => 0;
    starve(ctx);
    tick(ctx, 0.6);
    assert.equal(clown.state, 'leaving');
    assert.equal(Pred.summary(ctx.pred).swallowing, 1);
    shark.x += 70;
    shark.y += 20;
    tick(ctx, 0.1);
    assert.deepEqual(clown.leaveTo, mouth(shark), '落点跟着嘴');
    ctx.w.fish = ctx.w.fish.filter(f => f !== shark);                              // 捕食者被捞走了
    tick(ctx, 0.1);
    assert.equal(Pred.summary(ctx.pred).swallowing, 0);
});

test('空缺的比例：同时等着补回的不超过猎物总数（活着的 + 空缺）的三成，但至少允许 1 个', () => {
    const tiny = arena({ prey: ['clown', 'angel'] });                              // 总共 2 条：一次只吃 1 条
    calm(tiny);
    tiny.pred.rnd = () => 0;
    placeAt(tiny.prey[0][0], ahead(tiny.sharks[0], 10));
    placeAt(tiny.prey[1][0], ahead(tiny.sharks[0], 12, 5));
    tick(tiny, 0.1, { hunger: 1 });
    tick(tiny, 80, { hunger: 1 });
    assert.equal(stats(tiny).captures, 1);
    assert.equal(tiny.w.vacancies.length, 1);
    assert.equal(tiny.prey.flat().filter(f => f.state === 'alive').length, 1, '另一条一直活着');

    const big = arena({ prey: ['neon', 'neon'] });                                 // 总共 10 条：最多 3 个空缺
    calm(big);
    big.pred.rnd = () => 0;
    const [shark] = big.sharks;
    big.prey.flat().forEach((f, i) => put(f, mouth(shark).x + 8, mouth(shark).y + (i - 5) * 3));
    tick(big, 0.1, { hunger: 1 });
    tick(big, 200, { hunger: 1 });
    assert.equal(stats(big).captures, 3, '空缺不会被补（冻结的世界不推进补员）：10 条里最多被吃掉 3 条');
    assert.equal(big.w.vacancies.length, 3);
});

test('整个水族馆两次捕获之间至少隔 20 秒：几条捕食者同时饿着也不会清场', () => {
    const ctx = arena({ prey: ['neon', 'neon', 'neon'], sharks: 2 });
    calm(ctx);
    ctx.pred.rnd = () => 0;
    ctx.sharks.forEach((s, i) => put(s, 200, 200 + i * 300));
    ctx.prey.flat().forEach((f, i) => put(f, mouth(ctx.sharks[i % 2]).x + 6, mouth(ctx.sharks[i % 2]).y + (i % 3) * 3));
    tick(ctx, 0.1, { hunger: 1 });
    tick(ctx, 110, { hunger: 1 });
    const times = ctx.log.map(e => e.time);
    assert.ok(times.length >= 3, `110 秒里吃了 ${times.length} 条`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= PP.KILL_GAP_S - 1 / FPS, `第 ${i} 与第 ${i + 1} 次捕获间隔 ${(times[i] - times[i - 1]).toFixed(2)} 秒`);
    assert.ok(times.length <= Math.floor(110 / PP.KILL_GAP_S) + 1);
});

test('捕食者不是游着的（被抓着、被捞起、还在淡入）：不狩猎，手里的追击作废', () => {
    for (const state of ['held', 'leaving', 'entering']) {
        const ctx = arena({ prey: ['clown'] });
        calm(ctx);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
        starve(ctx);
        tick(ctx, 0.7);
        assert.equal(phaseOf(ctx), 'hunt');
        ctx.sharks[0].state = state;
        tick(ctx, 0.1);
        assert.equal(phaseOf(ctx), 'cruise', state);
        assert.equal(hunterOf(ctx).targetId, null);
        assert.equal(ctx.sharks[0].goal, null);
        assert.equal(stats(ctx).chases.length, 1, '追击记录收尾');
    }
});

test('关闭 / 省流量：只清理——所有目标点清掉、所有空缺立刻到期、狩猎状态丢弃；省流量的世界之后也一直不追，只是关掉的可以重新打开', () => {
    for (const mode of ['disabled', 'lowPower']) {
        const ctx = arena({ prey: ['clown'], lowPower: mode === 'lowPower' });
        calm(ctx);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
        ctx.sharks[0].goal = { x: 1, y: 2, w: 3, boost: 1 };
        ctx.w.vacancies.push({ entry: ctx.prey[0][0].entry, species: 'clown', due: ctx.w.time + 60 });
        for (let i = 0; i < 5; i++) {
            ctx.w.time += 1 / FPS;
            Pred.step(ctx.pred, ctx.w, 1000 / FPS, { enabled: mode === 'lowPower', bubbles: ctx.bubbles });
        }
        assert.equal(ctx.sharks[0].goal, null, mode);
        assert.ok(ctx.w.vacancies.every(v => v.due <= ctx.w.time), `${mode}：空缺立刻到期`);
        assert.equal(Pred.summary(ctx.pred).hunters.length, 0, `${mode}：状态已丢弃`);
        ctx.w.vacancies.length = 0;                                                  // 冻结的世界不跑核心的补员：到期的空缺由用例清掉，免得挡住“空缺比例”
        tick(ctx, 12, { hunger: 1 });
        if (mode === 'lowPower') assert.equal(stats(ctx).hunts, 0, '省流量：一直不追');
        else assert.ok(stats(ctx).hunts >= 1, '重新打开之后可以再追（豁免期重新计时）');
    }
});

test('步长：非有限、小于 0.1 毫秒的步什么都不做；超长的步按 50 毫秒算', () => {
    const ctx = arena({ prey: ['clown'] });
    tick(ctx, 0.1, { hunger: 0 });
    const h = hunterOf(ctx);
    const before = h.hunger;
    for (const bad of [NaN, Infinity, -5, 0, 0.00001, undefined, '10']) {
        Pred.step(ctx.pred, ctx.w, bad, { enabled: true });
        if (bad === '10') continue;
        assert.equal(h.hunger, before, `dt = ${bad}`);
    }
    const h2 = hunterOf(ctx).hunger;
    Pred.step(ctx.pred, ctx.w, 10000, { enabled: true });
    assert.ok(Math.abs(hunterOf(ctx).hunger - h2 - 0.05 * PP.HUNGER_RATE) < 1e-12, '单步最长 50 毫秒');
});

// ---------- 猎物的反应 ----------

test('猎物的反应：捕食者在逼近/冲刺时，警戒半径内的鱼群在反应时间之后朝远离捕食者的方向跑（速度 = 自己巡航速度的 2.2 倍），半径外的、不是猎物的、巡航中的不受影响', () => {
    const ctx = arena({ prey: ['neon', 'clown', 'puffer'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    const neon = ctx.prey[0];
    const [clown] = ctx.prey[1];
    const [puffer] = ctx.prey[2];
    const radius = Math.min(PP.ALERT_LEN * shark.len + PP.ALERT_PAD * ctx.w.scale, PP.ALERT_MAX * ctx.w.scale);
    flock(ctx);
    placeAt(clown, { x: shark.x + radius * 1.3, y: shark.y + 10 });
    placeAt(puffer, { x: shark.x + radius * 0.5, y: shark.y + 20 });
    const quiet = JSON.stringify(ctx.w.fish.map(f => [f.vx, f.vy]));
    tick(ctx, 3, { hunger: 0 });                                                   // 巡航：谁都不惊动
    assert.equal(JSON.stringify(ctx.w.fish.map(f => [f.vx, f.vy])), quiet);
    assert.equal(Pred.summary(ctx.pred).alerts, 0);

    starve(ctx);
    const huntAt = ctx.w.time;
    tick(ctx, 0.6);
    assert.ok(['hunt', 'strike'].includes(phaseOf(ctx)));
    const since = huntAt + 0.5;                                                    // 第一次 PICK_S 之后才开始逼近
    assert.equal(Pred.summary(ctx.pred).alerts >= 1, true);
    const startedFleeing = neon.map(f => Math.hypot(f.vx, f.vy) > 0);
    assert.ok(startedFleeing.some(v => v) || ctx.w.time - since < PP.REACT_S + PP.PANIC_S, '反应时间之内不一定动');
    tick(ctx, 0.9);
    for (const f of neon) {
        const cruise = Core.cruiseSpeed(ctx.w, f);
        const speed = Math.hypot(f.vx, f.vy);
        assert.ok(speed > 0.9 * PP.FLEE_BOOST * cruise && speed <= PP.FLEE_BOOST * cruise + 1e-6, `${f.id}：${speed.toFixed(1)} px/s，约 ${(speed / cruise).toFixed(2)} 倍巡航速度`);
        const dx = f.x - shark.x;
        const dy = f.y - shark.y;
        const d = Math.hypot(dx, dy);
        assert.ok((f.vx * dx + f.vy * dy) / (speed * d) > 0.999, '正对着远离捕食者的方向');
    }
    assert.equal(clown.vx, 0, '半径之外的鱼不受影响');
    assert.equal(puffer.vx, 0, '不是猎物的鱼不受影响');
});

test('恐慌波：同群的鱼按各自的 seed 错开 0…0.3 秒才动，反应时间 0.25 秒之内谁都不动', () => {
    const ctx = arena({ prey: ['neon'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    const neon = ctx.prey[0];
    flock(ctx);
    neon.forEach((f, i) => { f.seed = i / 4; });                                  // 0, 0.25, 0.5, 0.75, 1
    starve(ctx);
    tick(ctx, 0.5);                                                                // 第一次挑目标在 PICK_S 之后；之后的逼近/冲刺里才有警戒
    const alertedAt = ctx.pred.alert.size ? ctx.pred.alert.values().next().value.since : null;
    assert.ok(alertedAt !== null, '警戒已经开始');
    const moved = () => neon.map(f => Math.hypot(f.vx, f.vy) > 0);
    const tNow = () => ctx.w.time - alertedAt;
    const log = [];
    for (let i = 0; i < 24; i++) {
        tick(ctx, 1 / FPS);
        log.push({ t: tNow(), moved: moved() });
    }
    for (const { t, moved: m } of log) {
        neon.forEach((f, i) => {
            const react = PP.REACT_S + PP.PANIC_S * f.seed;
            if (t < react - 1e-9) assert.equal(m[i], false, `seed ${f.seed}：${t.toFixed(2)} s 时还没到 ${react.toFixed(2)} s`);
            if (t > react + 1 / FPS + 1e-9) assert.equal(m[i], true, `seed ${f.seed}：${t.toFixed(2)} s 时应该已经在跑`);
        });
    }
    assert.ok(log[0].moved.every(v => v === false) || log[0].t > PP.REACT_S, '最初几帧谁都没动');
});

test('猎物在被抓着或被捞起时不跑：只有游着的（alive）受惊', () => {
    const ctx = arena({ prey: ['neon'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    flock(ctx);
    ctx.prey[0][0].state = 'held';
    ctx.prey[0][1].state = 'leaving';
    starve(ctx);
    tick(ctx, 2);
    assert.equal(ctx.prey[0][0].vx, 0);
    assert.equal(ctx.prey[0][1].vx, 0);
    assert.ok(ctx.prey[0][2].vx !== 0 || ctx.prey[0][3].vx !== 0, '游着的同伴照样跑');
});

test('追击结束后警戒解除', () => {
    const ctx = arena({ prey: ['neon'] });
    calm(ctx);
    const [shark] = ctx.sharks;
    flock(ctx);
    starve(ctx);
    tick(ctx, 0.8);
    assert.ok(Pred.summary(ctx.pred).alerts >= 1);
    ctx.prey[0].forEach(f => { f.state = 'held'; });                               // 目标都没了：追击失败转入恢复
    tick(ctx, 0.2, { hunger: 0 });
    assert.equal(phaseOf(ctx), 'rest');
    assert.equal(Pred.summary(ctx.pred).alerts, 0);
});

// ---------- 随机数与结构性隔离 ----------

test('随机数：create 只从 world.random 取一个数建独立随机流；之后整套狩猎（追击、冲刺、掷骰子、吞咽、恢复）不再碰 world.random', () => {
    const w = Core.createWorld({ width: W, height: H, random: countCalls(seeded(3)), lowPower: false });
    Core.reconcile(w, [entry('hammer'), entry('clown')], { instant: true });
    const before = w.random.calls;
    const pred = Pred.create(w);
    assert.equal(w.random.calls, before + 1, 'create 恰好取一个数');
    w.random = () => { throw new Error('捕食模块不该再碰 world.random'); };
    const ctx = { w, pred, sharks: w.fish.filter(f => f.species === 'hammer'), prey: [w.fish.filter(f => f.species === 'clown')], log: [] };
    ctx.bubbles = () => {};
    for (const f of w.fish) { f.vx = 0; f.vy = 0; f.ang = 0; f.alpha = 1; f.state = 'alive'; }
    put(ctx.sharks[0], 200, 360);
    calm(ctx);
    placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 12));
    starve(ctx);
    tick(ctx, 20, { hunger: 1 });
    assert.ok(stats(ctx).hunts >= 1 && stats(ctx).strikes >= 1, '确实狩猎过');
});

test('同一个种子同一个世界：整套狩猎逐步一致（可复现）', () => {
    const play = seed => {
        const ctx = arena({ prey: ['neon', 'clown'], seed });
        calm(ctx);
        ctx.prey[0].forEach((f, i) => put(f, ctx.sharks[0].x + 150 + i * 3, ctx.sharks[0].y + (i - 2) * 5));
        placeAt(ctx.prey[1][0], ahead(ctx.sharks[0], 12));
        const trace = [];
        for (let i = 0; i < 60 * FPS; i++) {
            tick(ctx, 1 / FPS, { hunger: 1 });
            trace.push([phaseOf(ctx), ctx.log.length, ctx.w.vacancies.length]);
        }
        return JSON.stringify([trace, Pred.summary(ctx.pred).stats]);
    };
    assert.equal(play(5), play(5));
});

test('水母永远不会被吃：模块里没有钟罩、没有水母，猎物只能是物种表里 diet 为 prey 的鱼', () => {
    const code = fs.readFileSync(path.join(__dirname, '../js/aquarium-predation-core.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /bells?\b|jelly|水母|钟罩/i, '捕食模块不认识水母这个输入');
    assert.doesNotMatch(code, /Math\.random|Date\.|performance\.|localStorage|sessionStorage|chrome\.|document\.|fetch\(|XMLHttpRequest|postMessage|setTimeout|setInterval|requestAnimationFrame/, '纯逻辑：没有随机源、时钟、存储、网络或调度');
    assert.equal((code.match(/world\.random\s*\(/g) || []).length, 1, 'world.random() 只在 create 里调用一次');
});

test('整链路（真实游动）：关闭或没有捕食者时，世界与没有这一层逐位一致；开着但没有可吃的也一样', () => {
    const build = (seed, species) => {
        const w = Core.createWorld({ width: W, height: H, random: seeded(seed), lowPower: false });
        Core.reconcile(w, species.map(id => entry(id)), { instant: true });
        return w;
    };
    const frames = 90 * FPS;
    const sig = w => JSON.stringify(w.fish.map(f => [f.x, f.y, f.vx, f.vy, f.ang, f.state, f.alpha]));
    for (const [label, species, enabled] of [
        ['关闭', ['hammer', 'neon', 'clown'], false],
        ['开着但没有捕食者', ['neon', 'tang', 'clown', 'angel', 'puffer', 'turtle'], true],
        ['开着但没有可吃的', ['hammer', 'puffer', 'turtle', 'manta'], true],
    ]) {
        const base = build(11, species);
        const test = build(11, species);
        const pred = Pred.create(test);
        base.random();                                                              // create 取了一个数：对照世界也取一个，两条流保持同步
        for (let i = 0; i < frames; i++) {
            Core.step(base, 1000 / FPS, {});
            Core.step(test, 1000 / FPS, {});
            Pred.step(pred, test, 1000 / FPS, { enabled, bubbles() {} });
        }
        assert.equal(sig(test), sig(base), `${label}：与没有捕食层逐位一致`);
        assert.equal(test.vacancies.length, 0);
    }
});

test('整链路（真实游动）：开着捕食时被吃的都是猎物、水母钟罩数据一个字节都不变、鱼的名单不变、几分钟后鱼的数量恢复', () => {
    const w = Core.createWorld({ width: W, height: H, random: seeded(21), lowPower: false });
    const entries = ['hammer', 'neon', 'tang', 'clown', 'angel', 'puffer', 'turtle'].map(id => entry(id));
    Core.reconcile(w, entries, { instant: true });
    const pred = Pred.create(w);
    const bells = [{ x: 400, y: 300, r: 60 }, { x: 900, y: 500, r: 80 }];
    const bellsBefore = JSON.stringify(bells);
    const entriesBefore = JSON.stringify(entries);
    const total = w.fish.length;
    const eaten = new Set();
    let maxFish = total;
    for (let i = 0; i < 20 * 60 * FPS; i++) {
        Core.step(w, 1000 / FPS, { bells });
        Pred.step(pred, w, 1000 / FPS, { enabled: true, bubbles() {} });
        for (const f of w.fish) if (f.eaten) eaten.add(f);
        maxFish = Math.max(maxFish, w.fish.length);
        assert.ok(w.fish.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx) && Number.isFinite(f.vy)), '位置与速度始终是有限数');
    }
    assert.ok(eaten.size >= 5, `20 分钟里吃了 ${eaten.size} 条（期望约 8–9）`);
    for (const f of eaten) assert.equal(spec(f.species).diet, 'prey', `${f.species} 是猎物`);
    assert.ok(['hammer', 'puffer', 'turtle'].every(id => !Array.from(eaten).some(f => f.species === id)));
    assert.equal(JSON.stringify(bells), bellsBefore, '钟罩数据没被碰过');
    assert.equal(JSON.stringify(entries), entriesBefore, '条目名单没被碰过');
    assert.ok(maxFish <= total + 1, `鱼的总数不会超过 ${total} + 1（被吞的与新补的短暂并存）：${maxFish}`);
    const stop = { enabled: false };
    for (let i = 0; i < 100 * FPS; i++) { Core.step(w, 1000 / FPS, { bells }); Pred.step(pred, w, 1000 / FPS, stop); }
    assert.equal(w.fish.length, total, '关掉之后所有空缺补齐，鱼数恢复');
    assert.equal(w.vacancies.length, 0);
});

// ---------- 统计（种子化，可复现） ----------

function statistics({ seeds, minutes = 10, mix = ['hammer', 'neon', 'tang', 'clown', 'angel'], width = W, height = H, fps = FPS, enabled = true }) {
    const rows = [];
    for (let k = 1; k <= seeds; k++) {
        const w = Core.createWorld({ width, height, random: seeded(1000 + k * 7919), lowPower: false });
        Core.reconcile(w, mix.map(id => entry(id)), { instant: true });
        const pred = Pred.create(w);
        const preyTotal = w.fish.filter(f => spec(f.species).diet === 'prey').length;
        let minAlive = preyTotal;
        let huntFrames = 0;
        let frames = 0;
        for (let i = 0; i < minutes * 60 * fps; i++) {
            Core.step(w, 1000 / fps, {});
            Pred.step(pred, w, 1000 / fps, { enabled, bubbles() {} });
            minAlive = Math.min(minAlive, w.fish.filter(f => spec(f.species).diet === 'prey' && f.state !== 'leaving').length);
            if (i % 6 === 0) { frames++; if (Pred.summary(pred).hunters.some(h => h.phase === 'hunt' || h.phase === 'strike')) huntFrames++; }
        }
        const s = Pred.summary(pred);
        rows.push({ captures: s.stats.captures, hunts: s.stats.hunts, chases: s.stats.chases, minSurvival: minAlive / preyTotal, huntShare: huntFrames / frames });
    }
    return rows;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

test('统计校准（小锤头鲨 + 霓虹灯鱼 + 蓝吊 + 小丑鱼 + 神仙鱼，10 分钟，种子化 12 次）：约每两三分钟一条、追击不超时、不清场、常态下大多数时间是在巡游', () => {
    const rows = statistics({ seeds: 12 });
    const caps = rows.map(r => r.captures);
    assert.ok(mean(caps) >= 3.3 && mean(caps) <= 5.3, `平均每 10 分钟 ${mean(caps).toFixed(2)} 条（期望约 4.3）`);
    assert.ok(Math.min(...caps) >= 2 && Math.max(...caps) <= 8, `最少 ${Math.min(...caps)}、最多 ${Math.max(...caps)}`);
    const chases = rows.flatMap(r => r.chases);
    assert.ok(chases.length >= 80, `追击 ${chases.length} 次`);
    assert.ok(Math.max(...chases) <= PP.HUNT_MAX_S + PP.STRIKE_S + 0.3, `最长一次追击 ${Math.max(...chases).toFixed(1)} 秒`);
    assert.ok(Math.min(...rows.map(r => r.minSurvival)) >= 0.75, `最低存活比例 ${Math.min(...rows.map(r => r.minSurvival)).toFixed(2)}`);
    assert.ok(mean(rows.map(r => r.huntShare)) > 0.05 && mean(rows.map(r => r.huntShare)) < 0.25, `追击占的时间 ${mean(rows.map(r => r.huntShare)).toFixed(3)}`);
});

test('统计校准：捕食关闭时 10 分钟里一条都没吃、没有追击；放大屏幕与降低帧率时频率基本不变', () => {
    const off = statistics({ seeds: 3, enabled: false });
    assert.ok(off.every(r => r.captures === 0 && r.hunts === 0 && r.minSurvival === 1));
    const big = statistics({ seeds: 6, width: 1920, height: 1080, fps: 20 });
    assert.ok(mean(big.map(r => r.captures)) >= 3 && mean(big.map(r => r.captures)) <= 5.5, `1920×1080、20 帧：${mean(big.map(r => r.captures)).toFixed(2)}`);
    const small = statistics({ seeds: 6, width: 800, height: 600, fps: 60 });
    assert.ok(mean(small.map(r => r.captures)) >= 3 && mean(small.map(r => r.captures)) <= 5.5, `800×600、60 帧：${mean(small.map(r => r.captures)).toFixed(2)}`);
});

test('统计校准：只有两条小鱼的小鱼缸一次最多被吃 1 条（最低存活 50%）；只有成群的鱼时不超过三成空缺', () => {
    const tiny = statistics({ seeds: 6, mix: ['hammer', 'clown', 'angel'] });
    assert.ok(Math.min(...tiny.map(r => r.minSurvival)) >= 0.5, `${Math.min(...tiny.map(r => r.minSurvival))}`);
    assert.ok(mean(tiny.map(r => r.captures)) >= 2, '小鱼缸里也会吃');
    const schools = statistics({ seeds: 6, mix: ['hammer', 'neon', 'tang'] });
    assert.ok(Math.min(...schools.map(r => r.minSurvival)) >= 0.7, `${Math.min(...schools.map(r => r.minSurvival))}`);
});


// ======================================================================================================
// 变异检查补强（2026-10-20）：对 js/aquarium-predation-core.js 做了 728 个变异的扫描，存活的 138 个里能观察到的都在这里钉住。
// 做法是“单步 + 注入状态”：世界时间钉在 100（不推进），所有鱼早已被看到，捕食者极饿、所有计时过期，
// 然后只改一个条件、调一次 Pred.step，看那一个条件是否单独起作用；边界取“正好相等”，用 exactAhead 补偿浮点舍入。
// 取不到观察口的存活变异（等价变异或只在浮点相等的一点上才有区别）在技术文档“变异检查”一节逐个说明。
// ======================================================================================================

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}：${a} ≠ ${b}`);
/** 依次返回给定的值，用完以后一直返回 0.5。 */
const seqRnd = (...values) => { let i = 0; return () => (i < values.length ? values[i++] : 0.5); };
/** 单步，不推进世界时间（options 缺省 = 开启 + 记录冒泡）。 */
const once = (ctx, options) => Pred.step(ctx.pred, ctx.w, 1000 / FPS, options || { enabled: true, bubbles: ctx.bubbles });
/** 补偿浮点舍入：返回 x，使 x − base 正好等于 d。 */
function exactX(base, d) {
    let x = base + d;
    for (let i = 0; i < 8 && x - base !== d; i++) x += d - (x - base);
    assert.equal(x - base, d, '前置条件：浮点上正好相距 d');
    return x;
}
/** 把捕食者平移到嘴的 x 正好是 x0（它自己的 x 可以是负的：状态机不看捕食者在不在画面里）。 */
function alignMouth(shark, x0 = 0) {
    for (let i = 0; i < 8 && mouth(shark).x !== x0; i++) shark.x += x0 - mouth(shark).x;
    assert.equal(mouth(shark).x, x0, '前置条件：嘴正好在 x0');
}
/**
 * 嘴前方（沿 +x，同一高度）浮点上正好 d px 的位置。做法：先把嘴挪到 x = 0，这样 x = d 就是正好相距 d
 * （嘴在 270 左右时，x − mouth.x 能取到的值落在另一套格点上，d 不一定取得到）。会移动捕食者。
 */
const exactAhead = (shark, d) => { alignMouth(shark); return { x: d, y: mouth(shark).y }; };
/**
 * 世界时间钉在 100，所有鱼早已“被看到”，所有捕食者极饿、没有任何计时在身。之后 once 一步的结果只取决于用例改了什么。
 * 小锤头鲨在 (200, 0.4 × 高)，朝右。
 */
function primed(prey = ['clown'], opts = {}) {
    const ctx = arena(Object.assign({ prey }, opts));
    calm(ctx);
    ctx.w.time = 100;
    for (const f of ctx.w.fish) ctx.pred.firstSeen.set(f.id, 0);
    for (const sh of ctx.sharks) {
        const h = ctx.pred.hunters.get(sh.id);
        h.hunger = 1; h.nextPick = 0; h.restUntil = 0; h.giveUpUntil = 0;
    }
    return ctx;
}
const huntsOf = ctx => stats(ctx).hunts;

test('随机流是标准的 mulberry32：与公开参考值一致（种子 1 的第一个数是 0.6270739405881613）；种子按无符号 32 位取', () => {
    const take = (seed, n = 3) => { const r = Pred.seededRandom(seed); return Array.from({ length: n }, () => r()); };
    assert.deepEqual(take(1), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    assert.deepEqual(take(0), [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);        // 本机实现的输出，作为回归钉子
    assert.deepEqual(take(2147483648, 2), [0.8205775609239936, 0.4481089550536126]);
    assert.deepEqual(take(-1, 2), take(4294967295, 2), '负数种子按 >>> 0 取');
    assert.deepEqual(take(4294967296 + 5, 2), take(5, 2), '超过 32 位的种子取低 32 位');
    assert.deepEqual(take(1.9, 2), take(1, 2), '小数种子取整数部分');
});

test('create：种子 = floor(world.random() × 2^32)；没有 world.random、world 是 null、取到非有限数时种子为 0；初始状态全空', () => {
    const from = r => Pred.create({ random: () => r }).rnd();
    assert.equal(from(0.5), Pred.seededRandom(2147483648)());
    assert.equal(from(0.25), Pred.seededRandom(1073741824)());
    assert.equal(Pred.create({}).rnd(), Pred.seededRandom(0)(), '没有 world.random');
    assert.equal(Pred.create(null).rnd(), Pred.seededRandom(0)(), 'world 是 null 也不抛');
    assert.equal(from(NaN), Pred.seededRandom(0)(), '非有限数当 0');
    assert.equal(from(Infinity), Pred.seededRandom(0)(), '无穷当 0');

    const fresh = Pred.create({ random: () => 0.5 });
    assert.deepEqual(Object.keys(fresh).sort(), ['alert', 'firstSeen', 'heldAt', 'hunters', 'lastKill', 'rnd', 'stats', 'swallowing']);
    assert.equal(fresh.lastKill, -Infinity);
    assert.deepEqual(Object.assign({}, fresh.stats, { ended: Object.assign({}, fresh.stats.ended) }), { hunts: 0, strikes: 0, captures: 0, giveups: 0, ended: {}, chases: [] });
    assert.equal(Object.getPrototypeOf(fresh.stats.ended), null, 'ended 是无原型对象：原因名不会撞上 Object.prototype 的键');
    for (const key of ['hunters', 'firstSeen', 'heldAt', 'alert']) assert.ok(fresh[key] instanceof Map && fresh[key].size === 0, key);
    assert.deepEqual(fresh.swallowing, []);
});

test('新捕食者的饥饿度 = HUNGER_START + HUNGER_SPAN × 独立随机流的第一个数 + 这一步的 HUNGER_RATE × dt；饥饿度封顶 1', () => {
    const w = Core.createWorld({ width: W, height: H, random: seeded(5) });
    const pred = Pred.create(w);                                                   // 先于 reconcile：取走 world.random 的第一个数作种子
    Core.reconcile(w, [entry('hammer')], { instant: true });
    const first = Pred.seededRandom(Math.floor(seeded(5)() * 4294967296))();
    const shark = w.fish[0];
    shark.state = 'alive'; shark.alpha = 1;
    w.time = 1;
    Pred.step(pred, w, 50, { enabled: true });
    const h = pred.hunters.get(shark.id);
    near(h.hunger, PP.HUNGER_START + PP.HUNGER_SPAN * first + PP.HUNGER_RATE * 0.05, '初始饥饿度');
    assert.equal(h.phase, 'cruise');
    assert.equal(h.fails, 0);
    assert.deepEqual([h.nextPick, h.huntStart, h.strikeEnd, h.until, h.restUntil, h.giveUpUntil], [0, 0, 0, 0, 0, 0].map((_, i) => (i === 0 ? h.nextPick : 0)), '计时字段初值全是 0（nextPick 随第一次找目标而变）');
    assert.equal(h.boost, PP.STRIKE_BOOST_MIN);
    assert.equal(h.rolled, false);
    assert.equal(h.targetId, null);

    h.hunger = 1.99;
    w.time += 0.05;
    Pred.step(pred, w, 50, { enabled: true });
    assert.equal(h.hunger, 1, '饥饿度封顶 1');
});

test('追击时长表最多记 256 条，满了丢最老的', () => {
    const ctx = arena({ prey: ['clown'] });
    tick(ctx, 0.1, { hunger: 0 });
    const h = hunterOf(ctx);
    for (let i = 0; i < 300; i++) {
        h.phase = 'strike'; h.huntStart = ctx.w.time - i;
        assert.equal(Pred.disturb(ctx.pred, ctx.w, ctx.sharks[0]), true);
    }
    const chases = stats(ctx).chases;
    assert.equal(chases.length, 256);
    assert.equal(chases[0], 44);
    assert.equal(chases[255], 299);
});

test('谁能吃谁：口径与体长是无穷大时一律不能吃（不能因为 ∞ ≤ ∞ 而成立）', () => {
    const shark = { diet: 'predator', gape: 0.3, meters: 2 };
    assert.equal(Pred.canEat(Object.assign({}, shark, { meters: Infinity }), { diet: 'prey', meters: 1 }), false);
    assert.equal(Pred.canEat(Object.assign({}, shark, { gape: Infinity }), { diet: 'prey', meters: 1 }), false);
    assert.equal(Pred.canEat(shark, { diet: 'prey', meters: Infinity }), false);
});

test('是不是在鱼群里：同伴恰好在聚合半径上也算（≤），差一点点就不算', () => {
    const ctx = arena({ prey: ['neon'] });
    const group = ctx.prey[0];
    const prey = group[0];
    const radius = Core.PARAMS.COH_R * prey.len;
    put(prey, 500, 300);
    for (const f of group.slice(1)) put(f, exactX(500, radius), 300);
    assert.equal(Pred.inSchool(ctx.w, prey), true, '恰好在半径上');
    put(group[1], exactX(500, radius) + 0.01, 300);
    assert.equal(Pred.inSchool(ctx.w, prey), false, '有一条差一点');
});

test('合格的猎物：alpha ≥ MIN_ALPHA（等于也行）、被看到满 ENTER_SAFE_S 秒（正好满也行）、被抓过 SAFE_S 秒之内不当目标', () => {
    const hunts = patch => {
        const ctx = primed(['clown']);
        const clown = ctx.prey[0][0];
        placeAt(clown, ahead(ctx.sharks[0], 300));
        patch(ctx, clown);
        once(ctx);
        return huntsOf(ctx);
    };
    assert.equal(hunts(() => {}), 1, '基线：选上它');
    assert.equal(hunts((c, f) => { f.alpha = PP.MIN_ALPHA; }), 1, 'alpha 恰好等于下限：合格');
    assert.equal(hunts((c, f) => { f.alpha = PP.MIN_ALPHA - 1e-9; }), 0, 'alpha 差一点：不合格');
    assert.equal(hunts((c, f) => { c.pred.firstSeen.set(f.id, 100 - PP.ENTER_SAFE_S); }), 1, '被看到正好满 ENTER_SAFE_S 秒：合格');
    assert.equal(hunts((c, f) => { c.pred.firstSeen.set(f.id, 100 - PP.ENTER_SAFE_S + 0.001); }), 0, '差一点：不合格');
    assert.equal(hunts((c, f) => { c.pred.heldAt.set(f.id, 100 - PP.SAFE_S + 0.5); }), 0, '被抓过不到 SAFE_S 秒：不合格');
    assert.equal(hunts((c, f) => { c.pred.heldAt.set(f.id, 100 - PP.SAFE_S); }), 1, '被抓过正好满 SAFE_S 秒：合格');
});

test('追击中目标越过画面边界就不再合格：x ∈ [0, 宽]、y ∈ [0, 高]，正好在边界上仍然合格', () => {
    const run = place => {
        const ctx = primed(['clown']);
        const clown = ctx.prey[0][0];
        placeAt(clown, ahead(ctx.sharks[0], 150));
        once(ctx);
        assert.equal(phaseOf(ctx), 'strike', '前置条件：已经开始冲刺');
        placeAt(clown, place);
        once(ctx);
        return stats(ctx).ended.ineligible || 0;
    };
    const midY = H * 0.4;
    for (const [label, place, out] of [
        ['x = 0', { x: 0, y: midY }, false], ['x = −0.001', { x: -0.001, y: midY }, true],
        ['x = 宽', { x: W, y: midY }, false], ['x = 宽 + 0.001', { x: W + 0.001, y: midY }, true],
        ['y = 0', { x: 600, y: 0 }, false], ['y = −0.001', { x: 600, y: -0.001 }, true],
        ['y = 高', { x: 600, y: H }, false], ['y = 高 + 0.001', { x: 600, y: H + 0.001 }, true],
    ]) assert.equal(run(place), out ? 1 : 0, label);
});

test('够得着：高度在活动带上下各延伸 REACH_BAND 个体长以内（边界上也算）；感知半径 = min(SENSE_LEN × 体长, 屏宽 × SENSE_MAX)，正好在半径上也算', () => {
    const hunts = place => {
        const ctx = primed(['clown']);
        place(ctx.prey[0][0], ctx.sharks[0]);
        once(ctx);
        return huntsOf(ctx);
    };
    const band = spec('hammer').band;
    const margin = f => f.len * PP.REACH_BAND;
    const at = yOf => (clown, shark) => placeAt(clown, { x: mouth(shark).x + 50, y: yOf(shark) });
    assert.equal(hunts(at(f => band[0] * H - margin(f))), 1, '活动带下沿外延的边界上');
    assert.equal(hunts(at(f => band[0] * H - margin(f) - 0.01)), 0, '差一点');
    assert.equal(hunts(at(f => band[1] * H + margin(f))), 1, '上沿外延的边界上');
    assert.equal(hunts(at(f => band[1] * H + margin(f) + 0.01)), 0, '差一点');

    const sense = shark => Math.min(PP.SENSE_LEN * shark.len, W * PP.SENSE_MAX);
    assert.equal(hunts((clown, shark) => placeAt(clown, exactAhead(shark, sense(shark)))), 1, '正好在感知半径上');
    assert.equal(hunts((clown, shark) => placeAt(clown, ahead(shark, sense(shark) + 0.01))), 0, '差一点');
});

test('成本一样时取 world.fish 里靠前的，与位置无关', () => {
    const ctx = primed(['clown', 'clown']);
    const [shark] = ctx.sharks;
    const [a] = ctx.prey[0];
    const [b] = ctx.prey[1];
    assert.ok(ctx.w.fish.indexOf(a) < ctx.w.fish.indexOf(b));
    placeAt(a, ahead(shark, 300, 60));
    placeAt(b, ahead(shark, 300, -60));
    once(ctx);
    assert.equal(hunterOf(ctx).targetId, a.id, '一上一下对称：取靠前的 a');

    const swapped = primed(['clown', 'clown']);
    placeAt(swapped.prey[0][0], ahead(swapped.sharks[0], 300, -60));
    placeAt(swapped.prey[1][0], ahead(swapped.sharks[0], 300, 60));
    once(swapped);
    assert.equal(hunterOf(swapped).targetId, swapped.prey[0][0].id, '位置对调：仍取靠前的');
});

test('换目标的比较用“现在这个目标”的真实成本（嘴到它的距离、朝向与它的夹角）：便宜到 SWITCH_RATIO 以下才换，只差 1 px 都不换', () => {
    const switched = delta => {
        const ctx = primed(['clown', 'clown']);
        const [shark] = ctx.sharks;
        const [a] = ctx.prey[0];
        const [b] = ctx.prey[1];
        alignMouth(shark);                                                         // 嘴在 x = 0：“正好相距 threshold”在浮点上才取得到
        placeAt(b, { x: 700, y: 5 });                                              // b 先放在活动带之外
        placeAt(a, ahead(shark, 300, 165));                                        // a 偏上、够得着：与朝向差约 0.5 弧度
        once(ctx);
        assert.equal(hunterOf(ctx).targetId, a.id, '前置条件：先盯上 a');
        assert.equal(phaseOf(ctx), 'hunt');
        const m = mouth(shark);
        const distance = Math.hypot(a.x - m.x, a.y - m.y);
        const turn = Math.abs(Core.angleDiff(shark.ang, Math.atan2(a.y - m.y, a.x - m.x)));
        assert.ok(turn > 0.4 && turn < 0.6, `前置条件：夹角 ${turn}`);
        const threshold = Pred.costOf(distance, false, turn) * PP.SWITCH_RATIO;
        placeAt(b, { x: delta === 0 ? exactX(m.x, threshold) : m.x + threshold + delta, y: m.y });   // b 在正前方：成本就是距离（delta 为 0 时补偿浮点舍入，正好等于门槛）
        hunterOf(ctx).nextPick = ctx.w.time;
        once(ctx);
        return hunterOf(ctx).targetId === b.id;
    };
    assert.equal(switched(+1), false, '比门槛贵 1 px：不换');
    assert.equal(switched(0), false, '正好等于门槛：不换（严格便宜才换）');
    assert.equal(switched(-1), true, '比门槛便宜 1 px：换');
});

test('连续失败：第 3 次失败进入放弃期（计数清零、恢复期取更长的放弃期），之后要再连续失败 3 次才再放弃', () => {
    const ctx = primed(['clown']);
    const h = hunterOf(ctx);
    const failOnce = () => { h.phase = 'strike'; h.huntStart = ctx.w.time; assert.equal(Pred.disturb(ctx.pred, ctx.w, ctx.sharks[0]), true); };
    failOnce(); failOnce();
    assert.equal(h.fails, 2);
    assert.equal(stats(ctx).giveups, 0);
    assert.ok(h.restUntil >= 100 + PP.REST_MIN_S && h.restUntil <= 100 + PP.REST_MAX_S, `恢复期 ${h.restUntil - 100} 秒`);
    assert.equal(h.giveUpUntil, 0);
    failOnce();
    assert.equal(stats(ctx).giveups, 1);
    assert.equal(h.fails, 0, '放弃时计数清零');
    assert.equal(h.giveUpUntil, 100 + PP.GIVEUP_S);
    assert.equal(h.restUntil, h.giveUpUntil, '放弃期比普通恢复期长，恢复期取放弃期');
    failOnce(); failOnce();
    assert.equal(stats(ctx).giveups, 1, '重新数：还差一次');
    failOnce();
    assert.equal(stats(ctx).giveups, 2);
});

test('巡航阶段的门槛：饥饿度、恢复期、放弃期、选目标间隔各自单独成立都不狩猎；正好到点就放行', () => {
    const hunts = patch => {
        const ctx = primed(['clown']);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
        patch(hunterOf(ctx));
        once(ctx);
        return huntsOf(ctx);
    };
    const step = (1000 / FPS) / 1000;
    const gain = PP.HUNGER_RATE * step;
    let before = PP.HUNGER_THRESHOLD - gain;                                       // 这一步长完正好等于阈值的饥饿度（补偿浮点舍入）
    for (let i = 0; i < 8 && before + gain !== PP.HUNGER_THRESHOLD; i++) before += PP.HUNGER_THRESHOLD - (before + gain);
    assert.equal(before + gain, PP.HUNGER_THRESHOLD, '前置条件');

    assert.equal(hunts(() => {}), 1, '基线');
    assert.equal(hunts(h => { h.hunger = before; }), 1, '这一步长到正好等于阈值：放行');
    assert.equal(hunts(h => { h.hunger = before - 0.001; }), 0, '低一点：不去');
    assert.equal(hunts(h => { h.restUntil = 100; }), 1, '恢复期正好到点：放行');
    assert.equal(hunts(h => { h.restUntil = 100.001; }), 0, '恢复期还差一点：不去');
    assert.equal(hunts(h => { h.giveUpUntil = 100; }), 1, '放弃期正好到点：放行');
    assert.equal(hunts(h => { h.giveUpUntil = 100.001; }), 0, '放弃期还差一点：不去');
    assert.equal(hunts(h => { h.nextPick = 100; }), 1, '选目标的间隔正好到点：放行');
    assert.equal(hunts(h => { h.nextPick = 100.001; }), 0, '间隔还差一点：不找');
});

test('选目标的节拍：没找到也要隔 PICK_S 秒才再找；找到后同样隔 PICK_S 秒才重新比成本（没到点不重选，正好到点就重选）', () => {
    const none = primed(['clown']);
    placeAt(none.prey[0][0], { x: 700, y: 5 });                                    // 活动带之外：找不到
    once(none);
    assert.equal(huntsOf(none), 0);
    assert.equal(hunterOf(none).nextPick, 100 + PP.PICK_S, '没找到：下一次推迟 PICK_S 秒');

    const ctx = primed(['clown']);
    placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
    once(ctx);
    const h = hunterOf(ctx);
    assert.equal(h.phase, 'hunt');
    assert.equal(h.nextPick, 100 + PP.PICK_S, '找到：也推迟 PICK_S 秒');
    ctx.w.time = 100.2;
    once(ctx);
    assert.equal(h.nextPick, 100 + PP.PICK_S, '没到点不重选：节拍不变');
    ctx.w.time = 100 + PP.PICK_S;
    once(ctx);
    assert.equal(h.nextPick, 100 + 2 * PP.PICK_S, '正好到点就重选：下一次再隔 PICK_S 秒');
});

test('追击的两个放弃条件：追了超过 HUNT_MAX_S 秒才算超时、目标离开超过感知半径的 SENSE_LOSE 倍才算丢了（正好等于都不算）', () => {
    const start = () => {
        const ctx = primed(['clown']);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
        once(ctx);
        assert.equal(phaseOf(ctx), 'hunt');
        return ctx;
    };
    const a = start();
    hunterOf(a).huntStart = a.w.time - PP.HUNT_MAX_S;
    once(a);
    assert.equal(phaseOf(a), 'hunt', '正好 HUNT_MAX_S 秒：还没超时');
    hunterOf(a).huntStart = a.w.time - PP.HUNT_MAX_S - 0.001;
    once(a);
    assert.equal(stats(a).ended.timeout, 1);
    assert.equal(phaseOf(a), 'rest');

    const lose = Math.min(PP.SENSE_LEN * start().sharks[0].len, W * PP.SENSE_MAX) * PP.SENSE_LOSE;
    const b = start();
    placeAt(b.prey[0][0], exactAhead(b.sharks[0], lose));
    once(b);
    assert.equal(phaseOf(b), 'hunt', '正好在 SENSE_LOSE × 感知半径上：没丢');
    placeAt(b.prey[0][0], ahead(b.sharks[0], lose + 0.001));
    once(b);
    assert.equal(stats(b).ended.sense, 1);
});

test('冲刺的距离门槛：嘴到猎物正好等于 STRIKE_R × 体长就转入冲刺，差一点点还是逼近', () => {
    const phase = extra => {
        const ctx = primed(['clown']);
        const [shark] = ctx.sharks;
        placeAt(ctx.prey[0][0], extra === 0 ? exactAhead(shark, PP.STRIKE_R * shark.len) : ahead(shark, PP.STRIKE_R * shark.len + extra));
        once(ctx);
        return phaseOf(ctx);
    };
    assert.equal(phase(0), 'strike');
    assert.equal(phase(0.01), 'hunt');
});

test('追击的目标点：猎物当前位置沿它的速度前推 lead 秒，lead = 到猎物中心的距离 ÷ 当时的游速、夹在 0…LEAD_MAX_S；逼近与冲刺各写各的权重、速度与加速度', () => {
    const close = primed(['clown']);
    const [shark] = close.sharks;
    const clown = close.prey[0][0];
    placeAt(clown, ahead(shark, 45));
    clown.vx = 30; clown.vy = -12;
    once(close);
    const h = hunterOf(close);
    assert.equal(h.phase, 'strike');
    const cruise = Core.cruiseSpeed(close.w, shark) * h.boost;
    const lead = Math.hypot(clown.x - shark.x, clown.y - shark.y) / cruise;
    assert.ok(lead > 0.3 && lead < 0.9, `前置条件：lead = ${lead}`);
    assert.deepEqual(Object.keys(shark.goal).sort(), ['accel', 'boost', 'w', 'x', 'y']);
    near(shark.goal.x, clown.x + clown.vx * lead, '冲刺 goal.x');
    near(shark.goal.y, clown.y + clown.vy * lead, '冲刺 goal.y');
    assert.equal(shark.goal.w, PP.HUNT_W);
    assert.equal(shark.goal.boost, h.boost);
    assert.equal(shark.goal.accel, PP.STRIKE_ACCEL);

    const far = primed(['clown']);
    const farClown = far.prey[0][0];
    placeAt(farClown, ahead(far.sharks[0], 400));
    farClown.vx = 30; farClown.vy = -12;
    once(far);
    assert.equal(phaseOf(far), 'hunt');
    const g = far.sharks[0].goal;
    near(g.x, farClown.x + 30, '逼近 goal.x（lead 夹在上限 1 秒）');
    near(g.y, farClown.y - 12, '逼近 goal.y');
    assert.equal(g.w, PP.HUNT_W);
    assert.equal(g.boost, PP.HUNT_BOOST);
    assert.equal(g.accel, undefined, '逼近阶段不带加速度');
});

test('能不能再吃一条：距上次捕获满 KILL_GAP_S 秒才行（正好满算）；空缺满 MAX_VACANCIES 个不行；空缺要少于（活着的猎物 + 空缺）的三成，至少允许 1 个', () => {
    const hunts = (prey, vacancies, patch) => {
        const ctx = primed(prey);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 300));
        for (let i = 0; i < vacancies; i++) ctx.w.vacancies.push({ entry: 'ghost', species: 'neon', due: Infinity });
        if (patch) patch(ctx);
        once(ctx);
        return huntsOf(ctx);
    };
    assert.equal(hunts(['clown'], 0, c => { c.pred.lastKill = 100 - PP.KILL_GAP_S; }), 1, '距上次捕获正好 KILL_GAP_S 秒');
    assert.equal(hunts(['clown'], 0, c => { c.pred.lastKill = 100 - PP.KILL_GAP_S + 0.001; }), 0, '差一点');

    const six = ['neon', 'neon', 'neon', 'neon', 'neon', 'neon'];                  // 30 条活着的猎物
    assert.equal(hunts(six, Core.PARAMS.MAX_VACANCIES - 1), 1, `空缺 ${Core.PARAMS.MAX_VACANCIES - 1} 个：还能吃`);
    assert.equal(hunts(six, Core.PARAMS.MAX_VACANCIES), 0, `空缺满 ${Core.PARAMS.MAX_VACANCIES} 个：三成的份额够用，但上限到了`);

    const seven = ['neon', 'clown', 'angel'];                                      // 5 + 1 + 1 = 7 条活着的猎物
    assert.equal(hunts(seven, 1), 1, '7 条 + 空缺 1：1 < floor(0.3 × 8) = 2');
    assert.equal(hunts(seven, 2), 0, '7 条 + 空缺 2：2 < floor(0.3 × 9) = 2 不成立');
    assert.equal(hunts(['clown', 'angel'], 0), 1, '小鱼缸（2 条）：至少允许 1 个空缺');
    assert.equal(hunts(['clown', 'angel'], 1), 0, '小鱼缸已有 1 个空缺：不再吃');
});

test('吃下一条的细节：冒泡个数 = BUBBLES + floor(随机 × 2)；没有冒泡回调也不出错；连续失败计数清零；这一步的目标点是“原地慢游”', () => {
    const eat = (rolls, options, patch) => {
        const ctx = primed(['clown']);
        placeAt(ctx.prey[0][0], ahead(ctx.sharks[0], 10));
        ctx.pred.rnd = seqRnd(...rolls);                                           // 第一个数掷命中，第二个数决定冒泡个数
        if (patch) patch(ctx);
        once(ctx, options);
        return ctx;
    };
    const low = eat([0.1, 0]);
    assert.equal(stats(low).captures, 1);
    assert.equal(low.log.length, 1);
    assert.equal(low.log[0].count, PP.BUBBLES, 'floor(0 × 2) = 0');
    assert.equal(eat([0.1, 0.5]).log[0].count, PP.BUBBLES + 1, 'floor(0.5 × 2) = 1');
    assert.equal(eat([0.1, 0.99]).log[0].count, PP.BUBBLES + 1, 'floor(0.99 × 2) = 1，不会更多');

    const noCallback = eat([0.1, 0.5], { enabled: true });
    assert.equal(stats(noCallback).captures, 1, '没有冒泡回调：照吃');
    assert.equal(noCallback.log.length, 0);
    assert.equal(stats(eat([0.1, 0.5], { enabled: true, bubbles: 5 })).captures, 1, '冒泡回调不是函数：照吃');

    const reset = eat([0.1, 0.5], null, c => { hunterOf(c).fails = 2; });
    assert.equal(hunterOf(reset).fails, 0, '吃到之后失败计数清零');
    const shark = reset.sharks[0];
    assert.deepEqual(shark.goal, { x: shark.x, y: shark.y, w: 0, boost: PP.HANDLE_PACE }, '这一步就改成原地慢游');
    assert.equal(reset.pred.lastKill, 100);
});

test('吞咽与恢复的结束：正好到点就回到巡航，没到点继续（吞咽时原地慢游）', () => {
    const ctx = primed(['clown']);
    const h = hunterOf(ctx);
    const [shark] = ctx.sharks;
    h.phase = 'handle'; h.until = 100.001;
    once(ctx);
    assert.equal(h.phase, 'handle');
    assert.deepEqual(shark.goal, { x: shark.x, y: shark.y, w: 0, boost: PP.HANDLE_PACE });
    h.until = 100;
    once(ctx);
    assert.equal(h.phase, 'cruise', '吞咽正好到点：回到巡航');
    assert.equal(shark.goal, null);
    h.phase = 'rest'; h.restUntil = 100.001;
    once(ctx);
    assert.equal(h.phase, 'rest');
    h.restUntil = 100;
    once(ctx);
    assert.equal(h.phase, 'cruise', '恢复正好到点：回到巡航');
});

test('冲刺的边界：冲刺时间正好到点就记失败；嘴到猎物正好等于够得着的半径就掷骰子（差一点不掷）；骰子正好等于命中概率算没中', () => {
    const strike = (patch) => {
        const ctx = primed(['clown']);
        const [shark] = ctx.sharks;
        const clown = ctx.prey[0][0];
        placeAt(clown, ahead(shark, 100));                                         // 在冲刺范围里、但够不着
        once(ctx);
        assert.equal(phaseOf(ctx), 'strike', '前置条件');
        patch(ctx, shark, clown);
        once(ctx);
        return ctx;
    };
    const reachOf = shark => Play.PARAMS.EAT_R_MOUTH * shark.len + Play.PARAMS.EAT_R_PAD;
    assert.ok(Play.PARAMS.EAT_R_PAD >= 1, '前置条件：够得着的半径里有固定的 PAD');

    const onEdge = strike((c, shark, clown) => { c.pred.rnd = () => 1; placeAt(clown, exactAhead(shark, reachOf(shark))); });
    assert.equal(hunterOf(onEdge).rolled, true, '正好在够得着的半径上：掷了');
    const outside = strike((c, shark, clown) => { c.pred.rnd = () => 1; placeAt(clown, ahead(shark, reachOf(shark) + 0.01)); });
    assert.equal(hunterOf(outside).rolled, false, '差一点：没掷');
    const inside = strike((c, shark, clown) => { c.pred.rnd = () => 1; placeAt(clown, ahead(shark, reachOf(shark) - 1)); });
    assert.equal(hunterOf(inside).rolled, true, '半径里 1 px：掷了（PAD 不能是减的）');

    const tie = strike((c, shark, clown) => { c.pred.rnd = () => Pred.catchChance(false); placeAt(clown, exactAhead(shark, 10)); });
    assert.equal(hunterOf(tie).rolled, true);
    assert.equal(stats(tie).captures, 0, '骰子正好等于命中概率：没中');
    const hit = strike((c, shark, clown) => { c.pred.rnd = () => Pred.catchChance(false) - 1e-9; placeAt(clown, exactAhead(shark, 10)); });
    assert.equal(stats(hit).captures, 1, '差一点点：中了');

    const timeUp = strike((c) => { hunterOf(c).strikeEnd = c.w.time; });
    assert.equal(stats(timeUp).ended.never, 1, '冲刺时间正好到点：没碰到，记失败');
    const notYet = strike((c) => { hunterOf(c).strikeEnd = c.w.time + 0.001; });
    assert.equal(phaseOf(notYet), 'strike', '还差一点：继续冲');
});

test('猎物的警戒半径：min(ALERT_LEN × 捕食者体长 + ALERT_PAD × 屏幕缩放, ALERT_MAX × 缩放)，正好在半径上也算被惊动', () => {
    const alerts = offset => {
        const ctx = primed(['clown', 'clown'], { width: 2400, height: 1500 });
        assert.ok(ctx.w.scale > 1.2, `前置条件：屏幕缩放 ${ctx.w.scale}`);
        const [shark] = ctx.sharks;
        placeAt(ctx.prey[0][0], ahead(shark, 400));
        once(ctx);                                                                 // 先盯上第一条
        assert.equal(phaseOf(ctx), 'hunt');
        const radius = Math.min(PP.ALERT_LEN * shark.len + PP.ALERT_PAD * ctx.w.scale, PP.ALERT_MAX * ctx.w.scale);
        put(ctx.prey[1][0], exactX(shark.x, radius + offset), shark.y);
        once(ctx);
        return Pred.summary(ctx.pred).alerts;
    };
    assert.equal(alerts(0), 1, '正好在半径上');
    assert.equal(alerts(0.01), 0, '差一点');
});

test('猎物的逃跑：朝远离最近的捕食者的方向，速度每步向 FLEE_BOOST × 巡航速度靠拢 FLEE_RESPONSE × dt；反应时间正好到点就动；贴着捕食者中心时沿它的朝向跑', () => {
    const step = (1000 / FPS) / 1000;
    const k = Math.min(1, PP.FLEE_RESPONSE * step);
    const flee = ({ at, sinceAgo = 1, seed = 0.5, threatAng = 0, extra }) => {
        const ctx = primed(['clown', 'clown'], { sharks: 2 });
        const [s0, s1] = ctx.sharks;
        const [target] = ctx.prey[0];
        const [p] = ctx.prey[1];
        placeAt(target, ahead(s0, 400));
        s0.ang = threatAng;
        for (const sh of ctx.sharks) {
            const h = hunterOf(ctx, sh);
            h.phase = 'hunt'; h.targetId = target.id; h.huntStart = 100; h.nextPick = 1e9;
        }
        put(p, at.x, at.y);
        p.seed = seed;
        if (extra) extra(ctx);
        ctx.pred.alert.set(p.entry, { since: 100 - sinceAgo });
        once(ctx);
        return { ctx, p, s0, s1 };
    };
    const speedOf = (ctx, p) => Core.cruiseSpeed(ctx.w, p) * PP.FLEE_BOOST;

    // 两条捕食者：最近的是排在前面的 s0（在它左边 40 px）；s1 在 (205, 390)
    const first = flee({ at: { x: 160, y: 360 } });
    const u1 = { x: -1, y: 0 };
    near(first.p.vx, u1.x * speedOf(first.ctx, first.p) * k, '远离最近的 s0：vx');
    near(first.p.vy, u1.y * speedOf(first.ctx, first.p) * k, '远离最近的 s0：vy');
    // 最近的是排在后面的 s1：P 在 (210, 430)
    const second = flee({ at: { x: 210, y: 430 } });
    const dx = 210 - second.s1.x, dy = 430 - second.s1.y;
    const dist = Math.hypot(dx, dy);
    near(second.p.vx, (dx / dist) * speedOf(second.ctx, second.p) * k, '远离最近的 s1：vx');
    near(second.p.vy, (dy / dist) * speedOf(second.ctx, second.p) * k, '远离最近的 s1：vy');

    const full = flee({ at: { x: 160, y: 360 }, extra: c => { c.prey[1][0].vx = 0; } });
    assert.ok(Math.abs(full.p.vx) < speedOf(full.ctx, full.p) * 0.5, '一步只靠拢 k 的比例，不会一步到位');

    const edge = flee({ at: { x: 160, y: 360 }, sinceAgo: PP.REACT_S, seed: 0 });
    assert.ok(edge.p.vx < -1, '反应时间正好到点（seed = 0）：已经开始跑');
    const early = flee({ at: { x: 160, y: 360 }, sinceAgo: PP.REACT_S - 0.001, seed: 0 });
    assert.equal(early.p.vx, 0, '还差一点：不动');
    const clamped = flee({ at: { x: 160, y: 360 }, sinceAgo: 0.6, seed: 1.5 });
    assert.ok(clamped.p.vx < -1, 'seed 超过 1 时按 1 算（恐慌延迟最多 PANIC_S）：0.6 秒后已经在跑');

    const onTop = flee({ at: { x: 200, y: 360 }, threatAng: 0.7 });
    assert.ok(Number.isFinite(onTop.p.vx) && Number.isFinite(onTop.p.vy), '贴着中心也不出 NaN');
    near(onTop.p.vx, Math.cos(0.7) * speedOf(onTop.ctx, onTop.p) * k, '沿捕食者的朝向：vx');
    near(onTop.p.vy, Math.sin(0.7) * speedOf(onTop.ctx, onTop.p) * k, '沿捕食者的朝向：vy');
});

test('步长门槛：正好 MIN_DT（0.1 毫秒）的步照常推进；清理——消失的鱼不留任何记录，被抓记录满 SAFE_S 秒（正好）才清掉', () => {
    const tiny = primed(['clown']);
    tiny.pred.firstSeen.clear();
    Pred.step(tiny.pred, tiny.w, 0.1, { enabled: true });
    assert.ok(tiny.pred.firstSeen.size > 0, '正好 0.1 毫秒：推进了');
    tiny.pred.firstSeen.clear();
    Pred.step(tiny.pred, tiny.w, 0.09, { enabled: true });
    assert.equal(tiny.pred.firstSeen.size, 0, '小于 0.1 毫秒：什么都不做');

    const ctx = primed(['clown']);
    const clown = ctx.prey[0][0];
    ctx.pred.heldAt.set('ghost', 99);
    ctx.pred.firstSeen.set('ghost', 0);
    ctx.pred.hunters.set('ghost', { phase: 'cruise' });
    ctx.pred.heldAt.set(clown.id, 100 - 1);                                        // 在场、才 1 秒：保留
    once(ctx);
    assert.equal(ctx.pred.heldAt.has('ghost'), false);
    assert.equal(ctx.pred.firstSeen.has('ghost'), false);
    assert.equal(ctx.pred.hunters.has('ghost'), false);
    assert.equal(ctx.pred.heldAt.has(clown.id), true, '在场且没满 SAFE_S：保留');
    ctx.pred.heldAt.set(clown.id, 100 - PP.SAFE_S);
    once(ctx);
    assert.equal(ctx.pred.heldAt.has(clown.id), false, '正好满 SAFE_S：清掉');

    clown.state = 'held';
    once(ctx);
    assert.equal(ctx.pred.heldAt.get(clown.id), 100, '被抓着的鱼每步刷新“被抓的时刻”');
    clown.state = 'alive';
    ctx.w.time = 100 + PP.SAFE_S;
    once(ctx);
    assert.equal(ctx.pred.heldAt.has(clown.id), false, '松手满 SAFE_S 后清掉');
});

test('吞咽名单的清理：鱼不再是“被吃的离开中”、鱼不在了、捕食者不在了才移除，一次只移除一项；仍在吞的落点跟着嘴', () => {
    const ctx = primed(['clown', 'angel']);
    const [shark] = ctx.sharks;
    const [stale] = ctx.prey[0];                                                   // 被捞起：leaving 但不是被吃
    const [live] = ctx.prey[1];                                                    // 真的在被吞
    stale.state = 'leaving'; stale.eaten = false;
    live.state = 'leaving'; live.eaten = true;
    ctx.pred.swallowing.push(
        { fishId: 'ghost-fish', predatorId: shark.id },
        { fishId: stale.id, predatorId: shark.id },
        { fishId: live.id, predatorId: shark.id },
        { fishId: live.id, predatorId: 'ghost-predator' },
    );
    once(ctx);
    assert.deepEqual(ctx.pred.swallowing, [{ fishId: live.id, predatorId: shark.id }], '只剩真的在吞的那一项');
    assert.deepEqual(live.leaveTo, { x: mouth(shark).x, y: mouth(shark).y }, '落点跟着嘴');

    const flying = primed(['clown']);
    const gone = flying.prey[0][0];
    gone.state = 'alive'; gone.eaten = true;                                       // 不是 leaving：不再跟
    flying.pred.swallowing.push({ fishId: gone.id, predatorId: flying.sharks[0].id });
    once(flying);
    assert.equal(flying.pred.swallowing.length, 0);
});

test('release：没有记录（null）也不出错；没有目标点的鱼不会被加上 goal 字段；有目标点的清成 null', () => {
    const ctx = primed(['clown']);
    const [shark] = ctx.sharks;
    const clown = ctx.prey[0][0];
    delete clown.goal;
    shark.goal = { x: 1, y: 2, w: 1, boost: 1 };
    assert.doesNotThrow(() => Pred.release(null, ctx.w));
    assert.equal(shark.goal, null);
    assert.equal('goal' in clown, false, '本来没有 goal 的鱼不加这个字段');
    ctx.pred.alert.set('x', { since: 1 });
    ctx.pred.firstSeen.set('y', 1);
    Pred.release(ctx.pred, ctx.w);
    assert.equal(ctx.pred.hunters.size + ctx.pred.alert.size + ctx.pred.firstSeen.size + ctx.pred.heldAt.size + ctx.pred.swallowing.length, 0);
});

test('依赖缺席时不导出：只有核心、只有玩法核心、一个都没有，捕食层都不出现（控制器看到没有这一层就只是没有捕食）', () => {
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(__dirname, '../js/aquarium-predation-core.js'), 'utf8');
    const load = globals => { const window = Object.assign({}, globals); vm.runInNewContext(source, { window, console }); return window.AquariumPredationCore; };
    assert.equal(load({ AquariumCore: Core }), undefined, '缺玩法核心');
    assert.equal(load({ AquariumPlayCore: Play }), undefined, '缺核心');
    assert.equal(load({}), undefined, '都缺');
    const both = load({ AquariumCore: Core, AquariumPlayCore: Play });
    assert.ok(both && typeof both.step === 'function' && typeof both.canEat === 'function', '都在：导出');
});

test('刚建立的捕食者记录：第一次选目标不必等（nextPick 初值 0）——世界时间还不到 1 秒，正前方够得着的小鱼也能被盯上', () => {
    const ctx = arena({ prey: ['clown'] });
    const [shark] = ctx.sharks;
    const [fish] = ctx.prey[0];
    placeAt(fish, ahead(shark, 300));
    ctx.pred.firstSeen.set(fish.id, -10);                                          // 早就被看到了，过了豁免期
    ctx.w.time = 0.5;
    once(ctx);                                                                     // 第一步只建立狩猎记录（初始饥饿度随机，可能还不饿）
    assert.equal(hunterOf(ctx).nextPick <= 0.5, true, `记录里的下一次选目标时刻 ${hunterOf(ctx).nextPick}`);
    starve(ctx);
    once(ctx);
    assert.equal(phaseOf(ctx), 'hunt', '不用等到世界时间 1 秒');
    assert.equal(hunterOf(ctx).targetId, fish.id);
});

