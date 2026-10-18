import Foundation
import CoreGraphics

// 桌面水母的“物种”（纯逻辑，只依赖 Foundation / CoreGraphics，可由 companion-selftest.swift 单独编译验证）：
// 桌面上每次只出现一种——水母，或某种海洋动物（小锤头鲨、蝠鲼、海龟、鲸鲨）。
//  · Chrome 是设置的唯一所有者，下发的 species 是字符串；这里走白名单解析，未知值、大小写不符、非字符串一律回到水母（外观不对不能让水母消失）；
//  · 哪些动物已经画得出来由 isAvailable 决定（水母是过程式画法，永远可用；动物要有几何数据）。画不出来的物种，生效的是水母，
//    ping 与 jelly 回执报告的是**实际生效**的那一种，Chrome 据此判断“组件有没有按设置应用”，不会把没画出来的说成已应用；
//  · 设计见 docs/superpowers/specs/2026-10-17-jelly-species-design.md，实现计划见 docs/superpowers/plans/2026-10-17-jelly-species-stepA.md。
enum JellySpecies: String, CaseIterable {
    case jelly, hammer, manta, turtle, whaleshark

    static let `default`: JellySpecies = .jelly

    /// 中文名：原生面板标题、读屏标签、右键菜单用。功能名仍叫“桌面水母”，只有这些原生文字随物种变化。
    var displayName: String {
        switch self {
        case .jelly: return "水母"
        case .hammer: return "小锤头鲨"
        case .manta: return "蝠鲼"
        case .turtle: return "海龟"
        case .whaleshark: return "鲸鲨"
        }
    }

    /// 原生面板标题与读屏标签：水母保持“桌面水母”，动物是“桌面”加物种名。
    var desktopTitle: String { "桌面" + displayName }

    /// 白名单解析：只认列表里的字符串（区分大小写、不做空白处理，与 Chrome 侧 js/jelly-appearance.js 的校验一致），其余回到水母。
    static func parse(_ raw: Any?) -> JellySpecies {
        guard let text = raw as? String else { return .default }
        return JellySpecies(rawValue: text) ?? .default
    }

    /// 有没有可以画出来的几何：水母是过程式画法永远可用，动物要有数据表里的形状且全部路径都能解析（见 JellySpeciesGeometry）。
    var isAvailable: Bool { self == .jelly || JellySpeciesGeometry.of(self) != nil }

    /// 实际生效的物种：可用就是自己，否则回退水母。
    var effective: JellySpecies { isAvailable ? self : .jelly }
}

// MARK: - 动物几何（纯逻辑：路径解析、缩放与翻转、各相位包围盒、放置）
//
// 形状数据的唯一来源是 js/jelly-species-shapes.js；desktop-reminder/gen-species.mjs 把它生成为 jelly-species-data.swift（SVG 方向：x 向右、y 向下，未缩放）。
// 这里只做三件事：用一个只认 M/L/C/Q/Z 绝对命令的严格解析器还原路径（JS 侧的 parsePath 是参考实现，PARSE_CASES 逐项对拍）；
// 按每种动物的缩放换成桌面上的大小并把 y 翻成向上（CoreGraphics 的方向，转动角随之反号）；算各相位的包围盒用于放置。
// 解析失败的物种整体不可用（isAvailable 为 false，回退水母），不会画出半个动物。

enum SpeciesRole: String { case body, limb, belly, accent, shine }
enum SpeciesView: String { case side, top }

/// 生成物里的原始数据（未缩放、y 向下）；部件顺序就是绘制顺序。
struct SpeciesMotionSource { let pivotX: Double; let pivotY: Double; let degrees: Double; var squash: Double = 0 }
struct SpeciesPartSource { let role: SpeciesRole; let u: Double; let path: String; let motion: SpeciesMotionSource? }
struct SpeciesSource {
    let view: SpeciesView
    let scale: Double
    let parts: [SpeciesPartSource]
    let eyeRadius: Double
    let eyes: [[Double]]
    let blush: [[Double]]
    /// 微笑：一段三次贝塞尔的四个点（起点、两个控制点、终点；未缩放、y 向下）。空表示没有嘴——俯视动物看不见嘴，生成器对没有嘴的动物不写这一项。
    var mouth: [[Double]] = []
}

