// 水母情绪/成长/番茄钟陪伴的接入层：脚本加载顺序、设置键三处同步、音乐播放状态的广播、番茄钟面板在每个状态点通知陪伴水母。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---------- 脚本与设置 ----------

test('index.html：陪伴水母脚本只加载一次，在水母皮肤之后；不引用远程脚本', () => {
    const html = read('index.html');
    const skin = html.indexOf('js/jellyfish.js');
    const pomodoro = html.indexOf('js/pomodoro-jelly.js');
    assert.ok(skin > 0 && pomodoro > skin);
    assert.equal(html.split('js/pomodoro-jelly.js').length - 1, 1);
    assert.match(html, /js\/pomodoro-jelly\.js\?v=2/);
    const tag = html.slice(html.lastIndexOf('<script', pomodoro), pomodoro + 40);
    assert.doesNotMatch(tag, /https?:/);
});

test('三个新设置键在宿主、设置页、设置页 HTML 三处同步；默认开、只有明确的 false 才关', () => {
    const host = read('js/background-experience.js');
    const page = read('js/settings-page.js');
    const html = read('settings.html');
    for (const [key, id] of [['jellyfishDance', 'set-bgJellyfishDance'], ['jellyfishGrow', 'set-bgJellyfishGrow'], ['pomodoroJelly', 'set-bgPomodoroJelly']]) {
        assert.match(host, new RegExp(`${key}: true,`), `${key} 默认开（宿主）`);
        assert.match(host, new RegExp(`${key}: source\\.${key} !== false`), `${key} 只有 false 才关（宿主）`);
        assert.match(page, new RegExp(`${key}: true,`), `${key} 默认开（设置页）`);
        assert.match(page, new RegExp(`${key}: stored\\.${key} !== false`), `${key} 只有 false 才关（设置页）`);
        assert.match(page, new RegExp(`'${id}', '${key}'`), `${id} 绑定到 ${key}`);
        assert.ok(html.includes(`id="${id}"`), `settings.html 缺少 ${id}`);
    }
});

test('宿主：dance 只在设置开启且音乐正在播放时为 1；grow 跟设置走；监听的是 music:playing', () => {
    const host = read('js/background-experience.js');
    assert.match(host, /dance: this\.settings\.jellyfishDance && this\.musicPlaying \? 1 : 0, grow: this\.settings\.jellyfishGrow/);
    assert.match(host, /window\.addEventListener\('music:playing', event => \{ this\.musicPlaying = event\?\.detail\?\.playing === true; \}\)/);
    assert.match(host, /this\.musicPlaying = false;/);
});

test('宿主：music:playing 事件真的改变传给皮肤的 dance（vm 中跑 bind 与 drawJellyfish）', () => {
    const source = read('js/background-experience.js');
    const bind = /bind\(\) \{[\s\S]*?window\.addEventListener\('music:playing'[^\n]*\n/.exec(source);
    assert.ok(bind, '找不到 bind 里的 music:playing 监听');
    const listeners = {};
    const sandbox = { window: { addEventListener: (type, fn) => { listeners[type] = fn; } } };
    vm.createContext(sandbox);
    const self = { bound: false, musicPlaying: false, toggle: { addEventListener() {} } };
    vm.runInContext(`(function () { const o = { ${bind[0]} this.toggle.addEventListener('click'); } }; return o; })()`.replace("this.toggle.addEventListener('click'); } };", '} };'), sandbox);
    const holder = vm.runInContext(`({ ${bind[0]} } })`.replace(/\}\s*\}\)$/, '}})'), sandbox);
    holder.bind.call(self);
    assert.equal(self.musicPlaying, false);
    listeners['music:playing']({ detail: { playing: true } });
    assert.equal(self.musicPlaying, true);
    listeners['music:playing']({ detail: { playing: 'yes' } });
    assert.equal(self.musicPlaying, false, '只认真正的 true');
    listeners['music:playing']({ detail: { playing: true } });
    listeners['music:playing']({});
    assert.equal(self.musicPlaying, false, '没有 detail 当没在播');
    listeners['music:playing'](undefined);
    assert.equal(self.musicPlaying, false);
});

