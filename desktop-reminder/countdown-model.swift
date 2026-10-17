import Foundation
import CoreGraphics

// 倒计时与夜晚荧光的纯逻辑：阶段、文案、夜晚曲线、光晕几何。只依赖 Foundation，可由 companion-selftest.swift 单独编译验证。
// （协议 v6 取消了胶囊与进度环，倒计时只作为水母身上的一条气泡文字，所以这里不再有进度环比例与迷你布局。）
enum CountdownStage: Int, Comparable {
    case calm, soon, imminent, final, due
    static func < (a: CountdownStage, b: CountdownStage) -> Bool { a.rawValue < b.rawValue }
}

enum CountdownModel {
    static func stage(seconds: Int) -> CountdownStage {
        if seconds <= 0 { return .due }
        if seconds <= 10 { return .final }
        if seconds <= 60 { return .imminent }
        if seconds <= 600 { return .soon }
        return .calm
    }

    static func clock(seconds: Int) -> String {
        if seconds >= 86400 {
            return "\(seconds / 86400)天 " + String(format: "%02d:%02d", (seconds % 86400) / 3600, (seconds % 3600) / 60)
        } else if seconds >= 3600 {
            return String(format: "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
        }
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    /// 夜晚荧光程度 0…1：hour 是本地小时（可带小数）。20:00—次日 06:00 为 1，19—20 点与 6—7 点平滑渐变，白天为 0。
    /// 与首页水母的 JellyfishCore.nightAmount 同一条曲线（两边各自有测试）；非有限数按白天。
    static func nightAmount(hour: Double) -> Double {
        guard hour.isFinite else { return 0 }
        var day = hour.truncatingRemainder(dividingBy: 24)
        if day < 0 { day += 24 }
        let t = day < 12 ? day + 24 : day
        func smooth(_ k: Double) -> Double { let c = min(1, max(0, k)); return c * c * (3 - 2 * c) }
        if t <= 19 { return 0 }
        if t < 20 { return smooth(t - 19) }
        if t <= 30 { return 1 }
        if t < 31 { return 1 - smooth(t - 30) }
        return 0
    }

    /// 夜晚光晕的半径：不能超过中心到窗口任一边的距离减去边距（外圈留出完全透明的一圈），否则光晕在透明窗口边缘被硬截断，看起来像一个方框。
    static func glowRadius(width: CGFloat, height: CGFloat, centerX: CGFloat, centerY: CGFloat, margin: CGFloat = 8) -> CGFloat {
        max(0, min(centerX, width - centerX, centerY, height - centerY) - margin)
    }

    /// 光晕的径向衰减（t 为 0 在中心、1 在边缘）：中心为 1、边缘为 0，且边缘处斜率也是 0（平滑到底），没有可见的轮廓。
    static func glowProfile(_ t: Double) -> Double {
        let c = min(1, max(0, t))
        let s = c * c * (3 - 2 * c)
        return (1 - s) * (1 - s)
    }

    static func localHour(_ date: Date, calendar: Calendar = .current) -> Double {
        let parts = calendar.dateComponents([.hour, .minute, .second], from: date)
        return Double(parts.hour ?? 12) + Double(parts.minute ?? 0) / 60 + Double(parts.second ?? 0) / 3600
    }

    /// 水母“报时”用的口语说法。
    static func spoken(seconds: Int) -> String {
        if seconds <= 0 { return "时间到啦" }
        if seconds >= 86400 { return "还有 \(seconds / 86400) 天 \((seconds % 86400) / 3600) 小时" }
        if seconds >= 3600 { return "还有 \(seconds / 3600) 小时 \((seconds % 3600) / 60) 分" }
        if seconds >= 120 { return "还有 \(seconds / 60) 分钟" }
        if seconds >= 60 { return "还有 1 分 \(seconds % 60) 秒" }
        return "还有 \(seconds) 秒"
    }
}
