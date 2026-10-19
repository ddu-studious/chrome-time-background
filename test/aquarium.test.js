// 水族馆控制器：存储读写（串行、白名单、失败回滚）、托盘与居民列表、网兜与抓取状态机、绘制契约。
// 用替身 chrome.storage / 假 DOM / 记录型画布驱动真实的控制器代码；这是业务替身层，不等同于真实 Chrome 扩展验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');
const Aquarium = require('../js/aquarium.js');

const P = Core.PARAMS;
const KEY = 'aquariumV1';
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

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

// ---------- 替身 ----------

function fakeChrome(initial) {
    const state = { data: initial === undefined ? {} : { [KEY]: initial }, failGet: false, failSet: false, gets: 0, sets: [], listeners: [], gate: null };
    const local = {
        async get(key) {
            state.gets++;
            if (state.failGet) throw new Error('get failed');
            return key in state.data ? { [key]: JSON.parse(JSON.stringify(state.data[key])) } : {};
        },
        async set(obj) {
            if (state.gate) await state.gate;
            if (state.failSet) throw new Error('set failed');
            state.sets.push(JSON.parse(JSON.stringify(obj)));
            Object.assign(state.data, JSON.parse(JSON.stringify(obj)));
        },
    };
    const chrome = {
        storage: {
            local,
            onChanged: {
                addListener: fn => state.listeners.push(fn),
                removeListener: fn => { state.listeners = state.listeners.filter(x => x !== fn); },
            },
        },
    };
    return { chrome, state, emit(newValue) { for (const fn of state.listeners) fn({ [KEY]: { newValue } }, 'local'); } };
}

function makeDom() {
    class El {
        constructor(tag) {
            this.tagName = String(tag).toUpperCase();
            this.children = []; this.parent = null; this.attrs = {}; this.listeners = {};
            this.style = {}; this.classes = new Set(); this.disabled = false; this.hidden = false; this._text = ''; this.rect = null;
        }
        get className() { return [...this.classes].join(' '); }
        set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
        get classList() {
            const self = this;
            return {
                add: v => self.classes.add(v), remove: v => self.classes.delete(v), contains: v => self.classes.has(v),
                toggle(v, on) { (on === undefined ? !self.classes.has(v) : on) ? self.classes.add(v) : self.classes.delete(v); },
            };
        }
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
        set textContent(v) { this._text = String(v); this.children = []; }
        set innerHTML(v) { throw new Error('不得使用 innerHTML'); }
        set outerHTML(v) { throw new Error('不得使用 outerHTML'); }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
        removeAttribute(k) { delete this.attrs[k]; }
        appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; }
        removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
        replaceChildren(...nodes) { for (const c of this.children) c.parent = null; this.children = []; for (const n of nodes) this.appendChild(n); }
        remove() { if (this.parent) this.parent.removeChild(this); }
        addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
        removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(x => x !== fn); }
        click() { if (this.disabled) return; for (const fn of this.listeners.click || []) fn({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); }
        getBoundingClientRect() {
            const r = this.rect || { left: 0, top: 0, width: 0, height: 0 };
            return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height };
        }
        contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
    }
    const docListeners = {};
    const body = new El('body');
    const document = {
        body,
        createElement: tag => new El(tag),
        addEventListener(name, fn) { (docListeners[name] = docListeners[name] || []).push(fn); },
        removeEventListener(name, fn) { docListeners[name] = (docListeners[name] || []).filter(x => x !== fn); },
    };
    const walk = (node, out = []) => { out.push(node); for (const c of node.children) walk(c, out); return out; };
    const findAll = (pred, root = body) => walk(root).filter(pred);
    return { document, body, docListeners, findAll, El };
}

const ctxProxy = () => {
    const calls = [];
    const state = {};
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => {
                calls.push(String(key));
                if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop() {} };
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    return ctx;
};

const entry = (species, id) => ({ id, species, addedAt: 1000 });

async function make({ stored, lowPower = false, dom = true, random = seeded(), wall, env: extraEnv, mod = Aquarium } = {}) {
    const fc = fakeChrome(stored);
    const d = makeDom();
    let clock = 1700000000000;
    const warns = [];
    const aq = mod.create(Object.assign({
        chrome: fc.chrome, document: dom ? d.document : null, window: {},
        random, wall: wall || (() => ++clock), warn: m => warns.push(m), now: () => 0,
        palette: [[255, 0, 0], [255, 150, 50], [240, 220, 70], [90, 230, 100], [80, 240, 190], [110, 200, 255], [170, 110, 255], [245, 105, 225]],
    }, extraEnv));
    aq.start();
    await settle();
    const ctx = ctxProxy();
    const frame = (extra = {}) => aq.frame(Object.assign({ ctx, width: 1280, height: 720, dt: 16, pointer: null, lowPower, amount: 0.65, bells: [] }, extra));
    return { aq, fc, d, ctx, frame, warns };
}

// ---------- 存储 ----------

test('start：合法数据成为条目；没有数据是空；读取阶段不写存储', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('neon', 'a1'), entry('clown', 'b2')] } });
    assert.deepEqual(t.aq.entries().map(e => e.id), ['a1', 'b2']);
    assert.equal(t.fc.state.sets.length, 0);
    const empty = await make({});
    assert.deepEqual(empty.aq.entries(), []);
    assert.equal(empty.fc.state.sets.length, 0);
});

test('start：损坏或含未知种类的数据只丢弃坏条目，不写回；整体不是对象当空，也不写回', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('neon', 'a1'), { id: 'x', species: 'dragon', addedAt: 1 }, null, entry('puffer', 'a1')] } });
    assert.deepEqual(t.aq.entries().map(e => e.id), ['a1']);
    assert.equal(t.fc.state.sets.length, 0, '读取阶段绝不写存储');
    for (const bad of ['oops', 42, [], { v: 1 }, { v: 1, fish: 'x' }, { v: 2, fish: [entry('neon', 'z')] }]) {
        const b = await make({ stored: bad });
        assert.deepEqual(b.aq.entries(), [], `坏数据 ${JSON.stringify(bad)} 当空`);
        assert.equal(b.fc.state.sets.length, 0);
    }
});

test('start：读取失败 → 空水族馆，add/remove 拒绝（reason: storage）且不写，避免覆盖原数据；恢复读取后可用', async () => {
    const fc = fakeChrome({ v: 1, fish: [entry('neon', 'keep')] });
    fc.state.failGet = true;
    const aq = Aquarium.create({ chrome: fc.chrome, document: makeDom().document, random: seeded(), wall: () => 1, warn() {} });
    aq.start();
    await settle();
    assert.deepEqual(aq.entries(), []);
    assert.deepEqual(await aq.add('clown'), { ok: false, reason: 'storage' });
    assert.deepEqual(await aq.remove('keep'), { ok: false, reason: 'storage' });
    assert.equal(fc.state.sets.length, 0);
    assert.deepEqual(fc.state.data[KEY].fish.map(e => e.id), ['keep'], '原数据原样保留');
    fc.state.failGet = false;
    const r = await aq.add('clown');
    assert.equal(r.ok, true);
    assert.deepEqual(fc.state.data[KEY].fish.map(e => e.id).sort().length, 2, '恢复后在原数据上追加，不是覆盖');
    assert.ok(fc.state.data[KEY].fish.some(e => e.id === 'keep'));
});

test('add：写入 aquariumV1，id 与时间合法；并发两次都生效；读取最新值再改（别的标签页先加的不会被覆盖）', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('neon', 'a1')] } });
    // 模拟别的标签页在本页不知情时加了一条
    t.fc.state.data[KEY] = { v: 1, fish: [entry('neon', 'a1'), entry('angel', 'other')] };
    const [r1, r2] = await Promise.all([t.aq.add('clown'), t.aq.add('puffer')]);
    assert.equal(r1.ok, true); assert.equal(r2.ok, true);
    const saved = t.fc.state.data[KEY];
    assert.equal(saved.v, 1);
    assert.equal(saved.fish.length, 4);
    assert.deepEqual(saved.fish.map(e => e.species).sort(), ['angel', 'clown', 'neon', 'puffer']);
    for (const e of saved.fish) { assert.match(e.id, /^[A-Za-z0-9_-]{1,40}$/); assert.ok(Number.isFinite(e.addedAt) && e.addedAt >= 0); }
    assert.equal(new Set(saved.fish.map(e => e.id)).size, 4);
    assert.equal(t.aq.entries().length, 4);
});

test('add：条目满、大型满、渲染条数放不下、种类未知 → 对应 reason 且不写', async () => {
    const full = Array.from({ length: P.MAX_ENTRIES }, (_, i) => entry('clown', `c${i}`));
    const a = await make({ stored: { v: 1, fish: full } });
    assert.deepEqual(await a.aq.add('clown'), { ok: false, reason: 'full' });
    const b = await make({ stored: { v: 1, fish: [entry('manta', 'm1'), entry('whaleshark', 'w1')] } });
    assert.deepEqual(await b.aq.add('manta'), { ok: false, reason: 'large' });
    const c = await make({ stored: { v: 1, fish: Array.from({ length: 8 }, (_, i) => entry('neon', `n${i}`)) } });
    assert.deepEqual(await c.aq.add('neon'), { ok: false, reason: 'render' }, '8 个群居已是 40 条，再加放不下');
    assert.deepEqual(await c.aq.add('kraken'), { ok: false, reason: 'unknown' });
    for (const t of [a, b, c]) assert.equal(t.fc.state.sets.length, 0);
});

test('add：写入失败 → 返回 storage、条目与鱼都不变；之后能正常再放', async () => {
    const t = await make({});
    t.frame();
    t.fc.state.failSet = true;
    assert.deepEqual(await t.aq.add('clown'), { ok: false, reason: 'storage' });
    assert.deepEqual(t.aq.entries(), []);
    t.frame();
    assert.equal(t.aq._world().fish.length, 0);
    t.fc.state.failSet = false;
    assert.equal((await t.aq.add('clown')).ok, true);
    assert.equal(t.aq.entries().length, 1);
});