test('设置页文案：说明了起舞不是真实节拍、成长只读、陪伴水母与背景皮肤无关', () => {
    const html = read('settings.html');
    assert.match(html, /不是真实的音乐节拍，也不读取音频/);
    assert.match(html, /不改任何任务数据/);
    assert.match(html, /与是否选了“深海水母”背景无关/);
});

// ---------- 音乐播放状态广播 ----------

function loadAnnouncer() {
    const source = read('js/music-controller.js');
    const found = /_announcePlaying\(playing\) \{[\s\S]*?\n    \}\n/.exec(source);
    assert.ok(found, '找不到 _announcePlaying');
    const events = [];
    const sandbox = { window: { dispatchEvent: event => { events.push(event); } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
    vm.createContext(sandbox);
    const holder = vm.runInContext(`({ ${found[0]} })`, sandbox);
    return { events, self: {}, run(playing) { holder._announcePlaying.call(this.self, playing); } };
}

test('音乐控制器：只在“正在播放”变化时广播一次 music:playing，重复调用不重复发', () => {
    const a = loadAnnouncer();
    a.run(false);
    a.run(false);
    a.run(true);
    a.run(true);
    a.run(false);
    assert.deepEqual(a.events.map(e => [e.type, e.detail.playing]), [['music:playing', false], ['music:playing', true], ['music:playing', false]]);
});

test('音乐控制器：_updateUI 一开头就按 state.isPlaying 广播；没有 window.dispatchEvent 也不抛错', () => {
    const source = read('js/music-controller.js');
    assert.match(source, /_updateUI\(\) \{\n        this\._announcePlaying\(Boolean\(this\.state\.isPlaying\)\);/);
    const sandbox = { window: {}, CustomEvent: class {} };
    vm.createContext(sandbox);
    const found = /_announcePlaying\(playing\) \{[\s\S]*?\n    \}\n/.exec(source);
    const holder = vm.runInContext(`({ ${found[0]} })`, sandbox);
    assert.doesNotThrow(() => holder._announcePlaying.call({}, true));
});

// ---------- 番茄钟面板通知陪伴水母 ----------

function pomodoroMethod() {
    const memo = read('js/memo.js');
    const start = memo.indexOf('    initPomodoroTimer(panel) {');
    const end = memo.indexOf('    /**\n     * 播放番茄钟提示音', start);
    assert.ok(start > 0 && end > start, '找不到 initPomodoroTimer 的方法边界：memo.js 结构变了，请更新本测试的切片');
    return memo.slice(start, end);
}

function fakeElement(name) {
    const handlers = {};
    const classes = new Set();
    return {
        name, textContent: '', className: '', dataset: {}, handlers, classes,
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))) },
        addEventListener(type, fn) { handlers[type] = fn; },
        click() { handlers.click && handlers.click({ type: 'click' }); },
        focus() {}, remove() {},
    };
}

function loadPomodoro({ companion = 'spy', throwOnAttach = false } = {}) {
    const calls = [];
    const intervals = new Map();
    let nextId = 1;
    const elements = {};
    const el = selector => (elements[selector] = elements[selector] || fakeElement(selector));
    const tabs = ['work', 'short-break', 'long-break'].map(mode => Object.assign(fakeElement(`tab-${mode}`), { dataset: { mode } }));
    const panel = {
        querySelector: selector => el(selector),
        querySelectorAll: () => tabs,
        classList: { remove() {}, add() {} },
        remove() {},
    };
    const spy = {
        attach(host) {
            if (throwOnAttach) throw new Error('boom');
            calls.push(['attach', host]);
            return {
                setState: state => calls.push(['setState', { ...state }]),
                finish: () => calls.push(['finish']),
                destroy: () => calls.push(['destroy']),
            };
        },
    };
    const sandbox = {
        document: {}, console, JSON, Math,
        localStorage: { getItem: () => null, setItem() {} },
        setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
        clearInterval(id) { intervals.delete(id); },
        setTimeout() {},
    };
    sandbox.window = sandbox;
    if (companion === 'spy') sandbox.PomodoroJelly = spy;
    vm.createContext(sandbox);
    const self = { getTodayDate: () => '2026-10-15', showToast() {}, playPomodoroSound() {} };
    const holder = vm.runInContext(`(function () { return { ${pomodoroMethod()} }; })()`, sandbox, { filename: 'memo.js(initPomodoroTimer)' });
    holder.initPomodoroTimer.call(self, panel);
    return {
        calls, el, tabs,
        tab: mode => tabs.find(t => t.dataset.mode === mode),
        toggle: () => el('#pomodoro-toggle').click(),
        skip: () => el('#pomodoro-skip').click(),
        close: () => el('#pomodoro-close').click(),
        overlay: () => el('.pomodoro-overlay').click(),
        tick(n) { for (let i = 0; i < n; i += 1) { const fn = [...intervals.values()][0]; if (!fn) return i; fn(); } return n; },
        states: () => calls.filter(c => c[0] === 'setState').map(c => c[1]),
        count: name => calls.filter(c => c[0] === name).length,
        ticking: () => intervals.size,
    };
}

