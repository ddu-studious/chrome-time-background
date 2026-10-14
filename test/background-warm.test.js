const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Warm = require('../js/background-warm.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

class MemoryStorage {
    constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) { this.map.set(key, String(value)); }
    json() { return JSON.parse(this.map.get(Warm.STORAGE_KEY) || '[]'); }
}

const NOW = 1_800_000_000_000;
const item = (name, extra = {}) => ({ url: `https://upload.example.org/${name}.jpg`, location: name, description: name, source: 'wikimedia', ...extra });
const entry = (name, ageMs = 1000) => ({ url: item(name).url, ts: NOW - ageMs });
const urls = list => list.map(value => value.url);
const sequence = values => { let i = 0; return () => values[i++ % values.length]; };

// ---------- 预热记录的读写 ----------

test('读取预热记录时丢弃损坏、过期、未来、重复和格式不对的条目，并限制数量', () => {
    const rows = [
        entry('ok-1'), entry('ok-1', 5), { url: 'https://x/y.jpg', ts: 'not-a-number' }, { ts: NOW }, null, 'text',
        { url: item('too-old').url, ts: NOW - Warm.MAX_AGE_MS - 1 },
        { url: item('future').url, ts: NOW + 10 * 60_000 },
        entry('ok-2'), entry('ok-3'), entry('ok-4'), entry('ok-5'), entry('ok-6'), entry('ok-7'), entry('ok-8'),
    ];
    const storage = new MemoryStorage({ [Warm.STORAGE_KEY]: JSON.stringify(rows) });
    const entries = Warm.read(storage, NOW);
    assert.deepEqual(urls(entries), ['ok-1', 'ok-2', 'ok-3', 'ok-4', 'ok-5', 'ok-6'].map(name => item(name).url));
    assert.equal(entries.length, Warm.MAX_ENTRIES);
    assert.ok(entries.every(value => Object.keys(value).sort().join() === 'ts,url'), '只保留 url 与 ts');
});

test('预热记录损坏、不是数组或存储不可用时按空处理而不是抛错', () => {
    assert.deepEqual(Warm.read(new MemoryStorage({ [Warm.STORAGE_KEY]: '{oops' }), NOW), []);
    assert.deepEqual(Warm.read(new MemoryStorage({ [Warm.STORAGE_KEY]: '{"a":1}' }), NOW), []);
    assert.deepEqual(Warm.read({ getItem() { throw new Error('denied'); } }, NOW), []);
    assert.equal(Warm.write({ setItem() { throw new Error('quota'); } }, [entry('a')]), false);
});

test('只有 https 的静态图才会预热', () => {
    assert.equal(Warm.isWarmable(item('a')), true);
    assert.equal(Warm.isWarmable({ url: 'http://example.org/a.jpg' }), false);
    assert.equal(Warm.isWarmable({ url: 'data:image/png;base64,AAAA' }), false);
    assert.equal(Warm.isWarmable({ url: 'chrome-extension://abc/a.jpg' }), false);
    assert.equal(Warm.isWarmable({ url: 'not a url' }), false);
    assert.equal(Warm.isWarmable(item('v', { mediaType: 'video', videoUrl: 'https://example.org/v.mp4' })), false);
    assert.equal(Warm.isWarmable(null), false);
});

// ---------- 选图 ----------

test('没有预热记录时从整个列表随机，行为与原来一致', () => {
    const list = [item('a'), item('b'), item('c'), item('d')];
    assert.deepEqual(Warm.choose(list, [], () => 0), { item: list[0], warm: false });
    assert.deepEqual(Warm.choose(list, [], () => 0.99), { item: list[3], warm: false });
    assert.deepEqual(Warm.choose(list, [], () => 1), { item: list[3], warm: false }, 'random 恰为 1 也不越界');
    assert.equal(Warm.choose([], [entry('a')]), null);
    assert.equal(Warm.choose(null, []), null);
});

