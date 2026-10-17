// 水母皮肤控制器：待办数的读取与跟随、时钟拍点、生命周期释放、故障自停、绘制契约。
// 物理本身在 jellyfish-core.test.js；这里用替身 chrome / 时钟元素 / MutationObserver / 记录型画布驱动真实的控制器代码。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jellyfish-core.js');
const Skin = require('../js/jellyfish.js');

const P = Core.PARAMS;
const tick = () => new Promise(resolve => setImmediate(resolve));

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

let memoSeq = 0;
const memo = (patch = {}) => Object.assign({ id: `m${++memoSeq}`, title: 't', completed: false }, patch);
const pendingMemos = n => Array.from({ length: n }, () => memo());

const GRADIENT_FACTORIES = ['createRadialGradient', 'createLinearGradient'];

/** 不记录任何调用的画布：长时间推进物理时用，避免占内存。 */
function noopCtx() {
    return new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : (GRADIENT_FACTORIES.includes(key) ? () => ({ addColorStop() {} }) : () => {})),
        set: (target, key, value) => { target[key] = value; return true; },
    });
}

/** 记录所有方法调用、样式赋值与渐变色标的画布；_gradients 按创建顺序记下每个渐变的类型、参数与色标（{ offset, color }），_texts 记下每次 fillText 的文字、位置与样式。 */
function recorder() {
    const calls = [];
    const styles = [];
    const stops = [];
    const gradients = [];
    const texts = [];
    const state = {};
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key === '_styles') return styles;
            if (key === '_stops') return stops;
            if (key === '_gradients') return gradients;
            if (key === '_texts') return texts;
            if (key === '_state') return state;
            if (key in target) return target[key];
            return (...args) => {
                calls.push(String(key));
                if (key === 'fillText') texts.push({ text: args[0], x: args[1], y: args[2], style: state.fillStyle, font: state.font, align: state.textAlign });
                if (GRADIENT_FACTORIES.includes(key)) {
                    const gradient = { type: key === 'createLinearGradient' ? 'linear' : 'radial', args, stops: [] };
                    gradients.push(gradient);
                    return { addColorStop(offset, color) { stops.push(color); gradient.stops.push({ offset, color }); } };
                }
                return undefined;
            };
        },
        set(target, key, value) {
            if ((key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string') styles.push(value);
            target[key] = value;
            return true;
        },
    });
    return ctx;
}

function alphaOf(color) {
    const match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color);
    return match ? Number(match[4]) : null;
}

/** rgba(r,g,b,a) 的色值恰好是内置调色板里的某一项时返回 "r,g,b"，否则 null（钟罩渐变与光晕用调色板原色；水管、高光、体内发光是混白后的颜色，不会命中）。 */
function paletteKey(color) {
    const match = /^rgba\((\d+),(\d+),(\d+),[\d.]+\)$/.exec(color);
    if (!match) return null;
    const key = `${match[1]},${match[2]},${match[3]}`;
    return Skin.PALETTE.some(entry => entry.join(',') === key) ? key : null;
}

/** chrome.storage 替身：local.get 返回当前值（可被手动闸门延后返回），onChanged 可手动触发。 */
function fakeChrome({ memos, failRead = false } = {}) {
    const listeners = [];
    const reads = [];
    const writes = [];
    const chrome = {
        _value: memos,
        _gate: null,
        storage: {
            local: {
                set(...args) { writes.push(['set', ...args]); return Promise.resolve(); },
                remove(...args) { writes.push(['remove', ...args]); return Promise.resolve(); },
                clear(...args) { writes.push(['clear', ...args]); return Promise.resolve(); },
                get(key) {
                    reads.push(key);
                    if (failRead) return Promise.reject(new Error('read failed'));
                    const result = chrome._value === undefined ? {} : { memos: chrome._value };   // 调用时就取值：晚返回的读取带的是旧数据
                    return chrome._gate ? chrome._gate.then(() => result) : Promise.resolve(result);
                },
            },
            onChanged: {
                addListener(fn) { listeners.push(fn); },
                removeListener(fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
            },
        },
    };
    return {
        chrome, listeners, reads, writes,
        // 不给默认值：显式传入 undefined 的“没有区域名”也要原样送到监听器；省略时才按 local
        emit(changes, ...rest) { for (const fn of [...listeners]) fn(changes, ...(rest.length ? rest : ['local'])); },
    };
}

function setup(options = {}) {
    const fake = fakeChrome(options);
    const timeEl = { textContent: '12:00:00' };
    const observers = [];
    class FakeMO {
        constructor(callback) { this.cb = callback; this.observing = false; observers.push(this); }
        observe() { this.observing = true; }
        disconnect() { this.observing = false; }
    }
    const wallBase = 5000000;
    const clock = { now: 0 };
    const warnings = [];
    const doc = options.noClock ? { getElementById: () => null } : { getElementById: id => (id === 'time' ? timeEl : null) };
    const skin = Skin.create({
        document: doc,
        window: options.window || { performance: { now: () => clock.now } },
        chrome: fake.chrome,
        MutationObserver: FakeMO,
        now: () => clock.now,
        wall: () => (options.wallMs !== undefined ? options.wallMs : (options.wall === 'frozen' ? wallBase : wallBase + clock.now)),
        random: seeded(options.seed || 11),
        warn: message => warnings.push(message),
        ...(options.crumple !== undefined ? { crumple: options.crumple } : {}),
        ...(options.complete !== undefined ? { complete: options.complete } : {}),
    });
    return { skin, fake, timeEl, observers, warnings, clock };
}

/** 以固定步长推进 [from, to) 毫秒；each 在每帧之前调用（用来在指定时刻触发事件）。 */
function drive(env, { from = 0, to, dt = 16, width = 1280, height = 720, ctx = noopCtx(), each = null, after = null, extra = {} }) {
    let now = from;
    while (now < to) {
        env.clock.now = now;
        if (each) each(now);
        // night:false —— 其余测试与本机时区、真实时刻无关（夜晚荧光有自己的测试，显式传 night / nightHour）
        env.skin.frame({ ctx, width, height, dt, now, amount: 0.65, night: false, ...extra });
        if (after) after(now);
        now += dt;
    }
    return now;
}

/** 记录每只水母“开始收缩”的时刻（pulseT 从大于等于 0.1 回到小于 0.1）。 */
function pulseRecorder(env) {
    const last = new Map();
    const times = [];
    return {
        times,
        sample(now) {
            const world = env.skin._world();
            if (!world) return;
            for (const jelly of world.jellies) {
                const previous = last.get(jelly.id);
                if (previous !== undefined && previous >= 0.1 && jelly.pulseT < 0.1) times.push(now);
                last.set(jelly.id, jelly.pulseT);
            }
        },
    };
}

test('创建后不自行启动：不读存储、不注册监听、不建观察者，frame 什么都不画', () => {
    const env = setup({ memos: pendingMemos(3) });
    assert.equal(env.skin.isActive(), false);
    assert.deepEqual(env.fake.reads, []);
    assert.equal(env.fake.listeners.length, 0);
    assert.equal(env.observers.length, 0);
    const ctx = recorder();
    assert.equal(env.skin.frame({ ctx, width: 1280, height: 720, dt: 16, now: 0 }), false);
    assert.equal(ctx._calls.length, 0);
    assert.equal(env.skin._world(), null);
});

test('start：读一次存储、注册一个监听与一个时钟观察者；只数“未完成且非失败”，首次填充直接出现在屏幕内', async () => {
    const env = setup({ memos: [memo(), memo(), memo({ completed: true }), memo({ status: 'failed' }), memo({ completed: false, status: 'pending' })] });
    env.skin.start();
    await tick();
    assert.deepEqual(env.fake.reads, ['memos']);
    assert.equal(env.fake.listeners.length, 1);
    assert.equal(env.observers.length, 1);
    assert.equal(env.observers[0].observing, true);
    assert.equal(env.skin.state().pending, 3);
    assert.equal(env.skin.isActive(), true);

    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 1280, height: 720, dt: 16, now: 0 }), true);
    const world = env.skin._world();
    assert.equal(world.jellies.length, 3);
    assert.deepEqual(env.skin.state(), { started: true, failed: false, pending: 3, populated: true, jellies: 3 });
    for (const jelly of world.jellies) assert.ok(jelly.y < 720, '首次填充的水母出现在屏幕里，不是从下方游进来');
});

test('重复 start 不重复注册；没有时钟元素时仍然工作（退回墙钟）', async () => {
    const env = setup({ memos: pendingMemos(2), noClock: true });
    env.skin.start();
    env.skin.start();
    await tick();
    assert.equal(env.fake.listeners.length, 1);
    assert.equal(env.fake.reads.length, 1);
    assert.equal(env.observers.length, 0, '没有 #time 元素就不建观察者');
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 800, height: 600, dt: 16, now: 0 }), true);
    assert.equal(env.skin.state().jellies, 2);
});

test('读取失败：数量保持未知（不当作 0），只画光点；之后事件到达即恢复', async () => {
    const env = setup({ failRead: true });
    env.skin.start();
    await tick();
    assert.equal(env.skin.state().pending, null);
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 1280, height: 720, dt: 16, now: 0 }), true);
    assert.deepEqual(env.skin.state(), { started: true, failed: false, pending: null, populated: false, jellies: 0 });
    assert.ok(env.skin._world().plankton.length > 0, '没有待办数时仍有浮游光点');

    env.fake.emit({ memos: { newValue: pendingMemos(4) } });
    assert.equal(env.skin.state().pending, 4);
    drive(env, { from: 16, to: 64 });
    assert.equal(env.skin.state().jellies, 4);
    assert.equal(env.skin.state().populated, true);
    for (const jelly of env.skin._world().jellies) {
        assert.ok(jelly.y < 720, '世界已经在跑时第一次拿到数据，同样是即时填充（出现在屏幕里），不是全部从下方游进来');
    }
});

test('存储里的任务表不是数组：数量未知而不是 0', async () => {
    for (const bad of ['oops', 12, { length: 3 }, null]) {
        const env = setup({ memos: bad });
        env.skin.start();
        await tick();
        assert.equal(env.skin.state().pending, null, JSON.stringify(bad));
    }
    const missing = setup({});
    missing.skin.start();
    await tick();
    assert.equal(missing.skin.state().pending, 0, '没有 memos 键就是没有任务');
});

test('不用 memoManager 的内存副本：它只在页面初始化时加载，别处改了任务不会刷新', async () => {
    const env = setup({
        memos: pendingMemos(2),
        window: { performance: { now: () => 0 }, memoManager: { memos: pendingMemos(10) } },
    });
    env.skin.start();
    await tick();
    assert.equal(env.skin.state().pending, 2, '以存储为准');
});

test('事件自带新值直接计数：不再读存储；完成一个就有一只离开，过一阵被移除', async () => {
    const memos = pendingMemos(4);
    const env = setup({ memos });
    env.skin.start();
    await tick();
    const settled = drive(env, { to: Math.ceil((P.ENTER_S + 0.3) * 1000) });      // 等淡入阶段过去
    assert.equal(env.skin.state().jellies, 4);
    assert.ok(env.skin._world().jellies.every(j => j.state === 'alive'));
    const readsBefore = env.fake.reads.length;

    const next = memos.map((m, i) => (i === 0 ? { ...m, completed: true } : m));
    env.fake.emit({ memos: { newValue: next } });
    assert.equal(env.fake.reads.length, readsBefore, '没有额外读取存储');
    assert.equal(env.skin.state().pending, 3);

    const states = () => env.skin._world().jellies.map(j => j.state).sort();
    assert.deepEqual(states(), ['alive', 'alive', 'alive', 'leaving'], '数量已按新值核对，离开的那只还在淡出');
    drive(env, { from: settled, to: settled + Math.ceil((P.LEAVE_S + 0.5) * 1000) });
    assert.equal(env.skin._world().jellies.length, 3, '淡出结束后被移除');
    assert.ok(env.skin._world().jellies.every(j => j.state === 'alive'));
});

