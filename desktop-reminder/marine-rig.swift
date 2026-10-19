import Foundation
import CoreGraphics

// 写实海洋动物的“骨架求值器”（纯逻辑，只依赖 Foundation / CoreGraphics，可由 companion-selftest.swift 与 marine-rig-parity 单独编译验证）。
//
// 这是 js/marine-rig.js 的原生端口：水族馆（Canvas）与桌面（CoreGraphics）画的是**同一份数据、同一套求值**，才谈得上“对齐”。
//  · 数据：js/marine-rig-data.js 是唯一来源，desktop-reminder/gen-marine.mjs 经 MarineRig.expand 把它生成为 marine-rig-data.swift（镜像已展开成独立图层与部件，
//    颜色已解析成 0…1，路径是 M/L/C/Q/Z 绝对路径）；本文件只做压平、求值、放置，不再实现路径镜像或数据校验。
//  · 路径：复用 jelly-species.swift 里已有的严格解析器 SpeciesPath.parse（与 JS 的 parsePath 逐条对拍），不另写路径语法。
//  · 求值：压平（每段 C/Q 取 curveSteps 个点）→ 部件拍动（绕 pivot 转动 + 相位滞后 + 可选 y 向压扁）→ 脊柱行波弯曲（站位表，逐点线性插值）→ 取整到 1e-4。
//    常数（curveSteps = 8、spineSteps = 160、flapSteps = 64、取整远离零）与 JS 完全相同；逐点对拍的容差见 test/marine-rig-parity.test.mjs。
//  · 桌面端不用 JS 的“拉尾”（pull，水族馆的鱼尾互动），所以这里没有它。
// 设计与取舍见 docs/technical/marine-realism-20261019.md。

enum MarineRigLimits {
    static let curveSteps = 8        // 每段 C/Q 压平成多少条线段（与 JS 的 CURVE_STEPS 一致）
    static let maxPoints = 6000      // 一个图层压平后的点数上限（与 JS 的 MAX_POINTS 一致）
    static let maxLayers = 160
    static let maxBend = 0.2         // 脊柱横向位移与转弯弯曲占体长的上限（与 JS 的 MAX_BEND 一致）
    static let spineSteps = 160      // 脊柱站位表的段数（与 JS 的 SPINE_STEPS 一致）
    static let flapSteps = 64        // 部件“距 pivot 远近 → 转角/压扁”表的段数（与 JS 的 FLAP_STEPS 一致）
    static let rounding = 10000.0    // 输出坐标取整到 1e-4
}

// MARK: - 生成物里的原始数据

struct MarineBendSource { let ampHead: Double; let ampTail: Double; let pow: Double; let waves: Double; let turn: Double }
struct MarineFlapSource { let pivotX: Double; let pivotY: Double; let deg: Double; let lag: Double; let phase: Double; let freq: Double; let squash: Double; let squashPhase: Double }
enum MarineFillSource: Equatable {
    case flat(Double, Double, Double)
    /// stops：每个色标 [位置, r, g, b, a]（位置递增，0…1）。
    case gradient(ax: Double, ay: Double, bx: Double, by: Double, stops: [[Double]])
}
struct MarineStrokeSource: Equatable { let r: Double; let g: Double; let b: Double; let width: Double; let alpha: Double; let butt: Bool }
struct MarineLayerSource {
    let id: String
    let part: String?
    let d: String
    let fill: MarineFillSource?
    let stroke: MarineStrokeSource?
    let alpha: Double
    let evenOdd: Bool
    let lod: Int
}
struct MarineRigSource {
    let view: SpeciesView
    let tail: Double
    let snout: Double
    let bend: MarineBendSource
    let parts: [String: MarineFlapSource]
    let layers: [MarineLayerSource]
}

// MARK: - 编译后的骨架

struct MarineFlap {
    let pivotX: Double, pivotY: Double, deg: Double, lag: Double, phase: Double, freq: Double, squash: Double, squashPhase: Double
    var reach: Double = 1
}

struct MarinePoly: Equatable {
    var pts: [Double]          // x0, y0, x1, y1, …
    var closed: Bool
}

