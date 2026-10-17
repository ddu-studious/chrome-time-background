// 弹簧手感的样式与接线契约：令牌与公式一致、被覆盖的类名真实存在、加载顺序正确、减少动态效果有出口。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Spring = require('../js/spring-feel.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/spring-feel.css');

function tokens(block) {
    const map = {};
    for (const match of block.matchAll(/--spring-([a-z]+(?:-dur)?):\s*([^;]+);/g)) map[match[1]] = match[2].trim();
    return map;
}

test('令牌：回退块与 @supports 块都由 spring-feel.js 的公式生成，不得手改', () => {
    const supportsStart = css.indexOf('@supports (animation-timing-function: linear(0, 1))');
    assert.ok(supportsStart > 0);
    const fallback = tokens(css.slice(0, supportsStart));
    const linear = tokens(css.slice(supportsStart, css.indexOf('/* ---- Dock', supportsStart)));
    for (const name of Spring.PRESET_NAMES) {
        assert.equal(fallback[name], Spring.FALLBACKS[name], `${name} 回退曲线与模块不一致`);
        assert.equal(fallback[name + '-dur'], Spring.durationMs(name) + 'ms', `${name} 时长与模块不一致`);
        assert.equal(linear[name], Spring.linear(name), `${name} 的 linear() 与模块不一致（改 PRESETS 后需重新生成 css/spring-feel.css）`);
    }
});

test('被覆盖的选择器指向真实存在的类名（类名改了就要同步这里）', () => {
    const sources = ['css/dock-manager.css', 'css/product-ui-v4.css', 'css/product-ui-v5.css', 'css/alarm-center.css', 'css/style.css']
        .map(read).join('\n');
    const classes = [
        'dock-launchpad-content', 'dock-launchpad', 'dock-group-popover', 'games-v5-panel', 'poetry-v5-panel',
        'kw-detail-panel', 'kw-detail-overlay', 'blog-v5-modal', 'blog-v5-overlay', 'alarm-center', 'alarm-center-overlay',
        'dock-btn', 'dock-drop-before', 'dock-drop-after',
    ];
    for (const name of classes) {
        assert.ok(new RegExp(`\\.${name}(?![\\w-])`).test(sources), `现有样式中找不到 .${name}`);
        assert.ok(new RegExp(`\\.${name}(?![\\w-])`).test(css), `spring-feel.css 没有覆盖 .${name}`);
    }
});

test('入场用弹簧、离场保持短促的 ease；只动 scale/translate，不碰 transform', () => {
    // 每个“打开”状态规则都引用弹簧令牌
    const openRules = css.match(/[^{}]*\.(?:open|visible)[^{}]*\{[^}]*\}/g) || [];
    assert.ok(openRules.length >= 4, '至少覆盖启动台/群组弹层/整屏面板/弹窗');
    for (const rule of openRules) assert.match(rule, /var\(--spring-(snappy|soft|bouncy)(-dur)?\)/, rule.slice(0, 60));
    // 弹簧不得出现在“关闭”状态（离场要短促）
    const closedLaunchpad = css.match(/\.dock-launchpad \.dock-launchpad-content\s*\{[^}]*\}/)[0];
    assert.doesNotMatch(closedLaunchpad, /--spring/);
    // 覆盖规则不得设置非 none 的 transform（群组弹层的内联 transform 与 Dock 效果的内联 transform 都要保留）
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const transformDeclarations = [...withoutComments.matchAll(/(^|[;{\s])transform:\s*([^;]+);/g)];
    for (const match of transformDeclarations) {
        assert.equal(match[2].trim(), 'none', `覆盖规则里不应写 transform: ${match[2].trim()}`);
    }
    // 关闭态规则逐个核对：普通面板清掉旧的 transform（改由 scale/translate 承担，避免两套位移叠加）；
    // 群组弹层不能清（它的内联 transform: translateX(-50%) 负责水平居中，类里的 transform 本来就不生效）。
    const ruleFor = selector => withoutComments.match(new RegExp(selector.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))[1];
    assert.match(ruleFor('.dock-launchpad .dock-launchpad-content'), /transform:\s*none;/);
    assert.match(ruleFor('.alarm-center'), /transform:\s*none;/);
    assert.match(ruleFor('.poetry-v5-panel'), /transform:\s*none;/);
    assert.doesNotMatch(ruleFor('.dock-group-popover'), /transform:\s*none;/);
});

