const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/clock-liquid-core.js');

function allFinite(field) {
    return [field.h, field.v, field.sx, field.sy].every(array => array.every(Number.isFinite));
}

function stroke(field, count = 40) {
    for (let i = 0; i < count; i++) {
        const cx = 20 + i * 3.5, cy = field.rows / 2 + Math.sin(i / 5) * 4;
        const impulse = Core.impulseFromMove(14, 2, 16);
        Core.smear(field, cx, cy, 6, impulse.px, impulse.py);
        Core.splash(field, cx, cy, 5, impulse.depth);
        Core.step(field);
    }
}

test('一次划动之后模拟保持有限且最终自己恢复（自愈）', () => {
    const field = Core.createField(166, 62);
    stroke(field);
    assert.ok(field.peak > 0.3, '划动确实把场搅乱了');
    let steps = 0;
    while (!Core.isSettled(field) && steps < 3000) { Core.step(field); steps++; }
    assert.ok(Core.isSettled(field), `应在有限步内恢复，实际 ${steps} 步`);
    assert.ok(steps < 600, `恢复应在约 10 秒内（60fps），实际 ${steps} 步`);
    assert.ok(allFinite(field));
});

test('长时间连续划动不会发散（能量有上界）', () => {
    const field = Core.createField(100, 50);
    let maxPeak = 0;
    for (let i = 0; i < 1500; i++) {
        const cx = 5 + (i * 7) % 90, cy = 5 + (i * 3) % 40;
        const impulse = Core.impulseFromMove(30, 20, 8);
        Core.smear(field, cx, cy, 6, impulse.px, impulse.py);
        Core.splash(field, cx, cy, 5, impulse.depth);
        maxPeak = Math.max(maxPeak, Core.step(field));
        assert.ok(allFinite(field), `第 ${i} 步出现非有限值`);
    }
    assert.ok(maxPeak < 40, `峰值应有界，实际 ${maxPeak}`);
    for (const value of field.h) assert.ok(Math.abs(value) <= 40);
    for (const value of field.sx) assert.ok(Math.abs(value) <= Core.PARAMS.maxSmear + 1e-6);
});

test('边界吸收：靠边的波不会反弹回来', () => {
    const field = Core.createField(80, 40);
    Core.splash(field, 8, 20, 5, -1);
    for (let i = 0; i < 120; i++) Core.step(field);
    // 120 步后波早已撞过左边界；吸收带应让整个场的幅度显著小于初始 1。
    let max = 0;
    for (const value of field.h) max = Math.max(max, Math.abs(value));
    assert.ok(max < 0.12, `边界反弹过强：${max}`);
});

test('smear 与 splash 只影响半径内的格子并被限幅', () => {
    const field = Core.createField(40, 30);
    Core.splash(field, 20, 15, 4, -5);
    assert.ok(field.h[15 * 40 + 20] >= -Core.PARAMS.maxHeight - 1e-6, '深度限幅');
    assert.equal(field.h[15 * 40 + 30], 0, '半径外不变');
    Core.smear(field, 20, 15, 4, 1000, -1000);
    assert.equal(field.sx[15 * 40 + 20], Core.PARAMS.maxSmear);
    assert.equal(field.sy[15 * 40 + 20], -Core.PARAMS.maxSmear);
    assert.equal(field.sx[15 * 40 + 30], 0);
    // 越界坐标不抛错、不写出边界
    Core.splash(field, -50, -50, 4, 1);
    Core.smear(field, 500, 500, 4, 1, 1);
    assert.ok(allFinite(field));
});

test('静止的场：isSettled 为真，渲染原样复制源像素', () => {
    const field = Core.createField(20, 10);
    Core.step(field);
    assert.equal(Core.isSettled(field), true);
    const width = 60, height = 30;
    const src = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < src.length; i++) src[i] = (i * 37) % 256;
    const dst = new Uint8ClampedArray(src.length);
    Core.render(field, src, dst, width, height, { scale: 1 });
    assert.deepEqual(Array.from(dst), Array.from(src));
});

function solidTextImage(width, height) {
    const src = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const inGlyph = x > width * 0.35 && x < width * 0.65 && y > height * 0.2 && y < height * 0.8;
            src[i] = 255; src[i + 1] = 255; src[i + 2] = 255; src[i + 3] = inGlyph ? 255 : 0;
        }
    }
    return src;
}

test('被搅动的场：文字被推开，透明处出现高光，alpha 与颜色仍在合法范围', () => {
    const cols = 40, rows = 20, width = 160, height = 80;
    const field = Core.createField(cols, rows);
    stroke(field, 12);
    const src = solidTextImage(width, height);
    const dst = new Uint8ClampedArray(src.length);
    Core.render(field, src, dst, width, height, { scale: 1 });
    let changed = 0, glintsOnTransparent = 0;
    for (let i = 0; i < src.length; i += 4) {
        if (Math.abs(dst[i + 3] - src[i + 3]) > 8) changed++;
        if (src[i + 3] === 0 && dst[i + 3] > 20) glintsOnTransparent++;
    }
    assert.ok(changed > 200, `应有大量像素发生变化：${changed}`);
    assert.ok(glintsOnTransparent > 20, '液态玻璃的高光会出现在没有文字的地方');
    for (let i = 0; i < dst.length; i++) assert.ok(dst[i] >= 0 && dst[i] <= 255);
});

