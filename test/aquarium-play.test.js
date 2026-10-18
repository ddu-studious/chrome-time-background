// 水族馆玩法的画法（涟漪、饲料、泡）与喂食按钮的指针交互。用记录型画布与假 DOM 驱动真实代码：这是业务替身层，不等同于真实 Chrome。
// 画面好不好看靠真实 Chromium 截图判断；这里只守住不会悄悄丢失的约定：深色垫底、画布状态成对保存恢复、省流量少画、坏数据不抛错、取消路径都清理干净。
const test = require('node:test');
const assert = require('node:assert/strict');
const PlayCore = require('../js/aquarium-play-core.js');
const Play = require('../js/aquarium-play.js');

const P = PlayCore.PARAMS;

function recorder() {
    const calls = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => { calls.push([String(key), args]); };
        },
        set(target, key, value) { calls.push([`set:${String(key)}`, [value]]); target[key] = value; return true; },
    });
}
const names = ctx => ctx._calls.map(([n]) => n);
const count = (ctx, name) => names(ctx).filter(n => n === name).length;
const stateOf = (ctx, i) => { const op = ctx._calls.slice(0, i).filter(([n]) => n === 'set:globalCompositeOperation').at(-1); return op ? op[1][0] : '(未设置)'; };

function makeDom() {
    class El {
        constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.attrs = {}; this.listeners = {}; this.style = {}; this.className = ''; this.disabled = false; this._text = ''; }
        set textContent(v) { this._text = String(v); this.children = []; }
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
        set innerHTML(v) { throw new Error('不得使用 innerHTML'); }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
        removeAttribute(k) { delete this.attrs[k]; }
        appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; }
        removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
        remove() { if (this.parent) this.parent.removeChild(this); }
        addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
        removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(x => x !== fn); }
        fire(name, event = {}) { for (const fn of [...(this.listeners[name] || [])]) fn(Object.assign({ type: name, target: this, preventDefault() {}, stopPropagation() {} }, event)); }
    }
    const doc = new El('document');
    doc.body = new El('body');
    doc.createElement = tag => new El(tag);
    const win = new El('window');
    return { doc, win, El };
}

// ---------- 画法 ----------

test('涟漪：没有就一笔不画；有则每圈深色垫底再浅色提亮，半径随进度扩大、越来越淡；画布状态成对保存与恢复；省流量少画内圈', () => {
    const empty = recorder();
    Play.drawBack(empty, { ripples: [], pellets: [], bubbles: [] }, { scale: 1 });
    assert.equal(empty._calls.length, 0);

    const play = { ripples: [{ x: 100, y: 80, t: 0.0 }, { x: 300, y: 80, t: P.RIPPLE_S / 2 }], pellets: [], bubbles: [] };
    const ctx = recorder();
    Play.drawBack(ctx, play, { scale: 0.8, lowPower: false });
    assert.equal(count(ctx, 'save'), 1);
    assert.equal(count(ctx, 'restore'), 1);
    assert.equal(count(ctx, 'arc'), 6, '每圈 3 道：深色垫底、浅色、内圈');
    const arcs = ctx._calls.filter(([n]) => n === 'arc').map(([, a]) => a);
    assert.equal(arcs[0][2], 0, '刚荡开：半径 0');
    const half = P.RIPPLE_R * 0.8 * (1 - 0.25);                                 // 进度 0.5 的缓出：1 − (1 − 0.5)²
    assert.ok(Math.abs(arcs[3][2] - half) < 1e-9, `半径 ${arcs[3][2]} 应为 ${half}`);
    ctx._calls.forEach(([n], i) => { if (n === 'arc') assert.ok(['source-over', 'screen'].includes(stateOf(ctx, i)), '每一道都显式设了合成方式'); });
    const firstArc = ctx._calls.findIndex(([n]) => n === 'arc');
    assert.equal(stateOf(ctx, firstArc), 'source-over', '先用 source-over 垫一圈深色细边');
    const low = recorder();
    Play.drawBack(low, play, { scale: 0.8, lowPower: true });
    assert.equal(count(low, 'arc'), 4, '省流量：每圈 2 道');
});

