'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/task-crumple-core.js');
const TaskCrumple = require('../js/task-crumple.js');

const P = Core.PARAMS;

// ======================= 极简 DOM 替身 =======================
// 只实现控制器用到的那部分，但选择器解析是真的（属性值的引号转义、:not()、后代组合、逗号列表），
// 这样“任务 id 含引号时仍能正确找到真实条目、找不到克隆体”这类行为才有意义。

function unescapeCss(text) {
    return text.replace(/\\a /g, '\n').replace(/\\d /g, '\r').replace(/\\(.)/g, '$1');
}

function splitTop(selector, isSeparator) {
    const parts = [];
    let depth = 0, quote = null, buffer = '';
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (quote) {
            buffer += ch;
            if (ch === '\\') buffer += selector[++i] || '';
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; buffer += ch; continue; }
        if (ch === '[' || ch === '(') depth++;
        if (ch === ']' || ch === ')') depth--;
        if (depth === 0 && isSeparator(ch)) {
            if (buffer.trim()) parts.push(buffer.trim());
            buffer = '';
            continue;
        }
        buffer += ch;
    }
    if (buffer.trim()) parts.push(buffer.trim());
    return parts;
}

function closeIndex(text, from) {
    let depth = 1;
    for (let i = from; i < text.length; i++) {
        if (text[i] === '(') depth++;
        if (text[i] === ')' && --depth === 0) return i;
    }
    throw new Error('未闭合的括号：' + text);
}

function parseCompound(text) {
    const out = { tag: null, id: null, classes: [], attrs: [], nots: [] };
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '.' || ch === '#') {
            const m = /^[.#]([\w-]+)/.exec(text.slice(i));
            if (ch === '.') out.classes.push(m[1]); else out.id = m[1];
            i += m[0].length;
        } else if (ch === '[') {
            const m = /^\[([\w-]+)(?:=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\]/.exec(text.slice(i));
            if (!m) throw new Error('不支持的属性选择器：' + text);
            out.attrs.push({ name: m[1], value: m[2] === undefined ? null : unescapeCss(m[2].slice(1, -1)) });
            i += m[0].length;
        } else if (text.startsWith(':not(', i)) {
            const end = closeIndex(text, i + 5);
            out.nots.push(parseCompound(text.slice(i + 5, end)));
            i = end + 1;
        } else {
            const m = /^[a-zA-Z][\w-]*/.exec(text.slice(i));
            if (!m) throw new Error('不支持的选择器：' + text);
            out.tag = m[0].toUpperCase();
            i += m[0].length;
        }
    }
    return out;
}

function matchCompound(node, c) {
    if (c.tag && node.tagName !== c.tag) return false;
    if (c.id !== null && node.getAttribute('id') !== c.id) return false;
    for (const cls of c.classes) if (!node._class.has(cls)) return false;
    for (const attr of c.attrs) {
        if (!node.attrs.has(attr.name)) return false;
        if (attr.value !== null && node.attrs.get(attr.name) !== attr.value) return false;
    }
    for (const not of c.nots) if (matchCompound(node, not)) return false;
    return true;
}

function matches(node, selector) {
    return splitTop(selector, ch => ch === ',').some(part => {
        const chain = splitTop(part, ch => /\s/.test(ch)).map(parseCompound);
        let current = node;
        if (!matchCompound(current, chain[chain.length - 1])) return false;
        let index = chain.length - 2;
        current = current.parentNode;
        while (index >= 0 && current) {
            if (matchCompound(current, chain[index])) index--;
            current = current.parentNode;
        }
        return index < 0;
    });
}

class FakeAnimation {
    constructor(target, frames, options) {
        this.target = target;
        this.frames = frames;
        this.options = options;
        this.cancelled = false;
        this.finished = new Promise((resolve, reject) => { this._resolve = resolve; this._reject = reject; });
        this.finished.catch(() => {});
    }
    finish() { this._resolve(this); }
    cancel() { this.cancelled = true; this._reject(new Error('AbortError')); }
}

class FakeNode {
    constructor(tag, doc) {
        this.tagName = String(tag).toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        this.dataset = {};
        this._class = new Set();
        this.style = {};
        this.rect = { left: 0, top: 0, width: 0, height: 0 };
        this.offsetWidth = 0;
        this.offsetHeight = 0;
        this.innerHTML = '';
        this.computed = null;
        this.animations = [];
    }
    get className() { return Array.from(this._class).join(' '); }
    set className(value) { this._class = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get classList() {
        const set = this._class;
        return { add: (...names) => names.forEach(n => set.add(n)), remove: (...names) => names.forEach(n => set.delete(n)), contains: n => set.has(n) };
    }
    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node === this.ownerDocument.documentElement;
    }
    setAttribute(name, value) {
        this.attrs.set(name, String(value));
        if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
        if (name === 'class') this.className = value;
    }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    removeAttribute(name) {
        this.attrs.delete(name);
        if (name.startsWith('data-')) delete this.dataset[name.slice(5)];
    }
    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index < 0) throw new Error('不是子节点');
        this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }
    cloneNode(deep) {
        const copy = new FakeNode(this.tagName, this.ownerDocument);
        copy._class = new Set(this._class);
        for (const [key, value] of this.attrs) copy.setAttribute(key, value);
        copy.style = { ...this.style };
        copy.rect = { ...this.rect };
        copy.offsetWidth = this.offsetWidth;
        copy.offsetHeight = this.offsetHeight;
        copy.innerHTML = this.innerHTML;
        copy.computed = this.computed ? { ...this.computed } : null;
        if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
        return copy;
    }
    querySelectorAll(selector) {
        const found = [];
        const walk = node => { for (const child of node.children) { if (matches(child, selector)) found.push(child); walk(child); } };
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) {
        for (let node = this; node; node = node.parentNode) if (matches(node, selector)) return node;
        return null;
    }
    getBoundingClientRect() {
        const r = this.rect;
        return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height };
    }
    animate(frames, options) {
        const animation = new FakeAnimation(this, frames, options);
        this.animations.push(animation);
        this.ownerDocument.animations.push(animation);
        return animation;
    }
}