struct PathCommand: Equatable {
    enum Kind: Equatable { case move, line, cubic, quad, close }
    let kind: Kind
    let points: [CGPoint]
}

enum SpeciesPath {
    static let maxChars = 16000           // 与 JS 的 MAX_PATH_CHARS 一致（UTF-16 单位）
    static let maxCommands = 800          // 与 JS 的 MAX_COMMANDS 一致
    static let samplesPerSegment = 16     // 与 JS 的 SAMPLES 一致：包围盒对每段贝塞尔取这么多点

    private static func tokens(_ d: String) -> [String] {
        var out: [String] = []
        var current = String.UnicodeScalarView()
        for scalar in d.unicodeScalars {
            // 空白只认空格、制表、回车、换行；按 Unicode 标量切分，所以 CRLF 不会被当成一个字符而漏掉（String 的 Character 会把它合成一个）
            if scalar == " " || scalar == "\t" || scalar == "\r" || scalar == "\n" {
                if !current.isEmpty { out.append(String(current)); current = String.UnicodeScalarView() }
            } else {
                current.append(scalar)
            }
        }
        if !current.isEmpty { out.append(String(current)) }
        return out
    }

    /// 与 JS 的 /^-?\d+(\.\d+)?$/ 同一个文法：只认 ASCII 数字，不认指数、前导 +、.5、5.、十六进制、无穷、全角数字。
    private static func number(_ token: String) -> Double? {
        var scalars = Array(token.unicodeScalars)[...]
        if scalars.first == "-" { scalars = scalars.dropFirst() }
        let pieces = scalars.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 1 || pieces.count == 2 else { return nil }
        for piece in pieces {
            guard !piece.isEmpty, piece.allSatisfy({ $0.value >= 48 && $0.value <= 57 }) else { return nil }
        }
        guard let value = Double(token), value.isFinite else { return nil }
        return value
    }

    private static func command(_ letter: String) -> (kind: PathCommand.Kind, arity: Int)? {
        switch letter {
        case "M": return (.move, 2)
        case "L": return (.line, 2)
        case "C": return (.cubic, 6)
        case "Q": return (.quad, 4)
        case "Z": return (.close, 0)
        default: return nil
        }
    }

    /// 解析路径串；任何不合规的输入返回 nil（规则与 JS 的 parsePath 逐条相同：命令只有五种大写绝对命令、数字个数必须正好、
    /// 不支持隐式重复、必须以 M 开头、Z 之后只能是 M、命令数与长度有上限）。
    static func parse(_ d: String) -> [PathCommand]? {
        guard !d.isEmpty, d.utf16.count <= maxChars else { return nil }
        let items = tokens(d)
        guard !items.isEmpty else { return nil }
        var out: [PathCommand] = []
        var index = 0
        var previous: PathCommand.Kind?
        while index < items.count {
            guard let (kind, arity) = command(items[index]) else { return nil }
            index += 1
            if out.isEmpty && kind != .move { return nil }
            if previous == .close && kind != .move { return nil }
            guard index + arity <= items.count else { return nil }
            var values: [Double] = []
            for _ in 0..<arity {
                guard let value = number(items[index]) else { return nil }
                values.append(value)
                index += 1
            }
            var points: [CGPoint] = []
            var i = 0
            while i < values.count { points.append(CGPoint(x: values[i], y: values[i + 1])); i += 2 }
            out.append(PathCommand(kind: kind, points: points))
            previous = kind
            if out.count > maxCommands { return nil }
        }
        return out
    }

