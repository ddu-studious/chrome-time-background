// 任务完成“揉纸入篓”的接线与契约：脚本被页面加载后的行为、设置页开关、CSS 与 memo.js 实际标记的对应关系。
// 控制器本身的逻辑在 task-crumple.test.js（替身 DOM），这里只验证“接到真实文件上”的那一层。
// 其中读取 memo.js / index.html / css 源码的断言属于静态契约（不是真实浏览器验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/task-crumple-core.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------- 设置页（在 vm 里真实运行 settings-page.js） ----------

function makeElement(id) {
    const listeners = {};
    const el = {
        id, listeners, value: '', checked: false, children: [], style: {}, dataset: {}, disabled: false, textContent: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
        appendChild(child) { el.children.push(child); },
        replaceChildren(...children) { el.children = children; },
        querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false,
        focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, getContext: () => null,
        fire(name) { for (const fn of listeners[name] || []) fn({ target: el }); },
    };
    return el;
}

async function loadSettingsPage({ stored } = {}) {
    const elements = new Map();
    const document = {
        readyState: 'complete', body: makeElement('body'), documentElement: makeElement('html'), title: '',
        getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
        querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
        createElement: tag => makeElement(tag), createDocumentFragment: () => makeElement('fragment'),
        hidden: false,
    };
    const store = stored ? { backgroundExperienceSettings: stored } : {};
    const saved = [];
    const chrome = {
        storage: {
            sync: {
                get: async keys => (typeof keys === 'string' ? { [keys]: store[keys] } : {}),
                set: async value => { saved.push(JSON.parse(JSON.stringify(value))); Object.assign(store, value); },
            },
            local: { get: async () => ({}), set: async () => {} },
            onChanged: { addListener() {} },
        },
        runtime: { sendMessage() {}, getManifest: () => ({ version: '0' }), onMessage: { addListener() {} } },
        i18n: { getMessage: () => '' },
    };
    const win = {
        document, chrome, addEventListener() {},
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        location: { hash: '', search: '', href: '' }, history: { replaceState() {} },
        localStorage: { getItem: () => null, setItem() {} },
        innerWidth: 1280, innerHeight: 720, performance: { now: () => 0 },
    };
    win.window = win;
    const context = vm.createContext({
        ...win, window: win, document, chrome, console, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {}, navigator: { language: 'zh-CN' }, URL,
        fetch: async () => ({ ok: false, json: async () => ({}) }), Intl,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}, getComputedStyle: () => ({}),
        CustomEvent: class {}, Event: class {}, MutationObserver: class { observe() {} },
        IntersectionObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
        AudioContext: undefined, webkitAudioContext: undefined,
    });
    vm.runInContext(read('js/settings-page.js'), context, { filename: 'settings-page.js' });
    await tick(); await tick();
    return { saved, box: document.getElementById('set-bgTaskCrumple') };
}

test('设置页：任务完成动效开关默认开启；只有保存的布尔 false 才关闭', async () => {
    assert.equal((await loadSettingsPage()).box.checked, true, '没有保存过设置');
    assert.equal((await loadSettingsPage({ stored: { enabled: true } })).box.checked, true, '旧版本保存的设置里没有这个字段');
    assert.equal((await loadSettingsPage({ stored: { taskCrumple: false } })).box.checked, false);
    for (const value of ['false', 0, null, '', 'off']) {
        assert.equal((await loadSettingsPage({ stored: { taskCrumple: value } })).box.checked, true, `非布尔 false 不算关闭：${JSON.stringify(value)}`);
    }
});

test('设置页：切换开关保存布尔值，且不改动其他字段', async () => {
    const page = await loadSettingsPage({ stored: { enabled: true, clockLiquid: false, wallpaperTransition: 'none', intensity: 40 } });
    page.box.checked = false;
    page.box.fire('change');
    await tick();
    let last = page.saved[page.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.taskCrumple, false);
    assert.equal(last.clockLiquid, false);
    assert.equal(last.wallpaperTransition, 'none');
    assert.equal(last.enabled, true);
    assert.equal(last.intensity, 40);

    page.box.checked = true;
    page.box.fire('change');
    await tick();
    last = page.saved[page.saved.length - 1].backgroundExperienceSettings;
    assert.equal(last.taskCrumple, true);
    assert.equal(last.clockLiquid, false, '再次保存仍保留其他字段');
});

// ---------- background-experience.js 的设置归一化 ----------