class FakeDocument {
    constructor() {
        this.documentElement = new FakeNode('html', this);
        this.body = new FakeNode('body', this);
        this.documentElement.appendChild(this.body);
        this.hidden = false;
        this.listeners = [];
        this.animations = [];
    }
    createElement(tag) { return new FakeNode(tag, this); }
    addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: !!capture }); }
    removeEventListener(type, fn, capture) {
        this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === !!capture));
    }
    querySelector(selector) { return this.documentElement.querySelector(selector); }
    click(target) {
        const event = { type: 'click', target };
        for (const listener of this.listeners.slice()) if (listener.type === 'click' && listener.capture) listener.fn(event);
        return event;
    }
}

function makeTimers() {
    let now = 0, nextId = 1;
    const queue = new Map();
    return {
        now: () => now,
        setTimeout(fn, ms) { const id = nextId++; queue.set(id, { at: now + ms, fn }); return id; },
        clearTimeout(id) { queue.delete(id); },
        advance(ms) {
            const target = now + ms;
            for (;;) {
                let pickId = null, pick = null;
                for (const [id, timer] of queue) if (timer.at <= target && (!pick || timer.at < pick.at)) { pickId = id; pick = timer; }
                if (!pick) break;
                queue.delete(pickId);
                now = Math.max(now, pick.at);
                pick.fn();
            }
            now = target;
        },
        pending: () => queue.size,
    };
}

function seeded(seed = 11) {
    let state = seed >>> 0;
    return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

const BASE_STYLE = Object.freeze({
    color: 'rgb(240, 240, 240)', fontFamily: 'Inter', fontSize: '14px', lineHeight: '20px', letterSpacing: 'normal',
    borderRadius: '12px', opacity: '1', visibility: 'visible', transform: 'none',
});

function buildPage(options = {}) {
    const doc = new FakeDocument();
    doc.hidden = !!options.hidden;
    const timers = makeTimers();
    const win = {
        innerWidth: options.width || 1440,
        innerHeight: options.height || 900,
        getComputedStyle: node => node.computed || BASE_STYLE,
        matchMedia: () => ({ matches: !!options.reduceMotion }),
        navigator: { connection: options.saveData ? { saveData: true } : undefined },
        backgroundExperience: options.experience,
        SpringFeel: options.SpringFeel,
    };
    const list = doc.createElement('div');
    list.setAttribute('id', 'sidebar-task-list');
    list.className = 'sidebar-task-list';
    list.rect = { left: 100, top: 100, width: 1000, height: 700 };
    doc.body.appendChild(list);

    function addItem(id, rect, extra = {}) {
        const item = doc.createElement('div');
        item.className = [extra.itemClass || 'sidebar-task-item', extra.completed ? 'completed' : '', extra.failed ? 'failed' : '', 'priority-high'].filter(Boolean).join(' ');
        if (id !== null) item.setAttribute('data-id', id);
        item.setAttribute('data-index', '1');
        item.setAttribute('draggable', 'true');
        item.rect = { ...rect };
        item.offsetWidth = extra.offsetWidth || rect.width;
        item.offsetHeight = extra.offsetHeight || rect.height;
        item.computed = { ...BASE_STYLE };
        const box = doc.createElement('div');
        box.className = 'task-checkbox';
        box.setAttribute('title', '标记为已完成');
        box.rect = { left: rect.left + 14, top: rect.top + 20, width: 20, height: 20 };
        const icon = doc.createElement('i');
        icon.className = 'far fa-circle';
        box.appendChild(icon);
        const title = doc.createElement('div');
        title.className = 'task-title';
        title.setAttribute('id', 'title-' + String(id));
        const actions = doc.createElement('div');
        actions.className = 'task-actions';
        actions.computed = { ...BASE_STYLE };
        item.appendChild(box);
        item.appendChild(title);
        item.appendChild(actions);
        (extra.parent || list).appendChild(item);
        return { item, box, icon, title, actions };
    }

    // 模拟 memo.js 的行为：保存后整表重绘，旧节点被换成新节点（完成的条目带 .completed、位置变了）。
    function rerender(id, extra = {}) {
        const old = list.querySelector(`.sidebar-task-item[data-id="${Core.escapeAttr(id)}"]`);
        if (old) old.parentNode.removeChild(old);
        if (extra.remove) return null;
        return addItem(id, extra.rect || { left: 100, top: 600, width: 1000, height: 120 }, { completed: extra.completed !== false });
    }

    const api = TaskCrumple.create({
        document: doc, window: win, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        now: timers.now, random: seeded(),
    });
    api.attach();
    return { doc, win, timers, list, addItem, rerender, api };
}

const RECT_A = { left: 120, top: 200, width: 900, height: 120 };
const RECT_B = { left: 120, top: 340, width: 900, height: 120 };
const RECT_C = { left: 120, top: 480, width: 900, height: 120 };
const RECT_D = { left: 120, top: 620, width: 900, height: 120 };

function layerOf(page) {
    return page.doc.body.children.find(node => node._class.has('task-crumple-layer')) || null;
}

async function flush() {
    for (let i = 0; i < 4; i++) await Promise.resolve();
}

// ======================= 测试 =======================

test('点击未完成条目的勾选框：创建一组纸篓前层、纸片+折痕、纸团、纸篓后层，并按时间线挂上全部动画', () => {
    const page = buildPage();
    const { box } = page.addItem('t1', RECT_A);
    const event = page.doc.click(box);
    assert.ok(event);

    const layer = layerOf(page);
    assert.ok(layer, '应出现动效层');
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.getAttribute('inert'), '');
    assert.equal(page.api.activeCount(), 1);

    const runs = layer.querySelectorAll('.tc-run');
    assert.equal(runs.length, 1);
    const root = runs[0];
    assert.deepEqual(root.children.map(node => node.className), ['tc-bin tc-bin-back', 'tc-paper', 'tc-ball', 'tc-bin tc-bin-front']);
    const paper = root.children[1];
    assert.equal(paper.children.length, 2);
    assert.ok(paper.children[0]._class.has('tc-clone'));
    assert.ok(paper.children[1]._class.has('tc-shade'));

    const run = Array.from(page.api._runs)[0];
    const plan = run.plan;
    const byTarget = new Map();
    for (const animation of page.doc.animations) {
        byTarget.set(animation.target, (byTarget.get(animation.target) || []).concat(animation));
    }
    assert.equal(page.doc.animations.length, 7);
    const [binBack, , ball, binFront] = root.children;
    assert.equal(byTarget.get(paper).length, 1);
    assert.equal(byTarget.get(paper.children[1]).length, 1);
    assert.equal(byTarget.get(ball).length, 1);
    assert.equal(byTarget.get(binBack).length, 2, '显现 + 晃动');
    assert.equal(byTarget.get(binFront).length, 2);

    // 主动画：同一总时长、前后都保持，关键帧就是时间线算出来的那一份
    assert.deepEqual(byTarget.get(paper)[0].frames, plan.paper);
    assert.deepEqual(byTarget.get(ball)[0].frames, plan.ball);
    assert.deepEqual(byTarget.get(binBack)[0].frames, plan.bin);
    for (const animation of [byTarget.get(paper)[0], byTarget.get(ball)[0], byTarget.get(binBack)[0], byTarget.get(binFront)[0]]) {
        assert.equal(animation.options.duration, plan.total);
        assert.equal(animation.options.fill, 'both');
    }
    // 晃动：独立 rotate 动画，延迟 = 纸团到达时刻，没有 SpringFeel 时退回普通缓动
    for (const target of [binBack, binFront]) {
        const wobble = byTarget.get(target)[1];
        assert.deepEqual(wobble.frames, [{ rotate: `${P.WOBBLE_DEG}deg` }, { rotate: '0deg' }]);
        assert.equal(wobble.options.delay, plan.wobble.delay);
        assert.equal(wobble.options.duration, plan.wobble.duration);
        assert.equal(wobble.options.easing, 'ease-out');
        assert.equal(wobble.options.fill, 'none');
    }

    // 几何：纸片盖在可见区域上，原点在勾选框中心；纸团从纸片最终形状的中心起飞；纸篓在列表右下角
    assert.equal(paper.style.left, '120px');
    assert.equal(paper.style.top, '200px');
    assert.equal(paper.style.width, '900px');
    assert.equal(paper.style.height, '120px');
    // 勾选框 rect = {left: 134, top: 220, 20×20}，中心 (144, 230)，相对可见区域左上角 (120, 200) 即 (24, 30)
    assert.equal(paper.style.transformOrigin, '24px 30px');
    assert.equal(paper.style.borderRadius, '12px');
    assert.equal(ball.style.left, `${plan.ballStart.x - P.BALL / 2}px`);
    assert.equal(ball.style.top, `${plan.ballStart.y - P.BALL / 2}px`);
    const bin = Core.binPlacement(page.list.getBoundingClientRect(), { width: 1440, height: 900 }, 0);
    assert.equal(binBack.style.left, `${bin.left}px`);
    assert.equal(binFront.style.top, `${bin.top}px`);
    assert.ok(binBack.innerHTML.includes('<ellipse'));
    assert.ok(binFront.innerHTML.includes('<path'));
});

