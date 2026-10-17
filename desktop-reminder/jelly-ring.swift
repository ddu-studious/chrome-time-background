import AppKit

// 到点响铃气泡的 AppKit 部分：版式（尺寸由文字量出）、绘制（气泡本体）和通栏胶囊按钮。
// 纯逻辑（解析、文案、配色、弹出与涟漪曲线）在 jelly-model / jelly-palette / jelly-swim，由 companion-selftest 单独验证；
// 这里的数值是初始取值，须以真实截图校准。窗口、尾巴与夹屏沿用 JellyBubbleLayout，所以这里只算响铃气泡自己的内部版式。

extension NSColor {
    convenience init(_ color: JellyRGB) {
        self.init(srgbRed: CGFloat(color.r), green: CGFloat(color.g), blue: CGFloat(color.b), alpha: CGFloat(color.a))
    }
}

enum JellyRingLayout {
    static let width: CGFloat = 300
    static let pad: CGFloat = 16
    static let edge: CGFloat = 28            // 响铃气泡阴影模糊半径约 10，边距比其他气泡（14）大
    static let radius: CGFloat = 18
    static let tail: CGFloat = 6
    static let tailHalf: CGFloat = 7
    static let buttonHeight: CGFloat = 30
    static let buttonGap: CGFloat = 8
    static let clockGap: CGFloat = 8         // 时间 → 标题
    static let statusGap: CGFloat = 7        // 标题 → 状态
    static let buttonsGap: CGFloat = 14      // 状态 → 按钮
    static let lineGap: CGFloat = 2          // 多个名字之间

    static let clockFont: NSFont = {
        let base = NSFont.monospacedDigitSystemFont(ofSize: 40, weight: .bold)
        if #available(macOS 11.0, *), let rounded = base.fontDescriptor.withDesign(.rounded), let font = NSFont(descriptor: rounded, size: 40) { return font }
        return base
    }()
    static func titleFont(count: Int, hasClock: Bool) -> NSFont {
        if !hasClock { return .systemFont(ofSize: count == 1 ? 19 : 15, weight: .semibold) }   // 没有大时间：标题放大
        return count == 1 ? .systemFont(ofSize: 15, weight: .semibold) : .systemFont(ofSize: 14, weight: .medium)
    }
    static let statusFont = NSFont.systemFont(ofSize: 11.5, weight: .medium)
    static let buttonFont = NSFont.systemFont(ofSize: 13, weight: .semibold)
    static let confirmFont = NSFont.systemFont(ofSize: 15, weight: .semibold)

    private struct Metrics {
        var size: NSSize
        var clock: CGFloat
        var lines: [CGFloat]
        var status: CGFloat
    }

    private static func metrics(_ bubble: JellyBubble) -> Metrics {
        let hasClock = !(bubble.bigClock ?? "").isEmpty
        let clock = hasClock ? JellyBubbleLayout.lineHeight(clockFont) : 0
        let font = titleFont(count: bubble.lines.count, hasClock: hasClock)
        let lines = bubble.lines.map { _ in JellyBubbleLayout.lineHeight(font) }
        let inner = width - pad * 2
        // 状态行的位置常驻（没有内容时也留着），点按钮后出现“正在同步…”不会把时间和标题顶上去
        let reserved = JellyBubbleLayout.lineHeight(statusFont)
        let status = bubble.status.map { max(reserved, JellyBubbleLayout.measure($0, font: statusFont, width: inner, maxLines: 2).height) } ?? reserved
        let titles = lines.reduce(0, +) + CGFloat(max(0, lines.count - 1)) * lineGap
        var height = pad + buttonHeight + buttonsGap + status + statusGap + titles + pad
        if clock > 0 { height += clockGap + clock }
        return Metrics(size: NSSize(width: width, height: ceil(height)), clock: clock, lines: lines, status: status)
    }

    static func size(_ bubble: JellyBubble) -> NSSize { metrics(bubble).size }