test('涟漪：越晚越淡，寿命走完时浅色圈完全透明；线条随进度变细', () => {
    const alphaAndWidth = t => {
        const ctx = recorder();
        Play.drawBack(ctx, { ripples: [{ x: 0, y: 0, t }], pellets: [], bubbles: [] }, { scale: 1, lowPower: true });
        const strokes = ctx._calls.filter(([n]) => n === 'set:strokeStyle').map(([, a]) => a[0]);
        const widths = ctx._calls.filter(([n]) => n === 'set:lineWidth').map(([, a]) => a[0]);
        return { dark: Number(/, ([\d.]+)\)$/.exec(strokes[0])[1]), light: Number(/, ([\d.]+)\)$/.exec(strokes[1])[1]), width: widths[1] };
    };
    const a = alphaAndWidth(0);
    const b = alphaAndWidth(P.RIPPLE_S * 0.5);
    const c = alphaAndWidth(P.RIPPLE_S);
    assert.ok(a.light > b.light && b.light > c.light, `浅色圈越来越淡：${a.light} > ${b.light} > ${c.light}`);
    assert.equal(c.light, 0);
    assert.equal(c.dark, 0);
    assert.ok(a.dark > b.dark, '深色垫底圈同样越来越淡');
    assert.ok(a.width > b.width && b.width > c.width, '线条越来越细');
    assert.ok(a.light > 0.4 && a.light < 0.8, `初始透明度在合理范围：${a.light}`);
    assert.ok(b.light < a.light * 0.5 && b.light > a.light * 0.15, `淡出比线性快一些但不是一下子没了：${b.light}（初始 ${a.light}）`);
});

test('涟漪：寿命已超过上限也不出 NaN（半径夹在最大值、透明度为 0），避免颜色字符串失效', () => {
    const ctx = recorder();
    Play.drawBack(ctx, { ripples: [{ x: 5, y: 5, t: P.RIPPLE_S * 3 }], pellets: [], bubbles: [] }, { scale: 0.5, lowPower: true });
    const styles = ctx._calls.filter(([n]) => n === 'set:strokeStyle').map(([, a]) => a[0]);
    assert.ok(styles.length === 2 && styles.every(css => !/NaN/.test(css) && /, 0\.000\)$/.test(css)), `颜色：${styles}`);
    const radii = ctx._calls.filter(([n]) => n === 'arc').map(([, a]) => a[2]);
    assert.ok(radii.every(r => Math.abs(r - P.RIPPLE_R * 0.5) < 1e-9), `半径：${radii}`);
});

test('饲料与泡：饲料先 source-over 画实心与深色细边，再 screen 加暖光；泡用 screen 画圈与高光；省流量去掉光晕与高光；最后 20% 寿命的饲料渐渐淡出', () => {
    const play = {
        ripples: [],
        pellets: [{ x: 10, y: 20, t: 0, life: 14 }, { x: 30, y: 40, t: 13.5, life: 14 }],
        bubbles: [{ x: 50, y: 60, r: 2, t: 0, life: 2 }],
    };
    const ctx = recorder();
    Play.drawFront(ctx, play, { scale: 1, lowPower: false });
    assert.equal(count(ctx, 'save'), 1);
    assert.equal(count(ctx, 'restore'), 1);
    assert.equal(count(ctx, 'arc'), 2 * 2 + 2, '2 粒饲料各 2 道（实心 + 光晕），1 个泡 2 道（圈 + 高光）');
    const firstFill = ctx._calls.findIndex(([n]) => n === 'fill');
    assert.equal(stateOf(ctx, firstFill), 'source-over');
    const sets = ctx._calls.filter(([n]) => n === 'set:fillStyle').map(([, a]) => a[0]);
    const alphaOf = css => Number(/, ([\d.]+)\)$/.exec(css)[1]);
    assert.ok(alphaOf(sets[2]) < alphaOf(sets[0]) * 0.8, `快到寿命的饲料更淡：${sets[0]} → ${sets[2]}`);
    assert.equal(count(ctx, 'stroke'), 2 + 1, '2 粒饲料各描一圈深色细边，泡描一圈');
    assert.ok(ctx._calls.some(([n, a]) => n === 'set:strokeStyle' && /^rgba\(110, 60, 10,/.test(a[0])), '深色细边是暗棕色：亮壁纸上也看得见');
    const low = recorder();
    Play.drawFront(low, play, { scale: 1, lowPower: true });
    assert.equal(count(low, 'arc'), 2 + 1, '省流量：2 粒饲料各 1 道，泡 1 道');
    assert.equal(count(low, 'stroke'), 2 + 1, '省流量也保留深色细边（它决定亮壁纸上看不看得见）');
    const none = recorder();
    Play.drawFront(none, { ripples: [], pellets: [], bubbles: [] }, {});
    assert.equal(none._calls.length, 0);
});

