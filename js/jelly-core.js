(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.JellyCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // “解压果冻”的软体物理：纯计算，不碰 DOM、时间与随机（需要时由调用方注入），可以在 Node 里完整测试。
    //
    // 做法：一圈轮廓点的位置 Verlet 积分，每个子步依次施加
    //   1) 指针抓取（被抓的几个点按权重拉向指针，保持抓取时的相对偏移，所以不会“跳”；
    //      指针坐标先夹进舞台矩形；抓取点以有限速度跟随指针，猛甩时果冻跟不上，而不是被一下子扯过身体）；
    //   2) 相邻点的边长约束（轮廓不被拉断，也不揉成一团）；
    //   3) 形状匹配（Müller 等人的 meshless shape matching：每个点被拉向“当前质心 + 最优旋转后的静止形状”，
    //      刚度是一个 0..1 的比例，对任何取值都无条件稳定，不会像弹簧网那样在大力拖拽时炸开）；
    //   4) 面积保持（压扁就向两侧鼓出，拉长就变细，这是果冻“挤压-拉伸”观感的来源）；
    //   5) 舞台边界（地面带摩擦，墙与天花板只做位置夹紧）；贴地时再削掉一点整体平移与自转（圆会一直滚）。
    // 轮廓被扯成“8”字或翻面（带符号面积低于静止面积的 55%）时进入折叠状态：暂时放开抓取、
    // 大幅提高形状匹配刚度、跳过面积保持，面积回到 85% 才解除（滞回），所以即使被乱拖也会弹回原形。
    // 固定 1/120 秒子步，一帧最多补 MAX_STEPS 步；没有随机数，输入相同则输出完全相同。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const PARAMS = Object.freeze({
        POINTS: 28,               // 轮廓点数
        STEP_S: 1 / 120,          // 固定子步（秒）
        MAX_STEPS: 6,             // 一帧最多补几步（多出来的时间丢掉）：切后台回来不会一口气算很久
        GRAVITY: 2200,            // px/s²
        DAMPING: 0.997,           // 每个子步的速度保留比例（约 0.70 / 秒）
        ITERATIONS: 3,            // 每个子步的约束迭代次数
        EDGE_STIFFNESS: 0.25,     // 边长约束
        BEND_STIFFNESS: 0.3,      // 隔一个点的距离约束（抗弯折：被快速拖着转圈时轮廓不会卷出小环）
        MATCH_STIFFNESS: 0.018,   // 形状匹配（每次迭代向目标靠近的比例）：越小越软，约 3–5 Hz 的晃动
        VOLUME_STIFFNESS: 0.2,    // 面积保持
        PULL: 0.32,               // 抓取时被抓的点每次迭代向指针靠近的比例
        POINTER_SPEED: 16,        // 抓取点跟随指针的最大速度（半径/秒）：猛甩时果冻“跟不上”，而不是被瞬间扯过身体
        FOLD_RATIO: 0.55,         // 带符号面积低于静止面积的这个比例就算折叠
        FOLD_RECOVER: 0.85,       // 恢复到这个比例才解除折叠状态（滞回）
        FOLD_BOOST: 9,            // 折叠时形状匹配刚度的倍数：让果冻很快“弹回”原形
        FOLD_RELEASE: 0.3,        // 折叠时抓取力度的比例
        GRAB_SIGMA: 3.4,          // 抓取权重沿轮廓的高斯宽度（以点数计）
        GRAB_REACH: 1.28,         // 点击点离轮廓多远（以半径计）仍算抓到
        FRICTION: 0.16,           // 地面接触时每个子步的水平速度损失
        ROLL_DRAG: 0.01,          // 贴地时每个子步损失的“整体水平平移 + 自转”比例：圆会一直滚，真实果冻因形变损耗会很快停下
        MAX_STEP_PX: 0.2,         // 单个子步内一个点最多移动半径的这个倍数（限速）
        POKE_RADIUS: 1.15,        // 戳的影响范围（半径倍数）
        POKE_DEPTH: 0.3,          // 戳的力度：最深把点推入半径的这个比例（以速度计；超过 MAX_STEP_PX 的部分会被限速吃掉）
        TAP_MS: 240,              // 抬起时按下不到这么久、且移动很少 → 算“戳”
        TAP_PX: 9,
        RADIUS_RATIO: 0.2,        // 半径 = 舞台短边的这个比例
        RADIUS_MIN: 34,
        RADIUS_MAX: 112,
        MARGIN: 12,
        REST_ENERGY: 0.0000022,   // 平均每点每子步位移平方（半径²归一）低于此认为静止
        REST_SECONDS: 0.7,        // 静止持续多久才算睡着
        REDUCE_DAMPING: 0.985,    // 减少动态效果：阻尼更大，更快停下
    });

    const TAU = Math.PI * 2;
    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }

    // ---------- 几何 ----------

    /** 多边形有向面积的绝对值（shoelace）。 */
    function polygonArea(points) {
        let sum = 0;
        for (let i = 0, n = points.length; i < n; i++) {
            const a = points[i];
            const b = points[(i + 1) % n];
            sum += a.x * b.y - b.x * a.y;
        }
        return Math.abs(sum) / 2;
    }

    /** 多边形的带符号面积（shoelace；顶点顺序翻转或折叠成“8”字时会变小或变号）。 */
    function signedArea(points) {
        let sum = 0;
        for (let i = 0, n = points.length; i < n; i++) {
            const a = points[i];
            const b = points[(i + 1) % n];
            sum += a.x * b.y - b.x * a.y;
        }
        return sum / 2;
    }

    /** 点在多边形内（射线法）。 */
    function insidePolygon(points, x, y) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i];
            const b = points[j];
            if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
    }

    /**
     * 形状匹配的最优旋转角：让静止形状 q（相对其质心）旋转后最贴近当前点 p（相对其质心）。
     * 二维下就是 atan2(Σ q×p, Σ q·p)；q、p 是等长的 {x,y} 数组，调用方已减去各自质心。
     */
    function bestRotation(q, p) {
        let dot = 0;
        let cross = 0;
        for (let i = 0; i < q.length; i++) {
            dot += q[i].x * p[i].x + q[i].y * p[i].y;
            cross += q[i].x * p[i].y - q[i].y * p[i].x;
        }
        return Math.atan2(cross, dot);
    }

    // ---------- 世界 ----------

    function layoutFor(width, height) {
        const radius = clamp(Math.min(width, height) * PARAMS.RADIUS_RATIO, PARAMS.RADIUS_MIN, PARAMS.RADIUS_MAX);
        return {
            radius,
            left: PARAMS.MARGIN,
            right: width - PARAMS.MARGIN,
            top: PARAMS.MARGIN,
            floor: height - PARAMS.MARGIN,
        };
    }

    function restShape(radius, n) {
        const shape = [];
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * TAU - Math.PI / 2;     // 第 0 个点在正上方
            shape.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        return shape;
    }

    function createWorld({ width = 640, height = 420, reduceMotion = false } = {}) {
        const n = PARAMS.POINTS;
        const layout = layoutFor(width, height);
        const world = {
            width, height, reduceMotion: !!reduceMotion,
            ...layout,
            n,
            rest: restShape(layout.radius, n),
            restArea: 0, chord: 0,
            points: [],
            cx: width / 2, cy: layout.floor - layout.radius, rotation: 0,
            acc: 0, time: 0, calm: 0, asleep: false,
            grab: null, pointer: { x: 0, y: 0, sx: 0, sy: 0 },
            folded: false,
            fx: new Float64Array(n), fy: new Float64Array(n),
            lastEnergy: 0,
        };
        refreshRest(world);
        spawn(world, { drop: false });
        return world;
    }

    function refreshRest(world) {
        world.rest = restShape(world.radius, world.n);
        world.restArea = polygonArea(world.rest);          // 静止轮廓是逆时针（带符号面积为正），折叠检测以此为基准
        world.chord = 2 * world.radius * Math.sin(Math.PI / world.n);
        world.chord2 = 2 * world.radius * Math.sin(2 * Math.PI / world.n);          // 隔一个点的弦长
    }

    /** 重新放置果冻：drop 为 true 时从上方落下（弹一弹），否则安静地坐在地上。 */
    function spawn(world, { drop = false } = {}) {
        const cx = world.width / 2;
        const cy = drop ? world.top + world.radius * 1.1 : world.floor - world.radius;     // 坐下时最低点恰好贴地，不陷进去
        world.points = world.rest.map(q => ({ x: cx + q.x, y: cy + q.y, px: cx + q.x, py: cy + q.y }));
        world.cx = cx; world.cy = cy; world.rotation = 0;
        world.grab = null; world.acc = 0; world.calm = 0; world.asleep = false; world.folded = false;
    }

    /** 舞台尺寸变化：按新的半径整体缩放，水平位置按比例保留，并夹回边界内。 */
    function resize(world, width, height) {
        if (!(width > 0) || !(height > 0)) return;
        const oldRadius = world.radius;
        const oldWidth = world.width;
        const oldFloor = world.floor;
        Object.assign(world, { width, height }, layoutFor(width, height));
        refreshRest(world);
        const scale = world.radius / oldRadius;
        const shiftX = (width / oldWidth);
        const cxOld = world.cx;
        const cxNew = clamp(cxOld * shiftX, world.left + world.radius, world.right - world.radius);
        const bottomGap = oldFloor - (world.cy + oldRadius);          // 原来离地面的距离，保持相同的比例
        const cyNew = clamp(world.floor - world.radius - bottomGap * scale, world.top + world.radius, world.floor - world.radius);
        for (const p of world.points) {
            for (const [a, b] of [['x', 'px'], ['y', 'py']]) {
                const center = a === 'x' ? cxOld : world.cy;
                const target = a === 'x' ? cxNew : cyNew;
                p[a] = target + (p[a] - center) * scale;
                p[b] = target + (p[b] - center) * scale;
            }
        }
        world.cx = cxNew; world.cy = cyNew;
        world.grab = null;
        world.asleep = false; world.calm = 0;
        enforceBounds(world);
    }

    // ---------- 单个子步 ----------

    function centroid(world) {
        let x = 0;
        let y = 0;
        for (const p of world.points) { x += p.x; y += p.y; }
        world.cx = x / world.n;
        world.cy = y / world.n;
    }

    /** 抓取点向真实指针靠近，但有最大速度：猛甩或指针瞬移时，果冻“跟不上”，而不是被一下子扯过身体。 */
    function followPointer(world) {
        if (!world.grab) return;
        const pointer = world.pointer;
        const dx = pointer.x - pointer.sx;
        const dy = pointer.y - pointer.sy;
        const dist = Math.hypot(dx, dy);
        const maxMove = PARAMS.POINTER_SPEED * world.radius * PARAMS.STEP_S;
        if (dist <= maxMove) { pointer.sx = pointer.x; pointer.sy = pointer.y; return; }
        pointer.sx += dx / dist * maxMove;
        pointer.sy += dy / dist * maxMove;
    }

    /** 折叠检测（带滞回）：带符号面积远小于静止面积，说明轮廓被扯成“8”字或翻了面。 */
    function updateFold(world) {
        const ratio = signedArea(world.points) / world.restArea;       // NaN 与任何数比较都为 false，状态不会因它改变
        if (!world.folded && ratio < PARAMS.FOLD_RATIO) world.folded = true;
        else if (world.folded && ratio > PARAMS.FOLD_RECOVER) world.folded = false;
    }

    function pull(world) {
        const grab = world.grab;
        if (!grab) return;
        const strength = world.folded ? PARAMS.FOLD_RELEASE : 1;
        for (const g of grab.list) {
            const p = world.points[g.i];
            const tx = world.pointer.sx + g.ox;
            const ty = world.pointer.sy + g.oy;
            p.x += (tx - p.x) * PARAMS.PULL * g.w * strength;
            p.y += (ty - p.y) * PARAMS.PULL * g.w * strength;
        }
    }

    /**
     * 相邻点（边长）与隔一个点（抗弯折）两组距离约束。
     * 采用 Jacobi 式：先按当前位置把所有修正累加起来，再一次性施加。按下标顺序依次求解（Gauss–Seidel）
     * 会带来固定方向的偏向（落地后总向同一侧滚一点、倾斜几度）；Jacobi 与顶点编号顺序无关，
     * 对左右对称的输入给出左右对称的结果。每个点最多受 4 条约束牵拉，总比例 < 1，所以稳定。
     */
    function edges(world) {
        const pts = world.points;
        const n = world.n;
        const fx = world.fx;
        const fy = world.fy;
        fx.fill(0);
        fy.fill(0);
        const relax = (gap, chord, k) => {
            for (let i = 0; i < n; i++) {
                const j = (i + gap) % n;
                const dx = pts[j].x - pts[i].x;
                const dy = pts[j].y - pts[i].y;
                const dist = Math.hypot(dx, dy) || 1e-6;
                const diff = (dist - chord) / dist * k;
                fx[i] += dx * diff; fy[i] += dy * diff;
                fx[j] -= dx * diff; fy[j] -= dy * diff;
            }
        };
        relax(1, world.chord, PARAMS.EDGE_STIFFNESS * 0.5);
        relax(2, world.chord2, PARAMS.BEND_STIFFNESS * 0.5);
        for (let i = 0; i < n; i++) { pts[i].x += fx[i]; pts[i].y += fy[i]; }
    }

    function match(world) {
        const pts = world.points;
        const n = world.n;
        centroid(world);
        const rel = new Array(n);
        for (let i = 0; i < n; i++) rel[i] = { x: pts[i].x - world.cx, y: pts[i].y - world.cy };
        const theta = bestRotation(world.rest, rel);
        world.rotation = theta;
        const cs = Math.cos(theta);
        const sn = Math.sin(theta);
        const k = Math.min(0.5, PARAMS.MATCH_STIFFNESS * (world.folded ? PARAMS.FOLD_BOOST : 1));
        for (let i = 0; i < n; i++) {
            const q = world.rest[i];
            const gx = world.cx + cs * q.x - sn * q.y;
            const gy = world.cy + sn * q.x + cs * q.y;
            pts[i].x += (gx - pts[i].x) * k;
            pts[i].y += (gy - pts[i].y) * k;
        }
    }

    function volume(world) {
        if (world.folded) return;                  // 折叠时面积读数不可信（反而会把“8”字撑大），先让形状匹配把它拉回来
        const area = polygonArea(world.points);
        if (!(area > 1e-6)) return;
        centroid(world);
        const raw = Math.sqrt(world.restArea / area);
        const scale = 1 + (raw - 1) * PARAMS.VOLUME_STIFFNESS;
        for (const p of world.points) {
            p.x = world.cx + (p.x - world.cx) * scale;
            p.y = world.cy + (p.y - world.cy) * scale;
        }
    }

    function enforceBounds(world) {
        for (const p of world.points) {
            if (p.x < world.left) p.x = world.left;
            else if (p.x > world.right) p.x = world.right;
            if (p.y < world.top) p.y = world.top;
            if (p.y > world.floor) p.y = world.floor;
        }
    }

    /**
     * 滚动阻力：圆在地面上滚动没有任何恢复力，地面摩擦又只管滑动，所以光靠阻尼要滚很久。
     * 贴地时把速度里“整体水平平移 + 绕质心自转”这个刚体分量按比例削掉；形变（晃动）分量与竖直方向不受影响。
     */
    function rollDrag(world) {
        const pts = world.points;
        const n = world.n;
        let grounded = 0;
        let vx = 0;
        let vy = 0;
        for (const p of pts) {
            if (p.y >= world.floor - 0.01) grounded++;
            vx += p.x - p.px;
            vy += p.y - p.py;
        }
        if (grounded < 2) return;
        vx /= n; vy /= n;
        let cx = 0;
        let cy = 0;
        for (const p of pts) { cx += p.x; cy += p.y; }
        cx /= n; cy /= n;
        let num = 0;
        let den = 0;
        for (const p of pts) {
            const rx = p.x - cx;
            const ry = p.y - cy;
            num += rx * ((p.y - p.py) - vy) - ry * ((p.x - p.px) - vx);
            den += rx * rx + ry * ry;
        }
        const omega = den > 1e-9 ? num / den : 0;
        for (const p of pts) p.px += (vx - omega * (p.y - cy)) * PARAMS.ROLL_DRAG;
    }

    function substep(world) {
        const h = PARAMS.STEP_S;
        const damping = world.reduceMotion ? PARAMS.REDUCE_DAMPING : PARAMS.DAMPING;
        const maxMove = PARAMS.MAX_STEP_PX * world.radius;
        let motion = 0;
        for (const p of world.points) {
            let vx = (p.x - p.px) * damping;
            let vy = (p.y - p.py) * damping;
            const speed = Math.hypot(vx, vy);
            if (speed > maxMove) { vx *= maxMove / speed; vy *= maxMove / speed; }
            p.px = p.x; p.py = p.y;
            p.x += vx;
            p.y += vy + PARAMS.GRAVITY * h * h;
        }
        followPointer(world);
        updateFold(world);
        for (let it = 0; it < PARAMS.ITERATIONS; it++) {
            pull(world);
            edges(world);
            match(world);
            volume(world);
            enforceBounds(world);
        }
        // 地面摩擦：贴地的点损失水平速度（只在子步末尾做一次，迭代里不碰速度）
        for (const p of world.points) {
            if (p.y >= world.floor - 0.01) p.px += (p.x - p.px) * PARAMS.FRICTION;
        }
        rollDrag(world);
        for (const p of world.points) {
            const dx = p.x - p.px;
            const dy = p.y - p.py;
            motion += dx * dx + dy * dy;
        }
        centroid(world);
        world.lastEnergy = motion / world.n / (world.radius * world.radius);
        world.time += h;
    }

    /**
     * 推进 dtMs 毫秒：按固定子步累计，一帧最多 MAX_STEPS 步，多出来的时间丢掉（不追赶）。
     * 返回这次实际跑了几个子步。dt 为 0、负数或非数字什么都不做。
     */
    function step(world, dtMs) {
        if (!(dtMs > 0)) return 0;
        world.acc += dtMs / 1000;
        let steps = 0;
        while (world.acc >= PARAMS.STEP_S && steps < PARAMS.MAX_STEPS) {
            substep(world);
            world.acc -= PARAMS.STEP_S;
            steps++;
        }
        if (steps === PARAMS.MAX_STEPS) world.acc = 0;
        if (steps > 0) updateSleep(world, steps);
        return steps;
    }

    function updateSleep(world, steps) {
        const interacting = !!world.grab;
        if (interacting || world.lastEnergy > PARAMS.REST_ENERGY) {
            world.calm = 0;
            world.asleep = false;
            return;
        }
        world.calm += steps * PARAMS.STEP_S;
        if (world.calm >= PARAMS.REST_SECONDS) world.asleep = true;
    }

    // ---------- 交互 ----------

    function nearestPoint(world, x, y) {
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < world.n; i++) {
            const dist = Math.hypot(world.points[i].x - x, world.points[i].y - y);
            if (dist < bestDist) { bestDist = dist; best = i; }
        }
        return { index: best, distance: bestDist };
    }

    /**
     * 按下：点在果冻里面，或离轮廓不到 GRAB_REACH 个半径，就抓住最近的那一片。返回是否抓到。
     * 指针坐标先夹进舞台矩形：指针被拖出舞台时，果冻最多被拉到舞台边缘；不夹的话，
     * 抓着顶部把指针拖到几千像素外的地下，会把轮廓压成一张纸（面积比 0.01，夹进舞台后最低约 0.5，松手 0.5 秒内恢复）。
     */
    function grab(world, rawX, rawY) {
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return false;
        const x = clamp(rawX, 0, world.width);
        const y = clamp(rawY, 0, world.height);
        const { index, distance } = nearestPoint(world, x, y);
        const inside = insidePolygon(world.points, x, y);
        if (!inside && distance > world.radius * (PARAMS.GRAB_REACH - 1) + world.chord) return false;
        // 点在里面时抓“离点击处最近的轮廓点”，权重沿轮廓衰减；外面的点击只抓贴近的那一小段
        const list = [];
        const sigma = PARAMS.GRAB_SIGMA;
        for (let d = -Math.ceil(sigma * 2.5); d <= Math.ceil(sigma * 2.5); d++) {
            const i = ((index + d) % world.n + world.n) % world.n;
            const w = Math.exp(-(d * d) / (sigma * sigma));
            if (w < 0.04) continue;
            list.push({ i, w, ox: world.points[i].x - x, oy: world.points[i].y - y });
        }
        world.grab = { list, at: world.time, startX: x, startY: y, travel: 0 };
        world.pointer.x = x; world.pointer.y = y; world.pointer.sx = x; world.pointer.sy = y;
        world.asleep = false; world.calm = 0;
        return true;
    }

    function drag(world, rawX, rawY) {
        if (!world.grab || !Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
        const x = clamp(rawX, 0, world.width);                   // 同 grab：目标点夹进舞台矩形
        const y = clamp(rawY, 0, world.height);
        world.pointer.x = x; world.pointer.y = y;
        world.grab.travel = Math.max(world.grab.travel, Math.hypot(x - world.grab.startX, y - world.grab.startY));
    }

    /** 抬起：按下时间很短、几乎没移动就是“戳”（返回 'poke'），否则是拖拽后的松手（返回 'release'）。没抓着返回 null。 */
    function release(world) {
        const grab = world.grab;
        if (!grab) return null;
        world.grab = null;
        const quick = (world.time - grab.at) * 1000 < PARAMS.TAP_MS && grab.travel < PARAMS.TAP_PX;
        if (quick) {
            poke(world, grab.startX, grab.startY);
            return 'poke';
        }
        return 'release';
    }

    /** 在 (x, y) 附近把点向质心方向推（给速度，不是瞬移），所以会先凹进去再弹回来。 */
    function poke(world, x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        centroid(world);
        const reach = world.radius * PARAMS.POKE_RADIUS;
        const depth = PARAMS.POKE_DEPTH * world.radius;
        for (const p of world.points) {
            const dist = Math.hypot(p.x - x, p.y - y);
            if (dist >= reach) continue;
            const falloff = 1 - dist / reach;
            const dx = world.cx - p.x;
            const dy = world.cy - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const impulse = depth * falloff * falloff;
            p.px -= dx / len * impulse * 0.5;     // Verlet：速度 = x - px，让 px 退一点就是加了向内的速度
            p.py -= dy / len * impulse * 0.5;
        }
        world.asleep = false; world.calm = 0;
    }

    // ---------- 读数 ----------

    /** 给绘制用的读数：质心、旋转、面积比、包围盒（宽高）、是否被抓着、整体速度。 */
    function metrics(world) {
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        let vx = 0; let vy = 0;
        for (const p of world.points) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            vx += p.x - p.px; vy += p.y - p.py;
        }
        const width = maxX - minX;
        const height = maxY - minY;
        return {
            cx: world.cx, cy: world.cy, rotation: world.rotation,
            areaRatio: polygonArea(world.points) / world.restArea,
            width, height, minX, maxX, minY, maxY,
            stretch: Math.max(width, height) / Math.max(1e-6, Math.min(width, height)),
            vx: vx / world.n, vy: vy / world.n,
            grabbed: !!world.grab,
            asleep: world.asleep,
            folded: world.folded,
            airborne: maxY < world.floor - world.radius * 0.35,
        };
    }

    return {
        PARAMS, createWorld, spawn, resize, step, grab, drag, release, poke, metrics,
        polygonArea, signedArea, insidePolygon, bestRotation, clamp,
    };
});