    /// 自下而上排：下内边距 → 按钮行 → 状态行 → 标题各行 → 时间 → 上内边距。
    static func frame(_ bubble: JellyBubble, bodyX: CGFloat, viewWidth: CGFloat) -> JellyBubbleLayout.Frame {
        let m = metrics(bubble)
        let boxWidth = min(m.size.width, viewWidth - edge * 2)
        let x = max(edge, min(bodyX - boxWidth / 2, viewWidth - edge - boxWidth))
        let rect = NSRect(x: x, y: JellyBubbleLayout.minY, width: boxWidth, height: m.size.height)
        // 尾巴离圆角至少 radius + tailHalf：轮廓上的缺口不会侵入圆角
        let tailInset = radius + tailHalf + 3
        let tailX = max(rect.minX + tailInset, min(bodyX, rect.maxX - tailInset))
        let innerX = rect.minX + pad, innerWidth = rect.width - pad * 2
        var y = rect.minY + pad
        let slot = NSRect(x: innerX, y: y, width: innerWidth, height: buttonHeight)
        var buttons: [NSRect] = []
        switch bubble.buttons.count {
        case 1: buttons = [slot]
        case 2:
            let total = innerWidth - buttonGap
            let first = floor(total * 1.6 / 2.6)      // 次按钮文字长，宽度权重 1.6；主按钮“停止”权重 1
            buttons = [NSRect(x: innerX, y: y, width: first, height: buttonHeight), NSRect(x: innerX + first + buttonGap, y: y, width: total - first, height: buttonHeight)]
        default: break
        }
        y += buttonHeight + buttonsGap
        let status = NSRect(x: innerX, y: y, width: innerWidth, height: m.status)
        y += m.status + statusGap
        var lines = [NSRect](repeating: .zero, count: m.lines.count)
        for i in stride(from: m.lines.count - 1, through: 0, by: -1) {
            lines[i] = NSRect(x: innerX, y: y, width: innerWidth, height: m.lines[i])
            y += m.lines[i] + lineGap
        }
        y -= lineGap
        var clock = NSRect.zero
        if m.clock > 0 { y += clockGap; clock = NSRect(x: innerX, y: y, width: innerWidth, height: m.clock) }
        return JellyBubbleLayout.Frame(rect: rect, tailX: tailX, title: .zero, text: .zero, status: status, buttons: buttons, clock: clock, lines: lines, slot: slot)
    }
}

/// 响铃气泡本体的绘制（按钮是真控件，不在这里画）：阴影与底板、金色描边、时间、标题、状态或确认语。
/// 弹出时气泡本体按尾巴尖为中心缩放并淡入（JellyRingMotion）；按钮在弹出后段淡入，由 JellyView 控制。
enum JellyRingPainter {
    /// 气泡轮廓：圆角矩形，底边在 tailX 处开一个缺口接上尾巴。是单一路径，描边时尾巴与本体之间没有横线。
    static func outline(rect: NSRect, tailX: CGFloat, tipY: CGFloat) -> NSBezierPath {
        let r = JellyRingLayout.radius, half = JellyRingLayout.tailHalf
        let path = NSBezierPath()
        path.move(to: NSPoint(x: rect.minX + r, y: rect.minY))
        path.line(to: NSPoint(x: tailX - half, y: rect.minY))
        path.line(to: NSPoint(x: tailX, y: tipY))
        path.line(to: NSPoint(x: tailX + half, y: rect.minY))
        path.line(to: NSPoint(x: rect.maxX - r, y: rect.minY))
        path.appendArc(withCenter: NSPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: -90, endAngle: 0)
        path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - r))
        path.appendArc(withCenter: NSPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: 0, endAngle: 90)
        path.line(to: NSPoint(x: rect.minX + r, y: rect.maxY))
        path.appendArc(withCenter: NSPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: 90, endAngle: 180)
        path.line(to: NSPoint(x: rect.minX, y: rect.minY + r))
        path.appendArc(withCenter: NSPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: 180, endAngle: 270)
        path.close()
        return path
    }

    static func draw(_ bubble: JellyBubble, frame: JellyBubbleLayout.Frame, palette: JellyBubblePalette, dark: Bool, age: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = frame.rect
        let tipY = rect.minY - JellyRingLayout.tail
        ctx.saveGState()
        ctx.translateBy(x: frame.tailX, y: tipY)
        let scale = JellyRingMotion.popScale(age: age)
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -frame.tailX, y: -tipY)
        ctx.setAlpha(JellyRingMotion.popAlpha(age: age))

        let shape = outline(rect: rect, tailX: frame.tailX, tipY: tipY)
        // 阴影：先填一层带阴影的底，再盖渐变（渐变本身半透明，底层与它叠在一起只会更不透明，不会降低文字对比度）
        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(dark ? 0.5 : 0.22)
        shadow.shadowBlurRadius = 10
        shadow.shadowOffset = NSSize(width: 0, height: -3)
        shadow.set()
        NSColor(palette.fillBottom).setFill()
        shape.fill()
        NSGraphicsContext.restoreGraphicsState()
        NSGraphicsContext.saveGraphicsState()
        shape.addClip()
        NSGradient(starting: NSColor(palette.fillTop), ending: NSColor(palette.fillBottom))?.draw(in: NSRect(x: rect.minX, y: tipY, width: rect.width, height: rect.height + JellyRingLayout.tail), angle: -90)
        NSGraphicsContext.restoreGraphicsState()
        NSColor(palette.border).setStroke()
        shape.lineWidth = 1
        shape.stroke()

        func text(_ value: String, in box: NSRect, font: NSFont, color: NSColor) {
            // 与 JellyBubbleLayout 同一套行高；向下多给 3 点余量避免取整误差把单行判成放不下
            let room = NSRect(x: box.minX, y: box.minY - 3, width: box.width, height: box.height + 3)
            (value as NSString).draw(with: room, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: JellyBubbleLayout.attributes(font, color: color, lineBreak: .byTruncatingTail))
        }
        if let clock = bubble.bigClock, !clock.isEmpty, frame.clock.height > 0 { text(clock, in: frame.clock, font: JellyRingLayout.clockFont, color: NSColor(palette.clock)) }
        let hasClock = !(bubble.bigClock ?? "").isEmpty
        let titleFont = JellyRingLayout.titleFont(count: bubble.lines.count, hasClock: hasClock)
        for (line, box) in zip(bubble.lines, frame.lines) { text(line, in: box, font: titleFont, color: NSColor(palette.title)) }
        if let confirm = bubble.confirm {
            let height = JellyBubbleLayout.lineHeight(JellyRingLayout.confirmFont)
            text(confirm, in: NSRect(x: frame.slot.minX, y: frame.slot.midY - height / 2, width: frame.slot.width, height: height), font: JellyRingLayout.confirmFont, color: NSColor(bubble.bad ? palette.error : palette.success))
        } else if let status = bubble.status {
            text(status, in: frame.status, font: JellyRingLayout.statusFont, color: NSColor(bubble.bad ? palette.error : palette.status))
        }
        ctx.restoreGState()
    }
}

