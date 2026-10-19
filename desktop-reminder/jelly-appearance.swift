import Foundation

// 桌面水母的外观：纯数据与解析，只依赖 Foundation，可由 companion-selftest.swift 单独编译验证。
// Chrome 是设置所有者：下发的永远是具体值（见 js/jelly-appearance.js），原生端只解析、不做随机、不另存。
// 解析走白名单：未知字段或越界值回到默认，永不失败（外观不对不能让水母消失）。
struct JellyAppearance: Equatable {
    enum Look: String, CaseIterable { case solid, duo, blend, rainbow }
    enum Material: String, CaseIterable { case glass, gummy, plush, wire, pencil, pixel }
    enum Size: String, CaseIterable { case small, medium, large }

    static let colorCount = 8
    static let defaultColor = 5
    static let seasons: Set<String> = ["spring-festival", "lantern", "dragon-boat", "mid-autumn", "halloween", "christmas"]

    /// 8 色，**色相顺序**与首页 JellyfishSkin.PALETTE 一致（红、橙、黄、绿、薄荷、冰蓝、紫、洋红）；数值是桌面专用的
    /// （半透明叠在未知壁纸上，须以真实截图校准）。色位 5 必须恰好是现有的平静色 (0.40, 0.74, 0.90)：默认外观才逐像素不变。
    static let palette: [(r: Double, g: Double, b: Double)] = [
        (1.00, 0.45, 0.42),   // 0 红
        (1.00, 0.62, 0.30),   // 1 橙
        (0.96, 0.82, 0.32),   // 2 黄
        (0.42, 0.82, 0.48),   // 3 绿
        (0.36, 0.84, 0.70),   // 4 薄荷
        (0.40, 0.74, 0.90),   // 5 冰蓝（= 平静色）
        (0.66, 0.50, 0.95),   // 6 紫
        (0.93, 0.46, 0.80),   // 7 洋红
    ]

    var colors: [Int]          // 1…3 个色位，第一个是主色；个数与花纹匹配（solid ≥1，duo/blend ≥2，rainbow ≥3）
    var look: Look
    var material: Material
    var size: Size
    var season: String?
    var species: JellySpecies = .jelly      // 物种（见 jelly-species.swift）：只改“画谁”，颜色、花纹、材质照常适用
    /// 动物画成写实风格（marine-rig.swift 的骨架，与水族馆同一份数据）：只对有骨架的动物有效，水母没有；写实动物用自己的自然体色，
    /// 颜色与花纹只管水母和卡通动物。原生端的缺省是 false（旧版本的 Chrome 不下发这个字段，组件照旧画卡通），只有明确的 true 才写实。
    var realistic: Bool = false

    static let `default` = JellyAppearance(colors: [defaultColor], look: .solid, material: .glass, size: .medium, season: nil, species: .jelly, realistic: false)

    /// JSON 里的布尔会以 NSNumber 到达，直接按数字读会把 true 当成 1；这里先识别出来。
    private static func isBoolean(_ value: Any) -> Bool {
        CFGetTypeID(value as AnyObject) == CFBooleanGetTypeID()
    }

    /// 色位：必须是 0…7 的整数（不接受布尔、小数、字符串）。
    private static func slot(_ value: Any?) -> Int? {
        guard let value = value, !isBoolean(value), let number = JellyModel.number(value), number.isFinite,
              number == number.rounded(), number >= 0, number < Double(colorCount) else { return nil }
        return Int(number)
    }

    static func parse(_ raw: Any?) -> JellyAppearance {
        guard let object = raw as? [String: Any] else { return .default }
        var colors: [Int] = []
        if let list = object["colors"] as? [Any], (1...3).contains(list.count) {
            let parsed = list.compactMap { slot($0) }
            if parsed.count == list.count { colors = parsed }      // 任何一个越界就整体丢弃，回到 [color]
        }
        if colors.isEmpty { colors = [slot(object["color"]) ?? defaultColor] }
        var look = Look(rawValue: object["look"] as? String ?? "") ?? .solid
        let needed = look == .rainbow ? 3 : (look == .solid ? 1 : 2)
        if colors.count < needed { look = .solid; colors = [colors[0]] }     // 花纹要的颜色不够：退回纯色，不用猜
        let season = (object["season"] as? String).flatMap { seasons.contains($0) ? $0 : nil }
        return JellyAppearance(colors: colors, look: look,
                               material: Material(rawValue: object["material"] as? String ?? "") ?? .glass,
                               size: Size(rawValue: object["size"] as? String ?? "") ?? .medium, season: season,
                               species: JellySpecies.parse(object["species"]),
                               realistic: object["realistic"].map { isBoolean($0) && ($0 as? Bool) == true } ?? false)
    }

    /// 色相（度，0…360），用来在自测里核对调色板与首页调色板的色相顺序一致。
    static func hue(_ rgb: (r: Double, g: Double, b: Double)) -> Double {
        let high = max(rgb.r, rgb.g, rgb.b), low = min(rgb.r, rgb.g, rgb.b), span = high - low
        guard span > 0 else { return 0 }
        var degrees: Double
        if high == rgb.r { degrees = 60 * ((rgb.g - rgb.b) / span).truncatingRemainder(dividingBy: 6) }
        else if high == rgb.g { degrees = 60 * ((rgb.b - rgb.r) / span + 2) }
        else { degrees = 60 * ((rgb.r - rgb.g) / span + 4) }
        if degrees < 0 { degrees += 360 }
        return degrees
    }
}
