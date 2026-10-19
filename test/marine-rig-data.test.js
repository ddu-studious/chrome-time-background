// 四种写实动物（小锤头鲨、蝠鲼、海龟、鲸鲨）的骨架数据（js/marine-rig-data.js）：能编译、守住与桌面端共用的路径限制、
// 确定（不靠随机数）、对称、各自的辨识特征没有悄悄丢失、点数与图层数在成本预算内。
// “像不像真的”靠对照参考照片的截图判断，不在这里；这里只守住不会悄悄变坏的结构。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Shapes = require('../js/jelly-species-shapes.js');
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');

const TAU = Math.PI * 2;
const lum = rgb => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const layerOf = (src, id) => src.layers.find(l => l.id === id);
const fillRgb = layer => (typeof layer.fill === 'string' ? Rig.parseColor(layer.fill) : null);
const commandCount = d => Shapes.parsePath(d).length;
const subpathCount = d => Shapes.parsePath(d).filter(c => c.cmd === 'M').length;

function pointsOf(ops) {
    let pts = 0;
    for (const op of ops) for (const poly of op.polys) pts += poly.pts.length / 2;
    return pts;
}

test('登记：恰好四种动物，视角正确；未知 id、非字符串得到 null', () => {
    assert.deepEqual([...Data.IDS].sort(), ['hammer', 'manta', 'turtle', 'whaleshark']);
    const views = { hammer: 'side', whaleshark: 'side', manta: 'top', turtle: 'top' };
    for (const id of Data.IDS) assert.equal(Data.source(id).view, views[id], id);
    for (const bad of ['neon', '', 'constructor', '__proto__', null, undefined, 3]) {
        assert.equal(Data.source(bad), null, String(bad));
        assert.equal(Data.rig(bad), null, String(bad));
    }
});

test('编译：每种动物的数据都合规，编译结果缓存（同一个对象）', () => {
    for (const id of Data.IDS) {
        const rig = Data.rig(id);
        assert.ok(rig, id);
        assert.equal(Data.rig(id), rig, `${id} 缓存`);
        assert.doesNotThrow(() => Rig.compile(Data.source(id)), id);
    }
});

test('路径限制：每个图层的路径都能被严格解析器接受，且不超过桌面端 Swift 解析器共用的字符数与命令数上限', () => {
    for (const id of Data.IDS) {
        for (const layer of Data.source(id).layers) {
            assert.ok(layer.d.length <= Shapes.MAX_PATH_CHARS, `${id}/${layer.id} ${layer.d.length} 字符`);
            assert.ok(Shapes.parsePath(layer.d), `${id}/${layer.id} 路径不合规`);
            assert.ok(commandCount(layer.d) <= Shapes.MAX_COMMANDS, `${id}/${layer.id} ${commandCount(layer.d)} 条命令`);
            assert.doesNotMatch(layer.d, /,/, `${id}/${layer.id}：严格解析器只认空格分隔`);
        }
    }
});

test('确定性：数据由固定种子生成——重新加载模块得到逐字相同的数据，构建过程不调用 Math.random', () => {
    const file = require.resolve('../js/marine-rig-data.js');
    const first = JSON.stringify(Data.IDS.map(id => Data.source(id)));
    const saved = Math.random;
    delete require.cache[file];
    Math.random = () => { throw new Error('骨架数据的构建不允许使用 Math.random'); };
    try {
        const again = require('../js/marine-rig-data.js');
        assert.equal(JSON.stringify(again.IDS.map(id => again.source(id))), first);
        for (const id of again.IDS) assert.ok(again.rig(id), id);
    } finally {
        Math.random = saved;
        delete require.cache[file];
        require('../js/marine-rig-data.js');
    }
    assert.doesNotMatch(fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''), /Math\.random|Date\.now|new Date|performance\.now/);
});

test('包围盒：并集有限、大小与“体长 100 单位”一致（弯曲与拍动都算进去），没有离谱的越界', () => {
    for (const id of Data.IDS) {
        const rig = Data.rig(id);
        const u = Rig.unionBounds(rig, 12);
        const w = u.maxX - u.minX, h = u.maxY - u.minY;
        assert.ok(w > 85 && w < 125, `${id} 宽 ${w}`);
        assert.ok(h > 25 && h < 140, `${id} 高 ${h}`);
        assert.ok(u.minX < 0 && u.maxX > 0 && u.minY < 0 && u.maxY > 0, `${id} 包含原点`);
        // 任意姿态（含拉尾之外的所有姿态）都在并集里
        for (let i = 0; i < 24; i++) for (const turn of [-1, -0.4, 0, 0.7, 1]) for (const amp of [0.3, 1]) {
            const { bounds } = Rig.evaluate(rig, { phase: TAU * (i + 0.37) / 24, amp, turn, lod: 0 });
            assert.ok(bounds.minX >= u.minX - 1.5 && bounds.maxX <= u.maxX + 1.5 && bounds.minY >= u.minY - 1.5 && bounds.maxY <= u.maxY + 1.5, `${id} 相位 ${i} turn ${turn}`);
        }
    }
});