test('克隆体是“完成后的样子”，且不能被页面当成真实条目；原条目一点没动', () => {
    const page = buildPage();
    const { item, box, icon } = page.addItem('t1', RECT_A);
    const before = JSON.stringify({ cls: item.className, attrs: Array.from(item.attrs), kids: item.children.length, icon: icon.className, style: item.style });
    page.doc.click(box);
    const clone = layerOf(page).querySelector('.tc-clone');
    assert.ok(clone);

    for (const name of ['sidebar-task-item', 'priority-high', 'completed', 'tc-clone']) assert.ok(clone._class.has(name), `缺少 ${name}`);
    for (const name of ['id', 'data-id', 'data-index', 'draggable']) assert.equal(clone.getAttribute(name), null, `克隆体不应保留 ${name}`);
    assert.equal(clone.querySelectorAll('[id]').length, 0, '子孙节点也不能留 id');
    assert.equal(clone.getAttribute('aria-hidden'), 'true');
    assert.equal(clone.getAttribute('inert'), '');
    assert.equal(clone.querySelector('.task-checkbox i').className, 'fas fa-check-circle');
    assert.equal(clone.querySelector('.task-checkbox').getAttribute('title'), '标记为未完成');

    // 页面按 id 查“已完成条目”或“任意条目”都找不到克隆体
    assert.equal(page.doc.querySelector(Core.doneSelector('t1')), null);
    assert.equal(page.doc.querySelector(Core.anySelector('t1')), item);

    const after = JSON.stringify({ cls: item.className, attrs: Array.from(item.attrs), kids: item.children.length, icon: icon.className, style: item.style });
    assert.equal(after, before, '原条目不能被改动（完成与否由 memo.js 决定）');
});

test('悬停态被固定到克隆上：子元素当前的不透明度/变换/可见性被复制，根节点不透明度固定为 1，继承的文字样式也复制', () => {
    const page = buildPage();
    const { box, actions } = page.addItem('t1', RECT_A);
    actions.computed = { ...BASE_STYLE, opacity: '0.4', visibility: 'hidden', transform: 'matrix(1.1, 0, 0, 1.1, 0, 0)' };
    page.doc.click(box);
    const clone = layerOf(page).querySelector('.tc-clone');
    const twin = clone.querySelector('.task-actions');
    assert.equal(twin.style.opacity, '0.4');
    assert.equal(twin.style.visibility, 'hidden');
    assert.equal(twin.style.transform, 'matrix(1.1, 0, 0, 1.1, 0, 0)');
    // 默认值的子元素不写内联样式
    assert.equal(clone.querySelector('.task-title').style.opacity, undefined);
    assert.equal(clone.style.opacity, '1');
    assert.equal(clone.style.color, BASE_STYLE.color);
    assert.equal(clone.style.fontFamily, 'Inter');
    assert.equal(clone.style.margin, '0');
    assert.equal(clone.style.position, 'absolute');
    assert.equal(clone.style.width, '900px');
    assert.equal(clone.style.height, '120px');
    assert.equal(clone.style.transform, '', '没有祖先缩放就不加缩放');
});