struct MarineLayer {
    let id: String
    let part: String?
    let polys: [MarinePoly]
    let fill: MarineFillSource?
    let stroke: MarineStrokeSource?
    let alpha: Double
    let evenOdd: Bool
    let lod: Int
}

/// 一种动物编译好的骨架：路径已压平。任何一个图层的路径解析失败、点数超限或出现非有限数，整个物种不可用（返回 nil，不画半个动物）。
struct MarineRig {
    let view: SpeciesView
    let tail: Double
    let snout: Double
    let bend: MarineBendSource
    let flaps: [String: MarineFlap]
    let layers: [MarineLayer]

    var span: Double { snout - tail }

    init?(source: MarineRigSource) {
        guard source.tail.isFinite, source.snout.isFinite, source.snout - source.tail > 1,
              !source.layers.isEmpty, source.layers.count <= MarineRigLimits.maxLayers else { return nil }
        let b = source.bend
        // 范围与 JS 的 expand 校验逐项相同（体长 20% 的横向位移已远超任何真实游动）
        guard [b.ampHead, b.ampTail, b.pow, b.waves, b.turn].allSatisfy({ $0.isFinite }),
              (0...MarineRigLimits.maxBend).contains(b.ampHead), (0...MarineRigLimits.maxBend).contains(b.ampTail),
              b.pow >= 0.5, b.pow <= 6, b.waves >= 0, b.waves <= 3, b.turn >= 0, b.turn <= MarineRigLimits.maxBend else { return nil }
        var flaps: [String: MarineFlap] = [:]
        for (name, f) in source.parts {
            guard [f.pivotX, f.pivotY, f.deg, f.lag, f.phase, f.freq, f.squash, f.squashPhase].allSatisfy({ $0.isFinite }),
                  abs(f.deg) <= 90, f.squash >= 0, f.squash <= 0.6, f.lag >= 0, f.lag <= 3, f.freq > 0, f.freq <= 4 else { return nil }
            flaps[name] = MarineFlap(pivotX: f.pivotX, pivotY: f.pivotY, deg: f.deg, lag: f.lag, phase: f.phase, freq: f.freq, squash: f.squash, squashPhase: f.squashPhase)
        }
        var layers: [MarineLayer] = []
        for item in source.layers {
            guard item.alpha.isFinite, item.alpha >= 0, item.alpha <= 1, (0...2).contains(item.lod), item.fill != nil || item.stroke != nil,
                  item.part == nil || flaps[item.part!] != nil,
                  let commands = SpeciesPath.parse(item.d) else { return nil }
            let polys = MarineRig.flatten(commands)
            guard !polys.isEmpty else { return nil }
            let count = polys.reduce(0) { $0 + $1.pts.count / 2 }
            guard count <= MarineRigLimits.maxPoints, polys.allSatisfy({ $0.pts.allSatisfy { $0.isFinite } }) else { return nil }
            if case .gradient(let ax, let ay, let bx, let by, let stops)? = item.fill {
                guard [ax, ay, bx, by].allSatisfy({ $0.isFinite }), stops.count >= 2, stops.count <= 8 else { return nil }
                var previous = -Double.infinity
                for stop in stops {
                    // 色标：[位置 0…1 且不递减, r, g, b, a]，各分量 0…1（与 JS 的 compilePaint 一致）
                    guard stop.count == 5, stop.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }), stop[0] >= previous else { return nil }
                    previous = stop[0]
                }
            }
            if let s = item.stroke {
                guard [s.r, s.g, s.b, s.width, s.alpha].allSatisfy({ $0.isFinite }), s.width > 0, s.width <= 8, (0...1).contains(s.alpha) else { return nil }
            }
            layers.append(MarineLayer(id: item.id, part: item.part, polys: polys, fill: item.fill, stroke: item.stroke, alpha: item.alpha, evenOdd: item.evenOdd, lod: item.lod))
        }
        // 每个部件的作用半径：该部件所有顶点到 pivot 的最大距离，lag 按 r / reach 归一
        for (name, flap) in flaps {
            var reach = 0.0
            for layer in layers where layer.part == name {
                for poly in layer.polys {
                    var i = 0
                    while i < poly.pts.count {
                        reach = max(reach, hypot(poly.pts[i] - flap.pivotX, poly.pts[i + 1] - flap.pivotY))
                        i += 2
                    }
                }
            }
            flaps[name]?.reach = reach > 1e-9 ? reach : 1
        }
        self.view = source.view
        self.tail = source.tail
        self.snout = source.snout
        self.bend = b
        self.flaps = flaps
        self.layers = layers
    }

    /// 压平：每段 C/Q 取 curveSteps 个点（t = i/steps，i = 1…steps），M/L 的端点原样；闭合子路径末点与起点重合时去掉重复点（与 JS 的 flatten 逐步相同）。
    static func flatten(_ commands: [PathCommand]) -> [MarinePoly] {
        let steps = MarineRigLimits.curveSteps
        var out: [MarinePoly] = []
        var current = CGPoint.zero
        var start = CGPoint.zero
        for command in commands {
            let p = command.points
            switch command.kind {
            case .move:
                out.append(MarinePoly(pts: [Double(p[0].x), Double(p[0].y)], closed: false))
                current = p[0]
                start = p[0]
            case .line:
                guard !out.isEmpty else { continue }
                out[out.count - 1].pts.append(Double(p[0].x))
                out[out.count - 1].pts.append(Double(p[0].y))
                current = p[0]
            case .cubic:
                guard !out.isEmpty else { continue }
                let c0 = Double(current.x), c1 = Double(current.y)
                for i in 1...steps {
                    let t = Double(i) / Double(steps), s = 1 - t
                    let x = s * s * s * c0 + 3 * s * s * t * Double(p[0].x) + 3 * s * t * t * Double(p[1].x) + t * t * t * Double(p[2].x)
                    let y = s * s * s * c1 + 3 * s * s * t * Double(p[0].y) + 3 * s * t * t * Double(p[1].y) + t * t * t * Double(p[2].y)
                    out[out.count - 1].pts.append(x)
                    out[out.count - 1].pts.append(y)
                }
                current = p[2]
            case .quad:
                guard !out.isEmpty else { continue }
                let c0 = Double(current.x), c1 = Double(current.y)
                for i in 1...steps {
                    let t = Double(i) / Double(steps), s = 1 - t
                    let x = s * s * c0 + 2 * s * t * Double(p[0].x) + t * t * Double(p[1].x)
                    let y = s * s * c1 + 2 * s * t * Double(p[0].y) + t * t * Double(p[1].y)
                    out[out.count - 1].pts.append(x)
                    out[out.count - 1].pts.append(y)
                }
                current = p[1]
            case .close:
                guard !out.isEmpty else { continue }
                out[out.count - 1].closed = true
                current = start
                let n = out[out.count - 1].pts.count
                if n >= 4 {
                    let pts = out[out.count - 1].pts
                    if abs(pts[n - 2] - pts[0]) < 1e-9 && abs(pts[n - 1] - pts[1]) < 1e-9 { out[out.count - 1].pts.removeLast(2) }
                }
            }
        }
        return out
    }
}