test('画法对坏数据不抛错：非有限的坐标被跳过，缺 view 当作默认', () => {
    const play = {
        ripples: [{ x: NaN, y: 1, t: 0.1 }, { x: 1, y: 1, t: Infinity }, { x: 5, y: 5, t: 99 }],
        pellets: [{ x: NaN, y: 1, t: 0, life: 14 }, { x: 1, y: 1, t: 0, life: NaN }],
        bubbles: [{ x: 1, y: 1, r: NaN, t: 0, life: 2 }],
    };
    const ctx = recorder();
    assert.doesNotThrow(() => { Play.drawBack(ctx, play); Play.drawFront(ctx, play); Play.drawBack(ctx, play, null); Play.drawFront(ctx, play, { scale: 'x' }); });
    assert.equal(count(ctx, 'arc'), 6, '只有 t=99（进度夹到 1）的那一圈有效，画了两次，每次 3 道；饲料与泡的坏数据一笔不画');
    for (const [name, args] of ctx._calls) if (name === 'arc') assert.ok(args.slice(0, 3).every(Number.isFinite), `arc 参数 ${args}`);
});

// ---------- 喂食按钮 ----------

function mount(extra = {}) {
    const { doc, win } = makeDom();
    const parent = doc.createElement('div');
    doc.body.appendChild(parent);
    const fed = [];
    let clock = 1000;
    let over = false;
    const feed = Play.mountFeed(parent, Object.assign({ doc, win, now: () => clock, feed: p => fed.push(p), overUi: () => over }, extra));
    return { doc, win, parent, feed, fed, button: feed.button, tick: ms => { clock += ms; }, setOver: v => { over = v; } };
}
const down = (m, x = 100, y = 100, extra = {}) => m.button.fire('pointerdown', Object.assign({ button: 0, clientX: x, clientY: y, pointerId: 1, isPrimary: true }, extra));
const move = (m, x, y) => m.doc.fire('pointermove', { clientX: x, clientY: y, pointerId: 1 });
const up = (m, x, y) => m.doc.fire('pointerup', { clientX: x, clientY: y, pointerId: 1 });

test('喂食按钮：挂在 parent 里，有名字与说明；点击（含键盘触发的 click）撒一次，point 为 null', () => {
    const m = mount();
    assert.equal(m.button.parent, m.parent);
    assert.equal(m.button.textContent, '喂食');
    assert.ok(/喂食/.test(m.button.getAttribute('aria-label')));
    m.button.fire('click');
    assert.deepEqual(m.fed, [null]);
});

test('从按钮拖出去：拖过 6 px 才出现一小撮饲料跟着指针；在水里松手，在松手处撒；随后 450 ms 内的 click 不再多撒一次，之后恢复', () => {
    const m = mount();
    down(m);
    move(m, 103, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '没拖过 6 px 不出现');
    move(m, 160, 140);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    assert.ok(ghost && ghost.children.length === 3 && ghost.attrs['aria-hidden'] === 'true');
    assert.equal(ghost.style.transform, 'translate(160px, 140px)');
    move(m, 400, 300);
    assert.equal(ghost.style.transform, 'translate(400px, 300px)');
    move(m, 400.4, 300.6);
    assert.equal(ghost.style.transform, 'translate(400px, 301px)', '取整到整像素，避免饲料团发虚');
    move(m, 400, 300);
    up(m, 400, 300);
    assert.deepEqual(m.fed, [{ x: 400, y: 300 }]);
    assert.equal(ghost.parent, null, '松手后饲料团消失');
    assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0, '松手后文档与窗口上不留监听');
    m.button.fire('click');                                                    // 松手落回按钮上时浏览器会再补一个 click
    assert.equal(m.fed.length, 1, '450 ms 内的 click 被吞掉');
    m.tick(500);
    m.button.fire('click');
    assert.equal(m.fed.length, 2, '之后的 click 正常');
});

test('拖拽取消：松在托盘上、Esc、窗口失焦、pointercancel 都不撒，饲料团消失，监听清理干净，随后的 click 同样被吞掉', () => {
    const cancels = [
        ['松在托盘上', m => { m.setOver(true); up(m, 150, 150); }],
        ['Esc', m => m.doc.fire('keydown', { key: 'Escape' })],
        ['窗口失焦', m => m.win.fire('blur')],
        ['pointercancel', m => m.doc.fire('pointercancel', {})],
    ];
    for (const [label, cancel] of cancels) {
        const m = mount();
        down(m);
        move(m, 150, 150);
        const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
        assert.ok(ghost, `${label}：先出现饲料团`);
        cancel(m);
        assert.deepEqual(m.fed, [], label);
        assert.equal(ghost.parent, null, `${label}：饲料团消失`);
        assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0, `${label}：监听清理`);
        m.button.fire('click');
        assert.deepEqual(m.fed, [], `${label}：随后的 click 被吞掉`);
        m.tick(500);
        m.button.fire('click');
        assert.deepEqual(m.fed, [null], `${label}：之后正常`);
    }
});