    /// 取样点（包围盒用）：起点与直线端点原样，贝塞尔每段取 samplesPerSegment 个点（t = i/16，i = 1…16）。
    static func sample(_ commands: [PathCommand]) -> [CGPoint] {
        var points: [CGPoint] = []
        var current = CGPoint.zero
        for command in commands {
            let p = command.points
            switch command.kind {
            case .move, .line:
                points.append(p[0])
                current = p[0]
            case .cubic:
                for i in 1...samplesPerSegment {
                    let t = CGFloat(i) / CGFloat(samplesPerSegment), s = 1 - t
                    let w0 = s * s * s, w1 = 3 * s * s * t, w2 = 3 * s * t * t, w3 = t * t * t
                    points.append(CGPoint(x: w0 * current.x + w1 * p[0].x + w2 * p[1].x + w3 * p[2].x,
                                          y: w0 * current.y + w1 * p[0].y + w2 * p[1].y + w3 * p[2].y))
                }
                current = p[2]
            case .quad:
                for i in 1...samplesPerSegment {
                    let t = CGFloat(i) / CGFloat(samplesPerSegment), s = 1 - t
                    let w0 = s * s, w1 = 2 * s * t, w2 = t * t
                    points.append(CGPoint(x: w0 * current.x + w1 * p[0].x + w2 * p[1].x,
                                          y: w0 * current.y + w1 * p[0].y + w2 * p[1].y))
                }
                current = p[1]
            case .close:
                break
            }
        }
        return points
    }
}

/// 绕 pivot 运动的部件（鳍、尾、俯视蝠鲼的翼）：maxAngle 是 wave = ±1 时的转角，弧度、CoreGraphics 方向（逆时针为正）；
/// squash 是拍翼幅度：同一个 pivot 上把 y 方向缩放到 1 − squash × wave（wave = 1 最瘦、−1 最胖）；先缩放后转动，wave = 0 时都不起作用。
struct SpeciesMotion {
    /// 幅度上限（与 JS 的 MAX_SQUASH 一致）：缩放因子始终在 0.7…1.3 之间，不会把身体压扁或翻面。
    static let maxSquash: CGFloat = 0.3

    let pivot: CGPoint
    let maxAngle: CGFloat
    var squash: CGFloat = 0

    /// 一个点在 wave 相位的位置：与 transform(wave:) 同一个公式。包围盒按它取样，绘制按 transform 变换整条路径，两者因此不会漂移。
    /// wave 在这里不夹取（包围盒取样的相位本来就在 −1…1 里）。
    func apply(to point: CGPoint, wave: CGFloat) -> CGPoint {
        let dx = point.x - pivot.x
        let dy = (point.y - pivot.y) * (1 - squash * wave)
        let c = cos(maxAngle * wave), s = sin(maxAngle * wave)
        return CGPoint(x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c)
    }
}

struct SpeciesPart {
    let role: SpeciesRole
    let u: CGFloat                    // 取色位置：0 尾端 → 1 头端（只有 limb 用，交给 JellyPaint.limbTone）
    let commands: [PathCommand]       // 已按缩放换算、y 向上
    let motion: SpeciesMotion?
}

/// 一种动物换算好的几何：缩放后、y 向上、原点在作者坐标系的身体中心（运行时再按并集包围盒居中）。
struct SpeciesGeometry {
    static let waves: [CGFloat] = [-1, -0.5, 0, 0.5, 1]    // 并集取样的相位，与 JS 的 WAVES 一致

    let species: JellySpecies
    let view: SpeciesView
    let scale: CGFloat
    let parts: [SpeciesPart]
    let eyes: [CGPoint]
    let eyeRadius: CGFloat
    let blush: [(center: CGPoint, rx: CGFloat, ry: CGFloat)]
    /// 微笑的四个点（起点、两个控制点、终点；缩放后、y 向上，与部件同一坐标）；空表示没有嘴。只有侧视动物有。
    let mouth: [CGPoint]
    /// 各相位包围盒的并集（不含描边与眼睛）：放置按它算，动画任何一帧都在它里面。
    let union: CGRect
    /// 躯干（role = body）在 wave = 0 的包围盒：渐变与光晕按它定位。
    let bodyBounds: CGRect