/// 通栏胶囊按钮：真正的 NSButton 子类（键盘与辅助功能可用），自己画实心青色渐变（主）或淡色底（次）。
final class JellyPillButton: NSButton {
    var primary = false { didSet { needsDisplay = true } }
    var palette = JellyBubblePalette.light { didSet { needsDisplay = true } }
    private var hovering = false { didSet { needsDisplay = true } }
    private var area: NSTrackingArea?

    init(id: String, title: String, primary: Bool, target: AnyObject?, action: Selector) {
        super.init(frame: .zero)
        self.title = title
        self.primary = primary
        self.identifier = NSUserInterfaceItemIdentifier(id)
        self.target = target
        self.action = action
        isBordered = false
        setButtonType(.momentaryPushIn)
        focusRingType = .none
        setAccessibilityLabel(title)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var isFlipped: Bool { false }
    override var isOpaque: Bool { false }
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }    // 面板不是键盘窗口时，第一下点击也要生效
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let area = area { removeTrackingArea(area) }
        let next = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(next)
        area = next
    }
    override func mouseEntered(with event: NSEvent) { hovering = true }
    override func mouseExited(with event: NSEvent) { hovering = false }

    override func draw(_ dirtyRect: NSRect) {
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2)
        let dim: CGFloat = isEnabled ? 1 : 0.45
        let press: CGFloat = isHighlighted ? 0.16 : 0          // 按下略暗
        let hover: CGFloat = hovering && isEnabled ? 0.08 : 0   // 悬停略亮
        func tweak(_ color: JellyRGB) -> NSColor {
            let base = NSColor(color)
            let lit = base.blended(withFraction: hover, of: .white) ?? base
            let dark = lit.blended(withFraction: press, of: .black) ?? lit
            return dark.withAlphaComponent(CGFloat(color.a) * dim)
        }
        if primary {
            NSGradient(starting: tweak(palette.primaryTop), ending: tweak(palette.primaryBottom))?.draw(in: path, angle: -90)
        } else {
            tweak(palette.ghostFill).setFill()
            path.fill()
        }
        let font = JellyRingLayout.buttonFont
        let color = (primary ? NSColor(palette.primaryText) : NSColor(palette.ghostText)).withAlphaComponent(dim)
        let lineHeight = JellyBubbleLayout.lineHeight(font)
        let box = NSRect(x: bounds.minX + 8, y: bounds.midY - lineHeight / 2 - 1, width: bounds.width - 16, height: lineHeight + 3)
        (title as NSString).draw(with: box, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: JellyBubbleLayout.attributes(font, color: color, lineBreak: .byTruncatingTail))
        if window?.firstResponder === self && isEnabled {          // 键盘焦点环
            NSColor(palette.status).withAlphaComponent(0.8).setStroke()
            let ring = NSBezierPath(roundedRect: bounds.insetBy(dx: 1.5, dy: 1.5), xRadius: (bounds.height - 3) / 2, yRadius: (bounds.height - 3) / 2)
            ring.lineWidth = 2
            ring.stroke()
        }
    }
}
