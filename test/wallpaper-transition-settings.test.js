// 壁纸转场设置：一个下拉框对应 wallpaperTransition + wallpaperTransitionStyle 两个字段。
// 在 vm 里真实运行 settings-page.js 与 background-experience.js（通用 DOM 替身），不是只检查源码字符串。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/wallpaper-weave-core.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

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

function sandbox({ stored, withCore = true } = {}) {
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
    if (withCore) win.WallpaperWeaveCore = Core;
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
    return { context, document, saved, store, win, elements };
}

async function loadSettingsPage(options) {
    const box = sandbox(options);
    vm.runInContext(read('js/settings-page.js'), box.context, { filename: 'settings-page.js' });
    await tick(); await tick();
    box.select = box.document.getElementById('set-bgWallpaperTransition');
    return box;
}

test('设置页的下拉选项来自转场注册表：每次随机、八种风格（含名称与顺序）、直接切换', async () => {
    const { select } = await loadSettingsPage();
    assert.deepEqual(select.children.map(option => option.value), ['random', ...Core.STYLE_IDS, 'none']);
    assert.deepEqual(select.children.map(option => option.textContent), [
        '每次随机（推荐）', ...Core.STYLES.map(style => style.label), '直接切换（不播放转场）',
    ]);
    assert.equal(select.disabled, false);
});

test('下拉框的当前值由已保存的两个字段还原：默认随机；旧版 weave 视为随机；固定风格；关闭', async () => {
    const cases = [
        [undefined, 'random'],
        [{ wallpaperTransition: 'weave' }, 'random'],
        [{ wallpaperTransition: 'on', wallpaperTransitionStyle: 'ink' }, 'ink'],
        [{ wallpaperTransition: 'on', wallpaperTransitionStyle: 'not-a-style' }, 'random'],
        [{ wallpaperTransition: 'none', wallpaperTransitionStyle: 'ink' }, 'none'],
        [{ wallpaperTransition: '"><img src=x>', wallpaperTransitionStyle: 12345 }, 'random'],
    ];
    for (const [stored, expected] of cases) {
        const { select } = await loadSettingsPage({ stored });
        assert.equal(select.value, expected, JSON.stringify(stored));
    }
});

test('改下拉框：两个字段一起保存；选直接切换关闭转场，选风格固定该风格，选随机恢复随机', async () => {
    const box = await loadSettingsPage({ stored: { enabled: true, clockLiquid: false } });
    const transitions = [];
    for (const choice of ['ripple', 'none', 'random', 'flip']) {
        box.select.value = choice;
        box.select.fire('change');
        await tick();
        const last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
        transitions.push([last.wallpaperTransition, last.wallpaperTransitionStyle]);
        assert.equal(last.clockLiquid, false, '不影响其他设置');
        assert.equal(last.enabled, true);
    }
    assert.deepEqual(transitions, [['on', 'ripple'], ['none', 'random'], ['on', 'random'], ['on', 'flip']]);
});

test('下拉框被写入未知取值：保存为随机而不是未知值', async () => {
    const box = await loadSettingsPage();
    box.select.value = '<script>alert(1)</script>';
    box.select.fire('change');
    await tick();
    const last = box.saved[box.saved.length - 1].backgroundExperienceSettings;
    assert.deepEqual([last.wallpaperTransition, last.wallpaperTransitionStyle], ['on', 'random']);
});

test('转场核心脚本缺席时设置页不崩溃：下拉框禁用且不保存', async () => {
    const box = await loadSettingsPage({ withCore: false });
    assert.equal(box.select.disabled, true);
    box.select.value = 'ink';
    box.select.fire('change');
    await tick();
    assert.equal(box.saved.length, 0);
});

test('settings.html 在 settings-page.js 之前加载转场核心；静态保底选项与风格名称都写在页面里', () => {
    const html = read('settings.html');
    assert.ok(html.indexOf('js/wallpaper-weave-core.js') > 0);
    assert.ok(html.indexOf('js/wallpaper-weave-core.js') < html.indexOf('js/settings-page.js'));
    const field = html.slice(html.indexOf('壁纸切换效果'), html.indexOf('液态时钟'));
    for (const style of Core.STYLES) assert.ok(field.includes(style.label), `说明里列出“${style.label}”`);
    assert.match(field, /<select class="sp-select" id="set-bgWallpaperTransition">[\s\S]*value="random"[\s\S]*value="none"/);
});

test('background-experience.js 的设置归一化：开关与风格字段、旧版 weave、攻击性取值', () => {
    const elements = new Map();
    const document = {
        readyState: 'complete', hidden: false, body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
        getElementById(id) { return elements.has(id) ? elements.get(id) : null; },
        addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
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
    const { normalizeSettings, DEFAULTS } = win.BackgroundExperience;
    assert.equal(DEFAULTS.wallpaperTransition, 'on');
    assert.equal(DEFAULTS.wallpaperTransitionStyle, 'random');
    const pick = value => { const n = normalizeSettings(value); return [n.wallpaperTransition, n.wallpaperTransitionStyle]; };
    assert.deepEqual(pick(undefined), ['on', 'random']);
    assert.deepEqual(pick({ wallpaperTransition: 'weave' }), ['on', 'random'], '旧版保存的 weave 变为开启 + 随机');
    assert.deepEqual(pick({ wallpaperTransition: 'none', wallpaperTransitionStyle: 'ink' }), ['none', 'ink']);
    assert.deepEqual(pick({ wallpaperTransition: 'on', wallpaperTransitionStyle: 'zoom' }), ['on', 'zoom']);
    assert.deepEqual(pick({ wallpaperTransitionStyle: 'Zoom' }), ['on', 'random'], '大写不是合法 id');
    assert.deepEqual(pick({ wallpaperTransitionStyle: '../../etc/passwd' }), ['on', 'random']);
    assert.deepEqual(pick({ wallpaperTransitionStyle: 'a'.repeat(200) }), ['on', 'random']);
    assert.deepEqual(pick({ wallpaperTransitionStyle: { toString: () => 'ink' } }), ['on', 'random']);
    assert.deepEqual(pick({ wallpaperTransitionStyle: 7 }), ['on', 'random']);
    // 归一化出来的风格即使是模块不认识的合法形态，也会被转场模块当作 random
    assert.equal(Core.normalizeStyle(pick({ wallpaperTransitionStyle: 'someday' })[1]), 'random');
});

test('main.js 把设置里的风格传给转场；设置缺失时不传（由转场模块按随机处理）', () => {
    const main = read('js/main.js');
    assert.match(main, /const style = window\.backgroundExperience\?\.settings\?\.wallpaperTransitionStyle;/);
    assert.match(main, /weave\.play\(\{ from, to: background, style \}\)/);
});
