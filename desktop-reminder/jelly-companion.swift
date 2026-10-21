import AppKit

// 桌面水母：一只在屏幕底部游动、打盹的小水母。
// 全部用 Core Graphics 自绘，没有外部素材；窗口只比水母大一点，透明处不挡点击。
// 它只显示与互动，不拥有任何业务状态：倒计时、喝水/起身提醒、今天的记录都由 JellyController 拼好气泡交给它，
// 点击、按钮、右键菜单的动作也都交回 JellyController，再由它转给 Chrome 执行。

// JellyTint / JellyPaint 的数据与插值（纯逻辑）在 jelly-paint.swift；这里只补上转 NSColor 的绘制用法。
extension JellyTint {
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
    var tint = JellyTint.calm          // 约定：始终等于 paint.a（光晕、涟漪、睡觉标记、气泡边框用它）
    var paint = JellyPaint.solid(.calm) // 钟罩、触手的颜料（花纹由外观决定，阶段色覆盖时整只一色）
    var blink: CGFloat = 0
    var alert = false
    var bubble: JellyBubble?
    var night: CGFloat = 0      // 夜晚荧光程度 0…1（0 = 白天或已关闭）
    var ripples = false         // 响铃涟漪
    var ringAge: CGFloat = 1000 // 自响铃气泡（重新）弹出起的秒数：弹出、涟漪、按钮淡入共用
    // 动物（物种不是水母时）：JellyView 改用 SpeciesPainter 画，下面三项由 SpeciesPose 给出；水母不读它们
    var species: JellySpecies = .jelly  // 实际生效的物种（动物画不出来时已回退水母）
    var facing: CGFloat = 1             // 水平缩放：+1 朝右、−1 朝左，转身途中是中间值
    var pitch: CGFloat = 0              // 俯仰（弧度，鼻子朝上为正）
    var wave: CGFloat = 0               // 划水相位 −1…1（已乘包络），驱动尾鳍与胸鳍
    // 写实动物（外观 realistic 且该物种有骨架时）：JellyView 改用 MarineRigPainter 画；卡通动物与水母不读下面三项
    var realistic = false               // 此刻画的是写实版（外观要求写实且骨架可用）
    var rigPhase: CGFloat = 0           // 游动相位（弧度，SpeciesPose.rigPhase）
    var rigAmp: CGFloat = 0             // 游动幅度 0…1（SpeciesPose.envelope：停下时为 0，动物回到直线姿态）
    var stageMix: CGFloat = 0           // 阶段色混入程度 0…1（平静为 0，临近/紧迫/最后 10 秒向 1 收敛）
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
    /// 水母的外观（颜色/花纹/材质）；注意不能叫 appearance，NSView 自带同名属性。目前只有材质决定用哪个 painter，颜色走 pose.paint。
    var jellyAppearance = JellyAppearance.default { didSet { if jellyAppearance != oldValue { needsDisplay = true } } }
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
        if night > 0 {   // 只在绘制时推色，不污染按阶段渐变的 tint / paint
            p.tint = p.tint.mixed(toward: .nightBlue, 0.05 * night)
            p.paint = p.paint.mixedAll(toward: .nightBlue, 0.05 * night)
        }
        let cx = bodyX ?? bounds.midX
        if p.species != .jelly, p.realistic, let rigGeometry = MarineRigGeometries.of(p.species) {
            drawRealAnimal(rigGeometry, cx: cx, night: night, p: p)
            return
        }
        if p.species != .jelly, let geometry = JellySpeciesGeometry.of(p.species) {
            drawAnimal(geometry, cx: cx, night: night, p: p)
            return
        }
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
        let painter = JellyPainters.painter(for: jellyAppearance.material)
        painter.tentacles(cx: cx, by: by, w: w, p: p)
        painter.bell(cx: cx, by: by, w: w, h: h, p: p)
        painter.face(cx: cx, by: by, w: w, h: h, p: p)
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
    private func drawRipples(cx: CGFloat, cy: CGFloat, p: JellyPose, outer: CGFloat = JellyRingMotion.rippleOuter) {
        for ring in JellyRingMotion.ripples(time: p.ringAge, reduceMotion: reduceMotion, outer: outer) where ring.alpha > 0.004 {
            let path = NSBezierPath(ovalIn: NSRect(x: cx - ring.radius, y: cy - ring.radius, width: ring.radius * 2, height: ring.radius * 2))
            path.lineWidth = 2
            p.tint.color(ring.alpha, lighten: 0.15).setStroke()
            path.stroke()
        }
    }