test('优先选已预热且仍在列表里的壁纸；不在列表里的记录和视频条目不参与', () => {
    const list = [item('a'), item('b'), item('c'), item('video', { mediaType: 'video', videoUrl: 'https://example.org/v.mp4' })];
    const entries = [entry('gone'), entry('video'), entry('c')];
    assert.deepEqual(Warm.choose(list, entries, () => 0), { item: list[2], warm: true });
    const twoWarm = [entry('a'), entry('c')];
    assert.equal(Warm.choose(list, twoWarm, () => 0).item.url, list[0].url);
    assert.equal(Warm.choose(list, twoWarm, () => 0.9).item.url, list[2].url);
    assert.equal(Warm.choose(list, [entry('gone')], () => 0).warm, false, '记录都不在列表里时退回随机');
});

test('被选中展示的壁纸从预热记录移除，其余保留', () => {
    const storage = new MemoryStorage({ [Warm.STORAGE_KEY]: JSON.stringify([entry('a'), entry('b'), entry('c')]) });
    Warm.consume(storage, item('b').url, NOW);
    assert.deepEqual(urls(storage.json()), [item('a').url, item('c').url]);
    const before = storage.map.get(Warm.STORAGE_KEY);
    Warm.consume(storage, item('missing').url, NOW);
    assert.equal(storage.map.get(Warm.STORAGE_KEY), before, '不在记录里时不写入');
});

// ---------- 预热计划与执行 ----------

test('预热计划跳过当前、已预热、视频和非 https，且不放回地随机挑选', () => {
    const list = [item('cur'), item('warm'), item('v', { mediaType: 'video' }), { url: 'http://example.org/h.jpg' }, item('a'), item('b'), item('c')];
    const picked = Warm.plan(list, [entry('warm')], item('cur').url, sequence([0, 0, 0]), 2);
    assert.deepEqual(urls(picked), [item('a').url, item('b').url]);
    assert.equal(Warm.plan(list, [], item('cur').url, () => 0, 99).length, 4, '可选不足时只给能给的');
    assert.deepEqual(Warm.plan(list, [], '', () => 0, 0), []);
    assert.deepEqual(Warm.plan(null, [], '', () => 0, 2), []);
});

test('Image 预热：成功、失败、超时（并中止请求）与构造异常', async () => {
    const created = [];
    const make = behaviour => () => {
        const image = { onload: null, onerror: null, src: '' };
        created.push(image);
        Object.defineProperty(image, 'src', {
            get() { return this._src || ''; },
            set(value) { this._src = value; if (value && behaviour === 'load') setImmediate(() => image.onload?.()); if (value && behaviour === 'error') setImmediate(() => image.onerror?.()); },
        });
        return image;
    };
    assert.equal(await Warm.warmImage('https://x/ok.jpg', { createImage: make('load'), timeoutMs: 500 }), true);
    assert.equal(created[0].src, 'https://x/ok.jpg');
    assert.equal(await Warm.warmImage('https://x/bad.jpg', { createImage: make('error'), timeoutMs: 500 }), false);
    assert.equal(await Warm.warmImage('https://x/slow.jpg', { createImage: make('hang'), timeoutMs: 20 }), false);
    assert.equal(created[2].src, '', '超时后清空 src 以中止仍在进行的下载');
    assert.equal(created[2].onload, null);
    assert.equal(await Warm.warmImage('https://x/throw.jpg', { createImage() { throw new Error('no Image'); } }), false);
});

