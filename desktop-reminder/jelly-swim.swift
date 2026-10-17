import Foundation
import CoreGraphics

// 桌面小伙伴（水母）的游动物理。只依赖 Foundation，无 AppKit，可单独编译并自测。
// 坐标：x 为全局横坐标（水母中心），y 为离“游泳线”（屏幕可见区底边）的高度，向上为正。
struct JellyTuning {
    var period: CGFloat   // 一次脉动的秒数
    var thrustX: CGFloat  // 每次脉动水平冲量（点/秒）
    var thrustY: CGFloat  // 每次脉动向上冲量
    var hover: CGFloat    // 愿意停留的高度

    static func forStage(_ stage: CountdownStage) -> JellyTuning {
        switch stage {
        // thrustY 按“平均上升 ≈ 平均下沉”标定：J ≈ 1.4 · sink·T / (1 − e^(−dragY·T))，周期越短冲量越小，
        // 否则越临近越兴奋的水母会一路升到顶（首页水母曾因此贴到屏幕顶端）。
        case .calm: return JellyTuning(period: 2.4, thrustX: 40, thrustY: 62, hover: 12)
        case .soon: return JellyTuning(period: 1.8, thrustX: 52, thrustY: 49, hover: 14)
        case .imminent: return JellyTuning(period: 1.0, thrustX: 70, thrustY: 34, hover: 20)
        case .final: return JellyTuning(period: 0.7, thrustX: 40, thrustY: 28, hover: 24)
        case .due: return JellyTuning(period: 0.5, thrustX: 0, thrustY: 25, hover: 28)
        }
    }
}

/// 一次定时的“冲刺”：从当前位置按三次缓动游到目标，时长随距离在 0.7–1.4 秒之间。
/// 位置完全由缓动决定（不走水母平时的推力物理），速度只用于倾斜与触手拖尾（已限幅）。
struct JellyDash: Equatable {
    static let pulsePeriod: CGFloat = 0.5        // 冲刺时钟罩的收缩节奏
    static let maxVisualSpeed: CGFloat = 320
    var fromX: CGFloat
    var fromY: CGFloat
    var toX: CGFloat
    var toY: CGFloat
    var duration: CGFloat
    var elapsed: CGFloat = 0

    static func duration(distance: CGFloat) -> CGFloat { 0.7 + min(0.7, max(0, distance) / 1200 * 0.7) }

    /// 三次缓入缓出：两端速度为 0、中点最快。
    static func ease(_ u: CGFloat) -> CGFloat {
        let c = min(1, max(0, u))
        if c < 0.5 { return 4 * c * c * c }
        let k = -2 * c + 2
        return 1 - k * k * k / 2
    }
    /// ease 对 u 的导数。
    static func slope(_ u: CGFloat) -> CGFloat {
        let c = min(1, max(0, u))
        return c < 0.5 ? 12 * c * c : 12 * (1 - c) * (1 - c)
    }

    var progress: CGFloat { duration <= 0 ? 1 : min(1, elapsed / duration) }
    /// 水平路程越长，轻轻拱起的弧越高（最多 18 点）；起点与终点都在原高度上。
    var arc: CGFloat { min(18, abs(toX - fromX) * 0.03) }

    func position(at u: CGFloat) -> (x: CGFloat, y: CGFloat) {
        let e = JellyDash.ease(u)
        return (fromX + (toX - fromX) * e, fromY + (toY - fromY) * e + arc * sin(min(1, max(0, u)) * .pi))
    }
}

/// 响铃气泡的动效曲线（纯函数，AppKit 绘制时调用）：气泡弹出、涟漪。数值是初始取值，须以真实截图校准。
enum JellyRingMotion {
    static let popDuration: CGFloat = 0.32
    static let rippleCount = 3
    static let ripplePeriod: CGFloat = 2.2       // 每圈从出发到消失
    static let rippleSpacing: CGFloat = 0.73     // 相邻两圈出发的间隔（≈ 周期 / 3）
    static let rippleInner: CGFloat = 20
    static let rippleOuter: CGFloat = 62         // 钟罩中心到窗口底边约 78，62 的圈不会碰到窗口边缘
    static let rippleAlpha: CGFloat = 0.55