test('渲染确定、不修改源数据，恢复到静止后又回到原样', () => {
    const cols = 40, rows = 20, width = 160, height = 80;
    const field = Core.createField(cols, rows);
    stroke(field, 8);
    const src = solidTextImage(width, height);
    const snapshot = Uint8ClampedArray.from(src);
    const a = new Uint8ClampedArray(src.length), b = new Uint8ClampedArray(src.length);
    Core.render(field, src, a, width, height, { scale: 1 });
    Core.render(field, src, b, width, height, { scale: 1 });
    assert.deepEqual(Array.from(a), Array.from(b));
    assert.deepEqual(Array.from(src), Array.from(snapshot), '源不被修改');
    for (let i = 0; i < 3000 && !Core.isSettled(field); i++) Core.step(field);
    // 峰值阈值以下仍可能有极小的残余；渲染结果应与源几乎一致（逐通道差 ≤ 6）。
    Core.render(field, src, a, width, height, { scale: 1 });
    // 按预乘值比较：完全透明像素的 RGB 没有可见意义。
    const visible = (data, i) => [data[i] * data[i + 3] / 255, data[i + 1] * data[i + 3] / 255, data[i + 2] * data[i + 3] / 255, data[i + 3]];
    let worst = 0, noticeable = 0;
    for (let i = 0; i < src.length; i += 4) {
        const x = visible(a, i), y = visible(src, i);
        let pixelWorst = 0;
        for (let c = 0; c < 4; c++) pixelWorst = Math.max(pixelWorst, Math.abs(x[c] - y[c]));
        worst = Math.max(worst, pixelWorst);
        if (pixelWorst > 24) noticeable++;
    }
    // 判定静止时涂抹残余 < 0.31 CSS px，只会让字形边缘的个别像素差半个像素；起止的 160 ms 淡出会盖住它。
    assert.ok(worst <= 130, `恢复后应基本还原（仅字形边缘有亚像素残余），最大可见差 ${worst}`);
    assert.ok(noticeable / (src.length / 4) < 0.06, `明显不同的像素只能是边缘的一小部分，实际 ${noticeable}`);
});

test('收尾速度：普通划动约 3 秒、最重的蛇形划动约 5 秒判定静止；整场砸满上限的极端情形也有界', () => {
    const settleSteps = setup => {
        const field = Core.createField(243, 126);
        setup(field);
        Core.step(field);                                  // 先前进一步，peak 才有意义
        let steps = 1;
        while (!Core.isSettled(field) && steps < 4000) { Core.step(field); steps++; }
        return steps;
    };
    const heavy = settleSteps(field => {
        for (let r = 0; r < 5; r++) {
            for (let i = 0; i < 18; i++) {
                const impulse = Core.impulseFromMove(25, 3, 14);
                const x = r % 2 ? 220 - i * 11 : 20 + i * 11;
                Core.smear(field, x, 15 + r * 22, impulse.smearRadius, impulse.px, impulse.py);
                Core.splash(field, x, 15 + r * 22, impulse.splashRadius, impulse.depth);
                Core.step(field);
            }
        }
    });
    const slammed = settleSteps(field => {
        for (let y = 8; y < 118; y += 4) for (let x = 8; x < 235; x += 4) { Core.smear(field, x, y, 7, 30, 10); Core.splash(field, x, y, 7, -1.4); }
    });
    const normal = settleSteps(field => {
        for (let i = 0; i < 34; i++) {
            const impulse = Core.impulseFromMove(13, 4, 14);
            Core.smear(field, 20 + i * 5, 60 + Math.sin(i / 3) * 10, impulse.smearRadius, impulse.px, impulse.py);
            Core.splash(field, 20 + i * 5, 60, impulse.splashRadius, impulse.depth);
            Core.step(field);
        }
    });
    assert.ok(normal < 240, `普通划动应在 4 秒内静止，实际 ${normal} 步`);
    assert.ok(heavy < 360, `最重的蛇形划动应在 6 秒内静止，实际 ${heavy} 步`);
    // 整个场被砸到上限（均匀下陷的“平台”几乎没有梯度，靠回复力才能收回）：不可能靠鼠标一次做到，只要求有界。
    assert.ok(slammed < 600, `整场砸满上限应在 10 秒内静止，实际 ${slammed} 步`);
});

test('设备像素比放大：偏移按 scale 缩放，结果仍然有限', () => {
    const field = Core.createField(30, 15);
    stroke(field, 6);
    const width = 120, height = 60;
    const src = solidTextImage(width, height);
    const one = new Uint8ClampedArray(src.length), two = new Uint8ClampedArray(src.length);
    Core.render(field, src, one, width, height, { scale: 1 });
    Core.render(field, src, two, width, height, { scale: 2 });
    assert.notDeepEqual(Array.from(one), Array.from(two));
});

test('唤醒门槛：太慢或太短的悬停不会触发', () => {
    assert.equal(Core.shouldWake(2, 16), false, '位移太小');
    assert.equal(Core.shouldWake(10, 200), false, '速度太慢');
    assert.equal(Core.shouldWake(12, 16), true);
    assert.equal(Core.shouldWake(12, 0), false);
    assert.equal(Core.shouldWake(12, -5), false);
});

test('命中区域与阻断状态', () => {
    const rect = { left: 100, right: 300, top: 50, bottom: 140 };
    assert.equal(Core.insideRect(rect, 150, 90), true);
    assert.equal(Core.insideRect(rect, 95, 90), false);
    assert.equal(Core.insideRect(rect, 95, 90, 8), true, '外扩');
    assert.equal(Core.insideRect(null, 1, 1), false);
    const classList = names => ({ contains: name => names.includes(name) });
    assert.equal(Core.blockedByBody(classList([])), false);
    for (const name of ['bili-panel-open', 'youtube-workbench-open', 'huya-workbench-open', 'v5-focus-open']) {
        assert.equal(Core.blockedByBody(classList([name])), true, name);
    }
    assert.equal(Core.blockedByBody(null), false);
});

test('横带命中：只看纵向（横向不限），可外扩，边界含端点，没有矩形为 false', () => {
    const rect = { left: 100, right: 420, top: 60, bottom: 160 };
    for (const y of [60, 110, 160]) assert.equal(Core.insideBand(rect, y), true, `y=${y}`);
    for (const y of [59, 161, -1000, 5000]) assert.equal(Core.insideBand(rect, y), false, `y=${y}`);
    assert.equal(Core.insideBand(rect, 46, 14), true, '外扩 14 的上边界');
    assert.equal(Core.insideBand(rect, 45, 14), false);
    assert.equal(Core.insideBand(rect, 174, 14), true, '外扩 14 的下边界');
    assert.equal(Core.insideBand(rect, 175, 14), false);
    assert.equal(Core.insideBand(null, 100), false);
    assert.equal(Core.insideBand(undefined, 100, 14), false);
    // 与 insideRect 的区别：横向不再受文字块左右限制（insideBand 没有 x 参数）
    assert.equal(Core.insideRect(rect, 1000, 110), false);
    assert.equal(Core.insideBand(rect, 110), true);
});