test('补足预热：一次一张、成功才记录、失败不记录，并合并其它标签页同时写入的结果', async () => {
    const list = [item('cur'), item('a'), item('b'), item('c'), item('d')];
    const storage = new MemoryStorage();
    const order = [];
    let active = 0;
    let maxActive = 0;
    const added = await Warm.topUp({
        list, current: item('cur').url, storage, now: () => NOW, random: () => 0, target: 3,
        async warmOne(url) {
            active++; maxActive = Math.max(maxActive, active);
            order.push(url);
            try {
                await tick();
                if (url === item('a').url) return false; // 第一张失败：不记录
                if (url === item('b').url) { // 另一个标签页恰好也写了一张
                    const other = Warm.read(storage, NOW);
                    other.push({ url: item('other').url, ts: NOW });
                    Warm.write(storage, other);
                }
                return true;
            } finally {
                active--;
            }
        },
    });
    assert.equal(maxActive, 1, '同一时刻只预热一张');
    assert.equal(added, 2);
    assert.deepEqual(order, [item('a').url, item('b').url, item('c').url]);
    assert.deepEqual(urls(storage.json()).sort(), [item('b').url, item('c').url, item('other').url].sort(), '失败的 a 不记录，别人写的 other 没被覆盖');
});

test('补足预热：丢弃列表里已不存在的记录，已够数量时不再请求', async () => {
    const list = [item('cur'), item('a'), item('b')];
    const storage = new MemoryStorage({ [Warm.STORAGE_KEY]: JSON.stringify([entry('a'), entry('b'), entry('gone')]) });
    let requests = 0;
    const added = await Warm.topUp({ list, current: item('cur').url, storage, now: () => NOW, warmOne: async () => { requests++; return true; } });
    assert.equal(added, 0);
    assert.equal(requests, 0);
    assert.deepEqual(urls(storage.json()), [item('a').url, item('b').url], '已不在列表里的 gone 被清掉');
});

test('补足预热：被新一轮取代（shouldStop）后不再继续', async () => {
    const list = [item('cur'), item('a'), item('b'), item('c')];
    const storage = new MemoryStorage();
    let stop = false;
    const seen = [];
    const added = await Warm.topUp({
        list, current: item('cur').url, storage, now: () => NOW, random: () => 0, target: 3,
        shouldStop: () => stop,
        async warmOne(url) { seen.push(url); stop = true; return true; },
    });
    assert.equal(added, 1);
    assert.deepEqual(seen, [item('a').url]);
});

// ---------- main.js 的接入 ----------

function mainFixture({ hidden = false, saveData = false, stored = [], warm = Warm, noWarm = false } = {}) {
    const storage = new MemoryStorage(stored.length ? { [Warm.STORAGE_KEY]: JSON.stringify(stored) } : {});
    const calls = { warmImage: [], topUp: [], consume: [] };
    const pending = [];
    const api = {
        ...warm,
        consume: (...args) => { calls.consume.push(args[1]); return warm.consume(...args); },
        warmImage: (url, options) => new Promise(resolve => { calls.warmImage.push({ url, options }); pending.push(() => resolve(true)); }),
        topUp: async options => { calls.topUp.push(options); return 0; },
    };
    const style = {};
    const body = {
        dataset: {}, style,
        classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
        prepend() {},
    };
    const video = {
        style: {}, getAttribute: () => null, removeAttribute() {}, load() {}, pause() {}, play: () => Promise.resolve(),
    };
    const document = {
        body, hidden,
        getElementById: id => (id === 'background-video' ? video : null),
        addEventListener() {},
    };
    const window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
    if (!noWarm) window.BackgroundWarm = api;
    const sent = [];
    const context = vm.createContext({
        window, document, navigator: saveData ? { connection: { saveData: true } } : {}, localStorage: storage,
        setInterval: () => 1, clearInterval() {}, console,
        MutationObserver: class { observe() {} },
        chrome: { runtime: { sendMessage: (message, callback) => sent.push({ message, callback }) }, storage: { sync: { get: (key, callback) => callback?.({ settings: {} }) } } },
    });
    const main = read('js/main.js');
    vm.runInContext(main.slice(main.indexOf('// ==================== 背景系统'), main.indexOf('// 注意：时间显示')), context);
    return {
        context, storage, calls, body, sent,
        resolveWarmImages() { pending.splice(0).forEach(fn => fn()); },
        setList(list) { vm.runInContext('backgroundImages = __list', Object.assign(context, { __list: list })); },
        shown: () => style.backgroundImage,
    };
}

const LIST = [item('a'), item('b'), item('c')];