test('新增任务：新水母从屏幕下方游进来；数量受上限约束（低功耗更少）', async () => {
    const pool = pendingMemos(40);                 // 同一批任务（id 固定）：水母按任务 id 对应，不能每次都换一批新 id
    const env = setup({ memos: pool.slice(0, 2) });
    env.skin.start();
    await tick();
    drive(env, { to: 160 });
    env.fake.emit({ memos: { newValue: pool.slice(0, 3) } });
    const world = env.skin._world();
    assert.equal(world.jellies.length, 3);
    const newest = world.jellies[world.jellies.length - 1];
    assert.ok(newest.y > 720, '新水母出现在屏幕下方，再游进来');

    env.fake.emit({ memos: { newValue: pool } });
    assert.equal(env.skin._world().jellies.filter(j => j.state !== 'leaving').length, P.MAX_COUNT);

    drive(env, { from: 200, to: 264, extra: { lowPower: true } });
    assert.equal(env.skin._world().lowPower, true);
    assert.equal(env.skin._world().jellies.length, P.MAX_COUNT_LOW, '省流量模式：重建后只剩较少的水母');
    drive(env, { from: 264, to: 330, extra: { lowPower: false } });
    assert.equal(env.skin._world().jellies.length, P.MAX_COUNT);
});

test('不相关的事件被忽略：别的存储区、别的键、空参数、形状不对的新值', async () => {
    const env = setup({ memos: pendingMemos(3) });
    env.skin.start();
    await tick();
    drive(env, { to: 64 });
    const ignored = [
        [{ memos: { newValue: pendingMemos(9) } }, 'sync'],
        [{ memos: { newValue: pendingMemos(9) } }, 'session'],
        [{ memos: { newValue: pendingMemos(9) } }, undefined],
        [{ other: { newValue: pendingMemos(9) } }, 'local'],
        [{}, 'local'],
        [null, 'local'],
        [undefined, 'local'],
        [{ memos: { newValue: 'oops' } }, 'local'],
        [{ memos: { newValue: null } }, 'local'],
        [{ memos: { newValue: { length: 9 } } }, 'local'],
    ];
    for (const [changes, area] of ignored) {
        env.fake.emit(changes, area);
        assert.equal(env.skin.state().pending, 3, JSON.stringify([changes, area]));
    }
    assert.equal(env.fake.reads.length, 1);
});

test('键被删除（事件里只有 oldValue）按“没有任务”处理：全部离开，只剩光点', async () => {
    const env = setup({ memos: pendingMemos(3) });
    env.skin.start();
    await tick();
    drive(env, { to: 64 });
    env.fake.emit({ memos: { oldValue: pendingMemos(3) } });
    assert.equal(env.skin.state().pending, 0);
    assert.ok(env.skin._world().jellies.every(j => j.state === 'leaving'));
    drive(env, { from: 64, to: 64 + Math.ceil((P.LEAVE_S + 0.5) * 1000) });
    assert.equal(env.skin._world().jellies.length, 0);
    assert.ok(env.skin._world().plankton.length > 0);
});

test('更早发起的读取在更新的事件之后才返回：不采用过期数据', async () => {
    const env = setup({ memos: pendingMemos(5) });
    let release;
    env.fake.chrome._gate = new Promise(resolve => { release = resolve; });
    env.skin.start();                                   // 读取已按“5 个”发起，但被闸门挡住
    env.fake.emit({ memos: { newValue: pendingMemos(1) } });
    assert.equal(env.skin.state().pending, 1);
    release();
    await tick();
    await tick();
    assert.equal(env.skin.state().pending, 1, '晚到的旧读取不能盖掉更新的事件');
});

test('stop 释放一切：监听、观察者、世界；晚到的读取不再生效；frame 不再画；重新 start 可恢复', async () => {
    const env = setup({ memos: pendingMemos(3) });
    let release;
    env.fake.chrome._gate = new Promise(resolve => { release = resolve; });
    env.skin.start();
    env.skin.stop();                                     // 在读取返回之前就停止
    assert.equal(env.fake.listeners.length, 0);
    assert.equal(env.observers[0].observing, false);
    release();
    await tick();
    await tick();
    assert.equal(env.skin.state().pending, null, '停止之后返回的读取不更新');
    const ctx = recorder();
    assert.equal(env.skin.frame({ ctx, width: 1280, height: 720, dt: 16, now: 0 }), false);
    assert.equal(ctx._calls.length, 0);
    assert.equal(env.skin._world(), null);
    env.skin.stop();                                     // 重复停止无副作用

    env.fake.chrome._gate = null;
    env.skin.start();
    await tick();
    assert.equal(env.fake.listeners.length, 1);
    assert.equal(env.skin.state().pending, 3);
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 1280, height: 720, dt: 16, now: 0 }), true);
    assert.equal(env.skin.state().jellies, 3);
    env.skin.stop();
    assert.equal(env.fake.listeners.length, 0);
    assert.deepEqual(env.skin.state(), { started: false, failed: false, pending: null, populated: false, jellies: 0 });
});

test('frame 的入口守卫：没有画布或尺寸不合法时不画、不建世界', async () => {
    const env = setup({ memos: pendingMemos(2) });
    env.skin.start();
    await tick();
    assert.equal(env.skin.frame({ width: 1280, height: 720, dt: 16, now: 0 }), false);
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 0, height: 720, dt: 16, now: 0 }), false);
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 1280, height: -1, dt: 16, now: 0 }), false);
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: NaN, height: 720, dt: 16, now: 0 }), false);
    assert.equal(env.skin.frame(), false);
    assert.equal(env.skin._world(), null);
});

test('窗口尺寸变化：同一个世界缩放，水母编号与数量不变', async () => {
    const env = setup({ memos: pendingMemos(4) });
    env.skin.start();
    await tick();
    drive(env, { to: 64 });
    const ids = env.skin._world().jellies.map(j => j.id);
    drive(env, { from: 64, to: 128, width: 1920, height: 1080 });
    const world = env.skin._world();
    assert.equal(world.width, 1920);
    assert.equal(world.height, 1080);
    assert.deepEqual(world.jellies.map(j => j.id), ids);
});

test('时钟拍点：首页时钟数字每秒真实变化时，水母跟着这个节拍收缩（墙钟冻结也照样收缩）', async () => {
    const env = setup({ memos: pendingMemos(6), wall: 'frozen' });
    env.skin.start();
    await tick();
    const recorderOfPulses = pulseRecorder(env);
    const triggers = [];
    let next = 500;
    let n = 0;
    drive(env, {
        to: 9000,
        each: now => {
            if (now >= next) {
                env.timeEl.textContent = `12:00:${String(++n).padStart(2, '0')}`;
                env.observers[0].cb();
                triggers.push(now);
                next += 1000;
            }
        },
        after: recorderOfPulses.sample,
    });
    // 第 2 次变化起，时钟被认定为“确实每秒在变”，此后的每次收缩都紧跟在某次数字变化的同一帧
    const late = recorderOfPulses.times.filter(t => t >= triggers[1]);
    assert.ok(late.length >= 6, `收缩次数 ${late.length}`);
    for (const t of late) assert.ok(triggers.includes(t), `收缩发生在 ${t}ms，不是数字变化的那一帧`);
    // 每个拍点都有水母收缩（六只水母的周期与相位覆盖了所有余数）
    for (const t of triggers.slice(1)) assert.ok(late.includes(t), `拍点 ${t}ms 没有水母收缩`);
});

test('没有时钟变化时退回整秒墙钟：收缩落在墙钟的整秒边界上', async () => {
    const env = setup({ memos: pendingMemos(6) });
    env.skin.start();
    await tick();
    const recorderOfPulses = pulseRecorder(env);
    drive(env, { to: 9000, after: recorderOfPulses.sample });
    const late = recorderOfPulses.times.filter(t => t > 100);
    assert.ok(late.length >= 6, `收缩次数 ${late.length}`);
    for (const t of late) {
        assert.ok(t % 1000 < 16, `收缩发生在 ${t}ms，不在整秒边界上`);
    }
});

test('时钟元素有突变但文字没变：不记拍；墙钟冻结时没有任何新的收缩', async () => {
    const env = setup({ memos: pendingMemos(6), wall: 'frozen' });
    env.skin.start();
    await tick();
    const recorderOfPulses = pulseRecorder(env);
    drive(env, {
        to: 6000,
        each: now => { if (now % 1000 < 16) env.observers[0].cb(); },     // 回调来了，但 textContent 没变
        after: recorderOfPulses.sample,
    });
    assert.ok(recorderOfPulses.times.every(t => t < 100), '除了首帧按当前拍点收缩之外，没有后续收缩');
});

test('指针很快划过会惊动附近的水母；指针不动则不会', async () => {
    const make = async () => {
        const env = setup({ memos: pendingMemos(1), wall: 'frozen' });
        env.skin.start();
        await tick();
        drive(env, { to: 160 });
        return env;
    };
    const calm = await make();
    const startled = await make();
    const jelly = startled.skin._world().jellies[0];
    const speedBefore = Math.hypot(jelly.vx, jelly.vy);
    const target = { x: jelly.x - 30, y: jelly.y };
    let now = 160;
    for (let i = 0; i < 6; i++) {
        // 指针每帧移动 20px（约 1250px/s）冲向水母
        drive(startled, { from: now, to: now + 16, extra: { pointer: { x: target.x - 100 + i * 20, y: target.y } } });
        now += 16;
    }
    const after = startled.skin._world().jellies[0];
    assert.ok(Math.hypot(after.vx, after.vy) > speedBefore + 20, '受惊后获得了明显的速度');
    drive(calm, { from: 160, to: 256, extra: { pointer: { x: jelly.x - 30, y: jelly.y } } });
    const still = calm.skin._world().jellies[0];
    assert.ok(Math.hypot(still.vx, still.vy) < Math.hypot(after.vx, after.vy), '指针不动不惊动');
});

test('绘制出错只停掉本次会话的水母皮肤并留一条警告，不抛出；停止后重新启动可重试', async () => {
    const env = setup({ memos: pendingMemos(2) });
    env.skin.start();
    await tick();
    let thrown = 0;
    const broken = new Proxy({}, {
        get: (target, key) => (key === 'createRadialGradient'
            ? () => ({ addColorStop() {} })
            : (key === 'beginPath' ? () => { thrown++; throw new Error('canvas lost'); } : () => {})),
        set: () => true,
    });
    assert.equal(env.skin.frame({ ctx: broken, width: 1280, height: 720, dt: 16, now: 0 }), false);
    assert.equal(thrown, 1);
    assert.equal(env.warnings.length, 1);
    assert.match(env.warnings[0], /canvas lost/);
    assert.equal(env.skin.isActive(), false);
    assert.equal(env.skin.state().failed, true);

    const ctx = recorder();
    assert.equal(env.skin.frame({ ctx, width: 1280, height: 720, dt: 16, now: 16 }), false);
    assert.equal(ctx._calls.length, 0, '故障之后不再碰画布');
    assert.equal(env.warnings.length, 1, '警告只留一次');

    env.skin.stop();
    env.skin.start();
    await tick();
    assert.equal(env.skin.frame({ ctx: noopCtx(), width: 1280, height: 720, dt: 16, now: 0 }), true);
    assert.equal(env.skin.state().failed, false);
});

