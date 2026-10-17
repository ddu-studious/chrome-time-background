import AppKit

// 桌面水母：一只在屏幕底部游动、打盹的小水母。
// 全部用 Core Graphics 自绘，没有外部素材；窗口只比水母大一点，透明处不挡点击。
// 它只显示与互动，不拥有任何业务状态：倒计时、喝水/起身提醒、今天的记录都由 JellyController 拼好气泡交给它，
// 点击、按钮、右键菜单的动作也都交回 JellyController，再由它转给 Chrome 执行。

struct JellyTint {
    var r: CGFloat, g: CGFloat, b: CGFloat
    static let calm = JellyTint(r: 0.40, g: 0.74, b: 0.90)
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
    func color(_ alpha: CGFloat, lighten: CGFloat = 0, darken: CGFloat = 0) -> NSColor {
        NSColor(calibratedRed: min(1, r + (1 - r) * lighten) * (1 - darken),
                green: min(1, g + (1 - g) * lighten) * (1 - darken),
                blue: min(1, b + (1 - b) * lighten) * (1 - darken), alpha: alpha)
    }
}

/// 水母头上的气泡内容。种类决定版式：clock 一行读数；note 操作反馈；detail 点一下看到的详情；nudge 带按钮的喝水/起身提醒；ring 到点响铃。
struct JellyBubble: Equatable {
    enum Kind { case clock, note, detail, nudge, ring }
    struct Button: Equatable {
        var id: String
        var title: String
        var enabled = true
        var primary = false
    }
    var kind: Kind
    var title: String? = nil
    var lines: [String] = []
    var status: String? = nil       // 提醒气泡里的同步状态 / 错误说明，显示在正文与按钮之间
    var bad = false                 // status（或 note 的标题）按错误色显示
    var buttons: [Button] = []
    var alert = false               // clock：临近到点用红色
    var bigClock: String? = nil     // ring：大号时间 "HH:mm"
    var confirm: String? = nil      // ring：确认语；有它时按钮收起，文字画在按钮那一行（bad 决定颜色）
}