test('祖先带缩放（面板入场过渡中）：克隆用布局尺寸并套同样的缩放还原看到的大小', () => {
    const page = buildPage();
    const { box } = page.addItem('t1', { left: 120, top: 200, width: 900, height: 120 }, { offsetWidth: 1000, offsetHeight: 133 });
    page.doc.click(box);
    const clone = layerOf(page).querySelector('.tc-clone');
    assert.equal(clone.style.width, '1000px');
    assert.equal(clone.style.height, '133px');
    assert.equal(clone.style.transformOrigin, '0px 0px');
    assert.match(clone.style.transform, /^scale\(0\.9, 0\.90225/);
});

test('条目被列表滚动区域裁掉一部分：纸片只取可见的那一块，克隆按偏移放进去', () => {
    const page = buildPage();
    // 条目顶部在列表上沿（100）之上 40px
    const { box } = page.addItem('t1', { left: 120, top: 60, width: 900, height: 120 });
    // 勾选框被裁到范围之外时，原点退回左侧中线
    box.rect = { left: 134, top: 70, width: 20, height: 20 };
    page.doc.click(box);
    const root = layerOf(page).querySelector('.tc-run');
    const paper = root.children[1];
    assert.equal(paper.style.top, '100px');
    assert.equal(paper.style.height, '80px');
    assert.equal(paper.style.transformOrigin, '24px 40px');
    assert.equal(paper.children[0].style.top, '-40px');
    assert.equal(paper.children[0].style.height, '120px');
});

test('只露出一条缝（可见高度小于下限）时不播放，也不留下任何东西', () => {
    const page = buildPage();
    const { box } = page.addItem('t1', { left: 120, top: 790, width: 900, height: 120 });
    page.doc.click(box);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
    assert.equal(page.doc.animations.length, 0);
});

test('不满足条件时不播放：非勾选框点击、已完成/失败条目、没有 id、设置关闭、减少动态、省流量、页面隐藏', () => {
    const cases = {
        '点标题而不是勾选框': page => { const { title } = page.addItem('t1', RECT_A); return title; },
        '已完成条目（取消完成）': page => page.addItem('t1', RECT_A, { completed: true }).box,
        '失败态条目（memo.js 里直接忽略点击）': page => page.addItem('t1', RECT_A, { failed: true }).box,
        '没有 data-id': page => page.addItem(null, RECT_A).box,
        '不在任务条目里的勾选框': page => { const stray = page.doc.createElement('div'); stray.className = 'task-checkbox'; page.doc.body.appendChild(stray); return stray; },
        '没有 closest 的点击目标': () => ({}),
        '空点击目标': () => null,
    };
    for (const [name, make] of Object.entries(cases)) {
        const page = buildPage();
        const target = make(page);
        assert.doesNotThrow(() => page.doc.click(target), name);
        assert.equal(layerOf(page), null, name);
        assert.equal(page.doc.animations.length, 0, name);
    }

    const gates = {
        '任务完成动效关闭': { experience: { settings: { enabled: true, taskCrumple: false } } },
        '背景体验总开关关闭': { experience: { settings: { enabled: false, taskCrumple: true } } },
        '系统减少动态效果': { reduceMotion: true },
        '省流量模式': { saveData: true },
        '页面隐藏': { hidden: true },
    };
    for (const [name, options] of Object.entries(gates)) {
        const page = buildPage(options);
        page.doc.click(page.addItem('t1', RECT_A).box);
        assert.equal(layerOf(page), null, name);
    }

    // 对照：设置缺失 / 设置里没有该字段 / 字段为 true 时都正常播放
    for (const experience of [undefined, { settings: {} }, { settings: { taskCrumple: true } }, { settings: null }]) {
        const page = buildPage({ experience });
        page.doc.click(page.addItem('t1', RECT_A).box);
        assert.ok(layerOf(page), JSON.stringify(experience));
    }
});

test('面板里的条目（.panel-task-item / #panel-task-list）同样支持，纸篓落在面板列表的右下角', () => {
    const page = buildPage();
    const panel = page.doc.createElement('div');
    panel.setAttribute('id', 'panel-task-list');
    panel.rect = { left: 300, top: 150, width: 600, height: 500 };
    page.doc.body.appendChild(panel);
    const { box } = page.addItem('p1', { left: 320, top: 200, width: 560, height: 90 }, { itemClass: 'panel-task-item', parent: panel });
    page.doc.click(box);
    const root = layerOf(page).querySelector('.tc-run');
    const expected = Core.binPlacement(panel.getBoundingClientRect(), { width: 1440, height: 900 }, 0);
    assert.equal(root.children[0].style.left, `${expected.left}px`);

    // 重绘后以 .panel-task-item 的 .completed 确认
    const old = panel.querySelector('.panel-task-item');
    panel.removeChild(old);
    const fresh = page.addItem('p1', { left: 320, top: 500, width: 560, height: 90 }, { itemClass: 'panel-task-item', parent: panel, completed: true });
    page.timers.advance(P.CONFIRM_POLL_MS + 5);
    assert.equal(fresh.item.animations.length, 1, '真实条目收到落定光圈');
});

test('条目不在任何任务列表里时，纸篓退回视口右下角', () => {
    const page = buildPage();
    const { box } = page.addItem('t1', RECT_A, { parent: page.doc.body });
    page.doc.click(box);
    const root = layerOf(page).querySelector('.tc-run');
    const corner = Core.binPlacement(null, { width: 1440, height: 900 }, 0);
    assert.equal(root.children[0].style.left, `${corner.left}px`);
    assert.equal(root.children[0].style.top, `${corner.top}px`);
});

test('完成被确认：列表重绘出同 id 的 .completed 条目后，给它一次延后的绿色光圈，动效继续播完不撤销', () => {
    const page = buildPage();
    const { box } = page.addItem('t1', RECT_A);
    page.doc.click(box);
    const run = Array.from(page.api._runs)[0];

    page.timers.advance(20);
    const fresh = page.rerender('t1');   // memo.js 重绘
    page.timers.advance(40);             // 第一次轮询在 CONFIRM_POLL_MS 时刻
    assert.equal(run.confirmed, true);
    assert.equal(fresh.item.animations.length, 1);
    const pulse = fresh.item.animations[0];
    assert.equal(pulse.options.duration, P.PULSE_MS);
    assert.equal(pulse.options.delay, run.plan.pulse.delay - P.CONFIRM_POLL_MS, '光圈要等纸团入篓后才亮');
    assert.equal(pulse.options.fill, 'none');
    assert.ok(pulse.frames[0].boxShadow.startsWith('0 0 0 0'));
    assert.ok(pulse.frames[1].boxShadow.includes('rgba(94, 234, 170, 0)'), '光圈扩散后完全透明');

    // 推进到确认窗口的两倍（仍早于“总时长 + 700ms”的兜底清理）：确认过的动效不会被当成超时撤销
    page.timers.advance(P.CONFIRM_MS * 2);
    assert.equal(run.aborted, false);
    assert.ok(layerOf(page), '动效没有被撤销');
    assert.equal(run.root.animations.length, 0, '也没有对整组加撤销用的淡出');
});

test('光圈延迟 = 计划里的入篓时刻减去已经过去的时间（确认得越晚等得越短），不会为负', () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    const run = Array.from(page.api._runs)[0];
    page.timers.advance(P.CONFIRM_POLL_MS * 4);   // 约 200ms 才确认
    const fresh = page.rerender('t1');
    page.timers.advance(P.CONFIRM_POLL_MS);
    const elapsed = page.timers.now() - run.startedAt;
    assert.equal(fresh.item.animations[0].options.delay, Math.max(0, run.plan.pulse.delay - elapsed));
});