// MARK: - 姿态与求值结果

/// 求值的姿态（与 JS 的 pose 同义，没有 pull）：phase 游动相位（弧度）、amp 0…1 幅度（滑行/休息时为 0）、turn −1…1 转弯弯曲、lod 细节档（图层的 lod 大于它的不画）。
struct MarineRigPose: Equatable {
    var phase: Double = 0
    var amp: Double = 1
    var turn: Double = 0
    var lod: Int = 2

    /// 规范化：非有限的数当作缺省（phase 0、amp 1、turn 0、lod 2），再夹到合法范围。
    var normalized: MarineRigPose {
        func finite(_ v: Double, _ fallback: Double) -> Double { v.isFinite ? v : fallback }
        return MarineRigPose(phase: finite(phase, 0), amp: max(0, min(1, finite(amp, 1))), turn: max(-1, min(1, finite(turn, 0))), lod: max(0, min(2, lod)))
    }
}

enum MarinePaint: Equatable {
    case rgba(Double, Double, Double, Double)
    /// 端点与色标已是求值后的坐标；色标 [位置, r, g, b, a]，a 已乘图层的不透明度。
    case gradient(ax: Double, ay: Double, bx: Double, by: Double, stops: [[Double]])
}

struct MarineOp: Equatable {
    enum Kind: Equatable { case fill, stroke }
    let kind: Kind
    let id: String
    let polys: [MarinePoly]
    /// 填充规则（只对 fill 有意义）。
    let evenOdd: Bool
    /// 填充的颜料（只对 fill 有意义）。
    let paint: MarinePaint?
    /// 描边：线宽（骨架单位）、颜色（0…1，a 已乘图层的不透明度）、线帽（butt 或 round）。
    let width: Double
    let rgba: [Double]
    let butt: Bool
}

