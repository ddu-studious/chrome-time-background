import AppKit

// NSVisualEffectView needs a material mask, not only a CALayer corner radius.
// A content-view mask also gives WindowServer the correct rounded shadow shape.
// 现在只有交互确认卡片使用它（倒计时胶囊已随协议 v6 取消，水母自己用 Core Graphics 绘制）。
final class GlassView: NSVisualEffectView {
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