    /// 任何一个部件的路径解析失败、没有部件、或数据里有非有限数字，都返回 nil（整个物种不可用，不画半个动物）。
    init?(species: JellySpecies, source: SpeciesSource) {
        let k = CGFloat(source.scale)
        guard k.isFinite, k > 0, !source.parts.isEmpty else { return nil }
        var parts: [SpeciesPart] = []
        for item in source.parts {
            guard let commands = SpeciesPath.parse(item.path) else { return nil }
            let scaled = commands.map { command in
                PathCommand(kind: command.kind, points: command.points.map { CGPoint(x: $0.x * k, y: -$0.y * k) })
            }
            var motion: SpeciesMotion?
            if let m = item.motion {
                let angle = -CGFloat(m.degrees) * .pi / 180
                let squash = CGFloat(m.squash)
                guard angle.isFinite, squash.isFinite, squash >= 0, squash <= SpeciesMotion.maxSquash else { return nil }
                motion = SpeciesMotion(pivot: CGPoint(x: CGFloat(m.pivotX) * k, y: -CGFloat(m.pivotY) * k), maxAngle: angle, squash: squash)
            }
            let u = CGFloat(item.u)
            guard u.isFinite else { return nil }
            parts.append(SpeciesPart(role: item.role, u: max(0, min(1, u)), commands: scaled, motion: motion))
        }
        var eyes: [CGPoint] = []
        for e in source.eyes {
            guard e.count == 2 else { return nil }
            eyes.append(CGPoint(x: CGFloat(e[0]) * k, y: -CGFloat(e[1]) * k))
        }
        var blush: [(center: CGPoint, rx: CGFloat, ry: CGFloat)] = []
        for b in source.blush {
            guard b.count == 4 else { return nil }
            blush.append((CGPoint(x: CGFloat(b[0]) * k, y: -CGFloat(b[1]) * k), CGFloat(b[2]) * k, CGFloat(b[3]) * k))
        }
        // 嘴：没有就是空；有就必须是侧视动物的四个有限数字的点（俯视动物看不见嘴，写了嘴说明数据有误，整种动物不可用）
        var mouth: [CGPoint] = []
        if !source.mouth.isEmpty {
            guard source.view == .side, source.mouth.count == 4 else { return nil }
            for m in source.mouth {
                guard m.count == 2, m[0].isFinite, m[1].isFinite else { return nil }
                mouth.append(CGPoint(x: CGFloat(m[0]) * k, y: -CGFloat(m[1]) * k))
            }
        }
        self.species = species
        self.view = source.view
        self.scale = k
        self.parts = parts
        self.eyes = eyes
        self.eyeRadius = CGFloat(source.eyeRadius) * k
        self.blush = blush
        self.mouth = mouth
        var union: CGRect?
        for wave in SpeciesGeometry.waves {
            guard let box = SpeciesGeometry.box(of: parts, wave: wave, roles: nil) else { return nil }
            union = union.map { $0.union(box) } ?? box
        }
        guard let combined = union, let body = SpeciesGeometry.box(of: parts, wave: 0, roles: [.body]) else { return nil }
        self.union = combined
        self.bodyBounds = body
    }

    private static func box(of parts: [SpeciesPart], wave: CGFloat, roles: Set<SpeciesRole>?) -> CGRect? {
        var minX = CGFloat.infinity, minY = CGFloat.infinity, maxX = -CGFloat.infinity, maxY = -CGFloat.infinity
        for part in parts where roles?.contains(part.role) ?? true {
            for sampled in SpeciesPath.sample(part.commands) {
                let point = part.motion.map { $0.apply(to: sampled, wave: wave) } ?? sampled
                minX = min(minX, point.x); maxX = max(maxX, point.x)
                minY = min(minY, point.y); maxY = max(maxY, point.y)
            }
        }
        guard minX.isFinite, maxX.isFinite, minY.isFinite, maxY.isFinite else { return nil }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    /// 某个相位（wave ∈ [-1, 1]）下全部部件的包围盒。
    func bounds(wave: CGFloat) -> CGRect { SpeciesGeometry.box(of: parts, wave: wave, roles: nil) ?? .null }
}

// MARK: - 动物的绘制路径（CoreGraphics；与包围盒共用同一份几何，所以画出来的和放置、余量用的不会漂移）

extension SpeciesMotion {
    /// wave（−1…1，非有限当作 0）对应的变换：先在 pivot 上把 y 缩放到 1 − squash × wave，再绕 pivot 转 wave × maxAngle（几何坐标，y 向上，逆时针为正）。
    func transform(wave: CGFloat) -> CGAffineTransform {
        let w = wave.isFinite ? max(-1, min(1, wave)) : 0
        return CGAffineTransform(translationX: -pivot.x, y: -pivot.y)
            .concatenating(CGAffineTransform(scaleX: 1, y: 1 - squash * w))
            .concatenating(CGAffineTransform(rotationAngle: maxAngle * w))
            .concatenating(CGAffineTransform(translationX: pivot.x, y: pivot.y))
    }
}

extension SpeciesPart {
    /// 这一相位下的路径（几何坐标，还没放置到窗口里）：命令逐条还原，有转动的部件再按 wave 摆动。
    func path(wave: CGFloat) -> CGPath {
        let path = CGMutablePath()
        for command in commands {
            let p = command.points
            switch command.kind {
            case .move: path.move(to: p[0])
            case .line: path.addLine(to: p[0])
            case .cubic: path.addCurve(to: p[2], control1: p[0], control2: p[1])
            case .quad: path.addQuadCurve(to: p[1], control: p[0])
            case .close: path.closeSubpath()
            }
        }
        guard let motion = motion, wave.isFinite, wave != 0 else { return path }
        var transform = motion.transform(wave: wave)
        return path.copy(using: &transform) ?? path
    }
}

enum JellySpeciesGeometry {
    /// 数据表里每种动物换算出的几何（只算一次）；解析不了的物种不在其中。
    private static let table: [JellySpecies: SpeciesGeometry] = {
        var out: [JellySpecies: SpeciesGeometry] = [:]
        for (species, source) in JellySpeciesData.sources {
            if let geometry = SpeciesGeometry(species: species, source: source) { out[species] = geometry }
        }
        return out
    }()