    /// 动物：光晕与涟漪以动物的中心为圆心（中心比水母低，涟漪外半径按离窗口边缘的余量缩小），睡着的 “z” 跟着头走；气泡与水母共用。
    private func drawAnimal(_ g: SpeciesGeometry, cx: CGFloat, night: CGFloat, p: JellyPose) {
        let center = SpeciesPlacement.center(g, centerX: cx)
        if night > 0.01 { drawNightGlow(cx: center.x, cy: center.y, w: g.union.width, night: night, p: p) }
        if p.ripples {
            let outer = JellyRingMotion.outerRadius(centerX: center.x, centerY: center.y, width: bounds.width, height: bounds.height)
            drawRipples(cx: center.x, cy: center.y, p: p, outer: outer)
        }
        SpeciesPainter.draw(g, pose: p, centerX: cx)
        if p.asleep && !p.grabbed {
            let anchor = SpeciesPainter.sleepAnchor(g, centerX: cx, pose: p)
            let side: CGFloat = p.facing >= 0 ? 1 : -1
            let color = p.tint.color(0.95, darken: 0.45).withAlphaComponent(0.55)
            for (dx, dy, size) in [(2.0, 4.0, 11.0), (10.0, 15.0, 8.0)] as [(CGFloat, CGFloat, CGFloat)] {
                let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: .semibold), .foregroundColor: color]
                NSString(string: "z").draw(at: NSPoint(x: anchor.x + side * dx, y: anchor.y + dy), withAttributes: attrs)
            }
        }
        drawBubble(cx: cx, p: p)
    }

    /// 写实动物：布局、光晕、涟漪、“z” 与气泡规则同 drawAnimal（并集中心悬在标准高度），只是动物本身由 MarineRigPainter 画（与水族馆同一份骨架数据）。
    /// 另写一份而不是改 drawAnimal：卡通动物的像素基线（appearance-snapshot / species-render）因此保持逐字节不变。
    private func drawRealAnimal(_ g: MarineRigGeometry, cx: CGFloat, night: CGFloat, p: JellyPose) {
        let center = SpeciesPlacement.center(union: g.union, centerX: cx)
        if night > 0.01 { drawNightGlow(cx: center.x, cy: center.y, w: g.union.width, night: night, p: p) }
        if p.ripples {
            let outer = JellyRingMotion.outerRadius(centerX: center.x, centerY: center.y, width: bounds.width, height: bounds.height)
            drawRipples(cx: center.x, cy: center.y, p: p, outer: outer)
        }
        MarineRigPainter.draw(g, pose: p, centerX: cx)
        if p.asleep && !p.grabbed {
            let anchor = MarineRigPainter.sleepAnchor(g, centerX: cx, pose: p)
            let side: CGFloat = p.facing >= 0 ? 1 : -1
            let color = p.tint.color(0.95, darken: 0.45).withAlphaComponent(0.55)
            for (dx, dy, size) in [(2.0, 4.0, 11.0), (10.0, 15.0, 8.0)] as [(CGFloat, CGFloat, CGFloat)] {
                let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: .semibold), .foregroundColor: color]
                NSString(string: "z").draw(at: NSPoint(x: anchor.x + side * dx, y: anchor.y + dy), withAttributes: attrs)
            }
        }
        drawBubble(cx: cx, p: p)
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
    var patrol: JellyTuning?        // 巡游（协议 v10）：非 nil 时用这份调校游动，替换按倒计时阶段挑的那份；是否休息仍由 rest 决定（巡游时控制器给 false）
}

