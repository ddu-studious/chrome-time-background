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
        EDGE_MAX: 0.12,           // 软边界宽度的上限（占屏宽）：真实比例的鲸鲨有 500 多 px 长，不设上限就整个屏幕都是“边界”；大个子转身时身体可以有一部分在屏外
        BAND_ACC: 140,            // 越出本种纵向带时的回推加速度（px/s²）：只在越界时推，带内自由游，避免像早期水母那样挤到屏幕顶端
        BAND_SOFT: 0.1,           // 越界多少屏高时回推达到最大
        TURN: 2.0,                // 速度向期望速度靠拢的快慢（1/s）
        AGILE_LEN: 90,            // 体长大于此值（px，再乘视口缩放）的动物笨重一些：速度回归、漫游转向、边界/纵向带/钟罩的回推与被惊动的冲量都按 此值 ÷ 体长 缩小（下限 0.25 倍）；小鱼恒为 1，数值逐位不变
        ARC_YAW: 2.4,             // 笨重的动物（上面的系数 < 1）转弯走弧线：速度方向最大转速 = 此值 × 系数（rad/s），转弯时速度不降到 0——几百 px 长的动物不能“刹停再掉头”
        ARC_R: 0.5,               // 弧线的最小转弯半径 = 体长 × 此值：最大转速另外不超过 速度 ÷ 这个半径（慢速时转不快）
        YAW_R: 0.35,              // 侧视的大个子（小锤头鲨、鲸鲨）转身是在水面以下的水平面里转半圈，转弯半径 = 体长 × 此值；转半圈用时 = π × 半径 ÷ 速度。侧面看，身体沿游向先缩短、缩到最短时换面、再伸长（xs）
        YAW_START: 0.45,          // 想去的方向的水平分量与现在的面相反且超过此值（合力的单位，家的吸引是 0.9，漫游向量是 0.7）才开始转身；转起来就转完，中途不改主意
        FREE_PITCH: 0.6,          // 自由游时侧视大个子的俯仰上限（rad，约 34°；被戳、被水母或指针推了一下之类的外力直接改过速度时可以暂时超过）：它们不会头朝上倒立着游
        EDGE_STEER: 2.5,          // 笨重的动物靠近软边界/纵向带的边沿时，不是被推回来，而是把“想去的方向”朝里拐：权重（相当于家的吸引 HOME_W 的几倍）
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
        WANDER_PITCH: 0.3,        // 侧视大个子的漫游向量竖直分量的比例：鲨鱼巡航以水平为主、缓缓爬升或下潜；各向同性的漫游会让它们的中位俯仰达到 30° 左右，看上去一直在俯冲
        STEER_FULL: 0.25,         // 合力短于此时，期望速度按比例放慢：合力相互抵消时方向不可靠，鱼放慢一点而不是全速猜一个方向（那会让速度方向突然翻转）
        STEER_MIN: 0.4,           // 放慢到的最低比例
        FLEE_SPEED: 240,          // 指针快于此（px/s）才惊动鱼，与水母一致
        FLEE_RADIUS: 160,         // 惊动半径（px，再乘视口缩放，再加体长）
        FLEE_IMPULSE: 150,
        FLEE_COOLDOWN_S: 0.8,
        FLEE_LEN_CAP: 120,        // 惊动半径里“加体长”的上限（px，再乘视口缩放）：几百 px 长的动物不会因为很远处划过的指针被惊动
        FLEE_CAP: 2.6,            // 被惊动后的速度上限 = 正常速度 × 此值
        BELL_AVOID: 1.3,          // 避开水母钟罩：靠近到 钟罩半径 × 此值 + 半个体长 时开始偏转
        BELL_PUSH: 160,
        BELL_KEEP: 0.4,           // 鱼身中心不进入 钟罩半径 + 体长 × 此值 的范围
        BELL_LEN_CAP: 60,         // 上面“体长 × BELL_KEEP”的上限（px，再乘视口缩放）；开始偏转的距离里“体长 × 0.5”的上限是它的 1.6 倍：大动物不会被一只小水母推得满屏跑
        Z_MIN: 0.35,              // 深度（0 远 1 近）：影响体长、速度与命中顺序
        Z_MAX: 1,
        Z_SIZE: 0.35,             // 体长 = 种类体长 × 视口缩放 × (1 − Z_SIZE + Z_SIZE × z)
        Z_SPEED: 0.3,
        HIT_SCALE: 1.25,          // 抓得到的范围比鱼身略大一圈
        HIT_PAD: 14,              // 鱼小，手抖也要抓得到
        HIT_ALPHA: 0.5,           // 淡入到这个程度才抓得到
        // 抓着时的游泳（见 stepHeld）：鱼是被一根有弹性的绳子拴在“抓住的那一点”上的游泳者，不是被指针搬着走的纸片
        HOLD_OMEGA: 15,           // 绳子（弹簧）的固有角频率（rad/s）：越大越贴着指针，越小越有拖拽感
        HOLD_ZETA: 0.75,          // 阻尼比（阻尼是相对指针运动的，匀速拖动没有稳态落后）：略小于 1，指针停住时鱼只过冲一点点
        HOLD_MAX_SPEED: 3200,
        HOLD_OFFSET: 0.8,         // 抓住瞬间指针与鱼心的偏差保留这么多（<1：被轻轻拉向指针）
        HOLD_PV_RATE: 10,         // 指针速度的平滑速率（1/s）：朝向与阻尼都参照平滑后的指针速度，手抖不会让鱼乱转
        HOLD_STILL: 28,           // 指针慢于此（px/s，再乘视口缩放）时不改朝向：鱼顺着原来的方向吊着、慢慢摆
        HOLD_YAW_GAIN: 6,         // 朝向向目标靠拢的增益（1/s）
        HOLD_YAW_RATE: 14,        // 角速度跟随目标的快慢（1/s）：转身有点惯性，不会一帧转到位
        HOLD_YAW_MIN: 2.2,        // 允许的最小角速度（rad/s，体型小时）：速度很慢时也转得动
        HOLD_YAW_MAX: 8,          // 允许的最大角速度（rad/s）
        HOLD_TURN_R: 0.45,        // 转弯半径 = 体长 × 此值：允许的角速度 = 速度 ÷ 转弯半径，大个子转得慢
        HOLD_YAW_LARGE: 70,       // 体长大于此值（px，再乘视口缩放）的动物，最小角速度按 此值 ÷ 体长 缩小（下限 0.3 倍）：几百 px 长的动物不能原地打转
        HOLD_FACE_MIN: 0.3,       // 侧视大个子被抓着时，游向的水平分量（cos）超过此值才认为想换面：竖直附近保持现在的面
        HOLD_FACE_RATE: 0.5,      // 被抓着时转身（缩短—换面—伸长）至少这么快（半圈数/s）：慢慢拖也不会等十几秒
        HOLD_PITCH_MAX: 1.15,     // 侧视动物（背鳍朝上）的朝向离水平线最多这么多弧度（约 66°）：不会头朝上倒立着被拖
        HOLD_WANDER: 0.5,         // 指针不动时朝向缓慢摆动的幅度（弧度）：被抓着也不是一动不动
        HOLD_BEAT_MIN: 1.1,       // 被抓着时的摆尾频率下限（圈/s，核心相位）
        HOLD_BEAT_GAIN: 0.9,      // 每个“体长/秒”的速度增加多少圈/s（与自由游一致）
        HOLD_BEAT_MAX: 3.6,
        THROW_MAX: 600,           // 松手时带走的速度上限（px/s）
        GLIDE_MULT: 3.5,          // 没给松手速度时，鱼带走自己的速度，上限 = 巡航速度 × 此值
        GLIDE_RATE: 1.6,          // 松手后超出正常速度上限的那部分按这个速率（1/s）衰减：顺势滑一段再恢复巡游，比速度自己回归的 2/s 略慢，所以不会被上限截断
        FLIP_HYST: 0.3,           // 翻面滞回：朝向的 cos 越过 ±此值（离竖直线约 17°）才换到另一面，在竖直附近来回晃的鱼不会一帧一换
        FLIP_RATE: 9,             // 当前面向目标面缓动的快慢（1/s）：换面约 0.25 秒，身体先收窄再展开，像打了个滚
        SCOOP_S: 0.6,             // 拖进网兜松手后“被捞起”的时长：鱼游向网兜、缩小，再淡出（用列表按钮捞出没有落点，仍是 LEAVE_S 的原地淡出）
        SCOOP_PULL: 8,            // 被捞起时向落点靠拢的快慢（1/s）
        SCOOP_FADE_AT: 0.4,       // 过了这一段进度才开始淡出：先让人看清鱼落进了网兜
        SCOOP_SHRINK: 0.55,       // 被捞到最后缩小多少（体长 × (1 − 此值 × 进度)）
        SCOOP_SPREAD: 30,         // 成群的鱼落点错开的范围（px，再乘视口缩放），免得 5 条叠成一条
        TOP_PAD: 6,               // 大型动物的身体上缘离屏幕顶部至少这么远（px，再乘视口缩放）
        SHORE_GAP: 6,             // 鱼体下缘离岸线（此刻水线能到的最高处）至少这么远（px，再乘视口缩放）
        LIMIT_EASE: 4,            // 越过上下限（屏幕顶、岸线）的部分被压回来的快慢（1/s）：潮水涨起来、或被拖过岸线又松手的鱼平滑地回到水里，不会被瞬间推走
        BIG_ENTRY: 0.08,          // 体长超过屏宽的这个比例的动物不在托盘位置凭空出现，而是从离托盘近的一侧游进来
        // 捕食的世界层原语（谁吃谁、饥饿与追击的规则在 aquarium-predation-core.js；这里只有“被吃”“补员”“目标点”三件与世界状态绑在一起的事）
        MAX_VACANCIES: 8,         // 同时等着补回的空缺最多这么多（满了就不再让捕食者出手）
        EAT_S: 0.3,               // 被吞下的动画时长：鱼被收向嘴、缩小、淡出（复用被捞起的做法，快得多）
        EAT_SHRINK: 0.7,          // 被吞到最后缩小多少（体长 × (1 − 此值 × 进度)），被捞起的是 SCOOP_SHRINK
        REFILL_Y_SPREAD: 40,      // 补回的鱼从屏幕边缘游进来时，高度在群的家上下错开的范围（px，再乘视口缩放）
        GOAL_W_MAX: 3,            // 目标点（f.goal，捕食者追的位置）的合力权重上限，与吸引点一致：比最坏情况下“家 + 漫游”的反向合力大
        GOAL_BOOST_MAX: 4.6,      // 目标点给的速度倍数上限；速度上限也相应放宽到这个倍数（只有带目标点的鱼，别的鱼仍是 FLEE_CAP）
        GOAL_ACCEL_MAX: 3,        // 目标点给的“加速快慢”倍数上限（速度向期望速度靠拢的快慢乘它）
        MAX_DT: 0.05,
        MIN_DT: 0.0001,
    });

    // 真实体长换算成屏幕上的像素：视口缩放 1 时 56 px/m（体长 meters 是该种成体的典型值，量到的是画法里“吻到尾柄”的那一段，见 docs/research）。
    // 只有大型动物（鲨鱼、蝠鲼、海龟）按这个比例；小鱼按真实体长会小到看不见（霓虹灯鱼 4 cm ≈ 2 px），保持各自可看清的体长，len 一律不小于按比例的值。
    const PX_PER_M = 56;

    // 9 种动物（8 种鱼 + 海龟）。len 是体长（px，视口缩放 1 时；大型动物按 PX_PER_M 由真实体长 meters 换算），speed 是巡航速度（px/s），
    // band 是本种活动的纵向带（占屏高的比例，0 在顶），half 是游动时上下方向的半幅（占体长的比例：头鳍/翼/鳍肢展开后的量值，用来让身体上缘不探出屏幕顶部、下缘不碰岸线），
    // top 为真表示俯视的动物（蝠鲼、海龟：没有“背鳍朝上”，被抓着时朝向不限俯仰），hit 是抓取椭圆的半轴（占体长的比例，缺省 [0.6, 0.35]；大型动物的身体比这个椭圆窄得多，要收紧）。
    // colors 是调色板色位 [主色, 点缀色]（色位编号沿用首页 JellyfishSkin.PALETTE 的色相环顺序：红橙黄绿薄荷冰蓝紫洋红）。
    // 速度按“真实速度 × PX_PER_M”取：鲸鲨约 1 m/s、蝠鲼约 0.9 m/s、小锤头鲨约 1 m/s，海龟沿用原来的 0.54 m/s（真实的绿海龟巡航约 0.7–0.8 m/s，慢一点更从容）。
    // diet 是捕食关系的数据（规则在 aquarium-predation-core.js 的 canEat）：predator 小锤头鲨是唯一的捕食者，gape 是它能吞下的猎物占自己真实体长（meters，不是像素体长）的比例上限；
    // prey 是霓虹灯鱼、蓝吊、小丑鱼、神仙鱼；没有 diet 的（河豚、海龟、蝠鲼、鲸鲨）既不捕食也不被吃。水母不在这张表里——它们是首页任务的投影，结构上进不了捕食规则。
    const SPECIES = Object.freeze([
        Object.freeze({ id: 'neon', name: '霓虹灯鱼', kind: 'school', group: 5, len: 16, meters: 0.04, half: 0.2, speed: 80, band: Object.freeze([0.25, 0.85]), colors: Object.freeze([4, 0]), diet: 'prey' }),
        Object.freeze({ id: 'tang', name: '蓝吊', kind: 'school', group: 5, len: 22, meters: 0.2, half: 0.3, speed: 66, band: Object.freeze([0.3, 0.9]), colors: Object.freeze([5, 2]), diet: 'prey' }),
        Object.freeze({ id: 'clown', name: '小丑鱼', kind: 'solo', group: 1, len: 30, meters: 0.11, half: 0.25, speed: 52, band: Object.freeze([0.5, 0.92]), colors: Object.freeze([1, 1]), diet: 'prey' }),
        Object.freeze({ id: 'puffer', name: '河豚', kind: 'solo', group: 1, len: 32, meters: 0.3, half: 0.3, speed: 34, band: Object.freeze([0.35, 0.8]), colors: Object.freeze([2, 4]) }),
        Object.freeze({ id: 'angel', name: '神仙鱼', kind: 'solo', group: 1, len: 34, meters: 0.15, half: 0.4, speed: 40, band: Object.freeze([0.3, 0.8]), colors: Object.freeze([6, 5]), diet: 'prey' }),
        Object.freeze({ id: 'hammer', name: '小锤头鲨', kind: 'solo', group: 1, len: 140, meters: 2.5, half: 0.3, speed: 58, band: Object.freeze([0.15, 0.65]), colors: Object.freeze([5, 6]), diet: 'predator', gape: 0.3 }),
        Object.freeze({ id: 'turtle', name: '海龟', kind: 'solo', group: 1, len: 70, meters: 1.25, half: 0.63, top: true, speed: 30, band: Object.freeze([0.3, 0.8]), colors: Object.freeze([3, 1]) }),
        Object.freeze({ id: 'manta', name: '蝠鲼', kind: 'large', group: 1, len: 258, meters: 4.6, half: 0.52, top: true, hit: Object.freeze([0.55, 0.45]), speed: 52, band: Object.freeze([0.1, 0.6]), colors: Object.freeze([6, 7]) }),
        Object.freeze({ id: 'whaleshark', name: '鲸鲨', kind: 'large', group: 1, len: 504, meters: 9, half: 0.22, hit: Object.freeze([0.56, 0.24]), speed: 56, band: Object.freeze([0.2, 0.6]), colors: Object.freeze([5, 4]) }),
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
            shoreY: null,                    // 岸线（海水层此刻水线能到的最高处，px，从屏幕顶往下量）：每步由 step 的 input.shore 写入，null 表示海水层没开，鱼不避岸线
            fish: [],
            groups: Object.create(null),     // 条目 id → { hx, hy, next, wp }：该群当前的“家”与漫游相位（wp 一生不变）
            vacancies: [],                   // 被捕食者吃掉、等着补回的空缺 { entry, species, due }（due 是 world.time）：只在内存里，条目名单与存储不动，刷新即恢复
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

    /** 软边界宽度（px）：体长 × EDGE_LEN + 20，最宽不超过屏宽的 EDGE_MAX。 */
    function edgeOf(world, len) {
        return Math.min(len * PARAMS.EDGE_LEN + 20, world.width * PARAMS.EDGE_MAX);
    }

    /** 身体下缘不碰岸线时，鱼心最大的纵坐标（px）；没有岸线信息（海水层关着、还没算出来）时为 null。lenPx 是这条鱼现在的体长。 */
    function seabedOf(world, spec, lenPx) {
        if (!Number.isFinite(world.shoreY)) return null;
        return world.shoreY - lenPx * spec.half - PARAMS.SHORE_GAP * world.scale;
    }

    /**
     * 鱼心的最小纵坐标（px）：大型动物（体长超过 AGILE_LEN）的身体上缘不探出屏幕顶部；小鱼没有这条限制，为 null——与加入这条之前逐位一致。
     */
    function ceilingOf(world, spec, lenPx) {
        if (!(lenPx > PARAMS.AGILE_LEN * world.scale)) return null;
        return lenPx * spec.half + PARAMS.TOP_PAD * world.scale;
    }

    function pickHome(world, group, spec) {
        const rx = world.random();
        const edge = edgeOf(world, spec.len * world.scale);
        // 小鱼的横向范围仍是屏宽的 10%–90%；大型动物的“家”不选进软边界里（否则家和边界的回推互相拉扯）
        group.hx = edge > world.width * 0.1 ? lerp(edge, world.width - edge, rx) : world.width * (0.1 + 0.8 * rx);
        const ry = world.random();
        const lenPx = spec.len * world.scale;
        const ceilY = ceilingOf(world, spec, lenPx);
        const seabedY = seabedOf(world, spec, lenPx);
        const top = world.height * spec.band[0];
        const bottom = world.height * spec.band[1];
        // 纵向带整体不得高过屏幕顶（大个子）、也不得低过岸线：家只在这两条线之间、本种的带里选；岸线在带的下沿以下（或不知道岸线）时与原来逐位一致
        if (seabedY !== null && seabedY < bottom) {
            const low = ceilY !== null && ceilY > top ? ceilY : top;
            group.hy = lerp(low, Math.max(low, seabedY), ry);
        } else {
            group.hy = ceilY !== null && ceilY > top ? lerp(ceilY, Math.max(ceilY, bottom), ry) : world.height * lerp(spec.band[0], spec.band[1], ry);
        }
        // 大个子换家换得慢：换家间隔 ÷ 笨重系数（小鱼系数 1，数值不变；鲸鲨 4 倍），免得它一直在转身
        group.next = world.time + (PARAMS.HOME_MIN_S + world.random() * PARAMS.HOME_SPAN_S) / clamp(PARAMS.AGILE_LEN / spec.len, 0.25, 1);
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
            if (Number.isFinite(f.sp)) f.sp *= factor;
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
        const spread = Math.min(spec.len * world.scale * 2.5, world.width * 0.3);
        const big = spec.len * world.scale > world.width * PARAMS.BIG_ENTRY;
        for (let i = 0; i < spec.group; i++) {
            const z = clamp(baseZ + (world.random() - 0.5) * 0.2, PARAMS.Z_MIN, PARAMS.Z_MAX);
            const len = lengthOf(world, spec, z);
            let x; let y; let entryAngle = null;
            if (instant) {
                x = clamp(group.hx + (world.random() - 0.5) * spread, 0, world.width);
                y = clamp(group.hy + (world.random() - 0.5) * spread, 0, world.height);
            } else if (big && from && finite(from.x, from.y)) {
                // 大型动物（几百 px 长）不在托盘位置凭空淡入：从离托盘近的一侧、本种的高度游进来，朝向屏内
                const right = from.x > world.width / 2;
                x = right ? world.width + len * 0.3 : -len * 0.3;
                y = group.hy + (world.random() - 0.5) * 40 * world.scale;
                entryAngle = (right ? Math.PI : 0) + (world.random() - 0.5) * 0.5;
            } else if (from && finite(from.x, from.y)) {
                x = from.x + (world.random() - 0.5) * 24;
                y = from.y + (world.random() - 0.5) * 24;
            } else {
                x = clamp(group.hx + (world.random() - 0.5) * spread, 0, world.width);
                y = world.height + len * (big ? 0.35 : 1);
            }
            let angle = entryAngle !== null ? entryAngle : world.random() * TAU;
            if (entryAngle === null && !spec.top && len > PARAMS.AGILE_LEN * world.scale) {
                // 侧视的大个子一开始就是朝左或朝右、俯仰不大地游（同一个随机数，只换算角度）
                angle = angle < Math.PI ? (angle / Math.PI - 0.5) * 0.8 : Math.PI + ((angle - Math.PI) / Math.PI - 0.5) * 0.8;
            }
            const speed = spec.speed * world.scale;
            world.fish.push({
                id: world.nextId++, entry: item.id, species: item.species,
                x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ang: angle,
                z, len, phase: world.random() * TAU, seed: world.random(), t: instant ? PARAMS.ENTER_S : 0,
                alpha: instant ? 1 : 0, state: instant ? 'alive' : 'entering',
                held: null, cooldown: 0, turn: 0, glide: 0,
                flip: Math.cos(angle) < 0 ? -1 : 1, flipTo: Math.cos(angle) < 0 ? -1 : 1,
            });
        }
    }

    /**
     * 补回一条被捕食者吃掉的鱼：从左或右边缘、群的家的高度游进来，淡入 ENTER_S（与大个子入场同一条路径）。
     * 同群还有活着的鱼时，深度跟着它们（同群的鱼一直在一起）；群的家已经不在（条目被捞出或移除过）、种类不认识时什么都不做，返回是否补上了。
     */
    function enterOne(world, entryId, speciesId) {
        const spec = speciesById(speciesId);
        const group = world.groups[entryId];
        if (!spec || !group) return false;
        const mates = world.fish.filter(f => f.entry === entryId && f.state !== 'leaving');
        const baseZ = mates.length ? mates.reduce((sum, f) => sum + f.z, 0) / mates.length : lerp(PARAMS.Z_MIN, PARAMS.Z_MAX, world.random());
        const z = clamp(baseZ + (world.random() - 0.5) * 0.2, PARAMS.Z_MIN, PARAMS.Z_MAX);
        const len = lengthOf(world, spec, z);
        const right = world.random() < 0.5;
        const x = right ? world.width + len * 0.3 : -len * 0.3;
        const y = clamp(group.hy + (world.random() - 0.5) * PARAMS.REFILL_Y_SPREAD * world.scale, 0, world.height);
        const angle = (right ? Math.PI : 0) + (world.random() - 0.5) * 0.5;
        const speed = spec.speed * world.scale;
        world.fish.push({
            id: world.nextId++, entry: entryId, species: speciesId,
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ang: angle,
            z, len, phase: world.random() * TAU, seed: world.random(), t: 0,
            alpha: 0, state: 'entering',
            held: null, cooldown: 0, turn: 0, glide: 0,
            flip: Math.cos(angle) < 0 ? -1 : 1, flipTo: Math.cos(angle) < 0 ? -1 : 1,
        });
        return true;
    }

    /**
     * 被捕食者吞下：鱼进入 leaving（EAT_S 内被收向 to、缩小、淡出，之后和被捞起的鱼一样从 world.fish 里清掉），并登记一个空缺，delayS 秒后补回（见 step）。
     * 只有存活（alive）的鱼、空缺没满、to 是有限坐标、delayS 是有限正数时才会吃，返回是否吃了；不满足时什么都不改。
     * 不碰条目名单与存储：被吃只是世界里的瞬态，刷新即恢复。
     */
    function consume(world, fish, to, delayS) {
        if (!fish || !world.fish.includes(fish) || fish.state !== 'alive') return false;
        if (!to || !finite(to.x, to.y) || !Number.isFinite(delayS) || !(delayS > 0)) return false;
        if (world.vacancies.length >= PARAMS.MAX_VACANCIES) return false;
        fish.state = 'leaving';
        fish.held = null;
        fish.leaveTo = { x: to.x, y: to.y };
        fish.scoopT = 0;
        fish.leaveS = PARAMS.EAT_S;
        fish.eaten = true;
        world.vacancies.push({ entry: fish.entry, species: fish.species, due: world.time + delayS });
        return true;
    }

    /** 到期的空缺补回一条（每步最多一条，免得一帧冒出一堆）；补不上的（群已经不在）直接丢弃。 */
    function refill(world) {
        const i = world.vacancies.findIndex(v => world.time >= v.due);
        if (i < 0) return;
        const v = world.vacancies[i];
        world.vacancies.splice(i, 1);
        enterOne(world, v.entry, v.species);
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
        if (world.vacancies.length) {                                   // 条目已经被捞出：它的空缺不再补，群的家也一并丢掉（这个条目已经没有活着的鱼，dismiss 轮不到它）
            for (const v of world.vacancies) if (!wanted.has(v.entry)) delete world.groups[v.entry];
            world.vacancies = world.vacancies.filter(v => wanted.has(v.entry));
        }
        const present = new Set(world.fish.filter(f => f.state !== 'leaving').map(f => f.entry));
        for (const v of world.vacancies) present.add(v.entry);          // 被吃光、正等着补回的条目也算存在：否则会被当成新条目立刻重新生成，补员的延迟就被绕过了
        let live = world.fish.filter(f => f.state !== 'leaving').length + world.vacancies.length;
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
        if (world.vacancies.length) world.vacancies = world.vacancies.filter(v => v.entry !== entryId);       // 这个条目被捞出：它等着补回的空缺一并作废
    }

    // ---------- 命中与抓取 ----------

    const HIT_DEFAULT = Object.freeze([0.6, 0.35]);

    function inHitRegion(f, x, y) {
        if (!finite(x, y, f.x, f.y, f.ang)) return false;
        const c = Math.cos(f.ang);
        const s = Math.sin(f.ang);
        const dx = x - f.x;
        const dy = y - f.y;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const spec = BY_ID[f.species];
        const hit = spec && spec.hit ? spec.hit : HIT_DEFAULT;
        const rx = f.len * hit[0] * PARAMS.HIT_SCALE + PARAMS.HIT_PAD;
        const ry = f.len * hit[1] * PARAMS.HIT_SCALE + PARAMS.HIT_PAD;
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
     * 抓住 fish：指针必须在它抓得到的范围内；同时只抓一条。记下被抓的那一点在鱼身上的位置（鱼本地坐标，鼻子朝 +x），
     * 之后鱼像被一根绳子拴在这一点上游动，朝向、弯身与摆尾都是鱼自己的，见 stepHeld。
     * options.tail 为真表示抓的是尾巴（互动子项目的“拉鱼尾”）：区别只在朝向——鱼头朝与指针运动相反的方向（像被拖着走，拼命往前游）。
     */
    function grab(world, fish, x, y, options) {
        if (!fish || !world.fish.includes(fish) || !grabbable(fish) || !inHitRegion(fish, x, y)) return false;
        if (world.fish.some(f => f.state === 'held')) return false;
        fish.state = 'held';
        fish.alpha = 1;
        const dx = x - fish.x;
        const dy = y - fish.y;
        const c = Math.cos(fish.ang);
        const s = Math.sin(fish.ang);
        fish.held = {
            tail: !!(options && options.tail),
            gx: (dx * c + dy * s) * PARAMS.HOLD_OFFSET,        // 被抓的点在鱼本地坐标里的位置
            gy: (-dx * s + dy * c) * PARAMS.HOLD_OFFSET,
            lastX: x, lastY: y, pvx: 0, pvy: 0,                // 指针速度（平滑后），朝向与阻尼据此
            aim: fish.ang,                                     // 最近一次明确的游向：指针慢下来以后，鱼围着它缓慢摆
            w: 0,                                              // 当前角速度（rad/s）
        };
        return true;
    }

    /**
     * 放开被抓着的鱼。给了 velocity（指针的松手速度）就带走它（上限 THROW_MAX，坏速度当作 0）；
     * 没给就带走鱼自己的速度（它是游着被拖的，不是纸片，不会一下停死；上限是巡航速度的 GLIDE_MULT 倍）。
     * 超出正常速度上限的部分由 stepFish 按 GLIDE_RATE 衰减，鱼顺势滑一段再恢复巡游。
     */
    function release(world, fish, velocity) {
        if (!fish || !world.fish.includes(fish) || fish.state !== 'held') return;
        const given = velocity !== undefined;
        const v = given ? (velocity && finite(velocity.vx, velocity.vy) ? velocity : { vx: 0, vy: 0 }) : { vx: fish.vx, vy: fish.vy };
        const limit = given ? PARAMS.THROW_MAX : Math.min(PARAMS.THROW_MAX, cruiseSpeed(world, fish) * PARAMS.GLIDE_MULT);
        const speed = Math.hypot(v.vx, v.vy);
        const k = speed > limit ? limit / speed : 1;
        fish.state = 'alive';
        fish.held = null;
        fish.vx = v.vx * k;
        fish.vy = v.vy * k;
        fish.glide = Math.hypot(fish.vx, fish.vy);
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

    /**
     * 侧视动物（背鳍朝上）的朝向限制：离水平线不超过 HOLD_PITCH_MAX，免得被拖着头朝上倒立。side 是当前朝左（−1）还是朝右（1），
     * 竖直附近时保持当前这一侧，不来回跳。
     */
    function limitPitch(angle, side) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        if (Math.atan2(Math.abs(s), Math.abs(c)) <= PARAMS.HOLD_PITCH_MAX) return angle;
        const sx = Math.abs(c) > 0.05 ? (c < 0 ? -1 : 1) : (side < 0 ? -1 : 1);
        return Math.atan2((s < 0 ? -1 : 1) * Math.sin(PARAMS.HOLD_PITCH_MAX), sx * Math.cos(PARAMS.HOLD_PITCH_MAX));
    }

    /** 笨重程度：小鱼恒为 1（逐位不变），体长超过 AGILE_LEN（再乘视口缩放）的按 此值 ÷ 体长 缩小，下限 0.25。 */
    function agileOf(world, f) {
        return clamp(PARAMS.AGILE_LEN * world.scale / Math.max(1, f.len), 0.25, 1);
    }

    /** 侧视的大个子（小锤头鲨、鲸鲨）：转身用“缩短—换面—伸长”（见 advanceYaw），而不是把几百 px 长的身体转过竖直方向。 */
    function isHeavySide(world, f) {
        const spec = BY_ID[f.species];
        return !!spec && !spec.top && agileOf(world, f) < 1;
    }

    /** 侧视大个子的状态：face（面向 ±1）、yaw（转身进度 0…1，0 没在转）、sp（沿游向的速度，px/s）、xs（沿屏幕横向的投影 0…1，画法据此缩短身体）。缺字段时按朝向与速度补出。 */
    function ensureYawState(f) {
        if (f.face !== 1 && f.face !== -1) f.face = Math.cos(f.ang) < 0 ? -1 : 1;
        if (!(f.yaw > 0 && f.yaw < 1)) f.yaw = 0;
        if (!Number.isFinite(f.sp)) f.sp = Math.hypot(f.vx, f.vy);
        if (!Number.isFinite(f.xs)) f.xs = Math.abs(Math.cos(Math.PI * f.yaw));
    }

    /**
     * 侧视大个子的转身：想去的面 wantFace 与现在的面不同时，在水平面里转半圈（进度 yaw 0→1，用时 = π × 半径 ÷ 速度，速度不足 floor 时按 floor 算）。
     * 转的时候沿屏幕横向的投影 xs = |cos(π·yaw)| 从 1 缩到 0 再回到 1，过半（xs 最小、身体最短）的那一刻换面：朝向与翻面镜像到另一侧，
     * 被抓着的点（held）也跟着镜像，换面前后画面是连续的。进度只往前走，走完回到 0。
     */
    function advanceYaw(f, dt, wantFace, speed, floor) {
        if (f.yaw === 0 && (wantFace === 1 || wantFace === -1) && wantFace !== f.face) f.yaw = 1e-6;
        if (f.yaw > 0) {
            const before = f.yaw;
            f.yaw += Math.max(speed, floor) / (Math.PI * PARAMS.YAW_R * Math.max(1, f.len)) * dt;
            if (before < 0.5 && f.yaw >= 0.5) {
                f.face = -f.face;
                f.ang = angleDiff(0, Math.PI - f.ang);                 // 面向与翻面（updateFlip 按朝向缓动）随朝向镜像；此时 xs 最小，身体最短
                if (f.held) { f.held.gy = -f.held.gy; f.held.w = -f.held.w; }
            }
            if (f.yaw >= 1) f.yaw = 0;
        }
        f.xs = Math.abs(Math.cos(Math.PI * f.yaw));
    }

    /**
     * 被抓着的鱼。原来它是一张纸片：每帧把鱼心一阶追到指针旁（速度恒等于“距离 × 常数”）、朝向直接抹向速度方向、相位以固定速率推进、
     * turn 不更新（鱼身永远是直的），松手时速度清零。现在它是被一根有弹性的绳子拴在“抓住的那一点”上的游泳者：
     *   位置：被抓的点被弹簧—阻尼（HOLD_OMEGA、HOLD_ZETA）拉向指针；阻尼是相对指针运动的，所以匀速拖动没有稳态落后、停手只过冲一点点；
     *        鱼转身时是绕着被抓的那一点转的（被抓的点不动，鱼心划弧），不是绕鱼心原地打转。
     *   朝向：由鱼自己决定——指针在动就转向运动方向（拉尾时相反），指针不动就围着最近的游向缓慢摆；
     *        角速度有上限（速度 ÷ 转弯半径，夹在 HOLD_YAW_MIN…MAX，大个子转得慢）并带一点惯性；侧视动物不会倒立。
     *   姿态：turn = 还差多少没转过去，画法据此把身体弯成弧；摆尾相位按速度推进（慢时也在划水，快时更快）。
     * 指针缺失（离开页面等）时绳子是松的：鱼带着速度滑行并朝速度方向游。
     */
    function stepHeld(world, f, dt, pointer) {
        const h = f.held;
        const spec = BY_ID[f.species];
        const scale = world.scale;
        const kv = Math.min(1, PARAMS.HOLD_PV_RATE * dt);
        if (pointer) {
            if (Number.isFinite(h.lastX)) {
                h.pvx += ((pointer.x - h.lastX) / dt - h.pvx) * kv;
                h.pvy += ((pointer.y - h.lastY) / dt - h.pvy) * kv;
            }
            h.lastX = pointer.x; h.lastY = pointer.y;
        } else {
            h.lastX = NaN;                                       // 指针不在：下次有指针时重新取基准，免得速度冲一下
            h.pvx -= h.pvx * kv; h.pvy -= h.pvy * kv;
        }

        // 游向：指针在动就朝运动方向（拉尾时相反）；指针不在时顺着鱼自己的速度；都不动时围着最近的游向摆
        const still = PARAMS.HOLD_STILL * scale;
        const pointerSpeed = Math.hypot(h.pvx, h.pvy);
        if (pointer && pointerSpeed > still) h.aim = Math.atan2(h.pvy, h.pvx) + (h.tail ? Math.PI : 0);
        else if (!pointer && Math.hypot(f.vx, f.vy) > still) h.aim = Math.atan2(f.vy, f.vx);
        const calm = pointer ? 1 - clamp(pointerSpeed / (still * 4), 0, 1) : 0;
        let desired = h.aim + Math.sin(world.time * 2.9 + f.seed * TAU) * PARAMS.HOLD_WANDER * calm;
        const heavySide = isHeavySide(world, f);
        if (heavySide) {
            // 侧视的大个子：想换面时转身（缩短—换面—伸长），朝向始终留在“现在的面”这一侧、俯仰有限，不会为了掉头把几百 px 长的身体转过竖直方向
            ensureYawState(f);
            const cd = Math.cos(desired);
            const wantFace = Math.abs(cd) > PARAMS.HOLD_FACE_MIN ? (cd < 0 ? -1 : 1) : f.face;
            const pitch = clamp(Math.atan2(Math.sin(desired), Math.abs(cd)), -PARAMS.HOLD_PITCH_MAX, PARAMS.HOLD_PITCH_MAX);
            advanceYaw(f, dt, wantFace, Math.hypot(f.vx, f.vy), PARAMS.HOLD_FACE_RATE * Math.PI * PARAMS.YAW_R * Math.max(1, f.len));
            desired = Math.atan2(Math.sin(pitch), f.face * Math.cos(pitch));
        } else if (!(spec && spec.top)) desired = limitPitch(desired, f.flipTo);
        const xsH = heavySide ? f.xs : 1;                                // 被抓的点在屏幕上的横向位置也按投影缩短

        const yawMin = PARAMS.HOLD_YAW_MIN * clamp(PARAMS.HOLD_YAW_LARGE * scale / Math.max(1, f.len), 0.3, 1);
        const omega = PARAMS.HOLD_OMEGA;
        const damp = 2 * PARAMS.HOLD_ZETA * omega;
        const n = Math.max(1, Math.ceil(dt / 0.01));
        const hh = dt / n;
        for (let i = 0; i < n; i++) {
            // 朝向：向目标靠拢，角速度有上限并带惯性
            const speed = Math.hypot(f.vx, f.vy);
            const cap = clamp(speed / (PARAMS.HOLD_TURN_R * Math.max(1, f.len)), yawMin, PARAMS.HOLD_YAW_MAX);
            const target = clamp(angleDiff(f.ang, desired) * PARAMS.HOLD_YAW_GAIN, -cap, cap);
            h.w += (target - h.w) * Math.min(1, PARAMS.HOLD_YAW_RATE * hh);
            const c0 = Math.cos(f.ang);
            const s0 = Math.sin(f.ang);
            f.ang += h.w * hh;
            if (pointer) {                                       // 转身绕着被抓的那一点转：转完把鱼心挪回去，让这一点留在原处
                const c1 = Math.cos(f.ang);
                const s1 = Math.sin(f.ang);
                f.x += xsH * (h.gx * (c0 - c1) - h.gy * (s0 - s1));
                f.y += h.gx * (s0 - s1) + h.gy * (c0 - c1);
            }
            if (!pointer) {                                      // 绳子松着：只剩水的阻力
                const k = Math.exp(-2.5 * hh);
                f.vx *= k; f.vy *= k;
            } else {
                const c = Math.cos(f.ang);
                const s = Math.sin(f.ang);
                const ex = pointer.x - (f.x + xsH * (h.gx * c - h.gy * s));
                const ey = pointer.y - (f.y + h.gx * s + h.gy * c);
                f.vx += (omega * omega * ex + damp * (h.pvx - f.vx)) * hh;
                f.vy += (omega * omega * ey + damp * (h.pvy - f.vy)) * hh;
            }
            const v = Math.hypot(f.vx, f.vy);
            if (v > PARAMS.HOLD_MAX_SPEED) { f.vx *= PARAMS.HOLD_MAX_SPEED / v; f.vy *= PARAMS.HOLD_MAX_SPEED / v; }
            f.x += f.vx * hh;
            f.y += f.vy * hh;
        }
        f.turn = clamp(angleDiff(f.ang, desired), -1.4, 1.4);
        updateFlip(f, dt);
        const sp = Math.hypot(f.vx, f.vy);
        f.phase += dt * TAU * clamp(PARAMS.HOLD_BEAT_MIN + PARAMS.HOLD_BEAT_GAIN * sp / Math.max(1, f.len), PARAMS.HOLD_BEAT_MIN, PARAMS.HOLD_BEAT_MAX);
    }

    function stepFish(world, f, dt, mates, pointer, bells, attractors) {
        const spec = BY_ID[f.species];
        const scale = world.scale;
        const margin = PARAMS.MARGIN + f.len;

        if (f.state === 'leaving') {
            if (f.leaveTo) {                                  // 被网兜捞起：游向落点、缩小，先清晰后淡出（被捕食者吞下是同一套，只是 leaveS 更短，落点由捕食模块逐帧改成嘴的位置）
                const total = f.leaveS > 0 ? f.leaveS : PARAMS.SCOOP_S;
                f.scoopT = Math.min(1, (f.scoopT || 0) + dt / total);
                const pull = Math.min(1, PARAMS.SCOOP_PULL * dt);
                f.x += (f.leaveTo.x - f.x) * pull;
                f.y += (f.leaveTo.y - f.y) * pull;
                if (f.scoopT >= PARAMS.SCOOP_FADE_AT) f.alpha = Math.max(0, f.alpha - dt / (total * (1 - PARAMS.SCOOP_FADE_AT)));
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
        const agile = agileOf(world, f);                          // 小鱼恒为 1（逐位不变）；大个子转得慢
        const heavySide = agile < 1 && !spec.top;                 // 侧视的大个子：转身见 advanceYaw
        // 纵向带（上沿不得高过屏幕顶、下沿不得低过岸线）与软边界：小鱼越界时被回推，笨重的动物提前把方向朝里拐（见下）
        const ceilY = ceilingOf(world, spec, f.len);
        const seabedY = seabedOf(world, spec, f.len);
        const top = ceilY !== null ? Math.max(spec.band[0] * world.height, ceilY) : spec.band[0] * world.height;
        const bandBottom = spec.band[1] * world.height;
        const bottom = Math.max(top, seabedY !== null && seabedY < bandBottom ? seabedY : bandBottom);
        const soft = Math.max(1, PARAMS.BAND_SOFT * world.height);
        const edge = edgeOf(world, f.len);
        let sx = 0;
        let sy = 0;

        if (group) {
            const dx = group.hx - f.x;
            const dy = (seabedY !== null && group.hy > seabedY ? seabedY : group.hy) - f.y;       // 家在岸线以下（潮水涨上来了）：只朝岸线上方的那一点游，不往沙滩里顶
            const d = Math.hypot(dx, dy);
            if (d > 1) {
                const w = PARAMS.HOME_W * clamp(d / (PARAMS.HOME_NEAR * scale / (agile * agile)), 0, 1);       // 大个子的“近”按笨重系数的平方放大：几乎只有远离家时才被拉回，不会围着家来回转身
                sx += dx / d * w; sy += dy / d * w;
            }
        }

        // 漫游：一个缓慢转向的单位向量（相位与方向按条目共用，成群的鱼往同一边漫游，各自再错开一点）。
        // 少了它，单条鱼到家以后合力只剩“朝家”，期望速度归一化后总是全速，鱼会围着家绕 2–3 px 的小圈、朝向每秒转一两圈。
        const wp = group ? group.wp : f.seed;
        const wanderAng = wp * TAU + f.seed * 0.6 + (wp < 0.5 ? 1 : -1) * world.time * PARAMS.WANDER_RATE * agile + Math.sin(world.time * 0.23 * agile + wp * 17) * 1.2;
        sx += Math.cos(wanderAng) * PARAMS.WANDER_W;
        sy += Math.sin(wanderAng) * PARAMS.WANDER_W * (heavySide ? PARAMS.WANDER_PITCH : 1);

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

        // 笨重的动物：靠近边界时把期望方向朝里拐（弧线转弯），而不是撞上去再被推回来——后者会让几百 px 长的身体原地甩过半圈
        if (agile < 1 && f.state === 'alive') {
            const lead = Math.min(f.len * 0.4, (bottom - top) * 0.25);
            if (f.x < edge) sx += clamp((edge - f.x) / edge, 0, 2) * PARAMS.EDGE_STEER;
            else if (f.x > world.width - edge) sx -= clamp((f.x - (world.width - edge)) / edge, 0, 2) * PARAMS.EDGE_STEER;
            if (lead > 1) {
                if (f.y < top + lead) sy += clamp((top + lead - f.y) / lead, 0, 2) * PARAMS.EDGE_STEER;
                else if (f.y > bottom - lead) sy -= clamp((f.y - (bottom - lead)) / lead, 0, 2) * PARAMS.EDGE_STEER;
            }
            for (const b of bells) {                          // 水母钟罩：同样提前绕开，不靠“撞上去再被推开”
                const bx = f.x - b.x;
                const by = f.y - b.y;
                const bd = Math.hypot(bx, by);
                const reach = b.r * PARAMS.BELL_AVOID + Math.min(f.len * 0.5, PARAMS.BELL_LEN_CAP * scale * 1.6);
                if (bd < reach && bd > 1e-6) { sx += bx / bd * (1 - bd / reach) * PARAMS.EDGE_STEER; sy += by / bd * (1 - bd / reach) * PARAMS.EDGE_STEER; }
            }
        }

        // 方向的缓慢摆动
        const swing = Math.sin(world.time * 0.6 + f.seed * 40) * PARAMS.WANDER * 0.5;
        const sc = Math.cos(swing);
        const ss = Math.sin(swing);
        const rx = sx * sc - sy * ss;
        const ry = sx * ss + sy * sc;
        sx = rx; sy = ry;

        // 目标点（捕食者追猎物的位置，由捕食模块逐帧写进 f.goal = { x, y, w, boost, accel }）：w > 0 把合力拉向它，boost 放大期望速度、同时放宽速度上限，accel 加快速度的跟随；
        // 数字夹在安全范围里；缺失或不合法时什么都不做（boost、上限与加速都保持原值，所以没有捕食时与原来逐位一致）。w = 0 只用来改速度（吞咽时放慢）。
        const goal = f.goal;
        const goalOk = !!goal && finite(goal.x, goal.y, goal.w, goal.boost) && f.state === 'alive';
        const chasing = goalOk && goal.w > 0;

        // 吸引点（饲料）：范围内最近的一个把合力拉向它，并放大期望速度；没有吸引点时 boost 恒为 1，计算与原来逐位一致。正在追猎物的鱼不被饲料改道
        let boost = 1;
        if (attractors.length && !chasing) {
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
        let capMult = PARAMS.FLEE_CAP;
        let accel = 1;
        if (goalOk) {
            const gw = clamp(goal.w, 0, PARAMS.GOAL_W_MAX);
            const gd = Math.hypot(goal.x - f.x, goal.y - f.y);
            if (gw > 0 && gd > 1e-6) { sx += (goal.x - f.x) / gd * gw; sy += (goal.y - f.y) / gd * gw; }
            boost = clamp(goal.boost, 0.3, PARAMS.GOAL_BOOST_MAX);
            capMult = Math.max(capMult, boost);
            if (Number.isFinite(goal.accel)) accel = clamp(goal.accel, 1, PARAMS.GOAL_ACCEL_MAX);
        }
        const go = speedT * boost;

        const sl = Math.hypot(sx, sy);
        let dvx; let dvy;
        if (sl > 1e-3) {
            const gain = clamp(sl / PARAMS.STEER_FULL, PARAMS.STEER_MIN, 1);
            dvx = sx / sl * go * gain; dvy = sy / sl * go * gain;
        }
        else { const h = Math.hypot(f.vx, f.vy) || 1; dvx = f.vx / h * go; dvy = f.vy / h * go; }
        const turn = Math.min(1, PARAMS.TURN * agile * accel * dt);
        const sp0 = Math.hypot(f.vx, f.vy);
        const spT = Math.hypot(dvx, dvy);
        if (heavySide) {
            // 侧视的大个子：沿游向的速度 sp 缓缓回归，竖直分量另外靠拢（俯仰不超过 FREE_PITCH），屏幕横向的速度 = 面 × 水平分量 × 投影 xs（转身时先减到 0 再反向）
            ensureYawState(f);
            if (f.vx !== f.hvx || f.vy !== f.hvy) f.sp = Math.hypot(f.vx / Math.max(f.xs, 0.25), f.vy);     // 速度被外界直接改过（戳、松手、重新放置）：以改后的为准
            f.sp += (spT - f.sp) * turn;
            advanceYaw(f, dt, sx * f.face < -PARAMS.YAW_START ? -f.face : f.face, f.sp, speedT * 0.3);
            const vyMax = f.sp * Math.sin(PARAMS.FREE_PITCH) * f.xs;                              // 转身时竖直速度跟着投影一起收：屏幕上看到的俯仰（= 屏幕速度的方向）始终不超过 FREE_PITCH，不会转到一半头朝下冲
            f.vy = clamp(f.vy + (clamp(dvy, -vyMax, vyMax) - f.vy) * turn, -vyMax, vyMax);       // 速度降下来时俯仰上限跟着收，不会留着旧的竖直分量越过上限
            f.vx = f.face * Math.sqrt(Math.max(f.sp * f.sp - f.vy * f.vy, 0)) * f.xs;
            f.hvx = f.vx; f.hvy = f.vy;
        } else if (agile < 1 && sp0 > 1e-6 && spT > 1e-6) {
            // 笨重的动物：速度方向按限定的转速转（弧线），速度大小另外缓缓回归，转弯时不会先刹停再反向加速（那会让几百 px 长的身体原地甩一个圈）
            const heading = Math.atan2(f.vy, f.vx);
            const maxYaw = Math.min(PARAMS.ARC_YAW * agile, sp0 / (PARAMS.ARC_R * Math.max(1, f.len)));
            const rot = clamp(angleDiff(heading, Math.atan2(dvy, dvx)) * Math.min(1, PARAMS.TURN * dt), -maxYaw * dt, maxYaw * dt);
            const speedNow = sp0 + (spT - sp0) * turn;
            f.vx = Math.cos(heading + rot) * speedNow;
            f.vy = Math.sin(heading + rot) * speedNow;
        } else {
            f.vx += (dvx - f.vx) * turn;
            f.vy += (dvy - f.vy) * turn;
        }

        // 被快速移动的指针惊动：向远离指针的方向冲一下（与水母一致：慢速指针无视；指针就在鱼身上时不惊动，那是要抓它）
        f.cooldown = Math.max(0, f.cooldown - dt);
        if (pointer && world.pointer.has && world.pointer.speed > PARAMS.FLEE_SPEED && f.state === 'alive' && !inHitRegion(f, pointer.x, pointer.y)) {
            const dx = f.x - pointer.x;
            const dy = f.y - pointer.y;
            const reach = PARAMS.FLEE_RADIUS * scale + Math.min(f.len, PARAMS.FLEE_LEN_CAP * scale);
            const d = Math.hypot(dx, dy);
            if (d < reach && d > 1e-6) {
                const push = (1 - d / reach) * PARAMS.FLEE_IMPULSE * scale * agile;
                f.vx += dx / d * push * Math.min(1, dt * 20);
                f.vy += dy / d * push * Math.min(1, dt * 20);
                if (f.cooldown === 0) f.cooldown = PARAMS.FLEE_COOLDOWN_S;
            }
        }

        // 纵向带：只在越出本种的带时回推；软边界：靠近屏幕边缘时回推（笨重的动物已经在上面转向，不再直接改速度）
        if (f.state === 'alive' && agile >= 1) {
            if (f.y < top) f.vy += clamp((top - f.y) / soft, 0, 3) * PARAMS.BAND_ACC * scale * dt;
            else if (f.y > bottom) f.vy -= clamp((f.y - bottom) / soft, 0, 3) * PARAMS.BAND_ACC * scale * dt;
            if (f.x < edge) f.vx += clamp((edge - f.x) / edge, 0, 2) * PARAMS.WALL_ACC * scale * dt;
            else if (f.x > world.width - edge) f.vx -= clamp((f.x - (world.width - edge)) / edge, 0, 2) * PARAMS.WALL_ACC * scale * dt;
        }

        let cap = speedT * capMult;
        if (f.glide > cap) {                                     // 松手后的滑行：超出正常上限的部分按 GLIDE_RATE 衰减（见 release）
            f.glide = cap + (f.glide - cap) * Math.exp(-PARAMS.GLIDE_RATE * dt);
            if (f.glide - cap < 1) f.glide = 0;
            else cap = f.glide;
        } else if (f.glide) f.glide = 0;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > cap) { f.vx *= cap / sp; f.vy *= cap / sp; }
        if (heavySide && f.sp > cap) f.sp = cap;

        f.x += f.vx * dt;
        f.y += f.vy * dt;

        // 不进入水母钟罩：位置被平滑推到钟罩外，并带一点沿切线的偏转
        for (const b of bells) {
            const dx = f.x - b.x;
            const dy = f.y - b.y;
            const d = Math.hypot(dx, dy);
            const keep = b.r + Math.min(f.len * PARAMS.BELL_KEEP, PARAMS.BELL_LEN_CAP * scale);
            const reach = b.r * PARAMS.BELL_AVOID + Math.min(f.len * 0.5, PARAMS.BELL_LEN_CAP * scale * 1.6);
            if (d >= reach) continue;
            const nx = d > 1e-6 ? dx / d : Math.cos(f.ang);
            const ny = d > 1e-6 ? dy / d : Math.sin(f.ang);
            if (agile >= 1) {
                f.vx += nx * (1 - d / reach) * PARAMS.BELL_PUSH * scale * dt;
                f.vy += ny * (1 - d / reach) * PARAMS.BELL_PUSH * scale * dt;
            }
            if (d < keep) { const k = Math.min(1, 10 * dt); f.x += nx * (keep - d) * k; f.y += ny * (keep - d) * k; }
        }

        // 身体不越过上下限：上缘不探出屏幕顶部（大型动物）、下缘不碰岸线；越过的部分平滑地压回来（被拖过岸线又松手的鱼就是这样落回水里的）
        if (ceilY !== null && f.y < ceilY) {
            const ease = Math.min(1, PARAMS.LIMIT_EASE * dt);
            f.y += (ceilY - f.y) * ease;
            if (f.vy < 0) f.vy -= f.vy * ease;                    // 顶着屏幕顶时向上的速度也一起收掉：贴着屏幕顶横着滑，而不是原地“游”不动
        }
        if (seabedY !== null) {
            const lowest = ceilY !== null ? Math.max(seabedY, ceilY) : seabedY;     // 两条线互相矛盾（屏幕很矮、动物很大）时以屏幕顶为准：身体不探出屏幕
            if (f.y > lowest) {
                const ease = Math.min(1, PARAMS.LIMIT_EASE * dt);
                f.y += (lowest - f.y) * ease;
                if (f.vy > 0) f.vy -= f.vy * ease;                // 顶着岸线时向下的速度也收掉：贴着岸线横着游，而不是往沙滩里“游”
            }
        }

        f.x = clamp(f.x, -margin, world.width + margin);
        f.y = clamp(f.y, -margin, world.height + margin);

        if (heavySide) {
            // 朝向：面向那一侧、俯仰由竖直速度决定（不绕过竖直方向）；转身中的身体由 xs 缩短，朝向不转
            const along = Math.sqrt(Math.max(f.sp * f.sp - f.vy * f.vy, 1e-6));
            f.turn = angleDiff(f.ang, Math.atan2(f.vy, f.face * along));
            f.ang += f.turn * Math.min(1, 6 * dt);
            updateFlip(f, dt);
            f.phase += dt * TAU * (0.7 + f.sp / Math.max(1, f.len) * 0.9);
            return;
        }
        if (Math.hypot(f.vx, f.vy) > 1) {
            f.turn = angleDiff(f.ang, Math.atan2(f.vy, f.vx));      // 还差多少没转过去：画法据此让鱼身在转弯时弯一点
            f.ang += f.turn * Math.min(1, 6 * dt);
        }
        updateFlip(f, dt);
        f.phase += dt * TAU * (0.7 + Math.hypot(f.vx, f.vy) / Math.max(1, f.len) * 0.9);
    }

    /**
     * 推进一步。input = { pointer: {x, y} | null, bells: [{x, y, r}], attractors: [{x, y, reach, weight, boost}], shore: number | null }：
     * pointer 用于避让与抓取跟随，bells 是水母钟罩（只读），attractors 是玩法模块给出的吸引点（饲料），
     * shore 是岸线（海水层此刻水线能到的最高处，px，从屏幕顶往下量；没有海水层或不是有限数时为 null，鱼不避岸线）。
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

        // 岸线（海水层此刻水线能到的最高处，px，从屏幕顶往下量）：有限数才算，夹在屏高的 50%–100%
        const shore = input && Number.isFinite(input.shore) ? clamp(input.shore, world.height * 0.5, world.height) : null;
        const shoreAppeared = shore !== null && !Number.isFinite(world.shoreY);
        world.shoreY = shore;

        const bells = validBells(input && input.bells);
        const attractors = validAttractors(input && input.attractors);
        const byEntry = new Map();
        for (const f of world.fish) {
            if (!byEntry.has(f.entry)) byEntry.set(f.entry, []);
            byEntry.get(f.entry).push(f);
        }
        // 第一次知道岸线（海水层刚启动）：家落在沙滩里的群重新挑家；家已经在岸线之上的群计划不动，鱼继续原来的走向
        if (shoreAppeared) {
            for (const [id, list] of byEntry) {
                const group = world.groups[id];
                const spec = speciesById(list[0].species);
                if (!group || !spec) continue;
                const sea = seabedOf(world, spec, spec.len * world.scale);
                if (sea !== null && group.hy > sea) group.next = 0;
            }
        }
        for (const f of world.fish) {
            if (f.state === 'held') stepHeld(world, f, dt, pointer);
            else stepFish(world, f, dt, byEntry.get(f.entry), pointer, bells, attractors);
        }
        world.fish = world.fish.filter(f => !(f.state === 'leaving' && f.alpha <= 0));
        if (world.vacancies.length) refill(world);
    }

    return {
        PARAMS, PX_PER_M, SPECIES, speciesById, normalizeEntries, canAdd, renderCount, capacity,
        createWorld, resize, reconcile, dismiss, step, hitTest, grab, release, cruiseSpeed, seabedOf, agileOf, isHeavySide,
        consume, enterOne,
        clamp, lerp, angleDiff, updateFlip,
    };
});