/// 气泡的版式：尺寸由文字量出，窗口按需要变宽、变高（只向上、向两侧长，水母本体不动）；绘制与按钮定位共用同一份结果。
enum JellyBubbleLayout {
    static let minY: CGFloat = 104          // 气泡主体下沿；尾巴尖在其下方 5 点，指向钟罩顶
    static let maxTextWidth: CGFloat = 196
    // 气泡到窗口边缘的最小距离：气泡阴影（模糊半径 5、σ≈2.5）在到达窗口边缘之前衰减完，窗口边缘不会露出方框。
    // 验收脚本核对窗口最外 8 点的 alpha ≤ 1：该圈最里一列离气泡 edge-8 点，12 时只有 4 点，阴影尾巴实测 1–2（偶尔 2），14 时 6 点，≈0。
    static let edge: CGFloat = 14
    /// 响铃气泡的阴影更大、气泡更宽，边距另算（JellyRingLayout.edge）；其余气泡仍是 14。
    static func edge(for kind: JellyBubble.Kind) -> CGFloat { kind == .ring ? JellyRingLayout.edge : edge }
    static let hPad: CGFloat = 11
    static let gap: CGFloat = 4              // 标题、正文、状态之间
    static let buttonGap: CGFloat = 8        // 按钮与它上方内容之间
    static let buttonHeight: CGFloat = 22
    static let titleFont = NSFont.systemFont(ofSize: 11.5, weight: .semibold)
    static let lineFont = NSFont.systemFont(ofSize: 11)
    static let statusFont = NSFont.systemFont(ofSize: 10.5, weight: .medium)
    static let clockFont = NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .semibold)

    static func style(_ lineBreak: NSLineBreakMode) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = lineBreak
        style.alignment = .center
        return style
    }
    static func attributes(_ font: NSFont, color: NSColor, lineBreak: NSLineBreakMode = .byWordWrapping) -> [NSAttributedString.Key: Any] {
        [.font: font, .foregroundColor: color, .paragraphStyle: style(lineBreak)]
    }
    /// 一行的排版高度：中文会回退到别的字体，行高比字体自身的 ascender/descender 之和大（11 点实测 14 对 13），
    /// 所以取真实排版一个汉字的高度，而不是字体度量。
    static func lineHeight(_ font: NSFont) -> CGFloat {
        ceil(("国" as NSString).boundingRect(with: NSSize(width: 1000, height: 1000), options: [.usesLineFragmentOrigin], attributes: attributes(font, color: .black)).height)
    }

    /// 文字在最大宽度内排版后的尺寸；maxLines 限制行数（超出的在绘制时截断）。
    /// 每一行都放得下时宽度取“最长一行的自然宽度 + 4 点余量”，否则取满最大宽度：绘制用的就是这个宽度，
    /// 余量吸收排版与绘制之间的取整误差（否则刚好卡边的一行会在绘制时被挤成两行、末尾被截成省略号）。
    static func measure(_ text: String, font: NSFont, width: CGFloat, maxLines: Int? = nil) -> NSSize {
        let natural = text.components(separatedBy: "\n").map { ($0 as NSString).size(withAttributes: [.font: font]).width }.max() ?? 0
        let boxWidth = natural + 4 <= width ? ceil(natural) + 4 : width
        // 选项与绘制保持一致（不带 usesFontLeading，否则量出的行高比绘制时小，末行会被判定放不下）
        let box = (text as NSString).boundingRect(with: NSSize(width: boxWidth, height: 10_000), options: [.usesLineFragmentOrigin], attributes: attributes(font, color: .black))
        var height = ceil(box.height)
        if let maxLines = maxLines { height = min(height, lineHeight(font) * CGFloat(maxLines)) }
        return NSSize(width: boxWidth, height: height)
    }

    struct Frame {
        var rect: NSRect
        var tailX: CGFloat
        var title: NSRect
        var text: NSRect
        var status: NSRect
        var buttons: [NSRect]
        // 以下只有响铃气泡用（带默认值，其余气泡的 Frame(...) 调用不受影响）
        var clock = NSRect.zero
        var lines: [NSRect] = []
        var slot = NSRect.zero      // 按钮那一行的整条位置：确认语画在这里
    }

    private struct Metrics {
        var size: NSSize
        var title: NSSize
        var text: NSSize
        var status: NSSize
        var buttons: [NSSize]
    }

    private static func metrics(_ bubble: JellyBubble) -> Metrics {
        if bubble.kind == .clock {
            let line = bubble.lines.first ?? ""
            let size = (line as NSString).size(withAttributes: [.font: clockFont])
            return Metrics(size: NSSize(width: max(60, ceil(size.width) + 22), height: 25), title: .zero, text: size, status: .zero, buttons: [])
        }
        let title = bubble.title.map { measure($0, font: titleFont, width: maxTextWidth, maxLines: 1) } ?? .zero
        let body = bubble.lines.joined(separator: "\n")
        let text = body.isEmpty ? NSSize.zero : measure(body, font: lineFont, width: maxTextWidth, maxLines: bubble.kind == .nudge ? 4 : 6)
        let status = bubble.status.map { measure($0, font: statusFont, width: maxTextWidth, maxLines: 2) } ?? .zero
        let buttons = bubble.buttons.map { NSSize(width: max(64, ceil(($0.title as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 11, weight: .medium)]).width) + 28), height: buttonHeight) }
        let row = buttons.reduce(0) { $0 + $1.width } + CGFloat(max(0, buttons.count - 1)) * 8
        let content = max(title.width, text.width, status.width, row)
        var height: CGFloat = 8 + 9
        var above = false      // 上方（标题、正文、状态）是否已有内容：有才需要与下面一项隔开
        for (part, isButtons) in [(title.height, false), (text.height, false), (status.height, false), (buttons.isEmpty ? 0 : buttonHeight, true)] where part > 0 {
            height += part + (above ? (isButtons ? buttonGap : gap) : 0)
            above = true
        }
        return Metrics(size: NSSize(width: max(bubble.kind == .nudge ? 150 : 90, ceil(content) + hPad * 2), height: ceil(height)), title: title, text: text, status: status, buttons: buttons)
    }

    /// 窗口需要的尺寸：没有大气泡时就是水母本体的基础尺寸；气泡更宽更高时向两侧、向上长出来。
    static func windowSize(for bubble: JellyBubble?, base: NSSize) -> NSSize {
        guard let bubble = bubble else { return base }
        let size = bubble.kind == .ring ? JellyRingLayout.size(bubble) : metrics(bubble).size
        let edge = self.edge(for: bubble.kind)
        return NSSize(width: max(base.width, ceil(size.width) + edge * 2), height: max(base.height, ceil(minY + size.height) + edge))
    }

    /// bodyX：水母身体中心在视图里的横坐标（窗口被夹回屏幕内时它不在正中）；气泡尽量居中于它，尾巴始终指向它。
    static func frame(_ bubble: JellyBubble, bodyX: CGFloat, viewWidth: CGFloat) -> Frame {
        if bubble.kind == .ring { return JellyRingLayout.frame(bubble, bodyX: bodyX, viewWidth: viewWidth) }
        let m = metrics(bubble)
        let width = min(m.size.width, viewWidth - edge * 2)
        let x = max(edge, min(bodyX - width / 2, viewWidth - edge - width))
        let rect = NSRect(x: x, y: minY, width: width, height: m.size.height)
        let tailX = max(rect.minX + 12, min(bodyX, rect.maxX - 12))
        // 自下而上排：按钮 → 状态 → 正文 → 标题
        var y = rect.minY + 9
        var buttons: [NSRect] = []
        let aboveButtons = m.title.height > 0 || m.text.height > 0 || m.status.height > 0
        if !m.buttons.isEmpty {
            let row = m.buttons.reduce(0) { $0 + $1.width } + CGFloat(m.buttons.count - 1) * 8
            var bx = rect.midX - row / 2
            for size in m.buttons { buttons.append(NSRect(x: bx, y: y, width: size.width, height: size.height)); bx += size.width + 8 }
            y += buttonHeight + (aboveButtons ? buttonGap : 0)
        }
        var status = NSRect.zero, text = NSRect.zero, title = NSRect.zero
        let inner = rect.width - hPad * 2
        if m.status.height > 0 { status = NSRect(x: rect.minX + hPad, y: y, width: inner, height: m.status.height); y += m.status.height + gap }
        if m.text.height > 0 { text = NSRect(x: rect.minX + hPad, y: y, width: inner, height: m.text.height); y += m.text.height + gap }
        if m.title.height > 0 { title = NSRect(x: rect.minX + hPad, y: y, width: inner, height: m.title.height) }
        return Frame(rect: rect, tailX: tailX, title: title, text: text, status: status, buttons: buttons)
    }
}

struct JellyPose {
    var contraction: CGFloat = 0
    var squash: CGFloat = 0
    var vx: CGFloat = 0
    var vy: CGFloat = 0
    var time: CGFloat = 0
    var asleep = true
    var grabbed = false
    var look = CGPoint.zero
    var tint = JellyTint.calm
    var blink: CGFloat = 0
    var alert = false
    var bubble: JellyBubble?
    var night: CGFloat = 0      // 夜晚荧光程度 0…1（0 = 白天或已关闭）
    var ripples = false         // 响铃涟漪
    var ringAge: CGFloat = 1000 // 自响铃气泡（重新）弹出起的秒数：弹出、涟漪、按钮淡入共用
}