test('鼠标推力：方向与位移一致，间隔异常长时不会产生巨大推力', () => {
    const normal = Core.impulseFromMove(20, 0, 16);
    assert.ok(normal.px > 0 && Math.abs(normal.py) < 1e-9);
    assert.ok(normal.depth < 0, '水坑是凹陷');
    const left = Core.impulseFromMove(-20, 0, 16);
    assert.ok(left.px < 0);
    const stale = Core.impulseFromMove(500, 0, 5000);
    assert.ok(Math.abs(stale.px) <= Core.PARAMS.maxSmear);
    const fastDense = Core.impulseFromMove(500, 500, 1);
    assert.ok(Math.abs(fastDense.px) <= Core.PARAMS.maxSmear && Math.abs(fastDense.depth) <= 1.4);
    // 单次推动要强到足以把笔画撕开（≥ 一个笔画宽度的位移），又不能无上限
    assert.ok(Math.abs(Core.impulseFromMove(14, 0, 14).px) >= 10, '常规划动应有明显推力');
});

// ---- 笔刷与“只处理活跃区域”的渲染 ----------------------------------------------------------

test('笔刷半径：慢速取基础半径，快速最多放大 1+brushGrowth 倍，且单调不减', () => {
    const slow = Core.brushFor(0);
    assert.equal(slow.smear, Core.PARAMS.smearRadius);
    assert.equal(slow.splash, Core.PARAMS.splashRadius);
    let previous = slow.smear;
    for (const speed of [0.2, 0.6, 1, 1.6, 2.4, 5, 50]) {
        const brush = Core.brushFor(speed);
        assert.ok(brush.smear >= previous - 1e-12, `半径随速度单调不减（速度 ${speed}）`);
        previous = brush.smear;
    }
    const top = Core.brushFor(1e6);
    assert.ok(Math.abs(top.smear - Core.PARAMS.smearRadius * (1 + Core.PARAMS.brushGrowth)) < 1e-9, '有上限');
    assert.ok(top.splash > Core.PARAMS.splashRadius);
});

test('推力结果带速度与笔刷半径，快慢不同', () => {
    const slow = Core.impulseFromMove(5, 0, 24);          // ≈ 0.21 px/ms
    const fast = Core.impulseFromMove(80, 0, 16);         // 5 px/ms
    assert.ok(fast.speed > slow.speed * 10);
    assert.ok(fast.smearRadius > slow.smearRadius && fast.splashRadius > slow.splashRadius);
    assert.ok(slow.smearRadius >= Core.PARAMS.smearRadius);
});

function makeSource(width, height) {
    const src = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const inText = x > 20 && x < width - 20 && y > 20 && y < height - 20 && ((x >> 3) + (y >> 3)) % 2 === 0;
            src[o] = 250; src[o + 1] = 240; src[o + 2] = 230; src[o + 3] = inText ? 255 : 0;
        }
    }
    return src;
}

test('渲染只改动活跃区域：区域之外的像素与源图逐字节相同', () => {
    const dpr = 2, cssW = 300, cssH = 150, cell = 3;
    const width = cssW * dpr, height = cssH * dpr;
    const field = Core.createField(Math.ceil(cssW / cell), Math.ceil(cssH / cell));
    const src = makeSource(width, height);
    // 只搅动左上角的一小块
    for (let i = 0; i < 6; i++) { Core.smear(field, 14 + i, 12, 4, 12, 3); Core.splash(field, 14 + i, 12, 4, -0.6); }
    for (let n = 0; n < 10; n++) Core.step(field);
    const out = new Uint8ClampedArray(src.length);
    Core.render(field, src, out, width, height, { scale: dpr });

    let changedInside = 0, changedOutside = 0;
    // 活跃区域最多延伸到：(14+5+4+10 步扩散 ≈ 8 格) × 每格 6 px ≈ 200 px；右半边与下半边一定在区域之外
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const same = out[o] === src[o] && out[o + 1] === src[o + 1] && out[o + 2] === src[o + 2] && out[o + 3] === src[o + 3];
            if (!same) {
                if (x < 300 && y < 160) changedInside++; else changedOutside++;
            }
        }
    }
    assert.ok(changedInside > 200, `被搅动的区域确实变了（${changedInside}）`);
    assert.equal(changedOutside, 0, '远离划动的像素必须与源图完全相同');
});

test('渲染缓冲区复用不串帧：先搅动再恢复静止，第二次渲染必须回到源图', () => {
    const dpr = 1, width = 240, height = 120;
    const field = Core.createField(80, 40);
    const src = makeSource(width, height);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < 8; i++) { Core.smear(field, 30 + i * 2, 20, 4, 14, 2); Core.splash(field, 30 + i * 2, 20, 4, -0.7); }
    Core.step(field);
    Core.render(field, src, out, width, height, { scale: dpr });
    assert.notDeepEqual([...out], [...src], '先确认被搅动过');

    // 同一个 field 对象清零后再渲染：上一帧的“活跃”标记不能残留
    for (const key of ['h', 'v', 'sx', 'sy', 'tx', 'ty']) field[key].fill(0);
    field.peak = 0;
    Core.render(field, src, out, width, height, { scale: dpr });
    assert.deepEqual([...out], [...src], '静止后与源图逐字节相同');
});