test('首页优先展示已预热的壁纸并把它从预热记录里取走', () => {
    const f = mainFixture({ stored: [{ url: item('b').url, ts: Date.now() - 1000 }] });
    f.setList(LIST);
    f.context.initBackgrounds();
    assert.equal(f.shown(), `url(${item('b').url})`);
    assert.deepEqual(f.calls.consume, [item('b').url]);
    assert.deepEqual(f.storage.json(), []);
});

test('没有预热记录时仍从整个列表随机，不触碰预热记录', () => {
    const f = mainFixture();
    f.setList(LIST);
    f.context.initBackgrounds();
    assert.ok(LIST.some(value => f.shown() === `url(${value.url})`));
    assert.deepEqual(f.calls.consume, []);
});

test('预热模块缺失或抛错时退回原来的随机选图，不影响首页', () => {
    const missing = mainFixture({ noWarm: true });
    missing.setList(LIST);
    missing.context.initBackgrounds();
    assert.ok(LIST.some(value => missing.shown() === `url(${value.url})`));

    const broken = mainFixture({ warm: { ...Warm, read() { throw new Error('storage denied'); } } });
    broken.setList(LIST);
    broken.context.initBackgrounds();
    assert.ok(LIST.some(value => broken.shown() === `url(${value.url})`));
    assert.deepEqual(broken.calls.topUp, []);

    const empty = mainFixture();
    empty.setList([]);
    empty.context.initBackgrounds();
    assert.equal(empty.shown(), undefined, '没有壁纸时什么都不做');
});

test('先等当前壁纸下载完，再预热下一批；中途被新一轮取代则旧一轮不再预热', async () => {
    const f = mainFixture();
    f.setList(LIST);
    f.context.initBackgrounds();
    await tick();
    assert.equal(f.calls.warmImage.length, 1, '先等当前这张');
    assert.equal(f.calls.warmImage[0].options.timeoutMs, 20000);
    assert.equal(f.calls.topUp.length, 0, '当前这张没下完前不预热别的，避免抢带宽');
    f.context.changeBackground(); // 自动轮换：更新的一轮取代第一轮
    await tick();
    f.resolveWarmImages();
    await tick();
    assert.equal(f.calls.topUp.length, 1, '只有最新一轮预热');
    const options = f.calls.topUp[0];
    assert.equal(options.storage, f.storage);
    assert.ok(options.list.length === LIST.length);
    assert.ok(LIST.some(value => value.url === options.current));
    assert.equal(options.shouldStop(), false);
    f.context.changeBackground();
    assert.equal(options.shouldStop(), true, '又有新一轮时，正在进行的预热在下一张之前停止');
});

test('页面一打开就不可见或省流量模式时不预热，但壁纸照常展示', async () => {
    for (const options of [{ hidden: true }, { saveData: true }]) {
        const f = mainFixture(options);
        f.setList(LIST);
        f.context.initBackgrounds();
        await tick();
        assert.ok(LIST.some(value => f.shown() === `url(${value.url})`));
        assert.equal(f.calls.warmImage.length, 0);
        assert.equal(f.calls.topUp.length, 0);
    }
});

test('当前是视频背景时不为它等待图片下载，直接进入预热补足', async () => {
    const f = mainFixture();
    const video = item('v', { mediaType: 'video', videoUrl: 'https://example.org/v.mp4' });
    f.setList([video]);
    f.context.initBackgrounds();
    await tick();
    assert.equal(f.calls.warmImage.length, 0, '视频不走图片预热');
    assert.equal(f.calls.topUp.length, 1);
    assert.equal(f.calls.topUp[0].current, video.url);
});

test('index.html 在 main.js 之前加载预热模块', () => {
    const html = read('index.html');
    const warm = html.indexOf('js/background-warm.js');
    const main = html.indexOf('js/main.js');
    assert.ok(warm > 0 && main > warm, 'background-warm.js 必须排在 main.js 之前');
    assert.match(html, /js\/background-warm\.js\?v=\d+/);
});