test('remove：写入成功后条目消失、鱼淡出；失败 → 条目还在、鱼回来', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1'), entry('angel', 'a1')] } });
    t.frame();
    const world = t.aq._world();
    assert.equal(world.fish.length, 2);
    assert.deepEqual(await t.aq.remove('c1'), { ok: true });
    assert.deepEqual(t.fc.state.data[KEY].fish.map(e => e.id), ['a1']);
    assert.deepEqual(t.aq.entries().map(e => e.id), ['a1']);
    for (let i = 0; i < 30; i++) t.frame({ dt: 50 });
    assert.deepEqual(t.aq._world().fish.map(f => f.entry), ['a1']);

    t.fc.state.failSet = true;
    assert.deepEqual(await t.aq.remove('a1'), { ok: false, reason: 'storage' });
    assert.deepEqual(t.aq.entries().map(e => e.id), ['a1'], '写入失败条目还在');
    for (let i = 0; i < 30; i++) t.frame({ dt: 50 });
    assert.ok(t.aq._world().fish.some(f => f.entry === 'a1' && f.state !== 'leaving'), '鱼回来了');
    assert.deepEqual(await t.aq.remove('nope'), { ok: false, reason: 'missing' });
});

test('别的标签页改了存储：本页条目与鱼跟上（storage.onChanged）；停止后监听移除', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    t.frame();
    assert.equal(t.fc.state.listeners.length, 1);
    t.fc.emit({ v: 1, fish: [entry('clown', 'c1'), entry('angel', 'a2')] });
    await settle();
    assert.deepEqual(t.aq.entries().map(e => e.id), ['c1', 'a2']);
    t.frame();
    assert.equal(t.aq._world().fish.filter(f => f.state !== 'leaving').length, 2);
    t.aq.stop();
    assert.equal(t.fc.state.listeners.length, 0);
});

// ---------- 托盘与居民列表 ----------

const buttons = t => t.d.findAll(n => n.tagName === 'BUTTON');
const byLabel = (t, label) => buttons(t).find(b => b.getAttribute('aria-label') === label);

test('托盘：每个种类一个放入按钮；点击放入；满额时按钮禁用并有说明；全部用 createElement、有无障碍文字', async () => {
    const t = await make({});
    const species = buttons(t).filter(b => (b.getAttribute('aria-label') || '').startsWith('放入'));
    assert.equal(species.length, Core.SPECIES.length);
    for (const spec of Core.SPECIES) assert.ok(byLabel(t, `放入${spec.name}`), `缺少 ${spec.name}`);
    assert.ok(buttons(t).some(b => /水族馆/.test(b.getAttribute('aria-label') || '')), '有展开托盘的主按钮');

    byLabel(t, '放入小丑鱼').click();
    await settle();
    assert.equal(t.aq.entries().length, 1);
    assert.equal(t.fc.state.data[KEY].fish[0].species, 'clown');

    const full = Array.from({ length: P.MAX_ENTRIES }, (_, i) => entry('clown', `c${i}`));
    const f = await make({ stored: { v: 1, fish: full } });
    const btn = byLabel(f, '放入河豚');
    assert.equal(btn.disabled, true);
    assert.ok(/满/.test(btn.getAttribute('title') || ''), '禁用时给出原因');
    assert.ok(f.d.findAll(n => n.getAttribute('role') === 'status').length > 0);
});

test('居民列表：每条一个“捞出”按钮，点击等同 remove（写入后列表更新）；空时有提示', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1'), entry('angel', 'a1')] } });
    const list = t.d.findAll(n => n.classes.has('aq-list'))[0];
    assert.ok(list);
    const out = buttons(t).filter(b => (b.getAttribute('aria-label') || '').startsWith('捞出'));
    assert.equal(out.length, 2);
    out[0].click();
    await settle();
    assert.deepEqual(t.fc.state.data[KEY].fish.map(e => e.id), ['a1']);
    assert.equal(buttons(t).filter(b => (b.getAttribute('aria-label') || '').startsWith('捞出')).length, 1);
    buttons(t).find(b => (b.getAttribute('aria-label') || '').startsWith('捞出')).click();
    await settle();
    assert.ok(/还没有/.test(list.textContent), '空列表提示');
});

test('describeEntries：同一种出现多个时按先后编号（#1 #2…），只有一个时不编号；未知种类与坏条目跳过；群居标出条数', () => {
    const out = Aquarium.describeEntries([entry('clown', 'c1'), entry('neon', 'n1'), entry('clown', 'c2'), entry('kraken', 'k'), null, { species: 'clown' }, entry('clown', 'c3'), entry('angel', 'a1')]);
    assert.deepEqual(out.map(o => o.id), ['c1', 'n1', 'c2', 'c3', 'a1']);
    assert.deepEqual(out.map(o => o.label), ['小丑鱼 #1', '霓虹灯鱼', '小丑鱼 #2', '小丑鱼 #3', '神仙鱼']);
    assert.deepEqual(out.map(o => o.number), [1, 1, 2, 3, 1]);
    assert.deepEqual(out.map(o => o.total), [3, 1, 3, 3, 1]);
    assert.deepEqual(out.map(o => o.group), [1, 5, 1, 1, 1]);
    const two = Aquarium.describeEntries([entry('neon', 'n1'), entry('neon', 'n2')]);
    assert.deepEqual(two.map(o => o.label), ['霓虹灯鱼 #1', '霓虹灯鱼 #2']);
    assert.deepEqual(Aquarium.describeEntries([]), []);
    assert.deepEqual(Aquarium.describeEntries(null), []);
    assert.deepEqual(Aquarium.describeEntries('oops'), []);
});

test('describeBlock：没有限制时为空；满了说明上限数字；大型满了点名蝠鲼与鲸鲨；渲染放不下点名群居种；省流量用较低的上限', () => {
    assert.deepEqual(Aquarium.describeBlock([], false), { text: '', reasons: [], blocked: [] });
    assert.equal(Aquarium.describeBlock(null, false).text, '');

    const full = Array.from({ length: P.MAX_ENTRIES }, (_, i) => entry('clown', `c${i}`));
    const f = Aquarium.describeBlock(full, false);
    assert.deepEqual(f.reasons, ['full']);
    assert.equal(f.blocked.length, Core.SPECIES.length, '满了所有种类都放不进');
    assert.match(f.text, /水族馆已满/);
    assert.match(f.text, /最多 12 个/);
    assert.ok(!/放不下/.test(f.text), '全部放不进时不逐个点名');

    const low = Aquarium.describeBlock(Array.from({ length: P.MAX_ENTRIES_LOW }, (_, i) => entry('clown', `c${i}`)), true);
    assert.match(low.text, /最多 6 个/);
    assert.match(low.text, /省流量/);

    const large = Aquarium.describeBlock([entry('manta', 'm1'), entry('whaleshark', 'w1')], false);
    assert.deepEqual(large.reasons, ['large']);
    assert.deepEqual([...large.blocked].sort(), ['manta', 'whaleshark']);
    assert.match(large.text, /蝠鲼、鲸鲨放不下/);
    assert.match(large.text, /大型鱼最多 2 条/);

    // 8 个群居 = 40 条：连单条也放不进
    const schools = Array.from({ length: 8 }, (_, i) => entry('neon', `n${i}`));       // 40 条
    const r = Aquarium.describeBlock(schools, false);
    assert.deepEqual(r.reasons, ['render']);
    assert.equal(r.blocked.length, Core.SPECIES.length, '40 条已满，连单条也放不进');
    assert.match(r.text, /画面里的鱼已有 40 条/);
    assert.match(r.text, /最多 40 条/);
    const partial = Aquarium.describeBlock(Array.from({ length: 7 }, (_, i) => entry('neon', `n${i}`)).concat(entry('clown', 'c1'), entry('clown', 'c2'), entry('clown', 'c3')), false);
    assert.deepEqual(partial.reasons, ['render'], '38 条：再放一个 5 条的群居会超出，单条还能放');
    assert.deepEqual([...partial.blocked].sort(), ['neon', 'tang']);
    assert.match(partial.text, /^霓虹灯鱼、蓝吊放不下：/);
});

test('托盘：显示容量（已放 n/上限 · 大型鱼 m/2）；省流量时用较低的上限并注明', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('neon', 'n1'), entry('clown', 'c1'), entry('manta', 'm1')] } });
    const cap = t.d.findAll(n => n.classes.has('aq-capacity'))[0];
    assert.ok(cap, '有容量行');
    assert.match(cap.textContent, /已放 3\/12/);
    assert.match(cap.textContent, /大型鱼 1\/2/);
    const low = await make({ stored: { v: 1, fish: [entry('neon', 'n1'), entry('clown', 'c1'), entry('manta', 'm1')] }, lowPower: true });
    low.frame();                                   // 省流量只限制绘制：世界按省流量建好后，容量行跟着变
    const lowCap = low.d.findAll(n => n.classes.has('aq-capacity'))[0];
    assert.match(lowCap.textContent, /已放 3\/6/);
    assert.match(lowCap.textContent, /省流量/);
    // 放入后容量行实时更新
    byLabel(t, '放入河豚').click();
    await settle();
    assert.match(cap.textContent, /已放 4\/12/);
});

