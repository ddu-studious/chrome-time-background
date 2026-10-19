(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水族馆核心：鱼种表、条目（用户放入的单位）白名单与上限、群游、避让、命中与抓取状态。
    // 纯逻辑：不碰 DOM、存储与 Date，随机数全部来自 world.random，所以可以在 node 里确定性地测试。
    // 画法与存储在 aquarium.js；水母（主线）在 jellyfish-core.js，鱼只读水母钟罩的位置，不影响水母。
    // 设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-design.md。

    const TAU = Math.PI * 2;

    const PARAMS = Object.freeze({
        MAX_ENTRIES: 12,          // 条目（用户放入的单位）上限；群居种一个条目含多条鱼
        MAX_ENTRIES_LOW: 6,       // 省流量模式
        MAX_FISH: 40,             // 渲染条数上限（群居种每个条目算 group 条）；最终数字以真实 Chromium 的帧耗时测量为准
        MAX_FISH_LOW: 16,
        MAX_LARGE: 2,             // 大型（蝠鲼、鲸鲨）合计最多这么多个条目：它们又大又慢，多了会盖住水母
        ENTER_S: 1.2,             // 放入后淡入游进来的时长
        LEAVE_S: 0.35,            // 被捞出/移除后淡出的时长：捞出是用户明确的操作，要快
        SCALE_MIN: 0.75,          // 视口缩放：与水母同一公式，min(宽, 高) / SCALE_BASE 夹在范围内
        SCALE_MAX: 1.5,
        SCALE_BASE: 820,
        MARGIN: 60,               // 位置硬边界：屏幕外最多这么远（再加上自己的体长）；软边界在它里面
        WALL_ACC: 240,            // 软边界回推加速度（px/s²，再乘视口缩放）
        EDGE_LEN: 2,              // 软边界宽度 = 体长 × 此值 + 20
        BAND_ACC: 140,            // 越出本种纵向带时的回推加速度（px/s²）：只在越界时推，带内自由游，避免像早期水母那样挤到屏幕顶端
        BAND_SOFT: 0.1,           // 越界多少屏高时回推达到最大
        TURN: 2.0,                // 速度向期望速度靠拢的快慢（1/s）
        HOME_NEAR: 220,           // 离群“家”近于此（px，再乘视口缩放）时家的吸引渐弱，鱼在家附近散开游
        HOME_W: 0.9,
        HOME_MIN_S: 10,           // 换一个家的间隔
        HOME_SPAN_S: 10,
        SEP_R: 1.8,               // 分离半径 = 体长 × 此值
        ALIGN_R: 6,               // 对齐半径
        COH_R: 9,                 // 聚合半径
        SEP_W: 2.4,
        ALIGN_W: 0.8,
        COH_W: 0.6,
        WANDER: 0.5,              // 方向的缓慢摆动（弧度），免得一群鱼走成一条直线
        WANDER_W: 0.7,            // 漫游向量的权重：家的吸引在 HOME_NEAR 以内渐弱，鱼靠这个缓慢转向的向量在家附近游大弧线；没有它，单条鱼到家后合力只剩“朝家”一个方向，会围着家绕小圈
        WANDER_RATE: 0.45,        // 漫游向量转向的基础速度（rad/s）；每个条目随机顺时针或逆时针，免得所有鱼同向打转
        STEER_FULL: 0.25,         // 合力短于此时，期望速度按比例放慢：合力相互抵消时方向不可靠，鱼放慢一点而不是全速猜一个方向（那会让速度方向突然翻转）
        STEER_MIN: 0.4,           // 放慢到的最低比例
        FLEE_SPEED: 240,          // 指针快于此（px/s）才惊动鱼，与水母一致
        FLEE_RADIUS: 160,         // 惊动半径（px，再乘视口缩放，再加体长）
        FLEE_IMPULSE: 150,
        FLEE_COOLDOWN_S: 0.8,
        FLEE_CAP: 2.6,            // 被惊动后的速度上限 = 正常速度 × 此值
        BELL_AVOID: 1.3,          // 避开水母钟罩：靠近到 钟罩半径 × 此值 + 半个体长 时开始偏转
        BELL_PUSH: 160,
        BELL_KEEP: 0.4,           // 鱼身中心不进入 钟罩半径 + 体长 × 此值 的范围
        Z_MIN: 0.35,              // 深度（0 远 1 近）：影响体长、速度与命中顺序
        Z_MAX: 1,
        Z_SIZE: 0.35,             // 体长 = 种类体长 × 视口缩放 × (1 − Z_SIZE + Z_SIZE × z)
        Z_SPEED: 0.3,
        HIT_SCALE: 1.25,          // 抓得到的范围比鱼身略大一圈
        HIT_PAD: 14,              // 鱼小，手抖也要抓得到
        HIT_ALPHA: 0.5,           // 淡入到这个程度才抓得到
        HOLD_K: 14,               // 抓着时追指针的快慢（1/s）
        HOLD_MAX_SPEED: 3200,
        HOLD_OFFSET: 0.8,
        HOLD_PV_RATE: 10,         // 拉尾时指针速度的平滑速率（1/s）
        THROW_MAX: 600,           // 松手时带走的速度上限（px/s）
        FLIP_HYST: 0.3,           // 翻面滞回：朝向的 cos 越过 ±此值（离竖直线约 17°）才换到另一面，在竖直附近来回晃的鱼不会一帧一换
        FLIP_RATE: 9,             // 当前面向目标面缓动的快慢（1/s）：换面约 0.25 秒，身体先收窄再展开，像打了个滚
        SCOOP_S: 0.6,             // 拖进网兜松手后“被捞起”的时长：鱼游向网兜、缩小，再淡出（用列表按钮捞出没有落点，仍是 LEAVE_S 的原地淡出）
        SCOOP_PULL: 8,            // 被捞起时向落点靠拢的快慢（1/s）
        SCOOP_FADE_AT: 0.4,       // 过了这一段进度才开始淡出：先让人看清鱼落进了网兜
        SCOOP_SHRINK: 0.55,       // 被捞到最后缩小多少（体长 × (1 − 此值 × 进度)）
        SCOOP_SPREAD: 30,         // 成群的鱼落点错开的范围（px，再乘视口缩放），免得 5 条叠成一条
        MAX_DT: 0.05,
        MIN_DT: 0.0001,
    });

    // 9 种动物（8 种鱼 + 海龟）。len 是体长（px，视口缩放 1 时），speed 是巡航速度（px/s），band 是本种活动的纵向带（占屏高的比例，0 在顶），
    // colors 是调色板色位 [主色, 点缀色]（色位编号沿用首页 JellyfishSkin.PALETTE 的色相环顺序：红橙黄绿薄荷冰蓝紫洋红）。
    // 鲨鱼只是性格温和的居民，没有捕食行为。
    const SPECIES = Object.freeze([
        Object.freeze({ id: 'neon', name: '霓虹灯鱼', kind: 'school', group: 5, len: 16, speed: 80, band: Object.freeze([0.25, 0.85]), colors: Object.freeze([4, 0]) }),
        Object.freeze({ id: 'tang', name: '蓝吊', kind: 'school', group: 5, len: 22, speed: 66, band: Object.freeze([0.3, 0.9]), colors: Object.freeze([5, 2]) }),
        Object.freeze({ id: 'clown', name: '小丑鱼', kind: 'solo', group: 1, len: 30, speed: 52, band: Object.freeze([0.5, 0.92]), colors: Object.freeze([1, 1]) }),
        Object.freeze({ id: 'puffer', name: '河豚', kind: 'solo', group: 1, len: 32, speed: 34, band: Object.freeze([0.35, 0.8]), colors: Object.freeze([2, 4]) }),
        Object.freeze({ id: 'angel', name: '神仙鱼', kind: 'solo', group: 1, len: 34, speed: 40, band: Object.freeze([0.3, 0.8]), colors: Object.freeze([6, 5]) }),
        Object.freeze({ id: 'hammer', name: '小锤头鲨', kind: 'solo', group: 1, len: 56, speed: 58, band: Object.freeze([0.15, 0.65]), colors: Object.freeze([5, 6]) }),
        Object.freeze({ id: 'turtle', name: '海龟', kind: 'solo', group: 1, len: 70, speed: 30, band: Object.freeze([0.3, 0.8]), colors: Object.freeze([3, 1]) }),
        Object.freeze({ id: 'manta', name: '蝠鲼', kind: 'large', group: 1, len: 96, speed: 36, band: Object.freeze([0.1, 0.5]), colors: Object.freeze([6, 7]) }),
        Object.freeze({ id: 'whaleshark', name: '鲸鲨', kind: 'large', group: 1, len: 130, speed: 28, band: Object.freeze([0.2, 0.6]), colors: Object.freeze([5, 4]) }),
    ]);
    const BY_ID = Object.freeze(Object.fromEntries(SPECIES.map(item => [item.id, item])));
    const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function finite(...values) { return values.every(Number.isFinite); }
    function angleDiff(from, to) {
        let d = (to - from) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    }

    function speciesById(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null;
    }

    // ---------- 条目：白名单与上限 ----------

    const maxEntries = lowPower => (lowPower ? PARAMS.MAX_ENTRIES_LOW : PARAMS.MAX_ENTRIES);
    const maxFish = lowPower => (lowPower ? PARAMS.MAX_FISH_LOW : PARAMS.MAX_FISH);

    /** 渲染条数：每个条目含该种的 group 条鱼；未知种类不算。 */
    function renderCount(entries) {
        if (!Array.isArray(entries)) return 0;
        let total = 0;
        for (const item of entries) {
            const spec = item && speciesById(item.species);
            if (spec) total += spec.group;
        }
        return total;
    }

    function largeCount(entries) {
        let total = 0;
        for (const item of entries) {
            const spec = item && speciesById(item.species);
            if (spec && spec.kind === 'large') total++;
        }
        return total;
    }

    /**
     * 能不能再放一个 speciesId：返回 { ok: true } 或 { ok: false, reason }。
     * reason：unknown 种类不认识 / full 条目满了 / large 大型已满 / render 渲染条数放不下。
     */
    function canAdd(entries, speciesId, lowPower = false) {
        const spec = speciesById(speciesId);
        if (!spec) return { ok: false, reason: 'unknown' };
        const list = Array.isArray(entries) ? entries : [];
        if (list.length >= maxEntries(lowPower)) return { ok: false, reason: 'full' };
        if (spec.kind === 'large' && largeCount(list) >= PARAMS.MAX_LARGE) return { ok: false, reason: 'large' };
        if (renderCount(list) + spec.group > maxFish(lowPower)) return { ok: false, reason: 'render' };
        return { ok: true };
    }

    /**
     * 当前用量与上限（给托盘显示“已放 n/12”用；口径与 canAdd 一致：条目数取数组长度，渲染条数与大型数不算未知种类）。
     */
    function capacity(entries, lowPower = false) {
        const list = Array.isArray(entries) ? entries : [];
        return {
            entries: list.length,
            maxEntries: maxEntries(lowPower),
            fish: renderCount(list),
            maxFish: maxFish(lowPower),
            large: largeCount(list),
            maxLarge: PARAMS.MAX_LARGE,
            lowPower: !!lowPower,
        };
    }

    /**
     * 读存储后的整理：只留种类在白名单内、id 与时间合法且不重复的条目，再按先后顺序套上各项上限。
     * 返回 { entries, dropped }；raw 不是数组得到空（dropped 为 0），调用方据此知道不要覆盖原数据。
     */
    function normalizeEntries(raw, lowPower = false) {
        if (!Array.isArray(raw)) return { entries: [], dropped: 0 };
        const seen = new Set();
        const entries = [];
        for (const item of raw) {
            if (!item || typeof item !== 'object') continue;
            if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id) || seen.has(item.id)) continue;
            if (!speciesById(item.species)) continue;
            if (typeof item.addedAt !== 'number' || !Number.isFinite(item.addedAt) || item.addedAt < 0) continue;
            if (!canAdd(entries, item.species, lowPower).ok) continue;
            seen.add(item.id);
            entries.push({ id: item.id, species: item.species, addedAt: item.addedAt });
        }
        return { entries, dropped: raw.length - entries.length };
    }

    // ---------- 世界 ----------

    function scaleFor(width, height) {
        return clamp(Math.min(width, height) / PARAMS.SCALE_BASE, PARAMS.SCALE_MIN, PARAMS.SCALE_MAX);
    }

    function createWorld({ width = 1280, height = 720, random = Math.random, lowPower = false } = {}) {
        return {
            width, height, random, lowPower: !!lowPower,
            scale: scaleFor(width, height), time: 0, nextId: 1,
            fish: [],
            groups: Object.create(null),     // 条目 id → { hx, hy, next, wp }：该群当前的“家”与漫游相位（wp 一生不变）
            pointer: { x: 0, y: 0, speed: 0, has: false },
        };
    }

    /**
     * 翻面：朝左游时身体要翻过来（背鳍始终朝上）。原来按 cos(朝向) 的正负一帧翻过去——每次转身背鳍都会跳到另一侧，
     * 在竖直附近来回晃的鱼还会一帧一闪。现在：目标面 flipTo（±1）带滞回，朝向越过竖直线 FLIP_HYST 以后才换；
     * 当前面 flip（−1…1）以 FLIP_RATE 缓动到目标面，换面的几帧里身体先收窄再展开。缺字段（旧数据）时按朝向补出。
     */
    function updateFlip(f, dt) {
        const c = Math.cos(f.ang);
        if (!Number.isFinite(f.flipTo)) f.flipTo = c < 0 ? -1 : 1;
        if (!Number.isFinite(f.flip)) f.flip = f.flipTo;
        if (c < -PARAMS.FLIP_HYST) f.flipTo = -1;
        else if (c > PARAMS.FLIP_HYST) f.flipTo = 1;
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        f.flip += (f.flipTo - f.flip) * Math.min(1, PARAMS.FLIP_RATE * dt);
    }

    function pickHome(world, group, spec) {
        group.hx = world.width * (0.1 + 0.8 * world.random());
        group.hy = world.height * lerp(spec.band[0], spec.band[1], world.random());
        group.next = world.time + PARAMS.HOME_MIN_S + world.random() * PARAMS.HOME_SPAN_S;
    }

    function lengthOf(world, spec, z) {
        return spec.len * world.scale * (1 - PARAMS.Z_SIZE + PARAMS.Z_SIZE * z);
    }

    /** 屏幕尺寸变了：位置按比例缩放，体长按视口缩放，家重新挑。 */
    function resize(world, width, height) {
        const ratioX = width / Math.max(1, world.width);
        const ratioY = height / Math.max(1, world.height);
        const scale = scaleFor(width, height);
        const factor = scale / world.scale;
        world.width = width; world.height = height; world.scale = scale;
        for (const f of world.fish) {
            f.x *= ratioX; f.y *= ratioY;
            f.vx *= factor; f.vy *= factor;
            f.len *= factor;
        }
        for (const id of Object.keys(world.groups)) world.groups[id].next = 0;
    }

    function spawnGroup(world, item, { instant, from }) {
        const spec = speciesById(item.species);
        const group = { hx: 0, hy: 0, next: 0, wp: world.random() };
        pickHome(world, group, spec);
        world.groups[item.id] = group;
        const baseZ = lerp(PARAMS.Z_MIN, PARAMS.Z_MAX, world.random());
        const spread = spec.len * world.scale * 2.5;
        for (let i = 0; i < spec.group; i++) {
            const z = clamp(baseZ + (world.random() - 0.5) * 0.2, PARAMS.Z_MIN, PARAMS.Z_MAX);
            const len = lengthOf(world, spec, z);
            let x; let y;
            if (instant) {
                x = clamp(group.hx + (world.random() - 0.5) * spread, 0, world.width);
                y = clamp(group.hy + (world.random() - 0.5) * spread, 0, world.height);
            } else if (from && finite(from.x, from.y)) {
                x = from.x + (world.random() - 0.5) * 24;
                y = from.y + (world.random() - 0.5) * 24;
            } else {
                x = clamp(group.hx + (world.random() - 0.5) * spread, 0, world.width);
                y = world.height + len;
            }
            const angle = world.random() * TAU;
            const speed = spec.speed * world.scale;
            world.fish.push({
                id: world.nextId++, entry: item.id, species: item.species,
                x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ang: angle,
                z, len, phase: world.random() * TAU, seed: world.random(), t: instant ? PARAMS.ENTER_S : 0,
                alpha: instant ? 1 : 0, state: instant ? 'alive' : 'entering',
                held: null, cooldown: 0, turn: 0,
                flip: Math.cos(angle) < 0 ? -1 : 1, flipTo: Math.cos(angle) < 0 ? -1 : 1,
            });
        }
    }

    /**
     * 把世界整理成与条目一致：新条目生成鱼（群居种一次 group 条），已经不在名单里的条目的鱼淡出离开。
     * instant 直接 alive（首次载入）；from 是 { x, y }，新鱼从该点游入（托盘位置）。重复调用幂等。
     * 渲染条数超出上限时不再生成（条目名单已被 normalizeEntries 限制过，这里是第二道防线）。
     */
    function reconcile(world, entries, { instant = false, from = null } = {}) {
        const list = Array.isArray(entries) ? entries : [];
        const wanted = new Set(list.map(item => item.id));
        for (const id of new Set(world.fish.filter(f => f.state !== 'leaving').map(f => f.entry))) {
            if (!wanted.has(id)) dismiss(world, id);
        }
        const present = new Set(world.fish.filter(f => f.state !== 'leaving').map(f => f.entry));
        let live = world.fish.filter(f => f.state !== 'leaving').length;
        for (const item of list) {
            if (present.has(item.id)) continue;
            const spec = speciesById(item.species);
            if (!spec || live + spec.group > maxFish(world.lowPower)) continue;
            spawnGroup(world, item, { instant, from });
            live += spec.group;
        }
    }

    /**
     * 让某个条目的所有鱼离开（捞出或移除）；被抓着的那条一并松开。
     * options.to 是 { x, y } 落点（网兜）时，鱼被拉向落点、边游边缩、先保持清晰再淡出（SCOOP_*）；
     * 没有落点或落点不合法时仍是原地淡出（LEAVE_S）。
     */
    function dismiss(world, entryId, options) {
        const to = options && options.to;
        const target = to && typeof to === 'object' && finite(to.x, to.y) ? to : null;
        const spread = PARAMS.SCOOP_SPREAD * world.scale;
        for (const f of world.fish) {
            if (f.entry !== entryId || f.state === 'leaving') continue;
            f.state = 'leaving';
            f.held = null;
            if (target) {
                f.leaveTo = { x: target.x + (world.random() - 0.5) * spread, y: target.y + (world.random() - 0.5) * spread };
                f.scoopT = 0;
            }
        }
        delete world.groups[entryId];
    }

    // ---------- 命中与抓取 ----------

    function inHitRegion(f, x, y) {
        if (!finite(x, y, f.x, f.y, f.ang)) return false;
        const c = Math.cos(f.ang);
        const s = Math.sin(f.ang);
        const dx = x - f.x;
        const dy = y - f.y;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const rx = f.len * 0.6 * PARAMS.HIT_SCALE + PARAMS.HIT_PAD;
        const ry = f.len * 0.35 * PARAMS.HIT_SCALE + PARAMS.HIT_PAD;
        return (lx / rx) * (lx / rx) + (ly / ry) * (ly / ry) <= 1;
    }

    function grabbable(f) {
        return (f.state === 'alive' || f.state === 'entering') && f.alpha >= PARAMS.HIT_ALPHA;
    }

    /** 指针下面是哪条鱼：重叠时取更近（z 大，相同取后来的）；离开中、被抓着的、没淡入出来的不算。坏坐标返回 null。 */
    function hitTest(world, x, y) {
        if (!finite(x, y)) return null;
        let top = null;
        for (const f of world.fish) {
            if (!grabbable(f) || !inHitRegion(f, x, y)) continue;
            if (!top || f.z >= top.z) top = f;
        }
        return top;
    }

    /**
     * 抓住 fish：指针必须在它抓得到的范围内；同时只抓一条。
     * options.tail 为真表示抓的是尾巴（互动子项目的“拉鱼尾”）：记下被抓的那一点在鱼身上的位置，
     * 之后鱼绕着这一点转、指针始终在这一点上，鱼头朝远离指针运动的方向（像被拖着走），见 stepHeld。
     */
    function grab(world, fish, x, y, options) {
        if (!fish || !world.fish.includes(fish) || !grabbable(fish) || !inHitRegion(fish, x, y)) return false;
        if (world.fish.some(f => f.state === 'held')) return false;
        fish.state = 'held';
        fish.alpha = 1;
        fish.held = { ox: (fish.x - x) * PARAMS.HOLD_OFFSET, oy: (fish.y - y) * PARAMS.HOLD_OFFSET, tail: false };
        if (options && options.tail) {
            const dx = x - fish.x;
            const dy = y - fish.y;
            const c = Math.cos(fish.ang);
            const s = Math.sin(fish.ang);
            Object.assign(fish.held, {
                tail: true,
                gx: (dx * c + dy * s) * PARAMS.HOLD_OFFSET,        // 被抓的点在鱼本地坐标里的位置（鼻子朝 +x）
                gy: (-dx * s + dy * c) * PARAMS.HOLD_OFFSET,
                lastX: x, lastY: y, pvx: 0, pvy: 0,                // 指针速度（平滑后），鱼头据此朝向
            });
        }
        return true;
    }

    /** 放开被抓着的鱼：带走一点松手时的速度，继续游。 */
    function release(world, fish, velocity) {
        if (!fish || !world.fish.includes(fish) || fish.state !== 'held') return;
        const v = velocity && finite(velocity.vx, velocity.vy) ? velocity : { vx: 0, vy: 0 };
        const speed = Math.hypot(v.vx, v.vy);
        const k = speed > PARAMS.THROW_MAX ? PARAMS.THROW_MAX / speed : 1;
        fish.state = 'alive';
        fish.held = null;
        fish.vx = v.vx * k;
        fish.vy = v.vy * k;
    }

    // ---------- 推进 ----------

    function validBells(bells) {
        if (!Array.isArray(bells)) return [];
        return bells.filter(b => b && finite(b.x, b.y, b.r) && b.r > 0);
    }

    const NO_ATTRACTORS = Object.freeze([]);

    /**
     * 吸引点（饲料等，由玩法模块给出）：{ x, y, reach, weight, boost }。
     * 只留数字都有限且 reach > 0 的；weight 夹在 0–3（朝它走的合力权重）、boost 夹在 0.5–2.5（靠近时的速度倍数，不超过 FLEE_CAP，免得被速度上限悄悄截掉），夸张的数字不会放大。
     */
    function validAttractors(list) {
        if (!Array.isArray(list) || !list.length) return NO_ATTRACTORS;
        const out = [];
        for (const a of list) {
            if (!a || !finite(a.x, a.y, a.reach, a.weight, a.boost) || a.reach <= 0) continue;
            out.push({ x: a.x, y: a.y, reach: a.reach, weight: clamp(a.weight, 0, 3), boost: clamp(a.boost, 0.5, 2.5) });
        }
        return out;
    }

    /** 某条鱼的巡航速度（px/s）：种类速度 × 视口缩放 × 深度系数；未知种类为 0。玩法冲量以它为单位。 */
    function cruiseSpeed(world, f) {
        const spec = BY_ID[f.species];
        return spec ? spec.speed * world.scale * (1 - PARAMS.Z_SPEED + PARAMS.Z_SPEED * f.z) : 0;
    }

    function stepHeld(world, f, dt, pointer) {
        if (pointer) {
            const h = f.held;
            let tx = pointer.x + h.ox;
            let ty = pointer.y + h.oy;
            if (h.tail) {
                // 拉尾：目标是让被抓的那一点落在指针下（鱼身绕它转）；同时记指针速度，鱼头朝与它相反的方向
                const c = Math.cos(f.ang);
                const s = Math.sin(f.ang);
                tx = pointer.x - (h.gx * c - h.gy * s);
                ty = pointer.y - (h.gx * s + h.gy * c);
                if (Number.isFinite(h.lastX)) {
                    const k = Math.min(1, PARAMS.HOLD_PV_RATE * dt);
                    h.pvx += ((pointer.x - h.lastX) / dt - h.pvx) * k;
                    h.pvy += ((pointer.y - h.lastY) / dt - h.pvy) * k;
                }
                h.lastX = pointer.x; h.lastY = pointer.y;
            }
            let vx = (tx - f.x) * PARAMS.HOLD_K;
            let vy = (ty - f.y) * PARAMS.HOLD_K;
            const speed = Math.hypot(vx, vy);
            if (speed > PARAMS.HOLD_MAX_SPEED) { vx *= PARAMS.HOLD_MAX_SPEED / speed; vy *= PARAMS.HOLD_MAX_SPEED / speed; }
            f.x += vx * dt;
            f.y += vy * dt;
            f.vx = vx; f.vy = vy;
            const fx = h.tail ? -h.pvx : vx;                     // 鱼头朝向跟随的向量：拉尾时与指针运动相反
            const fy = h.tail ? -h.pvy : vy;
            if (Math.hypot(fx, fy) > 20) f.ang += angleDiff(f.ang, Math.atan2(fy, fx)) * Math.min(1, 8 * dt);
        } else if (f.held.tail) {
            f.held.lastX = NaN;                                  // 指针不在：下次有指针时重新取基准，免得速度冲一下
        }
        updateFlip(f, dt);
        f.phase += dt * 14;           // 被抓着时拼命摆尾
    }

    function stepFish(world, f, dt, mates, pointer, bells, attractors) {
        const spec = BY_ID[f.species];
        const scale = world.scale;
        const margin = PARAMS.MARGIN + f.len;

        if (f.state === 'leaving') {
            if (f.leaveTo) {                                  // 被网兜捞起：游向落点、缩小，先清晰后淡出
                f.scoopT = Math.min(1, (f.scoopT || 0) + dt / PARAMS.SCOOP_S);
                const pull = Math.min(1, PARAMS.SCOOP_PULL * dt);
                f.x += (f.leaveTo.x - f.x) * pull;
                f.y += (f.leaveTo.y - f.y) * pull;
                if (f.scoopT >= PARAMS.SCOOP_FADE_AT) f.alpha = Math.max(0, f.alpha - dt / (PARAMS.SCOOP_S * (1 - PARAMS.SCOOP_FADE_AT)));
                if (f.scoopT >= 1) f.alpha = 0;
                f.phase += dt * 12;                            // 被捞起时还在扑腾
                return;
            }
            f.alpha = Math.max(0, f.alpha - dt / PARAMS.LEAVE_S);
            f.x += f.vx * dt; f.y += f.vy * dt;
            return;
        }
        if (f.state === 'entering') {
            f.t += dt;
            f.alpha = Math.min(1, f.t / PARAMS.ENTER_S);
            if (f.t >= PARAMS.ENTER_S) { f.state = 'alive'; f.alpha = 1; }
        }

        const group = world.groups[f.entry];
        if (group && world.time >= group.next) pickHome(world, group, spec);

        const speedT = cruiseSpeed(world, f);
        let sx = 0;
        let sy = 0;

        if (group) {
            const dx = group.hx - f.x;
            const dy = group.hy - f.y;
            const d = Math.hypot(dx, dy);
            if (d > 1) {
                const w = PARAMS.HOME_W * clamp(d / (PARAMS.HOME_NEAR * scale), 0, 1);
                sx += dx / d * w; sy += dy / d * w;
            }
        }

        // 漫游：一个缓慢转向的单位向量（相位与方向按条目共用，成群的鱼往同一边漫游，各自再错开一点）。
        // 少了它，单条鱼到家以后合力只剩“朝家”，期望速度归一化后总是全速，鱼会围着家绕 2–3 px 的小圈、朝向每秒转一两圈。
        const wp = group ? group.wp : f.seed;
        const wanderAng = wp * TAU + f.seed * 0.6 + (wp < 0.5 ? 1 : -1) * world.time * PARAMS.WANDER_RATE + Math.sin(world.time * 0.23 + wp * 17) * 1.2;
        sx += Math.cos(wanderAng) * PARAMS.WANDER_W;
        sy += Math.sin(wanderAng) * PARAMS.WANDER_W;

        const sepR = f.len * PARAMS.SEP_R;
        const alignR = f.len * PARAMS.ALIGN_R;
        const cohR = f.len * PARAMS.COH_R;
        let ax = 0; let ay = 0; let an = 0; let cx = 0; let cy = 0; let cn = 0;
        for (const o of mates) {
            if (o === f || o.state === 'leaving') continue;
            const dx = o.x - f.x;
            const dy = o.y - f.y;
            const d = Math.hypot(dx, dy);
            if (d < 1e-6) { sx += Math.cos(f.seed * TAU) * PARAMS.SEP_W; sy += Math.sin(f.seed * TAU) * PARAMS.SEP_W; continue; }
            if (d < sepR) { const w = (1 - d / sepR) * PARAMS.SEP_W; sx -= dx / d * w; sy -= dy / d * w; }
            if (d < alignR) { const sp = Math.hypot(o.vx, o.vy) || 1; ax += o.vx / sp; ay += o.vy / sp; an++; }
            if (d < cohR) { cx += o.x; cy += o.y; cn++; }
        }
        if (an) { sx += ax / an * PARAMS.ALIGN_W; sy += ay / an * PARAMS.ALIGN_W; }
        if (cn) {
            const dx = cx / cn - f.x;
            const dy = cy / cn - f.y;
            const d = Math.hypot(dx, dy);
            if (d > 1) { sx += dx / d * PARAMS.COH_W; sy += dy / d * PARAMS.COH_W; }
        }

        // 方向的缓慢摆动
        const swing = Math.sin(world.time * 0.6 + f.seed * 40) * PARAMS.WANDER * 0.5;
        const sc = Math.cos(swing);
        const ss = Math.sin(swing);
        const rx = sx * sc - sy * ss;
        const ry = sx * ss + sy * sc;
        sx = rx; sy = ry;

        // 吸引点（饲料）：范围内最近的一个把合力拉向它，并放大期望速度；没有吸引点时 boost 恒为 1，计算与原来逐位一致
        let boost = 1;
        if (attractors.length) {
            let best = null;
            let bestD = Infinity;
            for (const a of attractors) {
                const d = Math.hypot(a.x - f.x, a.y - f.y);
                if (d < a.reach && d < bestD) { best = a; bestD = d; }
            }
            if (best && bestD > 1e-6) {
                sx += (best.x - f.x) / bestD * best.weight;
                sy += (best.y - f.y) / bestD * best.weight;
                boost = best.boost;
            }
        }
        const go = speedT * boost;

        const sl = Math.hypot(sx, sy);
        let dvx; let dvy;
        if (sl > 1e-3) {
            const gain = clamp(sl / PARAMS.STEER_FULL, PARAMS.STEER_MIN, 1);
            dvx = sx / sl * go * gain; dvy = sy / sl * go * gain;
        }
        else { const h = Math.hypot(f.vx, f.vy) || 1; dvx = f.vx / h * go; dvy = f.vy / h * go; }
        const turn = Math.min(1, PARAMS.TURN * dt);
        f.vx += (dvx - f.vx) * turn;
        f.vy += (dvy - f.vy) * turn;

        // 被快速移动的指针惊动：向远离指针的方向冲一下（与水母一致：慢速指针无视；指针就在鱼身上时不惊动，那是要抓它）
        f.cooldown = Math.max(0, f.cooldown - dt);
        if (pointer && world.pointer.has && world.pointer.speed > PARAMS.FLEE_SPEED && f.state === 'alive' && !inHitRegion(f, pointer.x, pointer.y)) {
            const dx = f.x - pointer.x;
            const dy = f.y - pointer.y;
            const reach = PARAMS.FLEE_RADIUS * scale + f.len;
            const d = Math.hypot(dx, dy);
            if (d < reach && d > 1e-6) {
                const push = (1 - d / reach) * PARAMS.FLEE_IMPULSE * scale;
                f.vx += dx / d * push * Math.min(1, dt * 20);
                f.vy += dy / d * push * Math.min(1, dt * 20);
                if (f.cooldown === 0) f.cooldown = PARAMS.FLEE_COOLDOWN_S;
            }
        }

        // 纵向带：只在越出本种的带时回推；软边界：靠近屏幕边缘时回推
        if (f.state === 'alive') {
            const top = spec.band[0] * world.height;
            const bottom = spec.band[1] * world.height;
            const soft = Math.max(1, PARAMS.BAND_SOFT * world.height);
            if (f.y < top) f.vy += clamp((top - f.y) / soft, 0, 3) * PARAMS.BAND_ACC * scale * dt;
            else if (f.y > bottom) f.vy -= clamp((f.y - bottom) / soft, 0, 3) * PARAMS.BAND_ACC * scale * dt;
            const edge = f.len * PARAMS.EDGE_LEN + 20;
            if (f.x < edge) f.vx += clamp((edge - f.x) / edge, 0, 2) * PARAMS.WALL_ACC * scale * dt;
            else if (f.x > world.width - edge) f.vx -= clamp((f.x - (world.width - edge)) / edge, 0, 2) * PARAMS.WALL_ACC * scale * dt;
        }

        const cap = speedT * PARAMS.FLEE_CAP;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > cap) { f.vx *= cap / sp; f.vy *= cap / sp; }

        f.x += f.vx * dt;
        f.y += f.vy * dt;

        // 不进入水母钟罩：位置被平滑推到钟罩外，并带一点沿切线的偏转
        for (const b of bells) {
            const dx = f.x - b.x;
            const dy = f.y - b.y;
            const d = Math.hypot(dx, dy);
            const keep = b.r + f.len * PARAMS.BELL_KEEP;
            const reach = b.r * PARAMS.BELL_AVOID + f.len * 0.5;
            if (d >= reach) continue;
            const nx = d > 1e-6 ? dx / d : Math.cos(f.ang);
            const ny = d > 1e-6 ? dy / d : Math.sin(f.ang);
            f.vx += nx * (1 - d / reach) * PARAMS.BELL_PUSH * scale * dt;
            f.vy += ny * (1 - d / reach) * PARAMS.BELL_PUSH * scale * dt;
            if (d < keep) { const k = Math.min(1, 10 * dt); f.x += nx * (keep - d) * k; f.y += ny * (keep - d) * k; }
        }

        f.x = clamp(f.x, -margin, world.width + margin);
        f.y = clamp(f.y, -margin, world.height + margin);

        if (Math.hypot(f.vx, f.vy) > 1) {
            f.turn = angleDiff(f.ang, Math.atan2(f.vy, f.vx));      // 还差多少没转过去：画法据此让鱼身在转弯时弯一点
            f.ang += f.turn * Math.min(1, 6 * dt);
        }
        updateFlip(f, dt);
        f.phase += dt * TAU * (0.7 + Math.hypot(f.vx, f.vy) / Math.max(1, f.len) * 0.9);
    }

    /**
     * 推进一步。input = { pointer: {x, y} | null, bells: [{x, y, r}], attractors: [{x, y, reach, weight, boost}] }：
     * pointer 用于避让与抓取跟随，bells 是水母钟罩（只读），attractors 是玩法模块给出的吸引点（饲料）。
     * dtMs 非有限或接近 0 时什么都不做；单步最长 50 ms（标签页刚恢复时按 50 ms 算）。
     */
    function step(world, dtMs, input = {}) {
        const seconds = Number(dtMs) / 1000;
        if (!Number.isFinite(seconds) || seconds < PARAMS.MIN_DT) return;
        const dt = Math.min(seconds, PARAMS.MAX_DT);
        world.time += dt;

        const pointer = input && input.pointer && finite(input.pointer.x, input.pointer.y) ? input.pointer : null;
        if (pointer) {
            if (world.pointer.has) {
                const instant = Math.hypot(pointer.x - world.pointer.x, pointer.y - world.pointer.y) / dt;
                world.pointer.speed = lerp(world.pointer.speed, instant, 0.5);
            }
            world.pointer.x = pointer.x; world.pointer.y = pointer.y; world.pointer.has = true;
        } else {
            world.pointer.has = false; world.pointer.speed = 0;
        }

        const bells = validBells(input && input.bells);
        const attractors = validAttractors(input && input.attractors);
        const byEntry = new Map();
        for (const f of world.fish) {
            if (!byEntry.has(f.entry)) byEntry.set(f.entry, []);
            byEntry.get(f.entry).push(f);
        }
        for (const f of world.fish) {
            if (f.state === 'held') stepHeld(world, f, dt, pointer);
            else stepFish(world, f, dt, byEntry.get(f.entry), pointer, bells, attractors);
        }
        world.fish = world.fish.filter(f => !(f.state === 'leaving' && f.alpha <= 0));
    }

    return {
        PARAMS, SPECIES, speciesById, normalizeEntries, canAdd, renderCount, capacity,
        createWorld, resize, reconcile, dismiss, step, hitTest, grab, release, cruiseSpeed,
        clamp, lerp, angleDiff, updateFlip,
    };
});