    /// 弹出缩放：0.82 起，带一点过冲（easeOutBack），0.32 秒到 1。age 越界夹紧。
    static func popScale(age: CGFloat) -> CGFloat {
        let t = min(1, max(0, age / popDuration))
        let c1: CGFloat = 1.70158, c3 = c1 + 1
        let back = 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)
        return 0.82 + 0.18 * back
    }
    static func popAlpha(age: CGFloat) -> CGFloat { min(1, max(0, age / popDuration * 2.5)) }
    /// 按钮是真控件，不能跟着气泡缩放，所以等气泡几乎到位（弹出的后 45%）才淡入。
    static func buttonAlpha(age: CGFloat) -> CGFloat {
        guard age < popDuration else { return 1 }      // 弹出结束即完全不透明（避免 0.9999999999999999 这样的浮点尾巴）
        return min(1, max(0, (age / popDuration - 0.55) / 0.45))
    }

    /// 当前可见的涟漪（半径、透明度）：第 i 圈比前一圈晚 rippleSpacing 秒出发，每圈 ripplePeriod 秒从 inner 扩到 outer，
    /// 透明度 0.55 → 0（二次衰减）。减少动态效果时固定画两圈静止的（0.30 / 0.18），与时间无关。
    static func ripples(time: CGFloat, reduceMotion: Bool) -> [(radius: CGFloat, alpha: CGFloat)] {
        if reduceMotion {
            return [(rippleInner + (rippleOuter - rippleInner) * 0.35, 0.30), (rippleInner + (rippleOuter - rippleInner) * 0.75, 0.18)]
        }
        var rings: [(radius: CGFloat, alpha: CGFloat)] = []
        for i in 0..<rippleCount {
            let local = time - CGFloat(i) * rippleSpacing
            guard local >= 0 else { continue }
            let u = local.truncatingRemainder(dividingBy: ripplePeriod) / ripplePeriod
            rings.append((rippleInner + (rippleOuter - rippleInner) * u, rippleAlpha * (1 - u) * (1 - u)))
        }
        return rings
    }
}

struct JellySwim {
    enum Mode { case rest, swim, grabbed }

    static let maxLift: CGFloat = 80
    static let sink: CGFloat = 18        // 游动时缓慢下沉（终端速度 ≈ sink / dragY）
    static let restSink: CGFloat = 40    // 想休息时沉得快些
    static let highSink: CGFloat = 120   // 高于高度上限（被抛高）时快速落回
    static let dragX: CGFloat = 1.2
    static let dragY: CGFloat = 1.4
    static let edgeMargin: CGFloat = 90

    var mode: Mode = .rest
    var x: CGFloat = 0
    var y: CGFloat = 0
    var vx: CGFloat = 0
    var vy: CGFloat = 0
    var facing: CGFloat = 1
    var phase: CGFloat = 0
    var squash: CGFloat = 0
    var squashV: CGFloat = 0
    var tuning = JellyTuning.forStage(.soon)
    var wantsRest = true
    var lo: CGFloat = 0
    var hi: CGFloat = 1000
    /// 本步刚触地（控制器可据此做点反馈）。
    var landed = false
    /// 本步刚完成一次脉动推力。
    var pulsed = false
    /// 正在进行的冲刺（响铃时游到落点、响铃后游回或游走）；有它时位置由缓动决定，不走平时的推力物理。
    var dash: JellyDash?
    /// 冲刺刚走完（控制器读到后自行清零，step 不会重置它）。
    var dashEnded = false

    /// 垂直方向的推力缩放：高于愿意停留的高度越多越弱（首页水母曾因缺少这项一路游到顶端）。
    static func thrustScale(y: CGFloat, hover: CGFloat) -> CGFloat {
        max(0.12, min(1, 1 - (y - hover) / 28))
    }

    /// 脉动的外观收缩量 0…1：快速收缩、缓慢舒张（p 为 0…1 的脉动相位）。
    static func contraction(atPhase p: CGFloat) -> CGFloat {
        if p < 0.28 { let t = p / 0.28; return sin(t * .pi / 2) }
        let t = (p - 0.28) / 0.72
        let s = 1 - t
        return s * s * s
    }

    var contraction: CGFloat {
        guard mode != .rest else { return 0 }
        return JellySwim.contraction(atPhase: phase)
    }

    var settled: Bool {
        mode == .rest && abs(squash) < 0.01 && abs(squashV) < 0.05
    }

    mutating func wake() {
        guard mode == .rest else { return }
        mode = .swim
        phase = 0.9
        wantsRest = false
    }

    mutating func poke() {
        squashV += 11
        if mode == .rest { vy = 70; mode = .swim; phase = 0.2 }
        else { vy += 90 }
    }

    mutating func setBounds(lo: CGFloat, hi: CGFloat) {
        self.lo = lo; self.hi = max(lo, hi)
        x = max(self.lo, min(x, self.hi))
    }