test('没有等到“已完成”：超过确认窗口就淡出并撤掉，不假装发生过，也不动真实条目', () => {
    const page = buildPage();
    const { item, box } = page.addItem('t1', RECT_A);
    page.doc.click(box);
    const run = Array.from(page.api._runs)[0];

    page.timers.advance(P.CONFIRM_MS - 60);
    assert.equal(run.aborted, false, '窗口内继续等');
    page.timers.advance(120);
    assert.equal(run.aborted, true);
    const fade = run.root.animations.find(animation => animation.frames[0] && animation.frames[0].opacity === 1);
    assert.ok(fade, '淡出撤销');
    assert.equal(fade.options.fill, 'forwards');
    assert.equal(item.animations.length, 0, '没有给任何真实条目加光圈');

    page.timers.advance(200);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
});

test('重绘了但新条目不是 .completed（完成被回退）：同样撤销', () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    const run = Array.from(page.api._runs)[0];
    page.timers.advance(30);
    page.rerender('t1', { completed: false });
    page.timers.advance(P.CONFIRM_MS + 200);
    assert.equal(run.aborted, true);
    assert.equal(layerOf(page), null);
});

test('列表重绘后这一条被筛选掉（例如只看未完成）：旧节点已断开且新列表没有它，视为已处理，不撤销', () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    const run = Array.from(page.api._runs)[0];
    page.timers.advance(30);
    page.rerender('t1', { remove: true });
    page.timers.advance(P.CONFIRM_POLL_MS + 5);
    assert.equal(run.confirmed, true);
    page.timers.advance(P.CONFIRM_MS * 2);
    assert.equal(run.aborted, false);
});

test('任务 id 里有引号和反斜杠：仍能找到真实的已完成条目，选择器没有被注入改写', () => {
    const page = buildPage();
    const id = 'a"b\\c] , .completed';
    page.doc.click(page.addItem(id, RECT_A).box);
    const run = Array.from(page.api._runs)[0];
    page.addItem('other', RECT_B, { completed: true });   // 另一个已完成条目不能被误认
    page.timers.advance(P.CONFIRM_POLL_MS + 5);
    assert.equal(run.confirmed, false, '别的条目已完成不等于这一条已完成');
    const fresh = page.rerender(id);
    page.timers.advance(P.CONFIRM_POLL_MS + 5);
    assert.equal(run.confirmed, true);
    assert.equal(fresh.item.animations.length, 1);
});

test('动画正常结束：动效层与这一组一起移除，下一次点击重新创建', async () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    assert.ok(layerOf(page));
    page.doc.animations[0].finish();
    await flush();
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
    assert.equal(page.timers.pending(), 0, '清理后不留任何定时器');

    page.doc.click(page.addItem('t2', RECT_B).box);
    assert.ok(layerOf(page));
    assert.equal(page.api.activeCount(), 1);
});

test('动画被取消或根本不结束（页面隐藏等）：兜底定时器照样清理，不留残影', async () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    const run = Array.from(page.api._runs)[0];
    page.rerender('t1');
    page.timers.advance(run.plan.total + 699);
    assert.ok(layerOf(page), '兜底时刻之前还在');
    page.timers.advance(2);
    assert.equal(layerOf(page), null);
    assert.equal(page.timers.pending(), 0);

    // 取消同样走清理
    const other = buildPage();
    other.doc.click(other.addItem('t1', RECT_A).box);
    other.doc.animations[0].cancel();
    await flush();
    assert.equal(layerOf(other), null);
});

test('并发上限：同时最多 MAX_ACTIVE 组，纸篓依次向左排开；有一组结束后空位可以复用', async () => {
    const page = buildPage();
    const boxes = [RECT_A, RECT_B, RECT_C, RECT_D].map((rect, index) => page.addItem('t' + index, rect).box);
    for (const box of boxes.slice(0, P.MAX_ACTIVE)) page.doc.click(box);
    assert.equal(page.api.activeCount(), P.MAX_ACTIVE);
    assert.equal(layerOf(page).querySelectorAll('.tc-run').length, P.MAX_ACTIVE, '共用同一个动效层');

    const lefts = layerOf(page).querySelectorAll('.tc-run').map(root => parseFloat(root.children[0].style.left));
    assert.equal(new Set(lefts).size, P.MAX_ACTIVE, '每组纸篓位置不同，不会半透明叠影');
    assert.deepEqual(lefts, lefts.slice().sort((x, y) => y - x), '依次向左排开');
    assert.equal(lefts[0] - lefts[1], P.BIN_W + P.BIN_GAP);

    page.doc.click(boxes[P.MAX_ACTIVE]);   // 已满：正常完成，只是不播
    assert.equal(page.api.activeCount(), P.MAX_ACTIVE);

    // 结束中间那一组，空出它的位置给新的点击
    const second = Array.from(page.api._runs)[1];
    const freedLeft = parseFloat(second.root.children[0].style.left);
    second.animations[0].finish();
    await flush();
    assert.equal(page.api.activeCount(), P.MAX_ACTIVE - 1);
    page.doc.click(boxes[P.MAX_ACTIVE]);
    assert.equal(page.api.activeCount(), P.MAX_ACTIVE);
    const reused = Array.from(page.api._runs).map(run => parseFloat(run.root.children[0].style.left));
    assert.ok(reused.includes(freedLeft), '复用了空出来的纸篓位置');
});