test('托盘：放不进去的种类给出看得见的原因（不只是悬浮提示），按钮用 aria-describedby 指向它；没有限制时原因隐藏、按钮不引用', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    const reason = t.d.findAll(n => n.classes.has('aq-reason'))[0];
    assert.ok(reason, '有原因行');
    assert.equal(reason.hidden, true);
    assert.equal(reason.textContent, '');
    for (const spec of Core.SPECIES) assert.equal(byLabel(t, `放入${spec.name}`).getAttribute('aria-describedby'), null);

    const full = await make({ stored: { v: 1, fish: Array.from({ length: P.MAX_ENTRIES }, (_, i) => entry('clown', `c${i}`)) } });
    const fullReason = full.d.findAll(n => n.classes.has('aq-reason'))[0];
    assert.equal(fullReason.hidden, false);
    assert.match(fullReason.textContent, /水族馆已满（最多 12 个）/);
    assert.ok(fullReason.getAttribute('id'), '原因行有 id');
    for (const spec of Core.SPECIES) {
        const b = byLabel(full, `放入${spec.name}`);
        assert.equal(b.disabled, true);
        assert.equal(b.getAttribute('aria-describedby'), fullReason.getAttribute('id'));
    }

    const large = await make({ stored: { v: 1, fish: [entry('manta', 'm1'), entry('whaleshark', 'w1')] } });
    const largeReason = large.d.findAll(n => n.classes.has('aq-reason'))[0];
    assert.equal(largeReason.hidden, false);
    assert.match(largeReason.textContent, /蝠鲼、鲸鲨放不下/);
    assert.equal(byLabel(large, '放入蝠鲼').getAttribute('aria-describedby'), largeReason.getAttribute('id'));
    assert.equal(byLabel(large, '放入小丑鱼').getAttribute('aria-describedby'), null, '还能放的不引用原因');
    assert.equal(byLabel(large, '放入小丑鱼').disabled, false);

    // 捞出一个大型后原因消失
    large.fc.emit({ v: 1, fish: [entry('manta', 'm1')] });
    await settle();
    assert.equal(largeReason.hidden, true);
    assert.equal(byLabel(large, '放入蝠鲼').getAttribute('aria-describedby'), null);
});

test('add 被拒时状态栏说的就是看得见的原因（同一份文字，含真实上限）', async () => {
    const full = await make({ stored: { v: 1, fish: Array.from({ length: P.MAX_ENTRIES }, (_, i) => entry('clown', `c${i}`)) } });
    const status = full.d.findAll(n => n.classes.has('aq-status'))[0];
    assert.deepEqual(await full.aq.add('clown'), { ok: false, reason: 'full' });
    assert.match(status.textContent, /水族馆已满（最多 12 个）/);
    const lowFull = await make({ stored: { v: 1, fish: Array.from({ length: P.MAX_ENTRIES_LOW }, (_, i) => entry('clown', `c${i}`)) }, lowPower: true });
    lowFull.frame();
    const lowStatus = lowFull.d.findAll(n => n.classes.has('aq-status'))[0];
    assert.deepEqual(await lowFull.aq.add('clown'), { ok: false, reason: 'full' });
    assert.match(lowStatus.textContent, /最多 6 个/, '省流量时上限是 6，不能还说 12');
});

test('居民列表：同种多个按先后编号，捞出按钮的无障碍名字带编号；群居标出条数；捞掉前面一个后编号重排', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1'), entry('clown', 'c2'), entry('angel', 'a1'), entry('neon', 'n1')] } });
    const list = t.d.findAll(n => n.classes.has('aq-list'))[0];
    const names = () => list.children.map(li => li.children[0].textContent);
    assert.deepEqual(names(), ['小丑鱼 #1', '小丑鱼 #2', '神仙鱼', '霓虹灯鱼']);
    const metas = list.children.map(li => li.children.filter(c => c.classes.has('aq-item-meta')).map(c => c.textContent));
    assert.deepEqual(metas, [[], [], [], ['5 条']]);
    assert.ok(byLabel(t, '捞出小丑鱼 #1') && byLabel(t, '捞出小丑鱼 #2') && byLabel(t, '捞出神仙鱼') && byLabel(t, '捞出霓虹灯鱼'));
    byLabel(t, '捞出小丑鱼 #1').click();
    await settle();
    assert.deepEqual(t.fc.state.data[KEY].fish.map(e => e.id), ['c2', 'a1', 'n1']);
    assert.deepEqual(names(), ['小丑鱼', '神仙鱼', '霓虹灯鱼'], '只剩一个时不再编号');
    assert.ok(byLabel(t, '捞出小丑鱼'));
});

test('stop：移除全部 DOM 与监听；之后 frame 什么都不画；可以重新 start', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    assert.ok(t.d.body.children.length > 0);
    t.aq.stop();
    assert.equal(t.d.body.children.length, 0);
    assert.equal(t.fc.state.listeners.length, 0);
    assert.equal(t.frame(), false);
    assert.equal(t.ctx._calls.length, 0);
    t.aq.start();
    await settle();
    assert.ok(t.d.body.children.length > 0);
    assert.equal(t.frame(), true);
});

test('没有 document（无界面环境）：照常工作，不抛错', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] }, dom: false });
    assert.equal(t.frame(), true);
    assert.equal((await t.aq.add('angel')).ok, true);
});

// ---------- 抓取状态机 ----------

async function withFish(extra = {}) {
    const t = await make(Object.assign({ stored: { v: 1, fish: [entry('hammer', 'h1')] } }, extra));
    t.frame();
    const fish = t.aq._world().fish[0];
    fish.x = 500; fish.y = 300; fish.vx = 0; fish.vy = 0; fish.alpha = 1; fish.state = 'alive';
    const net = t.d.findAll(n => n.classes.has('aq-net'))[0];
    if (net) net.rect = { left: 20, top: 500, width: 200, height: 140 };
    return { t, fish, net };
}

test('抓取：只有命中鱼才开始；没拖过就松手 = 放回、不写存储、返回 false', async () => {
    const { t, fish } = await withFish();
    assert.equal(t.aq.hoverAt(500, 300), true);
    assert.equal(t.aq.hoverAt(5, 5), false);
    assert.equal(t.aq.grabAt(5, 5), false);
    assert.equal(t.aq.isGrabbing(), false);
    assert.equal(t.aq.grabAt(500, 300), true);
    assert.equal(t.aq.isGrabbing(), true);
    assert.equal(t.aq.hoverAt(500, 300), false, '抓取期间不提示可抓');
    assert.equal(t.aq.grabAt(500, 300), false, '同时只抓一次');
    t.frame({ pointer: { x: 503, y: 301 } });      // 没拖过 6 px
    assert.equal(t.aq.drop(503, 301), false);
    assert.equal(t.aq.isGrabbing(), false);
    assert.equal(fish.state, 'alive');
    assert.equal(t.fc.state.sets.length, 0);
});

test('抓取：拖过 6 px 才出现网兜；松手在网兜内 → 恰好一次 remove（写存储）、返回 true；网兜收起', async () => {
    const { t, fish, net } = await withFish();
    assert.equal(t.aq.grabAt(500, 300), true);
    assert.equal(net.classes.has('aq-net-on'), false, '还没拖动不出网兜');
    t.frame({ pointer: { x: 400, y: 400 } });
    assert.equal(net.classes.has('aq-net-on'), true, '拖过阈值后出现网兜');
    t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(net.classes.has('aq-net-near'), true, '对准网兜时高亮');
    assert.equal(t.aq.drop(100, 560), true);
    await settle();
    assert.equal(t.fc.state.sets.length, 1, '恰好一次写入');
    assert.deepEqual(t.fc.state.data[KEY].fish, []);
    assert.equal(net.classes.has('aq-net-on'), true, '捞起动画期间网兜还在，鱼游进去；不是一松手就消失');
    assert.equal(t.aq.isGrabbing(), false);
    t.frame({ dt: 50 });
    assert.equal(net.classes.has('aq-net-on'), true, '0.05 秒后动画还没结束');
    for (let i = 0; i < 30; i++) t.frame({ dt: 50 });
    assert.equal(net.classes.has('aq-net-on'), false, '动画结束后网兜收起');
    assert.equal(t.aq._world().fish.length, 0);
    assert.ok(!t.aq._world().fish.includes(fish));
});

test('抓取：拖过但松手在网兜外 → 放回、不写存储、返回 true（吞掉随后的 click）、网兜收起', async () => {
    const { t, fish, net } = await withFish();
    t.aq.grabAt(500, 300);
    t.frame({ pointer: { x: 700, y: 200 } });
    assert.equal(net.classes.has('aq-net-on'), true);
    assert.equal(t.aq.drop(700, 200), true);
    await settle();
    assert.equal(fish.state, 'alive');
    assert.equal(t.fc.state.sets.length, 0);
    assert.equal(net.classes.has('aq-net-on'), false);
});

test('抓取：cancel / stop / 鱼被别处移除 → 放开、网兜收起、不写存储；cancel 之后的 drop 不再判定落点', async () => {
    const a = await withFish();
    a.t.aq.grabAt(500, 300);
    a.t.frame({ pointer: { x: 400, y: 400 } });
    assert.equal(a.t.aq.cancel(), true);
    assert.equal(a.t.aq.cancel(), false);
    assert.equal(a.fish.state, 'alive');
    assert.equal(a.net.classes.has('aq-net-on'), false);
    assert.equal(a.t.aq.drop(100, 560), false, '已取消，松手不会捞出');
    await settle();
    assert.equal(a.t.fc.state.sets.length, 0);

    const b = await withFish();
    b.t.aq.grabAt(500, 300);
    b.t.frame({ pointer: { x: 400, y: 400 } });
    b.t.aq.stop();
    assert.equal(b.t.aq.isGrabbing(), false);
    assert.equal(b.t.aq.drop(100, 560), false);
    await settle();
    assert.equal(b.t.fc.state.sets.length, 0);

    const c = await withFish();
    c.t.aq.grabAt(500, 300);
    c.t.fc.emit({ v: 1, fish: [] });                 // 别的标签页把它移走了
    await settle();
    c.t.frame({ pointer: { x: 400, y: 400 } });
    c.t.frame({ pointer: { x: 100, y: 560 }, dt: 50 });
    assert.equal(c.t.aq.drop(100, 560), false);
    assert.equal(c.t.aq.isGrabbing(), false);
});