// ---------- 绘制契约 ----------

function populatedWorld({ lowPower = false, count = 3, width = 1280, height = 720, seed = 5 } = {}) {
    const world = Core.createWorld({ width, height, random: seeded(seed), lowPower });
    Core.reconcile(world, count, { instant: true });
    for (let i = 0; i < 180; i++) Core.step(world, 16, { beat: null, pointer: null });   // 淡入完成
    return world;
}
const SAMPLE_PALETTE = [[112, 205, 255], [170, 111, 255], [79, 239, 194]];

test('draw：amount 为 0 时什么都不画；amount 越大越亮但 alpha 不超过 1', () => {
    const world = populatedWorld();
    const none = recorder();
    Skin.draw(none, world, SAMPLE_PALETTE, 0);
    assert.equal(none._calls.filter(c => c === 'fill' || c === 'stroke').length, 0);

    const maxAlpha = amount => {
        const ctx = recorder();
        Skin.draw(ctx, world, SAMPLE_PALETTE, amount);
        const alphas = [...ctx._styles, ...ctx._stops].map(alphaOf).filter(a => a !== null);
        return Math.max(...alphas);
    };
    const a = maxAlpha(0.3);
    const b = maxAlpha(0.65);
    const c = maxAlpha(1);
    assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
    assert.ok(c <= 1);
    assert.ok(maxAlpha(5) <= 1, '过大的 amount 也不会让 alpha 越界');
});

test('draw：每只水母画一个钟罩（含高光共 2 个椭圆），省流量时没有水管与高光（1 个）', () => {
    for (const [lowPower, perJelly] of [[false, 2], [true, 1]]) {
        const world = populatedWorld({ lowPower, count: 3 });
        const ctx = recorder();
        Skin.draw(ctx, world, SAMPLE_PALETTE, 0.65);
        assert.equal(ctx._calls.filter(c => c === 'ellipse').length, 3 * perJelly, `lowPower=${lowPower}`);
    }
    const normal = recorder();
    Skin.draw(normal, populatedWorld({ lowPower: false }), SAMPLE_PALETTE, 0.65);
    const low = recorder();
    Skin.draw(low, populatedWorld({ lowPower: true }), SAMPLE_PALETTE, 0.65);
    assert.ok(low._calls.length < normal._calls.length * 0.8, '省流量模式的绘制调用明显更少');
});

test('draw：save/restore 配对，不改宿主设好的混合模式，不留下异常状态', () => {
    const world = populatedWorld({ count: 5 });
    const ctx = recorder();
    ctx.globalCompositeOperation = 'screen';
    Skin.draw(ctx, world, SAMPLE_PALETTE, 0.65);
    const count = name => ctx._calls.filter(c => c === name).length;
    assert.ok(count('save') > 0);
    assert.equal(count('save'), count('restore'));
    assert.equal(ctx._state.globalCompositeOperation, 'screen');
    assert.equal(ctx._state.globalAlpha, undefined, '只用带 alpha 的颜色，不动 globalAlpha');
});

test('draw：颜色来自宿主给的调色板（只有一种颜色时全部水母用它）', () => {
    const world = populatedWorld({ count: 4 });
    const ctx = recorder();
    Skin.draw(ctx, world, [[10, 20, 30]], 0.65);
    const bodyStops = ctx._stops.filter(color => color.startsWith('rgba(10,20,30,'));
    assert.ok(bodyStops.length >= 4 * 3, `钟罩渐变的色标使用了调色板颜色（${bodyStops.length}）`);
    const inPalette = ctx._stops.filter(color => paletteKey(color) !== null);
    assert.equal(inPalette.length, 0, '没有混入内置的七彩调色板');
});