final class JellyView: NSView {
    var pose = JellyPose() {
        didSet {
            if oldValue.bubble != pose.bubble { rebuildButtons() }
            syncButtonAlpha()
            needsDisplay = true
        }
    }
    var reduceMotion = false { didSet { if reduceMotion != oldValue { syncButtonAlpha(); needsDisplay = true } } }
    /// 当前外观是否深色，以及对应的调色板（所有水母气泡共用；测试用环境变量 TIMEKEEPER_APPEARANCE 通过窗口外观强制）。
    var isDark: Bool { effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua }
    var palette: JellyBubblePalette { isDark ? .dark : .light }
    var appearanceName: String { isDark ? "dark" : "light" }
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        restyleButtons()
        needsDisplay = true
    }
    /// 当前气泡本体在视图里的矩形（NSStringFromRect 格式，空串表示没有气泡），验收脚本据此取样截图像素。
    func bubbleRectString() -> String {
        guard let bubble = pose.bubble else { return "" }
        return NSStringFromRect(bubbleFrame(bubble, bodyX: bodyX ?? bounds.midX).rect)
    }
    /// 水母身体中心在视图里的横坐标；nil 表示正中。窗口变宽并被夹回屏幕内时它会偏离正中。
    var bodyX: CGFloat? {
        didSet { if bodyX != oldValue { layoutButtons(); needsDisplay = true } }
    }
    var onDown: ((NSEvent) -> Void)?
    var onDrag: ((NSEvent) -> Void)?
    var onUp: ((NSEvent) -> Void)?
    var onMove: ((NSEvent) -> Void)?
    var onButton: ((String) -> Void)?
    private var area: NSTrackingArea?
    private var buttonViews: [NSButton] = []
    private var cachedFrame: (bubble: JellyBubble, bodyX: CGFloat, width: CGFloat, frame: JellyBubbleLayout.Frame)?

    /// 气泡版式要量文字，游动时每帧都画：内容、身体位置、视图宽度都没变就复用上一次的结果。
    private func bubbleFrame(_ bubble: JellyBubble, bodyX: CGFloat) -> JellyBubbleLayout.Frame {
        if let cached = cachedFrame, cached.bubble == bubble, cached.bodyX == bodyX, cached.width == bounds.width { return cached.frame }
        let frame = JellyBubbleLayout.frame(bubble, bodyX: bodyX, viewWidth: bounds.width)
        cachedFrame = (bubble, bodyX, bounds.width, frame)
        return frame
    }

    override var isFlipped: Bool { false }
    override var isOpaque: Bool { false }
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: pose.grabbed ? .closedHand : .openHand) }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        // 不再强制浅色外观：气泡与按钮跟随系统深浅色（调色板见 jelly-palette.swift）
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let area = area { removeTrackingArea(area) }
        let next = NSTrackingArea(rect: bounds, options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(next)
        area = next
    }
    override func layout() {
        super.layout()
        layoutButtons()
    }
    override func mouseDown(with event: NSEvent) { onDown?(event) }
    override func mouseDragged(with event: NSEvent) { onDrag?(event) }
    override func mouseUp(with event: NSEvent) { onUp?(event) }
    override func mouseMoved(with event: NSEvent) { onMove?(event) }

    static let bellBaseY: CGFloat = 62

    // MARK: 气泡里的按钮（真正的 NSButton：键盘与辅助功能直接可用；只在提醒气泡里出现）

    private var buttonKind: JellyBubble.Kind?

    private func rebuildButtons() {
        let wanted = pose.bubble?.buttons ?? []
        let kind = pose.bubble?.kind
        let hidden = pose.bubble?.confirm != nil          // 响铃确认语出现后按钮收起（文字画在按钮那一行）
        if kind == buttonKind && wanted.map({ $0.id }) == buttonViews.map({ $0.identifier?.rawValue ?? "" }) && wanted.map({ $0.title }) == buttonViews.map({ $0.title }) {
            for (button, spec) in zip(buttonViews, wanted) { button.isEnabled = spec.enabled; button.isHidden = hidden }
            return
        }
        for button in buttonViews { button.removeFromSuperview() }
        buttonKind = kind
        // 有按钮时视图不能是一个整体的“按钮”元素，否则里面的按钮读不到；提醒的标题与正文放进按钮的帮助文字
        setAccessibilityElement(wanted.isEmpty)
        let summary = ([pose.bubble?.bigClock, pose.bubble?.title].compactMap { $0 } + (pose.bubble?.lines ?? [])).joined(separator: "，")
        let palette = self.palette
        buttonViews = wanted.map { spec in
            let button: NSButton
            if kind == .ring {
                let pill = JellyPillButton(id: spec.id, title: spec.title, primary: spec.primary, target: self, action: #selector(buttonPressed(_:)))
                pill.palette = palette
                button = pill
            } else {
                button = NSButton(title: spec.title, target: self, action: #selector(buttonPressed(_:)))
                button.identifier = NSUserInterfaceItemIdentifier(spec.id)
                button.bezelStyle = .rounded
                button.controlSize = .small
                button.font = .systemFont(ofSize: 11, weight: .medium)
                if spec.primary { styleSystemPrimary(button, title: spec.title) }
            }
            button.isEnabled = spec.enabled
            button.isHidden = hidden
            button.setAccessibilityLabel(spec.title)
            button.setAccessibilityHelp(summary)
            addSubview(button)
            return button
        }
        layoutButtons()
        syncButtonAlpha()
    }

    private func styleSystemPrimary(_ button: NSButton, title: String) {
        button.attributedTitle = NSAttributedString(string: title, attributes: [.font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: NSColor(palette.nudgePrimaryText)])
    }

    /// 外观切换后重新给按钮上色（系统圆角按钮的强调字色是调色板里取的；胶囊按钮自己按调色板绘制）。
    private func restyleButtons() {
        let palette = self.palette
        for (button, spec) in zip(buttonViews, pose.bubble?.buttons ?? []) {
            if let pill = button as? JellyPillButton { pill.palette = palette }
            else if spec.primary { styleSystemPrimary(button, title: spec.title) }
        }
    }

    /// 响铃气泡的按钮在弹出后段才淡入（气泡本体在缩放，按钮是真控件，不跟着缩放）。
    private func syncButtonAlpha() {
        guard pose.bubble?.kind == .ring, !buttonViews.isEmpty else { return }
        let alpha = reduceMotion ? 1 : JellyRingMotion.buttonAlpha(age: pose.ringAge)
        for button in buttonViews where button.alphaValue != alpha { button.alphaValue = alpha }
    }

    private func layoutButtons() {
        guard let bubble = pose.bubble, !buttonViews.isEmpty else { return }
        let frame = bubbleFrame(bubble, bodyX: bodyX ?? bounds.midX)
        for (button, rect) in zip(buttonViews, frame.buttons) { button.frame = rect }
    }

    @objc private func buttonPressed(_ sender: NSButton) {
        if let id = sender.identifier?.rawValue { onButton?(id) }
    }

    /// 气泡里各按钮在屏幕上的位置（验收脚本据此做真实点击）。
    func buttonScreenFrames() -> [String: NSRect] {
        var result: [String: NSRect] = [:]
        guard let window = window else { return result }
        for button in buttonViews {
            guard let id = button.identifier?.rawValue else { continue }
            result[id] = window.convertToScreen(button.convert(button.bounds, to: nil))
        }
        return result
    }

    // MARK: 绘制

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        var p = pose
        let night = max(0, min(1, p.night))
        if night > 0 { p.tint = p.tint.mixed(toward: .nightBlue, 0.05 * night) }   // 只在绘制时推色，不污染按阶段渐变的 tint
        let cx = bodyX ?? bounds.midX
        let by = JellyView.bellBaseY
        let sq = max(-0.5, min(1.2, p.squash))
        let w = 46 * (1 - 0.16 * p.contraction + 0.10 * sq)
        let h = 32 * (1 + 0.12 * p.contraction - 0.16 * sq)
        let tilt = max(-0.28, min(0.28, -p.vx / 240))

        if night > 0.01 { drawNightGlow(cx: cx, cy: by + h * 0.35, w: w, night: night, p: p) }
        if p.ripples { drawRipples(cx: cx, cy: by + h * 0.45, p: p) }

        ctx.saveGState()
        ctx.translateBy(x: cx, y: by + h * 0.5)
        ctx.rotate(by: tilt)
        ctx.translateBy(x: -cx, y: -(by + h * 0.5))
        drawTentacles(cx: cx, by: by, w: w, p: p)
        drawBell(cx: cx, by: by, w: w, h: h, p: p)
        ctx.restoreGState()

        if p.asleep && !p.grabbed { drawSleepMarks(cx: cx, by: by, w: w, h: h, p: p) }
        drawBubble(cx: cx, p: p)
    }

    /// 夜晚荧光：钟罩周围一圈柔和的光晕（径向渐变，窗口透明处不挡点击）。
    private func drawNightGlow(cx: CGFloat, cy: CGFloat, w: CGFloat, night: CGFloat, p: JellyPose) {
        // 半径由窗口几何限定（碰到窗口边缘前已衰减为 0），衰减曲线平滑到底：否则在透明窗口边缘会被硬截断成一个方框
        let radius = CountdownModel.glowRadius(width: bounds.width, height: bounds.height, centerX: cx, centerY: cy)
        guard radius > 4 else { return }
        let steps = 14
        var colors: [NSColor] = [], locations: [CGFloat] = []
        for i in 0...steps {
            let t = Double(i) / Double(steps)
            colors.append(p.tint.color(CGFloat(0.55 * CountdownModel.glowProfile(t)) * night, lighten: 0.30))
            locations.append(CGFloat(t))
        }
        let gradient = NSGradient(colors: colors, atLocations: locations, colorSpace: .deviceRGB)
        gradient?.draw(fromCenter: NSPoint(x: cx, y: cy), radius: 0, toCenter: NSPoint(x: cx, y: cy), radius: radius, options: [])
    }

    /// 响铃涟漪：钟罩周围向外扩散的圈，画在水母与气泡之下（曲线见 JellyRingMotion）。
    private func drawRipples(cx: CGFloat, cy: CGFloat, p: JellyPose) {
        for ring in JellyRingMotion.ripples(time: p.ringAge, reduceMotion: reduceMotion) where ring.alpha > 0.004 {
            let path = NSBezierPath(ovalIn: NSRect(x: cx - ring.radius, y: cy - ring.radius, width: ring.radius * 2, height: ring.radius * 2))
            path.lineWidth = 2
            p.tint.color(ring.alpha, lighten: 0.15).setStroke()
            path.stroke()
        }
    }

    private func drawTentacles(cx: CGFloat, by: CGFloat, w: CGFloat, p: JellyPose) {
        let count = 5
        let asleep = p.asleep && !p.grabbed
        for i in 0..<count {
            let u = CGFloat(i) / CGFloat(count - 1)
            let x0 = cx - w * 0.34 + u * w * 0.68
            let length: CGFloat = (asleep ? 20 : 34) + CGFloat((i * 7) % 5) * 3
            let amp: CGFloat = asleep ? 1.2 : 3.6
            let path = NSBezierPath()
            path.lineWidth = 1.9
            path.lineCapStyle = .round
            path.lineJoinStyle = .round
            for k in 0...8 {
                let t = CGFloat(k) / 8
                let sway = sin(p.time * 2.6 + CGFloat(i) * 1.4 + t * 3.2) * amp * t
                let trailX = -p.vx * 0.055 * t * t
                let px = x0 + sway + trailX
                let py = by + 1 - t * length - max(0, p.vy) * 0.03 * t * t + max(0, -p.vy) * 0.02 * t * t
                if k == 0 { path.move(to: NSPoint(x: px, y: py)) } else { path.line(to: NSPoint(x: px, y: py)) }
            }
            p.tint.color(0.55, lighten: 0.15).setStroke()
            path.stroke()
        }
        // 两条较短、较粗的口腕
        for side in [-1, 1] {
            let path = NSBezierPath()
            path.lineWidth = 3.2
            path.lineCapStyle = .round
            let x0 = cx + CGFloat(side) * w * 0.10
            for k in 0...6 {
                let t = CGFloat(k) / 6
                let sway = sin(p.time * 2.0 + CGFloat(side) * 0.9 + t * 3.0) * (asleep ? 0.8 : 2.2) * t
                let px = x0 + sway - p.vx * 0.04 * t * t
                let py = by + 1 - t * (asleep ? 14 : 22)
                if k == 0 { path.move(to: NSPoint(x: px, y: py)) } else { path.line(to: NSPoint(x: px, y: py)) }
            }
            p.tint.color(0.34, lighten: 0.4).setStroke()
            path.stroke()
        }
    }

    private func drawBell(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose) {
        let left = cx - w / 2, right = cx + w / 2
        let bell = NSBezierPath()
        bell.move(to: NSPoint(x: left, y: by))
        bell.curve(to: NSPoint(x: cx, y: by + h), controlPoint1: NSPoint(x: cx - w * 0.52, y: by + h * 0.55), controlPoint2: NSPoint(x: cx - w * 0.30, y: by + h))
        bell.curve(to: NSPoint(x: right, y: by), controlPoint1: NSPoint(x: cx + w * 0.30, y: by + h), controlPoint2: NSPoint(x: cx + w * 0.52, y: by + h * 0.55))
        // 下缘做成四段起伏的裙边
        let segments = 4
        for i in 0..<segments {
            let x1 = right - w * CGFloat(i + 1) / CGFloat(segments)
            let mid = right - w * (CGFloat(i) + 0.5) / CGFloat(segments)
            bell.curve(to: NSPoint(x: x1, y: by), controlPoint1: NSPoint(x: mid, y: by - 4.5), controlPoint2: NSPoint(x: mid, y: by - 4.5))
        }
        bell.close()
        let gradient = NSGradient(colors: [p.tint.color(0.50), p.tint.color(0.74, lighten: 0.22), p.tint.color(0.94, lighten: 0.45)],
                                  atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)
        gradient?.draw(in: bell, angle: 90)
        p.tint.color(0.85, darken: 0.12).setStroke()
        bell.lineWidth = 1.2
        bell.stroke()

        // 高光与斑点
        NSColor.white.withAlphaComponent(0.42).setFill()
        NSBezierPath(ovalIn: NSRect(x: cx - w * 0.30, y: by + h * 0.58, width: w * 0.20, height: h * 0.20)).fill()
        NSColor.white.withAlphaComponent(0.22).setFill()
        for (dx, dy, r) in [(0.18, 0.72, 2.2), (0.30, 0.55, 1.6), (0.06, 0.82, 1.4)] as [(CGFloat, CGFloat, CGFloat)] {
            NSBezierPath(ovalIn: NSRect(x: cx + w * dx - r, y: by + h * dy - r, width: r * 2, height: r * 2)).fill()
        }

        // 脸
        let eyeY = by + h * 0.40
        let dark = NSColor(calibratedRed: 0.16, green: 0.22, blue: 0.30, alpha: 0.88)
        dark.setFill(); dark.setStroke()
        for side in [-1, 1] as [CGFloat] {
            let ex = cx + side * w * 0.17 + p.look.x * 1.4
            let ey = eyeY + p.look.y * 1.0
            if p.asleep && !p.grabbed {
                let arc = NSBezierPath()
                arc.lineWidth = 1.3
                arc.lineCapStyle = .round
                arc.move(to: NSPoint(x: ex - 2.8, y: ey + 0.8))
                arc.curve(to: NSPoint(x: ex + 2.8, y: ey + 0.8), controlPoint1: NSPoint(x: ex - 1.6, y: ey - 2.2), controlPoint2: NSPoint(x: ex + 1.6, y: ey - 2.2))
                arc.stroke()
            } else {
                let open = max(0.12, 1 - p.blink)
                NSBezierPath(ovalIn: NSRect(x: ex - 2.2, y: ey - 2.4 * open, width: 4.4, height: 4.8 * open)).fill()
                NSColor.white.withAlphaComponent(0.85).setFill()
                NSBezierPath(ovalIn: NSRect(x: ex - 0.2, y: ey + 0.2 * open, width: 1.3, height: 1.3 * open)).fill()
                dark.setFill()
            }
            NSColor(calibratedRed: 1.0, green: 0.55, blue: 0.62, alpha: 0.30).setFill()
            NSBezierPath(ovalIn: NSRect(x: cx + side * w * 0.29 - 3.2, y: eyeY - 6.2, width: 6.4, height: 3.6)).fill()
        }
        dark.setStroke(); dark.setFill()
        if p.alert && !p.asleep {
            NSBezierPath(ovalIn: NSRect(x: cx - 1.8 + p.look.x * 0.8, y: eyeY - 6.4, width: 3.6, height: 4.2)).fill()
        } else if !p.asleep || p.grabbed {
            let smile = NSBezierPath()
            smile.lineWidth = 1.2
            smile.lineCapStyle = .round
            smile.move(to: NSPoint(x: cx - 2.4, y: eyeY - 4.6))
            smile.curve(to: NSPoint(x: cx + 2.4, y: eyeY - 4.6), controlPoint1: NSPoint(x: cx - 1.2, y: eyeY - 7.2), controlPoint2: NSPoint(x: cx + 1.2, y: eyeY - 7.2))
            smile.stroke()
        }
    }

    private func drawSleepMarks(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose) {
        let color = p.tint.color(0.95, darken: 0.45).withAlphaComponent(0.55)
        for (index, (dx, dy, size)) in [(w / 2 + 3, h * 0.42, 11.0), (w / 2 + 11, h * 0.72, 8.0)].enumerated() {
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: CGFloat(size), weight: .semibold), .foregroundColor: color]
            NSString(string: index == 0 ? "z" : "z").draw(at: NSPoint(x: cx + dx, y: by + dy), withAttributes: attrs)
        }
    }

    private func drawBubble(cx: CGFloat, p: JellyPose) {
        guard let bubble = p.bubble else { return }
        let frame = bubbleFrame(bubble, bodyX: cx)
        let palette = self.palette
        if bubble.kind == .ring {
            JellyRingPainter.draw(bubble, frame: frame, palette: palette, dark: isDark, age: reduceMotion ? JellyRingMotion.popDuration : p.ringAge)
            return
        }
        let rect = frame.rect
        let ink = NSColor(palette.title)
        let soft = NSColor(palette.body)
        let red = NSColor(palette.error)
        let body = NSBezierPath(roundedRect: rect, xRadius: 9, yRadius: 9)
        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: frame.tailX - 5, y: rect.minY + 0.5))
        tail.line(to: NSPoint(x: frame.tailX, y: rect.minY - 5))
        tail.line(to: NSPoint(x: frame.tailX + 5, y: rect.minY + 0.5))
        tail.close()
        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(isDark ? 0.4 : 0.16)
        shadow.shadowBlurRadius = 5
        shadow.shadowOffset = NSSize(width: 0, height: -1.5)
        shadow.set()
        NSColor(palette.fillTop).setFill()
        body.fill(); tail.fill()
        NSGraphicsContext.restoreGraphicsState()
        p.tint.color(0.55, darken: 0.1).setStroke()
        body.lineWidth = 0.8
        body.stroke()

        func draw(_ text: String, in box: NSRect, font: NSFont, color: NSColor, lineBreak: NSLineBreakMode = .byWordWrapping) {
            // 量尺寸与绘制已用同一套行高，仍向下多给 3 点余量（文字自上而下排，位置不变），
            // 避免取整误差让末行被判定放不下、整段被截成一行省略号；真正超出行数上限的仍会被截断。
            let room = NSRect(x: box.minX, y: box.minY - 3, width: box.width, height: box.height + 3)
            (text as NSString).draw(with: room, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: JellyBubbleLayout.attributes(font, color: color, lineBreak: lineBreak))
        }
        if bubble.kind == .clock {
            let line = bubble.lines.first ?? ""
            let size = (line as NSString).size(withAttributes: [.font: JellyBubbleLayout.clockFont])
            (line as NSString).draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2),
                                    withAttributes: [.font: JellyBubbleLayout.clockFont, .foregroundColor: bubble.alert ? red : ink])
            return
        }
        if let title = bubble.title, frame.title.height > 0 {
            draw(title, in: frame.title, font: JellyBubbleLayout.titleFont, color: bubble.kind == .note && bubble.bad ? red : ink, lineBreak: .byTruncatingTail)
        }
        if frame.text.height > 0 { draw(bubble.lines.joined(separator: "\n"), in: frame.text, font: JellyBubbleLayout.lineFont, color: bubble.kind == .note && bubble.bad ? red : soft) }
        if let status = bubble.status, frame.status.height > 0 {
            draw(status, in: frame.status, font: JellyBubbleLayout.statusFont, color: bubble.bad ? red : NSColor(palette.success))
        }
    }
}

