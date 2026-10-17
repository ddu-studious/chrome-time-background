const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/wallpaper-weave-core.js');

const img = (name, extra = {}) => ({ url: `https://images.example.com/${name}.jpg`, ...extra });
const base = () => ({
    settings: { enabled: true, wallpaperTransition: 'weave' },
    from: img('a'), to: img('b'),
    reduceMotion: false, saveData: false, hidden: false, suspended: false, blocked: new Set(),
});

test('满足条件时播放转场', () => {
    assert.deepEqual(Core.decide(base()), { ok: true, reason: 'ok' });
});

test('设置缺失按默认开启，选择“直接切换”或关闭背景体验则不播放', () => {
    assert.equal(Core.decide({ ...base(), settings: undefined }).ok, true);
    assert.equal(Core.decide({ ...base(), settings: {} }).ok, true);
    assert.equal(Core.decide({ ...base(), settings: { wallpaperTransition: 'none' } }).reason, 'disabled');
    assert.equal(Core.decide({ ...base(), settings: { enabled: false } }).reason, 'disabled');
});

test('减少动态效果、省流量、页面隐藏或被工作台遮挡时不播放', () => {
    assert.equal(Core.decide({ ...base(), reduceMotion: true }).reason, 'reduced-motion');
    assert.equal(Core.decide({ ...base(), saveData: true }).reason, 'save-data');
    assert.equal(Core.decide({ ...base(), hidden: true }).reason, 'hidden');
    assert.equal(Core.decide({ ...base(), suspended: true }).reason, 'suspended');
});

test('只有静态图之间才转场：没有旧图、视频、同一张、非 http(s) 都直接切换', () => {
    assert.equal(Core.decide({ ...base(), from: null }).reason, 'no-source');
    assert.equal(Core.decide({ ...base(), from: img('a', { mediaType: 'video' }) }).reason, 'not-image');
    assert.equal(Core.decide({ ...base(), to: img('b', { mediaType: 'video' }) }).reason, 'not-image');
    assert.equal(Core.decide({ ...base(), to: { url: 'data:image/png;base64,AAAA' } }).reason, 'not-image');
    assert.equal(Core.decide({ ...base(), to: { url: 'not a url' } }).reason, 'not-image');
    assert.equal(Core.decide({ ...base(), to: { url: '' } }).reason, 'not-image');
    assert.equal(Core.decide({ ...base(), to: img('a') }).reason, 'same');
});

test('此前不能跨域读取的地址不再尝试，集合有上限', () => {
    const blocked = new Set([img('b').url]);
    assert.equal(Core.decide({ ...base(), blocked }).reason, 'blocked');
    assert.equal(Core.decide({ ...base(), blocked: new Set([img('a').url]) }).reason, 'blocked');
    const set = new Set();
    for (let i = 0; i < Core.MAX_BLOCKED + 10; i++) Core.remember(set, `https://x/${i}`);
    assert.equal(set.size, Core.MAX_BLOCKED);
    assert.equal(set.has('https://x/0'), false, '最旧的被淘汰');
    assert.equal(set.has(`https://x/${Core.MAX_BLOCKED + 9}`), true);
    Core.remember(set, 42);
    assert.equal(set.size, Core.MAX_BLOCKED, '非字符串忽略');
});

test('cover 铺放与 CSS background-size: cover; center 一致', () => {
    // 图更宽：按高度铺满，左右裁掉
    let t = Core.coverTransform(2000, 1000, 1000, 1000);
    assert.equal(t.sy, 1);
    assert.equal(t.sx, 0.5);
    assert.equal(t.ox, 0.25);
    assert.equal(t.oy, 0);
    // 图更高：按宽度铺满，上下裁掉
    t = Core.coverTransform(1000, 2000, 1000, 1000);
    assert.equal(t.sx, 1);
    assert.equal(t.sy, 0.5);
    assert.equal(t.oy, 0.25);
    // 视口中心恒映射到图片中心
    for (const [iw, ih, vw, vh] of [[3000, 2000, 1440, 900], [800, 1200, 1920, 1080], [1920, 1080, 1920, 1080]]) {
        const c = Core.coverTransform(iw, ih, vw, vh);
        assert.ok(Math.abs(0.5 * c.sx + c.ox - 0.5) < 1e-9);
        assert.ok(Math.abs(0.5 * c.sy + c.oy - 0.5) < 1e-9);
        assert.ok(c.sx <= 1 + 1e-9 && c.sy <= 1 + 1e-9, '只裁不放');
    }
    assert.deepEqual(Core.coverTransform(0, 0, 100, 100), { sx: 1, sy: 1, ox: 0, oy: 0 });
});