test('draw：远的（小的）先画，近的（大的）盖在上面；离开中的水母同样参与排序并随 alpha 变淡', () => {
    const world = populatedWorld({ count: 4 });
    const order = [];
    const ctx = recorder();
    const original = ctx.translate;
    const probe = new Proxy(ctx, {
        get(target, key) {
            if (key === 'translate') return (x, y) => { order.push([x, y]); };
            return target[key];
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    Skin.draw(probe, world, SAMPLE_PALETTE, 0.65);
    void original;
    const bySize = world.jellies.slice().sort((a, b) => a.r - b.r).map(j => [j.x, j.y]);
    assert.deepEqual(order, bySize);

    world.jellies[0].state = 'leaving';
    world.jellies[0].alpha = 0;
    const faded = recorder();
    Skin.draw(faded, world, SAMPLE_PALETTE, 0.65);
    const full = recorder();
    world.jellies[0].alpha = 1;
    Skin.draw(full, world, SAMPLE_PALETTE, 0.65);
    assert.ok(faded._calls.length < full._calls.length, 'alpha 为 0 的水母整只跳过');
});

// ---------- 七彩调色板：每只水母不同的颜色（2026-10-15） ----------

const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (!d) return 0;
    const h = 60 * (max === r ? ((g - b) / d) % 6 : (max === g ? (b - r) / d + 2 : (r - g) / d + 4));
    return h < 0 ? h + 360 : h;
};
const lumaOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('SAMPLE_PALETTE：色位数与核心一致，每项是 0 到 255 的整数三元组，彼此明显不同', () => {
    assert.equal(Skin.PALETTE.length, P.COLORS);
    for (const color of Skin.PALETTE) {
        assert.equal(color.length, 3);
        for (const value of color) assert.ok(Number.isInteger(value) && value >= 0 && value <= 255, JSON.stringify(color));
    }
    for (let i = 0; i < Skin.PALETTE.length; i++) {
        for (let j = i + 1; j < Skin.PALETTE.length; j++) {
            const distance = Math.hypot(...Skin.PALETTE[i].map((v, k) => v - Skin.PALETTE[j][k]));
            assert.ok(distance >= 55, `${i} 与 ${j} 太接近（${distance.toFixed(0)}）`);
        }
    }
});

test('SAMPLE_PALETTE：按色相环顺序绕一圈、间隔不悬殊——核心用“色位编号的环形距离”近似色相距离，这个前提在这里守住', () => {
    const hues = Skin.PALETTE.map(hueOf);
    let total = 0;
    for (let i = 0; i < hues.length; i++) {
        const gap = (hues[(i + 1) % hues.length] - hues[i] + 360) % 360;
        assert.ok(gap >= 25 && gap <= 80, `第 ${i} 位到下一位相差 ${gap.toFixed(0)}°`);
        total += gap;
    }
    assert.ok(Math.abs(total - 360) < 1e-6, `只绕一圈（总和 ${total.toFixed(1)}°）：色位排列没有来回跳`);
});

test('SAMPLE_PALETTE：每种颜色都够亮又不刺眼（screen 混合下才发光），整体亮度不悬殊', () => {
    for (const color of Skin.PALETTE) {
        assert.ok(Math.max(...color) >= 200, `${JSON.stringify(color)} 不够亮`);
        const luma = lumaOf(color);
        assert.ok(luma >= 115 && luma <= 220, `${JSON.stringify(color)} 亮度 ${luma.toFixed(0)} 超出范围`);
    }
    const lumas = Skin.PALETTE.map(lumaOf);
    assert.ok(Math.max(...lumas) / Math.min(...lumas) <= 1.7, '最亮与最暗的亮度之比不超过 1.7');
});

test('draw：默认调色板下同屏每只水母用自己的主色（1 到 8 只；多色的水母另有第二、第三种颜色，见“外观绘制”）', () => {
    for (let count = 1; count <= P.MAX_COUNT; count++) {
        const world = populatedWorld({ count });
        const ctx = recorder();
        Skin.draw(ctx, world, Skin.PALETTE, 0.65);
        const used = new Set(ctx._stops.map(paletteKey).filter(Boolean));
        for (const jelly of world.jellies) assert.ok(used.has(Skin.PALETTE[jelly.color].join(',')), `水母 #${jelly.id} 用它自己的主色`);
        const primaries = new Set(world.jellies.map(j => Skin.PALETTE[j.color].join(',')));
        assert.equal(primaries.size, count, '主色同屏互不相同');
        for (const key of used) {
            const known = world.jellies.some(j => j.look.colors.some(c => Skin.PALETTE[c].join(',') === key));
            assert.ok(known, `${count} 只：${key} 不属于任何一只水母的外观`);
        }
    }
});

test('frame：宿主不传 colors 时用内置七彩调色板，6 个待办 → 6 只颜色各不相同的水母', async () => {
    const env = setup({ memos: pendingMemos(6) });
    env.skin.start();
    await tick();
    const ctx = recorder();
    drive(env, { from: 0, to: 400, ctx });
    const used = new Set(ctx._stops.map(paletteKey).filter(Boolean));
    assert.equal(used.size, 6, [...used].join(' | '));
    assert.equal(env.skin.state().jellies, 6);
});

test('frame：宿主传了 colors 时仍以宿主为准（接口保留）', async () => {
    const env = setup({ memos: pendingMemos(3) });
    env.skin.start();
    await tick();
    const ctx = recorder();
    drive(env, { from: 0, to: 100, ctx, extra: { colors: [[10, 20, 30]] } });
    assert.ok(ctx._stops.some(color => color.startsWith('rgba(10,20,30,')));
    assert.equal(ctx._stops.map(paletteKey).filter(Boolean).length, 0, '没有混入内置调色板');
});

test('待办增减：已经在游的水母绘制用的颜色与外观不变（不闪色）', async () => {
    const pool = pendingMemos(8);
    const env = setup({ memos: pool.slice(0, 4), seed: 3 });
    env.skin.start();
    await tick();
    drive(env, { from: 0, to: 160 });
    const before = new Map(env.skin._world().jellies.map(j => [j.id, [j.color, JSON.stringify(j.look)]]));
    env.fake.emit({ memos: { newValue: pool.slice(0, 6) } });
    drive(env, { from: 160, to: 400 });
    env.fake.emit({ memos: { newValue: pool.slice(0, 2) } });
    drive(env, { from: 400, to: 700 });
    for (const jelly of env.skin._world().jellies) {
        if (before.has(jelly.id)) assert.deepEqual([jelly.color, JSON.stringify(jelly.look)], before.get(jelly.id), `#${jelly.id}`);
    }
    assert.ok(env.skin._world().jellies.some(j => before.has(j.id)), '确有原来的水母留了下来');
});

// ---------- 外观绘制：纯色与多色（2026-10-15） ----------
// 核心给每只水母定一个 look = { kind, colors }（见 jellyfish-core.test.js）；这里守住画法：
//   solid 一种颜色；duo 钟罩主色、触须与体内发光是第二种；blend 钟罩由边缘渐变到中心、触须由根到尖渐变；
//   rainbow 三种颜色沿钟罩横向铺开、触须按横向位置取色。

const PAL = Skin.PALETTE;
const WHITE_RGB = [238, 249, 255];
const mixRgb = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));          // 与 jellyfish.js 的 mix 一致
const lightOf = c => mixRgb(c, WHITE_RGB, 0.5);                                       // 边线、体内发光、纯色触须用的“混白”色
const tentLightOf = c => mixRgb(c, WHITE_RGB, 0.32);                                  // 多色水母的触须少混一点白，颜色才看得出来
const prefixOf = c => `rgba(${c.join(',')},`;
const rgbOf = style => { const m = /^rgba\((\d+),(\d+),(\d+),/.exec(style); return m ? `${m[1]},${m[2]},${m[3]}` : null; };

/** 世界里只留一只水母，强制它的外观；颜色编号就是 Skin.PALETTE 的位置。 */
function oneJelly(look, { lowPower = false, seed = 5 } = {}) {
    const world = populatedWorld({ lowPower, count: 1, seed });
    const jelly = world.jellies[0];
    if (look === undefined) { delete jelly.look; return { world, jelly }; }
    jelly.look = look;
    if (look && Array.isArray(look.colors)) jelly.color = look.colors[0];
    return { world, jelly };
}
function paint(look, options) {
    const { world, jelly } = oneJelly(look, options);
    const ctx = recorder();
    Skin.draw(ctx, world, PAL, 0.65);
    return { ctx, world, jelly };
}
const thinCount = lowPower => (lowPower ? P.TENTACLES_LOW : P.TENTACLES);

test('外观绘制：纯色——光晕、钟罩、触须都是同一种颜色，不创建线性渐变', () => {
    const { ctx } = paint({ kind: 'solid', colors: [5] });
    assert.equal(ctx._gradients.filter(g => g.type === 'linear').length, 0);
    assert.deepEqual([...new Set(ctx._stops.map(paletteKey).filter(Boolean))], [PAL[5].join(',')]);
    const tentacles = ctx._styles.filter(style => style.startsWith(prefixOf(lightOf(PAL[5]))));
    assert.ok(tentacles.length >= thinCount(false) * 3, `主色混白的描边 ${tentacles.length} 条`);
    const colours = new Set(ctx._styles.map(rgbOf).filter(Boolean));
    assert.ok(colours.size <= 3, `纯色画面里出现了 ${colours.size} 种颜色：${[...colours].join(' | ')}`);
});

test('外观绘制：双色——钟罩与光晕是主色，触须与体内发光是第二种颜色', () => {
    const { ctx } = paint({ kind: 'duo', colors: [1, 5] });
    assert.deepEqual([...new Set(ctx._stops.map(paletteKey).filter(Boolean))], [PAL[1].join(',')], '光晕与钟罩渐变只用主色');
    const second = ctx._styles.filter(style => style.startsWith(prefixOf(tentLightOf(PAL[5]))));
    assert.ok(second.length >= thinCount(false) * 3, `第二种颜色的触须描边 ${second.length} 条`);
    assert.ok(ctx._stops.some(stop => stop.startsWith(prefixOf(lightOf(PAL[5])))), '体内发光用第二种颜色');
    assert.equal(ctx._gradients.filter(g => g.type === 'linear').length, 0);
});

test('外观绘制：渐变——钟罩由顶到裙边从主色渐变到第二种颜色，触须顺着往下继续渐变到第二种颜色', () => {
    const { ctx, jelly } = paint({ kind: 'blend', colors: [2, 4] });
    const raw = new Set(ctx._stops.map(paletteKey).filter(Boolean));
    assert.ok(raw.has(PAL[2].join(',')) && raw.has(PAL[4].join(',')), `钟罩用到两种颜色：${[...raw].join(' | ')}`);
    const ombre = ctx._gradients.find(g => g.type === 'linear' && g.stops.length === 2 && g.args[0] === 0 && g.args[2] === 0 && g.stops.every(stop => paletteKey(stop.color)));
    assert.ok(ombre, '有一条竖向的两色线性渐变（色标是调色板原色）');
    assert.ok(ombre.args[1] < 0 && ombre.args[3] > 0 && -ombre.args[1] >= jelly.r * 0.3, `从钟顶（负）到裙边以下（正）：${ombre.args}`);
    assert.deepEqual(ombre.stops.map(stop => stop.offset), [0, 1]);
    assert.deepEqual(ombre.stops.map(stop => paletteKey(stop.color)), [2, 4].map(c => PAL[c].join(',')), '上面是主色、下面是第二种颜色');
    const mixed = mixRgb(PAL[2], PAL[4], 0.45);
    const root = ctx._styles.filter(style => style.startsWith(prefixOf(tentLightOf(mixed))));
    const tip = ctx._styles.filter(style => style.startsWith(prefixOf(tentLightOf(PAL[4]))));
    assert.ok(root.length >= thinCount(false), `触须根部已经带着第二种颜色（两色之间）：${root.length}`);
    assert.ok(tip.length >= thinCount(false), `触须尖端是第二种颜色：${tip.length}`);
    const alphas = style => alphaOf(style);
    assert.ok(Math.max(...root.map(alphas)) > Math.max(...tip.map(alphas)), '越靠近尖端越淡的规律仍然成立');
    const halo = mixRgb(PAL[2], PAL[4], 0.4);
    assert.ok(ctx._stops.some(stop => stop.startsWith(prefixOf(halo))), '光晕的颜色介于两种颜色之间（与双色、纯色的光晕不同）');
});

test('外观绘制：彩带——三种颜色沿钟罩横向铺开（左到右），触须按横向位置取色', () => {
    const { ctx, jelly } = paint({ kind: 'rainbow', colors: [0, 2, 4] });
    const band = ctx._gradients.find(g => g.type === 'linear' && g.stops.length === 3 && g.args[1] === 0 && g.args[3] === 0 && g.stops.every(stop => paletteKey(stop.color)));
    assert.ok(band, '有一条水平的三色线性渐变（色标是调色板原色）');
    assert.ok(band.args[0] < 0 && band.args[2] > 0 && Math.abs(band.args[0] + band.args[2]) < 1e-6, `以钟罩中心为原点左右对称：${band.args}`);
    assert.ok(band.args[2] - band.args[0] >= jelly.r, '覆盖整个钟罩的宽度');
    assert.deepEqual(band.stops.map(stop => stop.offset), [0, 0.5, 1]);
    assert.deepEqual(band.stops.map(stop => paletteKey(stop.color)), [0, 2, 4].map(c => PAL[c].join(',')), '左、中、右依次是三种颜色');
    const colours = new Set(ctx._styles.map(rgbOf).filter(Boolean));
    assert.ok(colours.size >= 6, `触须按位置取色，画面里出现了 ${colours.size} 种不同颜色`);
});

test('外观绘制：彩带——最左边的触须取左色那一段、最右边的取右色那一段（顺序不能反）', () => {
    for (const side of ['left', 'right']) {
        const { world, jelly } = oneJelly({ kind: 'rainbow', colors: [0, 2, 4] });
        const thin = jelly.tentacles.filter(t => t.kind === 'thin');
        const pick = thin.reduce((best, t) => ((side === 'left' ? t.u < best.u : t.u > best.u) ? t : best));
        jelly.tentacles = [pick];                                   // 只留这一条，画面里的触须描边就是它的
        const ctx = recorder();
        Skin.draw(ctx, world, PAL, 0.65);
        const t = (pick.u + 1) / 2;
        const tone = t < 0.5 ? mixRgb(PAL[0], PAL[2], t * 2) : mixRgb(PAL[2], PAL[4], (t - 0.5) * 2);
        const wanted = ctx._styles.filter(style => style.startsWith(prefixOf(tentLightOf(tone))));
        assert.ok(wanted.length >= 3, `${side}：u=${pick.u.toFixed(2)} 的触须三段描边都是 ${tentLightOf(tone)}（找到 ${wanted.length} 条）`);
    }
});

test('外观绘制：多色水母在省流量模式下也保留多种颜色，且不抛错', () => {
    const duo = paint({ kind: 'duo', colors: [1, 5] }, { lowPower: true }).ctx;
    assert.ok(duo._styles.filter(style => style.startsWith(prefixOf(tentLightOf(PAL[5])))).length >= thinCount(true) * 3);
    const blend = paint({ kind: 'blend', colors: [2, 4] }, { lowPower: true }).ctx;
    const raw = new Set(blend._stops.map(paletteKey).filter(Boolean));
    assert.ok(raw.has(PAL[2].join(',')) && raw.has(PAL[4].join(',')));
    const rainbow = paint({ kind: 'rainbow', colors: [0, 2, 4] }, { lowPower: true }).ctx;
    assert.ok(rainbow._gradients.some(g => g.type === 'linear' && g.stops.length === 3));
});

test('外观绘制：外观缺失或不一致时退回纯色，颜色编号越界按调色板长度折回，非法编号取第一色', () => {
    const fallback = paint(undefined).ctx;                                   // 没有 look（旧数据/替身）：按 jelly.color 画纯色
    assert.ok(fallback._stops.map(paletteKey).filter(Boolean).length > 0);
    assert.equal(fallback._gradients.filter(g => g.type === 'linear').length, 0);

    for (const look of [{ kind: 'rainbow', colors: [3] }, { kind: 'duo', colors: [] }, { kind: 'mystery', colors: [1, 2] }, { kind: 'blend' }, null]) {
        const { world, jelly } = oneJelly(look);
        jelly.color = 3;
        const ctx = recorder();
        assert.doesNotThrow(() => Skin.draw(ctx, world, PAL, 0.65), JSON.stringify(look));
        assert.equal(ctx._gradients.filter(g => g.type === 'linear').length, 0, `${JSON.stringify(look)} 按纯色画`);
    }

    const wrapped = paint({ kind: 'duo', colors: [PAL.length + 1, PAL.length * 2 + 5] }).ctx;
    assert.ok(wrapped._stops.some(stop => stop.startsWith(prefixOf(PAL[1]))), '越界编号折回调色板');
    assert.ok(wrapped._styles.some(style => style.startsWith(prefixOf(tentLightOf(PAL[5])))));

    const broken = paint({ kind: 'duo', colors: [NaN, -3] }).ctx;
    assert.ok(broken._stops.some(stop => stop.startsWith(prefixOf(PAL[0]))), '非法编号取调色板第一色');
});

test('外观绘制：宿主给的调色板比外观的颜色数少时也能画（多色退化成同一种颜色），不抛错', () => {
    const { world } = oneJelly({ kind: 'rainbow', colors: [0, 2, 4] });
    const ctx = recorder();
    assert.doesNotThrow(() => Skin.draw(ctx, world, [[10, 20, 30]], 0.65));
    assert.ok(ctx._stops.filter(stop => stop.startsWith('rgba(10,20,30,')).length >= 3);
});

test('外观绘制：多色水母的绘制仍然 save/restore 配对，不动 globalAlpha 与混合模式，每只水母只画一个钟罩', () => {
    for (const look of [{ kind: 'duo', colors: [1, 5] }, { kind: 'blend', colors: [2, 4] }, { kind: 'rainbow', colors: [0, 2, 4] }]) {
        const { world } = oneJelly(look);
        const ctx = recorder();
        ctx.globalCompositeOperation = 'screen';
        Skin.draw(ctx, world, PAL, 0.65);
        const count = name => ctx._calls.filter(c => c === name).length;
        assert.equal(count('save'), count('restore'), look.kind);
        assert.equal(ctx._state.globalCompositeOperation, 'screen');
        assert.equal(ctx._state.globalAlpha, undefined);
        assert.equal(count('ellipse'), 2, `${look.kind}：钟罩轮廓 + 高光`);
    }
});

test('外观绘制：整屏 8 只（纯色多色都有）逐帧绘制不抛错，放大 amount 后 alpha 仍不越界', () => {
    const world = populatedWorld({ count: 8, seed: 12 });
    const kinds = new Set(world.jellies.map(j => j.look.kind));
    assert.ok(kinds.has('solid') && kinds.size >= 3, `外观种类：${[...kinds]}`);
    for (const amount of [0.2, 0.65, 1, 6]) {
        const ctx = recorder();
        assert.doesNotThrow(() => Skin.draw(ctx, world, PAL, amount));
        const alphas = [...ctx._styles, ...ctx._stops].map(alphaOf).filter(a => a !== null);
        assert.ok(alphas.length > 0 && Math.max(...alphas) <= 1 && Math.min(...alphas) >= 0, `amount ${amount}`);
    }
});

test('frame：控制器画出的 6 只水母既有纯色也有多色（线性渐变只来自彩带）', async () => {
    const env = setup({ memos: pendingMemos(6) });
    env.skin.start();
    await tick();
    const ctx = recorder();
    drive(env, { from: 0, to: 400, ctx });
    const kinds = env.skin._world().jellies.map(j => j.look.kind);
    assert.ok(kinds.includes('solid') && kinds.some(kind => kind !== 'solid'), kinds.join(','));
    const hasRainbow = kinds.includes('rainbow');
    assert.equal(ctx._gradients.some(g => g.type === 'linear'), hasRainbow);
});

// ---------- 任务绑定与任务名（2026-10-15） ----------
// 一只水母 = 一个待办：任务名隐约显示在钟罩上方，指针靠近时变清楚；完成哪个任务，走的就是哪只。

const titled = (id, title, patch = {}) => ({ id, title, completed: false, ...patch });

test('frame：每只水母绑定一个任务并带着任务名；完成哪个任务，走的就是哪只；整个过程不写任何存储', async () => {
    const memos = [titled('a', '写周报'), titled('b', '买牛奶'), titled('c', '约牙医')];
    const env = setup({ memos });
    env.skin.start();
    await tick();
    drive(env, { to: 160 });
    const world = env.skin._world();
    assert.deepEqual(world.jellies.map(j => [j.taskId, j.label]), [['a', '写周报'], ['b', '买牛奶'], ['c', '约牙医']]);
    const colours = world.jellies.map(j => j.color);
    env.fake.emit({ memos: { newValue: memos.map(m => (m.id === 'b' ? { ...m, completed: true } : m)) } });
    assert.deepEqual(world.jellies.filter(j => j.state === 'leaving').map(j => j.taskId), ['b']);
    assert.deepEqual(world.jellies.filter(j => j.state !== 'leaving').map(j => j.color), [colours[0], colours[2]], '其余的颜色不变');
    drive(env, { from: 160, to: 160 + Math.ceil((P.LEAVE_S + 0.5) * 1000) });
    assert.deepEqual(env.skin._world().jellies.map(j => j.taskId), ['a', 'c']);
    assert.deepEqual(env.fake.writes, [], '水母皮肤只读任务表，不写任何存储');
});

test('frame：任务改名后水母上的任务名跟着变；新任务来一只新的；名单形状不对时保持原样', async () => {
    const memos = [titled('a', '写周报'), titled('b', '买牛奶')];
    const env = setup({ memos });
    env.skin.start();
    await tick();
    drive(env, { to: 160 });
    const world = env.skin._world();
    const ids = world.jellies.map(j => j.id);
    env.fake.emit({ memos: { newValue: [titled('a', '写周报（改）'), memos[1]] } });
    assert.deepEqual(world.jellies.map(j => j.id), ids, '改名不换水母');
    assert.equal(world.jellies[0].label, '写周报（改）');
    env.fake.emit({ memos: { newValue: [titled('a', '写周报（改）'), memos[1], titled('c', '新任务')] } });
    assert.equal(world.jellies.length, 3);
    assert.equal(world.jellies[2].taskId, 'c');
    env.fake.emit({ memos: { newValue: 'bad' } });
    assert.equal(world.jellies.length, 3, '形状不对的新值被忽略');
});

test('frame：超过上限时按“过期优先、优先级、截止日期”挑任务配水母（与首页任务滚动条一致），今天按本地日期算', async () => {
    const plain = Array.from({ length: 9 }, (_, i) => titled(`p${i}`, `普通 ${i}`));
    const overdue = titled('late', '过期了', { dueDate: '2026-10-01' });
    const urgent = titled('urgent', '紧急', { priority: 'high' });
    const memos = [...plain, urgent, overdue];                // 过期的和紧急的都排在表尾
    const env = setup({ memos, wallMs: new Date(2026, 9, 15, 12, 0, 0).getTime() });
    env.skin.start();
    await tick();
    drive(env, { to: 160 });
    const ids = env.skin._world().jellies.map(j => j.taskId);
    assert.equal(ids.length, P.MAX_COUNT);
    assert.deepEqual(ids.slice(0, 2), ['late', 'urgent'], '过期的最先，其次是高优先级');
    assert.deepEqual(ids.slice(2), plain.slice(0, P.MAX_COUNT - 2).map(m => m.id));

    const sloppy = setup({ memos, wallMs: NaN });             // 时间不可用：不判断过期，也不抛错
    sloppy.skin.start();
    await tick();
    assert.doesNotThrow(() => drive(sloppy, { to: 160 }));
    assert.equal(sloppy.skin._world().jellies[0].taskId, 'urgent');
});

test('draw：任务名画在钟罩上方正中，平时淡、靠近（hot）时亮；颜色取水母主色混白；字号随钟罩大小在 11–15px 内', () => {
    const { world, jelly } = oneJelly({ kind: 'solid', colors: [3] });
    jelly.label = '写周报';
    jelly.hot = 0;
    const quiet = recorder();
    Skin.draw(quiet, world, PAL, 0.65);
    assert.equal(quiet._texts.length, 1);
    const text = quiet._texts[0];
    assert.equal(text.text, '写周报');
    assert.equal(text.align, 'center');
    assert.equal(text.x, jelly.x);
    assert.ok(text.y < jelly.y - Core.bellShape(jelly).h, `在钟罩上方：${text.y} < ${jelly.y}`);
    const size = Number(/(\d+)px/.exec(text.font)[1]);
    assert.ok(size >= 11 && size <= 15, text.font);
    assert.equal(rgbOf(text.style), mixRgb(PAL[3], WHITE_RGB, 0.72).join(','), '主色混白');
    jelly.hot = 1;
    const lit = recorder();
    Skin.draw(lit, world, PAL, 0.65);
    const quietAlpha = alphaOf(text.style);
    const litAlpha = alphaOf(lit._texts[0].style);
    assert.ok(quietAlpha > 0.1 && quietAlpha <= 0.35, `平时隐约：${quietAlpha}`);
    assert.ok(litAlpha >= quietAlpha * 2.5 && litAlpha <= 0.95, `靠近时明显更亮：${quietAlpha} → ${litAlpha}`);
});

test('draw：水母贴着屏幕顶边（甚至已经游出一点）时任务名不会被切掉：纵坐标不小于字号 + 4', () => {
    const { world, jelly } = oneJelly({ kind: 'solid', colors: [3] });
    jelly.label = '写周报';
    for (const y of [60, 20, -10, -400]) {
        jelly.y = y;
        const ctx = recorder();
        Skin.draw(ctx, world, PAL, 0.65);
        const size = Number(/(\d+)px/.exec(ctx._texts[0].font)[1]);
        assert.ok(ctx._texts[0].y >= size + 4, `y=${y} 时任务名的纵坐标 ${ctx._texts[0].y}`);
    }
    jelly.y = 400;
    const normal = recorder();
    Skin.draw(normal, world, PAL, 0.65);
    assert.ok(normal._texts[0].y < 400 - Core.bellShape(jelly).h, '平时仍然在钟罩上方');
});

test('draw：任务名最亮时（hot=1、amount=1）不透明度也封顶 0.95，不糊成一块白', () => {
    const { world, jelly } = oneJelly({ kind: 'solid', colors: [3] });
    jelly.label = '写周报';
    jelly.hot = 1;
    jelly.alpha = 1;
    const ctx = recorder();
    Skin.draw(ctx, world, PAL, 1);
    assert.equal(ctx._texts.length, 1);
    assert.equal(alphaOf(ctx._texts[0].style), 0.95);
});

test('draw：labels:false、没有任务名、空任务名、淡入刚开始、amount 为 0 都不画文字；hot 不是有限数按 0 处理', () => {
    const { world, jelly } = oneJelly({ kind: 'solid', colors: [3] });
    jelly.label = '写周报';
    const count = (options, amount = 0.65) => { const ctx = recorder(); Skin.draw(ctx, world, PAL, amount, options); return ctx._texts.length; };
    assert.equal(count(), 1);
    assert.equal(count({ labels: true }), 1);
    assert.equal(count({ labels: false }), 0);
    assert.equal(count({}, 0), 0);
    jelly.label = '';
    assert.equal(count(), 0);
    jelly.label = undefined;
    assert.equal(count(), 0);
    jelly.label = '写周报';
    jelly.alpha = 0.02;
    assert.equal(count(), 0, '几乎透明时不画');
    jelly.alpha = 1;
    jelly.hot = NaN;
    const ctx = recorder();
    Skin.draw(ctx, world, PAL, 0.65);
    assert.equal(ctx._texts.length, 1);
    assert.ok(Number.isFinite(alphaOf(ctx._texts[0].style)), ctx._texts[0].style);
});

test('draw：画任务名时 save/restore 仍然配对，不动 globalAlpha 与混合模式，每只水母只画一个钟罩', () => {
    const world = populatedWorld({ count: 5 });
    world.jellies.forEach((j, i) => { j.label = `任务 ${i}`; j.hot = i / 4; });
    const ctx = recorder();
    ctx.globalCompositeOperation = 'screen';
    Skin.draw(ctx, world, PAL, 0.65);
    const count = name => ctx._calls.filter(c => c === name).length;
    assert.equal(ctx._texts.length, 5);
    assert.equal(count('save'), count('restore'));
    assert.equal(ctx._state.globalCompositeOperation, 'screen');
    assert.equal(ctx._state.globalAlpha, undefined);
    assert.equal(count('ellipse'), 5 * 2);
});

test('draw：小的（远的）水母连同它的任务名先画，近的盖在上面', () => {
    const world = populatedWorld({ count: 4 });
    world.jellies.forEach(j => { j.label = `任务-${j.id}`; });
    const ctx = recorder();
    Skin.draw(ctx, world, PAL, 0.65);
    const bySize = world.jellies.slice().sort((a, b) => a.r - b.r).map(j => `任务-${j.id}`);
    assert.deepEqual(ctx._texts.map(t => t.text), bySize);
});

test('frame：宿主传 labels:false 时不画任务名；默认画', async () => {
    const env = setup({ memos: [titled('a', '写周报'), titled('b', '买牛奶')] });
    env.skin.start();
    await tick();
    const on = recorder();
    drive(env, { from: 0, to: 400, ctx: on });
    assert.ok(on._texts.length > 0);
    assert.ok(on._texts.every(t => ['写周报', '买牛奶'].includes(t.text)));
    const off = recorder();
    drive(env, { from: 400, to: 800, ctx: off, extra: { labels: false } });
    assert.equal(off._texts.length, 0);
});


// ---------- 抓取并完成任务（2026-10-15） ----------
// 控制器把核心的抓取物理接到“纸篓 + 完成入口”上：拖动超过阈值才出纸篓；松手在纸篓里才去完成；回执 ok 才被吃掉，
// 失败就放回去。纸篓（TaskCrumple.holdBin）和完成入口（memoManager.completeTaskById）都是注入的替身，真实实现在各自的测试里。

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** 纸篓替身：命中区是一个矩形，记录收到的调用；吞下/收起后不再有效。 */
function fakeBin({ zone = { left: 1100, top: 600, right: 1280, bottom: 720 }, mouth = { x: 1200, y: 640 } } = {}) {
    const bin = {
        calls: [],
        active: true,
        contains: (x, y) => bin.active && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom,
        mouth: () => ({ ...mouth }),
        setNear(on) { bin.calls.push(['near', !!on]); },
        gulp() { bin.calls.push(['gulp']); bin.active = false; },
        release() { bin.calls.push(['release']); bin.active = false; },
        isActive: () => bin.active,
    };
    return bin;
}

function grabSetup({ complete, bin = fakeBin(), crumple, memos } = {}) {
    const list = memos || [titled('a', '写周报'), titled('b', '买牛奶'), titled('c', '约牙医')];
    const completes = [];
    const gate = deferred();
    const holds = [];
    const env = setup({
        memos: list,
        crumple: crumple !== undefined ? crumple : { holdBin: () => { holds.push(bin); return bin; } },
        complete: complete || (id => { completes.push(id); return gate.promise; }),
    });
    env.skin.start();
    return { env, list, bin, gate, completes, holds };
}

async function ready(ctx) {
    await tick();
    ctx.clockMs = drive(ctx.env, { to: Math.ceil((P.ENTER_S + 0.3) * 1000) });
    const world = ctx.env.skin._world();
    for (const j of world.jellies) j.homeAt = Infinity;       // 不漫游：位置只由本测试操作决定
    return world;
}

/** 在 (x,y) 放一只水母的位置：把第 index 只摆到指定点（清零速度与倾斜），其余摆到很远的地方，免得互相推开。 */
function placeJelly(world, index, x, y) {
    world.jellies.forEach((j, i) => {
        j.x = i === index ? x : 100 + i * 150; j.y = i === index ? y : 650;
        j.vx = j.vy = 0; j.tilt = 0; j.heading = 0; j.pulseT = 99;
    });
    return world.jellies[index];
}

const frames = (ctx, count, pointer, from) => {
    const start = from !== undefined ? from : ctx.clockMs || 0;
    const end = drive(ctx.env, { from: start, to: start + count * 16, extra: pointer === undefined ? {} : { pointer } });
    ctx.clockMs = end;
    return end;
};

test('抓取：在水母身上按下抓住它（任务绑定的才行）；空地、没有任务编号的水母都抓不到；同时只抓一只', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 1, 640, 360);
    assert.equal(ctx.env.skin.hoverAt(640, 360), true);
    assert.equal(ctx.env.skin.hoverAt(20, 20), false);
    assert.equal(ctx.env.skin.grabAt(20, 20), false);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.equal(ctx.env.skin.grabAt(640, 360), true);
    assert.ok(target.held && target.hot === 1);
    assert.equal(ctx.env.skin.isGrabbing(), true);
    assert.equal(ctx.env.skin.grabAt(640, 360), false, '已经抓着一只');
    assert.equal(ctx.env.skin.hoverAt(640, 360), false, '抓着的时候不再提示“可抓”');
    assert.equal(ctx.holds.length, 0, '没拖动之前不出纸篓');
    // 没有任务编号的水母（任务条目缺 id）抓不到
    const anon = grabSetup({ memos: [{ title: '没有编号', completed: false }] });
    const anonWorld = await ready(anon);
    anonWorld.jellies[0].x = 500; anonWorld.jellies[0].y = 300;
    assert.equal(anonWorld.jellies[0].taskId, null);
    assert.equal(anon.env.skin.hoverAt(500, 300), false);
    assert.equal(anon.env.skin.grabAt(500, 300), false);
});

