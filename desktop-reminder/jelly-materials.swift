import AppKit

// 水母的画法：钟罩、触手、脸交给 painter，JellyView.draw 只负责位置、倾斜、夜晚荧光、睡觉标记与气泡。
// 本轮只有 GlassPainter（把原来 JellyView 里的画法原样搬进来，只改了取色）；软糖/毛绒/线框/铅笔/像素在后续档位加入，
// 它们实现同一个协议，由 JellyPainters.painter(for:) 按 appearance.material 选择。
// 颜料（JellyTint / JellyPaint，花纹→各部位颜色）是纯逻辑，在 jelly-paint.swift，由自测与 JS 的 paintOf 对照。

/// 一种材质的画法。坐标约定与原来的 JellyView 相同：cx 为身体中心横坐标，by 为钟罩底边，w/h 为钟罩宽高。
/// 调用顺序固定为 tentacles → bell → face，且都在同一个已旋转的图形上下文里。
protocol JellyPainter {
    func tentacles(cx: CGFloat, by: CGFloat, w: CGFloat, p: JellyPose)
    func bell(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose)
    func face(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose)
}

enum JellyPainters {
    /// 按材质选画法；本轮所有材质都先用玻璃（其他材质尚未实现，解析出来也不影响画面）。
    static func painter(for material: JellyAppearance.Material) -> JellyPainter { GlassPainter() }
}

/// 玻璃果冻：原来的画法。`.solid` 与旧版逐像素一致（取色走 paint.a，与旧的 p.tint 同值）。
struct GlassPainter: JellyPainter {
    func tentacles(cx: CGFloat, by: CGFloat, w: CGFloat, p: JellyPose) {
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
            p.paint.tentacleTone(index: i, count: count).color(0.55, lighten: 0.15).setStroke()
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
            p.paint.oralTone.color(0.34, lighten: 0.4).setStroke()
            path.stroke()
        }
    }

    /// 钟罩填充：纯色/双色用主色的三段渐变（与旧版逐字相同）；渐变花纹由边缘主色过渡到中心第二色；
    /// 七彩把三种颜色沿钟罩横向铺开，再叠一层自上而下的亮度保留立体感。
    private func fill(_ bell: NSBezierPath, _ paint: JellyPaint) {
        switch paint.kind {
        case .solid, .duo:
            let gradient = NSGradient(colors: [paint.a.color(0.50), paint.a.color(0.74, lighten: 0.22), paint.a.color(0.94, lighten: 0.45)],
                                      atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)
            gradient?.draw(in: bell, angle: 90)
        case .blend:
            let mid = paint.a.mixed(toward: paint.b, 0.5)
            let gradient = NSGradient(colors: [paint.a.color(0.50), mid.color(0.74, lighten: 0.22), paint.b.color(0.94, lighten: 0.45)],
                                      atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)
            gradient?.draw(in: bell, angle: 90)
        case .rainbow:
            let bands = NSGradient(colors: [paint.a.color(0.74, lighten: 0.22), paint.b.color(0.74, lighten: 0.22), paint.c.color(0.74, lighten: 0.22)],
                                   atLocations: [0, 0.5, 1], colorSpace: .deviceRGB)
            bands?.draw(in: bell, angle: 0)
            let light = NSGradient(colors: [NSColor.white.withAlphaComponent(0.0), NSColor.white.withAlphaComponent(0.30)],
                                   atLocations: [0, 1], colorSpace: .deviceRGB)
            light?.draw(in: bell, angle: 90)
        }
    }

    func bell(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose) {
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
        fill(bell, p.paint)
        p.paint.outlineTone.color(0.85, darken: 0.12).setStroke()
        bell.lineWidth = 1.2
        bell.stroke()

        // 高光与斑点
        NSColor.white.withAlphaComponent(0.42).setFill()
        NSBezierPath(ovalIn: NSRect(x: cx - w * 0.30, y: by + h * 0.58, width: w * 0.20, height: h * 0.20)).fill()
        NSColor.white.withAlphaComponent(0.22).setFill()
        for (dx, dy, r) in [(0.18, 0.72, 2.2), (0.30, 0.55, 1.6), (0.06, 0.82, 1.4)] as [(CGFloat, CGFloat, CGFloat)] {
            NSBezierPath(ovalIn: NSRect(x: cx + w * dx - r, y: by + h * dy - r, width: r * 2, height: r * 2)).fill()
        }
    }

    func face(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose) {
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
}