function loadBackgroundExperience() {
    const document = {
        readyState: 'complete', hidden: false, body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
        getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    };
    const win = {
        document, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {},
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, performance: { now: () => 0 },
        chrome: { storage: { sync: { get: async () => ({}) }, onChanged: { addListener() {} } } },
    };
    win.window = win;
    const context = vm.createContext({
        ...win, window: win, document, console, navigator: {}, performance: win.performance, innerWidth: 1280, innerHeight: 720,
        chrome: win.chrome, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
        AudioContext: undefined, webkitAudioContext: undefined,
    });
    vm.runInContext(read('js/background-experience.js'), context, { filename: 'background-experience.js' });
    return win.BackgroundExperience;
}

test('background-experience.js：taskCrumple 默认 true，只有 false 才关闭，其余取值与攻击性输入都按开启', () => {
    const { normalizeSettings, DEFAULTS } = loadBackgroundExperience();
    assert.equal(DEFAULTS.taskCrumple, true);
    assert.equal(normalizeSettings(undefined).taskCrumple, true);
    assert.equal(normalizeSettings({ taskCrumple: false }).taskCrumple, false);
    for (const value of ['false', 0, null, {}, [], '<img src=x>']) {
        assert.equal(normalizeSettings({ taskCrumple: value }).taskCrumple, true, JSON.stringify(value));
    }
    assert.equal(normalizeSettings({ taskCrumple: false, enabled: false }).enabled, false, '总开关独立');
});

// ---------- 脚本被页面加载后的行为 ----------

test('页面加载 task-crumple.js 后自动在 document 上注册一个捕获阶段的 click 监听；重复加载由 init 幂等保护同一实例', () => {
    const registered = [];
    const document = {
        body: {}, hidden: false, createElement: () => ({}),
        addEventListener: (...args) => registered.push(args), removeEventListener() {},
    };
    const win = { document, matchMedia: () => ({ matches: false }), performance: { now: () => 0 } };
    win.window = win;
    win.TaskCrumpleCore = Core;
    const context = vm.createContext({ window: win, document, console, setTimeout, clearTimeout });
    vm.runInContext(read('js/task-crumple.js'), context, { filename: 'task-crumple.js' });

    assert.equal(typeof win.TaskCrumple.attach, 'function');
    assert.equal(registered.length, 1);
    assert.equal(registered[0][0], 'click');
    assert.equal(registered[0][2], true, '必须是捕获阶段');
    win.TaskCrumple.init();
    assert.equal(registered.length, 1, 'init 重复调用不重复注册');
});

test('核心脚本缺席时（只加载了控制器）：加载阶段明确失败，控制台可见，不会留下半初始化的监听', () => {
    const registered = [];
    const document = { body: {}, addEventListener: (...args) => registered.push(args) };
    const win = { document };
    win.window = win;
    const context = vm.createContext({ window: win, document, console, setTimeout, clearTimeout });
    // 控制器在加载时就读取 Core.PARAMS。页面上核心先于控制器加载（见下面的 index.html 顺序测试）；
    // 万一缺席，就让这一个脚本在加载阶段失败，而不是静默地装作可用。vm 里的 TypeError 来自另一个 realm，只能按名字判断。
    assert.throws(
        () => vm.runInContext(read('js/task-crumple.js'), context),
        error => error.name === 'TypeError' && /PARAMS/.test(error.message),
    );
    assert.equal(registered.length, 0, '失败时没有注册监听');
    assert.equal(win.TaskCrumple, undefined, '也没有留下半成品全局对象');
});

// ---------- index.html / settings.html ----------

test('index.html：样式与两个脚本登记，核心先于控制器，弹簧手感先于控制器（晃动缓动优先复用它）', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="stylesheet" href="css\/task-crumple\.css\?v=\d+">/);
    const core = html.indexOf('js/task-crumple-core.js');
    const controller = html.indexOf('js/task-crumple.js');
    assert.ok(core > 0 && controller > 0, '两个脚本都登记');
    assert.ok(core < controller, '核心先于控制器');
    assert.ok(html.indexOf('js/spring-feel.js') > 0 && html.indexOf('js/spring-feel.js') < controller);
    assert.ok(html.indexOf('js/background-experience.js') < controller, '设置来源先加载');
    for (const name of ['js/task-crumple-core.js', 'js/task-crumple.js', 'css/task-crumple.css']) {
        assert.ok(!/(https?:)?\/\//.test(html.slice(html.indexOf(name) - 20, html.indexOf(name))), `${name} 是本地文件，不走远程地址`);
    }
});