    /// 被抓住：位置由指针决定，速度做低通以便触手拖尾。
    mutating func hold(x nx: CGFloat, y ny: CGFloat, dt: CGFloat) {
        mode = .grabbed
        dash = nil      // 被抓住就取消冲刺；不置 dashEnded（没有“到位”）
        if dt > 0 {
            vx = vx * 0.7 + max(-600, min(600, (nx - x) / dt)) * 0.3
            vy = vy * 0.7 + max(-600, min(600, (ny - y) / dt)) * 0.3
        }
        x = nx; y = ny
    }

    /// 开始一次冲刺：从当前位置游到泳线上的 tx（夹在可游范围内）。距离不足 1 点时直接到位并置 dashEnded。被抓着时不能开始。
    mutating func startDash(toX tx: CGFloat, toY ty: CGFloat = 0) {
        guard mode != .grabbed else { return }
        let target = max(lo, min(tx, hi))
        let distance = hypot(target - x, ty - y)
        vx = 0; vy = 0
        guard distance > 1 else {
            x = target; y = ty
            dash = nil; dashEnded = true
            mode = wantsRest && ty <= 0 ? .rest : .swim
            return
        }
        dash = JellyDash(fromX: x, fromY: y, toX: target, toY: ty, duration: JellyDash.duration(distance: distance))
        dashEnded = false
        mode = .swim
        phase = 0
        if abs(target - x) > 1 { facing = target > x ? 1 : -1 }
    }

    mutating func release() {
        guard mode == .grabbed else { return }
        vx = max(-260, min(260, vx)); vy = max(-260, min(260, vy))
        mode = .swim
        if abs(vx) > 5 { facing = vx > 0 ? 1 : -1 }
    }

    mutating func step(dt: CGFloat, random: () -> CGFloat) {
        landed = false; pulsed = false
        // 弹簧形变（触地/被戳）
        squashV += (-180 * squash - 14 * squashV) * dt
        squash += squashV * dt
        if var d = dash {
            d.elapsed += dt
            let u = d.progress
            let pos = d.position(at: u)
            x = pos.x; y = pos.y
            let dx = d.toX - d.fromX
            let speed = d.duration > 0 ? dx * JellyDash.slope(u) / d.duration : 0
            vx = max(-JellyDash.maxVisualSpeed, min(JellyDash.maxVisualSpeed, speed)); vy = 0
            phase += dt / JellyDash.pulsePeriod
            if phase >= 1 { phase -= floor(phase); pulsed = true }
            if u >= 1 {
                x = d.toX; y = d.toY; vx = 0; vy = 0
                dash = nil; dashEnded = true
                mode = wantsRest && d.toY <= 0 ? .rest : .swim
                if d.toY <= 0 { squashV += 8; landed = true }
            } else {
                dash = d
            }
            return
        }
        guard mode == .swim else { return }

        if !wantsRest {
            phase += dt / tuning.period
            if phase >= 1 {
                phase -= floor(phase)
                pulsed = true
                if x < lo + JellySwim.edgeMargin { facing = 1 }
                else if x > hi - JellySwim.edgeMargin { facing = -1 }
                else if random() < 0.12 { facing = -facing }
                let scale = JellySwim.thrustScale(y: y, hover: tuning.hover)
                vx += facing * tuning.thrustX * (0.65 + 0.35 * random())
                vy += tuning.thrustY * scale * (0.85 + 0.15 * random())
            }
        }
        vy -= (wantsRest ? JellySwim.restSink : JellySwim.sink) * dt
        if y > JellySwim.maxLift { vy -= JellySwim.highSink * dt }
        vx *= exp(-JellySwim.dragX * dt)
        vy *= exp(-JellySwim.dragY * dt)
        x += vx * dt
        y += vy * dt

        if x < lo { x = lo; vx = abs(vx) * 0.4; facing = 1 }
        if x > hi { x = hi; vx = -abs(vx) * 0.4; facing = -1 }
        if y > JellySwim.maxLift && vy > 0 && !wantsRest { vy = 0 }
        if y <= 0 {
            let impact = -vy
            y = 0
            if impact > 30 { squashV += min(16, impact * 0.1); landed = true }
            vy = impact > 40 ? impact * 0.25 : 0
            if wantsRest && vy == 0 && abs(vx) < 6 {
                vx = 0; mode = .rest; landed = true
            }
        }
        if wantsRest && y <= 0.5 && abs(vy) < 8 && abs(vx) < 6 { vx = 0; vy = 0; y = 0; mode = .rest }
    }
}