test('渲染：场尺寸变化时重新分配缓冲区（不同 field 互不影响）', () => {
    const a = Core.createField(40, 20), b = Core.createField(60, 30);
    const srcA = makeSource(120, 60), srcB = makeSource(180, 90);
    const outA = new Uint8ClampedArray(srcA.length), outB = new Uint8ClampedArray(srcB.length);
    Core.smear(a, 20, 10, 4, 14, 2); Core.splash(a, 20, 10, 4, -0.6); Core.step(a);
    Core.render(a, srcA, outA, 120, 60, { scale: 1 });
    Core.render(b, srcB, outB, 180, 90, { scale: 1 });
    assert.deepEqual([...outB], [...srcB], '另一个静止的场不受影响');
    assert.notDeepEqual([...outA], [...srcA]);
});

function cloneField(field) {
    const copy = { cols: field.cols, rows: field.rows, absorb: field.absorb, peak: field.peak };
    for (const key of ['h', 'v', 'sx', 'sy', 'tx', 'ty']) copy[key] = field[key].slice();
    return copy;
}

test('包围盒不能漏像素：与“整个场都扫描”的结果在远离角落处逐字节一致', () => {
    const dpr = 2, cssW = 300, cssH = 150, cell = 3;
    const width = cssW * dpr, height = cssH * dpr;
    const field = Core.createField(Math.ceil(cssW / cell), Math.ceil(cssH / cell));
    const src = makeSource(width, height);
    for (let i = 0; i < 14; i++) { Core.smear(field, 30 + i * 2.5, 24 + (i % 3), 5, 16, 3); Core.splash(field, 30 + i * 2.5, 24, 4, -0.8); }
    for (let n = 0; n < 12; n++) Core.step(field);

    const small = new Uint8ClampedArray(src.length);
    Core.render(field, src, small, width, height, { scale: dpr });

    // 对照：同一个场，再让左上与右下两个角落的格子“刚好活跃”，包围盒就是整个场。
    const full = cloneField(field);
    full.sx[1 * full.cols + 1] = 1;
    full.sx[(full.rows - 2) * full.cols + (full.cols - 2)] = 1;
    const reference = new Uint8ClampedArray(src.length);
    Core.render(full, src, reference, width, height, { scale: dpr });

    const marginX = 4 * (width / full.cols), marginY = 4 * (height / full.rows);
    let compared = 0, mismatched = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nearCorner = (x < marginX && y < marginY) || (x > width - marginX && y > height - marginY);
            if (nearCorner) continue;
            const o = (y * width + x) * 4;
            compared++;
            if (small[o] !== reference[o] || small[o + 1] !== reference[o + 1] || small[o + 2] !== reference[o + 2] || small[o + 3] !== reference[o + 3]) mismatched++;
        }
    }
    assert.ok(compared > width * height * 0.9);
    assert.equal(mismatched, 0, '缩小到包围盒不能改变任何一个像素');
});

test('复用缓冲区后的渲染与全新缓冲区一致（上一帧的活跃标记不能残留）', () => {
    const dpr = 1, width = 300, height = 150, cols = 100, rows = 50;
    const src = makeSource(width, height);
    const applyB = f => { for (let i = 0; i < 5; i++) { Core.smear(f, 50, 25, 4, 12, 2); Core.splash(f, 50, 25, 4, -0.6); } Core.step(f); };

    const used = Core.createField(cols, rows);
    for (let x = 8; x < 92; x += 3) { Core.smear(used, x, 25, 5, 14, 2); Core.splash(used, x, 25, 5, -0.7); }   // 先铺满一整条活跃带
    Core.step(used);
    Core.render(used, src, new Uint8ClampedArray(src.length), width, height, { scale: dpr });

    for (const key of ['h', 'v', 'sx', 'sy', 'tx', 'ty']) used[key].fill(0);
    used.peak = 0;
    applyB(used);
    const outUsed = new Uint8ClampedArray(src.length);
    Core.render(used, src, outUsed, width, height, { scale: dpr });

    const fresh = Core.createField(cols, rows);
    applyB(fresh);
    const outFresh = new Uint8ClampedArray(src.length);
    Core.render(fresh, src, outFresh, width, height, { scale: dpr });

    assert.deepEqual([...outUsed], [...outFresh]);
});

// ---- 分层渲染（2026-10-15）--------------------------------------------------------------------------
// 画布横向铺满视口后，单层 render() 在 2 倍屏上每帧约 20 ms（旧的窄画布约 6 ms）：整幅逐像素取样，其中约 80% 是
// 远离文字、只有高光与暗边的像素。renderLayers 把一帧拆成两层：
//   · 文字层：只在“文字包围盒 + 本帧最大位移”这块近区里逐像素取样；
//   · 涟漪层：高光/暗边是 3 CSS px 一格的平滑场，一格一个像素（cols×rows），由调用方放大铺满整幅画布。
// render() 保留为逐像素的参考实现，下面的测试用它来核对分层结果。

function rng(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

// 若干块不规则的“文字”：随机矩形、随机颜色、部分半透明。
function randomText(random, width, height) {
    const src = new Uint8ClampedArray(width * height * 4);
    const blocks = 1 + Math.floor(random() * 3);
    for (let b = 0; b < blocks; b++) {
        const w = 6 + Math.floor(random() * width * 0.3), h = 6 + Math.floor(random() * height * 0.3);
        const x0 = Math.floor(random() * (width - w)), y0 = Math.floor(random() * (height - h));
        const color = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)];
        const alpha = random() < 0.4 ? 128 : 255;
        for (let y = y0; y < y0 + h; y++) {
            for (let x = x0; x < x0 + w; x++) {
                if (((x >> 1) + (y >> 1)) % 3 === 2) continue;           // 打些洞，更像笔画
                const o = (y * width + x) * 4;
                src[o] = color[0]; src[o + 1] = color[1]; src[o + 2] = color[2]; src[o + 3] = alpha;
            }
        }
    }
    return src;
}