test('超过纹理上限的图等比缩小，不放大', () => {
    assert.deepEqual(Core.fitTexture(4096, 2048, 2048), { width: 2048, height: 1024, scale: 0.5 });
    assert.deepEqual(Core.fitTexture(1000, 500, 2048), { width: 1000, height: 500, scale: 1 });
    assert.ok(Core.fitTexture(1, 100000, 2048).width >= 1);
});

test('丝带延迟可复现、落在 [0, MAX_DELAY]，不同种子不同', () => {
    const a = Core.bandDelays(Core.BANDS, 7);
    assert.equal(a.length, Core.BANDS);
    assert.deepEqual(a, Core.bandDelays(Core.BANDS, 7));
    assert.notDeepEqual(a, Core.bandDelays(Core.BANDS, 8));
    for (const value of a) assert.ok(value >= 0 && value <= Core.MAX_DELAY);
    assert.ok(Math.max(...a) - Math.min(...a) > 0.1, '确实错开了');
});

test('进度单调，起止精确为 0 和 1', () => {
    assert.equal(Core.progressAt(0), 0);
    assert.equal(Core.progressAt(Core.DURATION_MS), 1);
    assert.equal(Core.progressAt(Core.DURATION_MS * 5), 1);
    assert.equal(Core.progressAt(-10), 0);
    let previous = -1;
    for (let ms = 0; ms <= Core.DURATION_MS; ms += 40) {
        const value = Core.progressAt(ms);
        assert.ok(value >= previous);
        previous = value;
    }
    assert.equal(Core.progressAt(10, 0), 1, '时长为 0 直接到位');
});

test('风格注册表：八种、id 唯一、编织排第一、时长合理、带中文名称', () => {
    assert.equal(Core.STYLES.length, 8);
    assert.equal(new Set(Core.STYLE_IDS).size, 8);
    assert.equal(Core.STYLE_IDS[0], 'weave');
    assert.equal(Core.FALLBACK_STYLE, 'weave');
    for (const style of Core.STYLES) {
        assert.match(style.id, /^[a-z]{3,10}$/);
        assert.ok(style.label.length >= 2 && style.label.length <= 5, style.label);
        assert.ok(style.duration >= 1000 && style.duration <= 2200, `${style.id} ${style.duration}`);
        assert.equal(Core.durationFor(style.id), style.duration);
    }
    assert.equal(Core.durationFor('weave'), Core.DURATION_MS, '编织沿用原来的时长');
    assert.equal(Core.durationFor('bogus'), Core.DURATION_MS);
    assert.equal(Object.isFrozen(Core.STYLES), true);
    assert.ok(Core.STYLES.every(style => Object.isFrozen(style)), '注册表项不可被改写');
    assert.equal(Object.isFrozen(Core.STYLE_IDS), true);
});

test('normalizeStyle：只认注册过的 id，其余（含原型链键名、大小写不符）一律 random', () => {
    for (const id of Core.STYLE_IDS) assert.equal(Core.normalizeStyle(id), id);
    for (const bad of [undefined, null, '', 'random', 'Weave', 'bogus', '__proto__', 'constructor', 7, {}, []]) {
        assert.equal(Core.normalizeStyle(bad), 'random', String(bad));
    }
});

test('pickStyle：随机时从所有风格里挑，且永远不与上一次连续重复', () => {
    const counts = Object.fromEntries(Core.STYLE_IDS.map(id => [id, 0]));
    let previous = null;
    let state = 12345;
    const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
    for (let i = 0; i < 4000; i++) {
        const style = Core.pickStyle({ previous, random });
        assert.notEqual(style, previous);
        counts[style]++;
        previous = style;
    }
    for (const [id, count] of Object.entries(counts)) assert.ok(count > 4000 / 8 * 0.8, `${id} 太少：${count}`);
});

test('pickStyle：边界输入——random 为 0、接近 1、NaN、负数都落在合法范围', () => {
    for (const value of [0, 0.999999999, 1, NaN, -3, Infinity]) {
        const style = Core.pickStyle({ random: () => value });
        assert.ok(Core.STYLE_IDS.includes(style), String(value));
    }
    assert.equal(Core.pickStyle({ random: () => 0 }), 'weave');
    assert.equal(Core.pickStyle({ random: () => 0, previous: 'weave' }), 'ripple', '避开上一次');
    assert.ok(Core.STYLE_IDS.includes(Core.pickStyle({})), '什么参数都不传也能工作');
    assert.ok(Core.STYLE_IDS.includes(Core.pickStyle()), '连参数对象都不传');
});