struct MarineEvaluation {
    let ops: [MarineOp]
    /// 全部顶点的包围盒（骨架坐标，y 向下）；没有任何顶点时为 nil。
    let bounds: CGRect?
}

// MARK: - 求值

enum MarineRigEvaluator {
    private static let twoPi = Double.pi * 2

    /// 输出坐标取整到 1e-4，远离零的一侧进位（与 JS 的 roundOps 相同；-0 归一为 0）。
    static func round4(_ value: Double) -> Double {
        let m = (abs(value) * MarineRigLimits.rounding).rounded() / MarineRigLimits.rounding
        return value < 0 && m != 0 ? -m : m
    }

    private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { v < lo ? lo : (v > hi ? hi : v) }

    /// 脊柱在站位 x 处的解析量：offset（横向位移）、slope（d offset / d x）、norm（1 / √(1 + slope²)）。
    static func spineAt(_ rig: MarineRig, x: Double, pose: MarineRigPose) -> (offset: Double, slope: Double, norm: Double) {
        let span = rig.span
        let s = clamp((x - rig.tail) / span, 0, 1)
        let b = rig.bend
        let inv = 1 - s
        let env = b.ampHead + (b.ampTail - b.ampHead) * Foundation.pow(inv, b.pow)
        let envSlope = -(b.ampTail - b.ampHead) * b.pow * Foundation.pow(inv, b.pow - 1)
        let k = twoPi * b.waves
        let theta = pose.phase - k * inv
        let sinT = sin(theta), cosT = cos(theta)
        var offset = pose.amp * env * span * sinT
        var slope = pose.amp * (envSlope * sinT + env * k * cosT)
        if pose.turn != 0 && b.turn > 0 {
            offset += pose.turn * b.turn * span * inv * inv
            slope += -2 * pose.turn * b.turn * inv
        }
        return (offset, slope, 1 / (1 + slope * slope).squareRoot())
    }

    /// 脊柱弯曲（精确公式，参考实现）。
    static func bendPoint(_ rig: MarineRig, x: Double, y: Double, pose: MarineRigPose) -> (Double, Double) {
        let s = spineAt(rig, x: x, pose: pose)
        return (x - y * s.slope * s.norm, s.offset + y * s.norm)
    }

    /// 部件拍动（精确公式，参考实现）。
    static func flapPoint(_ f: MarineFlap, x: Double, y: Double, pose: MarineRigPose) -> (Double, Double) {
        let phase = f.freq * pose.phase + f.phase
        let r = hypot(x - f.pivotX, y - f.pivotY)
        let lag = f.lag * r / f.reach
        var py = y
        if f.squash != 0 { py = f.pivotY + (y - f.pivotY) * (1 - pose.amp * f.squash * sin(phase + f.squashPhase - lag)) }
        let angle = pose.amp * f.deg * Double.pi / 180 * sin(phase - lag)
        let c = cos(angle), s = sin(angle)
        let dx = x - f.pivotX, dy = py - f.pivotY
        return (f.pivotX + dx * c - dy * s, f.pivotY + dx * s + dy * c)
    }