function randomField(random, cols, rows, { waves = true, smears = true } = {}) {
    const field = Core.createField(cols, rows);
    const hits = 4 + Math.floor(random() * 14);
    for (let i = 0; i < hits; i++) {
        const cx = 3 + random() * (cols - 6), cy = 3 + random() * (rows - 6);
        if (smears) Core.smear(field, cx, cy, 2 + random() * 5, (random() - 0.5) * 120, (random() - 0.5) * 60);
        if (waves) Core.splash(field, cx, cy, 2 + random() * 5, -(0.2 + random() * 1.2));
    }
    for (let n = Math.floor(random() * 30); n > 0; n--) Core.step(field);
    return field;
}

function layerBuffers(width, height, cols, rows, fill = 0) {
    const text = new Uint8ClampedArray(width * height * 4).fill(fill);
    const ripple = new Uint8ClampedArray(cols * rows * 4).fill(fill);
    return { text, ripple };
}

function sameBytes(a, b, offset) {
    return a[offset] === b[offset] && a[offset + 1] === b[offset + 1] && a[offset + 2] === b[offset + 2] && a[offset + 3] === b[offset + 3];
}

// 软件合成：涟漪层（每格一个像素，非预乘）按双线性放大后以预乘 over 盖在文字层上，再转回非预乘字节。
// 这就是 drawImage 放大一张小画布后叠在文字上的效果（浏览器里由 GPU 做）。
function composeLayers(text, ripple, cols, rows, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const cw = width / cols, ch = height / rows;
    const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (let y = 0; y < height; y++) {
        const fy = clampTo((y + 0.5) / ch - 0.5, 0, rows - 1.0001);
        const y0 = Math.floor(fy), wy = fy - y0;
        for (let x = 0; x < width; x++) {
            const fx = clampTo((x + 0.5) / cw - 0.5, 0, cols - 1.0001);
            const x0 = Math.floor(fx), wx = fx - x0;
            let ra = 0, rc = 0;
            for (const [cx, cy, weight] of [[x0, y0, (1 - wx) * (1 - wy)], [x0 + 1, y0, wx * (1 - wy)], [x0, y0 + 1, (1 - wx) * wy], [x0 + 1, y0 + 1, wx * wy]]) {
                const o = (cy * cols + cx) * 4;
                const a = ripple[o + 3] / 255;
                ra += a * weight; rc += (ripple[o] / 255) * a * weight;
            }
            const t = (y * width + x) * 4;
            const ta = text[t + 3] / 255;
            const outA = ra + ta * (1 - ra);
            const k = outA > 0.002 ? 255 / outA : 0;
            for (let c = 0; c < 3; c++) out[t + c] = (rc + (text[t + c] / 255) * ta * (1 - ra)) * k + 0.5;
            out[t + 3] = outA > 0.002 ? outA * 255 + 0.5 : 0;
        }
    }
    return out;
}

const premult = (data, o) => [data[o] * data[o + 3] / 255, data[o + 1] * data[o + 3] / 255, data[o + 2] * data[o + 3] / 255, data[o + 3]];

test('文字包围盒：恰好是 alpha>0 像素的外接矩形（右、下为开区间），只看 alpha，空图为 null', () => {
    const width = 50, height = 30;
    const src = new Uint8ClampedArray(width * height * 4);
    assert.equal(Core.textBounds(src, width, height), null);
    src[(5 * width + 7) * 4] = 255; src[(5 * width + 7) * 4 + 1] = 255;          // 只有 RGB、alpha 为 0：不算文字
    assert.equal(Core.textBounds(src, width, height), null);

    const put = (x, y) => { src[(y * width + x) * 4 + 3] = 1; };
    put(17, 12);
    assert.deepEqual(Core.textBounds(src, width, height), { left: 17, top: 12, right: 18, bottom: 13 }, '单个像素');
    put(10, 4); put(31, 20);
    assert.deepEqual(Core.textBounds(src, width, height), { left: 10, top: 4, right: 32, bottom: 21 });
    put(0, 0); put(width - 1, height - 1);
    assert.deepEqual(Core.textBounds(src, width, height), { left: 0, top: 0, right: width, bottom: height }, '贴着图像四角');

    // 一行里只有相邻的两个像素（从右往左找最后一个时，起点恰好是“第一个的下一格”）：右边界不能少算。
    for (const [x, label] of [[20, '行中间'], [width - 2, '贴右边缘'], [0, '贴左边缘']]) {
        const img = new Uint8ClampedArray(width * height * 4);
        for (const px of [x, x + 1]) img[(9 * width + px) * 4 + 3] = 200;
        assert.deepEqual(Core.textBounds(img, width, height), { left: x, top: 9, right: x + 2, bottom: 10 }, `相邻两个像素：${label}`);
    }
    const full = new Uint8ClampedArray(width * height * 4);
    for (let px = 0; px < width; px++) full[(3 * width + px) * 4 + 3] = 255;
    assert.deepEqual(Core.textBounds(full, width, height), { left: 0, top: 3, right: width, bottom: 4 }, '整行都有字');
});

test('文字包围盒：随机图像上与逐像素暴力扫描一致', () => {
    const random = rng(7);
    for (let trial = 0; trial < 30; trial++) {
        const width = 20 + Math.floor(random() * 60), height = 10 + Math.floor(random() * 40);
        const src = randomText(random, width, height);
        let left = width, top = height, right = 0, bottom = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            if (src[(y * width + x) * 4 + 3] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
        }
        assert.deepEqual(Core.textBounds(src, width, height), right > left ? { left, top, right, bottom } : null, `第 ${trial} 组`);
    }
});

test('分层渲染：场静止时文字层就是源图的包围盒区域，没有涟漪层，也不改源', () => {
    const width = 120, height = 60, cols = 40, rows = 20;
    const field = Core.createField(cols, rows);
    Core.step(field);
    const src = makeSource(width, height);
    const snapshot = Uint8ClampedArray.from(src);
    const bounds = Core.textBounds(src, width, height);
    const { text, ripple } = layerBuffers(width, height, cols, rows, 77);
    const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale: 1, textBounds: bounds });
    assert.equal(layers.ripple, false);
    assert.deepEqual(layers.rect, { x0: bounds.left, y0: bounds.top, x1: bounds.right - 1, y1: bounds.bottom - 1 }, '静止时不外扩');
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const inside = x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
        assert.ok(inside ? sameBytes(text, src, o) : text[o] === 77 && text[o + 3] === 77, `(${x},${y}) ${inside ? '近区内应等于源图' : '近区外不应被写入'}`);
    }
    assert.deepEqual([...src], [...snapshot], '源不被修改');
});