test('抓取：捞出写入失败 → 鱼回来、不丢失；之后可以再抓', async () => {
    const { t, net } = await withFish();
    t.fc.state.failSet = true;
    t.aq.grabAt(500, 300);
    t.frame({ pointer: { x: 400, y: 400 } });
    t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(t.aq.drop(100, 560), true);
    await settle();
    assert.equal(t.aq.entries().length, 1, '条目还在');
    for (let i = 0; i < 40; i++) t.frame({ dt: 50 });
    const back = t.aq._world().fish.filter(f => f.state !== 'leaving');
    assert.equal(back.length, 1, '鱼回来了');
    assert.equal(net.classes.has('aq-net-on'), false);
    assert.equal(t.aq.isGrabbing(), false);
});

test('没有网兜 DOM（受限环境）：拖动开始时放回，绝不在没有落点时捞出', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('hammer', 'h1')] }, dom: false });
    t.frame();
    const fish = t.aq._world().fish[0];
    fish.x = 500; fish.y = 300; fish.alpha = 1; fish.state = 'alive';
    assert.equal(t.aq.grabAt(500, 300), true);
    t.frame({ pointer: { x: 300, y: 300 } });
    assert.equal(t.aq.isGrabbing(), false, '没有落点：放回');
    assert.equal(fish.state, 'alive');
    assert.equal(t.aq.drop(300, 300), false);
    await settle();
    assert.equal(t.fc.state.sets.length, 0);
});

// ---------- 绘制契约 ----------

test('绘制：没有鱼时一笔不画；有鱼时 save/restore 配对；省流量模式不抛错', async () => {
    const empty = await make({});
    assert.equal(empty.frame(), true);
    assert.equal(empty.ctx._calls.length, 0, '没有鱼：不调用任何画布方法');

    const t = await make({ stored: { v: 1, fish: [entry('neon', 'a'), entry('hammer', 'b'), entry('manta', 'c'), entry('puffer', 'd'), entry('angel', 'e'), entry('clown', 'f'), entry('tang', 'g'), entry('whaleshark', 'h')] } });
    for (let i = 0; i < 5; i++) t.frame({ dt: 50, night: true, nightHour: 23 });
    const calls = t.ctx._calls;
    assert.ok(calls.includes('fill') || calls.includes('stroke'));
    const saves = calls.filter(c => c === 'save').length;
    const restores = calls.filter(c => c === 'restore').length;
    assert.equal(saves, restores);
    assert.ok(saves > 0);

    const low = await make({ stored: { v: 1, fish: [entry('neon', 'a'), entry('hammer', 'b')] }, lowPower: true });
    for (let i = 0; i < 5; i++) low.frame({ dt: 50 });
    assert.ok(low.ctx._calls.length > 0);
});

test('绘制：先画远处（z 小）的鱼；传坏尺寸/坏 ctx 不抛错也不画', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    assert.equal(t.frame({ width: 0 }), false);
    assert.equal(t.frame({ height: NaN }), false);
    assert.equal(t.frame({ ctx: null }), false);
    assert.equal(t.frame(), true);
});

test('绘制：画法抛异常 → warn 一次、之后 frame 返回 false、托盘收起；存储里的数据不受影响', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    const bad = new Proxy({}, { get() { return () => { throw new Error('boom'); }; }, set() { return true; } });
    assert.equal(t.frame({ ctx: bad }), false);
    assert.equal(t.warns.length, 1);
    assert.equal(t.frame(), false);
    assert.equal(t.warns.length, 1);
    assert.equal(t.aq.isActive(), false);
    assert.equal(t.fc.state.sets.length, 0);
    assert.deepEqual(t.fc.state.data[KEY].fish.map(e => e.id), ['c1']);
});

test('世界：省流量切换时重建世界且鱼按渲染上限限制；尺寸变化后仍然有限', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry('neon', `n${i}`));
    const t = await make({ stored: { v: 1, fish: entries } });
    t.frame();
    const normal = t.aq._world().fish.filter(f => f.state !== 'leaving').length;
    assert.ok(normal > P.MAX_FISH_LOW);
    t.frame({ lowPower: true });
    const low = t.aq._world().fish.filter(f => f.state !== 'leaving').length;
    assert.ok(low <= P.MAX_FISH_LOW && low > 0);
    assert.equal(t.aq.entries().length, 6, '省流量只限制绘制，不会丢掉用户的条目');
    t.frame({ width: 800, height: 500 });
    assert.ok(t.aq._world().fish.every(f => Number.isFinite(f.x) && Number.isFinite(f.y)));
});

// ---------- 补强（变异检查发现原有测试抓不到的行为） ----------

test('绘制：按深度由远到近画（z 小的先画）——用 translate 的落点对应回每条鱼', async () => {
    const t = await make({ stored: { v: 1, fish: ['clown', 'puffer', 'angel', 'hammer', 'neon'].map((s, i) => entry(s, `e${i}`)) } });
    t.frame();
    const zs = [0.95, 0.4, 0.7, 0.55, 0.85, 0.5, 0.6, 0.9, 0.45];
    t.aq._world().fish.forEach((f, i) => { f.z = zs[i % zs.length]; f.alpha = 1; f.state = 'alive'; });
    const moves = [];
    const state = {};
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => { if (key === 'translate') moves.push(args); return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop() {} } : undefined; };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    assert.equal(t.frame({ ctx, dt: 0.5 }), true);
    const fish = t.aq._world().fish;
    const drawn = moves.map(([x, y]) => fish.find(f => Math.abs(f.x - x) < 1e-6 && Math.abs(f.y - y) < 1e-6));
    assert.equal(drawn.length, fish.length);
    assert.ok(drawn.every(Boolean), '每次 translate 都对应一条鱼');
    for (let i = 1; i < drawn.length; i++) assert.ok(drawn[i - 1].z <= drawn[i].z, `第 ${i} 条的 z=${drawn[i].z} 小于前一条 ${drawn[i - 1].z}：远的要先画`);
});

test('托盘：点主按钮展开/收起并同步 aria-expanded；展开时按 Esc 收起', async () => {
    const t = await make({});
    const toggle = t.d.findAll(n => n.classes.has('aq-toggle'))[0];
    const panel = t.d.findAll(n => n.classes.has('aq-panel'))[0];
    assert.equal(panel.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    toggle.click();
    assert.equal(panel.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    for (const fn of t.d.docListeners.keydown || []) fn({ key: 'Escape' });
    assert.equal(panel.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    toggle.click();
    toggle.click();
    assert.equal(panel.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    for (const fn of t.d.docListeners.keydown || []) fn({ key: 'a' });
    toggle.click();
    for (const fn of t.d.docListeners.keydown || []) fn({ key: 'a' });
    assert.equal(panel.hidden, false, '其他按键不收起');
});

test('storage.onChanged：只认 local 区；别的区的同名键不影响', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    t.fc.state.listeners[0]({ [KEY]: { newValue: { v: 1, fish: [] } } }, 'sync');
    t.fc.state.listeners[0]({ [KEY]: { newValue: { v: 1, fish: [] } } }, 'session');
    assert.deepEqual(t.aq.entries().map(e => e.id), ['c1']);
    t.fc.state.listeners[0]({ other: { newValue: 1 } }, 'local');
    assert.deepEqual(t.aq.entries().map(e => e.id), ['c1']);
});

test('存储里是未来版本（v 不是 1）的数据：看不懂就不碰——放入/捞出都拒绝，也不写', async () => {
    const future = { v: 2, fish: [entry('clown', 'c1')], extra: 'x' };
    const t = await make({ stored: future });
    assert.deepEqual(t.aq.entries(), []);
    assert.deepEqual(await t.aq.add('neon'), { ok: false, reason: 'storage' });
    assert.deepEqual(await t.aq.remove('c1'), { ok: false, reason: 'storage' });
    assert.equal(t.fc.state.sets.length, 0);
    assert.deepEqual(t.fc.state.data[KEY], future);
});

test('remove：写入还没返回时鱼就已经开始离开（像被捞走），写入成功后条目才消失；成功提示是“已捞出”', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    t.frame();
    let open;
    t.fc.state.gate = new Promise(resolve => { open = resolve; });
    const pending = t.aq.remove('c1');
    await settle();
    assert.equal(t.aq._world().fish[0].state, 'leaving', '写入未完成时已淡出');
    assert.equal(t.aq.entries().length, 1, '条目要等写入成功才算移除');
    open();
    assert.deepEqual(await pending, { ok: true });
    assert.equal(t.aq.entries().length, 0);
    const status = t.d.findAll(n => n.getAttribute('role') === 'status')[0];
    assert.equal(status.textContent, '已捞出');
});

test('抓取：鱼被别处移除后，不必等松手——下一帧就结束抓取并收起网兜；松手在网兜上也不写入、不吞 click', async () => {
    const a = await withFish();
    a.t.aq.grabAt(500, 300);
    a.t.frame({ pointer: { x: 400, y: 400 } });
    assert.equal(a.net.classes.has('aq-net-on'), true);
    a.t.fc.emit({ v: 1, fish: [] });
    await settle();
    a.t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(a.t.aq.isGrabbing(), false, '下一帧就结束了');
    assert.equal(a.net.classes.has('aq-net-on'), false);

    const b = await withFish();
    b.t.aq.grabAt(500, 300);
    b.t.frame({ pointer: { x: 400, y: 400 } });
    b.t.fc.emit({ v: 1, fish: [] });                    // 之后没有再来一帧，直接松手
    await settle();
    assert.equal(b.t.aq.drop(100, 560), false, '鱼已经不在：不算拖过、不吞 click');
    await settle();
    assert.equal(b.t.fc.state.sets.length, 0);
    const status = b.t.d.findAll(n => n.getAttribute('role') === 'status')[0];
    assert.notEqual(status.textContent, '这条鱼已经不在了', '没有走到 remove');
});

test('抓取：捞出成功后提示是“已捞出”（只捞一次，不会被第二次 remove 的“已不在”覆盖）', async () => {
    const { t } = await withFish();
    t.aq.grabAt(500, 300);
    t.frame({ pointer: { x: 400, y: 400 } });
    t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(t.aq.drop(100, 560), true);
    await settle();
    const status = t.d.findAll(n => n.getAttribute('role') === 'status')[0];
    assert.equal(status.textContent, '已捞出');
});

// ---------- 翻面的绘制契约 ----------

test('绘制：垂直方向的缩放用鱼的当前翻面（缓动的 −1…1），缺失或非法时才按朝向取正负；中间态不缩到 0', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    t.frame();
    const f = t.aq._world().fish[0];
    f.alpha = 1; f.state = 'alive'; f.z = 0.9;
    const scales = [];
    const capture = () => new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => { if (key === 'scale') scales.push(args); return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop() {} } : undefined; };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    const draw = () => { scales.length = 0; assert.equal(t.frame({ ctx: capture(), dt: 0 }), true); return scales.slice(); };

    f.ang = 0; f.flip = 0.37;
    assert.deepEqual(draw(), [[1, 0.37]], '用缓动中的当前面，而不是按朝向取 ±1');
    f.flip = -0.8;
    assert.deepEqual(draw(), [[1, -0.8]]);
    f.flip = 0;
    const [[, mid]] = draw();
    assert.ok(Math.abs(mid) >= 0.05 && Math.abs(mid) < 0.2, `翻到正中间时仍保留一条细身体，不缩成 0：${mid}`);
    f.flip = undefined; f.ang = Math.PI;
    assert.deepEqual(draw(), [[1, -1]], '没有翻面状态（旧数据）：朝左取 −1');
    f.flip = NaN; f.ang = 0;
    assert.deepEqual(draw(), [[1, 1]], '翻面状态非法：回到按朝向取正负');
    f.flip = 7;
    assert.deepEqual(draw(), [[1, 1]], '超出范围的值夹回 −1…1');
});