    static func movePoint(_ rig: MarineRig, part: String?, x: Double, y: Double, pose: MarineRigPose) -> (Double, Double) {
        var px = x, py = y
        if let name = part, let flap = rig.flaps[name] { (px, py) = flapPoint(flap, x: px, y: py, pose: pose) }
        return bendPoint(rig, x: px, y: py, pose: pose)
    }

    private struct SpineTable {
        let n: Int
        let tail: Double
        let scale: Double
        var off: [Double], sn: [Double], nm: [Double]
    }

    private struct FlapTable {
        let n: Int
        let px: Double, py: Double
        let scale: Double
        var cosA: [Double], sinA: [Double], sq: [Double]
    }

    private static func buildSpine(_ rig: MarineRig, pose: MarineRigPose) -> SpineTable {
        let n = MarineRigLimits.spineSteps
        var off = [Double](repeating: 0, count: n + 1), sn = off, nm = off
        let span = rig.span
        for i in 0...n {
            let s = spineAt(rig, x: rig.tail + span * Double(i) / Double(n), pose: pose)
            off[i] = s.offset
            sn[i] = s.slope * s.norm
            nm[i] = s.norm
        }
        return SpineTable(n: n, tail: rig.tail, scale: Double(n) / span, off: off, sn: sn, nm: nm)
    }

    private static func buildFlap(_ f: MarineFlap, pose: MarineRigPose) -> FlapTable {
        let n = MarineRigLimits.flapSteps
        var cosA = [Double](repeating: 0, count: n + 1), sinA = cosA, sq = cosA
        let phase = f.freq * pose.phase + f.phase
        for i in 0...n {
            let lag = f.lag * Double(i) / Double(n)
            sq[i] = f.squash != 0 ? 1 - pose.amp * f.squash * sin(phase + f.squashPhase - lag) : 1
            let angle = pose.amp * f.deg * Double.pi / 180 * sin(phase - lag)
            cosA[i] = cos(angle)
            sinA[i] = sin(angle)
        }
        return FlapTable(n: n, px: f.pivotX, py: f.pivotY, scale: Double(n) / f.reach, cosA: cosA, sinA: sinA, sq: sq)
    }

    private static func transformPaint(_ rig: MarineRig, _ layer: MarineLayer, pose: MarineRigPose) -> MarinePaint? {
        guard let fill = layer.fill else { return nil }
        switch fill {
        case .flat(let r, let g, let b):
            return .rgba(r, g, b, layer.alpha)
        case .gradient(let ax, let ay, let bx, let by, let stops):
            let a = movePoint(rig, part: layer.part, x: ax, y: ay, pose: pose)
            let b = movePoint(rig, part: layer.part, x: bx, y: by, pose: pose)
            return .gradient(ax: round4(a.0), ay: round4(a.1), bx: round4(b.0), by: round4(b.1),
                             stops: stops.map { [$0[0], $0[1], $0[2], $0[3], $0[4] * layer.alpha] })
        }
    }

