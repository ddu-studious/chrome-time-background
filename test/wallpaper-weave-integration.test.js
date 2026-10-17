// main.js 的“换壁纸”接入：编织转场只是装饰，任何路径都不能让壁纸停在旧图上或被迟到的回调覆盖。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/wallpaper-weave-core.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const bg = name => ({ url: `https://images.example.com/${name}.jpg`, description: name });

function fixture({ weave = 'real', suspendedClass = false, settings, hidden = false, reduceMotion = false, syncBackgrounds = null } = {}) {
    const calls = { canPlay: [], play: [], cancel: [], release: 0, warm: 0 };
    const style = {};
    const classes = new Set(suspendedClass ? ['bili-panel-open'] : []);
    const observers = [];
    const body = {
        dataset: {}, style,
        classList: {
            contains: name => classes.has(name),
            add: name => classes.add(name), remove: name => classes.delete(name),
            toggle(name, on) { on ? classes.add(name) : classes.delete(name); },
        },
        prepend() {},
    };
    const video = { style: {}, getAttribute: () => null, removeAttribute() {}, load() {}, pause() {}, play: () => Promise.resolve() };
    const document = { body, hidden, getElementById: id => (id === 'background-video' ? video : null), addEventListener() {} };
    const window = {
        addEventListener() {}, matchMedia: () => ({ matches: reduceMotion, addEventListener() {} }),
        backgroundExperience: settings ? { settings, setSuspended() {}, setBackground() {} } : undefined,
        BackgroundWarm: {
            choose: () => null, read: () => [], consume() {}, isWarmable: () => false,
            warmImage: async () => true, topUp: async () => { calls.warm++; return 0; },
        },
    };
    let pending = null;
    const verdictFor = options => {
        calls.canPlay.push(options);
        return Core.decide({ ...options, blocked: new Set() });
    };
    if (weave !== 'absent') {
        window.WallpaperWeave = {
            canPlay: verdictFor,
            play(options) {
                calls.play.push(options);
                if (weave === 'throws') throw new Error('play exploded');
                return new Promise((resolve, reject) => { pending = { resolve, reject }; });
            },
            cancel(reason) { calls.cancel.push(reason); },
        };
    }
    const context = vm.createContext({
        window, document, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
        setInterval: () => 1, clearInterval() {}, console,
        MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
        // syncBackgrounds：与 js/chrome-shim.js（本地预览）一致，对 getBackgrounds 同步回调；真实扩展里是异步的。
        chrome: {
            runtime: { sendMessage(message, callback) { if (syncBackgrounds && message?.action === 'getBackgrounds') callback({ backgrounds: syncBackgrounds }); } },
            storage: { sync: { get: (key, callback) => callback?.({ settings: {} }) } },
        },
    });
    const main = read('js/main.js');
    vm.runInContext(main.slice(main.indexOf('// ==================== 背景系统'), main.indexOf('// 注意：时间显示')), context);
    const release = () => { calls.release++; };
    return {
        context, calls, body, style, window, document,
        shown: () => style.backgroundImage,
        setList(list) { vm.runInContext('backgroundImages = __list', Object.assign(context, { __list: list })); },
        pickOnly(item) { vm.runInContext('_pickBackground = () => __only', Object.assign(context, { __only: item })); },
        resolve(value) { pending.resolve(value); },
        resolvePlayed() { pending.resolve({ played: true, reason: 'ok', release }); },
        resolveNotPlayed(reason = 'load-failed') { pending.resolve({ played: false, reason }); },
        reject(error) { pending.reject(error); },
        applyDirect(item) { context._applyBackground(item); },
        suspend(on) { on ? classes.add('bili-panel-open') : classes.delete('bili-panel-open'); observers.forEach(callback => callback()); },
    };
}

async function startOn(f, first, next) {
    f.pickOnly(first);
    f.context.changeBackground();           // 第一张：没有旧图，只能直接应用
    f.pickOnly(next);
    f.calls.play.length = 0;
    f.calls.canPlay.length = 0;
    f.context.changeBackground();
    await tick();
}

test('第一张壁纸没有旧图：直接应用，不请求转场', () => {
    const f = fixture();
    f.pickOnly(bg('a'));
    f.context.changeBackground();
    assert.equal(f.shown(), `url(${bg('a').url})`);
    assert.equal(f.calls.play.length, 0);
});

test('转场期间 body 仍是旧图，播放完成后才切到新图、释放画布并安排预热', async () => {
    const f = fixture();
    await startOn(f, bg('a'), bg('b'));
    assert.equal(f.calls.play.length, 1);
    assert.equal(f.calls.play[0].from.url, bg('a').url);
    assert.equal(f.calls.play[0].to.url, bg('b').url);
    assert.equal(f.shown(), `url(${bg('a').url})`, '转场期间不提前换 body 背景');
    const warmBefore = f.calls.warm;
    f.resolvePlayed();
    await tick();
    assert.equal(f.shown(), `url(${bg('b').url})`);
    assert.equal(f.calls.release, 1);
    assert.ok(f.calls.warm >= warmBefore, '预热在新壁纸应用之后才排期');
});