/// 控制器每次刷新交给水母的显示内容。
struct JellyInfo {
    var stage: CountdownStage = .calm
    var night: CGFloat = 0          // 夜晚荧光程度 0…1
    var bubble: JellyBubble?
    var awake = false               // 气泡显示期间保持睁眼：即使停在游泳线上也不打瞌睡
    var rest = true                 // 想休息（睡在游泳线上）；倒计时临近时为 false，水母游起来
    var ripples = false             // 响铃涟漪
    var ringEpoch = 0               // 变化时重播响铃气泡的弹出（也是响铃的“开始”）；0 表示没有响铃
}

final class JellyCompanion: NSObject {
    static let size = NSSize(width: 170, height: 150)   // 水母本体的窗口；有大气泡时窗口会按需变宽变高
    static let tentacleReach: CGFloat = 18   // 触手底端到窗口底边的距离，休息时触手贴着游泳线
    static let defaultsKey = "CompanionX"

    let panel: ReminderPanel
    let view = JellyView(frame: NSRect(origin: .zero, size: JellyCompanion.size))
    var swim = JellySwim()
    var pose = JellyPose()
    var info = JellyInfo()
    var reduceMotion = false
    var onGrabEnd: (() -> Void)?
    /// 用户第一次把水母拖离按下点时（真正“抓起”）：控制器据此放弃响铃中的位置约定。
    var onGrabBegin: (() -> Void)?
    var onPoke: (() -> Void)?
    var onButton: ((String) -> Void)?
    /// 下一次 show() 从泳线最右端出现（响铃时水母本来不在屏幕上，从右边游进来）；用过即清。
    var startAtRightEdgeOnce = false
    private var dashCompletion: (() -> Void)?
    private var ringStart: CFTimeInterval = 0
    private var laneScreenFrame = NSRect.zero
    private(set) var panelSize = JellyCompanion.size
    /// 水母所在屏幕的可见区（泳线所在的区域），验收脚本据此核对响铃落点。
    var laneRect: NSRect { laneFrame }
    private var timer: Timer?
    private var lastTick: CFTimeInterval = 0
    private var clockTime: CGFloat = 0
    private var laneY: CGFloat = 0
    private var laneFrame = NSRect.zero
    private var grabOffset = CGPoint.zero
    private var downPoint = CGPoint.zero
    private var dragged = false
    private var nextBlink: CGFloat = 3
    private var blinkLeft: CGFloat = 0
    private var rng = SystemRandomNumberGenerator()
    private var observer: NSObjectProtocol?

