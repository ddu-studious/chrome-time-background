import Foundation
import CoreGraphics

// 水母的颜料（纯逻辑，不依赖 AppKit，所以 companion-selftest.swift 能直接测数值）：
//  · JellyTint：一个 RGB 颜色（0…1）、阶段色与夜晚色，以及两色之间的线性插值；
//  · JellyPaint：由外观的 1…3 个色位 + 花纹得到的“各部位颜色”（钟罩主色/第二色/第三色、触手、口腕、描边），随阶段与夜晚平滑过渡。
// 转成 NSColor 的绘制用法（JellyTint.color）在 jelly-companion.swift 的扩展里；各材质的画法在 jelly-materials.swift。
// 花纹语义与首页 js/jellyfish.js 的 paintOf / tentacleTone、设置页示意图 js/settings-jelly-appearance.js 的 paintOf 一致，
// test/desktop-companion-logic.test.mjs 用同一批外观逐个部位对照数值（Swift 自测打印 PAINT 行，Node 与 JS 比较）。

struct JellyTint: Equatable {
    var r: CGFloat, g: CGFloat, b: CGFloat

    /// 平静色 = 外观调色板的默认色位（冰蓝）；数值只在 JellyAppearance.palette 里写一份，默认外观才与重构前逐像素一致。
    static let calm: JellyTint = { let rgb = JellyAppearance.palette[JellyAppearance.defaultColor]; return JellyTint(r: CGFloat(rgb.r), g: CGFloat(rgb.g), b: CGFloat(rgb.b)) }()
    static let soon = JellyTint(r: 0.98, g: 0.76, b: 0.42)
    static let imminent = JellyTint(r: 1.0, g: 0.56, b: 0.46)
    static let final = JellyTint(r: 1.0, g: 0.40, b: 0.50)
    static let due = JellyTint(r: 1.0, g: 0.85, b: 0.45)
    static let nightBlue = JellyTint(r: 0.38, g: 0.52, b: 1.0)       // 夜晚荧光：把阶段颜色略推向深海蓝紫

    static func forStage(_ stage: CountdownStage) -> JellyTint {
        switch stage {
        case .calm: return .calm
        case .soon: return .soon
        case .imminent: return .imminent
        case .final: return .final
        case .due: return .due
        }
    }

    func mixed(toward other: JellyTint, _ t: CGFloat) -> JellyTint {
        JellyTint(r: r + (other.r - r) * t, g: g + (other.g - g) * t, b: b + (other.b - b) * t)
    }
}

/// 一只水母的“颜料”：由外观的 1…3 个色位和花纹得到，三个 JellyTint 随阶段/夜晚各自平滑变化。
struct JellyPaint: Equatable {
    var kind: JellyAppearance.Look
    var a: JellyTint
    var b: JellyTint
    var c: JellyTint

    static func solid(_ tint: JellyTint) -> JellyPaint { JellyPaint(kind: .solid, a: tint, b: tint, c: tint) }

    static func tint(slot: Int) -> JellyTint {
        let rgb = JellyAppearance.palette[max(0, min(JellyAppearance.colorCount - 1, slot))]
        return JellyTint(r: CGFloat(rgb.r), g: CGFloat(rgb.g), b: CGFloat(rgb.b))
    }

    /// 自选外观对应的颜料（calm 阶段使用）。
    static func make(appearance: JellyAppearance) -> JellyPaint {
        let tints = appearance.colors.map { tint(slot: $0) }
        switch appearance.look {
        case .solid: return .solid(tints[0])
        case .duo, .blend: return JellyPaint(kind: appearance.look, a: tints[0], b: tints[1], c: tints[1])
        case .rainbow: return JellyPaint(kind: .rainbow, a: tints[0], b: tints[1], c: tints[2])
        }
    }

    /// 某个阶段的目标颜料：calm 用自选外观；其余阶段整只变成阶段色（倒计时阶段色覆盖自选色）。
    static func target(stage: CountdownStage, appearance: JellyAppearance) -> JellyPaint {
        stage == .calm ? make(appearance: appearance) : .solid(JellyTint.forStage(stage))
    }

    /// 向目标靠近 t（0…1）；花纹种类直接取目标的（颜色在平滑过渡，种类不插值）。
    func mixed(toward other: JellyPaint, _ t: CGFloat) -> JellyPaint {
        JellyPaint(kind: other.kind, a: a.mixed(toward: other.a, t), b: b.mixed(toward: other.b, t), c: c.mixed(toward: other.c, t))
    }

    /// 三个颜色都向同一个颜色靠近（夜晚把阶段色略推向深海蓝紫，只在绘制时用，不污染按阶段渐变的颜料）。
    func mixedAll(toward tint: JellyTint, _ t: CGFloat) -> JellyPaint {
        JellyPaint(kind: kind, a: a.mixed(toward: tint, t), b: b.mixed(toward: tint, t), c: c.mixed(toward: tint, t))
    }

    /// 肢体（触手、鳍、四肢）在位置 u（沿身体长轴，0 = 尾端 → 1 = 头端）处的颜色：纯色一个色；双色一律第二种；
    /// 渐变偏向第二种；彩带沿长轴在三色之间取色。u 夹到 0…1；不是有限数（NaN、无穷）取正中，不外推。
    /// 水母的触手与各种动物的鳍、肢共用这一条规则（设置页示意图的 limbTone 是它的 JS 版，Node 测试逐点对照）。
    func limbTone(u: CGFloat) -> JellyTint {
        let t = u.isFinite ? max(0, min(1, u)) : 0.5
        switch kind {
        case .solid: return a
        case .duo: return b
        case .blend: return a.mixed(toward: b, 0.7)
        case .rainbow: return t < 0.5 ? a.mixed(toward: b, t * 2) : b.mixed(toward: c, (t - 0.5) * 2)
        }
    }

    /// 第 index 根触手（共 count 根）的颜色：等距落在 limbTone 的 0…1 上（只有一根或没有时取正中）。
    func tentacleTone(index: Int, count: Int) -> JellyTint {
        limbTone(u: count > 1 ? CGFloat(index) / CGFloat(count - 1) : 0.5)
    }

    /// 口腕（两条短而粗的）的颜色。
    var oralTone: JellyTint { kind == .solid ? a : b }
    /// 钟罩描边的颜色。
    var outlineTone: JellyTint { kind == .rainbow ? b : a }
}