test('转场不可用或加载失败：仍然换成新壁纸', async () => {
    const f = fixture({ settings: { enabled: true, wallpaperTransition: 'none' } });
    await startOn(f, bg('a'), bg('b'));
    assert.equal(f.calls.play.length, 0, '设置为直接切换时不请求转场');
    assert.equal(f.shown(), `url(${bg('b').url})`);

    const g = fixture();
    await startOn(g, bg('a'), bg('b'));
    g.resolveNotPlayed('load-failed');
    await tick();
    assert.equal(g.shown(), `url(${bg('b').url})`);
    assert.equal(g.calls.release, 0, '没播就没有画布可释放');
});

test('模块缺席、play 抛错、play 被拒：都退回原来的切换', async () => {
    const absent = fixture({ weave: 'absent' });
    await startOn(absent, bg('a'), bg('b'));
    assert.equal(absent.shown(), `url(${bg('b').url})`);

    const throws = fixture({ weave: 'throws' });
    await startOn(throws, bg('a'), bg('b'));
    assert.equal(throws.shown(), `url(${bg('b').url})`);

    const rejects = fixture();
    await startOn(rejects, bg('a'), bg('b'));
    rejects.reject(new Error('gl failed'));
    await tick();
    assert.equal(rejects.shown(), `url(${bg('b').url})`);
});

test('背景体验总开关关闭、减少动态效果、页面隐藏、被工作台遮挡：不请求转场', async () => {
    for (const options of [
        { settings: { enabled: false } },
        { reduceMotion: true },
        { hidden: true },
        { suspendedClass: true },
    ]) {
        const f = fixture(options);
        await startOn(f, bg('a'), bg('b'));
        assert.equal(f.calls.play.length, 0, JSON.stringify(options));
        assert.equal(f.shown(), `url(${bg('b').url})`, JSON.stringify(options));
    }
});

test('转场进行中又换了一张：旧一轮迟到的完成不能覆盖新壁纸，但要释放自己的画布', async () => {
    const f = fixture();
    await startOn(f, bg('a'), bg('b'));
    // 第二次换壁纸直接设置（例如转场不可用的路径）
    f.window.WallpaperWeave.canPlay = () => ({ ok: false, reason: 'test' });
    f.pickOnly(bg('c'));
    f.context.changeBackground();
    assert.equal(f.shown(), `url(${bg('c').url})`);
    assert.ok(f.calls.cancel.length >= 1, '直接设置会取消正在进行的转场');
    f.resolvePlayed();
    await tick();
    assert.equal(f.shown(), `url(${bg('c').url})`, '旧一轮的完成不覆盖更新的壁纸');
    assert.equal(f.calls.release, 1);
});

test('其他路径直接 _applyBackground（如减少动态效果切换）会取消转场并使其回调失效', async () => {
    const f = fixture();
    await startOn(f, bg('a'), bg('b'));
    f.applyDirect(bg('x'));
    assert.ok(f.calls.cancel.length >= 1);
    f.resolvePlayed();
    await tick();
    assert.equal(f.shown(), `url(${bg('x').url})`);
});

test('工作台遮住首页：取消转场，回调随后把新壁纸直接设好', async () => {
    const f = fixture();
    await startOn(f, bg('a'), bg('b'));
    f.suspend(true);
    assert.deepEqual(f.calls.cancel.slice(-1), ['suspended']);
    f.resolveNotPlayed('suspended');
    await tick();
    assert.equal(f.shown(), `url(${bg('b').url})`, '看不见也要把状态设对，恢复后不是旧图');
});

test('转场回调最终调用 _applyBackground 时不会取消自己的画布', async () => {
    const f = fixture();
    await startOn(f, bg('a'), bg('b'));
    const cancelsBefore = f.calls.cancel.length;
    f.resolvePlayed();
    await tick();
    assert.equal(f.calls.cancel.length, cancelsBefore, 'fromWeave 路径不触发 cancel');
});

test('getBackgrounds 同步回调（本地预览的 chrome-shim）：声明顺序正确，壁纸照常初始化', () => {
    // 回归：_bgTransitionRun 曾声明在 getBackgrounds 请求之后，同步回调会触发“before initialization”并让首页没有壁纸。
    let f;
    assert.doesNotThrow(() => { f = fixture({ syncBackgrounds: [bg('shim')] }); });
    assert.equal(f.shown(), `url(${bg('shim').url})`);
    const main = read('js/main.js');
    assert.ok(main.indexOf('let _bgTransitionRun') < main.indexOf("action: 'getBackgrounds'"), '声明先于请求');
});

test('index.html 在 main.js 之前按依赖顺序加载四个新脚本与样式', () => {
    const html = read('index.html');
    const order = ['js/wallpaper-weave-core.js', 'js/wallpaper-weave.js', 'js/clock-liquid-core.js', 'js/clock-liquid.js', 'js/main.js']
        .map(name => html.indexOf(name));
    assert.ok(order.every(index => index > 0), '全部登记');
    assert.deepEqual([...order].sort((a, b) => a - b), order, '核心先于控制器，全部先于 main.js');
    assert.ok(html.indexOf('js/background-experience.js') < order[0], '设置来源先加载');
    assert.match(html, /css\/touch-feel\.css\?v=\d+/);
});