    static func of(_ species: JellySpecies) -> SpeciesGeometry? { species == .jelly ? nil : table[species] }
}

/// 放置：动物悬在窗口的“标准高度”（设计稿 §11 第 2 条），不贴泳线；按并集包围盒居中，所以任何朝向、俯仰与划水相位都不会越出窗口。
enum SpeciesPlacement {
    /// 并集包围盒顶端到窗口底边的距离（水母休息时伞顶也大致在这个高度）。
    static let topAboveWindowBottom: CGFloat = 91

    /// 并集包围盒中心在视图（y 向上）里的位置；centerX 是窗口水平中心。
    static func center(_ geometry: SpeciesGeometry, centerX: CGFloat) -> CGPoint {
        CGPoint(x: centerX, y: topAboveWindowBottom - geometry.union.height / 2)
    }

    /// 几何坐标（缩放后、y 向上）→ 视图坐标。先把并集中心移到原点，再转俯仰（鼻子朝上为正，先转后翻，所以左右朝向的“抬头”符号一致），
    /// 再按朝向水平翻转（facing = ±1，转身途中是中间值），最后放到 center。
    static func transform(_ geometry: SpeciesGeometry, centerX: CGFloat, facing: CGFloat, pitch: CGFloat) -> CGAffineTransform {
        let mid = CGPoint(x: geometry.union.midX, y: geometry.union.midY)
        let target = center(geometry, centerX: centerX)
        return CGAffineTransform(translationX: -mid.x, y: -mid.y)
            .concatenating(CGAffineTransform(rotationAngle: pitch))
            .concatenating(CGAffineTransform(scaleX: facing, y: 1))
            .concatenating(CGAffineTransform(translationX: target.x, y: target.y))
    }
}

// MARK: - 游动调参（物种系数）

/// 游动调参里各项相对水母的系数：水母自己全是 1（不乘），动物按身体特点调整——下沉更慢、阻力更小、冲量更温和，游起来更平稳。
/// 系数是用 JellySwim 的种子化模拟标定的（companion-selftest 逐物种逐阶段检查纵向分布与平均速度），不是随手写的数。
struct SwimProfile: Equatable {
    var period: CGFloat = 1
    var thrustX: CGFloat = 1
    var thrustY: CGFloat = 1
    var sink: CGFloat = 1
    var dragX: CGFloat = 1
    var dragY: CGFloat = 1
}

extension JellySpecies {
    var swimProfile: SwimProfile {
        switch self {
        case .jelly: return SwimProfile()
        // 小锤头鲨：下沉与冲量各减小到约 6 成（垂直起伏减半、平均高度不变），横向阻力 0.7、冲量 0.8（平均速度与水母相当、更平滑）
        case .hammer: return SwimProfile(thrustX: 0.8, thrustY: 0.55, sink: 0.6, dragX: 0.7)
        // 蝠鲼：游得最慢、滑得最远——脉动周期 1.35 倍（拍翼更慢）；水平冲量 0.6 配横向阻力 0.5（每次拍翼后滑得更远，平均速度约水母的 0.8–0.85 倍、比小锤头鲨慢）；
        // 竖直冲量 0.5 与下沉 0.5（起伏约为水母的一半，种子化模拟里三个阶段的平均高度比愿意停留的高度高 4–10 pt，不贴着泳线）。竖直阻力保持 1（扫描里它几乎不起作用）
        case .manta: return SwimProfile(period: 1.35, thrustX: 0.6, thrustY: 0.5, sink: 0.5, dragX: 0.5)
        // 鲸鲨：平稳的大个子——纵向最平（竖直冲量 0.3、下沉 0.4：最大纵向速度只有水母的约 0.3 倍，比蝠鲼与小锤头鲨都小，侧视时上下起伏最容易被看见，所以压得最低），
        // 水平冲量 0.6 配横向阻力 0.65（平均速度约水母的 0.8–0.9 倍：比小锤头鲨慢、与蝠鲼同样从容）；周期不变——尾鳍按常规节奏摆，不像蝠鲼那样放慢拍翼、加长滑行。
        // 30 个种子 × 三个阶段的模拟全部满足通用判据；平均高度比愿意停留的高度高约 2–10 pt（不贴着泳线）。
        case .whaleshark: return SwimProfile(thrustX: 0.6, thrustY: 0.3, sink: 0.4, dragX: 0.65)
        // 海龟：慢而稳——前鳍拍得从容（周期 1.25 倍，没有蝠鲼放得那么慢），水平冲量 0.7 配横向阻力 0.7（平均速度约水母的 0.76–0.81 倍，五种里最慢：
        // 比蝠鲼略慢、比鲸鲨与小锤头鲨都慢）；竖直冲量 0.4 配下沉 0.4（最大纵向速度不到水母的 0.4 倍：侧视时上下起伏最容易被看见，所以压得很平，
        // 比蝠鲼稳，只比鲸鲨多一点点浮动——龟划水时本来就有一点上下起伏）。30 个种子 × 三个阶段的模拟全部满足通用判据，
        // 平均高度比愿意停留的高度高约 5–11 pt（不贴着泳线）。系数来自 /tmp 里的网格扫描（周期 1.2–1.35 × 冲量/阻力/下沉各 5 档、按“竖直冲量 ÷ （周期 × 下沉）”筛选平衡），再在种子 42 上复核。
        case .turtle: return SwimProfile(period: 1.25, thrustX: 0.7, thrustY: 0.4, sink: 0.4, dragX: 0.7)
        }
    }
}

extension JellyTuning {
    /// 某阶段、某物种的游动调参：实际生效的物种是水母（含动物不可用而回退）时与 forStage(_:) 完全相同。
    static func forStage(_ stage: CountdownStage, species: JellySpecies) -> JellyTuning {
        forStage(stage, profile: species.effective.swimProfile)
    }