test('抓取：只是点了一下（没拖动）——水母被放开，不出纸篓、不完成任务，drop 回报“没拖过”', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 6, { x: 603, y: 302 });                    // 手抖了几像素，没到阈值
    assert.equal(ctx.env.skin.drop(603, 302), false);
    assert.equal(target.held, null);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.equal(ctx.holds.length, 0);
    assert.deepEqual(ctx.completes, []);
});

test('抓取：拖动超过阈值才出纸篓（只出一次）；之后每帧告诉纸篓“对准/没对准”', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 640, y: 320 });
    assert.equal(ctx.holds.length, 1, '拖出阈值之后出纸篓');
    assert.deepEqual(ctx.bin.calls[ctx.bin.calls.length - 1], ['near', false]);
    frames(ctx, 4, { x: 640, y: 320 });
    assert.equal(ctx.holds.length, 1, '不重复出');
    frames(ctx, 2, { x: 1200, y: 650 });                    // 进入纸篓范围
    assert.deepEqual(ctx.bin.calls[ctx.bin.calls.length - 1], ['near', true]);
    frames(ctx, 2, { x: 900, y: 400 });                     // 又出来
    assert.deepEqual(ctx.bin.calls[ctx.bin.calls.length - 1], ['near', false]);
    assert.equal(ctx.env.skin.state().jellies, 3);
});