test('异常安全：测量或构建中途抛错，点击不报错、不留动效层、不占并发名额', () => {
    // 测量阶段
    const measure = buildPage();
    const a = measure.addItem('t1', RECT_A);
    a.item.getBoundingClientRect = () => { throw new Error('boom'); };
    assert.doesNotThrow(() => measure.doc.click(a.box));
    assert.equal(layerOf(measure), null);
    assert.equal(measure.api.activeCount(), 0);

    // 构建阶段：给纸团的 animate 装一个炸弹
    const build = buildPage();
    const originalCreate = build.doc.createElement.bind(build.doc);
    build.doc.createElement = tag => {
        const node = originalCreate(tag);
        const originalAnimate = node.animate.bind(node);
        node.animate = (frames, options) => {
            if (node._class.has('tc-ball')) throw new Error('animate failed');
            return originalAnimate(frames, options);
        };
        return node;
    };
    const b = build.addItem('t1', RECT_A);
    assert.doesNotThrow(() => build.doc.click(b.box));
    assert.equal(layerOf(build), null, '失败后动效层被清掉');
    assert.equal(build.api.activeCount(), 0);
    assert.equal(build.timers.pending(), 0);

    // 不支持 Web Animations 的环境：元素没有 animate，只是没有动效，也不报错
    const plain = buildPage();
    const originalPlain = plain.doc.createElement.bind(plain.doc);
    plain.doc.createElement = tag => { const node = originalPlain(tag); node.animate = undefined; return node; };
    assert.doesNotThrow(() => plain.doc.click(plain.addItem('t1', RECT_A).box));
});

test('晃动缓动优先复用 SpringFeel；它缺席或抛错时退回普通缓动', () => {
    const stub = buildPage({ SpringFeel: { easing: name => `spring:${name}` } });
    stub.doc.click(stub.addItem('t1', RECT_A).box);
    const wobbles = stub.doc.animations.filter(animation => animation.options.delay > 0);
    assert.equal(wobbles.length, 2);
    for (const animation of wobbles) assert.equal(animation.options.easing, 'spring:bouncy');

    const broken = buildPage({ SpringFeel: { easing: () => { throw new Error('nope'); } } });
    assert.doesNotThrow(() => broken.doc.click(broken.addItem('t1', RECT_A).box));
    assert.ok(broken.doc.animations.filter(animation => animation.options.delay > 0).every(animation => animation.options.easing === 'ease-out'));
});

test('attach 幂等且用捕获阶段；detach 摘掉监听并收掉进行中的动效', () => {
    const page = buildPage();
    page.api.attach();
    page.api.attach();
    assert.equal(page.doc.listeners.length, 1);
    assert.equal(page.doc.listeners[0].capture, true, '必须是捕获阶段，赶在 memo.js 重绘前量到原条目');
    assert.equal(page.doc.listeners[0].type, 'click');

    page.doc.click(page.addItem('t1', RECT_A).box);
    assert.equal(page.api.activeCount(), 1);
    page.api.detach();
    assert.equal(page.doc.listeners.length, 0);
    assert.equal(page.api.activeCount(), 0);
    assert.equal(layerOf(page), null);

    page.doc.click(page.addItem('t2', RECT_B).box);
    assert.equal(layerOf(page), null, '摘掉后不再响应');
    page.api.detach();   // 重复摘除不抛
    assert.equal(page.api.init, page.api.attach);
});

test('动效层被外部移走（别的脚本清了 body）：下一次点击重新创建，旧的一组仍能正常收尾', async () => {
    const page = buildPage();
    page.doc.click(page.addItem('t1', RECT_A).box);
    const first = layerOf(page);
    page.doc.body.removeChild(first);
    assert.equal(layerOf(page), null);

    page.doc.click(page.addItem('t2', RECT_B).box);
    const second = layerOf(page);
    assert.ok(second && second !== first, '应创建新的动效层');
    assert.equal(page.api.activeCount(), 2);

    for (const run of Array.from(page.api._runs)) run.animations[0].finish();
    await flush();
    assert.equal(page.api.activeCount(), 0);
    assert.equal(layerOf(page), null);
});

// ======================= 抓取水母用的纸篓（holdBin，2026-10-15） =======================
// 水母皮肤把水母抓起来拖向这个纸篓：纸篓只是视觉落点（升起、对准时放大发光、吞下时晃一下、收起），
// 不读写任何数据；落没落进去、任务有没有完成由调用方决定。几何复用 binPlacement，同一个动效层、同一套槽位。

const VIEW = { width: 1440, height: 900 };