test('pickStyle：固定某种风格时无视 previous 与 random；被排除（编译失败）的风格退回编织', () => {
    assert.equal(Core.pickStyle({ preference: 'flip', previous: 'flip', random: () => 0 }), 'flip');
    assert.equal(Core.pickStyle({ preference: 'flip', exclude: new Set(['flip']) }), 'weave');
    assert.equal(Core.pickStyle({ preference: 'flip', exclude: ['flip'] }), 'weave');
});

test('pickStyle：随机时排除损坏的风格；只剩一种时即使与上次相同也用它；全被排除回退编织', () => {
    const exclude = new Set(Core.STYLE_IDS.filter(id => id !== 'swirl'));
    assert.equal(Core.pickStyle({ exclude, previous: 'swirl', random: () => 0.5 }), 'swirl');
    assert.equal(Core.pickStyle({ exclude: new Set(Core.STYLE_IDS) }), 'weave');
    for (let i = 0; i < 200; i++) {
        assert.notEqual(Core.pickStyle({ exclude: new Set(['ripple', 'ink']), random: () => i / 200 }), 'ripple');
        assert.notEqual(Core.pickStyle({ exclude: new Set(['ripple', 'ink']), random: () => i / 200 }), 'ink');
    }
});

test('设置下拉框的单一取值与两个设置字段互相映射；旧版保存的 weave 视为随机', () => {
    assert.equal(Core.choiceFromSettings(undefined), 'random');
    assert.equal(Core.choiceFromSettings({}), 'random');
    assert.equal(Core.choiceFromSettings({ wallpaperTransition: 'weave' }), 'random', '旧版默认保存的 weave 不能把人钉死在编织上');
    assert.equal(Core.choiceFromSettings({ wallpaperTransition: 'on', wallpaperTransitionStyle: 'ink' }), 'ink');
    assert.equal(Core.choiceFromSettings({ wallpaperTransition: 'on', wallpaperTransitionStyle: 'bogus' }), 'random');
    assert.equal(Core.choiceFromSettings({ wallpaperTransition: 'none', wallpaperTransitionStyle: 'ink' }), 'none');
    assert.deepEqual(Core.settingsFromChoice('none'), { wallpaperTransition: 'none', wallpaperTransitionStyle: 'random' });
    assert.deepEqual(Core.settingsFromChoice('random'), { wallpaperTransition: 'on', wallpaperTransitionStyle: 'random' });
    assert.deepEqual(Core.settingsFromChoice('zoom'), { wallpaperTransition: 'on', wallpaperTransitionStyle: 'zoom' });
    assert.deepEqual(Core.settingsFromChoice('<script>'), { wallpaperTransition: 'on', wallpaperTransitionStyle: 'random' });
    for (const choice of ['none', 'random', ...Core.STYLE_IDS]) {
        assert.equal(Core.choiceFromSettings(Core.settingsFromChoice(choice)), choice, `往返 ${choice}`);
    }
});

test('旧值 weave 与新值 on 都算开启，只有 none 关闭', () => {
    for (const value of ['weave', 'on', undefined, 'anything']) {
        assert.equal(Core.decide({ ...base(), settings: { wallpaperTransition: value } }).ok, true, String(value));
    }
    assert.equal(Core.decide({ ...base(), settings: { wallpaperTransition: 'none', wallpaperTransitionStyle: 'ink' } }).reason, 'disabled');
});

test('styleParams：由种子决定、可复现、落在着色器假定的范围内', () => {
    assert.deepEqual(Core.styleParams(7), Core.styleParams(7));
    assert.notDeepEqual(Core.styleParams(7), Core.styleParams(8));
    const verticals = new Set();
    const dirs = new Set();
    for (let seed = 0; seed < 300; seed++) {
        const p = Core.styleParams(seed * 104729);
        assert.ok(p.seed01 >= 0 && p.seed01 < 1);
        for (const c of p.center) assert.ok(c >= 0.2 && c <= 0.8, `中心 ${c}`);
        assert.ok(p.dir.every(d => d === 1 || d === -1));
        assert.ok(p.vertical === 0 || p.vertical === 1);
        verticals.add(p.vertical);
        dirs.add(p.dir.join(','));
    }
    assert.equal(verticals.size, 2, '横竖都会出现');
    assert.equal(dirs.size, 4, '四个方向都会出现');
    assert.doesNotThrow(() => Core.styleParams(undefined));
    assert.doesNotThrow(() => Core.styleParams(-5));
});