test('番茄钟：打开时把 .pomodoro-body 交给陪伴水母（只一次）', () => {
    const p = loadPomodoro();
    assert.equal(p.count('attach'), 1);
    assert.equal(p.calls[0][1], p.el('.pomodoro-body'));
});

test('番茄钟：开始、暂停、切换模式都把真实状态告诉陪伴水母', () => {
    const p = loadPomodoro();
    p.toggle();
    assert.deepEqual(p.states().at(-1), { mode: 'work', running: true });
    p.toggle();
    assert.deepEqual(p.states().at(-1), { mode: 'work', running: false });
    p.tab('short-break').click();
    assert.deepEqual(p.states().at(-1), { mode: 'short-break', running: false });
    p.toggle();
    assert.deepEqual(p.states().at(-1), { mode: 'short-break', running: true });
    p.el('#pomodoro-reset').click();
    assert.deepEqual(p.states().at(-1), { mode: 'short-break', running: false }, '重置：停下');
});

test('番茄钟：专注自然走完才 finish 一次，且最后状态是短休息、没在计时；其间没有提前 finish', () => {
    const p = loadPomodoro();
    p.toggle();
    p.tick(25 * 60 - 1);
    assert.equal(p.count('finish'), 0, '没走完不庆祝');
    p.tick(1);
    assert.equal(p.count('finish'), 1);
    assert.deepEqual(p.states().at(-1), { mode: 'short-break', running: false });
    assert.equal(p.ticking(), 0);
});

test('番茄钟：点“跳过”、休息走完、专注中途重置都不庆祝', () => {
    const skipped = loadPomodoro();
    skipped.skip();
    assert.equal(skipped.count('finish'), 0, '跳过不算');
    const rest = loadPomodoro();
    rest.tab('short-break').click();
    rest.toggle();
    rest.tick(5 * 60);
    assert.equal(rest.count('finish'), 0, '休息走完不庆祝');
    const reset = loadPomodoro();
    reset.toggle();
    reset.tick(600);
    reset.el('#pomodoro-reset').click();
    assert.equal(reset.count('finish'), 0);
});

test('番茄钟：关闭按钮与点遮罩都销毁陪伴水母', () => {
    const closed = loadPomodoro();
    closed.close();
    assert.equal(closed.count('destroy'), 1);
    const overlay = loadPomodoro();
    overlay.overlay();
    assert.equal(overlay.count('destroy'), 1);
});

test('番茄钟：没有陪伴水母脚本，或 attach 抛错，计时器照常工作', () => {
    for (const options of [{ companion: 'none' }, { throwOnAttach: true }]) {
        const p = loadPomodoro(options);
        p.toggle();
        assert.equal(p.ticking(), 1);
        assert.equal(p.tick(25 * 60), 25 * 60);
        assert.equal(p.ticking(), 0, '走完后定时器停了');
        assert.doesNotThrow(() => { p.skip(); p.close(); p.overlay(); p.tab('long-break').click(); });
    }
});

test('源码不变量：陪伴水母与成长/情绪代码不写存储、不发网络、不用 innerHTML、不 eval', () => {
    for (const file of ['js/pomodoro-jelly.js']) {
        const source = read(file).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(source, /storage\.(local|sync)\.(set|remove|clear)|localStorage\.setItem|sessionStorage\.setItem/, `${file} 不写存储`);
        assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|sendMessage|innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|setInterval|setTimeout/, `${file}`);
    }
    const core = read('js/jellyfish-core.js').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(core, /Date\.now|new Date\(\)|performance\.now/, '核心不碰当前时间（今天的日期、本地日归属都由宿主传入；Date.UTC 只做纯日期运算）');
});