test('holdBin：在视口右下角升起纸篓（只有前后两层，没有纸片和纸团），用 Web Animations 淡入，占一个槽位', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    assert.ok(bin);
    const layer = layerOf(page);
    assert.ok(layer, '应出现动效层');
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.getAttribute('inert'), '');
    assert.equal(page.api.activeCount(), 1);
    const roots = layer.querySelectorAll('.tc-run');
    assert.equal(roots.length, 1);
    assert.ok(roots[0]._class.has('tc-hold'));
    assert.deepEqual(roots[0].children.map(node => node.className), ['tc-bin tc-bin-back', 'tc-bin tc-bin-front']);
    const [back, front] = roots[0].children;
    const place = Core.binPlacement(null, VIEW, 0);
    for (const part of [back, front]) {
        assert.equal(part.style.left, `${place.left}px`);
        assert.equal(part.style.top, `${place.top}px`);
        assert.equal(part.style.width, `${place.width}px`);
        assert.equal(part.style.height, `${place.height}px`);
    }
    assert.ok(back.innerHTML.includes('<ellipse'));
    assert.ok(front.innerHTML.includes('<path'));
    assert.deepEqual(bin.mouth(), { x: place.mouthX, y: place.mouthY });
    assert.deepEqual(bin.rect(), { left: place.left, top: place.top, width: place.width, height: place.height });
    assert.equal(bin.isActive(), true);
    assert.equal(page.doc.animations.length, 2);
    for (const animation of page.doc.animations) {
        assert.equal(animation.options.duration, P.HOLD_FADE_MS);
        assert.equal(animation.options.fill, 'forwards');
        assert.equal(animation.frames[0].opacity, 0);
        assert.equal(animation.frames[animation.frames.length - 1].opacity, 1);
    }
    assert.equal(page.timers.pending(), 1, '只有一个兜底计时器');
});

test('holdBin.contains：指针进入纸篓外框放大 BIN_HOT 以内才算对准；收起之后一律不算', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    const place = Core.binPlacement(null, VIEW, 0);
    assert.equal(bin.contains(place.mouthX, place.mouthY), true);
    assert.equal(bin.contains(place.left - P.BIN_HOT, place.top + 10), true);
    assert.equal(bin.contains(place.left - P.BIN_HOT - 2, place.top + 10), false);
    assert.equal(bin.contains(NaN, 3), false);
    assert.equal(bin.contains(100, 100), false);
    bin.release();
    assert.equal(bin.contains(place.mouthX, place.mouthY), false, '已经在收起，不能再当落点');
});

test('holdBin.setNear：对准时纸篓放大并发光，离开时还原；重复设置不重复播动画；收起后无效', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    const before = page.doc.animations.length;
    bin.setNear(false);
    assert.equal(page.doc.animations.length, before, '本来就不是“对准”，不动');
    bin.setNear(true);
    const grown = page.doc.animations.slice(before);
    assert.equal(grown.length, 2, '前后两层各一条');
    for (const animation of grown) {
        assert.equal(animation.options.fill, 'forwards');
        assert.deepEqual(animation.frames.map(frame => frame.scale), ['1', String(P.NEAR_SCALE)]);
    }
    assert.ok(grown.some(animation => animation.frames.some(frame => typeof frame.filter === 'string' && /drop-shadow/.test(frame.filter))), '前层带发光');
    bin.setNear(true);
    bin.setNear(1);
    assert.equal(page.doc.animations.length, before + 2, '已经是对准态，重复设置无动作');
    bin.setNear(false);
    const shrunk = page.doc.animations.slice(before + 2);
    assert.equal(shrunk.length, 2);
    for (const animation of shrunk) assert.deepEqual(animation.frames.map(frame => frame.scale), [String(P.NEAR_SCALE), '1']);
    bin.release();
    const count = page.doc.animations.length;
    bin.setNear(true);
    assert.equal(page.doc.animations.length, count, '收起之后不再响应');
});

test('holdBin.gulp：吞下时两层各晃一下（独立 rotate 动画，沿用揉纸的晃动参数），晃完自己收起并清掉动效层', () => {
    const page = buildPage({ SpringFeel: { easing: name => `spring(${name})` } });
    const bin = page.api.holdBin();
    const before = page.doc.animations.length;
    bin.gulp();
    const wobbles = page.doc.animations.slice(before);
    assert.equal(wobbles.length, 2);
    for (const animation of wobbles) {
        assert.deepEqual(animation.frames, [{ rotate: `${P.WOBBLE_DEG}deg` }, { rotate: '0deg' }]);
        assert.equal(animation.options.duration, P.DROP_MS + P.SETTLE_MS);
        assert.equal(animation.options.easing, 'spring(bouncy)');
        assert.equal(animation.options.fill, 'none');
    }
    assert.equal(bin.isActive(), false, '开始吞下就不再接受对准判定');
    assert.ok(layerOf(page), '晃的时候还在');
    page.timers.advance(P.DROP_MS + P.SETTLE_MS - 1);
    assert.ok(layerOf(page));
    page.timers.advance(2);                                     // 晃完 → 开始淡出
    const fades = page.doc.animations.slice(before + 2);
    assert.equal(fades.length, 2);
    for (const animation of fades) {
        assert.equal(animation.frames[0].opacity, 1);
        assert.equal(animation.frames[animation.frames.length - 1].opacity, 0);
        assert.equal(animation.options.duration, P.HOLD_FADE_MS);
    }
    page.timers.advance(P.HOLD_FADE_MS + 60);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
    assert.equal(page.timers.pending(), 0, '计时器全部清掉');
    bin.gulp();
    assert.equal(page.doc.animations.length, before + 4, '收起之后再 gulp 无动作');
});

test('holdBin.release：松手（没对准或完成失败）直接淡出收起；重复调用无副作用；之后所有方法都是空操作', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    const before = page.doc.animations.length;
    bin.release();
    const fades = page.doc.animations.slice(before);
    assert.equal(fades.length, 2);
    for (const animation of fades) {
        assert.equal(animation.options.fill, 'forwards');
        assert.equal(animation.options.duration, P.HOLD_FADE_MS);
    }
    assert.equal(bin.isActive(), false);
    bin.release();
    assert.equal(page.doc.animations.length, before + 2);
    assert.ok(layerOf(page), '淡出期间还在');
    page.timers.advance(P.HOLD_FADE_MS + 60);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
    assert.equal(page.timers.pending(), 0);
    assert.doesNotThrow(() => { bin.release(); bin.gulp(); bin.setNear(true); bin.contains(1, 1); bin.mouth(); bin.rect(); });
});

test('holdBin 兜底：调用方忘了收纸篓时 HOLD_MAX_MS 之后自己淡出并清理，不在页面上留残影', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    page.timers.advance(P.HOLD_MAX_MS - 1);
    assert.equal(bin.isActive(), true);
    page.timers.advance(2);
    assert.equal(bin.isActive(), false);
    page.timers.advance(P.HOLD_FADE_MS + 60);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);
});