    override init() {
        panel = ReminderPanel(contentRect: NSRect(origin: .zero, size: JellyCompanion.size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        panel.title = "桌面水母"
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { panel.collectionBehavior.insert(.canJoinAllApplications) }
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovableByWindowBackground = false
        switch ProcessInfo.processInfo.environment["TIMEKEEPER_APPEARANCE"] {      // 仅隔离验收：强制浅/深外观
        case "dark": panel.appearance = NSAppearance(named: .darkAqua)
        case "light": panel.appearance = NSAppearance(named: .aqua)
        default: break
        }
        panel.contentView = view
        view.setAccessibilityElement(true)
        view.setAccessibilityRole(.button)
        view.setAccessibilityLabel("桌面水母")
        view.onDown = { [weak self] event in self?.mouseDown(event) }
        view.onDrag = { [weak self] event in self?.mouseDragged(event) }
        view.onUp = { [weak self] event in self?.mouseUp(event) }
        view.onMove = { [weak self] event in self?.mouseMoved(event) }
        view.onButton = { [weak self] id in self?.onButton?(id) }
        observer = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.panel.isVisible else { return }
            self.refreshLane(for: self.panel.screen ?? NSScreen.main)
            self.layoutPanel()
        }
    }

    deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }

    var isVisible: Bool { panel.isVisible }