test('分层渲染：没有文字（包围盒为空或 null）时文字层不画任何东西，涟漪层照常', () => {
    const width = 120, height = 60, cols = 40, rows = 20;
    const field = Core.createField(cols, rows);
    for (let i = 0; i < 5; i++) { Core.splash(field, 20, 10, 4, -1); Core.step(field); }
    const src = new Uint8ClampedArray(width * height * 4);
    const { text, ripple } = layerBuffers(width, height, cols, rows, 77);
    const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale: 1, textBounds: Core.textBounds(src, width, height) });
    // textBounds 为 null 表示“没有文字”（空图），不是“不限范围”；不限范围要显式省略该选项。
    assert.equal(layers.rect, null);
    assert.equal(layers.ripple, true);
    assert.ok(text.every(value => value === 77), '文字缓冲区没被碰');
});

test('分层渲染：只有涂抹（没有波）时，近区内与 render() 逐字节相同，近区之外 render() 就是源图', () => {
    for (const scale of [1, 2]) {
        const random = rng(31 + scale);
        for (let trial = 0; trial < 12; trial++) {
            const cols = 36, rows = 18, width = cols * 3 * scale, height = rows * 3 * scale;
            const field = randomField(random, cols, rows, { waves: false });
            const src = randomText(random, width, height);
            const reference = new Uint8ClampedArray(src.length);
            Core.render(field, src, reference, width, height, { scale });
            const { text, ripple } = layerBuffers(width, height, cols, rows, 77);
            const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale, textBounds: Core.textBounds(src, width, height) });
            assert.equal(layers.ripple, false, '没有波就没有高光');
            let compared = 0;
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const o = (y * width + x) * 4;
                const inside = layers.rect && x >= layers.rect.x0 && x <= layers.rect.x1 && y >= layers.rect.y0 && y <= layers.rect.y1;
                if (inside) { compared++; assert.ok(sameBytes(text, reference, o), `scale ${scale} 第 ${trial} 组 (${x},${y}) 近区内应与 render() 相同`); }
                else assert.ok(sameBytes(reference, src, o), `scale ${scale} 第 ${trial} 组 (${x},${y}) 近区之外 render() 必须等于源图（否则近区外扩不够）`);
            }
            assert.ok(compared > 0);
        }
    }
});

test('近区不能漏像素（性质测试）：文字层在近区之外一定等于静止的源图，近区之内与“不限范围”的结果逐字节相同', () => {
    for (const scale of [1, 2]) {
        const random = rng(1000 + scale);
        for (let trial = 0; trial < 40; trial++) {
            const cols = 30 + Math.floor(random() * 20), rows = 14 + Math.floor(random() * 10);
            const width = Math.round(cols * 3 * scale), height = Math.round(rows * 3 * scale);
            const field = randomField(random, cols, rows);
            const src = randomText(random, width, height);

            const open = layerBuffers(width, height, cols, rows);
            Core.renderLayers(field, src, open.text, open.ripple, width, height, { scale });                 // 不限范围：整幅文字层
            const bounded = layerBuffers(width, height, cols, rows, 77);
            const layers = Core.renderLayers(field, src, bounded.text, bounded.ripple, width, height, { scale, textBounds: Core.textBounds(src, width, height) });

            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const o = (y * width + x) * 4;
                const inside = layers.rect && x >= layers.rect.x0 && x <= layers.rect.x1 && y >= layers.rect.y0 && y <= layers.rect.y1;
                if (inside) assert.ok(sameBytes(bounded.text, open.text, o), `scale ${scale} 第 ${trial} 组 (${x},${y}) 近区内应与不限范围一致`);
                else assert.ok(sameBytes(open.text, src, o), `scale ${scale} 第 ${trial} 组 (${x},${y}) 近区之外文字层必须是静止源图`);
            }
        }
    }
});

test('近区只写近区：缓冲区里近区之外的字节保持原样（帧间复用缓冲区不会串帧）', () => {
    const cols = 80, rows = 30, width = 240, height = 90;
    // 一小块文字放在画布中央；场里只有两处不大的搅动，近区远小于整幅。
    const src = new Uint8ClampedArray(width * height * 4);
    for (let y = 30; y < 60; y++) for (let x = 100; x < 140; x++) { const o = (y * width + x) * 4; src[o] = 200; src[o + 1] = 210; src[o + 2] = 220; src[o + 3] = 255; }
    const field = Core.createField(cols, rows);
    Core.smear(field, 30, 15, 4, 6, 2); Core.splash(field, 30, 15, 4, -0.5);
    Core.smear(field, 50, 15, 4, -5, 3); Core.splash(field, 50, 15, 4, -0.5);
    for (let n = 0; n < 6; n++) Core.step(field);
    const { text, ripple } = layerBuffers(width, height, cols, rows, 77);
    const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale: 1, textBounds: Core.textBounds(src, width, height) });
    assert.ok(layers.rect);
    let outside = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (x >= layers.rect.x0 && x <= layers.rect.x1 && y >= layers.rect.y0 && y <= layers.rect.y1) continue;
        outside++;
        const o = (y * width + x) * 4;
        assert.ok(text[o] === 77 && text[o + 1] === 77 && text[o + 2] === 77 && text[o + 3] === 77, `(${x},${y}) 被写入了`);
    }
    assert.ok(outside > 0, '近区应小于整幅');

    // 同一缓冲区连续渲染两帧（第二帧的近区可能更小）：近区内与全新缓冲区一致
    for (let n = 0; n < 40; n++) Core.step(field);
    const second = Core.renderLayers(field, src, text, ripple, width, height, { scale: 1, textBounds: Core.textBounds(src, width, height) });
    const fresh = layerBuffers(width, height, cols, rows, 5);
    const again = Core.renderLayers(field, src, fresh.text, fresh.ripple, width, height, { scale: 1, textBounds: Core.textBounds(src, width, height) });
    assert.deepEqual(second.rect, again.rect);
    for (let y = second.rect.y0; y <= second.rect.y1; y++) for (let x = second.rect.x0; x <= second.rect.x1; x++) {
        const o = (y * width + x) * 4;
        assert.ok(sameBytes(text, fresh.text, o), `(${x},${y})`);
    }
});