test('抓取：拖到纸篓里松手——水母停在篓口，只调用一次完成入口；回执 ok 后被吃掉并让纸篓“吞”一下，EAT_S 后水母消失', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 1, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });                   // 拖进纸篓范围，水母追上来
    assert.equal(ctx.env.skin.drop(1200, 650), true, '拖过，宿主应当吞掉随后的 click');
    assert.deepEqual(ctx.completes, ['b'], '完成入口只调用一次，参数是这只水母的任务编号');
    assert.ok(target.busy && !target.held, '停在篓口等回执');
    assert.deepEqual(target.busy, { x: 1200, y: 640 });
    assert.equal(ctx.env.skin.isGrabbing(), true, '等回执期间仍算抓取中');
    assert.equal(ctx.env.skin.grabAt(target.x, target.y), false);
    frames(ctx, 30, { x: 20, y: 20 });                       // 指针去了别处，水母仍停在篓口
    assert.ok(Math.hypot(target.x - 1200, target.y - 640) < 3);
    assert.equal(ctx.bin.calls.filter(c => c[0] === 'gulp').length, 0, '回执之前不吞');
    ctx.gate.resolve({ ok: true });
    await tick();
    assert.equal(target.state, 'eating');
    assert.deepEqual(ctx.bin.calls.filter(c => c[0] !== 'near'), [['gulp']]);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    frames(ctx, Math.ceil((P.EAT_S + 0.2) * 1000 / 16), { x: 20, y: 20 });
    assert.ok(!world.jellies.includes(target));
    assert.equal(world.jellies.length, 2);
    assert.deepEqual(ctx.env.fake.writes, [], '皮肤自己不写存储：完成只经由注入的入口');
});

test('抓取：回执是 already（别处已经完成）同样算完成；回执 ok 之后任务名单里该任务消失，不会再冒出新的水母', async () => {
    const ctx = grabSetup({ complete: id => Promise.resolve({ ok: true, already: true }) });
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    await tick();
    assert.equal(target.state, 'eating');
    ctx.env.fake.emit({ memos: { newValue: ctx.list.filter(m => m.id !== 'a') } });
    frames(ctx, 60, { x: 20, y: 20 });
    assert.equal(world.jellies.length, 2);
    assert.deepEqual(world.jellies.map(j => j.taskId).sort(), ['b', 'c']);
});

test('抓取：完成入口返回失败 / 抛错 / 不可用——水母被放回去、纸篓收起（不吞），名单不变时它继续游', async () => {
    const outcomes = [
        ['返回 ok:false', () => Promise.resolve({ ok: false, reason: 'error' })],
        ['拒绝', () => Promise.reject(new Error('boom'))],
        ['同步抛错', () => { throw new Error('sync boom'); }],
        ['返回非对象', () => Promise.resolve(undefined)],
        ['ok 不是 true', () => Promise.resolve({ ok: 'yes' })],
    ];
    for (const [name, complete] of outcomes) {
        const ctx = grabSetup({ complete });
        const world = await ready(ctx);
        const target = placeJelly(world, 0, 600, 300);
        ctx.env.skin.grabAt(600, 300);
        frames(ctx, 3, { x: 700, y: 350 });
        frames(ctx, 40, { x: 1200, y: 650 });
        ctx.env.skin.drop(1200, 650);
        await tick();
        assert.equal(target.state, 'alive', name);
        assert.ok(!target.held && !target.busy, name);
        assert.deepEqual(ctx.bin.calls.filter(c => c[0] !== 'near'), [['release']], name);
        assert.equal(ctx.env.skin.isGrabbing(), false, name);
        assert.ok(world.jellies.includes(target), name);
    }
    const ctx = grabSetup();                                    // 默认入口：没有 memoManager 就当失败
    const world = await ready(ctx);
    const bare = setup({ memos: [titled('a', '写周报')], crumple: { holdBin: () => ctx.bin } });
    bare.skin.start();
    await tick();
    drive(bare, { to: 2000 });
    const lone = bare.skin._world().jellies[0];
    lone.homeAt = Infinity; lone.x = 600; lone.y = 300; lone.vx = lone.vy = 0; lone.tilt = 0;
    bare.skin.grabAt(600, 300);
    drive(bare, { from: 2000, to: 2100, extra: { pointer: { x: 700, y: 350 } } });
    drive(bare, { from: 2100, to: 3000, extra: { pointer: { x: 1200, y: 650 } } });
    bare.skin.drop(1200, 650);
    await tick();
    assert.ok(!lone.busy && lone.state === 'alive', '没有 memoManager：放回去');
    assert.ok(world);
});

test('抓取：默认完成入口是 window.memoManager.completeTaskById（只此一个出口）；回执 ok 就吃掉', async () => {
    const asked = [];
    const memoManager = { completeTaskById: id => { asked.push(id); return Promise.resolve({ ok: true }); } };
    const bin = fakeBin();
    const env = setup({
        memos: [titled('x1', '任务一')],
        window: { performance: { now: () => 0 }, memoManager, TaskCrumple: { holdBin: () => bin } },
    });
    env.skin.start();
    await tick();
    drive(env, { to: 2000 });
    const lone = env.skin._world().jellies[0];
    lone.homeAt = Infinity; lone.x = 600; lone.y = 300; lone.vx = lone.vy = 0; lone.tilt = 0;
    assert.equal(env.skin.grabAt(600, 300), true);
    drive(env, { from: 2000, to: 2100, extra: { pointer: { x: 700, y: 350 } } });
    drive(env, { from: 2100, to: 3000, extra: { pointer: { x: 1200, y: 650 } } });
    env.skin.drop(1200, 650);
    await tick();
    assert.deepEqual(asked, ['x1']);
    assert.equal(lone.state, 'eating');
    assert.deepEqual(env.fake.writes, []);
});

test('抓取：在纸篓外松手——水母放开、纸篓收起、不完成任务；drop 回报“拖过”让宿主吞掉 click', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 2, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 20, { x: 800, y: 400 });
    assert.equal(ctx.env.skin.drop(800, 400), true);
    assert.equal(target.held, null);
    assert.deepEqual(ctx.completes, []);
    assert.deepEqual(ctx.bin.calls.filter(c => c[0] !== 'near'), [['release']]);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.equal(target.state, 'alive');
});