    // MARK: 屏幕与位置

    private func screenAt(_ point: NSPoint) -> NSScreen? {
        NSScreen.screens.first(where: { $0.frame.contains(point) }) ?? NSScreen.main
    }

    private func refreshLane(for screen: NSScreen?) {
        guard let frame = screen?.visibleFrame else { return }
        laneFrame = frame
        laneScreenFrame = screen?.frame ?? .zero
        laneY = frame.minY + 2
        swim.setBounds(lo: frame.minX + JellyCompanion.size.width / 2, hi: frame.maxX - JellyCompanion.size.width / 2)
    }

    /// 窗口位置与尺寸一次设好：水平以水母为中心，窗口变宽时夹回可见区域，身体相对窗口的偏移交给视图；纵向底边贴着触手，向上长高。
    private func layoutPanel() {
        var x = swim.x - panelSize.width / 2
        if laneFrame.width > panelSize.width { x = max(laneFrame.minX, min(x, laneFrame.maxX - panelSize.width)) }
        let y = laneY + swim.y - JellyCompanion.tentacleReach
        let frame = NSRect(x: x, y: y, width: panelSize.width, height: panelSize.height)
        if panel.frame != frame { panel.setFrame(frame, display: false) }
        view.bodyX = panelSize == JellyCompanion.size ? nil : swim.x - x
    }