// ---------- 捞起动画与网兜（控制器） ----------

test('网兜：拖进去松手，鱼被带向网兜中心；用列表里的“捞出”按钮则仍是原地淡出', async () => {
    const { t, fish, net } = await withFish();
    const center = { x: net.rect.left + net.rect.width / 2, y: net.rect.top + net.rect.height / 2 };
    fish.x = 600; fish.y = 200;
    assert.equal(t.aq.grabAt(fish.x, fish.y), true);
    t.frame({ pointer: { x: 140, y: 560 } });
    assert.equal(t.aq.drop(140, 560), true);
    await settle();
    const leaving = t.aq._world().fish.filter(f => f.state === 'leaving');
    assert.ok(leaving.length > 0);
    for (const f of leaving) {
        assert.ok(f.leaveTo, '带着落点离开');
        assert.ok(Math.hypot(f.leaveTo.x - center.x, f.leaveTo.y - center.y) <= P.SCOOP_SPREAD * 1.5 + 1, `落点 ${f.leaveTo.x},${f.leaveTo.y} 应在网兜中心 ${center.x},${center.y} 附近`);
    }

    const other = await make({ stored: { v: 1, fish: [entry('puffer', 'p1')] } });
    other.frame();
    await other.aq.remove('p1');
    const gone = other.aq._world().fish.filter(f => f.state === 'leaving');
    assert.ok(gone.length > 0 && gone.every(f => f.leaveTo === undefined), '按钮捞出没有落点，保持原来的淡出');
});

test('绘制：被捞起的鱼随 scoopT 缩小（身体渐变的宽度按 1 − SCOOP_SHRINK 缩），没有 scoopT 时按原大小', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('angel', 'a1')] } });
    t.frame();
    const f = t.aq._world().fish[0];
    f.alpha = 1; f.state = 'alive'; f.z = 0.95; f.ang = 0; f.flip = 1;
    const widths = [];
    const capture = () => new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'createLinearGradient') widths.push(args[3]);
                return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop() {} } : undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    const bodyWidth = () => { widths.length = 0; assert.equal(t.frame({ ctx: capture(), dt: 0 }), true); return widths[0]; };
    f.scoopT = undefined;
    const full = bodyWidth();
    f.scoopT = 0;
    assert.ok(Math.abs(bodyWidth() - full) < 1e-9);
    f.scoopT = 1;
    const small = bodyWidth();
    assert.ok(Math.abs(small / full - (1 - P.SCOOP_SHRINK)) < 0.02, `缩到 ${(small / full).toFixed(3)}，应为 ${(1 - P.SCOOP_SHRINK).toFixed(2)}`);
    f.scoopT = 0.5;
    const mid = bodyWidth();
    assert.ok(mid < full && mid > small, '中间进度介于两者之间');
    f.scoopT = NaN;
    assert.ok(Math.abs(bodyWidth() - full) < 1e-9, '非法进度按原大小');
});

test('网兜保持：捞起动画期间一直显示，期间又开始新的抓取则以新的一次为准；世界重建后不会一直亮着', async () => {
    // 1) 动画没结束不收起，结束才收起（中途 0.3 秒仍在）
    const a = await withFish();
    a.t.aq.grabAt(500, 300);
    a.t.frame({ pointer: { x: 400, y: 400 } });
    a.t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(a.t.aq.drop(100, 560), true);
    await settle();
    for (let i = 0; i < 6; i++) a.t.frame({ dt: 50 });
    assert.equal(a.net.classes.has('aq-net-on'), true, '0.3 秒：仍在捞起动画里');
    for (let i = 0; i < 10; i++) a.t.frame({ dt: 50 });
    assert.equal(a.net.classes.has('aq-net-on'), false, '动画结束（SCOOP_S 加一点余量）之后收起');

    // 2) 捞起期间又抓了另一条：新抓取接管网兜，松手在网兜外时立刻收起
    const b = await withFish({ stored: { v: 1, fish: [entry('hammer', 'h1'), entry('angel', 'h2')] } });
    const [first, second] = b.t.aq._world().fish;
    second.x = 800; second.y = 200; second.vx = 0; second.vy = 0; second.alpha = 1; second.state = 'alive';
    b.t.aq.grabAt(500, 300);
    b.t.frame({ pointer: { x: 400, y: 400 } });
    b.t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(b.t.aq.drop(100, 560), true);
    assert.equal(b.net.classes.has('aq-net-on'), true);
    assert.equal(b.t.aq.grabAt(800, 200), true, '捞起动画期间还能抓别的鱼');
    b.t.frame({ pointer: { x: 700, y: 120 }, dt: 50 });
    for (let i = 0; i < 24; i++) b.t.frame({ pointer: { x: 700 - i, y: 120 }, dt: 50 });
    assert.equal(b.net.classes.has('aq-net-on'), true, '新的拖动进行中，旧动画的计时到了也不能把网兜收掉');
    assert.equal(b.t.aq.drop(700, 120), true);
    assert.equal(b.net.classes.has('aq-net-on'), false, '新的一次松手在网兜外：立刻收起');
    assert.equal(second.state, 'alive');
    assert.ok(first);

    // 3) 动画期间世界被重建（省流量切换）：网兜不会因为 world.time 归零而一直亮着
    const c = await withFish();
    c.t.aq.grabAt(500, 300);
    c.t.frame({ pointer: { x: 400, y: 400 } });
    c.t.frame({ pointer: { x: 100, y: 560 } });
    assert.equal(c.t.aq.drop(100, 560), true);
    c.t.frame({ lowPower: true, dt: 50 });
    assert.equal(c.net.classes.has('aq-net-on'), false, '世界换了，网兜随之收起');
});


// ---------- 玩法接线：戳、喂食、拉尾（规则见 aquarium-play-core.test.js，画法与按钮见 aquarium-play.test.js） ----------

const PlayCore = require('../js/aquarium-play-core.js');
const PlayUi = require('../js/aquarium-play.js');
const PP = PlayCore.PARAMS;