test('settings.html：开关在“触感实验”卡片里，默认选中，文案说明只是视觉效果', () => {
    const html = read('settings.html');
    const card = html.slice(html.indexOf('id="sp-touch-feel-card"'), html.indexOf('<!-- 天气设置 -->'));
    assert.match(card, /<input type="checkbox" id="set-bgTaskCrumple" checked>/);
    const field = card.slice(card.indexOf('任务完成动效'), card.indexOf('set-bgTaskCrumple'));
    assert.match(field, /纸团/);
    assert.match(field, /不改变任务的完成与保存/);
});

// ---------- CSS 契约 ----------

test('css：动效层不接收事件、盖在页面最上层；纸篓分前后两层且纸团夹在中间；纸团尺寸与脚本参数一致', () => {
    const css = stripComments(read('css/task-crumple.css'));
    const rule = selector => {
        const match = css.match(new RegExp(`${selector.replace(/[.\\[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
        assert.ok(match, `缺少规则 ${selector}`);
        return match[1];
    };
    const layer = rule('.task-crumple-layer');
    assert.match(layer, /position:\s*fixed/);
    assert.match(layer, /pointer-events:\s*none/);
    assert.ok(Number(layer.match(/z-index:\s*(\d+)/)[1]) >= 2147483000, '盖过助手浮层等最上层界面');

    const z = selector => Number(rule(selector).match(/z-index:\s*(\d+)/)[1]);
    assert.ok(z('.task-crumple-layer .tc-bin-back') < z('.task-crumple-layer .tc-paper'));
    assert.ok(z('.task-crumple-layer .tc-paper') < z('.task-crumple-layer .tc-ball'));
    assert.ok(z('.task-crumple-layer .tc-ball') < z('.task-crumple-layer .tc-bin-front'), '纸团在篓后层之上、篓前层之下，才像掉进篓里');

    const ball = rule('.task-crumple-layer .tc-ball');
    assert.equal(Number(ball.match(/width:\s*(\d+)px/)[1]), Core.PARAMS.BALL);
    assert.equal(Number(ball.match(/height:\s*(\d+)px/)[1]), Core.PARAMS.BALL);

    assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.task-crumple-layer\s*\{[^}]*display:\s*none\s*!important/);
    // 动效层内一切 CSS 过渡/动画都关掉：克隆条目沿用原类名，不能自己动起来（Web Animations 不受影响）
    assert.match(css, /\.task-crumple-layer \*\s*\{[^}]*transition:\s*none\s*!important[^}]*animation:\s*none\s*!important/);
});

test('css：不引用任何外部资源（没有 url()、@import、远程字体）', () => {
    const css = stripComments(read('css/task-crumple.css'));
    assert.ok(!/url\s*\(/.test(css));
    assert.ok(!/@import/.test(css));
});

// ---------- 与 memo.js 实际标记的对应关系（静态契约） ----------

test('选择器与 memo.js 真实标记一致：任务条目类名、data-id、勾选框、列表容器 id、完成态类', () => {
    const memo = read('js/memo.js');
    assert.match(memo, /item\.className = `sidebar-task-item \$\{task\.completed \? 'completed' : ''\}/);
    assert.match(memo, /item\.className = `panel-task-item \$\{task\.completed \? 'completed' : ''\}/);
    assert.equal((memo.match(/item\.dataset\.id = task\.id;/g) || []).length >= 2, true);
    assert.match(memo, /taskList\.id = 'sidebar-task-list';/);
    assert.match(memo, /taskListContainer\.id = 'panel-task-list';/);
    assert.equal((memo.match(/<div class="task-checkbox" title=/g) || []).length >= 2, true);

    assert.equal(Core.ITEM_SELECTOR, '.sidebar-task-item, .panel-task-item');
    assert.equal(Core.LIST_SELECTOR, '#sidebar-task-list, #panel-task-list');
});

test('习惯打卡不是“完成任务”：习惯条目用 .habit-check，不带 .task-checkbox，因此不会触发揉纸（若以后改动须有意识地决定）', () => {
    const memo = read('js/memo.js');
    const start = memo.indexOf('createHabitTaskItem(habit, index, total) {');
    assert.ok(start > 0);
    const end = memo.indexOf('\n    }\n', start);
    const habit = memo.slice(start, end);
    assert.ok(habit.includes('habit-check'));
    assert.ok(!habit.includes('task-checkbox'), '习惯条目不应使用 .task-checkbox');
});

test('memo.js 与其他业务脚本完全不知道这个动效（纯装饰层，没有反向依赖）', () => {
    for (const file of ['js/memo.js', 'js/main.js', 'js/dock-manager.js', 'js/background.js']) {
        if (!fs.existsSync(path.join(root, file))) continue;
        const source = read(file);
        assert.ok(!/TaskCrumple|task-crumple/.test(source), `${file} 不应引用 task-crumple`);
    }
});