    func show() {
        if !panel.isVisible {
            let screen = screenAt(NSEvent.mouseLocation)
            refreshLane(for: screen)
            let saved = UserDefaults.standard.object(forKey: JellyCompanion.defaultsKey) as? Double
            swim.x = startAtRightEdgeOnce ? swim.hi : (saved.map { CGFloat($0) } ?? swim.hi - 40)
            startAtRightEdgeOnce = false
            swim.setBounds(lo: swim.lo, hi: swim.hi)
            swim.y = 0; swim.vx = 0; swim.vy = 0
            swim.mode = .rest
            layoutPanel()
            panel.alphaValue = 1
            panel.orderFrontRegardless()
        }
        syncPose()
    }

    /// remember 为 false 时不写 CompanionX：响铃是“出差”，退场时水母的位置不能当作用户选的家。
    func hide(remember: Bool = true) {
        timer?.invalidate(); timer = nil
        dashCompletion = nil
        if remember && panel.isVisible { UserDefaults.standard.set(Double(swim.x), forKey: JellyCompanion.defaultsKey) }
        panel.orderOut(nil)
    }

    // MARK: 响铃：落点与冲刺

    /// 响铃落点：所在屏幕可见区的底部正中（夹进泳线范围）；须在 show() 之后调用。
    var centerX: CGFloat { max(swim.lo, min(laneFrame.midX, swim.hi)) }
    /// 泳线最右端：没出现的水母从这里游入，响完不再需要时游向这里后消失。
    var rightEdgeX: CGFloat { swim.hi }
    /// 水母已出现并且就在鼠标所在的屏幕上？不在时响铃改从目标屏幕右边出现（跨屏时原屏上直接消失，不做淡出）。
    func isOnMouseScreen() -> Bool {
        guard panel.isVisible else { return false }
        guard let mouse = screenAt(NSEvent.mouseLocation) else { return true }
        return laneScreenFrame == mouse.frame
    }

    /// 游到泳线上的 x（夹进泳线范围），到位后回调一次；被新的冲刺替换或被用户抓住时回调作废，不会被调用。
    /// “减少动态效果”或窗口不可见：直接就位，回调异步触发。
    func dash(toX x: CGFloat, completion: (() -> Void)? = nil) {
        dashCompletion = nil
        guard swim.mode != .grabbed else { return }      // 被用户抓着：不冲刺，回调作废
        if reduceMotion || !panel.isVisible {
            swim.dash = nil; swim.dashEnded = false
            swim.x = max(swim.lo, min(x, swim.hi)); swim.y = 0; swim.vx = 0; swim.vy = 0; swim.mode = .rest
            layoutPanel(); syncPose()
            if let completion = completion { DispatchQueue.main.async(execute: completion) }
            return
        }
        dashCompletion = completion
        swim.startDash(toX: x)
        if swim.dashEnded {       // 距离不足 1 点：已经在落点上
            swim.dashEnded = false
            let done = dashCompletion; dashCompletion = nil
            if let done = done { DispatchQueue.main.async(execute: done) }
        }
        ensureTicking()
    }

    // MARK: 状态

    /// 控制器刷新时调用（倒计时每秒一次；常驻休息时 30 秒一次）。
    func update(_ next: JellyInfo, reduceMotion reduce: Bool) {
        if next.ringEpoch != info.ringEpoch { ringStart = CACurrentMediaTime() }
        info = next
        reduceMotion = reduce
        swim.tuning = JellyTuning.forStage(next.stage)
        let wantsRest = next.rest || reduce
        swim.wantsRest = wantsRest
        if !wantsRest && swim.mode == .rest { swim.wake() }
        let size = JellyBubbleLayout.windowSize(for: next.bubble, base: JellyCompanion.size)
        if size != panelSize {
            panelSize = size
            if panel.isVisible { layoutPanel() }
        }
        syncPose()
        ensureTicking()
    }