test('近区随位移变大而外扩，且始终落在图像内（文字贴着图像边缘也不越界）', () => {
    const cols = 40, rows = 20, width = 120, height = 60;
    const src = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < 30; x++) src[(y * width + x) * 4 + 3] = 255;     // 贴着左右上下边缘的一条
    const bounds = Core.textBounds(src, width, height);
    assert.deepEqual(bounds, { left: 0, top: 0, right: 30, bottom: 60 });

    const calm = Core.createField(cols, rows);
    const moved = Core.createField(cols, rows);
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) moved.sx[y * cols + x] = 12;       // 整体向右推 12 px
    const a = layerBuffers(width, height, cols, rows), b = layerBuffers(width, height, cols, rows);
    const ra = Core.renderLayers(calm, src, a.text, a.ripple, width, height, { scale: 1, textBounds: bounds });
    const rb = Core.renderLayers(moved, src, b.text, b.ripple, width, height, { scale: 1, textBounds: bounds });
    assert.equal(ra.rect.x1, 29);
    assert.ok(rb.rect.x1 >= 29 + 12, `位移 12 px，近区右沿至少外扩到 41，实际 ${rb.rect.x1}`);
    assert.ok(rb.rect.x0 >= 0 && rb.rect.y0 >= 0 && rb.rect.x1 <= width - 1 && rb.rect.y1 <= height - 1);
});

test('分层合成 ≈ 单层 render()：软件合成（涟漪层双线性放大后盖在文字层上）与参考实现的差别极小', () => {
    for (const scale of [1, 2]) {
        const random = rng(2000 + scale);
        let pixels = 0, over8 = 0, worst = 0, sumDiff = 0;
        let textPixels = 0, textSum = 0, textWorst = 0;
        for (let trial = 0; trial < 12; trial++) {
            const cols = 40, rows = 20, width = cols * 3 * scale, height = rows * 3 * scale;
            const field = randomField(random, cols, rows);
            const src = randomText(random, width, height);
            const reference = new Uint8ClampedArray(src.length);
            Core.render(field, src, reference, width, height, { scale });
            const { text, ripple } = layerBuffers(width, height, cols, rows);
            const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale, textBounds: Core.textBounds(src, width, height) });
            // 近区之外的文字层不在缓冲区里（调用方不上传）：那里是全透明。
            const full = new Uint8ClampedArray(src.length);
            if (layers.rect) {
                for (let y = layers.rect.y0; y <= layers.rect.y1; y++) {
                    const a = (y * width + layers.rect.x0) * 4, b = (y * width + layers.rect.x1 + 1) * 4;
                    full.set(text.subarray(a, b), a);
                }
            }
            const emptyRipple = new Uint8ClampedArray(cols * rows * 4);
            const composed = composeLayers(full, layers.ripple ? ripple : emptyRipple, cols, rows, width, height);
            for (let o = 0; o < src.length; o += 4) {
                const a = premult(composed, o), b = premult(reference, o);
                let diff = 0;
                for (let c = 0; c < 4; c++) diff = Math.max(diff, Math.abs(a[c] - b[c]));
                pixels++; sumDiff += diff; worst = Math.max(worst, diff);
                if (diff > 8) over8++;
                if (src[o + 3] > 0 || full[o + 3] > 0) { textPixels++; textSum += diff; textWorst = Math.max(textWorst, diff); }
            }
        }
        // 误差来源：涟漪层每格量化成 8 位后再插值、两层各自一次四舍五入（纯涟漪参照实测平均 0.5 级、p99 约 3 级、最大 12 级）；
        // 位移不足 0.12 px 的格子文字层不取样（render() 在高光活跃时仍会取样，文字边缘最多差几级）。
        // 下面的阈值是实测值的约 2 倍：丢掉任何一层、把涟漪盖到文字下面、位置错半格，都会远超它。
        assert.ok(sumDiff / pixels < 1, `scale ${scale}：平均差 ${(sumDiff / pixels).toFixed(3)}`);
        assert.ok(over8 / pixels < 0.005, `scale ${scale}：差超过 8 级的像素占 ${(100 * over8 / pixels).toFixed(2)}%`);
        assert.ok(worst <= 24, `scale ${scale}：最大差 ${worst}`);
        assert.ok(textPixels > 2000, `文字像素要足够多：${textPixels}`);
        assert.ok(textSum / textPixels < 1.8, `scale ${scale}：文字像素平均差 ${(textSum / textPixels).toFixed(3)}`);
        assert.ok(textWorst <= 24, `scale ${scale}：文字像素最大差 ${textWorst}`);
    }
});