    /// 在某个姿态求值（站位表快路径，与 JS 的 evaluate 同一套算法与常数）：ops 按绘制顺序，坐标是骨架坐标系里变形后的点（y 向下，体长 100 单位），
    /// 宿主再缩放、翻 y、旋转/平移/翻转。一个图层一个 op（图层里所有子路径合成一条路径，一次填充/描边）。填充只用闭合子路径，描边按子路径各自的闭合状态描。
    static func evaluate(_ rig: MarineRig, pose input: MarineRigPose) -> MarineEvaluation {
        let pose = input.normalized
        var ops: [MarineOp] = []
        let spine = buildSpine(rig, pose: pose)
        var flapTables: [String: FlapTable] = [:]
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        for layer in rig.layers where layer.lod <= pose.lod {
            let paint = transformPaint(rig, layer, pose: pose)
            var flap: FlapTable?
            if let name = layer.part, let source = rig.flaps[name] {
                if let table = flapTables[name] { flap = table } else { let table = buildFlap(source, pose: pose); flapTables[name] = table; flap = table }
            }
            var polys: [MarinePoly] = []
            polys.reserveCapacity(layer.polys.count)
            for poly in layer.polys {
                let src = poly.pts
                let count = src.count / 2
                var pts = [Double](repeating: 0, count: count * 2)
                for i in 0..<count {
                    let x0 = src[i * 2], y0 = src[i * 2 + 1]
                    var px = x0, py = y0
                    if let flap = flap {
                        let dx = x0 - flap.px, dy0 = y0 - flap.py
                        var q = (dx * dx + dy0 * dy0).squareRoot() * flap.scale
                        if q > Double(flap.n) { q = Double(flap.n) }
                        var j = Int(q)
                        if j >= flap.n { j = flap.n - 1 }
                        let f = q - Double(j)
                        let dy = dy0 * (flap.sq[j] + (flap.sq[j + 1] - flap.sq[j]) * f)
                        let c = flap.cosA[j] + (flap.cosA[j + 1] - flap.cosA[j]) * f
                        let s = flap.sinA[j] + (flap.sinA[j + 1] - flap.sinA[j]) * f
                        px = flap.px + dx * c - dy * s
                        py = flap.py + dx * s + dy * c
                    }
                    var u = (px - spine.tail) * spine.scale
                    if u < 0 { u = 0 } else if u > Double(spine.n) { u = Double(spine.n) }
                    var k = Int(u)
                    if k >= spine.n { k = spine.n - 1 }
                    let t = u - Double(k)
                    let x = round4(px - py * (spine.sn[k] + (spine.sn[k + 1] - spine.sn[k]) * t))
                    let y = round4(spine.off[k] + (spine.off[k + 1] - spine.off[k]) * t + py * (spine.nm[k] + (spine.nm[k + 1] - spine.nm[k]) * t))
                    pts[i * 2] = x
                    pts[i * 2 + 1] = y
                    if x < minX { minX = x }
                    if x > maxX { maxX = x }
                    if y < minY { minY = y }
                    if y > maxY { maxY = y }
                }
                polys.append(MarinePoly(pts: pts, closed: poly.closed))
            }
            let closed = polys.filter { $0.closed }
            if let paint = paint, !closed.isEmpty {
                ops.append(MarineOp(kind: .fill, id: layer.id, polys: closed, evenOdd: layer.evenOdd, paint: paint, width: 0, rgba: [], butt: false))
            }
            if let stroke = layer.stroke {
                ops.append(MarineOp(kind: .stroke, id: layer.id, polys: polys, evenOdd: false, paint: nil, width: stroke.width,
                                    rgba: [stroke.r, stroke.g, stroke.b, stroke.alpha * layer.alpha], butt: stroke.butt))
            }
        }
        let bounds: CGRect? = minX.isFinite ? CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY) : nil
        return MarineEvaluation(ops: ops, bounds: bounds)
    }

    /// 参考实现：逐点用精确公式求值，结构与 evaluate 完全相同（给自测量化站位表近似的误差）。
    static func evaluateExact(_ rig: MarineRig, pose input: MarineRigPose) -> MarineEvaluation {
        let pose = input.normalized
        var ops: [MarineOp] = []
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        for layer in rig.layers where layer.lod <= pose.lod {
            let paint = transformPaint(rig, layer, pose: pose)
            let polys: [MarinePoly] = layer.polys.map { poly in
                var pts = [Double](repeating: 0, count: poly.pts.count)
                var i = 0
                while i < poly.pts.count {
                    let moved = movePoint(rig, part: layer.part, x: poly.pts[i], y: poly.pts[i + 1], pose: pose)
                    pts[i] = round4(moved.0)
                    pts[i + 1] = round4(moved.1)
                    minX = min(minX, pts[i]); maxX = max(maxX, pts[i]); minY = min(minY, pts[i + 1]); maxY = max(maxY, pts[i + 1])
                    i += 2
                }
                return MarinePoly(pts: pts, closed: poly.closed)
            }
            let closed = polys.filter { $0.closed }
            if let paint = paint, !closed.isEmpty {
                ops.append(MarineOp(kind: .fill, id: layer.id, polys: closed, evenOdd: layer.evenOdd, paint: paint, width: 0, rgba: [], butt: false))
            }
            if let stroke = layer.stroke {
                ops.append(MarineOp(kind: .stroke, id: layer.id, polys: polys, evenOdd: false, paint: nil, width: stroke.width,
                                    rgba: [stroke.r, stroke.g, stroke.b, stroke.alpha * layer.alpha], butt: stroke.butt))
            }
        }
        let bounds: CGRect? = minX.isFinite ? CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY) : nil
        return MarineEvaluation(ops: ops, bounds: bounds)
    }

    /// 各相位下包围盒的并集（放置用）：动起来任何一帧都不会越出。
    static func unionBounds(_ rig: MarineRig, samples: Int = 12) -> CGRect? {
        var out: CGRect?
        for i in 0..<samples {
            for turn in [-1.0, 0, 1] {
                guard let box = evaluate(rig, pose: MarineRigPose(phase: twoPi * Double(i) / Double(samples), amp: 1, turn: turn, lod: 0)).bounds else { continue }
                out = out.map { $0.union(box) } ?? box
            }
        }
        return out
    }
}