    /// 把一组系数乘到某阶段的水母调参上（愿意停留的高度 hover 不乘）；系数全是 1 时与 forStage(_:) 完全相同。
    /// 单独成函数是为了自测能用合成的系数逐项核对“六项各乘各的”——目前真实动物只有两三项不是 1。
    static func forStage(_ stage: CountdownStage, profile: SwimProfile) -> JellyTuning {
        var tuning = forStage(stage)
        tuning.period *= profile.period
        tuning.thrustX *= profile.thrustX
        tuning.thrustY *= profile.thrustY
        tuning.sink *= profile.sink
        tuning.dragX *= profile.dragX
        tuning.dragY *= profile.dragY
        return tuning
    }
}

// MARK: - 动物的姿态（朝向、俯仰、划水包络）

/// 动物每一帧的姿态（纯逻辑）：朝向与转身、俯仰、划水包络。位置与速度仍由 JellySwim 决定（窗口跟着它移动），这里只把速度变成“身体怎么摆”：
///  · 朝向有迟滞：横向速度要超过 deadband 才改变目标朝向，慢到几乎停下时保持原来的朝向（不会原地抖着翻面）；转身用 0.3 秒的线性水平缩放，途中是侧着的窄身；
///  · 俯仰随纵向速度：atan2(vy, max(|vx|, 30))，夹在 ±0.35 弧度，符号只由 vy 决定（鼻子朝上为正），再低通，免得每次脉动都点头；
///  · 划水包络 0…1：游动时升到 1，停下后平滑落回 0（尾鳍与胸鳍摆动幅度乘它），落回 0 之前仍需要动画帧；
///  · 减少动态效果：朝向立即切换、不俯仰、不划水（静止的身体）。
struct SpeciesPose: Equatable {
    static let turnTime: CGFloat = 0.3          // 完整转身（−1 ↔ +1）所需时间
    static let deadband: CGFloat = 12           // 横向速度（点/秒）小于等于它不改变朝向
    static let pitchLimit: CGFloat = 0.35       // 约 20°
    static let pitchFloor: CGFloat = 30         // 俯仰公式里横向速度的下限，避免静止时微小的纵向速度把身体立起来
    static let pitchRate: CGFloat = 8           // 俯仰跟随目标的速率（1/秒）
    static let envelopeRate: CGFloat = 5        // 划水包络起落的速率（1/秒）
    static let settledEnvelope: CGFloat = 0.01
    static let settledPitch: CGFloat = 0.003