test('涟漪层：每格与 render() 在透明源上同一位置的像素逐字节相同；低于阈值的格子全透明', () => {
    // 宽高等于格数、scale 1：像素 (x, y) 恰好是格 (x, y) 的中心，render() 在那里只用这一格的值。
    const cols = 48, rows = 24, width = cols, height = rows;
    const random = rng(99);
    const field = randomField(random, cols, rows);
    const src = new Uint8ClampedArray(width * height * 4);
    const reference = new Uint8ClampedArray(src.length);
    Core.render(field, src, reference, width, height, { scale: 1 });
    const { text, ripple } = layerBuffers(width, height, cols, rows, 77);
    const layers = Core.renderLayers(field, src, text, ripple, width, height, { scale: 1, textBounds: { left: 0, top: 0, right: 0, bottom: 0 } });
    assert.equal(layers.ripple, true);
    assert.equal(layers.rect, null);
    let lit = 0, dark = 0;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x, o = i * 4;
        const active = field.scratch.hi[i] > 0.012 || field.scratch.lo[i] > 0.012;
        if (active) {
            lit++;
            // render() 里这一格若是被“相邻格活跃”带动才画的，也用同样的公式；这里只比较自己活跃的格。
            assert.ok(sameBytes(ripple, reference, o), `格 (${x},${y})：涟漪层 ${[...ripple.subarray(o, o + 4)]} 参考 ${[...reference.subarray(o, o + 4)]}`);
        } else {
            dark++;
            assert.deepEqual([...ripple.subarray(o, o + 4)], [0, 0, 0, 0], `格 (${x},${y}) 不活跃应全透明`);
        }
    }
    assert.ok(lit > 100 && dark > 20, `两类格子都要出现：活跃 ${lit}，不活跃 ${dark}`);
    for (let x = 0; x < cols; x++) {                                 // 最外一圈从不参与：始终全透明
        for (const y of [0, rows - 1]) assert.deepEqual([...ripple.subarray((y * cols + x) * 4, (y * cols + x) * 4 + 4)], [0, 0, 0, 0]);
    }
});

test('涟漪层：整个场里只有暗边可见（没有任何格子的高光超过阈值）时也要画，不能整层漏掉', () => {
    // 一个很缓的斜面：坡度正好背着光，暗边 lo ≈ 0.04（可见），而高光项只剩边缘光 ≈ 0.008（低于 0.012 的可见阈值）。
    const cols = 24, rows = 16;
    const field = Core.createField(cols, rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) field.h[y * cols + x] = 0.006 * (0.62 * x + 0.78 * y);
    const { text, ripple } = layerBuffers(cols, rows, cols, rows, 77);
    const src = new Uint8ClampedArray(cols * rows * 4);
    const layers = Core.renderLayers(field, src, text, ripple, cols, rows, { scale: 1, textBounds: null });
    const { hi, lo } = field.scratch;
    let maxHi = 0, maxLo = 0;
    for (let i = 0; i < cols * rows; i++) { maxHi = Math.max(maxHi, hi[i]); maxLo = Math.max(maxLo, lo[i]); }
    assert.ok(maxHi < 0.012 && maxLo > 0.012, `场景要成立：高光最大 ${maxHi.toFixed(4)}，暗边最大 ${maxLo.toFixed(4)}`);
    assert.equal(layers.ripple, true, '只有暗边可见也算有涟漪');
    // 宽高等于格数、scale 1：像素 (x, y) 恰好是格 (x, y) 的中心，所以该格应与 render() 在这里的结果逐字节相同。
    const reference = new Uint8ClampedArray(src.length);
    Core.render(field, src, reference, cols, rows, { scale: 1 });
    const o = (8 * cols + 12) * 4;
    assert.ok(ripple[o + 3] > 0, '这一格有不透明度');
    assert.ok(sameBytes(ripple, reference, o), `涟漪层 ${[...ripple.subarray(o, o + 4)]} 参考 ${[...reference.subarray(o, o + 4)]}`);
});

test('涟漪层：帧间复用缓冲区不串帧（先有波再静止，再有波，结果与全新缓冲区一致；静止时返回 ripple=false）', () => {
    const cols = 40, rows = 20, width = 120, height = 60;
    const src = makeSource(width, height);
    const bounds = Core.textBounds(src, width, height);
    const field = Core.createField(cols, rows);
    const used = layerBuffers(width, height, cols, rows);
    for (let i = 0; i < 6; i++) { Core.splash(field, 10 + i * 4, 10, 4, -1); Core.step(field); }
    assert.equal(Core.renderLayers(field, src, used.text, used.ripple, width, height, { scale: 1, textBounds: bounds }).ripple, true);
    for (const key of ['h', 'v', 'sx', 'sy', 'tx', 'ty']) field[key].fill(0);
    field.peak = 0;
    assert.equal(Core.renderLayers(field, src, used.text, used.ripple, width, height, { scale: 1, textBounds: bounds }).ripple, false, '全部静止：没有涟漪层可画');
    Core.splash(field, 30, 12, 4, -1); Core.step(field);
    const again = Core.renderLayers(field, src, used.text, used.ripple, width, height, { scale: 1, textBounds: bounds });
    const fresh = layerBuffers(width, height, cols, rows);
    Core.renderLayers(field, src, fresh.text, fresh.ripple, width, height, { scale: 1, textBounds: bounds });
    assert.equal(again.ripple, true);
    assert.deepEqual([...used.ripple], [...fresh.ripple]);
});

test('分层渲染：确定、不修改源数据、返回对象可被下一帧复用（调用方只应当即读取）', () => {
    const random = rng(12);
    const cols = 40, rows = 20, width = 120, height = 60;
    const field = randomField(random, cols, rows);
    const src = randomText(random, width, height);
    const snapshot = Uint8ClampedArray.from(src);
    const bounds = Core.textBounds(src, width, height);
    const a = layerBuffers(width, height, cols, rows), b = layerBuffers(width, height, cols, rows);
    const ra = Core.renderLayers(field, src, a.text, a.ripple, width, height, { scale: 1, textBounds: bounds });
    const rectA = ra.rect && { ...ra.rect };
    const rippleA = ra.ripple;
    const rb = Core.renderLayers(field, src, b.text, b.ripple, width, height, { scale: 1, textBounds: bounds });
    assert.deepEqual(rb.rect, rectA);
    assert.equal(rb.ripple, rippleA);
    assert.deepEqual([...a.text], [...b.text]);
    assert.deepEqual([...a.ripple], [...b.ripple]);
    assert.deepEqual([...src], [...snapshot]);
});
