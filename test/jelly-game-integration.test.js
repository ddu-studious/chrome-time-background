// 解压果冻接到真实文件上的那一层：游戏中心第四款、番茄钟“歇 60 秒”入口、页面加载顺序与样式契约。
// 控制器本身的逻辑在 jelly-game.test.js，物理在 jelly-core.test.js；这里只验证“接线”。
//
// 层级说明（不要把它们写成真实浏览器验证）：
//   A. 静态契约：读 index.html / css / js 源码做断言。
//   B. 游戏中心：games-v5.js 在 vm 里真实运行，DOM 是带“标记解析”的替身（能按 id/类/属性查到 innerHTML 里的标签，
//      不是浏览器，没有布局、没有真实焦点与 inert 语义）。
//   C. 番茄钟：从 memo.js 按方法边界切出 initPomodoroTimer，用 showPomodoroTimer 里真实的面板模板在 vm 里运行，
//      计时器是手动推进的替身。切不到就明确失败，提示更新切片。
//   D. CSS 与控制器类名的对应关系。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stripBlockComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '');
// vm 里创建的数组/对象带的是另一个 realm 的原型，deepStrictEqual 会因此判不等：先序列化成本 realm 的普通值。
const plain = value => JSON.parse(JSON.stringify(value));

// ---------- 通用替身：按标记解析的元素 ----------

function parseMarkup(html) {
    const nodes = [];
    const tag = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*\/?>/g;
    let match;
    while ((match = tag.exec(html))) {
        const attrs = {};
        const attr = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g;
        let found;
        while ((found = attr.exec(match[2]))) attrs[found[1]] = found[2] === undefined ? '' : found[2];
        nodes.push({ tag: match[1].toLowerCase(), attrs });
    }
    return nodes;
}

