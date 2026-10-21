(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const core = cjs ? require('./aquarium-core.js') : root && root.AquariumCore;
    const playCore = cjs ? require('./aquarium-play-core.js') : root && root.AquariumPlayCore;
    // 依赖缺席（脚本没加载成功）：不导出，控制器看到没有这一层就只是没有捕食，鱼与存储照常
    const api = core && playCore ? factory(core, playCore) : null;
    if (api && cjs) module.exports = api;
    if (api && root) root.AquariumPredationCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core, PlayCore) {
    'use strict';

    // 水族馆捕食核心：小锤头鲨（唯一的捕食者）偶尔追一条小鱼并吃掉；被吃的鱼过一会儿从屏幕边缘游回来。
    // 纯逻辑：不碰 DOM、存储与 Date；世界里的位置、速度与“被吃”动画仍归 aquarium-core.js，这里只写三样东西——
    //   ① 捕食者的目标点 f.goal（核心把它当作一个额外的合力，所以追击仍服从大个子的转身、俯仰、边界与钟罩避让）；
    //   ② 受惊猎物的速度（朝远离捕食者的方向）；③ 命中时调用 Core.consume（核心登记空缺，到期补回）。
    // 狩猎判定（初始饥饿度、命中、恢复时长）用独立的随机流（create 时从 world.random 取一次种子），不扰动鱼群、避让和家的选择用的那条流。
    // 水母永远不会被吃，而且是结构上做不到：猎物只能是 world.fish 里 diet 为 prey 的鱼，水母钟罩（bells）这个输入根本不会走进这个模块。
    // 没有开启（enabled 不为真）、省流量或没有捕食者时一步都不做；开启时才会改 f.goal。设计与取舍见 docs/superpowers/specs/2026-10-19-aquarium-predation-design.md。

    const PARAMS = Object.freeze({
        // 谁能吃谁：prey.meters ≤ predator.gape × predator.meters（真实体长，不是像素体长），见 canEat
        // 饥饿（Tu & Terzopoulos 1994 的“饥饿超过阈值才去吃”，阈值 r < 0.5）
        HUNGER_RATE: 1 / 240,     // 每秒增加的饥饿度：约 4 分钟由饱到极饿
        MEAL: 0.6,                // 吞下一条减少的饥饿度（下限 0）：同一条捕食者两次进食至少间隔 (MEAL + 阈值 − 初值上限) ÷ RATE 之外的天然限速
        HUNGER_START: 0.2,        // 初始饥饿度 = 此值 + 0…HUNGER_SPAN 的随机数：放进去后不久就能看到第一次捕食
        HUNGER_SPAN: 0.4,
        HUNGER_THRESHOLD: 0.5,    // 饥饿度达到它才会去找猎物
        // 找目标：每 PICK_S 秒在合格猎物里取成本最小的，已有目标时新成本低于现有的 SWITCH_RATIO 倍才换
        PICK_S: 0.5,
        SWITCH_RATIO: 0.7,
        SENSE_LEN: 6,             // 感知半径 = 体长 × 此值，不超过屏宽的 SENSE_MAX
        SENSE_MAX: 0.5,
        SENSE_LOSE: 1.5,          // 追的过程中目标跑出感知半径的这么多倍就算丢了
        REACH_BAND: 0.5,          // 猎物的高度要落在捕食者活动带的上下各延伸 体长 × 此值 以内：大个子被纵向带约束，带外的鱼它够不着，追了也是白追
        BETA_SCHOOL: 0.5,         // 成本 C = d (1 + β1·S + β2·E/π)：S 猎物在鱼群里（同条目存活的同伴不少于 SCHOOL_MATES 条且都在聚合半径内）
        BETA_TURN: 0.2,           // E 转向代价（捕食者朝向与猎物方向的夹角，0…π）
        SCHOOL_MATES: 3,
        // 逼近与冲刺
        HUNT_W: 2.2,              // 追击时目标点的合力权重：比最坏情况下“家 + 漫游”的反向合力（0.9 + 0.7）大
        HUNT_BOOST: 1.3,          // 逼近的速度（巡航速度的倍数）
        LEAD_MAX_S: 1,            // 瞄准预测位置的提前量上限（秒）
        STRIKE_R: 1.2,            // 嘴到猎物中心不到 体长 × 此值、且猎物在朝向前方 STRIKE_CONE 以内时转入冲刺：大个子转不过身，猎物在身后时先绕过来再冲
        STRIKE_CONE: 0.8,         // 弧度（约 46°）
        STRIKE_S: 1.4,            // 冲刺最长时间（设计稿初值 1.1 秒；模拟里 1.1 秒太短，见技术文档的校准一节）
        STRIKE_BOOST_MIN: 2.6,    // 冲刺速度（巡航速度的倍数）= clamp(max(此值, STRIKE_PREY × 猎物速度上限 ÷ 捕食者巡航速度), 此值, STRIKE_BOOST_MAX)：
        STRIKE_BOOST_MAX: 4.5,    // 水族馆里的速度是像素速度，小鱼被惊动时的上限（FLEE_CAP × 巡航）比小锤头鲨按同一上限还快，所以冲刺速度要单独算
        STRIKE_PREY: 1.2,
        STRIKE_ACCEL: 3,          // 冲刺时速度向目标速度靠拢的快慢倍数（核心夹在 GOAL_ACCEL_MAX 以内）
        HUNT_MAX_S: 12,           // 一次追击（逼近 + 冲刺）最长时间：追不到就放弃，不会无休止地追
        // 命中：冲刺中嘴心到猎物心进入“吃得到”的范围（与饲料同一口径：EAT_R_MOUTH × 体长 + EAT_R_PAD）时掷一次骰子，一次冲刺只掷一次
        P_SOLO: 0.7,              // p = clamp(P_SOLO − P_SCHOOL × S, P_MIN, P_MAX)
        P_SCHOOL: 0.35,
        P_MIN: 0.15,
        P_MAX: 0.85,
        // 吞下与恢复
        HANDLE_S: 1,              // 吞咽：捕食者放慢到 HANDLE_PACE 倍这么久
        HANDLE_PACE: 0.6,
        BUBBLES: 3,               // 嘴边的泡：BUBBLES + 0…1 个随机数
        REST_MIN_S: 6,            // 失败后恢复 6–10 秒，不捕食（设计稿初值 3–5 秒；太短会让它每隔十几秒就再来一次）
        REST_MAX_S: 10,
        FAIL_LIMIT: 3,            // 连续失败这么多次就放弃一阵
        GIVEUP_S: 20,
        KILL_GAP_S: 20,           // 整个水族馆两次捕获之间至少这么久：多条捕食者也不会清场
        VACANT_SHARE: 0.3,        // 同时等着补回的空缺不超过猎物总数（活着的 + 空缺）的这么多，但至少允许 1 个：大鱼缸里最多被吃掉三成，只有一两条小鱼时一次只吃一条
        // 猎物的反应：只有在捕食者处于逼近/冲刺时才有，巡航、餍足、恢复中的捕食者不会惊动任何鱼
        ALERT_LEN: 0.8,           // 警戒半径 = 捕食者体长 × 此值 + ALERT_PAD（px，再乘视口缩放），不超过 ALERT_MAX（px，再乘视口缩放）；比冲刺起点（STRIKE_R）还近：
        ALERT_PAD: 20,            // 设计稿初值 2.5 × 体长 + 80 px 时，鱼群在逼近阶段就全跑掉了（模拟里一次冲刺都凑不齐），见技术文档的校准一节
        ALERT_MAX: 450,
        REACT_S: 0.25,            // 反应时间；同一群里其余的鱼再错开 0…PANIC_S 秒（按各自的 seed，不抽随机数）：恐慌波
        PANIC_S: 0.3,
        FLEE_BOOST: 2.2,          // 逃跑速度（自己巡航速度的倍数，不超过核心的 FLEE_CAP）
        FLEE_RESPONSE: 8,         // 速度向逃跑速度靠拢的快慢（1/s）
        // 豁免：被抓着的、刚放开的、刚淡入的、正在被捞起或吞下的都不会被选为目标
        SAFE_S: 4,                // 松手后的豁免期
        ENTER_SAFE_S: 3,          // 第一次以“游着”被看到之后的豁免期（放入、补回、首次载入都算）
        MIN_ALPHA: 0.9,
        // 补员：被吃的鱼从屏幕边缘游回来（群居种 25 秒、单条种 75 秒；核心 step 里到期补回）
        REFILL_SCHOOL_S: 25,
        REFILL_SOLO_S: 75,
    });

    const finite = (...values) => values.every(Number.isFinite);
    const clamp = Core.clamp;
    const MAX_CHASES = 256;       // 记下的追击时长条数上限（只给统计与验收用）

    /** 独立的随机流（mulberry32）：同一个种子给出同一串数。 */
    function seededRandom(seed) {
        let a = seed >>> 0;
        return function next() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- 规则表 ----------

    /**
     * predator 能不能吃 prey（纯函数，参数是物种表里的条目）：捕食者的 diet 是 predator、猎物的 diet 是 prey，
     * 且猎物的真实体长不超过 捕食者的真实体长 × gape。用 meters 而不是像素体长——小鱼的像素体长有可见下限，不代表真实比例。
     * 没有 diet 的（河豚、海龟、蝠鲼、鲸鲨）、水母（不在物种表里）或坏数据都是 false。
     */
    function canEat(predator, prey) {
        if (!predator || !prey || predator.diet !== 'predator' || prey.diet !== 'prey') return false;
        if (!finite(predator.gape, predator.meters, prey.meters)) return false;
        return prey.meters <= predator.gape * predator.meters;
    }

    /** 论文的成本函数 C = d (1 + β1·S + β2·E/π)：d 是捕食者的嘴到猎物身体中心的距离，S（0/1）猎物在鱼群里，E 转向代价（弧度，夹在 0…π）。 */
    function costOf(distance, inSchool, turnAngle) {
        return distance * (1 + PARAMS.BETA_SCHOOL * (inSchool ? 1 : 0) + PARAMS.BETA_TURN * clamp(turnAngle, 0, Math.PI) / Math.PI);
    }

    /** 一次冲刺里“碰到了”之后吃到的概率：单独的 P_SOLO，在鱼群里降到 P_SOLO − P_SCHOOL，夹在 P_MIN…P_MAX。 */
    function catchChance(inSchool) {
        return clamp(PARAMS.P_SOLO - PARAMS.P_SCHOOL * (inSchool ? 1 : 0), PARAMS.P_MIN, PARAMS.P_MAX);
    }

    /** 猎物是不是在鱼群里：同条目存活的同伴不少于 SCHOOL_MATES 条，且都在聚合半径（COH_R × 它的体长）内。 */
    function inSchool(world, prey) {
        let near = 0;
        let total = 0;
        const radius = Core.PARAMS.COH_R * prey.len;
        for (const o of world.fish) {
            if (o === prey || o.entry !== prey.entry || o.state === 'leaving') continue;
            total++;
            if (Math.hypot(o.x - prey.x, o.y - prey.y) <= radius) near++;
        }
        return total >= PARAMS.SCHOOL_MATES && near === total;
    }

    /** 冲刺速度（巡航速度的倍数）：至少 STRIKE_BOOST_MIN 倍，且比目标猎物的速度上限快 STRIKE_PREY 倍，不超过 STRIKE_BOOST_MAX。 */
    function strikeBoost(world, predator, prey) {
        const cruise = Math.max(1e-6, Core.cruiseSpeed(world, predator));
        const preyTop = Core.cruiseSpeed(world, prey) * Core.PARAMS.FLEE_CAP;
        return clamp(Math.max(PARAMS.STRIKE_BOOST_MIN, PARAMS.STRIKE_PREY * preyTop / cruise), PARAMS.STRIKE_BOOST_MIN, PARAMS.STRIKE_BOOST_MAX);
    }

    // ---------- 状态 ----------

    /**
     * 一份捕食状态，与 world 同生命周期（换 world、停止、出错时丢弃），只在内存里。
     * 从 world.random 取一次种子建立独立随机流；之后狩猎判定不再碰 world.random。
     */
    function create(world) {
        const seed = Math.floor(Number(world && world.random ? world.random() : 0) * 4294967296);
        return {
            rnd: seededRandom(Number.isFinite(seed) ? seed : 0),
            hunters: new Map(),        // 捕食者鱼 id → 狩猎记录（见 newHunter）
            firstSeen: new Map(),      // 鱼 id → 第一次以 alive 被看到的 world.time（淡入后豁免）
            heldAt: new Map(),         // 鱼 id → 最近一次被抓着的 world.time（松手后豁免）
            alert: new Map(),          // 条目 id → { since }：被惊动的猎物群
            swallowing: [],            // { fishId, predatorId }：正在被吞下的鱼，落点逐帧跟着嘴
            lastKill: -Infinity,
            stats: { hunts: 0, strikes: 0, captures: 0, giveups: 0, ended: Object.create(null), chases: [] },       // ended：追击失败的原因 → 次数
        };
    }

    function newHunter(pred) {
        return {
            phase: 'cruise',           // cruise 巡航 / hunt 逼近 / strike 冲刺 / handle 吞咽 / rest 恢复
            hunger: PARAMS.HUNGER_START + PARAMS.HUNGER_SPAN * pred.rnd(),
            targetId: null,
            nextPick: 0, huntStart: 0, strikeEnd: 0, until: 0,
            restUntil: 0, giveUpUntil: 0, fails: 0,
            boost: PARAMS.STRIKE_BOOST_MIN, rolled: false,
        };
    }

    /** 嘴的位置：与饲料同一口径（玩法层的 mouthOf，含侧视转身的透视缩短）。 */
    const mouthOf = fish => PlayCore.mouthOf(fish);

    // ---------- 猎物 ----------

    /** fish 现在能不能被 predator 当作目标（不含距离与活动带，那两项在 reachable 里）。 */
    function eligible(pred, world, predatorSpec, fish, now) {
        if (!fish || fish.state !== 'alive' || !(fish.alpha >= PARAMS.MIN_ALPHA)) return false;
        if (!canEat(predatorSpec, Core.speciesById(fish.species))) return false;
        const held = pred.heldAt.get(fish.id);
        if (held !== undefined && now - held < PARAMS.SAFE_S) return false;
        const seen = pred.firstSeen.get(fish.id);
        if (seen === undefined || now - seen < PARAMS.ENTER_SAFE_S) return false;
        return finite(fish.x, fish.y, fish.vx, fish.vy) && fish.x >= 0 && fish.x <= world.width && fish.y >= 0 && fish.y <= world.height;
    }

    /** 捕食者够得着这个高度吗：落在它活动带的上下各延伸 REACH_BAND 个体长以内。 */
    function reachable(world, predatorSpec, predator, fish) {
        const margin = predator.len * PARAMS.REACH_BAND;
        return fish.y >= predatorSpec.band[0] * world.height - margin && fish.y <= predatorSpec.band[1] * world.height + margin;
    }

    function senseRadius(world, predator) {
        return Math.min(PARAMS.SENSE_LEN * predator.len, world.width * PARAMS.SENSE_MAX);
    }

    /** 成本最小的合格猎物：{ fish, cost, distance } 或 null。同成本取 world.fish 里靠前的。 */
    function pickTarget(pred, world, predator, predatorSpec, now) {
        const mouth = mouthOf(predator);
        const sense = senseRadius(world, predator);
        let best = null;
        for (const p of world.fish) {
            if (!eligible(pred, world, predatorSpec, p, now) || !reachable(world, predatorSpec, predator, p)) continue;
            const d = Math.hypot(p.x - mouth.x, p.y - mouth.y);
            if (d > sense) continue;
            const turn = Math.abs(Core.angleDiff(predator.ang, Math.atan2(p.y - mouth.y, p.x - mouth.x)));
            const cost = costOf(d, inSchool(world, p), turn);
            if (!best || cost < best.cost) best = { fish: p, cost, distance: d };
        }
        return best;
    }

    // ---------- 捕食者 ----------

    function finishChase(pred, h, now) {
        const list = pred.stats.chases;
        list.push(now - h.huntStart);
        if (list.length > MAX_CHASES) list.shift();
    }

    /**
     * 追击没成功。reason 记在统计里：ineligible 目标没了或不再合格 / timeout 追得太久 / sense 跑出感知范围 /
     * never 冲刺结束都没碰到 / roll 碰到了但骰子没过 / disturbed 被戳了。恢复 REST_MIN_S…REST_MAX_S 秒；连续失败 FAIL_LIMIT 次就放弃 GIVEUP_S 秒。
     */
    function fail(pred, h, now, reason) {
        finishChase(pred, h, now);
        pred.stats.ended[reason] = (pred.stats.ended[reason] || 0) + 1;
        h.fails++;
        h.restUntil = now + PARAMS.REST_MIN_S + (PARAMS.REST_MAX_S - PARAMS.REST_MIN_S) * pred.rnd();
        if (h.fails >= PARAMS.FAIL_LIMIT) {
            h.fails = 0;
            h.giveUpUntil = now + PARAMS.GIVEUP_S;
            h.restUntil = Math.max(h.restUntil, h.giveUpUntil);
            pred.stats.giveups++;
        }
        h.phase = 'rest';
        h.targetId = null;
    }

    function aimAt(world, predator, prey, w, boost, accel) {
        const cruise = Math.max(1, Core.cruiseSpeed(world, predator) * boost);
        const distance = Math.hypot(prey.x - predator.x, prey.y - predator.y);
        const lead = clamp(distance / cruise, 0, PARAMS.LEAD_MAX_S);
        predator.goal = { x: prey.x + prey.vx * lead, y: prey.y + prey.vy * lead, w, boost, accel };
    }

    /** 现在还能再吃一条吗：空缺没到上限（VACANT_SHARE，至少 1 个），且距上一次捕获已过 KILL_GAP_S。 */
    function canTake(pred, world, now) {
        if (now - pred.lastKill < PARAMS.KILL_GAP_S || world.vacancies.length >= Core.PARAMS.MAX_VACANCIES) return false;
        let alive = 0;
        for (const f of world.fish) {
            const spec = Core.speciesById(f.species);
            if (spec && spec.diet === 'prey' && f.state !== 'leaving') alive++;
        }
        const total = alive + world.vacancies.length;
        return world.vacancies.length < Math.max(1, Math.floor(PARAMS.VACANT_SHARE * total));
    }

    /** 吃下 prey：核心登记空缺并开始“被吞”动画；气泡、饥饿与全局限速在这里。返回是否吃了。 */
    function capture(pred, world, predator, h, prey, now, options) {
        const spec = Core.speciesById(prey.species);
        const delay = spec && spec.kind === 'school' ? PARAMS.REFILL_SCHOOL_S : PARAMS.REFILL_SOLO_S;
        const mouth = mouthOf(predator);
        if (!Core.consume(world, prey, mouth, delay)) return false;
        pred.swallowing.push({ fishId: prey.id, predatorId: predator.id });
        if (options && typeof options.bubbles === 'function') options.bubbles(mouth.x, mouth.y, PARAMS.BUBBLES + Math.floor(pred.rnd() * 2));
        pred.lastKill = now;
        pred.stats.captures++;
        finishChase(pred, h, now);
        h.hunger = Math.max(0, h.hunger - PARAMS.MEAL);
        h.fails = 0;
        h.phase = 'handle';
        h.until = now + PARAMS.HANDLE_S;
        h.targetId = null;
        return true;
    }

    function stepHunter(pred, world, predator, spec, dt, byId, options) {
        let h = pred.hunters.get(predator.id);
        if (!h) { h = newHunter(pred); pred.hunters.set(predator.id, h); }
        predator.goal = null;
        const now = world.time;
        if (predator.state !== 'alive') {                         // 被抓着、被捞起、还在淡入：不狩猎，手里的目标作废
            if (h.phase === 'hunt' || h.phase === 'strike') finishChase(pred, h, now);
            h.phase = 'cruise';
            h.targetId = null;
            return;
        }
        h.hunger = Math.min(1, h.hunger + PARAMS.HUNGER_RATE * dt);

        if (h.phase === 'handle') {
            if (now >= h.until) { h.phase = 'cruise'; return; }
            predator.goal = { x: predator.x, y: predator.y, w: 0, boost: PARAMS.HANDLE_PACE };
            return;
        }
        if (h.phase === 'rest') {
            if (now >= h.restUntil) h.phase = 'cruise';
            return;
        }
        if (h.phase === 'cruise') {
            if (h.hunger < PARAMS.HUNGER_THRESHOLD || now < h.restUntil || now < h.giveUpUntil || now < h.nextPick || !canTake(pred, world, now)) return;
            h.nextPick = now + PARAMS.PICK_S;
            const found = pickTarget(pred, world, predator, spec, now);
            if (!found) return;
            h.phase = 'hunt';
            h.targetId = found.fish.id;
            h.huntStart = now;
            h.nextPick = now + PARAMS.PICK_S;
            pred.stats.hunts++;
        }

        // hunt / strike：目标必须还在、还合格
        const prey = byId.get(h.targetId);
        if (!prey || !eligible(pred, world, spec, prey, now)) { fail(pred, h, now, 'ineligible'); return; }
        const mouth = mouthOf(predator);
        const distance = Math.hypot(prey.x - mouth.x, prey.y - mouth.y);

        if (h.phase === 'hunt') {
            if (now - h.huntStart > PARAMS.HUNT_MAX_S) { fail(pred, h, now, 'timeout'); return; }
            if (distance > senseRadius(world, predator) * PARAMS.SENSE_LOSE) { fail(pred, h, now, 'sense'); return; }
            if (now >= h.nextPick) {                               // 每 PICK_S 秒重新比一次成本：新目标便宜到 SWITCH_RATIO 以下才换，免得来回切
                h.nextPick = now + PARAMS.PICK_S;
                const found = pickTarget(pred, world, predator, spec, now);
                if (found && found.fish !== prey) {
                    const current = costOf(distance, inSchool(world, prey), Math.abs(Core.angleDiff(predator.ang, Math.atan2(prey.y - mouth.y, prey.x - mouth.x))));
                    if (found.cost < current * PARAMS.SWITCH_RATIO) { h.targetId = found.fish.id; aimAt(world, predator, found.fish, PARAMS.HUNT_W, PARAMS.HUNT_BOOST); return; }
                }
            }
            if (distance <= PARAMS.STRIKE_R * predator.len && Math.abs(Core.angleDiff(predator.ang, Math.atan2(prey.y - mouth.y, prey.x - mouth.x))) <= PARAMS.STRIKE_CONE) {
                h.phase = 'strike';
                h.strikeEnd = now + PARAMS.STRIKE_S;
                h.boost = strikeBoost(world, predator, prey);
                h.rolled = false;
                pred.stats.strikes++;
            } else { aimAt(world, predator, prey, PARAMS.HUNT_W, PARAMS.HUNT_BOOST); return; }
        }

        // strike
        if (now >= h.strikeEnd) { fail(pred, h, now, h.rolled ? 'roll' : 'never'); return; }
        aimAt(world, predator, prey, PARAMS.HUNT_W, h.boost, PARAMS.STRIKE_ACCEL);
        const reach = PlayCore.PARAMS.EAT_R_MOUTH * predator.len + PlayCore.PARAMS.EAT_R_PAD;
        if (!h.rolled && distance <= reach) {
            h.rolled = true;                                        // 一次冲刺只掷一次：在够得着的范围里待多少帧都不增加成功率
            if (canTake(pred, world, now) && pred.rnd() < catchChance(inSchool(world, prey))) {
                if (capture(pred, world, predator, h, prey, now, options)) predator.goal = { x: predator.x, y: predator.y, w: 0, boost: PARAMS.HANDLE_PACE };
            }
        }
    }

    // ---------- 猎物的反应 ----------

    /** 捕食者在逼近/冲刺时：警戒半径内的猎物群受惊，反应时间过后朝远离捕食者的方向逃（同群其余的鱼再错开一点，恐慌波）。 */
    function stepPrey(pred, world, dt, byId) {
        const threats = [];
        for (const [id, h] of pred.hunters) {
            if (h.phase !== 'hunt' && h.phase !== 'strike') continue;
            const f = byId.get(id);
            if (f && f.state === 'alive') threats.push(f);
        }
        if (!threats.length) { pred.alert.clear(); return; }
        const now = world.time;
        const alarmed = new Map();                                  // 条目 id → 离得最近的捕食者
        for (const t of threats) {
            const tSpec = Core.speciesById(t.species);
            const radius = Math.min(PARAMS.ALERT_LEN * t.len + PARAMS.ALERT_PAD * world.scale, PARAMS.ALERT_MAX * world.scale);
            for (const p of world.fish) {
                if (p.state !== 'alive' || !canEat(tSpec, Core.speciesById(p.species))) continue;
                const d = Math.hypot(p.x - t.x, p.y - t.y);
                if (d > radius) continue;
                const known = alarmed.get(p.entry);
                if (!known || d < known.d) alarmed.set(p.entry, { threat: t, d });
            }
        }
        for (const entry of Array.from(pred.alert.keys())) if (!alarmed.has(entry)) pred.alert.delete(entry);
        for (const entry of alarmed.keys()) if (!pred.alert.has(entry)) pred.alert.set(entry, { since: now });
        const k = Math.min(1, PARAMS.FLEE_RESPONSE * dt);
        for (const p of world.fish) {
            const a = pred.alert.get(p.entry);
            if (!a || p.state !== 'alive') continue;
            const threat = alarmed.get(p.entry).threat;
            if (now - a.since < PARAMS.REACT_S + PARAMS.PANIC_S * clamp(p.seed, 0, 1)) continue;
            let ux = p.x - threat.x;
            let uy = p.y - threat.y;
            const d = Math.hypot(ux, uy);
            if (d > 1e-6) { ux /= d; uy /= d; } else { ux = Math.cos(threat.ang); uy = Math.sin(threat.ang); }
            const speed = Core.cruiseSpeed(world, p) * PARAMS.FLEE_BOOST;
            p.vx += (ux * speed - p.vx) * k;
            p.vy += (uy * speed - p.vy) * k;
        }
    }

    // ---------- 推进 ----------

    /** 关掉捕食（设置关闭、省流量、出错）：清掉所有目标点，让所有空缺立刻到期补回，丢弃状态。 */
    function release(pred, world) {
        for (const f of world.fish) if (f.goal) f.goal = null;
        for (const v of world.vacancies) v.due = Math.min(v.due, world.time);
        if (pred) {
            pred.hunters.clear(); pred.alert.clear(); pred.swallowing.length = 0;
            pred.firstSeen.clear(); pred.heldAt.clear();
        }
    }

    /**
     * 推进一步（dtMs 毫秒，单步最长与核心一致）；每帧在 Core.step 之后调用。
     * options：{ enabled: boolean, bubbles: (x, y, count) => void }。enabled 不为真或世界在省流量模式时只做 release，什么都不狩猎。
     */
    function step(pred, world, dtMs, options) {
        const seconds = Number(dtMs) / 1000;
        if (!Number.isFinite(seconds) || seconds < Core.PARAMS.MIN_DT) return;
        const dt = Math.min(seconds, Core.PARAMS.MAX_DT);
        const enabled = !!(options && options.enabled) && !world.lowPower;
        if (!enabled) { release(pred, world); return; }
        const now = world.time;

        const byId = new Map();
        let predators = 0;
        for (const f of world.fish) {
            byId.set(f.id, f);
            if (f.state === 'alive' && !pred.firstSeen.has(f.id)) pred.firstSeen.set(f.id, now);
            if (f.state === 'held') pred.heldAt.set(f.id, now);
            const spec = Core.speciesById(f.species);
            if (spec && spec.diet === 'predator') predators++;
        }
        for (const id of Array.from(pred.firstSeen.keys())) if (!byId.has(id)) pred.firstSeen.delete(id);
        for (const [id, t] of pred.heldAt) if (!byId.has(id) || now - t >= PARAMS.SAFE_S) pred.heldAt.delete(id);
        for (const id of Array.from(pred.hunters.keys())) if (!byId.has(id)) pred.hunters.delete(id);

        if (predators) {
            for (const f of world.fish) {
                const spec = Core.speciesById(f.species);
                if (spec && spec.diet === 'predator') stepHunter(pred, world, f, spec, dt, byId, options);
            }
            stepPrey(pred, world, dt, byId);
        } else pred.alert.clear();

        for (let i = pred.swallowing.length - 1; i >= 0; i--) {     // 被吞的鱼落点跟着嘴走（嘴在动）；鱼或捕食者没了就不再跟
            const s = pred.swallowing[i];
            const fish = byId.get(s.fishId);
            const predator = byId.get(s.predatorId);
            if (!fish || fish.state !== 'leaving' || !fish.eaten || !predator) { pred.swallowing.splice(i, 1); continue; }
            const mouth = mouthOf(predator);
            fish.leaveTo = { x: mouth.x, y: mouth.y };
        }
    }

    /** 捕食者被戳了：正在冲刺的中止冲刺、转入恢复；其它阶段不变。 */
    function disturb(pred, world, fish) {
        const h = fish && pred.hunters.get(fish.id);
        if (!h || h.phase !== 'strike') return false;
        fail(pred, h, world.time, 'disturbed');
        fish.goal = null;
        return true;
    }

    /** 给验收与测试看的概况：每个捕食者的阶段、饥饿度与目标，加累计统计。不含任何会被改写的引用。 */
    function summary(pred) {
        return {
            hunters: Array.from(pred.hunters, ([id, h]) => ({ id, phase: h.phase, hunger: h.hunger, targetId: h.targetId })),
            alerts: pred.alert.size,
            swallowing: pred.swallowing.length,
            stats: Object.assign({}, pred.stats, { ended: Object.assign({}, pred.stats.ended), chases: pred.stats.chases.slice() }),
        };
    }

    return { PARAMS, canEat, costOf, catchChance, inSchool, strikeBoost, create, step, release, disturb, summary, seededRandom };
});