test('减少动态效果：所有被覆盖的元素取消 scale/translate', () => {
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(reduce.length > 40);
    assert.match(reduce, /scale:\s*none;/);
    assert.match(reduce, /translate:\s*none;/);
    for (const selector of ['.dock-launchpad .dock-launchpad-content', '.dock-group-popover', '.games-v5-panel', '.poetry-v5-panel', '.kw-detail-panel', '.blog-v5-modal', '.alarm-center', '.dock-bar .dock-btn.dock-drop-before', '.dock-bar .dock-btn.dock-drop-after']) {
        assert.ok(reduce.includes(selector), `减少动态效果未覆盖 ${selector}`);
    }
});

test('Dock 拖拽按钮的 transition 保留原有三项并追加 translate', () => {
    const original = read('css/dock-manager.css').match(/\.dock-btn\[draggable="true"\]\s*\{[^}]*transition:\s*([^;]+);/)[1];
    const mine = css.match(/\.dock-bar \.dock-btn\[draggable="true"\]\s*\{[^}]*transition:\s*([^;]+);/)[1];
    assert.ok(mine.startsWith(original), `原规则 "${original}" 变了，请同步 spring-feel.css：${mine}`);
    assert.match(mine, /translate var\(--spring-snappy-dur\) var\(--spring-snappy\)/);
});

test('index.html：样式在 product-ui-v5/alarm 等之后加载，脚本在 dock-manager.js 之前', () => {
    const html = read('index.html');
    assert.ok(html.includes('css/spring-feel.css?v=1'));
    assert.ok(html.indexOf('css/spring-feel.css') > html.indexOf('css/product-ui-v5.css'));
    assert.ok(html.indexOf('css/spring-feel.css') > html.indexOf('css/dock-manager.css'));
    assert.ok(html.indexOf('js/spring-feel.js') > 0 && html.indexOf('js/spring-feel.js') < html.indexOf('js/dock-manager.js'));
});

test('alarm-center.css 是被 index.html 之外的页面加载的吗：弹簧样式只在首页生效', () => {
    // 闹钟中心等面板也可能出现在别的页面；本轮只在首页加载 spring-feel.css，别的页面保持原样。
    for (const page of ['settings.html', 'tasks.html', 'assistant.html', 'alarm-ring.html']) {
        if (fs.existsSync(path.join(root, page))) assert.ok(!read(page).includes('spring-feel'), page);
    }
});

test('懒创建的面板在加 visible 之前先提交关闭态样式，否则首次打开没有入场过渡', () => {
    // 元素刚插入就带 visible，浏览器没有“之前的样式”可过渡；读 offsetWidth 强制提交一次关闭态。
    assert.match(read('js/games-v5.js'), /document\.body\.appendChild\(panel\);\s*void panel\.offsetWidth;/);
    assert.match(read('js/main.js'), /document\.body\.appendChild\(panel\);\s*void panel\.offsetWidth;\s*\/\/[^\n]*\n\s*\}\s*return panel;/);
});

test('Dock 接线：render 前记位置、后回弹；分组键稳定；回弹失败不影响 Dock', () => {
    const source = read('js/dock-manager.js');
    const render = source.slice(source.indexOf('    render() {'), source.indexOf('    _createAppButton'));
    const captureAt = render.indexOf('this._springCapture()');
    const mutateAt = render.indexOf("querySelectorAll('.dock-btn, .dock-divider, .dock-group')");
    const settleAt = render.indexOf('this._springSettle(springBefore)');
    assert.ok(captureAt > 0 && captureAt < mutateAt, '必须在改动 DOM 之前记位置');
    assert.ok(settleAt > render.indexOf('this.dockEl.appendChild(frag)'), '必须在新 DOM 就位之后回弹');
    assert.match(source, /_springCapture\(\) \{\s*try \{/);
    assert.match(source, /try \{ window\.SpringFeel\.settle\(this\.dockEl, before, DOCK_SPRING\); \} catch/);
    assert.match(source, /btn\.dataset\.dockGroupKey = `\$\{group\.name \|\| ''\}\|\$\{\(group\.children \|\| \[\]\)\.join\(','\)\}`/);
    assert.match(source, /preset: 'bouncy'/);
});
