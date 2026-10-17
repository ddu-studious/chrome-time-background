(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.JellyfishCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // “水母”背景皮肤的纯物理：不碰 DOM、不读任何任务数据、不依赖浏览器 API。
    // 回答三件事：同屏该有几只水母、每只此刻在哪里、什么形状；触须是什么形状。
    // 画法在 jellyfish.js，数据来源与调度在 background-experience.js（共用背景画布与它的单条 RAF）。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const TAU = Math.PI * 2;

    const PARAMS = Object.freeze({
        MAX_COUNT: 8,             // 同屏最多几只；待办再多也只画这么多
        MAX_COUNT_LOW: 4,         // 省流量模式
        COLORS: 8,                // 色位数（按色相环顺序排列，见 jellyfish.js 的 PALETTE）；不得小于 MAX_COUNT，同屏存活的才能各不相同
        LOOKS: Object.freeze(['solid', 'duo', 'blend', 'rainbow']),   // 外观：纯色，以及三种多色（见 pickLook）
        DUO_OFFSETS: Object.freeze([2, 3, 4]),    // duo：触须与主色相隔的色位数（每位约 45°）。至少 90°，一眼就是两种颜色
        BLEND_OFFSETS: Object.freeze([2]),        // blend：渐变两端相隔的色位数。90°：差别一眼看得出（真机截图：只隔 1 位时几乎看不出在渐变），再远中段会混成灰色
        RAINBOW_STEP: 2,          // rainbow：三种颜色 = 主色、主色 + 1 步、主色 + 2 步（方向随机），每步这么多个色位
        BELL_MIN: 30,             // 钟罩半径范围（CSS px，再乘视口缩放）
        BELL_MAX: 50,
        SCALE_MIN: 0.75,          // 视口缩放：min(宽, 高) / SCALE_BASE，夹在这个范围内
        SCALE_MAX: 1.5,
        SCALE_BASE: 820,
        TENTACLES: 9,             // 细触须
        TENTACLES_LOW: 5,
        ARMS: 3,                  // 口腕（短而粗的飘带）
        ARMS_LOW: 2,
        SEGMENTS: 12,             // 每条触须的节点数
        SEGMENTS_LOW: 8,
        ITERATIONS: 3,            // 距离约束迭代次数
        SQUEEZE_S: 0.2,           // 收缩（挤出水）
        RELAX_S: 0.95,            // 舒张（缓慢张开）
        THRUST: 120,              // 一次收缩给的速度（px/s），再乘钟罩大小
        DRAG: 1.45,               // 钟罩速度阻尼（每秒）
        SINK: 14,                 // 两次收缩之间的下沉加速度（px/s²）
        TENTACLE_DRAG: 2.3,
        TENTACLE_SINK: 46,
        FLOW_AMP: 26,             // 水流让触须尖端摆动的加速度（px/s²）
        PERIODS: Object.freeze([2, 3]),   // 每只水母每隔几拍收缩一次
        ENTER_S: 1.5,
        LEAVE_S: 1.9,
        HOME_MIN_S: 16,           // 换一个漫游目标的间隔
        HOME_SPAN_S: 14,
        FLEE_SPEED: 240,          // 指针快于此（px/s）才会惊动水母
        FLEE_RADIUS: 3.4,         // 惊动半径 = 钟罩半径 × 此值
        FLEE_IMPULSE: 150,
        FLEE_COOLDOWN_S: 0.9,
        BEAT_FRESH_MS: 1500,      // 时钟数字在这段时间内变化过，才信它做拍点
        PLANKTON: 42,
        PLANKTON_LOW: 20,
        MAX_DT: 0.05,             // 单步最长 50ms；更长（标签页刚恢复）按 50ms 算
        MIN_DT: 0.0001,
        HEADING_LIMIT: 1.2,       // 水母只往上方半圆游，靠下沉回落
        HOVER_SPAN: 0.25,         // 比漫游点深（浅）这么多倍屏幕高度时，收缩的推力到上限（下限）：见 thrustScale
        HOVER_THRUST: 0.3,        // 正好在漫游点高度时的推力系数：取在“刚好抵消下沉”所需（周期 2 拍约 0.23、3 拍约 0.35，随钟罩大小略有不同）的中间，水母在漫游点上下小幅起伏
        HOVER_MIN: 0.12,          // 比漫游点浅得多时的最小推力系数：基本不再往上游，靠下沉回落
        WALL_PUSH: 5,             // 软边界的回推强度（1/秒²）：起舞时的扭步与摇摆横向速度大，原来的 0.9 挡不住，约 1% 的时间水母中心会跑出屏幕最多 140 px
        SIDE_THRUST: 1.5,         // 水平方向的推力系数下限：thrustScale 只管“上下”，横向不受它压低，否则一次收缩横移只有二三十像素，漫游点还没到就换了；实测加上这条和 DESCENT_BOOST、更长的 HOME_MIN_S 后，水平标准差由 0.16 倍屏宽升到约 0.22（漫游点均匀分布时是 0.23），中间 30%–70% 的占比由约 75% 降到约 58%
        DESCENT_BOOST: 2.5,       // 比漫游点浅（在它上方）时额外加快下沉的倍数（至多 1 + 此值倍 SINK）：只靠 SINK 下沉太慢（终速约 10 px/s），要去更低的漫游点来不及
        TILT_LIMIT: 0.55,         // 钟罩倾斜上限，保证不会翻过来
        LABEL_EM: 9,              // 任务名最多约这么多个“汉字宽”（拉丁字母按 0.55 个汉字宽算），超出截断加省略号
        HOT_REACH: 2.4,           // 指针离钟罩中心在“半径 × 此值”以内时，任务名从隐约变清楚
        HOT_RATE: 7,              // 任务名变清楚/退回隐约的速度（1/秒）
        HIT_SCALE: 1.25,          // 抓得到的范围 = 钟罩（半宽、半高）× 此值 + HIT_PAD：比看得见的钟罩略大一圈，手抖也抓得到
        HIT_PAD: 8,
        HIT_DROP: 0.45,           // 裙边下方这一段（钟罩半径 × 此值 + HIT_PAD）也抓得到；触须不算
        HIT_ALPHA: 0.5,           // 淡入到这个程度才抓得到（刚冒出来的虚影不算）
        HOLD_STIFFNESS: 240,      // 抓着时水母追指针的弹簧：略欠阻尼——软软的有点弹性，但不会来回晃
        HOLD_DAMPING: 26,         // 临界阻尼是 2√刚度 ≈ 31，取它的约 0.84 倍
        HOLD_OFFSET: 0.8,         // 抓住瞬间指针与水母中心的偏差保留这么多（<1：被轻轻拉向指针）
        HOLD_MAX_SPEED: 3200,     // 追指针的速度上限（px/s）：指针一下子跳很远时水母也是游过去，不是瞬移
        THROW_MAX: 900,           // 松手时带走的速度上限（px/s）
        EAT_S: 0.5,               // 被纸篓吃掉：从开始到消失的时长
        NIGHT_START: 20,          // 夜晚荧光：本机时间 20:00 起到次日 06:00 为夜，前后各 NIGHT_FADE 小时渐变（19–20 点渐入、6–7 点渐出）
        NIGHT_END: 6,
        NIGHT_FADE: 1,
        BURST_BUBBLES: 14,        // 完成庆祝：一次升起的气泡数（省流量减半）
        BURST_BUBBLES_LOW: 7,
        BURST_MAX: 24,            // 同屏气泡总数上限；超出时丢最老的
        BURST_RINGS_MAX: 3,       // 同屏光涟漪上限
        BURST_DELAY_S: 0.35,      // 从“回执 ok”到气泡出现的延迟：等水母飞到纸篓口、被吃掉的那一刻
        BURST_LIFE_S: 1.2,        // 气泡寿命（再乘 0.75～1.1 的个体差异）
        BURST_RING_S: 0.75,       // 光涟漪扩散时长
        MOOD_RATE: 1.6,           // 情绪（专注/起舞）变化的快慢（1/秒）：约 1.5 秒内平滑过渡，不会突然换个样子
        FOCUS_THRUST: 0.55,       // 专注时每次收缩的推力系数：游得更慢更稳，像在深呼吸
        DANCE_SWAY: 1.1,          // 起舞时航向随节奏左右摇摆的幅度（弧度/秒）
        DANCE_THRESHOLD: 0.5,     // 起舞程度超过这个值，每一拍都收缩（平时每 2–3 拍一次）
        DANCE_GRID_S: 0.7,        // 起舞时共用的“舞步格”（秒）：各只水母按自己的精神状态每隔 every 格收缩一次，所以快慢不同却踩在同一个格子上
        DANCE_REF_S: 2.5,         // 平时两次收缩的平均间隔（秒）：起舞时收缩更密，纵向推力按间隔折算，免得一路被推到屏幕顶端
        SPIRIT_S: 30,             // 起舞累计每过这么多秒，各只水母的精神状态轮换一位（整体错位，同屏的始终各不相同）
        SPIRIT_RATE: 1.4,         // 精神状态切换的缓动速度（1/秒）：摆幅、快慢、光晕都是渐变，不会突然变脸
        // 五种“精神状态”（起舞时才起作用；每只水母按出生序号错开，不重复）：every 每几格收缩一次，sway 摇摆幅度倍数（1 = 航向来回摆约 ±0.35 弧度，与快慢无关），rate 摇摆快慢（弧度/秒），
        // thrust 收缩力度倍数，shimmy 每次收缩额外的横向“扭步”速度（左右交替），glow/bump 光晕亮度/鼓起倍数，alpha 整体明暗
        SPIRITS: Object.freeze([
            Object.freeze({ id: 'hype', every: 1, sway: 1.0, rate: 4.4, thrust: 1.25, shimmy: 0, glow: 1.35, bump: 1.45, alpha: 1.0 }),     // 嗨：每格都收缩，摇得快，光晕一鼓一鼓很亮
            Object.freeze({ id: 'groove', every: 2, sway: 2.2, rate: 2.0, thrust: 1.0, shimmy: 0, glow: 1.0, bump: 1.0, alpha: 1.0 }),       // 律动：隔格收缩，大幅度慢慢左右荡
            Object.freeze({ id: 'showy', every: 1, sway: 0.9, rate: 3.1, thrust: 0.9, shimmy: 55, glow: 1.15, bump: 1.2, alpha: 1.0 }),      // 爱表演：每次收缩都向左右扭一步，像在走舞步
            Object.freeze({ id: 'chill', every: 3, sway: 0.6, rate: 1.4, thrust: 0.8, shimmy: 0, glow: 0.9, bump: 0.7, alpha: 0.95 }),       // 悠闲：三格才一下，小幅慢摇
            Object.freeze({ id: 'sleepy', every: 4, sway: 0.2, rate: 0.9, thrust: 0.6, shimmy: 0, glow: 0.7, bump: 0.5, alpha: 0.78 }),     // 犯困：四格一下，几乎不摇，身体也暗一点
        ]),
        GROW_STEP: 0.04,          // 成长：每升一级钟罩大一圈（相对出生时的半径）
        GROW_MAX: 5,              // 最高成长级别
        GROW_RATE: 2,             // 钟罩变大的速度（1/秒）
        GROW_TABLE: Object.freeze([0, 1, 2, 3, 3, 4, 4, 5]),   // 连续完成任务 N 天 → 成长级别（N≥7 为最高级）
    });

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function frac(value) { return value - Math.floor(value); }
    function angleDiff(from, to) {
        let d = (to - from) % TAU;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        return d;
    }
    function finite(...values) { return values.every(Number.isFinite); }

    /**
     * 待办数：与首页底部任务滚动条（ticker.js）同一规则——未完成、且不是失败状态。
     * 不按“今日到期”算：很多任务没设截止日期，那样数量会常年为 0。传入不是数组时返回 null（表示读不到，不是 0）。
     */
    function pendingCount(memos) {
        if (!Array.isArray(memos)) return null;
        let n = 0;
        for (const memo of memos) {
            if (memo && typeof memo === 'object' && !memo.completed && memo.status !== 'failed') n++;
        }
        return n;
    }

    /** 同屏水母数量。非法、负数、小数、无穷一律安全收敛；0 只表示没有待办。 */
    function targetCount(pending, lowPower = false) {
        const n = Math.floor(Number(pending));
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.min(n, lowPower ? PARAMS.MAX_COUNT_LOW : PARAMS.MAX_COUNT);
    }

    // ---------- 任务名单：一只水母 = 一个待办 ----------

    /** 一个字符占多宽（以“汉字宽”为单位）：汉字/全角/emoji 算 1，其余（拉丁字母、数字、标点）算 0.55。 */
    function glyphEm(codePoint) {
        return (codePoint >= 0x2E80 && codePoint <= 0xD7FF) || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
            || (codePoint >= 0xFF00 && codePoint <= 0xFFEF) || codePoint >= 0x1F000 ? 1 : 0.55;
    }

    /** 把任务名截到最多 maxEm 个汉字宽，超出加省略号；按码点迭代，不会拆开 emoji 这样的代理对。 */
    function clipLabel(text, maxEm = PARAMS.LABEL_EM) {
        const glyphs = Array.from(String(text));
        let used = 0;
        for (let i = 0; i < glyphs.length; i++) {
            used += glyphEm(glyphs[i].codePointAt(0));
            if (used > maxEm + 1e-9) return glyphs.slice(0, i).join('') + '…';
        }
        return glyphs.join('');
    }

    const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

    /** 任务的显示名：取标题（缺则取正文），空白折成一个空格，去掉控制字符和方向控制符，空了就叫“无标题”，再截断。 */
    function labelOf(memo) {
        for (const candidate of [memo.title, memo.text]) {
            if (typeof candidate !== 'string' && typeof candidate !== 'number') continue;
            const text = String(candidate).replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').trim();
            if (text) return clipLabel(text);
        }
        return '无标题';
    }

    const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

    /**
     * 该有水母的任务：规则与 pendingCount 一致（未完成且非失败，数量必须相等），排序与首页任务滚动条（ticker.js）一致——
     * 过期的优先，再按优先级（高/中/低/无），再按截止日期（有日期的在前），其余保持任务表顺序。
     * today 是本地日期 'YYYY-MM-DD'，不传就不判断过期。返回 [{ key, id, label }]：key 在名单内唯一（水母绑定的就是它），
     * id 是任务原来的 id（字符串或数字），没有可靠 id 的任务为 null（水母会出现但不能被抓取完成）。传入不是数组返回 null。
     */
    function pendingTasks(memos, today = '') {
        if (!Array.isArray(memos)) return null;
        const seen = new Set();
        const rows = [];
        memos.forEach((memo, index) => {
            if (!memo || typeof memo !== 'object' || memo.completed || memo.status === 'failed') return;
            const valid = (typeof memo.id === 'string' && memo.id !== '') || (typeof memo.id === 'number' && Number.isFinite(memo.id));
            const base = valid ? `${typeof memo.id === 'number' ? 'n' : 's'}:${memo.id}` : `#${index}`;   // 数字 7 与字符串 '7' 是两个任务
            let key = base;
            for (let n = 2; seen.has(key); n++) key = `${base}~${n}`;
            seen.add(key);
            const due = typeof memo.dueDate === 'string' && memo.dueDate ? memo.dueDate : null;
            rows.push({
                entry: { key, id: valid ? memo.id : null, label: labelOf(memo) },
                overdue: !!(due && today && due < today),
                rank: PRIORITY_RANK[memo.priority] ?? PRIORITY_RANK.none,
                due,
            });
        });
        rows.sort((a, b) => {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
            if (a.rank !== b.rank) return a.rank - b.rank;
            if (a.due && b.due) return a.due < b.due ? -1 : (a.due > b.due ? 1 : 0);
            if (a.due) return -1;
            if (b.due) return 1;
            return 0;
        });
        return rows.map(row => row.entry);
    }

    /** 收缩强度 0..1：先快速挤到 1（SQUEEZE_S），再缓慢舒张回 0（RELAX_S）。 */
    function pulseEnvelope(t) {
        if (!(t >= 0)) return 0;
        if (t < PARAMS.SQUEEZE_S) { const x = t / PARAMS.SQUEEZE_S; return 1 - (1 - x) * (1 - x); }
        const x = (t - PARAMS.SQUEEZE_S) / PARAMS.RELAX_S;
        if (x >= 1) return 0;
        return 0.5 + 0.5 * Math.cos(Math.PI * x);
    }

    /** 钟罩形状：收缩时变窄变高（体积大致守恒），舒张时扁而宽。 */
    function bellShape(jelly) {
        const p = pulseEnvelope(jelly.pulseT);
        return { p, w: jelly.r * (1 - 0.24 * p), h: jelly.r * (0.72 + 0.26 * p) };
    }

    /**
     * 拍点时钟：优先用首页时钟数字的真实变化（显示秒数时每秒变一次，与用户看到的秒针同相）。
     * 只有连续两次变化间隔都不到 BEAT_FRESH_MS（确实是每秒在变）、且最近一次也没过期时才信它；
     * 没显示秒（数字每分钟才变一次）或久未变化时退回整秒的墙钟。两者都只给“第几拍”，不给相位。
     */
    function createBeatClock() {
        let lastAt = -Infinity;
        let steady = false;
        let count = 0;
        return {
            beat(at) {
                steady = at - lastAt < PARAMS.BEAT_FRESH_MS;
                lastAt = at;
                count++;
            },
            index(now, wallMs) {
                if (steady && now - lastAt < PARAMS.BEAT_FRESH_MS) return { index: count, source: 'clock' };
                return { index: Math.floor(wallMs / 1000), source: 'wall' };
            },
        };
    }

    // ---------- 世界 ----------

    function createWorld({ width = 1280, height = 720, random = Math.random, lowPower = false, spirit = null } = {}) {
        const world = {
            width, height, random, lowPower: !!lowPower,
            scale: 1, time: 0, nextId: 1, nextSlot: 0,
            jellies: [], plankton: [],
            fx: { bubbles: [], rings: [] },     // 完成庆祝：纯视觉，不影响水母，也不读写任何任务数据
            mood: { focus: 0, dance: 0 },       // 当前情绪（0..1），朝 moodTarget 平滑过渡：专注 = 游得慢而稳，起舞 = 每拍都收缩并左右摇摆
            moodTarget: { focus: 0, dance: 0 },
            danceTime: 0,                       // 起舞累计时间（秒）：舞步格与精神状态轮换都按它算，不起舞时不走
            spiritBase: null,                   // 精神状态的起点位（第一只水母出生时由它的 seed 定下，不额外消耗随机数）
            spiritLock: PARAMS.SPIRITS.some(item => item.id === spirit) ? spirit : null,   // 固定成某一种（番茄钟里的小水母用），null = 按出生序号轮换
            grow: 0,                            // 成长级别（0..GROW_MAX）：钟罩略大一圈；只读任务完成记录得出，不写任何数据
            pointer: { x: 0, y: 0, speed: 0, has: false },
            beat: null,
        };
        world.scale = scaleFor(width, height);
        seedPlankton(world);
        return world;
    }

    function scaleFor(width, height) {
        return clamp(Math.min(width, height) / PARAMS.SCALE_BASE, PARAMS.SCALE_MIN, PARAMS.SCALE_MAX);
    }

    function seedPlankton(world) {
        const count = world.lowPower ? PARAMS.PLANKTON_LOW : PARAMS.PLANKTON;
        world.plankton = Array.from({ length: count }, () => ({
            x: world.random() * world.width, y: world.random() * world.height,
            z: 0.3 + world.random() * 0.9, tw: world.random() * TAU,
        }));
    }

    /** 屏幕尺寸变了：重新分配漫游目标并按新尺寸缩放；已有水母保持身份与相对位置。 */
    function resize(world, width, height) {
        const ratioX = width / Math.max(1, world.width);
        const ratioY = height / Math.max(1, world.height);
        const scale = scaleFor(width, height);
        const factor = scale / world.scale;
        world.width = width; world.height = height; world.scale = scale;
        for (const j of world.jellies) {
            j.x *= ratioX; j.y *= ratioY;
            j.r *= factor;
            j.r0 *= factor;
            j.home = homeFor(world, j.slot, 0.5, 0.5);
            for (const t of j.tentacles) {
                t.len *= factor;
                const gap = t.len / (t.pts.length - 1);
                t.gap = gap;
            }
            resetTentacles(j);
        }
        seedPlankton(world);
    }

    /** 低差异序列：漫游目标在屏幕里均匀分布，不会挤成一团。 */
    function homeFor(world, slot, jitterX = 0.5, jitterY = 0.5) {
        const u = frac(0.5 + slot * 0.7548776662 + (jitterX - 0.5) * 0.18);
        const v = frac(0.5 + slot * 0.5698402910 + (jitterY - 0.5) * 0.18);
        return { x: world.width * (0.08 + 0.84 * u), y: world.height * (0.14 + 0.68 * v) };
    }

    function rimAnchor(jelly, u) {
        const { w, h } = bellShape(jelly);
        const lx = u * w * 0.92;
        const ly = 0.05 * h;
        const c = Math.cos(jelly.tilt);
        const s = Math.sin(jelly.tilt);
        return { x: jelly.x + lx * c - ly * s, y: jelly.y + lx * s + ly * c };
    }

    function makeTentacles(world, jelly) {
        const rand = world.random;
        const thin = world.lowPower ? PARAMS.TENTACLES_LOW : PARAMS.TENTACLES;
        const arms = world.lowPower ? PARAMS.ARMS_LOW : PARAMS.ARMS;
        const segments = world.lowPower ? PARAMS.SEGMENTS_LOW : PARAMS.SEGMENTS;
        const list = [];
        const make = (kind, u, len, width) => {
            const gap = len / (segments - 1);
            const anchor = rimAnchor(jelly, u);
            const pts = Array.from({ length: segments }, (_, i) => ({
                x: anchor.x, y: anchor.y + i * gap, vx: 0, vy: 0, ox: anchor.x, oy: anchor.y + i * gap,
            }));
            list.push({ kind, u, len, gap, width, phase: rand() * TAU, pts });
        };
        for (let k = 0; k < thin; k++) {
            const u = thin === 1 ? 0 : -0.82 + 1.64 * (k / (thin - 1)) + (rand() - 0.5) * 0.06;
            make('thin', u, jelly.r * lerp(2.6, 4.2, rand()), lerp(0.9, 1.4, rand()));
        }
        for (let k = 0; k < arms; k++) {
            const u = arms === 1 ? 0 : -0.34 + 0.68 * (k / (arms - 1));
            make('arm', u, jelly.r * lerp(1.8, 2.7, rand()), lerp(3.2, 4.6, rand()));
        }
        return list;
    }

    function resetTentacles(jelly) {
        for (const t of jelly.tentacles) {
            const anchor = rimAnchor(jelly, t.u);
            t.pts.forEach((p, i) => {
                p.x = p.ox = anchor.x; p.y = p.oy = anchor.y + i * t.gap; p.vx = p.vy = 0;
            });
        }
    }

    // 不起舞时的“中性”表现：摇摆幅度 1、快慢 3.1（与加入精神状态之前的起舞摇摆一致）、其余不变
    const NEUTRAL_DANCE = Object.freeze({ sway: 1, rate: 3.1, thrust: 1, shimmy: 0, glow: 1, bump: 1, alpha: 1 });

    function spawn(world, instant) {
        const rand = world.random;
        const slot = world.nextSlot++;
        const r = lerp(PARAMS.BELL_MIN, PARAMS.BELL_MAX, rand()) * world.scale;
        const home = homeFor(world, slot, rand(), rand());
        const period = PARAMS.PERIODS[slot % PARAMS.PERIODS.length];
        const jelly = {
            id: world.nextId++, slot, seed: rand(), color: 0, r, r0: r,
            x: instant ? home.x + (rand() - 0.5) * 60 : home.x,
            y: instant ? home.y + (rand() - 0.5) * 60 : world.height + r * 2.5 + rand() * 40,
            vx: 0, vy: instant ? 0 : -48,
            heading: (rand() - 0.5) * 0.6, tilt: 0,
            home, homeAt: world.time + PARAMS.HOME_MIN_S + rand() * PARAMS.HOME_SPAN_S,
            period, offset: slot % period, lastBeat: null,
            pulseT: 99, cooldown: 0,
            dz: { ...NEUTRAL_DANCE }, swayPhase: 0, lastGrid: null, shimSign: 1,   // 起舞表现（缓动中的当前值）、摇摆相位、上一个舞步格、扭步方向
            state: 'entering', alpha: 0,
            taskKey: null, taskId: null, label: '',     // 绑定的任务（数量模式下为空）；任务名在 reconcile 里写入
            hot: 0,                                      // 0 隐约 .. 1 清楚：指针靠近时任务名变清楚
            held: null,                                  // 被抓着：{ px, py, ox, oy }（指针最后位置、抓住时与中心的偏差）
            busy: null,                                  // 停在纸篓口等完成回执：{ x, y }
            eat: null,                                   // 被纸篓吃掉中：{ x, y, t, r0, a0 }
            tentacles: [],
        };
        if (world.spiritBase === null) world.spiritBase = Math.floor(jelly.seed * PARAMS.SPIRITS.length) % PARAMS.SPIRITS.length;
        jelly.tentacles = makeTentacles(world, jelly);
        jelly.color = pickColor(world);       // 放在最后：不改变上面各项用到的随机数序列
        jelly.look = pickLook(world, jelly.color);
        return jelly;
    }

    /**
     * 给新水母挑颜色（色位编号，0 .. COLORS-1，按色相环顺序）：同屏存活的各不相同，一只水母活着时颜色不变（所以不会闪色）。
     * 先排除存活的和正在淡出的（淡出的不到两秒就没了，新来的别撞上它）；全被占满时只排除存活的——存活数 ≤ MAX_COUNT ≤ COLORS，
     * 总有一位可借。候选里取“离在场颜色在色相环上最近的距离最大”的：只有两三只时差别最大，第一只则随机起点。
     * 必须在新水母加入 world.jellies 之前调用。
     */
    function pickColor(world) {
        const n = PARAMS.COLORS;
        const alive = new Array(n).fill(false);
        const fading = new Array(n).fill(false);
        for (const j of world.jellies) (isGoing(j) ? fading : alive)[j.color % n] = true;
        let candidates = [];
        for (let c = 0; c < n; c++) if (!alive[c] && !fading[c]) candidates.push(c);
        if (!candidates.length) for (let c = 0; c < n; c++) if (!alive[c]) candidates.push(c);
        if (!candidates.length) candidates = Array.from({ length: n }, (_, c) => c);      // 不会发生；兜底
        let best = [];
        let bestGap = -1;
        for (const c of candidates) {
            let gap = n;                                          // 场上没有别的颜色时所有候选并列
            for (let k = 0; k < n; k++) {
                if (k === c || !(alive[k] || fading[k])) continue;
                const d = Math.abs(c - k);
                gap = Math.min(gap, Math.min(d, n - d));
            }
            if (gap > bestGap) { bestGap = gap; best = [c]; } else if (gap === bestGap) best.push(c);
        }
        return best[Math.min(best.length - 1, Math.floor(world.random() * best.length))];
    }

    /**
     * 给新水母挑外观 { kind, colors }：colors 是色位编号，第一种固定是主色（pickColor 保证同屏互不相同的那个）。
     *   solid   一种颜色；
     *   duo     钟罩主色、触须另一种颜色（与主色隔 DUO_OFFSETS 个色位，正反方向随机）；
     *   blend   钟罩由边缘的主色渐变到中心的另一种、触须由根到尖也渐变（隔 BLEND_OFFSETS 个色位）；
     *   rainbow 三种颜色沿钟罩横向铺开：主色，再朝同一个方向（正反随机）每隔 RAINBOW_STEP 个色位各一种。
     * 同屏总是纯色和多色都有：新来的补上在场（不含正在淡出的）人数较少的那一类，相同时随机；多色里同理轮着用三种样式。
     * 一只水母的外观出生时定下、一生不变（所以别的水母来去不会让它变样）。必须在新水母加入 world.jellies 之前调用。
     */
    function pickLook(world, primary) {
        const n = PARAMS.COLORS;
        const rand = world.random;
        const here = world.jellies.filter(j => !isGoing(j) && j.look);
        const solids = here.filter(j => j.look.kind === 'solid').length;
        const multis = here.length - solids;
        const wantSolid = solids === multis ? rand() < 0.5 : solids < multis;
        const sign = rand() < 0.5 ? 1 : -1;
        const wrap = c => ((c % n) + n) % n;
        const choose = list => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
        if (wantSolid) return { kind: 'solid', colors: [primary] };
        const kinds = PARAMS.LOOKS.slice(1);
        const used = kinds.map(kind => here.filter(j => j.look.kind === kind).length);
        const fewest = Math.min(...used);
        const kind = choose(kinds.filter((_, i) => used[i] === fewest));
        if (kind === 'duo') return { kind, colors: [primary, wrap(primary + sign * choose(PARAMS.DUO_OFFSETS))] };
        if (kind === 'blend') return { kind, colors: [primary, wrap(primary + sign * choose(PARAMS.BLEND_OFFSETS))] };
        return { kind, colors: [primary, wrap(primary + sign * PARAMS.RAINBOW_STEP), wrap(primary + sign * PARAMS.RAINBOW_STEP * 2)] };
    }

    function leave(world, jelly) {
        jelly.state = 'leaving';
        jelly.held = null;
        jelly.busy = null;
        jelly.period = 1;
        jelly.offset = 0;
        jelly.home = { x: jelly.x + (world.random() - 0.5) * 80, y: -jelly.r * 8 };
    }

    /** 正在离开（游走淡出）或正被纸篓吃掉的水母：不再算在场，新来的水母也不撞它的颜色。 */
    function isGoing(jelly) { return jelly.state === 'leaving' || jelly.state === 'eating'; }

    /** 被抓着或停在纸篓口等回执：任务名单怎么变都不能把它赶走（赶走了就抓不回、也没法完成）。 */
    function isCarried(jelly) { return !!(jelly.held || jelly.busy); }

    /**
     * 让水母跟上待办：多了就从屏幕下方游进来，少了就往上游走并淡出。pending 有两种形式：
     *   数组（pendingTasks 的结果）——一只水母绑定一个任务：完成/删除哪个任务，走的就是那一只；新任务来一只新的；
     *     只给最靠前的 MAX_COUNT（省流量 MAX_COUNT_LOW）个任务配水母，更紧迫的任务插队时挤掉最靠后的那只；
     *     已有水母的任务名随任务改名更新；名单里没有的水母（含数量模式遗留的匿名水母）离开；
     *   数字——只管数量（旧用法，水母不绑定任务），少了就随机挑一只走。
     * 离开中的水母不会被复活（同一个任务又出现时新来一只）。返回水母的目标数量。
     * instant：首次填充，直接出现在各自的漫游位置（只淡入），避免刚打开首页时空荡荡。
     */
    function reconcile(world, pending, { instant = false } = {}) {
        if (Array.isArray(pending)) return reconcileTasks(world, pending, instant);
        const target = targetCount(pending, world.lowPower);
        let alive = world.jellies.filter(j => !isGoing(j));
        while (alive.length < target) {
            const fresh = spawn(world, instant);
            world.jellies.push(fresh);
            alive.push(fresh);
        }
        while (alive.length > target) {
            const free = alive.filter(j => !isCarried(j));
            if (!free.length) break;
            const pick = free[Math.min(free.length - 1, Math.floor(world.random() * free.length))];
            leave(world, pick);
            alive.splice(alive.indexOf(pick), 1);
        }
        return target;
    }

    function reconcileTasks(world, tasks, instant) {
        const cap = world.lowPower ? PARAMS.MAX_COUNT_LOW : PARAMS.MAX_COUNT;
        const wanted = [];
        const wantedKeys = new Set();
        for (const task of tasks) {
            if (wanted.length >= cap) break;
            if (!task || typeof task !== 'object' || typeof task.key !== 'string' || wantedKeys.has(task.key)) continue;
            wantedKeys.add(task.key);
            wanted.push({
                key: task.key,
                id: typeof task.id === 'string' || typeof task.id === 'number' ? task.id : null,
                label: typeof task.label === 'string' ? task.label : '',
            });
        }
        const byKey = new Map();
        for (const jelly of world.jellies) {
            if (isGoing(jelly)) continue;
            if (wantedKeys.has(jelly.taskKey) && !byKey.has(jelly.taskKey)) byKey.set(jelly.taskKey, jelly);
            else if (!isCarried(jelly)) leave(world, jelly);
        }
        for (const task of wanted) {
            const have = byKey.get(task.key);
            if (have) {
                have.label = task.label;
                have.taskId = task.id;
                continue;
            }
            const fresh = spawn(world, instant);
            fresh.taskKey = task.key;
            fresh.taskId = task.id;
            fresh.label = task.label;
            world.jellies.push(fresh);
        }
        return wanted.length;
    }

    // ---------- 抓取 ----------
    // 核心只管“抓得到吗、抓住后怎么动、松手/被吃掉怎么收尾”；是否落进纸篓、任务是否真的完成由控制器与 memo 层决定。

    /** (x, y) 在水母“抓得到的范围”内吗：钟罩椭圆放大一圈，加上裙边下方一小段（不含触须）；跟着钟罩倾斜与收缩。 */
    function inHitRegion(jelly, x, y) {
        if (!finite(x, y, jelly.x, jelly.y, jelly.tilt)) return false;
        const c = Math.cos(jelly.tilt);
        const s = Math.sin(jelly.tilt);
        const dx = x - jelly.x;
        const dy = y - jelly.y;
        const lx = dx * c + dy * s;            // 换到水母自己的坐标系（与 rimAnchor 的旋转相反）
        const ly = -dx * s + dy * c;
        const { w, h } = bellShape(jelly);
        const rx = w * PARAMS.HIT_SCALE + PARAMS.HIT_PAD;
        const ry = ly <= 0 ? h * PARAMS.HIT_SCALE + PARAMS.HIT_PAD : jelly.r * PARAMS.HIT_DROP + PARAMS.HIT_PAD;
        return (lx / rx) * (lx / rx) + (ly / ry) * (ly / ry) <= 1;
    }

    function grabbable(jelly) {
        return (jelly.state === 'alive' || jelly.state === 'entering') && jelly.alpha >= PARAMS.HIT_ALPHA && !isCarried(jelly);
    }

    function findJelly(world, target) {
        if (target && typeof target === 'object') return world.jellies.includes(target) ? target : null;
        return world.jellies.find(j => j.id === target) || null;
    }

    /** 指针下面是哪只水母：重叠时取画在最上面的（半径大的，相同取后来的）；离开中、被吃中、没淡入出来的、已被抓着的不算。坏坐标返回 null。 */
    function hitTest(world, x, y) {
        if (!finite(x, y)) return null;
        let top = null;
        for (const jelly of world.jellies) {
            if (!grabbable(jelly) || !inHitRegion(jelly, x, y)) continue;
            if (!top || jelly.r >= top.r) top = jelly;
        }
        return top;
    }

    /** 抓住 target（水母对象或编号）：指针必须在它抓得到的范围内；同时只抓一只，有水母停在纸篓口等回执时也不再抓别的。 */
    function grab(world, target, x, y) {
        const jelly = findJelly(world, target);
        if (!jelly || !finite(x, y) || !grabbable(jelly) || world.jellies.some(isCarried) || !inHitRegion(jelly, x, y)) return false;
        jelly.held = { px: x, py: y, ox: jelly.x - x, oy: jelly.y - y };
        jelly.hot = 1;
        return true;
    }

    /** 被抓着的水母停到纸篓口（x, y）等完成回执：之后不再跟指针。没被抓着的返回 false。 */
    function setBusy(world, target, x, y) {
        const jelly = findJelly(world, target);
        if (!jelly || !jelly.held || !finite(x, y)) return false;
        jelly.held = null;
        jelly.busy = { x, y };
        return true;
    }

    /**
     * 松手（或完成失败放回去）：带着 velocity 继续游，速度夹在 THROW_MAX 内；坏的速度当 0；不给 velocity 就保留它自己的。
     * 马上重新挑漫游点。不在被抓着/等回执的返回 false。
     */
    function release(world, target, velocity) {
        const jelly = findJelly(world, target);
        if (!jelly || !isCarried(jelly)) return false;
        let vx = jelly.vx;
        let vy = jelly.vy;
        if (velocity !== undefined && velocity !== null) {
            vx = Number(velocity.vx);
            vy = Number(velocity.vy);
            if (!finite(vx, vy)) { vx = 0; vy = 0; }
        }
        const speed = Math.hypot(vx, vy);
        if (speed > PARAMS.THROW_MAX) { vx *= PARAMS.THROW_MAX / speed; vy *= PARAMS.THROW_MAX / speed; }
        jelly.vx = vx;
        jelly.vy = vy;
        jelly.held = null;
        jelly.busy = null;
        jelly.homeAt = world.time;
        return true;
    }

    /** 被纸篓吃掉：飞向 (x, y)、缩小淡出，EAT_S 后移除。离开中/已在被吃的不行。 */
    function consume(world, target, x, y) {
        const jelly = findJelly(world, target);
        if (!jelly || isGoing(jelly) || !finite(x, y)) return false;
        jelly.held = null;
        jelly.busy = null;
        jelly.state = 'eating';
        jelly.eat = { x, y, t: 0, r0: jelly.r, a0: jelly.alpha };
        return true;
    }

    // ---------- 夜晚荧光 ----------

    /**
     * 夜晚程度 0～1：hour 是本地时间的小时（可带小数，如 19.5 = 19:30）。
     * 20:00～次日 06:00 为 1，19～20 点与 6～7 点用平滑曲线渐变，其余时间为 0。非有限数按白天（0）处理。
     */
    function nightAmount(hour) {
        if (!Number.isFinite(hour)) return 0;
        const day = ((hour % 24) + 24) % 24;
        const t = day < 12 ? day + 24 : day;                  // 中午前算成“昨晚的延续”：6 点 → 30
        const start = PARAMS.NIGHT_START;
        const end = PARAMS.NIGHT_END + 24;
        const fade = PARAMS.NIGHT_FADE;
        const smooth = k => { const c = clamp(k, 0, 1); return c * c * (3 - 2 * c); };
        if (t <= start - fade) return 0;
        if (t < start) return smooth((t - (start - fade)) / fade);
        if (t <= end) return 1;
        if (t < end + fade) return 1 - smooth((t - end) / fade);
        return 0;
    }

    // ---------- 完成庆祝 ----------

    /**
     * 在 (x, y)（纸篓口）放一次庆祝：一圈光涟漪 + 一串上升的气泡，颜色取自被吃掉的那只水母（opts.color 是色位编号）。
     * 延迟 opts.delay 秒（默认 BURST_DELAY_S）才出现，等水母飞到篓口。纯视觉；返回新增的气泡数，坐标不是有限数时什么都不做（返回 0）。
     * 同屏气泡总数不超过 BURST_MAX（丢最老的），涟漪不超过 BURST_RINGS_MAX。
     */
    function celebrate(world, x, y, opts = {}) {
        if (!world || !world.fx || !finite(x, y)) return 0;
        const delay = Number.isFinite(opts.delay) && opts.delay >= 0 ? opts.delay : PARAMS.BURST_DELAY_S;
        const color = Number.isInteger(opts.color) ? opts.color : 0;
        const scale = world.scale;
        const fx = world.fx;
        fx.rings.push({ x, y, t: -delay, color });
        while (fx.rings.length > PARAMS.BURST_RINGS_MAX) fx.rings.shift();
        const count = world.lowPower ? PARAMS.BURST_BUBBLES_LOW : PARAMS.BURST_BUBBLES;
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + (world.random() - 0.5) * 2.2;      // 向上的扇形，左右各约 63°
            const speed = (110 + 170 * world.random()) * scale;
            fx.bubbles.push({
                x: x + (world.random() - 0.5) * 22 * scale, y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                r: (3 + 4.6 * world.random()) * scale,
                life: PARAMS.BURST_LIFE_S * (0.75 + 0.35 * world.random()),
                t: -delay, wobble: world.random() * Math.PI * 2, color,
            });
        }
        while (fx.bubbles.length > PARAMS.BURST_MAX) fx.bubbles.shift();
        return count;
    }

    function stepFx(world, dt) {
        const fx = world.fx;
        if (!fx) return;
        for (const b of fx.bubbles) {
            b.t += dt;
            if (b.t <= 0) continue;
            const drag = Math.exp(-1.7 * dt);
            b.vx *= drag; b.vy = b.vy * drag - 26 * world.scale * dt;      // 阻尼后继续缓缓上浮
            b.x += (b.vx + Math.sin(b.wobble + b.t * 6) * 14 * world.scale) * dt;
            b.y += b.vy * dt;
        }
        for (const r of fx.rings) r.t += dt;
        fx.bubbles = fx.bubbles.filter(b => b.t < b.life);
        fx.rings = fx.rings.filter(r => r.t < PARAMS.BURST_RING_S);
    }

    // ---------- 步进 ----------

    /**
     * 自由漫游的水母一次收缩的推力系数（HOVER_MIN～1）：比自己的漫游点深就用力往上游，比它浅就收着点劲。
     * 每次收缩都固定向上推、两次之间只缓慢下沉，不调节的话水母会一路游到屏幕顶端贴边——用真实的核心逐帧模拟 180 秒：
     * 84% 的时间在屏幕顶部 20% 以内（漫游点其实分布在 16%～76%），而那里正是任务滚动条和卡片，既抓不到，也浪费了均匀分布的漫游点。
     * 按深度调节后它们停在漫游点高度附近（同样的模拟：顶部 20% 以内降到约 2%，平均高度回到漫游点的平均位置）。
     * 新来的（从屏幕下方游进来）和离开中的（漫游点在屏幕上方）都远比漫游点深，系数是 1，行为不变。
     * 非有限数或没有漫游点时按 1 处理。
     */
    function thrustScale(world, jelly) {
        const home = jelly && jelly.home;
        if (!world || !home) return 1;
        const depth = (jelly.y - home.y) / Math.max(1, world.height * PARAMS.HOVER_SPAN);
        if (!Number.isFinite(depth)) return 1;
        return clamp(PARAMS.HOVER_THRUST + depth * (1 - PARAMS.HOVER_THRUST), PARAMS.HOVER_MIN, 1);
    }

    /** world 只有自由漫游时才传；被抓着的水母挣扎的那几下收缩不按深度调节。 */
    function pulse(jelly, world, thrustMult = 1, verticalMult = 1) {
        jelly.pulseT = 0;
        const dx = Math.sin(jelly.heading);
        const dy = -Math.cos(jelly.heading);
        const calm = world && world.mood ? 1 - (1 - PARAMS.FOCUS_THRUST) * world.mood.focus : 1;
        const full = PARAMS.THRUST * (0.8 + 0.4 * jelly.seed) * (jelly.r / 40) * calm * thrustMult;
        const scale = world ? thrustScale(world, jelly) : 1;
        jelly.vx += dx * full * (world ? Math.max(scale, PARAMS.SIDE_THRUST) : 1);   // 横向不受 thrustScale 压低（只保证不低于 SIDE_THRUST）
        jelly.vy += dy * full * scale * verticalMult;
    }

    /** 这只水母当前的精神状态（SPIRITS 里的一项）：固定的优先，否则按出生序号错开并随起舞累计时间轮换。 */
    function spiritOf(world, jelly) {
        const list = PARAMS.SPIRITS;
        if (world.spiritLock) return list.find(item => item.id === world.spiritLock) || list[0];
        const n = list.length;
        const shift = Math.floor(world.danceTime / PARAMS.SPIRIT_S);
        return list[(((world.spiritBase || 0) + jelly.slot * 2 + shift) % n + n) % n];
    }

    function noise(t) { return (Math.sin(t) + 0.5 * Math.sin(2.3 * t + 1.7)) / 1.5; }

    function stepTentacles(world, jelly, dt) {
        const n = jelly.tentacles.length ? jelly.tentacles[0].pts.length : 0;
        for (const t of jelly.tentacles) {
            const anchor = rimAnchor(jelly, t.u);
            const pts = t.pts;
            pts[0].x = anchor.x; pts[0].y = anchor.y;
            const damp = Math.exp(-PARAMS.TENTACLE_DRAG * dt);
            for (let i = 1; i < n; i++) {
                const p = pts[i];
                const tip = i / (n - 1);
                const ax = Math.sin(world.time * 1.1 + t.phase + i * 0.5) * PARAMS.FLOW_AMP * tip;
                p.vx = (p.vx + ax * dt) * damp;
                p.vy = (p.vy + PARAMS.TENTACLE_SINK * dt) * damp;
                p.ox = p.x; p.oy = p.y;
                p.x += p.vx * dt; p.y += p.vy * dt;
            }
            for (let iter = 0; iter < PARAMS.ITERATIONS; iter++) {
                pts[0].x = anchor.x; pts[0].y = anchor.y;
                for (let i = 1; i < n; i++) {
                    const a = pts[i - 1];
                    const b = pts[i];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const d = Math.hypot(dx, dy) || 1e-6;
                    const diff = (d - t.gap) / d;
                    if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; } else {
                        const h = 0.5 * diff;
                        a.x += dx * h; a.y += dy * h; b.x -= dx * h; b.y -= dy * h;
                    }
                }
            }
            let sane = true;
            for (let i = 1; i < n; i++) {
                const p = pts[i];
                p.vx = (p.x - p.ox) / dt; p.vy = (p.y - p.oy) / dt;
                if (!finite(p.x, p.y, p.vx, p.vy)) sane = false;
            }
            if (!sane) {
                for (let i = 0; i < n; i++) {
                    pts[i].x = pts[i].ox = anchor.x; pts[i].y = pts[i].oy = anchor.y + i * t.gap;
                    pts[i].vx = pts[i].vy = 0;
                }
            }
        }
    }

    /** 拍点：第几拍 % 周期 === 偏移 时收缩一次，所以每只都与时钟同步但不会同时收缩。起舞（超过阈值）时改走 dancePulse 的舞步格。 */
    function beatPulse(jelly, input, world) {
        if (input.beat !== null && input.beat !== undefined && input.beat !== jelly.lastBeat) {
            jelly.lastBeat = input.beat;
            const phase = ((input.beat % jelly.period) + jelly.period) % jelly.period;
            if (phase === jelly.offset) pulse(jelly, world);
        }
    }

    /**
     * 起舞：共用一个按时间走的“舞步格”（DANCE_GRID_S）。每只水母按精神状态每隔 every 格收缩一次（用 offset 错开），
     * 收缩力度乘 thrust；爱表演的每次收缩再向左右交替扭一步。收缩比平时密，纵向推力按间隔折算（DANCE_REF_S），横向不折算。
     */
    function dancePulse(world, jelly, spirit) {
        const grid = Math.floor(world.danceTime / PARAMS.DANCE_GRID_S);
        if (grid === jelly.lastGrid) return;
        jelly.lastGrid = grid;
        const every = spirit.every;
        if (((grid % every) + every) % every !== jelly.offset % every) return;
        const vertical = Math.min(1, every * PARAMS.DANCE_GRID_S / PARAMS.DANCE_REF_S);
        pulse(jelly, world, jelly.dz.thrust, vertical);
        if (jelly.dz.shimmy > 0.5) {
            jelly.shimSign = -jelly.shimSign;
            jelly.vx += jelly.shimSign * jelly.dz.shimmy * (jelly.r / 40);
        }
    }

    /** 表现参数朝目标（起舞时是精神状态，否则是中性值）缓动；摇摆相位按当前快慢累加，换快慢时不会跳。 */
    function easeDance(world, jelly, spirit, dt) {
        const target = world.mood.dance > 0 ? spirit : NEUTRAL_DANCE;
        const k = 1 - Math.exp(-PARAMS.SPIRIT_RATE * dt);
        const dz = jelly.dz;
        for (const key of Object.keys(NEUTRAL_DANCE)) dz[key] += (target[key] - dz[key]) * k;
        jelly.swayPhase += dz.rate * dt;
    }

    /** 数值出了问题（不该发生）：回到漫游点、触须复位，不让坏数字进入绘制。 */
    function rescue(world, jelly) {
        if (finite(jelly.x, jelly.y, jelly.vx, jelly.vy, jelly.heading, jelly.tilt)) return;
        const home = homeFor(world, jelly.slot);
        jelly.x = home.x; jelly.y = home.y; jelly.vx = jelly.vy = 0; jelly.heading = 0; jelly.tilt = 0;
        resetTentacles(jelly);
    }

    /**
     * 被抓着或停在纸篓口等回执的水母：位置由“追着目标点的弹簧”决定（被抓着追指针，等回执时追纸篓口），
     * 不漫游、不下沉、不被惊动、也不被别的水母顶开，但保留收缩节奏（像在挣扎）和自由摆动的触须。
     * 指针暂时没了（离开窗口）就停在最后的位置。
     */
    function stepCarried(world, jelly, dt, input) {
        const P = PARAMS;
        beatPulse(jelly, input);
        let tx;
        let ty;
        if (jelly.held) {
            const held = jelly.held;
            if (input.pointer) { held.px = input.pointer.x; held.py = input.pointer.y; }
            tx = held.px + held.ox * P.HOLD_OFFSET;
            ty = held.py + held.oy * P.HOLD_OFFSET;
        } else {
            tx = jelly.busy.x;
            ty = jelly.busy.y;
        }
        jelly.vx += (P.HOLD_STIFFNESS * (tx - jelly.x) - P.HOLD_DAMPING * jelly.vx) * dt;
        jelly.vy += (P.HOLD_STIFFNESS * (ty - jelly.y) - P.HOLD_DAMPING * jelly.vy) * dt;
        const speed = Math.hypot(jelly.vx, jelly.vy);
        if (speed > P.HOLD_MAX_SPEED) {
            jelly.vx *= P.HOLD_MAX_SPEED / speed;
            jelly.vy *= P.HOLD_MAX_SPEED / speed;
        }
        jelly.x += jelly.vx * dt;
        jelly.y += jelly.vy * dt;
        jelly.hot = 1;
        jelly.heading *= Math.exp(-2 * dt);
        const targetTilt = clamp(jelly.vx * 0.001, -P.TILT_LIMIT, P.TILT_LIMIT);      // 被拖着时钟罩朝运动方向微微倾斜
        jelly.tilt += (targetTilt - jelly.tilt) * (1 - Math.exp(-6 * dt));
        jelly.pulseT = Math.min(99, jelly.pulseT + dt);
        stepTentacles(world, jelly, dt);
        rescue(world, jelly);
    }

    /** 被纸篓吃掉：飞向纸篓口、缩小、淡出，触须一起收拢；EAT_S 之后由 step 移除。 */
    function stepEating(world, jelly, dt) {
        const e = jelly.eat;
        e.t += dt;
        const k = clamp(e.t / PARAMS.EAT_S, 0, 1);
        const pull = 1 - Math.exp(-14 * dt);
        jelly.x += (e.x - jelly.x) * pull;
        jelly.y += (e.y - jelly.y) * pull;
        jelly.vx = 0; jelly.vy = 0;
        const ratio = Math.pow(1 - k, 1.4);
        jelly.r = Math.max(0.5, e.r0 * ratio);
        jelly.alpha = e.a0 * (1 - k);
        for (const t of jelly.tentacles) t.gap = Math.max(0.05, t.len / (t.pts.length - 1) * ratio);
        jelly.pulseT = Math.min(99, jelly.pulseT + dt);
        stepTentacles(world, jelly, dt);
        rescue(world, jelly);
    }

    function stepJelly(world, jelly, dt, input) {
        const P = PARAMS;
        if (jelly.state === 'eating') { stepEating(world, jelly, dt); return; }
        // 淡入淡出
        if (jelly.state === 'entering') {
            jelly.alpha = Math.min(1, jelly.alpha + dt / P.ENTER_S);
            if (jelly.alpha >= 1) jelly.state = 'alive';
        } else if (jelly.state === 'leaving') {
            jelly.alpha = Math.max(0, jelly.alpha - dt / P.LEAVE_S);
        }
        if (isCarried(jelly)) { stepCarried(world, jelly, dt, input); return; }

        const spirit = spiritOf(world, jelly);
        easeDance(world, jelly, spirit, dt);
        if (world.mood.dance > P.DANCE_THRESHOLD) dancePulse(world, jelly, spirit);
        else beatPulse(jelly, input, world);

        // 漫游目标
        if (jelly.state !== 'leaving' && world.time >= jelly.homeAt) {
            jelly.home = homeFor(world, jelly.slot + Math.floor(world.random() * 40), world.random(), world.random());
            jelly.homeAt = world.time + P.HOME_MIN_S + world.random() * P.HOME_SPAN_S;
        }

        // 航向：均值回复 + 噪声漫游 + 远离漫游点时朝它偏转
        const toHomeX = jelly.home.x - jelly.x;
        const toHomeY = jelly.home.y - jelly.y;
        const dist = Math.hypot(toHomeX, toHomeY);
        const desired = clamp(Math.atan2(toHomeX, -toHomeY), -P.HEADING_LIMIT, P.HEADING_LIMIT);
        const pull = jelly.state === 'leaving' ? 1 : clamp(dist / (Math.min(world.width, world.height) * 0.3), 0, 1);
        jelly.heading += (-jelly.heading * 0.3 + noise(world.time * 0.37 + jelly.seed * 40) * 0.8) * dt;
        jelly.heading += clamp(angleDiff(jelly.heading, desired), -1, 1) * 0.9 * pull * dt;
        if (world.mood && world.mood.dance > 0) jelly.heading += Math.sin(jelly.swayPhase + jelly.seed * TAU) * P.DANCE_SWAY * world.mood.dance * jelly.dz.sway * (jelly.dz.rate / NEUTRAL_DANCE.rate) * dt;   // 幅度 = DANCE_SWAY·sway / 3.1，与快慢无关
        jelly.heading = clamp(jelly.heading, -P.HEADING_LIMIT, P.HEADING_LIMIT);

        // 指针惊动：快速划过时躲开并多收缩一下（冷却内不重复）。指针正对准它（落在抓得到的范围内）时不吓它——
        // 否则每次伸手去抓它都会被躲开
        jelly.cooldown = Math.max(0, jelly.cooldown - dt);
        if (input.pointer && world.pointer.has && world.pointer.speed > P.FLEE_SPEED && jelly.state !== 'leaving'
            && !inHitRegion(jelly, input.pointer.x, input.pointer.y)) {
            const dx = jelly.x - input.pointer.x;
            const dy = jelly.y - input.pointer.y;
            const reach = jelly.r * P.FLEE_RADIUS;
            const d = Math.hypot(dx, dy);
            if (d < reach) {
                const push = (1 - d / reach) * P.FLEE_IMPULSE;
                const norm = d || 1;
                jelly.vx += (dx / norm) * push * dt * 8;
                jelly.vy += (dy / norm) * push * dt * 8;
                if (jelly.cooldown === 0) { pulse(jelly, world); jelly.cooldown = P.FLEE_COOLDOWN_S; }
            }
        }

        // 指针靠近：任务名从隐约变清楚（hot 0 → 1），离开或没有指针后慢慢退回；离开中的水母不亮
        const near = !!input.pointer && !isGoing(jelly)
            && Math.hypot(input.pointer.x - jelly.x, input.pointer.y - jelly.y) < jelly.r * P.HOT_REACH;
        jelly.hot += ((near ? 1 : 0) - jelly.hot) * (1 - Math.exp(-P.HOT_RATE * dt));
        if (!Number.isFinite(jelly.hot)) jelly.hot = 0;

        // 彼此轻轻推开，不叠在一起
        for (const other of world.jellies) {
            if (other === jelly) continue;
            const dx = jelly.x - other.x;
            const dy = jelly.y - other.y;
            const reach = (jelly.r + other.r) * 1.7;
            const d = Math.hypot(dx, dy);
            if (d < reach && d > 1e-6) {
                const push = (1 - d / reach) * 70 * dt;
                jelly.vx += (dx / d) * push;
                jelly.vy += (dy / d) * push;
            }
        }

        // 软边界：靠边就轻轻推回（离开中的水母不受限，才能游出屏幕）
        if (jelly.state !== 'leaving') {
            const m = jelly.r * 2 + 24;
            if (jelly.x < m) jelly.vx += (m - jelly.x) * P.WALL_PUSH * dt;
            if (jelly.x > world.width - m) jelly.vx -= (jelly.x - (world.width - m)) * P.WALL_PUSH * dt;
            if (jelly.y < m) jelly.vy += (m - jelly.y) * P.WALL_PUSH * dt;
            if (jelly.y > world.height - m) jelly.vy -= (jelly.y - (world.height - m)) * P.WALL_PUSH * dt;
        }

        // 在漫游点上方时下沉更快一些（越高越快）：只靠 SINK 终速约 10 px/s，去更低的漫游点要一分钟，漫游点早换了
        const above = clamp((jelly.home.y - jelly.y) / Math.max(1, world.height * P.HOVER_SPAN), 0, 1);
        jelly.vy += P.SINK * (1 + P.DESCENT_BOOST * above) * dt;
        const damp = Math.exp(-P.DRAG * dt);
        jelly.vx *= damp; jelly.vy *= damp;
        jelly.x += jelly.vx * dt; jelly.y += jelly.vy * dt;

        // 钟罩倾斜跟随航向，有上限，不会翻过来
        const targetTilt = clamp(jelly.heading * 0.5, -P.TILT_LIMIT, P.TILT_LIMIT);
        jelly.tilt += (targetTilt - jelly.tilt) * (1 - Math.exp(-3 * dt));

        jelly.pulseT = Math.min(99, jelly.pulseT + dt);
        // 成长：钟罩朝“出生半径 × (1 + 级别 × GROW_STEP)”平滑变大（级别为 0 时半径不动）
        const wantR = jelly.r0 * (1 + P.GROW_STEP * world.grow);
        if (jelly.r !== wantR) jelly.r += (wantR - jelly.r) * (1 - Math.exp(-P.GROW_RATE * dt));
        stepTentacles(world, jelly, dt);
        rescue(world, jelly);
    }

    function stepPlankton(world, dt) {
        for (const p of world.plankton) {
            p.x += Math.sin(world.time * 0.23 + p.tw) * 5 * p.z * dt;
            p.y -= (2 + 3 * p.z) * dt;
            if (p.y < -4) { p.y = world.height + 4; p.x = world.random() * world.width; }
            if (p.x < -4) p.x = world.width + 4; else if (p.x > world.width + 4) p.x = -4;
        }
    }

    /**
     * 推进一步。input = { beat: 第几拍 | null, pointer: {x, y} | null }。
     * dtMs ≤ 0 或不是有限数时什么都不做；超过 MAX_DT 按 MAX_DT 算（标签页刚恢复时不会一步跳很远）。
     */
    function step(world, dtMs, input = {}) {
        const seconds = Number(dtMs) / 1000;
        if (!Number.isFinite(seconds) || seconds < PARAMS.MIN_DT) return;
        const dt = Math.min(seconds, PARAMS.MAX_DT);
        world.time += dt;
        if (world.mood.dance > PARAMS.DANCE_THRESHOLD) world.danceTime += dt;

        const pointer = input.pointer && finite(input.pointer.x, input.pointer.y) ? input.pointer : null;
        if (pointer) {
            if (world.pointer.has) {
                const instant = Math.hypot(pointer.x - world.pointer.x, pointer.y - world.pointer.y) / dt;
                world.pointer.speed = lerp(world.pointer.speed, instant, 0.5);
            }
            world.pointer.x = pointer.x; world.pointer.y = pointer.y; world.pointer.has = true;
        } else {
            world.pointer.has = false; world.pointer.speed = 0;
        }

        const stepInput = { beat: input.beat, pointer };
        for (const jelly of world.jellies) stepJelly(world, jelly, dt, stepInput);
        world.jellies = world.jellies.filter(j => !(j.state === 'leaving' && (j.alpha <= 0 || j.y < -j.r * 6))
            && !(j.state === 'eating' && j.eat.t >= PARAMS.EAT_S));
        stepPlankton(world, dt);
        stepFx(world, dt);
        stepMood(world, dt);
    }

    // ---------- 情绪与成长（纯视觉：只由宿主传入的状态决定，不读写任何业务数据） ----------

    const moodValue = value => (value === true ? 1 : (typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : 0));

    /** 设定情绪目标：{ focus, dance }，布尔或 0..1；没给的项保持不变，非法值按 0。当前值每步向目标靠近（MOOD_RATE）。 */
    function setMood(world, mood = {}) {
        if (!world || !world.moodTarget) return;
        if (mood.focus !== undefined) world.moodTarget.focus = moodValue(mood.focus);
        if (mood.dance !== undefined) world.moodTarget.dance = moodValue(mood.dance);
    }

    function stepMood(world, dt) {
        const k = 1 - Math.exp(-PARAMS.MOOD_RATE * dt);
        for (const key of ['focus', 'dance']) {
            const next = world.mood[key] + (world.moodTarget[key] - world.mood[key]) * k;
            world.mood[key] = Math.abs(next - world.moodTarget[key]) < 0.001 ? world.moodTarget[key] : next;
        }
    }

    /** 设定成长级别：取整并夹在 0..GROW_MAX，非法值按 0。 */
    function setGrowth(world, level) {
        if (!world) return;
        const n = Math.floor(Number(level));
        world.grow = Number.isFinite(n) ? clamp(n, 0, PARAMS.GROW_MAX) : 0;
    }

    /** 纯字符串日期运算：'2026-10-15' 前后移动 n 天（用 UTC 算，不受时区和夏令时影响）；格式不对返回 ''。 */
    function shiftDay(day, n) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
        if (!match) return '';
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + n));
        if (Number.isNaN(date.getTime())) return '';
        const pad = (v, w = 2) => String(v).padStart(w, '0');
        return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    }

    /**
     * 连续有任务完成的天数：只数普通任务（completed 且不是失败、completedAt 是有限的时间戳），按 dayOf(时间戳) 给出的本地日期归天。
     * 从今天往回数；今天还没有完成就从昨天起数（今天还没过完，连续记录不该一早就归零）。memos 不是数组或没有今天的日期时返回 0。
     */
    function completionStreak(memos, today, dayOf) {
        if (!Array.isArray(memos) || typeof dayOf !== 'function' || !shiftDay(today, 0)) return 0;
        const days = new Set();
        for (const memo of memos) {
            if (!memo || typeof memo !== 'object' || memo.completed !== true || memo.status === 'failed') continue;
            if (typeof memo.completedAt !== 'number' || !Number.isFinite(memo.completedAt)) continue;
            const day = dayOf(memo.completedAt);
            if (typeof day === 'string' && day) days.add(day);
        }
        let cursor = days.has(today) ? today : shiftDay(today, -1);
        let streak = 0;
        while (cursor && days.has(cursor) && streak < 400) { streak++; cursor = shiftDay(cursor, -1); }
        return streak;
    }

    /** 连续天数 → 成长级别（查 GROW_TABLE，≥7 天为最高级；非法值 0）。 */
    function growthLevel(streak) {
        const n = Math.floor(Number(streak));
        if (!Number.isFinite(n) || n <= 0) return 0;
        const table = PARAMS.GROW_TABLE;
        return table[Math.min(n, table.length - 1)];
    }

    return {
        PARAMS, pendingCount, pendingTasks, clipLabel, targetCount, pulseEnvelope, bellShape, createBeatClock,
        createWorld, resize, reconcile, step, rimAnchor, homeFor, thrustScale, spiritOf,
        hitTest, grab, setBusy, release, consume, nightAmount, celebrate,
        setMood, setGrowth, shiftDay, completionStreak, growthLevel,
        clamp, lerp, angleDiff,
    };
});