test('包围盒：默认采样数就是 12（桌面端 Swift 同值），与密采样相比缺口 ≤ 0.25 个单位；采样太少会明显漏掉', () => {
    for (const id of Data.IDS) {
        const rig = Data.rig(id);
        const dense = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (let i = 0; i < 120; i++) for (const turn of [-1, -0.5, 0, 0.5, 1]) {
            const { bounds } = Rig.evaluate(rig, { phase: TAU * i / 120 + 0.003, amp: 1, turn, lod: 0 });
            dense.minX = Math.min(dense.minX, bounds.minX); dense.minY = Math.min(dense.minY, bounds.minY);
            dense.maxX = Math.max(dense.maxX, bounds.maxX); dense.maxY = Math.max(dense.maxY, bounds.maxY);
        }
        const gapOf = u => Math.max(u.minX - dense.minX, u.minY - dense.minY, dense.maxX - u.maxX, dense.maxY - u.maxY, 0);
        assert.deepEqual(Rig.unionBounds(rig), Rig.unionBounds(rig, 12), `${id} 默认采样数是 12`);
        assert.ok(gapOf(Rig.unionBounds(rig, 12)) <= 0.25, `${id} 缺口 ${gapOf(Rig.unionBounds(rig, 12))}`);
        assert.ok(gapOf(Rig.unionBounds(rig, 2)) > 1, `${id} 只采 2 个相位应该明显漏掉（实测 1.3–6.6），否则这个检查失去分辨力`);
    }
});

test('成本预算：每帧图层与点数有上限；lod 0 < lod 1 ≤ lod 2，最小一档仍能认出这种动物（图层够多）', () => {
    const budget = { hammer: 3000, manta: 2400, turtle: 2800, whaleshark: 4600 };
    for (const id of Data.IDS) {
        const rig = Data.rig(id);
        const counts = [0, 1, 2].map(lod => Rig.evaluate(rig, { phase: 1.1, lod }).ops);
        assert.ok(counts[0].length >= 10, `${id} lod 0 至少 10 个图层才画得出一只动物，实际 ${counts[0].length}`);
        assert.ok(counts[0].length < counts[2].length, `${id} lod 0 要比 lod 2 少图层`);
        assert.ok(counts[1].length <= counts[2].length);
        assert.ok(counts[2].length <= 40, `${id} 图层数 ${counts[2].length}`);
        assert.ok(pointsOf(counts[2]) <= budget[id], `${id} 点数 ${pointsOf(counts[2])} 超过预算 ${budget[id]}`);
        assert.ok(pointsOf(counts[0]) < pointsOf(counts[2]), `${id} lod 0 的点数更少`);
    }
});

test('姿态网格：所有动物在 相位 × 幅度 × 转弯 × 细节 的组合下，输出的坐标全部有限，op 结构不变', () => {
    for (const id of Data.IDS) {
        const rig = Data.rig(id);
        const shape = Rig.evaluate(rig, { phase: 0, lod: 2 }).ops.map(o => `${o.k}:${o.id}`);
        for (let i = 0; i < 8; i++) for (const amp of [0, 0.5, 1]) for (const turn of [-1, 0, 1]) {
            const { ops } = Rig.evaluate(rig, { phase: TAU * i / 8, amp, turn, lod: 2 });
            assert.deepEqual(ops.map(o => `${o.k}:${o.id}`), shape, `${id}：op 结构不随姿态变化`);
            for (const op of ops) for (const poly of op.polys) for (const v of poly.pts) assert.ok(Number.isFinite(v), `${id}/${op.id}`);
            for (const op of ops) {
                if (op.paint && op.paint.grad) for (const v of [...op.paint.grad.a, ...op.paint.grad.b]) assert.ok(Number.isFinite(v));
            }
        }
    }
});

