import AppKit

// NSVisualEffectView needs a material mask, not only a CALayer corner radius.
// A content-view mask also gives WindowServer the correct rounded shadow shape.
final class CountdownGlass: NSVisualEffectView {
    var onLayout: (() -> Void)?
    var fixedCornerRadius: CGFloat?
    private var maskedSize = NSSize.zero
    override var mouseDownCanMoveWindow: Bool { true }
    override func layout() {
        super.layout()
        if bounds.size != maskedSize, bounds.width > 0, bounds.height > 0 {
            maskedSize = bounds.size
            let size = bounds.size
            maskImage = NSImage(size: size, flipped: false) { rect in
                NSColor.black.setFill()
                NSBezierPath(roundedRect: rect, xRadius: self.fixedCornerRadius ?? rect.height / 2, yRadius: self.fixedCornerRadius ?? rect.height / 2).fill()
                return true
            }
            layer?.cornerRadius = fixedCornerRadius ?? bounds.height / 2
            window?.invalidateShadow()
        }
        onLayout?()
    }
}

final class CountdownResizeGrip: NSView {
    var onResize: ((CGFloat) -> Void)?
    var onFinish: (() -> Void)?
    private var anchor = NSPoint.zero
    private var startingWidth: CGFloat = 340
    private var didDrag = false
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    private func screenPoint(_ event: NSEvent) -> NSPoint {
        event.window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation
    }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
    override func mouseDown(with event: NSEvent) {
        didDrag = false
        anchor = screenPoint(event)
        startingWidth = window?.frame.width ?? 340
    }
    override func mouseDragged(with event: NSEvent) {
        let delta = screenPoint(event) - anchor
        if abs(delta.x) + abs(delta.y) > 2 { didDrag = true }
        // Project a diagonal drag onto the fixed 3.4:1 aspect ratio.
        onResize?(startingWidth + (delta.x - delta.y / 3.4) / (1 + 1 / (3.4 * 3.4)))
    }
    override func mouseUp(with event: NSEvent) {
        onFinish?()
        if !didDrag { _ = accessibilityPerformPress() }
    }
    override func accessibilityPerformPress() -> Bool {
        guard let menu = menu else { return false }
        menu.popUp(positioning: nil, at: NSPoint(x: bounds.midX, y: bounds.minY), in: self)
        return true
    }
    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedWhite: 0.35, alpha: 0.6).setStroke()
        let path = NSBezierPath()
        path.lineWidth = 1.3
        path.lineCapStyle = .round
        let c = NSPoint(x: bounds.midX, y: bounds.midY)
        for offset: CGFloat in [-3, 2] {
            path.move(to: NSPoint(x: c.x - 3 + offset, y: c.y - 3))
            path.line(to: NSPoint(x: c.x + 3 + offset, y: c.y + 3))
        }
        path.stroke()
    }
}

private func - (lhs: NSPoint, rhs: NSPoint) -> NSPoint { NSPoint(x: lhs.x - rhs.x, y: lhs.y - rhs.y) }