const feedButton = t => t.d.findAll(n => n.classes.has('aq-feed'))[0];
const fireDoc = (t, name, event) => { for (const fn of [...(t.d.docListeners[name] || [])]) fn(event); };
const dragFeed = (t, x, y) => {
    const b = feedButton(t);
    for (const fn of b.listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
    fireDoc(t, 'pointermove', { clientX: x, clientY: y });
    fireDoc(t, 'pointerup', { clientX: x, clientY: y });
};
const statusText = t => t.d.findAll(n => n.classes.has('aq-status'))[0].textContent;
const frames = (t, n, extra = {}) => { for (let i = 0; i < n; i++) t.frame(extra); };

async function playFish(extra = {}) {
    const f = await withFish(extra);
    f.fish.ang = 0;
    return f;
}

test('戳：点一下鱼（没拖）= 放回并戳一下：返回 false 不吞 click，鱼窜开、嘴边冒泡、点击处荡开涟漪，不写存储', async () => {
    const { t, fish } = await playFish();
    assert.equal(t.aq._play(), null, '没用过玩法就没有玩法状态（零开销）');
    assert.equal(t.aq.grabAt(520, 300), true);
    t.frame({ pointer: { x: 523, y: 301 } });
    assert.equal(t.aq.drop(523, 301), false, '点一下不吞随后的 click');
    assert.equal(fish.state, 'alive');
    assert.ok(Math.hypot(fish.vx, fish.vy) > 0, '被戳的鱼窜开');
    const play = t.aq._play();
    assert.equal(PlayCore.counts(play).ripples, 1);
    assert.deepEqual({ x: play.ripples[0].x, y: play.ripples[0].y }, { x: 520, y: 300 }, '涟漪在按下的位置（不是松手位置）');
    assert.ok(play.bubbles.length >= PP.POKE_BUBBLES);
    assert.equal(t.fc.state.sets.length, 0);
});

test('戳：拖过 6 px 就不是戳；玩法层关闭（playCore: null）时点一下鱼与原来完全一样', async () => {
    const a = await playFish();
    assert.equal(a.t.aq.grabAt(520, 300), true);
    a.t.frame({ pointer: { x: 520, y: 330 } });
    a.t.frame({ pointer: { x: 700, y: 200 } });
    assert.equal(a.t.aq.drop(700, 200), true);
    assert.equal(a.t.aq._play(), null, '拖过之后松手不戳（连玩法状态都没建）');
    const b = await playFish({ env: { playCore: null } });
    b.fish.vx = 0; b.fish.vy = 0;
    assert.equal(b.t.aq.grabAt(520, 300), true);
    b.t.frame({ pointer: { x: 521, y: 300 } });
    assert.equal(b.t.aq.drop(521, 300), false);
    assert.equal(b.t.aq._play(), null);
    assert.deepEqual(b.t.warns, [], '没有玩法层不是错误');
    assert.equal(b.fish.vx, 0);
    assert.equal(b.fish.vy, 0);
    assert.equal(b.t.d.findAll(n => n.classes.has('aq-feed')).length, 0, '没有玩法层就没有喂食按钮');
    assert.equal(b.t.aq.grabAt(480, 300), true);
    assert.ok(!b.fish.held.tail, '没有玩法层就没有拉尾');
    const c = await playFish({ env: { play: null } });
    c.fish.vx = 0; c.fish.vy = 0;
    assert.equal(c.t.aq.grabAt(520, 300), true);
    assert.equal(c.t.aq.drop(520, 300), false);
    assert.equal(c.t.aq._play(), null, '没有画法模块：不戳（否则画不出来也停不下来）');
    assert.deepEqual(c.t.warns, []);
    assert.equal(c.fish.vx, 0);
    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed')).length, 0);
    assert.equal(c.t.aq.grabAt(480, 300), true);
    assert.ok(!c.fish.held.tail, '没有画法模块：不拉尾');
});

test('绘制顺序：涟漪在鱼后面，饲料与泡在鱼前面；没有玩法状态时不调用', async () => {
    const calls = [];
    const spy = {
        drawBack: (ctx, play, view) => { ctx.mark_back(); calls.push(['back', view.scale]); },
        drawFront: ctx => { ctx.mark_front(); calls.push(['front']); },
        mountFeed: PlayUi.mountFeed,
    };
    const { t } = await playFish({ env: { play: spy } });
    t.ctx._calls.length = 0;
    t.frame();
    assert.equal(names(t.ctx).includes('mark_back'), false, '还没用过玩法：不画玩法层');
    t.aq.grabAt(520, 300);
    t.aq.drop(520, 300);
    t.ctx._calls.length = 0;
    t.frame();
    const order = names(t.ctx);
    const back = order.indexOf('mark_back');
    const front = order.indexOf('mark_front');
    assert.ok(back === 0 && front > back + 1, `涟漪在最前、饲料与泡在最后，中间是鱼：${back} ${front}`);
    assert.ok(order.slice(back + 1, front).length > 5, '两层之间画了鱼');
    assert.ok(calls[0][1] > 0 && calls[0][1] < 2, '视图里带着缩放');
});

function names(ctx) { return ctx._calls.map(c => c); }

test('喂食：按钮点一下从上面落 6 粒，冷却内再点没有变化，饲料满了提示“还没吃完”；没有鱼时按钮禁用并指向原因', async () => {
    const t = await make();
    const button0 = feedButton(t);
    assert.ok(button0, '托盘里有喂食按钮');
    assert.ok(t.d.findAll(n => n.classes.has('aq-feed-hint'))[0], '旁边有一句怎么用的提示');
    assert.equal(button0.disabled, true, '一条鱼都没有：禁用');
    assert.equal(button0.getAttribute('aria-describedby'), 'aq-empty');
    assert.ok(/先放入一条鱼/.test(button0.getAttribute('title')));
    assert.ok(t.d.findAll(n => n.attrs.id === 'aq-empty').length === 1, '原因行确实存在');
    await t.aq.add('clown');
    await settle();
    t.frame();
    const button = feedButton(t);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-describedby'), null);
    button.click();
    assert.equal(t.aq._play().pellets.length, PP.SPRINKLE_COUNT);
    assert.equal(statusText(t), `落下了 ${PP.SPRINKLE_COUNT} 粒饲料`);
    button.click();
    assert.equal(t.aq._play().pellets.length, PP.SPRINKLE_COUNT, '冷却内再点没有变化');
    assert.equal(statusText(t), `落下了 ${PP.SPRINKLE_COUNT} 粒饲料`, '冷却是静默的');
    for (let i = 0; i < 4; i++) { t.aq._play().lastSprinkle = -Infinity; button.click(); }
    assert.equal(t.aq._play().pellets.length, PP.MAX_PELLETS);
    t.aq._play().lastSprinkle = -Infinity;
    button.click();
    assert.equal(statusText(t), '饲料还没吃完');
    assert.equal(t.aq._play().pellets.length, PP.MAX_PELLETS);
});

test('喂食：从按钮拖到水里松手，饲料落在松手处；鱼被吸引过去吃掉并变亮；松在托盘上取消', async () => {
    const { t, fish } = await playFish();
    fish.x = 500; fish.y = 300;
    const toggle = t.d.findAll(n => n.classes.has('aq-toggle'))[0];
    toggle.rect = { left: 1200, top: 560, width: 40, height: 40 };
    dragFeed(t, 1210, 570);
    assert.equal(t.aq._play(), null, '松在托盘上：取消，不撒（也没有创建玩法状态）');
    dragFeed(t, 600, 300);
    const play = t.aq._play();
    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT);
    const spread = PP.DROP_SPREAD * t.aq._world().scale;
    assert.ok(play.pellets.every(p => Math.abs(p.x - 600) <= spread + 1e-6 && Math.abs(p.y - 300) <= spread + 1e-6), '落在松手处附近');
    let fed = 0;
    for (let i = 0; i < 1200 && !fed; i++) { t.frame(); fed = play.fed.size; }
    assert.ok(fed >= 1, '鱼被饲料吸引过去，吃到了');
    assert.ok(play.pellets.length < PP.SPRINKLE_COUNT, '被吃掉的饲料消失');
    t.frame();
    const extras = PlayCore.extrasOf(play, fish);
    assert.ok(extras.fed > 0, '吃到的鱼变亮');
});

test('拉尾：按在后半身 = 拉尾（抓住的点留在指针下、弹簧开始），按在前半身与原来一样；成群的小鱼不拉尾', async () => {
    const { t, fish } = await playFish();
    assert.equal(t.aq.grabAt(520, 300), true);
    assert.equal(fish.held.tail, false, '前半身：普通抓取');
    assert.equal(t.aq._play(), null);
    assert.equal(t.aq.cancel(), true);
    assert.equal(t.aq.grabAt(480, 300), true);
    assert.equal(fish.held.tail, true, '后半身：拉尾');
    assert.ok(t.aq._play().pulls.has(fish.id));
    t.aq.cancel();
    const school = await make({ stored: { v: 1, fish: [entry('neon', 'n1')] } });
    school.frame();
    const small = school.aq._world().fish[0];
    small.x = 500; small.y = 300; small.ang = 0; small.alpha = 1; small.state = 'alive';
    assert.equal(school.aq.grabAt(480, 300), true);
    assert.equal(small.held.tail, false, '成群的小鱼太小，不做拉尾');
});

test('拉尾：拖拽中尾巴被拉长；拖过之后松手（网兜外）→ 尾巴弹回、鱼向前冲并冒泡，弹簧停稳后清掉', async () => {
    const { t, fish } = await playFish();
    t.aq.grabAt(480, 300);
    let maxPull = 0;
    for (let i = 0; i < 40; i++) {
        t.frame({ pointer: { x: 480 + i * 8, y: 300 + i * 4 } });
        const e = PlayCore.extrasOf(t.aq._play(), fish);
        if (e.pull) maxPull = Math.max(maxPull, Math.hypot(e.pull.x, e.pull.y));
    }
    assert.ok(maxPull > 2, `拖动中尾巴被拉长：${maxPull}`);
    assert.equal(fish.state, 'held');
    const bubblesBefore = t.aq._play().bubbles.length;
    assert.equal(t.aq.drop(800, 460), true);
    assert.equal(fish.state, 'alive');
    const speed = Math.hypot(fish.vx, fish.vy);
    assert.ok(speed > 0, '向前冲');
    assert.ok(t.aq._play().bubbles.length >= bubblesBefore + PP.RELEASE_BUBBLES, '冒泡');
    assert.ok(t.aq._play().pulls.has(fish.id), '尾巴还在回弹');
    frames(t, 200);
    assert.equal(t.aq._play().pulls.size, 0, '弹簧停稳后清掉');
});

test('拉尾：拖进网兜捞出 = 静悄悄收起拉尾（没有冲刺与泡）；取消：拖过则回弹冲刺，没拖过则静悄悄', async () => {
    const a = await playFish();
    a.t.aq.grabAt(480, 300);
    for (let i = 0; i < 30; i++) a.t.frame({ pointer: { x: 480 - i * 12, y: 300 + i * 8 } });
    const bubbles = a.t.aq._play().bubbles.length;
    assert.equal(a.t.aq.drop(100, 560), true);
    assert.equal(a.t.aq._play().pulls.size, 0, '捞出：拉尾记录立即清掉');
    assert.equal(a.t.aq._play().bubbles.length, bubbles, '没有冲刺的泡');

    const b = await playFish();
    b.t.aq.grabAt(480, 300);
    for (let i = 0; i < 30; i++) b.t.frame({ pointer: { x: 480 + i * 10, y: 300 } });
    const before = b.t.aq._play().bubbles.length;
    assert.equal(b.t.aq.cancel(), true);
    assert.equal(b.fish.state, 'alive');
    assert.ok(b.t.aq._play().bubbles.length > before, '拖过之后取消：冲刺并冒泡');
    assert.ok(b.t.aq._play().pulls.has(b.fish.id), '尾巴回弹');

    const c = await playFish();
    c.t.aq.grabAt(480, 300);
    c.t.frame({ pointer: { x: 481, y: 300 } });
    assert.equal(c.t.aq.cancel(), true);
    assert.equal(c.t.aq._play().pulls.size, 0, '没拖就取消：静悄悄');
    assert.equal(c.t.aq._play().bubbles.length, 0);
});