test('没拖过（移动不到 6 px）就松手：不在松手处撒，由随后的 click 撒一次；非主键、非主指针、禁用时忽略', () => {
    const m = mount();
    down(m); move(m, 102, 101); up(m, 102, 101);
    assert.deepEqual(m.fed, []);
    m.button.fire('click');
    assert.deepEqual(m.fed, [null]);
    const other = mount();
    down(other, 100, 100, { button: 2 }); down(other, 100, 100, { isPrimary: false });
    assert.equal(Object.values(other.doc.listeners).flat().length, 0, '没有被当成开始拖拽');
    other.feed.setEnabled(false, '先放入一条鱼', 'aq-reason');
    down(other);
    assert.equal(Object.values(other.doc.listeners).flat().length, 0, '禁用时不响应');
    other.button.fire('click');
    assert.deepEqual(other.fed, []);
});

test('setEnabled：禁用时按钮 disabled、title 写明原因并指向原因行；启用后恢复；拖拽中被禁用会取消这次拖拽', () => {
    const m = mount();
    const label = m.button.getAttribute('title');
    m.feed.setEnabled(false, '先放入一条鱼，才能喂食', 'aq-reason');
    assert.equal(m.button.disabled, true);
    assert.equal(m.button.getAttribute('title'), '先放入一条鱼，才能喂食');
    assert.equal(m.button.getAttribute('aria-describedby'), 'aq-reason');
    m.feed.setEnabled(true);
    assert.equal(m.button.disabled, false);
    assert.equal(m.button.getAttribute('title'), label);
    assert.equal(m.button.getAttribute('aria-describedby'), null);
    down(m); move(m, 200, 200);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    m.feed.setEnabled(false, '没有鱼');
    assert.equal(ghost.parent, null);
    assert.equal(Object.values(m.doc.listeners).flat().length, 0);
    assert.equal(m.button.getAttribute('aria-describedby'), null, '没给原因行就不挂 describedby');
});

test('destroy：按钮、饲料团、监听全部清掉，之后的事件不再触发', () => {
    const m = mount();
    down(m); move(m, 200, 200);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    m.feed.destroy();
    assert.equal(m.button.parent, null);
    assert.equal(ghost.parent, null);
    assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0);
    up(m, 300, 300);
    assert.deepEqual(m.fed, []);
});

test('没有 win 与 now 也能工作（回落到默认时钟，不抛错）', () => {
    const { doc } = makeDom();
    const parent = doc.createElement('div');
    const fed = [];
    const feed = Play.mountFeed(parent, { doc, feed: p => fed.push(p), overUi: () => false });
    feed.button.fire('pointerdown', { button: 0, clientX: 1, clientY: 1 });
    doc.fire('pointermove', { clientX: 100, clientY: 100 });
    doc.fire('pointerup', { clientX: 100, clientY: 100 });
    assert.deepEqual(fed, [{ x: 100, y: 100 }]);
    feed.destroy();
});

test('拖拽阈值是 6 px：差一点不算拖，刚好 6 px 算拖；按其他键不会取消拖拽，只有 Esc 才取消', () => {
    const m = mount();
    down(m, 100, 100);
    move(m, 105, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '5 px 不算拖');
    move(m, 106, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 1, '刚好 6 px 算拖');
    m.doc.fire('keydown', { key: 'a' });
    m.doc.fire('keydown', {});
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 1, '其他键不取消');
    up(m, 300, 300);
    assert.deepEqual(m.fed, [{ x: 300, y: 300 }]);
    assert.equal(Play.DRAG_PX, 6);
});

test('松手坐标缺失或不是数字时不撒（宁可不撒也不撒到 NaN）；重复按下会先结束上一次拖拽，不残留饲料团', () => {
    const m = mount();
    down(m); move(m, 200, 200);
    m.doc.fire('pointerup', { clientX: undefined, clientY: 'x' });
    assert.deepEqual(m.fed, []);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0);
    const n = mount();
    down(n); move(n, 200, 200);
    down(n, 300, 300);
    assert.equal(n.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '上一次的饲料团被收掉');
    assert.equal(n.doc.listeners.pointermove.length, 1, '没有重复挂监听');
});