final class JellyCompanion: NSObject {
    static let size = NSSize(width: 170, height: 150)   // 水母本体的窗口；有大气泡时窗口会按需变宽变高
    static let tentacleReach: CGFloat = 18   // 触手底端到窗口底边的距离，休息时触手贴着游泳线
    static let defaultsKey = "CompanionX"

    let panel: ReminderPanel
    let view = JellyView(frame: NSRect(origin: .zero, size: JellyCompanion.size))
    var swim = JellySwim()
    var pose = JellyPose()
    /// 动物的姿态（朝向、俯仰、划水包络）；水母不用，也不需要为它推进动画帧。
    private var speciesPose = SpeciesPose()
    var info = JellyInfo()
    var reduceMotion = false
    /// 当前外观（由控制器按 Chrome 下发的具体值设置；Chrome 是设置的唯一所有者，这里不另存）。
    private(set) var appearance = JellyAppearance.default
    /// 实际生效的物种：设置的物种有几何数据就是它，否则是水母。面板标题、读屏标签、回执与 ping 都用它，选择画法也只看它。
    var effectiveSpecies: JellySpecies { appearance.species.effective }
    /// 此刻画的是不是写实版：外观要求写实、实际生效的是动物、且这种动物的骨架可用（骨架编译失败时静默回到卡通版，回执据此如实报告）。
    var isRealistic: Bool { appearance.realistic && effectiveSpecies != .jelly && effectiveSpecies.hasRealisticRig }
    var onGrabEnd: (() -> Void)?
    /// 用户第一次把水母拖离按下点时（真正“抓起”）：控制器据此放弃响铃中的位置约定。
    var onGrabBegin: (() -> Void)?
    var onPoke: (() -> Void)?
    var onButton: ((String) -> Void)?
    var onDrop: ((JellyModel.DropItem) -> Void)?
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
        panel.title = JellySpecies.default.desktopTitle
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
        view.setAccessibilityLabel(JellySpecies.default.desktopTitle)
        view.onDown = { [weak self] event in self?.mouseDown(event) }
        view.onDrag = { [weak self] event in self?.mouseDragged(event) }
        view.onUp = { [weak self] event in self?.mouseUp(event) }
        view.onMove = { [weak self] event in self?.mouseMoved(event) }
        view.onButton = { [weak self] id in self?.onButton?(id) }
        view.installDrop { [weak self] item in self?.onDrop?(item) }
        observer = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.panel.isVisible else { return }
            self.refreshLane(for: self.panel.screen ?? NSScreen.main)
            self.layoutPanel()
        }
    }

    deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }

    var isVisible: Bool { panel.isVisible }

    /// 鼠标正停在水母身上？取身体附近的矩形（窗口四周各缩进一圈），不是整块透明窗口；巡游据此让路。
    var isPointerOver: Bool {
        guard panel.isVisible else { return false }
        return panel.frame.insetBy(dx: 40, dy: 12).contains(NSEvent.mouseLocation)
    }

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
        // 巡游（协议 v10）的调校是按水母标定的，动物巡游时要乘上自己的物种系数；见 JellyTuning.current
        swim.tuning = JellyTuning.current(stage: next.stage, patrol: next.patrol, species: effectiveSpecies)
        if reduce && effectiveSpecies != .jelly { speciesPose.step(dt: 1.0 / 30, vx: swim.vx, vy: swim.vy, stroking: false, reduceMotion: true) }
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

    /// 控制器收到 Chrome 下发的外观后调用。calm 阶段立即换色（不等每次刷新 0.12 的慢速收敛）；
    /// 其他阶段的颜色由阶段覆盖，外观记下来，回到 calm 时生效。
    func setAppearance(_ next: JellyAppearance) {
        guard next != appearance else { return }
        let previousSpecies = effectiveSpecies
        appearance = next
        if effectiveSpecies != previousSpecies {      // 换了一种：游动调参与姿态都从头来（朝右、不俯仰、鳍不摆）
            speciesPose = SpeciesPose()
            swim.tuning = JellyTuning.current(stage: info.stage, patrol: info.patrol, species: effectiveSpecies)   // 巡游中换物种：不丢掉巡游调校
        }
        view.jellyAppearance = next
        panel.title = effectiveSpecies.desktopTitle
        view.setAccessibilityLabel(effectiveSpecies.desktopTitle)
        if info.stage == .calm { pose.paint = JellyPaint.make(appearance: next) }
        syncPose()      // 同时按“tint 始终等于 paint.a”的约定重算 tint
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
        next.species = effectiveSpecies
        if next.species != .jelly {
            next.facing = speciesPose.facing
            next.pitch = speciesPose.pitch
            next.wave = speciesPose.wave(contraction: next.contraction)       // 响铃时的收缩节奏已在上面覆盖，鳍跟着它摆
        } else {
            next.facing = 1; next.pitch = 0; next.wave = 0
        }
        // 写实动物：相位与幅度来自 SpeciesPose（匀速推进的行波，包络决定幅度）；阶段色按与 paint 相同的节奏混入，卡通与水母不读这些字段
        next.realistic = isRealistic
        next.rigPhase = next.realistic ? speciesPose.rigPhase : 0
        next.rigAmp = next.realistic ? speciesPose.envelope : 0
        let stageTarget: CGFloat = info.stage == .calm ? 0 : 1
        next.stageMix = next.realistic ? pose.stageMix + (stageTarget - pose.stageMix) * (reduceMotion ? 1 : 0.12) : 0
        view.reduceMotion = reduceMotion
        next.paint = pose.paint.mixed(toward: JellyPaint.target(stage: info.stage, appearance: appearance), reduceMotion ? 1 : 0.12)
        next.tint = next.paint.a
        pose = next
        view.pose = next
    }

    // MARK: 动画

    private var needsFrames: Bool {
        if reduceMotion { return false }
        if info.ripples { return true }        // 响铃时涟漪与弹出需要逐帧绘制（响铃结束即停）
        if effectiveSpecies != .jelly && !speciesPose.settled { return true }     // 动物：转身、俯仰、鳍落回中位都要走完
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
        if effectiveSpecies != .jelly {
            // 响铃时鳍也摆（收缩节奏由 syncPose 覆盖）；被抓着时鳍放松
            let stroking = (swim.mode == .swim && !swim.wantsRest) || info.ripples
            speciesPose.step(dt: dt, vx: swim.vx, vy: swim.vy, stroking: stroking, reduceMotion: reduceMotion,
                             rigFrequency: isRealistic ? effectiveSpecies.rigFrequency : 0)
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

private final class JellyDropBox: NSObject {
    let handler: (JellyModel.DropItem) -> Void
    init(_ handler: @escaping (JellyModel.DropItem) -> Void) { self.handler = handler }
}

extension JellyView {
    private static var dropBoxes = NSMapTable<JellyView, JellyDropBox>.weakToStrongObjects()

    fileprivate func installDrop(_ handler: @escaping (JellyModel.DropItem) -> Void) {
        registerForDraggedTypes([.fileURL, .URL, .string])
        JellyView.dropBoxes.setObject(JellyDropBox(handler), forKey: self)
    }

    private func parsePasteboard(_ pb: NSPasteboard) -> JellyModel.DropItem? {
        var urlText: String?
        var fileText: String?
        if let urls = pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] {
            for item in urls {
                if item.isFileURL {
                    if fileText == nil { fileText = item.path }
                } else if let s = item.scheme?.lowercased(), s == "http" || s == "https" {
                    if urlText == nil { urlText = item.absoluteString }
                }
            }
        }
        if urlText == nil, let raw = pb.string(forType: .URL) { urlText = raw }
        if fileText == nil, let raw = pb.string(forType: .fileURL) { fileText = raw }
        let plainText = pb.string(forType: .string)
        return JellyModel.parseDrop(url: urlText, fileURL: fileText, text: plainText)
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        parsePasteboard(sender.draggingPasteboard) != nil ? .copy : []
    }

    override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
        parsePasteboard(sender.draggingPasteboard) != nil
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard let item = parsePasteboard(sender.draggingPasteboard),
              let box = JellyView.dropBoxes.object(forKey: self) else { return false }
        box.handler(item)
        return true
    }
}