test('拉尾：没有网兜 DOM（受限环境）时拖动开始就放回，拉尾记录一并收起、没有冲刺', async () => {
    const t = await make({ stored: { v: 1, fish: [entry('hammer', 'h1')] }, dom: false });
    t.frame();
    const fish = t.aq._world().fish[0];
    fish.x = 500; fish.y = 300; fish.ang = 0; fish.vx = 0; fish.vy = 0; fish.alpha = 1; fish.state = 'alive';
    assert.equal(t.aq.grabAt(480, 300), true);
    assert.equal(fish.held.tail, true);
    t.frame({ pointer: { x: 300, y: 300 } });
    assert.equal(t.aq.isGrabbing(), false);
    assert.equal(fish.state, 'alive');
    assert.equal(t.aq._play().pulls.size, 0);
    assert.equal(t.aq._play().bubbles.length, 0);
});

test('玩法出错只停玩法：鱼、放入与捞出、存储照常，喂食按钮收起；每一处玩法调用都做过', async () => {
    const wrap = name => {
        const bad = Object.assign({}, PlayCore, { [name]: () => { throw new Error(`坏了：${name}`); } });
        return { playCore: bad };
    };
    const scenes = {
        poke: async t => { t.aq.grabAt(520, 300); t.aq.drop(520, 300); },
        sprinkle: async t => { feedButton(t).click(); },
        attractors: async t => { feedButton(t).click(); t.frame(); },
        step: async t => { feedButton(t).click(); t.frame(); },
        extrasOf: async t => { feedButton(t).click(); t.frame(); },
        isTailZone: async t => { t.aq.grabAt(480, 300); },
        beginHold: async t => { t.aq.grabAt(480, 300); },
        endHold: async t => { t.aq.grabAt(480, 300); t.frame({ pointer: { x: 480, y: 300 } }); t.frame({ pointer: { x: 700, y: 200 } }); t.aq.drop(700, 200); },
        resize: async t => { feedButton(t).click(); t.frame({ width: 640, height: 360 }); },
    };
    for (const [name, act] of Object.entries(scenes)) {
        const t0 = await playFish({ env: wrap(name) });
        const { t, fish } = t0;
        await act(t);
        t.frame();
        assert.equal(t.aq.state().failed, false, `${name}：鱼层没有停`);
        assert.equal(t.aq.state().playFailed, true, `${name}：玩法停了`);
        assert.ok(t.warns.some(w => /玩法出错/.test(w) && w.includes(`坏了：${name}`)), `${name}：留了警告：${t.warns}`);
        assert.equal(t.d.findAll(n => n.classes.has('aq-feed')).length, 0, `${name}：喂食按钮收起`);
        assert.equal(t.d.findAll(n => n.classes.has('aq-feed-row'))[0].hidden, true, `${name}：提示行也收起`);
        if (name === 'sprinkle') assert.match(statusText(t), /喂食出错/, '状态栏说明原因');
        assert.equal(t.warns.filter(w => /玩法出错/.test(w)).length, 1, `${name}：只警告一次`);
        assert.equal(t.frame(), true);
        assert.ok(fish.state === 'alive' || fish.state === 'held', `${name}：鱼还在`);
        t.aq.cancel();
        assert.equal((await t.aq.add('angel')).ok, true, `${name}：放入仍可用`);
    }
    const drawBad = await playFish({ env: { play: Object.assign({}, PlayUi, { drawBack: () => { throw new Error('坏了：画'); } }) } });
    drawBad.t.aq.grabAt(520, 300); drawBad.t.aq.drop(520, 300);
    assert.equal(drawBad.t.frame(), true);
    assert.equal(drawBad.t.aq.state().playFailed, true);
    assert.equal(drawBad.t.aq.state().failed, false);
    const drawBad2 = await playFish({ env: { play: Object.assign({}, PlayUi, { drawFront: () => { throw new Error('坏了：画前层'); } }) } });
    drawBad2.t.aq.grabAt(520, 300); drawBad2.t.aq.drop(520, 300);
    assert.equal(drawBad2.t.frame(), true);
    assert.equal(drawBad2.t.aq.state().playFailed, true);
});

test('玩法出错时正拉着尾巴的鱼照常放回；停用后不再调用玩法，下次 start 重新可用', async () => {
    let throwOnStep = false;
    const flaky = Object.assign({}, PlayCore, { step: (...args) => { if (throwOnStep) throw new Error('坏了：step'); return PlayCore.step(...args); } });
    const { t, fish } = await playFish({ env: { playCore: flaky } });
    t.aq.grabAt(480, 300);
    t.frame({ pointer: { x: 480, y: 300 } });
    throwOnStep = true;
    t.frame({ pointer: { x: 600, y: 300 } });
    assert.equal(t.aq.state().playFailed, true);
    assert.equal(t.aq.isGrabbing(), true, '抓取本身不受影响');
    t.frame({ pointer: { x: 700, y: 200 } });
    assert.equal(t.aq.drop(700, 200), true);
    assert.equal(fish.state, 'alive', '鱼被放回');
    const calls = { n: 0, step: 0 };
    flaky.poke = (...args) => { calls.n++; return PlayCore.poke(...args); };
    flaky.step = (...args) => { calls.step++; return PlayCore.step(...args); };
    t.aq.grabAt(fish.x, fish.y); t.aq.drop(fish.x, fish.y);
    frames(t, 5);
    assert.equal(calls.n, 0, '停用后不再调用玩法');
    assert.equal(calls.step, 0, '停用后帧循环不再推进玩法');
    throwOnStep = false;
    t.aq.stop();
    t.aq.start();
    await settle();
    assert.equal(t.aq.state().playFailed, false, '重新开始：玩法重新可用');
    assert.ok(feedButton(t), '喂食按钮回来了');
});

test('玩法状态与 world 同生命周期：省流量切换（重建 world）、停止、鱼被全部捞出都会丢弃；缩放窗口时位置按比例缩放；从不存储', async () => {
    const a = await playFish();
    a.t.aq.grabAt(520, 300); a.t.aq.drop(520, 300);
    assert.ok(a.t.aq._play());
    a.t.frame({ lowPower: true });
    assert.equal(a.t.aq._play(), null, '省流量切换重建了 world：玩法状态随之丢弃');

    const b = await playFish();
    feedButton(b.t).click();
    const before = b.t.aq._play().pellets.map(p => ({ x: p.x, y: p.y }));
    b.t.frame({ width: 640, height: 540, dt: 0 });
    const after = b.t.aq._play().pellets;
    assert.equal(after.length, before.length);
    after.forEach((p, i) => { assert.ok(Math.abs(p.x - before[i].x * 0.5) < 1e-6 && Math.abs(p.y - before[i].y * 0.75) < 1e-6, `饲料 ${i} 位置按横向 0.5、纵向 0.75 缩放：${p.x},${p.y}`); });

    const c = await playFish();
    feedButton(c.t).click();
    for (const fn of feedButton(c.t).listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
    fireDoc(c.t, 'pointermove', { clientX: 300, clientY: 300 });
    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed-ghost')).length, 1, '拖拽中有饲料团');
    c.t.aq.stop();
    assert.equal(c.t.aq._play(), null);
    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed') || n.classes.has('aq-feed-ghost')).length, 0, '停止后喂食按钮与饲料团都清掉');
    assert.equal(Object.values(c.t.d.docListeners).flat().length, 0, '停止后文档上不留监听（含喂食拖拽与 Esc）');

    const d = await playFish();
    feedButton(d.t).click();
    await d.t.aq.remove('h1');
    await settle();
    frames(d.t, 80);
    assert.equal(d.t.aq._play(), null, '鱼全没了：玩法状态丢弃，一笔不画');
    const sets = JSON.stringify(a.t.fc.state.sets) + JSON.stringify(b.t.fc.state.sets) + JSON.stringify(c.t.fc.state.sets);
    assert.ok(!/pellet|ripple|bubble|pull/.test(sets), '玩法状态从不写进存储');
});


test('玩法接线的其余约定：世界没建好时点喂食什么都不发生；喂食钩子过滤坏坐标、认得托盘范围、接上了宿主的 window；窗口失焦取消拖拽', async () => {
    const early = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
    assert.equal(early.aq._world(), null, '还没有帧：world 为空');
    assert.equal(feedButton(early).disabled, false);
    feedButton(early).click();
    assert.equal(early.aq._play(), null);
    assert.equal(early.aq.state().playFailed, false, '不算玩法出错');
    assert.deepEqual(early.warns, []);
    assert.equal(statusText(early), '');

    let hooks = null;
    const wl = {};
    const fakeWin = {
        addEventListener: (n, f) => { (wl[n] = wl[n] || []).push(f); },
        removeEventListener: (n, f) => { wl[n] = (wl[n] || []).filter(x => x !== f); },
    };
    const stub = { drawBack() {}, drawFront() {}, mountFeed: (parent, h) => { hooks = h; return PlayUi.mountFeed(parent, h); } };
    const { t } = await playFish({ env: { play: stub, window: fakeWin } });
    assert.equal(hooks.win, fakeWin, '宿主的 window 接进了喂食按钮');
    assert.equal(hooks.doc, t.d.document);
    assert.equal(typeof hooks.now, 'function');
    hooks.feed({ x: NaN, y: 5 });
    const play = t.aq._play();
    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT);
    const h = t.aq._world().height;
    assert.ok(play.pellets.every(p => p.y < h * 0.3), '没有有效坐标：从上面落下，而不是落在 NaN');
    play.pellets.length = 0;
    play.lastSprinkle = -Infinity;
    hooks.feed({ x: 5, y: NaN });
    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT, '只有 y 坏掉同样当作没有坐标');
    assert.ok(play.pellets.every(p => p.y < h * 0.3));

    const toggle = t.d.findAll(n => n.classes.has('aq-toggle'))[0];
    const panel = t.d.findAll(n => n.classes.has('aq-panel'))[0];
    toggle.rect = { left: 1200, top: 560, width: 40, height: 40 };
    panel.rect = { left: 900, top: 400, width: 272, height: 200 };
    assert.equal(hooks.overUi(1210, 570), true, '开关按钮上');
    for (const [x, y] of [[1200, 570], [1240, 570], [1210, 560], [1210, 600]]) assert.equal(hooks.overUi(x, y), true, `边界上（含）：${x},${y}`);
    for (const [x, y] of [[1199.9, 570], [1240.1, 570], [1210, 559.9], [1210, 600.1]]) assert.equal(hooks.overUi(x, y), false, `边界外：${x},${y}`);
    assert.equal(hooks.overUi(1000, 500), true, '展开的面板上');
    assert.equal(hooks.overUi(600, 300), false, '水里');
    panel.rect = { left: 0, top: 0, width: 0, height: 0 };
    assert.equal(hooks.overUi(0, 0), false, '面板收起（面积为 0）：不算');

    const button = feedButton(t);
    for (const fn of button.listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
    fireDoc(t, 'pointermove', { clientX: 300, clientY: 300 });
    assert.equal(wl.blur.length, 1, '拖拽期间监听窗口失焦');
    const before = play.pellets.length;
    for (const fn of [...wl.blur]) fn();
    assert.equal(t.d.findAll(n => n.classes.has('aq-feed-ghost')).length, 0, '失焦取消拖拽：饲料团消失');
    fireDoc(t, 'pointerup', { clientX: 300, clientY: 300 });
    assert.equal(play.pellets.length, before, '取消后松手不再撒');
});