// MARK: - 桌面上的写实动物（几何、大小、游动频率）

extension JellySpecies {
    /// 桌面上写实动物的体长（吻端到尾端，点）。取值让最长的一边落在设计稿批准的“长度约 76–92 pt”里（并集约 79.5×47.6 / 74.5×79.6 / 62.3×83.9 / 90.7×44 pt），
    /// 俯视的蝠鲼、海龟的“高”（翼展、鳍展）大于体长，都装得进窗口里动物上方 91 pt 的空间（自测核对）。水母没有骨架，返回 nil。
    var rigBodyLength: CGFloat? {
        switch self {
        case .jelly: return nil
        case .hammer: return 70
        case .manta: return 74
        case .turtle: return 64
        case .whaleshark: return 84
        }
    }

    /// 游动时尾巴/翅膀每秒摆几个周期（Hz，包络为 1 时）：小锤头鲨摆尾较快，蝠鲼与海龟拍翼从容，鲸鲨最慢。与水族馆（相位 × FREQ，js/aquarium-real.js）同一量级。
    var rigFrequency: CGFloat {
        switch self {
        case .jelly: return 0
        case .hammer: return 0.75
        case .manta: return 0.5
        case .turtle: return 0.4
        case .whaleshark: return 0.4
        }
    }
}

/// 一种动物在桌面上的写实几何：编译好的骨架 + 缩放 + 并集包围盒（点，y 向上，以骨架原点为原点，与卡通版的 SpeciesGeometry.union 同一坐标约定）。
struct MarineRigGeometry {
    let species: JellySpecies
    let rig: MarineRig
    /// 每个骨架单位对应多少点。
    let unit: CGFloat
    /// 各相位、各转弯下包围盒的并集（不含描边宽度）：放置按它算，动画任何一帧都在它里面。
    let union: CGRect

    init?(species: JellySpecies, source: MarineRigSource) {
        guard let length = species.rigBodyLength, length.isFinite, length > 0,
              let rig = MarineRig(source: source), let box = MarineRigEvaluator.unionBounds(rig) else { return nil }
        let k = length / CGFloat(rig.span)
        self.species = species
        self.rig = rig
        self.unit = k
        // 骨架 y 向下、几何 y 向上：翻转后的 y 范围是 −maxY…−minY
        self.union = CGRect(x: box.minX * k, y: -box.maxY * k, width: box.width * k, height: box.height * k)
    }
}

enum MarineRigGeometries {
    /// 数据表里每种动物换算出的写实几何（只算一次）；解析或编译不了的物种不在其中。
    private static let table: [JellySpecies: MarineRigGeometry] = {
        var out: [JellySpecies: MarineRigGeometry] = [:]
        for (species, source) in MarineRigData.sources {
            if let geometry = MarineRigGeometry(species: species, source: source) { out[species] = geometry }
        }
        return out
    }()

    static func of(_ species: JellySpecies) -> MarineRigGeometry? { species == .jelly ? nil : table[species] }
}

extension JellySpecies {
    /// 有没有可以画出来的写实骨架（水母没有）。
    var hasRealisticRig: Bool { MarineRigGeometries.of(self) != nil }
}