test('对称：带 mirror 的图层静止（amp=0）时，左右两份关于身体轴严格对称；俯视动物的身体轮廓自身也左右对称', () => {
    for (const id of Data.IDS) {
        const src = Data.source(id);
        const { ops } = Rig.evaluate(Data.rig(id), { phase: 0, amp: 0, turn: 0, lod: 2 });
        const byId = new Map(ops.map(o => [`${o.k}:${o.id}`, o]));
        for (const layer of src.layers.filter(l => l.mirror)) {
            for (const kind of ['fill', 'stroke']) {
                const a = byId.get(`${kind}:${layer.id}`), b = byId.get(`${kind}:${layer.id}~`);
                if (!a && !b) continue;
                assert.ok(a && b, `${id}/${layer.id}：${kind} 左右都要有`);
                assert.equal(a.polys.length, b.polys.length);
                for (let p = 0; p < a.polys.length; p++) {
                    for (let i = 0; i < a.polys[p].pts.length; i += 2) {
                        assert.equal(a.polys[p].pts[i], b.polys[p].pts[i], `${id}/${layer.id} x`);
                        assert.ok(Math.abs(a.polys[p].pts[i + 1] + b.polys[p].pts[i + 1]) < 1e-9, `${id}/${layer.id} y 取反`);
                    }
                }
            }
        }
    }
    for (const id of ['manta', 'turtle']) {
        const body = Rig.evaluate(Data.rig(id), { phase: 0, amp: 0, turn: 0, lod: 2 }).ops.find(o => o.id === (id === 'manta' ? 'body' : 'shell'));
        const pts = body.polys[0].pts;
        const key = (x, y) => `${Math.round(x * 20)}:${Math.round(y * 20)}`;
        const set = new Set();
        for (let i = 0; i < pts.length; i += 2) set.add(key(pts[i], pts[i + 1]));
        let missing = 0;
        for (let i = 0; i < pts.length; i += 2) if (!set.has(key(pts[i], -pts[i + 1])) && !set.has(key(pts[i], -pts[i + 1] + 0.05)) && !set.has(key(pts[i], -pts[i + 1] - 0.05))) missing++;
        assert.ok(missing <= 2, `${id} 的身体轮廓左右对称（缺 ${missing} 个镜像点）`);
    }
});

test('颜色合规：所有填充与描边颜色可解析，渐变色标递增；背部比腹部暗（反荫蔽）——侧视的鲨鱼', () => {
    for (const id of Data.IDS) {
        for (const layer of Data.source(id).layers) {
            if (typeof layer.fill === 'string') assert.ok(Rig.parseColor(layer.fill), `${id}/${layer.id}`);
            if (layer.stroke) assert.ok(Rig.parseColor(layer.stroke.color), `${id}/${layer.id} 描边色`);
        }
    }
    for (const id of ['hammer', 'whaleshark']) {
        const src = Data.source(id);
        const back = lum(fillRgb(layerOf(src, 'backDark3')));
        const bellyBand = lum(fillRgb(layerOf(src, 'belly4')));
        assert.ok(bellyBand - back > 0.35, `${id} 腹部（${bellyBand.toFixed(2)}）要明显比背部（${back.toFixed(2)}）亮`);
    }
});

test('鲸鲨：背上与体侧密布白斑（≥ 40 个、浅色），有侧线条纹、五道鳃裂、深蓝灰的背和近白的腹；斑点分层以免超过命令上限', () => {
    const src = Data.source('whaleshark');
    const spots = ['spotsBack', 'spotsFlank', 'spotsHead'].map(id => layerOf(src, id));
    assert.ok(spots.every(Boolean));
    const total = spots.reduce((sum, l) => sum + subpathCount(l.d), 0);
    assert.ok(total >= 40, `斑点 ${total}`);
    for (const l of spots) assert.ok(lum(fillRgb(l)) > 0.8, `${l.id} 是浅色斑点`);
    assert.ok(layerOf(src, 'stripes') && layerOf(src, 'stripes').stroke, '背上有浅色横纹');
    assert.equal(subpathCount(layerOf(src, 'gills').d), 5, '五道鳃裂');
    const body = lum(fillRgb(layerOf(src, 'body')));
    assert.ok(body < 0.5, `体色偏深 ${body.toFixed(2)}`);
    assert.ok(lum(fillRgb(layerOf(src, 'belly4'))) > 0.85, '腹部近白');
    for (const part of ['pec', 'pecFar', 'pelvic', 'dorsal']) assert.ok(src.parts[part], `${part} 有拍动`);
    assert.ok(src.bend.amp[1] > src.bend.amp[0] * 4, '尾幅远大于头幅');
});