test('拉尾：后半身没拖就松手 = 点了一下：戳一下并静悄悄收起拉尾记录（没有松手冲刺的泡）', async () => {
    const { t, fish } = await playFish();
    assert.equal(t.aq.grabAt(480, 300), true);
    assert.equal(fish.held.tail, true);
    t.frame({ pointer: { x: 481, y: 300 } });
    assert.equal(t.aq.drop(481, 300), false);
    const play = t.aq._play();
    assert.equal(play.pulls.size, 0, '拉尾记录静悄悄收起');
    assert.equal(play.ripples.length, 1, '点一下 = 戳');
    assert.ok(play.bubbles.length <= PP.POKE_BUBBLES + 1, `只有戳的泡，没有冲刺的泡：${play.bubbles.length}`);
});

test('画法接线：吃到饲料的鱼与被拉着尾巴的鱼，画出来与平时不一样（extras 真的传给了 drawFish）', async () => {
    const { t, fish } = await playFish();
    t.aq.grabAt(520, 300);
    t.aq.drop(520, 300);
    const play = t.aq._play();
    play.ripples.length = 0;
    play.bubbles.length = 0;
    const draw = () => {
        const log = [];
        const ctx = new Proxy({}, {
            get(target, key) {
                if (key in target) return target[key];
                return (...args) => { log.push([String(key), args]); if (/Gradient$/.test(String(key))) return { addColorStop: (...a) => log.push(['stop', a]) }; return undefined; };
            },
            set(target, key, value) { log.push([`set:${String(key)}`, [value]]); target[key] = value; return true; },
        });
        t.frame({ ctx, dt: 0 });
        return JSON.stringify(log);
    };
    const base = draw();
    assert.equal(draw(), base, '同一状态画两次一样');
    play.fed.set(fish.id, play.time + PP.FED_S - 1);
    const fedDraw = draw();
    assert.notEqual(fedDraw, base, '吃到饲料的鱼画得不一样');
    play.fed.clear();
    play.pulls.set(fish.id, { x: -12, y: 0, vx: 0, vy: 0 });
    assert.notEqual(draw(), base, '被拉着尾巴的鱼画得不一样');
});


test('玩法停用后喂食按钮只销毁一次：之后刷新托盘、停止都不再碰它', async () => {
    const counts = { setEnabled: 0, destroy: 0 };
    let real = null;
    const stub = {
        drawBack() {}, drawFront() {},
        mountFeed: (parent, hooks) => {
            real = PlayUi.mountFeed(parent, hooks);
            return { button: real.button, setEnabled: (...a) => { counts.setEnabled++; return real.setEnabled(...a); }, destroy: () => { counts.destroy++; return real.destroy(); } };
        },
    };
    const boom = Object.assign({}, PlayCore, { poke: () => { throw new Error('坏了：poke'); } });
    const { t } = await playFish({ env: { play: stub, playCore: boom } });
    t.aq.grabAt(520, 300);
    t.aq.drop(520, 300);
    assert.equal(t.aq.state().playFailed, true);
    assert.equal(counts.destroy, 1);
    const enabledBefore = counts.setEnabled;
    await t.aq.add('angel');
    await settle();
    assert.equal(counts.setEnabled, enabledBefore, '销毁后刷新托盘不再更新它');
    t.aq.stop();
    assert.equal(counts.destroy, 1, '停止时也不再销毁第二次');
});

test('拉尾后的回弹期间又用前半身抓同一条鱼：不会因为旧的拉尾记录再冲刺一次，旧弹簧照常回到 0', async () => {
    const { t, fish } = await playFish();
    t.aq.grabAt(480, 300);
    for (let i = 0; i < 30; i++) t.frame({ pointer: { x: 480 + i * 10, y: 300 } });
    assert.equal(t.aq.drop(800, 200), true);
    const play = t.aq._play();
    assert.ok(play.pulls.has(fish.id), '尾巴还在回弹');
    fish.vx = 0; fish.vy = 0;
    const head = { x: fish.x + Math.cos(fish.ang) * fish.len * 0.3, y: fish.y + Math.sin(fish.ang) * fish.len * 0.3 };
    assert.equal(t.aq.grabAt(head.x, head.y), true);
    assert.ok(!fish.held.tail, '这次抓的是前半身');
    for (let i = 0; i < 20; i++) t.frame({ pointer: { x: head.x + i * 10, y: head.y } });
    for (const e of [PlayCore.extrasOf(play, fish)]) assert.ok(!e.pull || (Number.isFinite(e.pull.x) && Number.isFinite(e.pull.y)), '旧弹簧没有出 NaN');
    const bubbles = play.bubbles.length;
    assert.equal(t.aq.drop(900, 100), true);
    assert.equal(play.bubbles.length, bubbles, '前半身拖动后松手：没有冲刺的泡');
    frames(t, 200);
    assert.equal(play.pulls.size, 0, '旧弹簧停稳后清掉');
});

test('鱼层出错（画鱼本身）：玩法状态一并丢弃，不留着占内存；这不算玩法出错', async () => {
    const { t } = await playFish();
    t.aq.grabAt(520, 300);
    t.aq.drop(520, 300);
    const play = t.aq._play();
    play.ripples.length = 0;
    play.bubbles.length = 0;
    const bad = new Proxy({}, { get() { return () => { throw new Error('boom'); }; }, set() { return true; } });
    assert.equal(t.frame({ ctx: bad }), false);
    assert.equal(t.aq.state().failed, true);
    assert.equal(t.aq.state().playFailed, false, '是鱼层出的错，不是玩法');
    assert.equal(t.aq._play(), null);
});

// ---------- 写实动物的验收诊断：state().realDrawn / realFailed ----------

// 全新的 aquarium.js 模块实例：realBroken 是模块级状态（“本页面不再用写实画法”），前面有的用例会让画布抛错而把它置位，不能让它影响这里的计数
function freshAquarium() {
    const file = require.resolve('../js/aquarium.js');
    const saved = require.cache[file];
    delete require.cache[file];
    const mod = require('../js/aquarium.js');
    delete require.cache[file];
    if (saved) require.cache[file] = saved;
    return mod;
}

test('state().realDrawn：上一帧用写实画法画出的鱼数——设置开着时写实种类都算，关掉后只剩没有卡通画法的海龟；卡通鱼不算；空世界为 0', async () => {
    const fish = [entry('hammer', 'h1'), entry('manta', 'm1'), entry('whaleshark', 'w1'), entry('turtle', 't1'), entry('clown', 'c1')];
    const t = await make({ stored: { v: 1, fish }, mod: freshAquarium() });
    assert.equal(t.aq.state().realDrawn, 0, '还没有画过任何一帧');
    t.frame({ realistic: true });
    assert.equal(t.aq.state().realDrawn, 4, '小锤头鲨、蝠鲼、鲸鲨、海龟走写实；小丑鱼是卡通');
    t.frame({ realistic: false });
    assert.equal(t.aq.state().realDrawn, 1, '设置关掉：只有海龟（没有卡通画法）还是写实');
    t.frame({ realistic: true });
    assert.equal(t.aq.state().realDrawn, 4, '下一帧重新数，不累加');
    t.frame();
    assert.equal(t.aq.state().realDrawn, 4, '没传 realistic 等同开（只有明确 false 才关）');
    assert.equal(t.aq.state().realFailed, false);
    const plain = await make({ stored: { v: 1, fish: [entry('neon', 'n1'), entry('clown', 'c2')] }, mod: freshAquarium() });
    plain.frame({ realistic: true });
    assert.equal(plain.aq.state().realDrawn, 0, '没有写实种类时为 0');
});