    /// 被点一下时的小跳（只是动作；显示什么由控制器决定）。
    func jump() {
        if !reduceMotion { swim.poke() }
        ensureTicking()
    }

    /// 到点“炸开”：一次强烈的收缩，随后由控制器淡出或留下。
    func burst() {
        if !reduceMotion { swim.squashV += 16 }
        ensureTicking()
    }

    private func syncPose() {
        var next = pose
        next.contraction = swim.contraction
        next.squash = swim.squash
        next.vx = swim.vx
        next.vy = swim.vy
        next.time = clockTime
        next.asleep = swim.mode == .rest && swim.wantsRest && !info.awake
        next.grabbed = swim.mode == .grabbed
        next.alert = info.stage >= .imminent
        next.night = info.night
        next.bubble = info.bubble
        next.ripples = info.ripples
        next.ringAge = info.ringEpoch == 0 ? 1000 : CGFloat(max(0, CACurrentMediaTime() - ringStart))
        // 响铃时水母停在泳线上：钟罩按 0.5 秒节奏收缩只是视觉，不移动窗口
        if info.ripples && !reduceMotion && swim.mode == .rest {
            next.contraction = JellySwim.contraction(atPhase: (next.ringAge / JellyDash.pulsePeriod).truncatingRemainder(dividingBy: 1))
        }
        view.reduceMotion = reduceMotion
        next.tint = pose.tint.mixed(toward: JellyTint.forStage(info.stage), reduceMotion ? 1 : 0.12)
        pose = next
        view.pose = next
    }

    // MARK: 动画

    private var needsFrames: Bool {
        if reduceMotion { return false }
        if info.ripples { return true }        // 响铃时涟漪与弹出需要逐帧绘制（响铃结束即停）
        return !(swim.settled && swim.mode == .rest)
    }

    private func ensureTicking() {
        guard needsFrames, timer == nil, panel.isVisible else { return }
        lastTick = CACurrentMediaTime()
        let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in self?.tick() }
        t.tolerance = 0.005
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = CGFloat(min(now - lastTick, 1.0 / 15))
        lastTick = now
        clockTime += dt
        if swim.mode == .grabbed {
            let mouse = NSEvent.mouseLocation
            swim.hold(x: mouse.x - grabOffset.x, y: mouse.y - grabOffset.y - laneY, dt: dt)
        } else {
            swim.step(dt: dt, random: { [unowned self] in CGFloat.random(in: 0..<1, using: &self.rng) })
        }
        if swim.dashEnded {
            swim.dashEnded = false
            let done = dashCompletion; dashCompletion = nil
            done?()
        }
        // 眨眼
        if !(swim.mode == .rest && swim.wantsRest && !info.awake) {
            nextBlink -= dt
            if nextBlink <= 0 { blinkLeft = 0.14; nextBlink = CGFloat.random(in: 2.5..<5.5, using: &rng) }
            if blinkLeft > 0 { blinkLeft -= dt; pose.blink = sin(max(0, blinkLeft) / 0.14 * .pi) } else { pose.blink = 0 }
        }
        pose.look = lookVector()
        syncPose()
        layoutPanel()
        if !needsFrames && swim.mode != .grabbed {
            timer?.invalidate(); timer = nil
            syncPose()
        }
    }

    private func lookVector() -> CGPoint {
        guard !reduceMotion else { return .zero }
        let mouse = NSEvent.mouseLocation
        let center = CGPoint(x: swim.x, y: laneY + swim.y - JellyCompanion.tentacleReach + JellyView.bellBaseY + 16)
        let dx = mouse.x - center.x, dy = mouse.y - center.y
        let distance = hypot(dx, dy)
        guard distance < 420, distance > 1 else { return .zero }
        return CGPoint(x: dx / max(distance, 60), y: dy / max(distance, 60))
    }

    // MARK: 鼠标

    private func mouseDown(_ event: NSEvent) {
        let mouse = NSEvent.mouseLocation
        downPoint = mouse
        dragged = false
        grabOffset = CGPoint(x: mouse.x - swim.x, y: mouse.y - (laneY + swim.y))
    }

    private func mouseDragged(_ event: NSEvent) {
        let mouse = NSEvent.mouseLocation
        if !dragged {
            guard hypot(mouse.x - downPoint.x, mouse.y - downPoint.y) > 4 else { return }
            dragged = true
            dashCompletion = nil
            onGrabBegin?()
            pose.grabbed = true
            swim.mode = .grabbed
            view.window?.invalidateCursorRects(for: view)
            lastTick = CACurrentMediaTime()
            if timer == nil {
                let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in self?.tick() }
                t.tolerance = 0.005
                RunLoop.main.add(t, forMode: .common)
                timer = t
            }
        }
    }

    private func mouseUp(_ event: NSEvent) {
        if dragged {
            dragged = false
            let mouse = NSEvent.mouseLocation
            let globalY = laneY + swim.y
            refreshLane(for: screenAt(mouse))
            swim.y = max(0, globalY - laneY)
            swim.release()
            pose.grabbed = false
            view.window?.invalidateCursorRects(for: view)
            UserDefaults.standard.set(Double(swim.x), forKey: JellyCompanion.defaultsKey)
            if reduceMotion {
                // 不播动画：直接放回游泳线
                swim.y = 0; swim.vx = 0; swim.vy = 0; swim.mode = .rest
                layoutPanel()
            }
            syncPose()
            ensureTicking()
            onGrabEnd?()
        } else {
            onPoke?()
        }
    }

    private func mouseMoved(_ event: NSEvent) {
        guard timer == nil else { return }
        pose.look = lookVector()
        syncPose()
    }
}