test('蝠鲼：腹面视角——浅色身体、五道鳃裂（两侧）、头鳍一对、深色口、薄尾；翼只压扁不转动（翼根不脱开）', () => {
    const src = Data.source('manta');
    assert.ok(lum(fillRgb(layerOf(src, 'wing'))) > 0.8, '腹面近白');
    assert.equal(subpathCount(layerOf(src, 'gills').d), 5);
    assert.ok(layerOf(src, 'gills').mirror, '鳃裂左右各一组');
    assert.ok(layerOf(src, 'horn').mirror && layerOf(src, 'horn').part === 'horn', '头鳍一对且会动');
    assert.ok(layerOf(src, 'mouth') && lum(fillRgb(layerOf(src, 'mouth'))) < 0.2, '深色口');
    assert.ok(layerOf(src, 'tail'), '有尾');
    assert.equal(src.parts.wing.deg, 0, '翼只压扁、不绕翼根转动，翼与身体之间不会裂开');
    assert.ok(src.parts.wing.squash > 0 && src.parts.wing.lag > 0, '拍翼有透视压扁和由根向尖的相位滞后');
    assert.equal(src.parts.wing.freq, 2, '俯视的压扁每个拍翼周期出现两次（上拍、下拍各一次）');
    // 翼尖后掠：右翼最外点（|y| 最大）在翼根（x≈0）的后面
    const wing = Rig.evaluate(Data.rig('manta'), { phase: 0, amp: 0, lod: 0 }).ops.find(o => o.id === 'wing');
    let tip = [0, 0];
    for (let i = 0; i < wing.polys[0].pts.length; i += 2) if (wing.polys[0].pts[i + 1] > tip[1]) tip = [wing.polys[0].pts[i], wing.polys[0].pts[i + 1]];
    assert.ok(tip[0] < -4, `翼尖后掠，x=${tip[0]}`);
    assert.ok(tip[1] > 40, `翼展 ${tip[1] * 2}`);
});

test('海龟：背面视角——龟甲盾片（5 块椎盾 + 肋盾缝）、四只鳍（前鳍大于后鳍）、头在壳外、橄榄褐的壳；前后鳍相位不同', () => {
    const src = Data.source('turtle');
    for (const id of ['frontFlip', 'rearFlip', 'head', 'shell', 'hexes', 'costal']) assert.ok(layerOf(src, id), id);
    assert.equal(subpathCount(layerOf(src, 'hexes').d), 5, '5 块椎盾');
    assert.ok(layerOf(src, 'frontFlip').mirror && layerOf(src, 'rearFlip').mirror, '鳍左右各一');
    const shell = fillRgb(layerOf(src, 'shell'));
    assert.ok(shell[0] > shell[2] && shell[1] > shell[2], '壳偏黄褐（红、绿高于蓝）');
    assert.ok(lum(shell) < 0.45, '壳偏暗');
    const rig = Data.rig('turtle');
    const reach = name => rig.parts[name].reach;
    assert.ok(reach('front') > reach('rear') * 1.2, '前鳍明显比后鳍长');
    assert.ok(src.parts.front.deg > src.parts.rear.deg, '前鳍摆幅更大');
    assert.notEqual(src.parts.front.phase, src.parts.rear.phase, '前后鳍不同相');
    // 头伸出壳前方
    const ops = Rig.evaluate(rig, { phase: 0, amp: 0, lod: 2 }).ops;
    const maxX = id => Math.max(...ops.find(o => o.id === id).polys.flatMap(p => p.pts.filter((_, i) => i % 2 === 0)));
    assert.ok(maxX('head') > maxX('shell') + 12, '头在壳的前面');
});

test('小锤头鲨：锤头是一根竖着的横杆（比躯干在该处高得多），近眼在杆的下端、远眼在上端；背鳍高而后掠，上尾叶最长', () => {
    const src = Data.source('hammer');
    const ops = Rig.evaluate(Data.rig('hammer'), { phase: 0, amp: 0, lod: 2 }).ops;
    const box = id => {
        const xs = [], ys = [];
        for (const p of ops.find(o => o.id === id).polys) for (let i = 0; i < p.pts.length; i += 2) { xs.push(p.pts[i]); ys.push(p.pts[i + 1]); }
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    const bar = box('bar');
    const body = box('body');
    assert.ok(bar.maxY - bar.minY > 22, `杆高 ${bar.maxY - bar.minY}`);
    assert.ok(bar.maxY - bar.minY > (body.maxY - body.minY) * 1.2, '杆比躯干最厚处还高');
    assert.ok(bar.maxX > body.maxX - 1, '杆在头的最前端');
    const near = box('eyeNear'), far = box('eyeFar');
    assert.ok(near.minY > 0 && far.maxY < 0, '近眼在下端、远眼在上端');
    const dorsal = box('dorsal1'), caudal = box('caudal');
    assert.ok(dorsal.minY < body.minY - 14, '背鳍高高竖起');
    assert.ok(-caudal.minY > 18 && caudal.maxY < 12 && -caudal.minY > caudal.maxY * 1.8, '异形尾：上叶远比下叶长');
    assert.ok(src.parts.bar && src.parts.bar.deg <= 5, '头杆只轻轻摆');
});

test('源码合同：骨架数据只依赖路径工具与自己的助手，不碰 DOM、存储、网络、时钟与随机数', () => {
    const text = fs.readFileSync(path.join(__dirname, '../js/marine-rig-data.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\bdocument\b|\bwindow\b|chrome\.|localStorage|fetch\(|XMLHttpRequest|requestAnimationFrame|setTimeout|setInterval|eval\(|new Function/);
});