    /// 水平缩放：+1 朝右、−1 朝左，转身途中是中间值（0 时正侧着）。
    var facing: CGFloat = 1
    /// 目标朝向（±1）。
    var heading: CGFloat = 1
    var pitch: CGFloat = 0
    var envelope: CGFloat = 0

    /// 俯仰目标：非有限的速度当作 0；结果夹在 ±pitchLimit。
    static func targetPitch(vx: CGFloat, vy: CGFloat) -> CGFloat {
        guard vx.isFinite, vy.isFinite else { return 0 }
        let raw = atan2(vy, max(abs(vx), pitchFloor))
        return max(-pitchLimit, min(pitchLimit, raw))
    }

    /// 带迟滞的朝向目标：横向速度超过 deadband 才改变；非有限的速度（NaN、无穷）不是有效数据，保持原样。
    static func heading(after current: CGFloat, vx: CGFloat) -> CGFloat {
        guard vx.isFinite else { return current }
        if vx > deadband { return 1 }
        if vx < -deadband { return -1 }
        return current
    }

    /// 推进一帧。stroking 表示正在游动（想休息或停下时为 false）；dt 不是正的有限数时不动。
    mutating func step(dt: CGFloat, vx: CGFloat, vy: CGFloat, stroking: Bool, reduceMotion: Bool) {
        guard dt.isFinite, dt > 0 else { return }
        heading = SpeciesPose.heading(after: heading, vx: vx)
        if reduceMotion {
            facing = heading; pitch = 0; envelope = 0
            return
        }
        let flip = dt * 2 / SpeciesPose.turnTime
        if facing < heading { facing = min(heading, facing + flip) } else if facing > heading { facing = max(heading, facing - flip) }
        let blend = min(1, dt * SpeciesPose.pitchRate)
        pitch += (SpeciesPose.targetPitch(vx: vx, vy: vy) - pitch) * blend
        let rate = min(1, dt * SpeciesPose.envelopeRate)
        envelope += ((stroking ? 1 : 0) - envelope) * rate
    }

    /// 划水相位 −1…1：收缩量 0…1（JellySwim.contraction）的 0.5 为中位；停下时包络为 0，尾鳍回到中位。
    func wave(contraction: CGFloat) -> CGFloat {
        guard contraction.isFinite else { return 0 }
        let value = max(-1, min(1, (contraction - 0.5) * 2)) * envelope
        return value == 0 ? 0 : value      // 把 −0 归一为 +0：包络为 0 时 (−1)×0 是 −0，诊断读数会显示 “-0.000”
    }

    /// 不再需要动画帧：包络落回 0、俯仰回正、转身完成。
    var settled: Bool { envelope < SpeciesPose.settledEnvelope && abs(pitch) < SpeciesPose.settledPitch && facing == heading }
}