test('抓取：松手位置以“抬起时的指针”为准——拖进过纸篓但抬起时不在里面，不算', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });                    // 在纸篓里
    assert.equal(ctx.env.skin.drop(900, 450), true, '抬起时已经出了纸篓');
    assert.deepEqual(ctx.completes, []);
});

test('抓取：任务名单在等回执时变化（真实的存储事件先于回执到达）——水母不会被当成“该离开”，回执 ok 后正常被吃掉', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    ctx.env.fake.emit({ memos: { newValue: ctx.list.filter(m => m.id !== 'a') } });     // 任务已存成“完成”
    frames(ctx, 10, { x: 20, y: 20 });
    assert.equal(target.state, 'alive', '等回执的水母不被赶走');
    assert.ok(target.busy);
    ctx.gate.resolve({ ok: true });
    await tick();
    assert.equal(target.state, 'eating');
});

test('抓取：完成失败而任务其实已不在名单里（等回执时被别处完成了）——放回去之后按名单离开', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    ctx.env.fake.emit({ memos: { newValue: ctx.list.filter(m => m.id !== 'a') } });
    ctx.gate.resolve({ ok: false, reason: 'missing' });
    await tick();
    assert.equal(target.state, 'leaving', '放手后重新按名单整理');
});

test('抓取：cancel（失焦、页面隐藏、指针被打断）放开被抓着的水母并收起纸篓；等回执时 cancel 无效；没有抓取时无副作用', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    assert.equal(ctx.env.skin.cancel(), false, '没有抓取');
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    assert.equal(ctx.env.skin.cancel(), true);
    assert.equal(target.held, null);
    assert.deepEqual(ctx.bin.calls.filter(c => c[0] !== 'near'), [['release']]);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.deepEqual(ctx.completes, []);
    // 等回执时：已经发出的完成请求不能撤回，cancel 不打断它
    const again = grabSetup();
    const w2 = await ready(again);
    const t2 = placeJelly(w2, 0, 600, 300);
    again.env.skin.grabAt(600, 300);
    frames(again, 3, { x: 700, y: 350 });
    frames(again, 40, { x: 1200, y: 650 });
    again.env.skin.drop(1200, 650);
    assert.equal(again.env.skin.cancel(), false);
    assert.ok(t2.busy);
    again.gate.resolve({ ok: true });
    await tick();
    assert.equal(t2.state, 'eating');
});

test('抓取：等回执超过 BUSY 时限（6 秒）——放回去，纸篓收起；之后晚到的回执不再动画（任务名单变化自会让它离开）', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    frames(ctx, 300, { x: 20, y: 20 });                      // 4.8 秒：还在等
    assert.ok(target.busy);
    frames(ctx, 120, { x: 20, y: 20 });                      // 超过 6 秒
    assert.ok(!target.busy && target.state === 'alive');
    assert.deepEqual(ctx.bin.calls.filter(c => c[0] !== 'near'), [['release']]);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    ctx.gate.resolve({ ok: true });
    await tick();
    assert.equal(target.state, 'alive', '晚到的回执不再把它吃掉');
    assert.equal(ctx.bin.calls.filter(c => c[0] === 'gulp').length, 0);
});

test('抓取：纸篓出不来（没加载 / 被限制 / 抛错）——拖动一开始就把水母放回去，永远不会去完成任务', async () => {
    const variants = [
        ['没有 crumple', null],
        ['holdBin 返回 null', { holdBin: () => null }],
        ['holdBin 抛错', { holdBin: () => { throw new Error('boom'); } }],
        ['没有 holdBin 方法', {}],
    ];
    for (const [name, crumple] of variants) {
        const ctx = grabSetup({ crumple });
        const world = await ready(ctx);
        const target = placeJelly(world, 0, 600, 300);
        assert.equal(ctx.env.skin.grabAt(600, 300), true, name);
        frames(ctx, 3, { x: 700, y: 350 });
        assert.equal(target.held, null, name);
        assert.equal(ctx.env.skin.isGrabbing(), false, name);
        assert.equal(ctx.env.skin.drop(1200, 650), false, name);
        assert.deepEqual(ctx.completes, [], name);
    }
});

test('抓取：stop 时收起纸篓并丢弃抓取；之后晚到的回执不会炸；重启后可以重新抓', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    ctx.env.skin.stop();
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.ok(ctx.bin.calls.some(c => c[0] === 'release'), '纸篓收起');
    ctx.gate.resolve({ ok: true });
    await tick();
    assert.equal(ctx.env.skin.grabAt(600, 300), false, '停止后没有世界，抓不了');
    assert.equal(ctx.env.skin.hoverAt(600, 300), false);
    assert.equal(ctx.env.skin.drop(1, 1), false);
    assert.equal(ctx.env.skin.cancel(), false);
});

test('抓取：世界被重建（省流量开关变化）时，抓着的水母已不存在——丢弃抓取并收起纸篓，不去完成任务', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    assert.equal(ctx.holds.length, 1);
    const end = drive(ctx.env, { from: ctx.clockMs, to: ctx.clockMs + 48, extra: { lowPower: true, pointer: { x: 720, y: 360 } } });
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.ok(ctx.bin.calls.some(c => c[0] === 'release'));
    assert.ok(end > 0);
    assert.equal(ctx.env.skin.drop(1200, 650), false);
    assert.deepEqual(ctx.completes, []);
});

test('抓取：绘制出错导致皮肤停用时同样收起纸篓、丢弃抓取', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    const exploding = new Proxy({}, { get() { throw new Error('canvas gone'); } });
    ctx.env.skin.frame({ ctx: exploding, width: 1280, height: 720, dt: 16, now: ctx.clockMs, amount: 0.65, pointer: { x: 700, y: 350 } });
    assert.equal(ctx.env.skin.isActive(), false);
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.ok(ctx.bin.calls.some(c => c[0] === 'release'));
});

test('抓取：抓着的时候任务被别处删掉（名单里没了）——水母被保护，放手后按名单离开；任务再出现就是新的水母', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    ctx.env.fake.emit({ memos: { newValue: ctx.list.filter(m => m.id !== 'a') } });
    frames(ctx, 5, { x: 610, y: 305 });
    assert.equal(target.state, 'alive');
    assert.ok(target.held);
    ctx.env.skin.cancel();
    assert.equal(target.state, 'leaving');
});

test('抓取：回执 ok 后名单先去掉这个任务——存储事件还没到，也不会为同一个任务再生出一只水母；以后以存储事件为准', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const target = placeJelly(world, 0, 600, 300);
    ctx.env.skin.grabAt(600, 300);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    ctx.gate.resolve({ ok: true });
    await tick();
    assert.equal(target.state, 'eating');
    assert.equal(ctx.env.skin.state().pending, 2, '名单里先去掉了已完成的任务');
    frames(ctx, Math.ceil((P.EAT_S + 0.3) * 1000 / 16), { x: 20, y: 20 });
    assert.deepEqual(world.jellies.map(j => j.taskId).sort(), ['b', 'c'], '没有再冒出任务 a 的新水母');
    // 之后真实的存储事件（任务已完成）与名单一致，仍然没有 a
    ctx.env.fake.emit({ memos: { newValue: ctx.list.map(m => (m.id === 'a' ? { ...m, completed: true } : m)) } });
    frames(ctx, 20, { x: 20, y: 20 });
    assert.deepEqual(world.jellies.map(j => j.taskId).sort(), ['b', 'c']);
    // 如果存储其实没存上（后来的事件里任务 a 仍未完成），它会作为新水母回来——以存储为准
    ctx.env.fake.emit({ memos: { newValue: ctx.list } });
    frames(ctx, 20, { x: 20, y: 20 });
    assert.deepEqual(world.jellies.map(j => j.taskId).sort(), ['a', 'b', 'c']);
});

test('抓取：抓着一只、或有一只停在纸篓口等回执时，指针移到另一只水母上也不提示“可抓”（同时只能有一次抓取）；结束后恢复', async () => {
    const ctx = grabSetup();
    const world = await ready(ctx);
    const a = placeJelly(world, 0, 400, 300);
    const b = world.jellies[1];
    b.x = 900; b.y = 400; b.vx = b.vy = 0; b.tilt = 0; b.heading = 0; b.pulseT = 99;
    assert.equal(ctx.env.skin.hoverAt(900, 400), true, '没有抓取时另一只可抓');
    assert.equal(ctx.env.skin.grabAt(400, 300), true);
    assert.equal(ctx.env.skin.hoverAt(900, 400), false, '抓着一只时，另一只不提示可抓');
    assert.equal(ctx.env.skin.grabAt(900, 400), false);
    frames(ctx, 3, { x: 700, y: 350 });
    frames(ctx, 40, { x: 1200, y: 650 });
    ctx.env.skin.drop(1200, 650);
    assert.ok(a.busy, '停在纸篓口等回执');
    assert.equal(ctx.env.skin.hoverAt(900, 400), false, '等回执时也不提示');
    ctx.gate.resolve({ ok: false });
    await tick();
    b.x = 900; b.y = 400;
    assert.equal(ctx.env.skin.isGrabbing(), false);
    assert.equal(ctx.env.skin.hoverAt(900, 400), true, '结束后恢复');
});


// ---------- 夜晚荧光与完成庆祝（2026-10-15） ----------

/** 画一帧 draw 并返回记录：用于比较白天和夜晚的差别。 */
function paintFrame(night, { lowPower = false, setupWorld = null } = {}) {
    const world = populatedWorld({ lowPower, count: 3 });
    if (setupWorld) setupWorld(world);
    const ctx = recorder();
    Skin.draw(ctx, world, SAMPLE_PALETTE, 0.65, { labels: false, night });
    return { ctx, world };
}

const alphasIn = styles => styles.map(style => Number((String(style).match(/,([0-9.]+)\)$/) || [])[1])).filter(Number.isFinite);

test('夜晚荧光：夜里光晕更大更亮、体内发光更强、浮游生物更亮偏青绿；night 为 0（缺省）时与白天完全一样', () => {
    const day = paintFrame(0);
    const defaults = paintFrame(undefined);
    assert.deepEqual(day.ctx._stops, defaults.ctx._stops, '缺省就是白天');
    const night = paintFrame(1);
    const radii = ({ ctx }) => ctx._gradients.filter(g => g.type === 'radial').map(g => g.args[5] ?? g.args[2]);
    const maxRadius = Math.max(...radii(night));
    assert.ok(maxRadius > Math.max(...radii(day)) * 1.2, '夜里光晕半径更大');
    const peak = ({ ctx }) => Math.max(...ctx._gradients.filter(g => g.type === 'radial').flatMap(g => g.stops.map(stop => Number((stop.color.match(/,([0-9.]+)\)$/) || [])[1]) || 0)));
    assert.ok(peak(night) > peak(day), '夜里最亮的发光更亮');
    assert.ok(night.ctx._styles.some(style => /rgba\(15\d,25\d,23\d/.test(style) || /rgba\(1[5-9]\d,2[45]\d,2[2-3]\d/.test(style)), '浮游生物偏青绿');
    assert.ok(!day.ctx._styles.some(style => /rgba\(150,255,232/.test(style)), '白天没有青绿色浮游生物');
    // 所有 alpha 仍在 [0, 1]
    for (const value of alphasIn(night.ctx._styles)) assert.ok(value >= 0 && value <= 1, String(value));
});

test('夜晚荧光：night 越大越亮，单调不倒退；非有限数按白天；超出 [0,1] 夹紧', () => {
    const peakOf = night => {
        const { ctx } = paintFrame(night);
        return Math.max(...ctx._gradients.filter(g => g.type === 'radial').flatMap(g => g.stops.map(stop => Number((stop.color.match(/,([0-9.]+)\)$/) || [])[1]) || 0)));
    };
    const values = [0, 0.25, 0.5, 0.75, 1].map(peakOf);
    for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1] - 1e-9, `night 增大不应变暗：${values}`);
    assert.ok(values[4] > values[0]);
    assert.equal(peakOf(NaN), peakOf(0));
    assert.equal(peakOf('x'), peakOf(0));
    assert.equal(peakOf(5), peakOf(1));
    assert.equal(peakOf(-3), peakOf(0));
});

