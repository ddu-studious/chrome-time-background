import Foundation

// 水母气泡的配色（浅色 / 深色两套）与对比度计算。纯数据，只依赖 Foundation，由 companion-selftest.swift 单独编译验证。
// 所有水母气泡（倒计时读数、点一下的详情、喝水/起身提醒、到点响铃）都按系统外观取其中一套。
// 色值是初始取值，须以真实截图校准；对比度由自测守住（正文 ≥ 4.5:1、大号时间 ≥ 3:1）。

struct JellyRGB: Equatable {
    var r: Double, g: Double, b: Double, a: Double

    init(hex: UInt32, alpha: Double = 1) {
        r = Double((hex >> 16) & 0xFF) / 255
        g = Double((hex >> 8) & 0xFF) / 255
        b = Double(hex & 0xFF) / 255
        a = alpha
    }

    /// 叠在 background 上之后的不透明颜色。
    func composited(over background: JellyRGB) -> JellyRGB {
        var result = JellyRGB(hex: 0)
        result.r = r * a + background.r * (1 - a)
        result.g = g * a + background.g * (1 - a)
        result.b = b * a + background.b * (1 - a)
        result.a = 1
        return result
    }

    /// WCAG 相对亮度（忽略自身透明度，调用方先叠色）。
    var luminance: Double {
        func linear(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}

struct JellyBubblePalette {
    var fillTop: JellyRGB
    var fillBottom: JellyRGB
    var border: JellyRGB
    var clock: JellyRGB
    var title: JellyRGB
    var body: JellyRGB
    var status: JellyRGB            // 同步中等信息色
    var success: JellyRGB           // 喝水气泡里“已记录”的绿色
    var error: JellyRGB
    var ghostFill: JellyRGB         // 次按钮底（半透明，叠在气泡底板上）
    var ghostText: JellyRGB
    var primaryTop: JellyRGB        // 主按钮渐变（两种外观相同）
    var primaryBottom: JellyRGB
    var primaryText: JellyRGB
    var nudgePrimaryText: JellyRGB  // 喝水气泡里系统圆角主按钮的强调字色

    static let light = JellyBubblePalette(
        fillTop: JellyRGB(hex: 0xFFFFFF, alpha: 0.97), fillBottom: JellyRGB(hex: 0xF6FCFE, alpha: 0.94),
        border: JellyRGB(hex: 0xE6B040, alpha: 0.5),
        clock: JellyRGB(hex: 0x16394F), title: JellyRGB(hex: 0x1F4047), body: JellyRGB(hex: 0x3D575E),
        status: JellyRGB(hex: 0x14708A), success: JellyRGB(hex: 0x1D7348), error: JellyRGB(hex: 0xBD3027),
        ghostFill: JellyRGB(hex: 0x1F4047, alpha: 0.09), ghostText: JellyRGB(hex: 0x2C4B52),
        primaryTop: JellyRGB(hex: 0x14809B), primaryBottom: JellyRGB(hex: 0x0B6B86), primaryText: JellyRGB(hex: 0xFFFFFF),
        nudgePrimaryText: JellyRGB(hex: 0x14708A))

    static let dark = JellyBubblePalette(
        fillTop: JellyRGB(hex: 0x303A49, alpha: 0.97), fillBottom: JellyRGB(hex: 0x222936, alpha: 0.96),
        border: JellyRGB(hex: 0xE6B040, alpha: 0.42),
        clock: JellyRGB(hex: 0xF4FBFF), title: JellyRGB(hex: 0xE6F1F4), body: JellyRGB(hex: 0xC3D3D8),
        status: JellyRGB(hex: 0x6FD0E6), success: JellyRGB(hex: 0x7DDBB0), error: JellyRGB(hex: 0xFF9087),
        ghostFill: JellyRGB(hex: 0xFFFFFF, alpha: 0.13), ghostText: JellyRGB(hex: 0xDBE8EC),
        primaryTop: JellyRGB(hex: 0x14809B), primaryBottom: JellyRGB(hex: 0x0B6B86), primaryText: JellyRGB(hex: 0xFFFFFF),
        nudgePrimaryText: JellyRGB(hex: 0x6FD0E6))

    /// text 相对 background（须不透明）的对比度，1…21。
    static func contrast(_ text: JellyRGB, on background: JellyRGB) -> Double {
        let a = text.composited(over: background).luminance, b = background.luminance
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    private static let backdrops = [JellyRGB(hex: 0xFFFFFF), JellyRGB(hex: 0x000000)]

    /// 文字相对半透明底板的最差对比度：桌面背景未知，底板叠在纯白与纯黑上各算一次，渐变两端都算。
    func worstContrast(of text: JellyRGB) -> Double {
        var worst = Double.infinity
        for fill in [fillTop, fillBottom] {
            for backdrop in JellyBubblePalette.backdrops {
                worst = min(worst, JellyBubblePalette.contrast(text, on: fill.composited(over: backdrop)))
            }
        }
        return worst
    }

    /// 次按钮文字相对“次按钮底叠在气泡底板上”的最差对比度。
    func worstGhostContrast() -> Double {
        var worst = Double.infinity
        for fill in [fillTop, fillBottom] {
            for backdrop in JellyBubblePalette.backdrops {
                let bubble = fill.composited(over: backdrop)
                worst = min(worst, JellyBubblePalette.contrast(ghostText, on: ghostFill.composited(over: bubble)))
            }
        }
        return worst
    }

    /// 主按钮白字相对渐变两端的最差对比度。
    func worstPrimaryContrast() -> Double {
        min(JellyBubblePalette.contrast(primaryText, on: primaryTop.composited(over: JellyRGB(hex: 0x000000))),
            JellyBubblePalette.contrast(primaryText, on: primaryBottom.composited(over: JellyRGB(hex: 0x000000))))
    }
}