test('holdBin 不受“任务完成揉纸”开关限制（它是抓取完成的落点），但受背景体验总开关、减少动态效果、页面隐藏、不支持环境限制', () => {
    assert.ok(buildPage({ experience: { settings: { enabled: true, taskCrumple: false } } }).api.holdBin(), '揉纸关了，纸篓照样能出来');
    assert.ok(buildPage({ saveData: true }).api.holdBin(), '省流量下纸篓只是几个 SVG，不是重绘');
    assert.equal(buildPage({ experience: { settings: { enabled: false } } }).api.holdBin(), null);
    assert.equal(buildPage({ reduceMotion: true }).api.holdBin(), null, '减少动态效果时动效层整层隐藏，纸篓没有意义');
    assert.equal(buildPage({ hidden: true }).api.holdBin(), null);
    const bare = TaskCrumple.create({ document: { body: null }, window: {} });
    assert.equal(bare.holdBin(), null);
    assert.equal(TaskCrumple.create({}).holdBin(), null);
    for (const options of [{ experience: { settings: { enabled: false } } }, { reduceMotion: true }, { hidden: true }]) {
        const page = buildPage(options);
        page.api.holdBin();
        assert.equal(layerOf(page), null, '被拒绝时不留动效层');
        assert.equal(page.api.activeCount(), 0);
    }
});

test('holdBin 与揉纸共用槽位：纸篓占 0 号位，同时的揉纸改用 1 号位（向左排开，不叠在一起）；3 个槽位用满时 holdBin 返回 null', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    const { box } = page.addItem('t1', RECT_A);
    page.doc.click(box);
    const slots = Array.from(page.api._runs).map(run => run.slot).sort();
    assert.deepEqual(slots, [0, 1]);
    bin.release();
    page.timers.advance(P.HOLD_FADE_MS + 60);
    // 3 组揉纸占满
    const busy = buildPage();
    for (const [id, rect] of [['a', RECT_A], ['b', RECT_B], ['c', RECT_C]]) busy.doc.click(busy.addItem(id, rect).box);
    assert.equal(busy.api.activeCount(), 3);
    assert.equal(busy.api.holdBin(), null);
    assert.equal(busy.api.activeCount(), 3, '被拒绝不改变现状');
});

test('holdBin 同一时刻只留一个：再次调用先收掉上一个（旧句柄失效），不会叠出两个纸篓', () => {
    const page = buildPage();
    const first = page.api.holdBin();
    const second = page.api.holdBin();
    assert.ok(second);
    assert.equal(first.isActive(), false);
    assert.equal(second.isActive(), true);
    assert.equal(layerOf(page).querySelectorAll('.tc-hold').length, 1);
    assert.equal(page.api.activeCount(), 1);
    assert.doesNotThrow(() => first.release());
    assert.equal(second.isActive(), true, '旧句柄的操作不影响新的');
});

test('holdBin 重新调用只数揉纸的活动数：纸篓 + 两个揉纸在场时再调用仍然成功（替换旧纸篓），不会被自己占的位置挡住', () => {
    const page = buildPage();
    const first = page.api.holdBin();
    for (const [id, rect] of [['a', RECT_A], ['b', RECT_B]]) page.doc.click(page.addItem(id, rect).box);
    assert.equal(page.api.activeCount(), 3, '纸篓 + 两个揉纸');
    const second = page.api.holdBin();
    assert.ok(second, '再次调用成功');
    assert.equal(first.isActive(), false);
    assert.equal(second.isActive(), true);
    assert.equal(page.api.activeCount(), 3);
    assert.equal(layerOf(page).querySelectorAll('.tc-hold').length, 1);
});

test('holdBin：detach 时一并清掉（句柄失效、动效层移除）；构建过程抛错时返回 null 且不留残影', () => {
    const page = buildPage();
    const bin = page.api.holdBin();
    page.api.detach();
    assert.equal(bin.isActive(), false);
    assert.equal(layerOf(page), null);
    assert.equal(page.api.activeCount(), 0);

    const broken = buildPage();
    const original = broken.doc.createElement.bind(broken.doc);
    let calls = 0;
    broken.doc.createElement = tag => { if (++calls === 3) throw new Error('boom'); return original(tag); };    // 层、run 根节点之后的第一个纸篓节点
    assert.equal(broken.api.holdBin(), null);
    assert.equal(layerOf(broken), null);
    assert.equal(broken.api.activeCount(), 0);
    assert.equal(broken.timers.pending(), 0);
});

// ======================= 静态契约 =======================

const ROOT = path.join(__dirname, '..');
const SOURCES = ['js/task-crumple.js', 'js/task-crumple-core.js'].map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]);

test('纯视觉：两个脚本不碰任务数据、不发请求、不执行动态代码', () => {
    for (const [file, source] of SOURCES) {
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const forbidden of [/memoManager/, /saveMemos/, /\.memos\b/, /\bchrome\./, /localStorage/, /sessionStorage/, /\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /new Function/, /document\.write/]) {
            assert.ok(!forbidden.test(code), `${file} 不应出现 ${forbidden}`);
        }
    }
});

test('innerHTML 只用来放两段写死的纸篓 SVG 常量，不拼接任何页面内容', () => {
    const [, source] = SOURCES[0];
    const assignments = Array.from(source.matchAll(/innerHTML\s*=\s*([^;]+);/g)).map(match => match[1].trim());
    assert.ok(assignments.length >= 2);
    for (const rhs of assignments) assert.ok(rhs === 'BIN_BACK' || rhs === 'BIN_FRONT', `意外的 innerHTML 赋值：${rhs}`);
    assert.ok(!/BIN_(BACK|FRONT)\s*=\s*[^;]*\$\{/.test(source), 'SVG 常量里不能有模板插值');
});

test('克隆体只通过 cloneNode 复制已有节点，不用 innerHTML/outerHTML 重新解析页面内容', () => {
    const [, source] = SOURCES[0];
    assert.ok(source.includes('.cloneNode(true)'));
    assert.ok(!/outerHTML|insertAdjacentHTML/.test(source));
});