// 只支持单个复合选择器（标签、#id、.类、[属性]、[属性="值"] 的任意组合）；带伪类、组合符的一律不匹配。
function matchesSimple(node, selector) {
    const text = selector.trim();
    if (!text || /[:>\s+~]/.test(text)) return false;
    const token = /^(?:#([-\w]+)|\.([-\w]+)|\[([-\w]+)(?:="([^"]*)")?\]|([a-zA-Z][-\w]*))/;
    let rest = text;
    while (rest) {
        const part = token.exec(rest);
        if (!part) return false;
        if (part[1] !== undefined && node.id !== part[1]) return false;
        if (part[2] !== undefined && !node.classes.has(part[2])) return false;
        if (part[3] !== undefined) {
            if (!(part[3] in node.attrs)) return false;
            if (part[4] !== undefined && node.attrs[part[3]] !== part[4]) return false;
        }
        if (part[5] !== undefined && node.tag !== part[5].toLowerCase()) return false;
        rest = rest.slice(part[0].length);
    }
    return true;
}

class FakeEl {
    constructor(doc, tag = 'div', attrs = {}) {
        this.doc = doc;
        this.tag = tag;
        this.attrs = { ...attrs };
        this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
        this.id = attrs.id || '';
        this.dataset = {};
        for (const [key, value] of Object.entries(attrs)) {
            if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
        this.listeners = {};
        this.inert = false;
        this.isConnected = false;
        this.removed = false;
        this.parent = null;
        this.textContent = '';
        this.appended = [];
        this.placedAfter = null;
        this.focusCalls = 0;
        this._html = '';
        this._nodes = [];
        const self = this;
        this.classList = {
            add: (...names) => { names.forEach(name => self.classes.add(name)); },
            remove: (...names) => { names.forEach(name => self.classes.delete(name)); },
            contains: name => self.classes.has(name),
            toggle: (name, force) => {
                const on = force === undefined ? !self.classes.has(name) : !!force;
                if (on) self.classes.add(name); else self.classes.delete(name);
                return on;
            },
        };
    }
    get className() { return [...this.classes].join(' '); }
    set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key === 'id') this.id = String(value); }
    getAttribute(key) { return key in this.attrs ? this.attrs[key] : null; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
    // 带冒泡：监听器挂在容器上（事件委托）时，点子节点也能触发
    dispatch(type, extra = {}) {
        const event = {
            type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra,
        };
        for (let node = this; node; node = node.parent) {
            for (const fn of [...(node.listeners[type] || [])]) fn(event);
        }
        return event;
    }
    click() { return this.dispatch('click'); }
    focus(options) {
        this.focusCalls += 1;
        this.focusOptions = options;
        // 模拟浏览器拒绝聚焦：面板刚从 visibility:hidden 过渡出来的第 0 帧，元素还不可聚焦，focus() 静默无效
        if (this.doc.focusBlock > 0) { this.doc.focusBlock -= 1; return; }
        this.doc.activeElement = this;
    }
    getClientRects() { return [{}]; }
    remove() { this.removed = true; this.isConnected = false; }
    appendChild(child) { this.appended.push(child); child.isConnected = true; child.parent = this; return child; }
    insertAdjacentElement(where, child) {
        if (where === 'afterend') { this.placedAfter = child; child.isConnected = true; }
        return child;
    }
    closest(selector) {
        for (let node = this; node; node = node.parent) if (matchesSimple(node, selector)) return node;
        return null;
    }
    set innerHTML(html) {
        this._html = String(html);
        this._nodes = parseMarkup(this._html).map(spec => {
            const el = new FakeEl(this.doc, spec.tag, spec.attrs);
            el.parent = this;
            el.isConnected = this.isConnected;
            return el;
        });
    }
    get innerHTML() { return this._html; }
    querySelectorAll(selector) {
        const list = String(selector).split(',');
        return this._nodes.filter(node => list.some(item => matchesSimple(node, item)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(other) { return other === this || this._nodes.includes(other); }
}

function makeDocument() {
    const registry = new Map();
    const doc = {
        readyState: 'complete', hidden: false, activeElement: null, focusBlock: 0, lookups: [], listeners: {},
        createElement: tag => new FakeEl(doc, tag),
        getElementById(id) { doc.lookups.push(id); return registry.get(id) || null; },
        addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
        register(id, tag = 'button') {
            const el = new FakeEl(doc, tag, { id });
            el.isConnected = true;
            registry.set(id, el);
            return el;
        },
        press(key, extra = {}) {
            const event = { key, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
            for (const fn of doc.listeners.keydown || []) fn(event);
            return event;
        },
    };
    doc.body = {
        children: [],
        appendChild(el) { el.isConnected = true; this.children.push(el); return el; },
    };
    return doc;
}

// ---------- B. 游戏中心 ----------

function makeJellyStub(overrides = {}) {
    const stub = {
        mounts: [], unmounts: 0, stat: '12 分钟', offer: true, onMount: null, mountResult: undefined, mountThrows: false,
        mount(rootEl, options) {
            stub.mounts.push({ rootEl, options });
            if (stub.mountThrows) throw new Error('挂载失败');
            if (stub.onMount) stub.onMount(rootEl, options);
            return stub.mountResult === undefined ? { ok: true } : stub.mountResult;
        },
        unmount() { stub.unmounts += 1; },
        statText: () => stub.stat,
        restOfferEnabled: () => stub.offer,
        setRestOfferEnabled(value) { stub.offer = !!value; return true; },
        ...overrides,
    };
    return stub;
}

function loadHub({ jelly = makeJellyStub(), scores = {} } = {}) {
    const doc = makeDocument();
    const store = new Map(Object.entries(scores));
    const frames = [];
    const log = { business: [], shell: [], warn: [], docks: [] };
    const sandbox = {
        document: doc,
        console: { warn: (...args) => log.warn.push(args), log() {}, error() {} },
        localStorage: {
            getItem: key => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => { store.set(key, String(value)); },
        },
        requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    };
    sandbox.window = sandbox;
    sandbox.ProductUIV5 = {
        setBusinessPage: (...args) => { log.business.push(args); },
        setShellPage: (...args) => { log.shell.push(args); },
    };
    if (jelly) sandbox.JellyGame = jelly;
    vm.createContext(sandbox);

    const buttons = {};
    for (const id of ['games-hub-dock-btn', 'snake-dock-btn', 'tetris-dock-btn', 'tetris-3d-dock-btn', 'dock-launchpad-btn']) buttons[id] = doc.register(id);
    // 只记录三款真实游戏的 Dock 按钮（大厅按钮是打开大厅用的，不算“启动了某个游戏”）
    for (const id of ['snake-dock-btn', 'tetris-dock-btn', 'tetris-3d-dock-btn']) buttons[id].addEventListener('click', () => log.docks.push(id));
    vm.runInContext(read('js/games-v5.js'), sandbox, { filename: 'games-v5.js' });

    const harness = {
        sandbox, doc, jelly, log, buttons,
        hub: sandbox.GamesV5,
        host: () => doc.body.children.find(el => el.id === 'games-v5-panel'),
        // 清空 rAF 队列（含回调里新排的）；超过上限说明代码在无界重试，直接报错而不是挂住测试进程
        flush() {
            for (let guard = 0; frames.length; guard += 1) {
                if (guard > 500) throw new Error('rAF 队列没有清空：存在无界重试');
                frames.shift()(0);
            }
        },
        // 只执行“当前这一帧”已排队的回调（回调里新排的留到下一帧）
        step() { frames.splice(0).forEach(callback => callback(0)); },
        pending: () => frames.length,
        open() { buttons['games-hub-dock-btn'].click(); harness.flush(); return harness.host(); },
    };
    return harness;
}

const CANVAS_MARKUP = '<canvas class="jelly-canvas" tabindex="0"></canvas>';

test('B1 大厅有四张卡片：果冻卡片的统计项是“累计放松”并取自控制器，其余三张仍是“本地最高分”', () => {
    const h = loadHub();
    const host = h.open();
    assert.ok(host.classList.contains('visible'));
    const html = host.innerHTML;
    assert.equal((html.match(/<article data-game="/g) || []).length, 4);
    for (const id of ['snake', 'tetris', 'voxel', 'jelly']) assert.match(html, new RegExp(`<article data-game="${id}"`));
    assert.equal((html.match(/<span>本地最高分<\/span>/g) || []).length, 3, '统计标签（描述文字里也有这四个字，所以按标签数）');
    assert.match(html, /<span>累计放松<\/span><b>12 分钟<\/b>/);
    assert.equal((html.match(/开始游戏<\/button>/g) || []).length, 3);
    assert.match(html, /data-game-launch="jelly"><i class="fas fa-play"><\/i> 开始放松<\/button>/);
    assert.equal(host.classList.contains('games-v5-above'), false, '从 Dock 打开大厅不需要盖过番茄钟');
    assert.deepEqual(plain(h.log.business[0]), ['games', 'launcher']);
});

test('B2 点果冻卡片：直接在面板里挂载，不走 Dock 按钮、不隐藏大厅、不登记页面', () => {
    const h = loadHub();
    const host = h.open();
    host.querySelector('[data-game-launch="jelly"]').click();
    h.flush();
    assert.equal(h.jelly.mounts.length, 1);
    const { rootEl, options } = h.jelly.mounts[0];
    assert.ok(rootEl.classes.has('games-v5-jelly-root'), '挂在面板里专门留的容器上');
    assert.equal(options.rest, undefined, '从大厅进来没有倒计时');
    assert.equal(typeof options.onDone, 'function');
    assert.ok(host.classList.contains('visible'), '面板没有被隐藏');
    assert.deepEqual(h.log.docks, [], '没有触发任何游戏的 Dock 按钮');
    assert.ok(host.querySelector('#games-v5-lobby'), '大厅来源的头部有返回大厅按钮');
    assert.equal(host.querySelector('.games-v5-jelly').dataset.origin, 'lobby');
    assert.equal(host.classList.contains('games-v5-above'), false);
    assert.equal(host.getAttribute('aria-label'), '解压果冻');
    assert.deepEqual(plain(h.log.business.filter(call => String(call[1]).includes('jelly'))), [], 'ProductPagesV5 是固定设计合同，不登记果冻页面');
});

test('B3 从番茄钟进入：带 60 秒倒计时、盖过番茄钟、头部没有返回大厅、关闭后背景恢复', () => {
    const h = loadHub();
    const pomodoro = new FakeEl(h.doc, 'div', { id: 'pomodoro-panel' });
    pomodoro.isConnected = true;
    h.doc.body.appendChild(pomodoro);
    const goButton = new FakeEl(h.doc, 'button');
    goButton.isConnected = true;
    h.doc.activeElement = goButton;
    h.jelly.onMount = () => { const host = h.host(); host.innerHTML += CANVAS_MARKUP; };

    h.hub.showJelly({ rest: 60, origin: 'pomodoro' });
    const host = h.host();
    h.flush();

    assert.equal(h.jelly.mounts[0].options.rest, 60);
    assert.ok(host.classList.contains('visible'));
    assert.ok(host.classList.contains('games-v5-above'), '要盖在番茄钟上面');
    assert.equal(host.querySelector('#games-v5-lobby'), null, '从番茄钟来的没有返回大厅按钮');
    assert.ok(host.querySelector('#games-v5-close'));
    assert.equal(host.querySelector('.games-v5-jelly').dataset.origin, 'pomodoro');
    assert.equal(pomodoro.inert, true, '打开期间番茄钟被设为 inert，无法被点到');
    assert.equal(h.doc.activeElement, host.querySelector('.jelly-canvas'), '焦点进入画布');

    host.querySelector('#games-v5-close').click();
    assert.equal(host.classList.contains('visible'), false);
    assert.equal(pomodoro.inert, false, '关闭后番茄钟恢复可操作');
    assert.equal(h.doc.activeElement, goButton, '焦点回到打开前的“去歇一下”按钮');
    assert.equal(h.jelly.unmounts >= 1, true);
    assert.deepEqual(plain(h.log.shell.at(-1)), ['home']);
});

test('B4 Esc 分层：大厅来源回大厅；番茄钟来源直接关闭；设置页仍回大厅（原行为不变）', () => {
    const lobby = loadHub();
    lobby.open().querySelector('[data-game-launch="jelly"]').click();
    const before = lobby.jelly.unmounts;
    const event = lobby.doc.press('Escape');
    assert.equal(event.defaultPrevented, true);
    assert.match(lobby.host().innerHTML, /GAME LOUNGE/, '回到了大厅');
    assert.ok(lobby.host().classList.contains('visible'));
    assert.ok(lobby.jelly.unmounts > before, '离开果冻视图时先卸载');

    const pomodoro = loadHub();
    pomodoro.hub.showJelly({ rest: 60, origin: 'pomodoro' });
    pomodoro.doc.press('Escape');
    assert.equal(pomodoro.host().classList.contains('visible'), false, '直接关闭，回到番茄钟');
    assert.equal(pomodoro.host().inert, true);
    assert.equal(pomodoro.host().getAttribute('aria-hidden'), 'true');
    assert.ok(pomodoro.jelly.unmounts >= 1);

    const settings = loadHub();
    settings.hub.showSettingsHelp();
    settings.doc.press('Escape');
    assert.match(settings.host().innerHTML, /GAME LOUNGE/);

    const closedAlready = loadHub();
    closedAlready.open();
    closedAlready.doc.press('Escape');
    assert.equal(closedAlready.host().classList.contains('visible'), false, '大厅本身的 Esc 仍是关闭');
});

test('B5 离开果冻视图的每条路径都先卸载（卸载才会结算累计时长、停掉动画和倒计时）', () => {
    const exits = {
        'close()': h => h.hub.close(),
        'showLauncher()': h => h.hub.showLauncher(),
        'showSettingsHelp()': h => h.hub.showSettingsHelp(),
        "showPauseGameover('tetris')": h => h.hub.showPauseGameover('tetris', 'paused'),
        "launch('snake')": h => h.hub.launch('snake'),
        '头部“游戏大厅”按钮': h => h.host().querySelector('#games-v5-lobby').click(),
        '头部关闭按钮': h => h.host().querySelector('#games-v5-close').click(),
        '再开一次果冻': h => h.hub.showJelly({ origin: 'lobby' }),
    };
    for (const [name, leave] of Object.entries(exits)) {
        const h = loadHub();
        h.hub.showJelly({ origin: 'lobby' });
        const mounted = h.jelly.mounts.length;
        const before = h.jelly.unmounts;
        leave(h);
        assert.ok(h.jelly.unmounts > before, `${name}：没有卸载`);
        if (name !== '再开一次果冻') assert.equal(h.jelly.mounts.length, mounted, `${name}：不应再挂载`);
    }
});

test('B6 控制器的 onDone（“回去继续”）关闭游戏中心并卸载', () => {
    const h = loadHub();
    const returnTo = new FakeEl(h.doc, 'button');
    returnTo.isConnected = true;
    h.doc.activeElement = returnTo;
    h.hub.showJelly({ rest: 60, origin: 'pomodoro' });
    const { onDone } = h.jelly.mounts[0].options;
    const before = h.jelly.unmounts;
    onDone();
    assert.equal(h.host().classList.contains('visible'), false);
    assert.ok(h.jelly.unmounts > before);
    assert.equal(h.doc.activeElement, returnTo);
});

test('B7 果冻不可用时降级为一句提示：没有脚本、挂载返回 null、挂载抛错，都不抛出且焦点落在关闭按钮', () => {
    const cases = {
        '没有 JellyGame': { jelly: null },
        '挂载返回 null': { jelly: makeJellyStub({ mountResult: null }) },
        '挂载抛错': { jelly: makeJellyStub({ mountThrows: true }) },
    };
    for (const [name, options] of Object.entries(cases)) {
        const h = loadHub(options);
        assert.doesNotThrow(() => h.hub.showJelly({ origin: 'lobby' }), name);
        h.flush();
        const html = h.host().innerHTML;
        assert.match(html, /games-v5-jelly-root/, name);
        assert.equal(h.host().classList.contains('visible'), true, name);
        assert.equal(h.doc.activeElement, h.host().querySelector('#games-v5-close'), `${name}：焦点要落在关闭按钮`);
    }
    // 提示文字写在根容器里（替身没有渲染子树，这里直接看根容器被写入了什么）
    const failing = loadHub({ jelly: makeJellyStub({ mountResult: null }) });
    failing.hub.showJelly({ origin: 'lobby' });
    const root = failing.jelly.mounts[0].rootEl;
    assert.match(root.innerHTML, /role="alert"/);
    assert.match(root.innerHTML, /没有加载成功/);

    const thrower = loadHub({ jelly: makeJellyStub({ mountThrows: true }) });
    thrower.hub.showJelly({ origin: 'lobby' });
    assert.equal(thrower.log.warn.length, 1, '抛错要留一条警告');
    assert.ok(thrower.jelly.unmounts >= 2, '抛错后要清理半成品');
});

test('B8 统计值会被拼进 innerHTML，必须转义（分数来自 localStorage，果冻时长来自控制器）', () => {
    const h = loadHub({ scores: { snakeHighScore: '<img src=x onerror=alert(1)>', tetrisHighScore: '"><b>', 'tetris3dHighScore': "'&" } });
    h.jelly.stat = '<script>alert(1)</script>';
    const html = h.open().innerHTML;
    // <b> 是统计值本来的容器，所以不能查“有没有 <b>”，要查注入的原始字符串没有原样进入标记
    assert.ok(!html.includes('<img src=x'), '原始 <img> 不能进入标记');
    assert.ok(!html.includes('<script>'), '原始 <script> 不能进入标记');
    assert.ok(!html.includes('"><b>'), '引号闭合属性的写法不能原样进入标记');
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&quot;&gt;&lt;b&gt;/);
    assert.match(html, /&#39;&amp;/);

    const broken = loadHub({ jelly: makeJellyStub({ statText() { throw new Error('读取失败'); } }) });
    assert.match(broken.open().innerHTML, /<span>累计放松<\/span><b>—<\/b>/, '读取累计时长失败只显示破折号，大厅照常渲染');
});

test('B9 初始化不会去查没有 Dock 按钮的游戏（getElementById 不能收到 null/undefined）', () => {
    const h = loadHub();
    assert.ok(h.doc.lookups.includes('snake-dock-btn'));
    assert.ok(h.doc.lookups.includes('games-hub-dock-btn'));
    for (const id of h.doc.lookups) assert.ok(typeof id === 'string' && id !== 'null' && id !== 'undefined', `不该查找 ${id}`);
});

test('B10 导出与游戏列表：第四款是 jelly，没有 Dock 按钮和独立面板；showJelly 对外可用', () => {
    const h = loadHub();
    assert.deepEqual(plain(h.hub.games.map(game => game.id)), ['snake', 'tetris', 'voxel', 'jelly']);
    const jelly = h.hub.games[3];
    assert.equal(jelly.dockBtnId, null);
    assert.equal(jelly.panelId, null);
    assert.equal(typeof h.hub.showJelly, 'function');
    for (const name of ['showLauncher', 'launch', 'showPauseGameover', 'showSettingsHelp', 'close']) assert.equal(typeof h.hub[name], 'function', name);
});

test('B11 origin 只接受白名单：任何其他值都按“大厅”处理，不会把原文拼进标记', () => {
    for (const origin of ['"><script>alert(1)</script>', 'POMODORO', undefined, null, 42]) {
        const h = loadHub();
        h.hub.showJelly({ origin });
        const html = h.host().innerHTML;
        assert.doesNotMatch(html, /<script/);
        assert.match(html, /data-origin="lobby"/);
        assert.equal(h.host().classList.contains('games-v5-above'), false);
    }
});

test('B12 盖过番茄钟的类每次打开都重新决定：从番茄钟进来加上，之后再开大厅必须去掉', () => {
    const h = loadHub();
    h.hub.showJelly({ rest: 60, origin: 'pomodoro' });
    assert.ok(h.host().classList.contains('games-v5-above'));
    h.hub.showLauncher();
    assert.equal(h.host().classList.contains('games-v5-above'), false, '切回大厅就是普通层级');
    h.hub.showJelly({ origin: 'pomodoro' });
    assert.ok(h.host().classList.contains('games-v5-above'));
    h.hub.close();
    assert.ok(h.host().classList.contains('games-v5-above'), '关闭时不摘：淡出中的面板不能沉到番茄钟下面');
    h.hub.showSettingsHelp();
    assert.equal(h.host().classList.contains('games-v5-above'), false);
});

test('B13 设置页把果冻列进“真实游戏入口”，点它进入果冻视图；其余三款仍走 Dock 按钮', () => {
    const h = loadHub();
    h.hub.showSettingsHelp();
    const html = h.host().innerHTML;
    assert.match(html, /<span>解压果冻<\/span><small>在游戏中心里直接打开，不计分<\/small>/);
    assert.equal((html.match(/打开独立设置与游戏面板/g) || []).length, 3);
    assert.match(html, /解压果冻没有声音/);
    assert.match(html, /Space 或 Enter 戳一下/);

    h.host().querySelector('[data-game-launch="jelly"]').click();
    assert.equal(h.jelly.mounts.length, 1);
    assert.deepEqual(h.log.docks, []);

    const other = loadHub();
    other.hub.showSettingsHelp();
    other.host().querySelector('[data-game-launch="snake"]').click();
    assert.deepEqual(other.log.docks, ['snake-dock-btn']);
    assert.equal(other.jelly.mounts.length, 0);
    assert.equal(other.host().classList.contains('visible'), false, '启动其他游戏时大厅仍然隐藏');
});

test('B14 卸载抛错不能挡住关闭或切换：吞掉并留一条警告', () => {
    const h = loadHub({ jelly: makeJellyStub({ unmount() { throw new Error('卸载失败'); } }) });
    h.hub.showJelly({ origin: 'lobby' });
    assert.doesNotThrow(() => h.hub.close());
    assert.equal(h.host().classList.contains('visible'), false, '照样关闭');
    assert.ok(h.log.warn.length >= 1, '留下警告');
    assert.doesNotThrow(() => h.hub.showLauncher());
    assert.match(h.host().innerHTML, /GAME LOUNGE/);
});

// ---------- B（续）聚焦时机：真实 Chromium 里面板刚打开的第一帧不可聚焦 ----------
// 复现（干净的 Chromium，无假时钟）：从 Dock 打开大厅、从番茄钟打开果冻，document.activeElement 都停在 body；
// 只有“面板已经可见时再从大厅切到果冻”能聚焦成功。原因：.games-v5-panel 的 visibility 在过渡，第 0 帧仍是 hidden。

test('B15 浏览器拒绝聚焦时逐帧重试直到成功：从番茄钟打开果冻', () => {
    const h = loadHub();
    h.jelly.onMount = () => { h.host().innerHTML += CANVAS_MARKUP; };
    h.doc.focusBlock = 2;   // 前两次聚焦被拒绝
    h.hub.showJelly({ rest: 60, origin: 'pomodoro' });
    const canvas = h.host().querySelector('.jelly-canvas');
    h.step();
    assert.notEqual(h.doc.activeElement, canvas, '第一帧被拒绝');
    assert.equal(h.pending(), 1, '被拒绝就排下一帧');
    h.step();
    assert.notEqual(h.doc.activeElement, canvas, '第二帧被拒绝');
    h.step();
    assert.equal(h.doc.activeElement, canvas, '第三帧成功，焦点在画布上');
    assert.equal(h.pending(), 0, '成功后不再排队（没有遗留的空回调）');
    assert.equal(canvas.focusCalls, 3, '被拒绝两次、第三次成功，成功后不再重试');
    assert.deepEqual(plain(canvas.focusOptions), { preventScroll: true }, '聚焦不能把页面滚走');
});

test('B16 从 Dock 打开大厅（原有路径的同一缺陷）：第一次被拒绝，之后焦点落在“设置与帮助”', () => {
    const h = loadHub();
    h.doc.focusBlock = 1;
    const host = h.open();
    const help = host.querySelector('#games-v5-help');
    assert.ok(help, '大厅的聚焦目标存在');
    assert.equal(h.doc.activeElement, help);
    assert.equal(help.focusCalls, 2);
});

test('B17 聚焦始终被拒绝时重试有上限（8 次），不会无限排队', () => {
    const h = loadHub();
    h.jelly.onMount = () => { h.host().innerHTML += CANVAS_MARKUP; };
    h.doc.focusBlock = Infinity;
    h.hub.showJelly({ origin: 'lobby' });
    const canvas = h.host().querySelector('.jelly-canvas');
    h.flush();   // 有无界重试时 flush 会报错
    assert.equal(canvas.focusCalls, 8);
    assert.notEqual(h.doc.activeElement, canvas);
});

test('B18 重试期间面板被关闭、视图被替换、或焦点已被移进面板：不再去聚焦', () => {
    // 面板被关闭：不能把焦点抢进已隐藏的面板
    const closed = loadHub();
    closed.jelly.onMount = () => { closed.host().innerHTML += CANVAS_MARKUP; };
    closed.doc.focusBlock = 1;
    closed.hub.showJelly({ origin: 'lobby' });
    const canvasClosed = closed.host().querySelector('.jelly-canvas');
    closed.step();
    assert.equal(canvasClosed.focusCalls, 1, '第一帧被拒绝，并排了下一帧');
    closed.hub.close();
    closed.flush();
    assert.equal(canvasClosed.focusCalls, 1, '关闭后的重试直接放弃');

    // 视图被替换：旧目标不存在了就停（新视图自己的聚焦由它自己的 openHost 负责）
    const replaced = loadHub();
    replaced.jelly.onMount = () => { replaced.host().innerHTML += CANVAS_MARKUP; };
    replaced.doc.focusBlock = 1;
    replaced.hub.showJelly({ origin: 'lobby' });
    const canvasReplaced = replaced.host().querySelector('.jelly-canvas');
    replaced.step();
    replaced.hub.showLauncher();
    replaced.flush();
    assert.equal(canvasReplaced.focusCalls, 1, '旧画布不会再被聚焦');
    assert.equal(replaced.doc.activeElement, replaced.host().querySelector('#games-v5-help'), '焦点在新视图的目标上');

    // 焦点已被移进面板：不抢
    const moved = loadHub();
    moved.jelly.onMount = () => { moved.host().innerHTML += CANVAS_MARKUP; };
    moved.doc.focusBlock = 1;
    moved.hub.showJelly({ origin: 'lobby' });
    const canvasMoved = moved.host().querySelector('.jelly-canvas');
    moved.step();
    const closeButton = moved.host().querySelector('#games-v5-close');
    moved.doc.activeElement = closeButton;   // 用户在这几帧里按 Tab 到了关闭按钮
    moved.flush();
    assert.equal(moved.doc.activeElement, closeButton, '不抢走用户已经放好的焦点');
    assert.equal(canvasMoved.focusCalls, 1);

    // 焦点停在面板容器本身（tabindex=-1 的兜底焦点）不算“已经放好”：仍要把焦点交给目标
    const onHost = loadHub();
    onHost.jelly.onMount = () => { onHost.host().innerHTML += CANVAS_MARKUP; };
    onHost.doc.focusBlock = 1;
    onHost.hub.showJelly({ origin: 'lobby' });
    const canvasOnHost = onHost.host().querySelector('.jelly-canvas');
    onHost.step();
    onHost.doc.activeElement = onHost.host();
    onHost.flush();
    assert.equal(onHost.doc.activeElement, canvasOnHost, '容器上的兜底焦点会被交给画布');
});

// ---------- C. 番茄钟 ----------

function pomodoroTemplate() {
    const memo = read('js/memo.js');
    const found = /showPomodoroTimer\(\) \{[\s\S]*?panel\.innerHTML = `([\s\S]*?)`;/.exec(memo);
    assert.ok(found, '找不到 showPomodoroTimer 的面板模板：memo.js 结构变了，请更新本测试');
    assert.doesNotMatch(found[1], /\$\{/, '模板里不应有插值（测试直接把它当真实标记用）');
    return found[1];
}

function pomodoroMethod() {
    const memo = read('js/memo.js');
    const start = memo.indexOf('    initPomodoroTimer(panel) {');
    const end = memo.indexOf('    /**\n     * 播放番茄钟提示音', start);
    assert.ok(start > 0 && end > start, '找不到 initPomodoroTimer 的方法边界：memo.js 结构变了，请更新本测试的切片');
    return memo.slice(start, end);
}

function loadPomodoro({ jelly = true, showJelly = true, enabled = true } = {}) {
    const doc = makeDocument();
    const panel = new FakeEl(doc, 'div', { id: 'pomodoro-panel' });
    panel.isConnected = true;
    panel.innerHTML = pomodoroTemplate();

    const intervals = new Map();
    let nextId = 1;
    const store = new Map();
    const shown = [];
    const jellyStub = makeJellyStub({ offer: enabled });
    const hubCalls = [];
    const sandbox = {
        document: doc, console, JSON, Math,
        localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } },
        setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
        clearInterval(id) { intervals.delete(id); },
    };
    sandbox.window = sandbox;
    if (jelly) sandbox.JellyGame = jellyStub;
    if (showJelly) sandbox.GamesV5 = { showJelly: options => { hubCalls.push(options); } };
    vm.createContext(sandbox);

    const toasts = [];
    const self = {
        getTodayDate: () => '2026-10-15',
        showToast: message => { toasts.push(message); },
        playPomodoroSound() { shown.push('sound'); },
    };
    const holder = vm.runInContext(`(function () { return { ${pomodoroMethod()} }; })()`, sandbox, { filename: 'memo.js(initPomodoroTimer)' });
    holder.initPomodoroTimer.call(self, panel);

    const q = selector => panel.querySelector(selector);
    const tabs = panel.querySelectorAll('.pomodoro-tab');
    const harness = {
        panel, doc, toasts, hubCalls, jelly: jellyStub, store,
        display: q('#pomodoro-display'), toggle: q('#pomodoro-toggle'), skip: q('#pomodoro-skip'), reset: q('#pomodoro-reset'),
        count: q('#pomodoro-count'), controls: q('.pomodoro-controls'), body: q('.pomodoro-body'),
        tab: mode => tabs.find(tab => tab.dataset.mode === mode),
        activeTab: () => tabs.find(tab => tab.classes.has('active'))?.dataset.mode,
        ticking: () => intervals.size,
        tick(n) { for (let i = 0; i < n; i += 1) { const fn = [...intervals.values()][0]; if (!fn) return i; fn(); } return n; },
        // 注入 offer 创建的元素：createElement 之后挂到 doc 上以便统计
        offers: [],
    };
    const created = doc.createElement;
    doc.createElement = tag => { const el = created(tag); if (tag === 'div') harness.offers.push(el); return el; };
    harness.attached = () => harness.offers.filter(el => el.isConnected && !el.removed);
    harness.finishWork = () => { harness.tab('work').click(); harness.toggle.click(); return harness.tick(25 * 60); };
    return harness;
}

test('C0 切片可用：真实面板模板里有切片用到的全部节点，且“跳过”的点击事件不会被当成自然结束', () => {
    const slice = pomodoroMethod();
    assert.equal((slice.match(/complete\(true\)/g) || []).length, 1, '只有计时走完才传 true');
    assert.equal((slice.match(/complete\(false\)/g) || []).length, 1);
    assert.doesNotMatch(slice, /addEventListener\('click', complete\)/, '不能把 complete 直接当点击处理函数（事件对象是真值）');
    assert.equal((slice.match(/const showRestOffer = /g) || []).length, 1, '定义一次');
    assert.equal((slice.match(/showRestOffer\(\)/g) || []).length, 1, '只在 complete 末尾调用一次');
    const p = loadPomodoro();
    for (const part of ['display', 'toggle', 'skip', 'reset', 'count', 'controls', 'body']) assert.ok(p[part], `面板模板里缺少 ${part}`);
    assert.ok(p.tab('work') && p.tab('short-break') && p.tab('long-break'));
    assert.equal(p.activeTab(), 'work');
});

test('C1 专注自然走完：提示出现一次，位置在控制按钮之后，计时已停、已切到短休息', () => {
    const p = loadPomodoro();
    p.toggle.click();
    assert.equal(p.ticking(), 1);
    assert.equal(p.tick(25 * 60 - 1), 25 * 60 - 1);
    assert.equal(p.attached().length, 0, '还没走完不能出现');
    p.tick(1);

    assert.equal(p.ticking(), 0, '走完后定时器已停');
    assert.equal(p.display.textContent, '05:00');
    assert.equal(p.activeTab(), 'short-break');
    assert.equal(p.count.textContent, 1);
    assert.deepEqual(p.toasts, ['番茄完成！休息一下吧 🍅']);

    const offers = p.attached();
    assert.equal(offers.length, 1);
    const offer = offers[0];
    assert.equal(p.controls.placedAfter, offer, '插在控制按钮之后、统计之前');
    assert.equal(offer.className, 'pomodoro-rest-offer');
    assert.equal(offer.getAttribute('role'), 'group');
    assert.equal(offer.getAttribute('aria-label'), '休息一下');
    assert.match(offer.innerHTML, /歇 60 秒，捏捏果冻？/);
    assert.deepEqual(offer.querySelectorAll('[data-rest-offer]').map(button => button.dataset.restOffer), ['go', 'skip', 'never']);
    for (const button of offer.querySelectorAll('button')) assert.equal(button.attrs.type, 'button');
});

test('C2 点“跳过”不算自然结束：番茄照常计数、切换模式，但不出提示', () => {
    const p = loadPomodoro();
    p.skip.click();
    assert.equal(p.count.textContent, 1, '原有行为：跳过也计一个番茄');
    assert.equal(p.activeTab(), 'short-break');
    assert.deepEqual(p.toasts, ['番茄完成！休息一下吧 🍅']);
    assert.equal(p.attached().length, 0);
    assert.equal(p.hubCalls.length, 0);
});

test('C3 休息计时自然走完不出提示（只在专注结束后出）', () => {
    const p = loadPomodoro();
    p.tab('short-break').click();
    p.toggle.click();
    p.tick(5 * 60);
    assert.equal(p.activeTab(), 'work');
    assert.deepEqual(p.toasts, ['休息结束！继续专注吧 💪']);
    assert.equal(p.attached().length, 0);
});

test('C4 条件不满足时完全不出现：没有果冻脚本、没有 showJelly、用户关掉了提醒；都不抛错', () => {
    for (const [name, options] of Object.entries({
        '没有 JellyGame': { jelly: false },
        '没有 GamesV5.showJelly': { showJelly: false },
        '提醒已关闭': { enabled: false },
    })) {
        const p = loadPomodoro(options);
        p.toggle.click();
        assert.doesNotThrow(() => p.tick(25 * 60), name);
        assert.equal(p.attached().length, 0, name);
        assert.equal(p.activeTab(), 'short-break', `${name}：番茄钟本身照常`);
        assert.equal(p.count.textContent, 1, name);
    }
});

test('C5 “去歇一下”：以 60 秒、番茄钟来源打开果冻；提示保留原处，计时状态不动', () => {
    const p = loadPomodoro();
    p.finishWork();
    const [offer] = p.attached();
    offer.querySelector('[data-rest-offer="go"]').click();
    assert.deepEqual(plain(p.hubCalls), [{ rest: 60, origin: 'pomodoro' }]);
    assert.deepEqual(p.attached(), [offer], '提示仍在，游戏中心关闭后焦点才有地方回');
    assert.equal(p.ticking(), 0);
    assert.equal(p.activeTab(), 'short-break');
    assert.equal(p.jelly.offer, true, '“去歇一下”不改提醒设置');
});

test('C6 “不用了”：提示消失、焦点回到开始按钮，提醒设置不动；“不再提示”：同时关闭提醒并给出说明', () => {
    const skip = loadPomodoro();
    skip.finishWork();
    skip.attached()[0].querySelector('[data-rest-offer="skip"]').click();
    assert.equal(skip.attached().length, 0);
    assert.equal(skip.doc.activeElement, skip.toggle);
    assert.equal(skip.jelly.offer, true);
    assert.equal(skip.hubCalls.length, 0);

    const never = loadPomodoro();
    never.finishWork();
    never.attached()[0].querySelector('[data-rest-offer="never"]').click();
    assert.equal(never.attached().length, 0);
    assert.equal(never.doc.activeElement, never.toggle);
    assert.equal(never.jelly.offer, false, '写回控制器的设置');
    assert.equal(never.toasts.at(-1), '已关闭休息提示，可以在解压果冻页面里重新打开');
    assert.equal(never.hubCalls.length, 0);

    // 之后再走完一个专注：不再出现
    never.finishWork();
    assert.equal(never.attached().length, 0);
});

test('C7 点到提示的空白处（不是按钮）什么也不发生', () => {
    const p = loadPomodoro();
    p.finishWork();
    const [offer] = p.attached();
    offer.click();
    offer.querySelector('.pomodoro-rest-offer-text')?.click();
    assert.equal(p.hubCalls.length, 0);
    assert.deepEqual(p.attached(), [offer]);
    assert.equal(p.jelly.offer, true);
});

test('C8 下一次开始计时、切标签、重置都会清掉提示', () => {
    const start = loadPomodoro();
    start.finishWork();
    assert.equal(start.attached().length, 1);
    start.toggle.click();
    assert.equal(start.attached().length, 0, '开始下一段计时');
    assert.equal(start.ticking(), 1);

    const tab = loadPomodoro();
    tab.finishWork();
    tab.tab('long-break').click();
    assert.equal(tab.attached().length, 0, '切标签');

    const reset = loadPomodoro();
    reset.finishWork();
    reset.reset.click();
    assert.equal(reset.attached().length, 0, '重置');

    const skipNext = loadPomodoro();
    skipNext.finishWork();
    skipNext.skip.click();
    assert.equal(skipNext.attached().length, 0, '在休息模式点跳过也会清掉');
});

test('C9 连续完成四个专注：任何时刻最多一个提示；第四个进入长休息，仍然有提示', () => {
    const p = loadPomodoro();
    for (let round = 1; round <= 4; round += 1) {
        p.finishWork();
        assert.equal(p.attached().length, 1, `第 ${round} 个番茄后`);
        assert.equal(p.count.textContent, round);
    }
    assert.equal(p.activeTab(), 'long-break');
    assert.equal(p.display.textContent, '15:00');
    assert.equal(p.offers.filter(el => !el.removed).length, 1, '之前的提示都已移除，没有遗留');
});

test('C10 提示的标记是固定字符串：不含任何运行时数据', () => {
    const slice = pomodoroMethod();
    const markup = /offer\.innerHTML = `([^`]*)`/.exec(slice);
    assert.ok(markup);
    assert.deepEqual(markup[1].match(/\$\{[^}]*\}/g), ['${REST_SECONDS}'], '只插入常量 60');
    assert.match(slice, /const REST_SECONDS = 60;/);
});

// ---------- A. 静态契约 ----------

test('A1 index.html：样式在 product-ui-v5 与 spring-feel 之后；脚本顺序 core → controller → games-v5；版本号已同步', () => {
    const html = read('index.html');
    const at = pattern => {
        const found = html.search(pattern);
        assert.ok(found >= 0, `index.html 缺少 ${pattern}`);
        return found;
    };
    const css = at(/css\/jelly-game\.css\?v=1/);
    assert.ok(css > at(/css\/product-ui-v5\.css\?v=/), '必须在 product-ui-v5.css 之后');
    assert.ok(css > at(/css\/spring-feel\.css\?v=/), '必须在 spring-feel.css 之后');
    assert.ok(at(/js\/jelly-core\.js\?v=1/) < at(/js\/jelly-game\.js\?v=1/));
    assert.ok(at(/js\/jelly-game\.js\?v=1/) < at(/js\/games-v5\.js\?v=3/));
    assert.match(html, /js\/memo\.js\?v=13/);
    for (const file of ['css/jelly-game.css', 'js/jelly-core.js', 'js/jelly-game.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.equal((html.match(/js\/jelly-core\.js/g) || []).length, 1);
    assert.equal((html.match(/js\/jelly-game\.js/g) || []).length, 1);
});

test('A2 果冻不登记 ProductPagesV5 的页面，也不是 App 注册表里的独立应用（只在游戏中心里出现）', () => {
    assert.doesNotMatch(read('js/product-pages-v5.js'), /jelly/i);
    const registry = read('js/app-registry.js');
    assert.doesNotMatch(registry, /id:\s*'[^']*jelly/i);
    assert.match(registry, /id: 'games-hub'[^\n]*解压果冻/, '游戏中心的简介提到它');
    // dock-manager.js 里有一个同名的 Dock 悬停效果“jelly（果冻）”，与这个游戏无关，所以只查游戏相关的名字
    assert.doesNotMatch(read('js/dock-manager.js'), /JellyGame|jelly-game|jelly-core|解压果冻/, 'Dock 不认识这个游戏');
});

test('A3 果冻脚本是纯本地脚本：没有网络、没有动态执行', () => {
    for (const file of ['js/jelly-core.js', 'js/jelly-game.js']) {
        const source = stripBlockComments(read(file)).replace(/^\s*\/\/.*$/gm, '');
        for (const [pattern, why] of [
            [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XHR'], [/WebSocket/, 'WebSocket'], [/sendBeacon/, 'sendBeacon'],
            [/\beval\s*\(/, 'eval'], [/new Function/, 'new Function'], [/importScripts/, 'importScripts'],
            [/https?:\/\//, '外部地址'], [/chrome\.(runtime|storage|tabs)/, '扩展接口'], [/\binnerHTML\b|\binsertAdjacentHTML\b/, 'HTML 注入'],
        ]) assert.doesNotMatch(source, pattern, `${file}: ${why}`);
    }
    const css = read('css/jelly-game.css');
    assert.doesNotMatch(css, /url\(|@import|https?:\/\//, 'CSS 没有任何远程或文件引用');
});

test('A4 层级：游戏中心盖过番茄钟（数值从两份样式里读出来比较，改任何一边都会失败）', () => {
    const zOf = (css, selector) => {
        const found = new RegExp(`(?:^|[}\\s,])${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 'm').exec(stripBlockComments(css));
        assert.ok(found, `找不到 ${selector} 的 z-index`);
        return Number(found[1]);
    };
    const pomodoro = zOf(read('css/style.css'), '.pomodoro-panel');
    const hub = zOf(read('css/product-ui-v5.css'), '.games-v5-panel');
    const above = zOf(read('css/jelly-game.css'), '.games-v5-panel.games-v5-above');
    assert.equal(pomodoro, 10002);
    assert.equal(hub, 3500);
    assert.ok(above > pomodoro, `${above} 必须大于番茄钟的 ${pomodoro}`);
});

// ---------- D. CSS 与控制器类名 ----------

function cssRules(source) {
    const clean = stripBlockComments(source);
    const out = [];
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let found;
    while ((found = rule.exec(clean))) out.push({ selectors: found[1].split(',').map(item => item.trim()).filter(Boolean), body: found[2] });
    return out;
}

const declares = (rules, selector, property, value) => rules.some(rule => rule.selectors.includes(selector)
    && new RegExp(`(^|;)\\s*${property}\\s*:\\s*${value}\\s*(;|$)`).test(rule.body.replace(/\s+/g, ' ').trim()));

test('D1 画布必须由样式撑满舞台，否则画布固有尺寸会反过来撑大舞台（ResizeObserver 逐帧循环）', () => {
    const rules = cssRules(read('css/jelly-game.css'));
    assert.ok(declares(rules, '.jelly-canvas', 'position', 'absolute'));
    assert.ok(declares(rules, '.jelly-canvas', 'width', '100%'));
    assert.ok(declares(rules, '.jelly-canvas', 'height', '100%'));
    assert.ok(declares(rules, '.jelly-canvas', 'touch-action', 'none'), '触屏拖动不能滚动页面');
    assert.ok(declares(rules, '.jelly-stage', 'position', 'relative'));
    assert.ok(declares(rules, '.jelly-stage', 'overflow', 'hidden'));
    // 控制器自己不设画布显示尺寸：这条和上面成对，谁改了都要同时改另一边
    assert.doesNotMatch(read('js/jelly-game.js'), /canvas\.style\.(width|height)|s\.canvas\.style/);
});

test('D2 .jelly-btn 的 display 会盖过 [hidden]，必须单独写回；休息结束前“回去继续”按钮靠它隐藏', () => {
    const rules = cssRules(read('css/jelly-game.css'));
    assert.ok(declares(rules, '.jelly-btn', 'display', 'inline-flex'));
    assert.ok(declares(rules, '.jelly-btn[hidden]', 'display', 'none'));
    assert.match(read('js/jelly-game.js'), /hidden: ''/, '控制器确实用 hidden 属性隐藏它');
});

test('D3 游戏大厅四张卡片：宽屏 4 列、中屏 2 列、窄屏 1 列；父级宽度上限放宽到 1180', () => {
    const source = stripBlockComments(read('css/jelly-game.css'));
    const rules = cssRules(source);
    assert.ok(declares(rules, '.games-v5-grid', 'grid-template-columns', 'repeat\\(2, 1fr\\)'), '基础 2 列');
    assert.match(source, /@media \(min-width: 1100px\)\s*\{\s*\.games-v5-grid\s*\{\s*grid-template-columns:\s*repeat\(4, 1fr\)/);
    assert.match(source, /@media \(max-width: 760px\)\s*\{\s*\.games-v5-grid\s*\{\s*grid-template-columns:\s*1fr/);
    assert.ok(declares(rules, '.games-v5-grid', 'max-width', '1180px'));
    assert.ok(declares(rules, '.games-v5-local', 'max-width', '1180px'), '底部说明条与网格同宽');
    assert.ok(source.indexOf('min-width: 1100px') < source.indexOf('max-width: 760px'), '窄屏规则在后，才能覆盖宽屏');
    // 原样式表里的基础规则（3 列、1040）仍在：本文件只是覆盖，不是替换
    assert.match(read('css/product-ui-v5.css'), /\.games-v5-grid\{display:grid;max-width:1040px;[^}]*grid-template-columns:repeat\(3,1fr\)/);
});

test('D4 控制器创建的每个类名都有样式（除明确列出的无需样式者）；番茄钟提示的类同理', () => {
    const css = read('css/jelly-game.css');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][-\w]*)/g)].map(match => match[1]));
    const controller = read('js/jelly-game.js');
    const used = new Set();
    for (const match of controller.matchAll(/class: '([^']+)'/g)) match[1].split(/\s+/).forEach(name => used.add(name));
    for (const match of controller.matchAll(/classList\.(?:add|remove)\('([^']+)'\)/g)) used.add(match[1]);
    assert.ok(used.size >= 20, `只提取到 ${used.size} 个类名，提取方式失效`);
    const NO_STYLE_NEEDED = new Set(['jelly-total']);       // 纯文字，沿用 .jelly-foot 的字体颜色
    const missing = [...used].filter(name => !defined.has(name) && !NO_STYLE_NEEDED.has(name));
    assert.deepEqual(missing, [], '这些类名没有样式');

    const memo = read('js/memo.js');
    const offerClasses = new Set();
    for (const match of memo.matchAll(/class="(pomodoro-rest-offer[^"]*)"/g)) match[1].split(/\s+/).forEach(name => offerClasses.add(name));
    for (const match of memo.matchAll(/offer\.className = '([^']+)'/g)) match[1].split(/\s+/).forEach(name => offerClasses.add(name));
    assert.ok(offerClasses.size >= 3);
    for (const name of offerClasses) assert.ok(defined.has(name), `番茄钟提示的类 ${name} 没有样式`);

    // games-v5 里用到的新类
    const hub = read('js/games-v5.js');
    for (const name of ['games-v5-jelly', 'games-v5-jelly-root', 'games-v5-jelly-missing', 'games-v5-above']) {
        assert.ok(hub.includes(name), `games-v5.js 没有用到 ${name}`);
        assert.ok(defined.has(name), `${name} 没有样式`);
    }
});

test('D5 减少动态效果：果冻和提示的过渡与入场动画在偏好开启时都关闭', () => {
    const source = stripBlockComments(read('css/jelly-game.css'));
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(source);
    assert.ok(block, '缺少 reduced-motion 块');
    for (const selector of ['.jelly-swatch', '.jelly-hint', '.jelly-rest-fill', '.pomodoro-rest-offer']) {
        assert.ok(block[1].includes(selector), `${selector} 应在 reduced-motion 块里`);
    }
    assert.match(block[1], /animation:\s*none/);
    assert.match(block[1], /transition:\s*none/);
});

test('D6 弹簧曲线令牌复用 spring-feel.css，且都带回退值（令牌缺失时样式仍有效）', () => {
    const css = stripBlockComments(read('css/jelly-game.css'));
    assert.match(css, /var\(--spring-snappy-dur, 420ms\) var\(--spring-snappy, ease\)/);
    const spring = read('css/spring-feel.css');
    assert.match(spring, /--spring-snappy-dur:\s*420ms/);
    assert.match(spring, /--spring-snappy:/);
});