test('夜晚荧光：省流量模式不画光晕但体内发光仍增强，不抛错；save/restore 仍然配对', () => {
    const day = paintFrame(0, { lowPower: true });
    const night = paintFrame(1, { lowPower: true });
    const radialCount = ({ ctx }) => ctx._gradients.filter(g => g.type === 'radial').length;
    assert.equal(radialCount(night), radialCount(day), '省流量不增加光晕渐变');
    const calls = night.ctx._calls;
    assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length);
});

test('夜晚荧光：夜里颜色只推向深海蓝紫一点点——同屏水母的颜色仍然彼此分得开', () => {
    const colorsOf = night => {
        const world = populatedWorld({ count: 8, seed: 9 });
        const ctx = recorder();
        Skin.draw(ctx, world, Skin.PALETTE, 0.65, { labels: false, night });
        return world.jellies.map(jelly => {
            const base = Skin.PALETTE[jelly.color];
            const k = 0.16 * night;
            return base.map((v, i) => Math.round(v + ([96, 132, 255][i] - v) * k));
        });
    };
    const night = colorsOf(1);
    const keys = new Set(night.map(color => color.join(',')));
    assert.equal(keys.size, 8, '夜里八只颜色仍各不相同');
    const dayColors = colorsOf(0);
    night.forEach((color, index) => {
        const distance = Math.hypot(...color.map((v, i) => v - dayColors[index][i]));
        assert.ok(distance < 90, `推向蓝紫的幅度有界：${distance}`);
    });
});

test('frame：夜晚程度由本机时间决定——20 点后与 6 点前夜里更亮，中午是白天；night:false 或设置关闭时永远是白天；nightHour 可覆盖', async () => {
    const peakAt = async options => {
        const env = setup({ memos: [titled('a', 'x'), titled('b', 'y')], ...(options.wallMs !== undefined ? { wallMs: options.wallMs } : {}) });
        env.skin.start();
        await tick();
        const ctx = recorder();
        drive(env, { from: 0, to: 2200, extra: { night: undefined, labels: false, ...(options.extra || {}) }, ctx: noopCtx() });
        env.clock.now = 2300;
        env.skin.frame({ ctx, width: 1280, height: 720, dt: 16, now: 2300, amount: 0.65, labels: false, ...(options.frame || {}) });
        return Math.max(...ctx._gradients.filter(g => g.type === 'radial').flatMap(g => g.stops.map(stop => Number((stop.color.match(/,([0-9.]+)\)$/) || [])[1]) || 0)));
    };
    const at = (h, m = 0) => new Date(2026, 9, 15, h, m, 0).getTime();     // 本地时间：与运行机器的时区无关
    const noon = await peakAt({ wallMs: at(12), frame: {} });
    const night = await peakAt({ wallMs: at(23), frame: {} });
    const earlyMorning = await peakAt({ wallMs: at(3), frame: {} });
    const dusk = await peakAt({ wallMs: at(19, 30), frame: {} });
    assert.ok(night > noon, '夜里更亮');
    assert.ok(Math.abs(night - earlyMorning) < 1e-9, '凌晨与夜里一样');
    assert.ok(dusk > noon && dusk < night, '19:30 在渐变之中');
    assert.equal(await peakAt({ wallMs: at(23), frame: { night: false } }), noon, '设置关闭：夜里也一样是白天');
    assert.equal(await peakAt({ wallMs: at(12), frame: { nightHour: 23 } }), night, 'nightHour 覆盖时钟');
    assert.equal(await peakAt({ wallMs: NaN, frame: {} }), noon, '时间不可用按白天处理');
});

test('完成庆祝：回执 ok 才在纸篓口放气泡与光涟漪，颜色取自被吃掉的水母；失败、超时、放回去都不庆祝', async () => {
    const ok = grabSetup();
    const world = await ready(ok);
    const target = placeJelly(world, 1, 600, 300);
    ok.env.skin.grabAt(600, 300);
    frames(ok, 3, { x: 700, y: 350 });
    frames(ok, 40, { x: 1200, y: 650 });
    ok.env.skin.drop(1200, 650);
    assert.equal(world.fx.bubbles.length, 0, '回执之前不庆祝');
    ok.gate.resolve({ ok: true });
    await tick();
    assert.equal(world.fx.bubbles.length, P.BURST_BUBBLES);
    assert.equal(world.fx.rings.length, 1);
    assert.ok(world.fx.bubbles.every(b => b.x > 1150 && b.x < 1250 && b.color === target.color && b.y === 640), '从篓口出发，颜色来自水母');
    assert.ok(world.fx.bubbles.every(b => b.t < 0), '先等水母飞到篓口才出现');
    frames(ok, Math.ceil((P.BURST_DELAY_S + P.BURST_LIFE_S * 1.2 + 0.2) * 1000 / 16), { x: 20, y: 20 });
    assert.equal(world.fx.bubbles.length, 0, '寿命结束后清空');
    assert.equal(world.fx.rings.length, 0);
    assert.deepEqual(ok.env.fake.writes, [], '庆祝不写任何存储');

    for (const [name, complete] of [['失败', () => Promise.resolve({ ok: false })], ['抛错', () => Promise.reject(new Error('x'))], ['非 true', () => Promise.resolve({ ok: 'yes' })]]) {
        const ctx = grabSetup({ complete });
        const w = await ready(ctx);
        placeJelly(w, 0, 600, 300);
        ctx.env.skin.grabAt(600, 300);
        frames(ctx, 3, { x: 700, y: 350 });
        frames(ctx, 40, { x: 1200, y: 650 });
        ctx.env.skin.drop(1200, 650);
        await tick();
        assert.equal(w.fx.bubbles.length + w.fx.rings.length, 0, `${name}：不庆祝`);
    }
    const dropped = grabSetup();
    const w2 = await ready(dropped);
    placeJelly(w2, 0, 600, 300);
    dropped.env.skin.grabAt(600, 300);
    frames(dropped, 3, { x: 700, y: 350 });
    frames(dropped, 20, { x: 300, y: 200 });
    dropped.env.skin.drop(300, 200);
    assert.equal(w2.fx.bubbles.length + w2.fx.rings.length, 0, '松手不在纸篓里：不庆祝');
});

test('完成庆祝的绘制：延迟期间一笔不画；出现后气泡与涟漪在 alpha 内逐渐淡出；没有庆祝时不多画任何东西；画完 save/restore 仍配对', () => {
    const idle = paintFrame(0);
    const baseline = idle.ctx._calls.filter(c => c === 'arc').length;
    const delayed = paintFrame(0, { setupWorld: w => Core.celebrate(w, 600, 400, { color: 2 }) });
    assert.equal(delayed.ctx._calls.filter(c => c === 'arc').length, baseline, '延迟期间（t<0）不画');
    const shown = paintFrame(0, { setupWorld: w => { Core.celebrate(w, 600, 400, { color: 2, delay: 0 }); for (let i = 0; i < 10; i++) Core.step(w, 16, {}); } });
    assert.ok(shown.ctx._calls.filter(c => c === 'arc').length > baseline + 5, '出现后画气泡和涟漪');
    for (const value of alphasIn(shown.ctx._styles)) assert.ok(value >= 0 && value <= 1, String(value));
    const calls = shown.ctx._calls;
    assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length);
    const late = paintFrame(0, { setupWorld: w => { Core.celebrate(w, 600, 400, { delay: 0 }); for (let i = 0; i < 50; i++) Core.step(w, 40, {}); } });
    assert.equal(late.ctx._calls.filter(c => c === 'arc').length, baseline, '全部淡出后与没有庆祝时一样');
});

test('完成庆祝的颜色取宿主调色板：色位编号越界折回、非法编号取第一色，不抛错', () => {
    for (const color of [0, 5, 99, -3]) {
        const { ctx } = paintFrame(0, { setupWorld: w => { Core.celebrate(w, 300, 300, { color, delay: 0 }); for (let i = 0; i < 6; i++) Core.step(w, 16, {}); } });
        assert.ok(ctx._calls.includes('arc'));
    }
    const odd = paintFrame(0, { setupWorld: w => { Core.celebrate(w, 300, 300, { color: 'x', delay: 0 }); Core.step(w, 16, {}); } });
    assert.ok(odd.ctx._calls.includes('arc'));
});

test('夜晚荧光：纯色水母的光晕颜色 = 主色按 16% 推向深海蓝紫（精确值），白天则是原色；多色水母的各种颜色同样只推一点', () => {
    const NIGHT_BLUE = [96, 132, 255];
    for (const look of [{ kind: 'solid', colors: [3] }, { kind: 'duo', colors: [1, 5] }]) {
        const day = oneJelly(look); const night = oneJelly(look);
        const dayCtx = recorder(); const nightCtx = recorder();
        Skin.draw(dayCtx, day.world, PAL, 0.65, { labels: false, night: 0 });
        Skin.draw(nightCtx, night.world, PAL, 0.65, { labels: false, night: 1 });
        const haloOf = ctx => rgbOf(ctx._gradients.find(g => g.type === 'radial' && g.args[5] > 100).stops[0].color);
        const primary = PAL[look.colors[0]];
        assert.equal(haloOf(dayCtx), primary.join(','), `${look.kind}：白天是原色`);
        assert.equal(haloOf(nightCtx), mixRgb(primary, NIGHT_BLUE, 0.16).join(','), `${look.kind}：夜里推向蓝紫 16%`);
    }
    // 半夜程度按比例：night 0.5 推 8%
    const half = oneJelly({ kind: 'solid', colors: [3] });
    const ctx = recorder();
    Skin.draw(ctx, half.world, PAL, 0.65, { labels: false, night: 0.5 });
    assert.equal(rgbOf(ctx._gradients.find(g => g.type === 'radial' && g.args[5] > 100).stops[0].color), mixRgb(PAL[3], NIGHT_BLUE, 0.08).join(','));
});

test('夜晚荧光：浮游生物夜里更亮（总不透明度更大）且改用青绿色；白天保持原来的浅蓝', () => {
    const sums = night => {
        const world = populatedWorld({ count: 0 });
        const ctx = recorder();
        Skin.draw(ctx, world, PAL, 0.65, { labels: false, night });
        const total = prefix => ctx._styles.filter(style => style.startsWith(prefix)).reduce((sum, style) => sum + Number(/,([0-9.]+)\)$/.exec(style)[1]), 0);
        return { day: total('rgba(200,238,255,'), night: total('rgba(150,255,232,'), count: ctx._styles.length };
    };
    const day = sums(0); const night = sums(1);
    assert.ok(day.day > 0 && day.night === 0, '白天只有浅蓝浮游生物');
    assert.ok(night.night > day.day * 1.5 && night.day === 0, `夜里更亮且换色：${day.day} → ${night.night}`);
});
