(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports) ? require('./aquarium-core.js') : root && root.AquariumCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumPlayCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 水族馆玩法核心：戳（涟漪、冲击波、泡）、喂食（饲料、吃、变亮）、拉鱼尾（拉伸弹簧）。
    // 纯逻辑：不碰 DOM、存储与 Date，随机数全部来自 world.random，所以可以在 node 里确定性地测试。
    // 状态（play）与 world 同生命周期，由控制器 aquarium.js 持有，刷新即清空；对鱼只写速度（冲量），位置与朝向仍归 aquarium-core.js。
    // 画法在 aquarium-play.js。设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md。

    const TAU = Math.PI * 2;
    const finite = (...values) => values.every(Number.isFinite);
    const clamp = Core.clamp;

    // 下面的数字全部是初值，在真实浏览器里看轨迹与逐帧图校准后写回技术文档。长度类参数乘视口缩放（world.scale）；时间单位是秒。
    const PARAMS = Object.freeze({
        // 戳
        POKE_COOLDOWN_S: 0.4,     // 同一条鱼两次响应之间的最短间隔
        POKE_DASH: 2.4,           // 被戳的鱼窜出去的速度（巡航速度的倍数；核心把速度夹在 FLEE_CAP = 2.6 倍以内）
        POKE_CENTER: 0.15,        // 点在离鱼心不到这么多个体长处时没有“远离”的方向，改朝鱼头方向窜
        SHOCK_R: 140,             // 冲击波半径（px，再加每条鱼自己的体长）
        SHOCK_DASH: 1.2,          // 紧贴涟漪中心的鱼被推开的速度（巡航速度的倍数），越远越弱
        SHOCK_LARGE: 0.35,        // 大型鱼（蝠鲼、鲸鲨）的反应折扣
        RIPPLE_S: 0.7,            // 涟漪扩散的时间
        RIPPLE_R: 110,            // 涟漪最终半径（px）
        MAX_RIPPLES: 3,
        MAX_RIPPLES_LOW: 1,       // 省流量
        MAX_BUBBLES: 24,
        MAX_BUBBLES_LOW: 8,
        POKE_BUBBLES: 2,          // 被戳时嘴边冒的泡：2…3 个（POKE_BUBBLES + 一个 0…1 的随机数）
        EAT_BUBBLES: 2,
        RELEASE_BUBBLES: 2,
        // 喂食
        SPRINKLE_COUNT: 6,        // 点一下按钮落下的粒数
        SPRINKLE_MAX: 12,
        SPRINKLE_X0: 0.2,         // 从上部落下时横向的范围（占宽度）
        SPRINKLE_X1: 0.8,
        SPRINKLE_Y: 0.12,         // 落点的高度（占高度）
        DROP_SPREAD: 40,          // 在水里松手时每粒在 ±这么多 px 内散开
        PELLET_SINK: 40,          // 下沉速度（px/s）
        PELLET_LIFE_S: 14,
        MAX_PELLETS: 24,
        MAX_PELLETS_LOW: 8,
        FEED_COOLDOWN_S: 0.8,
        ATTRACT_REACH: 300,       // 这么近（px）的鱼才会被饲料吸引
        ATTRACT_W: 2.5,           // 朝饲料走的合力权重：要比最坏情况下“家 + 漫游”（0.9 + 0.7）的反向合力大，鱼才一定朝它走
        ATTRACT_BOOST: 1.5,       // 靠近饲料时的速度倍数
        EAT_R_LEN: 0.45,          // 吃到的距离 = 体长 × 这个 + EAT_R_PAD
        EAT_R_PAD: 4,
        FED_S: 20,                // 吃到后变亮的时间
        FED_IN_S: 0.25,
        FED_OUT_S: 3,
        // 拉尾
        TAIL_ZONE: 0,             // 按在鱼本地坐标 x ≤ 体长 × 这个 的地方（后半身）才算拉尾
        PULL_GAIN: 0.1,           // 拉伸量 = 指针速度（px/s）× 这个（px）
        PULL_MAX: 0.35,           // 最多拉长体长的这么多
        PULL_ABS: 40,             // 另设绝对上限（px）
        PULL_OMEGA: 16,           // 弹簧的固有角频率（rad/s）
        PULL_ZETA: 0.5,           // 阻尼比：小于 1 才会回弹一次
        RELEASE_DASH: 2.0,        // 松手后鱼向前冲的速度（巡航速度的倍数）
    });

    // ---------- 状态 ----------

    /** 一份玩法状态，与 world 同生命周期。全部只在内存里：不存储、不进日志。 */
    function create() {
        return {
            time: 0,                   // 玩法自己的时钟（秒），只在 step 里前进
            nextId: 1,
            lastSprinkle: -Infinity,
            ripples: [],               // { x, y, t }
            bubbles: [],               // { x, y, r, vy, ph, t, life }
            pellets: [],               // { id, x, y, t, ph, sink, life }
            pokedAt: new Map(),        // 鱼 id → 上次被戳的时间（只留冷却期内的）
            fed: new Map(),            // 鱼 id → 变亮到什么时候
            pulls: new Map(),          // 鱼 id → { x, y, vx, vy }：拉尾弹簧（鱼本地坐标，px）
        };
    }

    /** 屏幕尺寸变了：位置按比例缩放；拉尾弹簧是鱼本地的小位移，缩放它没有意义，保持不动。 */
    function resize(play, ratioX, ratioY) {
        if (!finite(ratioX, ratioY) || ratioX <= 0 || ratioY <= 0) return;
        for (const list of [play.ripples, play.bubbles, play.pellets]) {
            for (const item of list) { item.x *= ratioX; item.y *= ratioY; }
        }
    }

    function counts(play) {
        return { ripples: play.ripples.length, bubbles: play.bubbles.length, pellets: play.pellets.length, fed: play.fed.size, pulls: play.pulls.size };
    }

    // ---------- 泡与涟漪 ----------

    function addBubbles(play, world, x, y, count) {
        const cap = world.lowPower ? PARAMS.MAX_BUBBLES_LOW : PARAMS.MAX_BUBBLES;
        const k = world.scale;
        for (let i = 0; i < count; i++) {
            play.bubbles.push({
                x: x + (world.random() - 0.5) * 6 * k,
                y: y + (world.random() - 0.5) * 4 * k,
                r: (1.4 + world.random() * 1.8) * k,
                vy: (24 + world.random() * 22) * k,
                ph: world.random() * TAU,
                t: 0,
                life: 1.5 + world.random() * 1.1,
            });
        }
        if (play.bubbles.length > cap) play.bubbles.splice(0, play.bubbles.length - cap);
    }

    function addRipple(play, world, x, y) {
        play.ripples.push({ x, y, t: 0 });
        const cap = world.lowPower ? PARAMS.MAX_RIPPLES_LOW : PARAMS.MAX_RIPPLES;
        if (play.ripples.length > cap) play.ripples.splice(0, play.ripples.length - cap);
    }

    /** 鱼嘴的位置（鼻尖稍靠里一点）。 */
    function mouthOf(fish) {
        return { x: fish.x + Math.cos(fish.ang) * fish.len * 0.45, y: fish.y + Math.sin(fish.ang) * fish.len * 0.45 };
    }

    function ageEffects(play, world, dt) {
        const k = world.scale;
        play.ripples = play.ripples.filter(r => (r.t += dt) < PARAMS.RIPPLE_S);
        play.bubbles = play.bubbles.filter(b => {
            b.t += dt;
            b.y -= b.vy * dt;
            b.x += Math.sin(b.t * 5 + b.ph) * 10 * k * dt;
            return b.t < b.life && b.y > -20;
        });
    }

    // ---------- 戳 ----------

    function poking(fish) { return fish.state === 'alive' || fish.state === 'entering'; }

    /**
     * 戳 fish（点击处 at）：被戳的鱼猛地窜开、嘴边冒泡；点击处荡开涟漪；附近的鱼被推开（越近越强，大型鱼打折）。
     * 同一条鱼 POKE_COOLDOWN_S 内不重复响应。拒绝时返回 { ok: false, reason: 'invalid' | 'state' | 'cooldown' }，什么都不改。
     */
    function poke(play, world, fish, at) {
        if (!fish || !at || !finite(at.x, at.y, fish.x, fish.y, fish.ang) || !world.fish.includes(fish)) return { ok: false, reason: 'invalid' };
        if (!poking(fish)) return { ok: false, reason: 'state' };
        const last = play.pokedAt.get(fish.id);
        if (last !== undefined && play.time - last < PARAMS.POKE_COOLDOWN_S) return { ok: false, reason: 'cooldown' };
        play.pokedAt.set(fish.id, play.time);

        // 被戳的鱼：朝远离点击处的方向窜（点在鱼心附近时朝鱼头方向）
        const dx = fish.x - at.x;
        const dy = fish.y - at.y;
        const d = Math.hypot(dx, dy);
        const away = d >= PARAMS.POKE_CENTER * fish.len ? { x: dx / d, y: dy / d } : { x: Math.cos(fish.ang), y: Math.sin(fish.ang) };
        const dash = Core.cruiseSpeed(world, fish) * PARAMS.POKE_DASH;
        fish.vx = away.x * dash;
        fish.vy = away.y * dash;
        const mouth = mouthOf(fish);
        addBubbles(play, world, mouth.x, mouth.y, PARAMS.POKE_BUBBLES + Math.floor(world.random() * 2));

        // 冲击波：别的鱼从点击处被推开
        let pushed = 0;
        for (const other of world.fish) {
            if (other === fish || !poking(other)) continue;
            const ox = other.x - at.x;
            const oy = other.y - at.y;
            const reach = PARAMS.SHOCK_R * world.scale + other.len;
            const od = Math.hypot(ox, oy);
            if (od >= reach) continue;
            const spec = Core.speciesById(other.species);
            const strength = (1 - od / reach) * (spec && spec.kind === 'large' ? PARAMS.SHOCK_LARGE : 1) * Core.cruiseSpeed(world, other) * PARAMS.SHOCK_DASH;
            const dir = od > 1e-6 ? { x: ox / od, y: oy / od } : { x: Math.cos(other.ang), y: Math.sin(other.ang) };
            other.vx += dir.x * strength;
            other.vy += dir.y * strength;
            pushed++;
        }
        addRipple(play, world, at.x, at.y);
        return { ok: true, pushed };
    }

    // ---------- 喂食 ----------

    const NO_ATTRACTORS = Object.freeze([]);
    const maxPellets = world => (world.lowPower ? PARAMS.MAX_PELLETS_LOW : PARAMS.MAX_PELLETS);

    /**
     * 撒饲料。opts 为空：从屏幕上部落下 SPRINKLE_COUNT 粒（横向在中间 60% 里随机）；opts = { x, y }：落在那里，每粒在 DROP_SPREAD 内散开；
     * opts.count 可改粒数（整数 1…SPRINKLE_MAX）。同屏饲料放不下时只落放得下的那几粒，count 如实返回。
     * 拒绝时返回 { ok: false, reason: 'invalid' | 'cooldown' | 'busy' }，什么都不改。
     */
    function sprinkle(play, world, opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const given = o.x !== undefined || o.y !== undefined;
        if (given && !finite(o.x, o.y)) return { ok: false, reason: 'invalid' };
        const count = o.count === undefined ? PARAMS.SPRINKLE_COUNT : o.count;
        if (!Number.isInteger(count) || count < 1 || count > PARAMS.SPRINKLE_MAX) return { ok: false, reason: 'invalid' };
        if (play.time - play.lastSprinkle < PARAMS.FEED_COOLDOWN_S) return { ok: false, reason: 'cooldown' };
        const room = maxPellets(world) - play.pellets.length;
        if (room <= 0) return { ok: false, reason: 'busy' };
        const n = Math.min(count, room);
        const k = world.scale;
        for (let i = 0; i < n; i++) {
            const x = given
                ? clamp(o.x + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.width)
                : world.width * (PARAMS.SPRINKLE_X0 + (PARAMS.SPRINKLE_X1 - PARAMS.SPRINKLE_X0) * world.random());
            const y = given
                ? clamp(o.y + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.height)
                : world.height * PARAMS.SPRINKLE_Y + (world.random() - 0.5) * 10 * k;
            play.pellets.push({ id: play.nextId++, x, y, t: 0, ph: world.random() * TAU, sink: PARAMS.PELLET_SINK * k * (0.85 + 0.3 * world.random()), life: PARAMS.PELLET_LIFE_S });
        }
        play.lastSprinkle = play.time;
        return { ok: true, count: n };
    }

    /** 饲料对鱼的吸引点，交给 Core.step 的 attractors（每粒一个，核心里每条鱼只朝范围内最近的一个走）。 */
    function attractors(play, world) {
        if (!play.pellets.length) return NO_ATTRACTORS;
        const reach = PARAMS.ATTRACT_REACH * world.scale;
        return play.pellets.map(p => ({ x: p.x, y: p.y, reach, weight: PARAMS.ATTRACT_W, boost: PARAMS.ATTRACT_BOOST }));
    }

    /** 吃到这粒饲料的鱼：只有游着的（alive）鱼吃，离开中、被抓着、还在淡入的不吃；够得着的里取最近的，一样近取先出现的。 */
    function eaterOf(world, pellet) {
        let best = null;
        let bestD = Infinity;
        for (const f of world.fish) {
            if (f.state !== 'alive') continue;
            const d = Math.hypot(f.x - pellet.x, f.y - pellet.y);
            if (d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d < bestD) { best = f; bestD = d; }
        }
        return best;
    }

    function stepPellets(play, world, dt) {
        if (!play.pellets.length) return;
        const kept = [];
        for (const p of play.pellets) {
            p.t += dt;
            p.y += p.sink * dt;
            p.x += Math.sin(p.t * 1.7 + p.ph) * 9 * world.scale * dt;
            if (p.t >= p.life || p.y > world.height + 20) continue;           // 过期或沉出画面
            const eater = eaterOf(world, p);
            if (eater) {                                                     // 被吃掉：这一粒立刻消失，所以同一粒只会被吃一次
                play.fed.set(eater.id, play.time + PARAMS.FED_S);
                const mouth = mouthOf(eater);
                addBubbles(play, world, mouth.x, mouth.y, PARAMS.EAT_BUBBLES);
                continue;
            }
            kept.push(p);
        }
        play.pellets = kept;
    }

    const NO_EXTRAS = Object.freeze({ pull: null, fed: 0 });

    /** 画这条鱼时要叠加的玩法状态：{ pull: {x, y} | null（拉尾弹簧，鱼本地 px）, fed: 0…1（变亮程度，先快速亮起、最后几秒渐渐暗下） }。 */
    function extrasOf(play, fish) {
        const p = play.pulls.get(fish.id);
        const until = play.fed.get(fish.id);
        if (!p && until === undefined) return NO_EXTRAS;
        let fed = 0;
        if (until !== undefined) {
            const remain = until - play.time;
            fed = clamp(Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S), 0, 1);
        }
        return { pull: p ? { x: p.x, y: p.y } : null, fed };
    }

    // ---------- 拉尾 ----------

    /** (x, y) 是不是在这条鱼的后半身（鱼本地坐标 x ≤ 体长 × TAIL_ZONE，鼻子朝 +x）。成群的小鱼太小、看不出拉伸，不做拉尾。 */
    function isTailZone(fish, x, y) {
        if (!fish || !finite(x, y, fish.x, fish.y, fish.ang, fish.len)) return false;
        const spec = Core.speciesById(fish.species);
        if (!spec || spec.kind === 'school') return false;
        return (x - fish.x) * Math.cos(fish.ang) + (y - fish.y) * Math.sin(fish.ang) <= PARAMS.TAIL_ZONE * fish.len;
    }

    /** 开始拉尾：fish 必须是用 Core.grab(…, { tail: true }) 抓住的。弹簧从 0 开始。 */
    function beginHold(play, world, fish) {
        if (!fish || !world.fish.includes(fish) || fish.state !== 'held' || !fish.held || !fish.held.tail) return { ok: false, reason: 'state' };
        play.pulls.set(fish.id, { x: 0, y: 0, vx: 0, vy: 0 });
        return { ok: true };
    }

    /**
     * 结束拉尾。默认（拖过之后松手；调用前应已 Core.release，鱼是 alive）：鱼朝鱼头方向冲一下并冒泡，尾巴由 stepPulls 带阻尼回弹；
     * 鱼不是 alive（比如已被捞起）时只回弹、不冲刺、不冒泡。opts.quiet（没拖就松手、被捞起等）：直接清掉弹簧，没有回弹、冲刺和泡。
     * 没有拉尾记录时返回 { ok: false, reason: 'state' }。
     */
    function endHold(play, world, fish, opts) {
        const pull = fish && play.pulls.get(fish.id);
        if (!pull) return { ok: false, reason: 'state' };
        if (opts && opts.quiet) { play.pulls.delete(fish.id); return { ok: true }; }
        if (fish.state === 'alive') {
            const dash = Core.cruiseSpeed(world, fish) * PARAMS.RELEASE_DASH;
            fish.vx = Math.cos(fish.ang) * dash;
            fish.vy = Math.sin(fish.ang) * dash;
            const mouth = mouthOf(fish);
            addBubbles(play, world, mouth.x, mouth.y, PARAMS.RELEASE_BUBBLES);
        }
        return { ok: true };
    }

    /**
     * 拉尾弹簧：被拉着时目标是指针运动方向（折算到鱼本地坐标）上 min(指针速度 × PULL_GAIN, 体长 × PULL_MAX, PULL_ABS × 视口缩放) 的位移，
     * 松手后目标回到 0；二阶阻尼弹簧（PULL_OMEGA、PULL_ZETA < 1）所以会回弹一次再停下，停稳后记录清掉；过冲也不超过同一个上限。
     * 这只是画法用的位移（见 extrasOf），不改变鱼的位置与碰撞。
     */
    function stepPulls(play, world, dt) {
        if (!play.pulls.size) return;
        const byId = new Map(world.fish.map(f => [f.id, f]));
        const omega = PARAMS.PULL_OMEGA;
        const damp = 2 * PARAMS.PULL_ZETA * omega;
        for (const [id, p] of play.pulls) {
            const f = byId.get(id);
            if (!f || f.state === 'leaving') { play.pulls.delete(id); continue; }
            const holding = f.state === 'held' && !!f.held && !!f.held.tail;   // 不再被拉着尾巴（放开了，或被普通抓取接手）：目标回到 0，停稳后清掉
            const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS * world.scale);
            let tx = 0;
            let ty = 0;
            if (holding) {
                const speed = Math.hypot(f.held.pvx, f.held.pvy);
                if (speed > 1) {
                    const mag = Math.min(speed * PARAMS.PULL_GAIN, cap);
                    const ux = f.held.pvx / speed;
                    const uy = f.held.pvy / speed;
                    const c = Math.cos(f.ang);
                    const s = Math.sin(f.ang);
                    tx = (ux * c + uy * s) * mag;
                    ty = (-ux * s + uy * c) * mag;
                }
            }
            const h = dt / 2;
            for (let i = 0; i < 2; i++) {
                p.vx += (omega * omega * (tx - p.x) - damp * p.vx) * h;
                p.vy += (omega * omega * (ty - p.y) - damp * p.vy) * h;
                p.x += p.vx * h;
                p.y += p.vy * h;
            }
            const m = Math.hypot(p.x, p.y);                                    // 弹簧过冲也不超过上限
            if (m > cap) { p.x *= cap / m; p.y *= cap / m; }
            if (!holding && Math.abs(p.x) < 0.05 && Math.abs(p.y) < 0.05 && Math.abs(p.vx) < 0.5 && Math.abs(p.vy) < 0.5) play.pulls.delete(id);
        }
    }

    // ---------- 推进 ----------

    /** 推进一步（dtMs 毫秒，单步最长与核心一致）：涟漪扩散、泡上浮、饲料下沉与被吃、拉尾弹簧，过期的冷却与变亮记录清掉。 */
    function step(play, world, dtMs) {
        const seconds = Number(dtMs) / 1000;
        if (!Number.isFinite(seconds) || seconds < Core.PARAMS.MIN_DT) return;
        const dt = Math.min(seconds, Core.PARAMS.MAX_DT);
        play.time += dt;
        ageEffects(play, world, dt);
        stepPellets(play, world, dt);
        stepPulls(play, world, dt);
        for (const [id, t] of play.pokedAt) if (play.time - t >= PARAMS.POKE_COOLDOWN_S) play.pokedAt.delete(id);
        for (const [id, until] of play.fed) if (until <= play.time) play.fed.delete(id);
    }

    return { PARAMS, create, resize, counts, poke, sprinkle, attractors, extrasOf, isTailZone, beginHold, endHold, step };
});
