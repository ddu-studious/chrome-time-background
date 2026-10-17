import AppKit

// 动物的画法（AppKit / CoreGraphics）：JellyView.draw 在生效物种不是水母时用它代替 JellyPainter。
//  · 几何来自 SpeciesGeometry（jelly-species.swift；形状数据的唯一来源是 js/jelly-species-shapes.js，由 gen-species.mjs 生成）：
//    每个部件带角色（body / limb / belly / accent / shine）、取色位置 u 和可选的转动（鳍、尾绕转轴摆动，幅度由 pose.wave 决定）；
//  · 颜色来自 JellyPaint，与水母共用同一套花纹语义：躯干用主色 a（七彩与渐变沿尾→头铺开），肢体取 limbTone(u)，描边取 outlineTone；
//    阶段色覆盖、夜晚推色已在 JellyView.draw 里改好 pose.paint，这里不再处理；
//  · 放置、朝向、俯仰由 SpeciesPlacement 一个变换完成（动物悬在窗口标准高度，并集包围盒居中），眼睛与腮红在放置之后按视图坐标画，
//    所以瞳孔跟随鼠标的方向不随朝向镜像；
//  · 本文件只管“怎么画”。放置、余量、包围盒、路径的数值由纯逻辑层的自测（companion-selftest.swift）核对，画出来的像素由隔离构建的截图核对。

enum SpeciesPainter {
    /// 眼睛的深色：与水母的脸同色。
    private static let ink = NSColor(calibratedRed: 0.16, green: 0.22, blue: 0.30, alpha: 0.88)

    static func draw(_ g: SpeciesGeometry, pose p: JellyPose, centerX cx: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let placement = SpeciesPlacement.transform(g, centerX: cx, facing: p.facing, pitch: p.pitch)
        ctx.saveGState()
        ctx.concatenate(placement)
        ctx.setLineJoin(.round)
        ctx.setLineCap(.round)
        for part in g.parts {
            let path = part.path(wave: p.wave)
            switch part.role {
            case .limb: paintLimb(ctx, path, tone: p.paint.limbTone(u: part.u))
            case .body: paintBody(ctx, path, bounds: g.bodyBounds, paint: p.paint)
            case .belly: paintFlat(ctx, path, color: p.paint.a.color(0.92, lighten: 0.72))
            case .accent: paintFlat(ctx, path, color: NSColor.white.withAlphaComponent(0.55))
            case .shine: paintFlat(ctx, path, color: NSColor.white.withAlphaComponent(0.40))
            }
        }
        ctx.restoreGState()
        paintFace(g, placement: placement, pose: p)
    }

    /// 睡着时 “z” 的锚点（视图坐标）：朝向一侧的前端上方，跟着头走。
    static func sleepAnchor(_ g: SpeciesGeometry, centerX cx: CGFloat, pose p: JellyPose) -> CGPoint {
        let placement = SpeciesPlacement.transform(g, centerX: cx, facing: p.facing, pitch: p.pitch)
        return CGPoint(x: g.union.maxX - g.union.width * 0.12, y: g.union.maxY).applying(placement)
    }

    // MARK: 部件

    private static func clipped(_ ctx: CGContext, _ path: CGPath, _ body: () -> Void) {
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        body()
        ctx.restoreGState()
    }

    private static func stroke(_ ctx: CGContext, _ path: CGPath, color: NSColor, width: CGFloat) {
        ctx.addPath(path)
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(width)
        ctx.strokePath()
    }

    private static func gradient(_ colors: [NSColor], _ locations: [CGFloat]) -> NSGradient? {
        NSGradient(colors: colors, atLocations: locations, colorSpace: .deviceRGB)
    }

    private static let clampBoth: NSGradient.DrawingOptions = [.drawsBeforeStartingLocation, .drawsAfterEndingLocation]

    private static func paintFlat(_ ctx: CGContext, _ path: CGPath, color: NSColor) {
        ctx.addPath(path)
        ctx.setFillColor(color.cgColor)
        ctx.fillPath()
    }

    /// 肢体（鳍、尾、鳍状肢）：肢体颜色上浅下深的小渐变 + 同色系的深描边。
    private static func paintLimb(_ ctx: CGContext, _ path: CGPath, tone: JellyTint) {
        let box = path.boundingBoxOfPath
        guard box.width.isFinite, box.height.isFinite, box.height > 0 else { return }
        clipped(ctx, path) {
            gradient([tone.color(0.92, darken: 0.06), tone.color(0.95, lighten: 0.34)], [0, 1])?
                .draw(from: NSPoint(x: box.midX, y: box.minY), to: NSPoint(x: box.midX, y: box.maxY), options: clampBoth)
        }
        stroke(ctx, path, color: tone.color(0.9, darken: 0.30), width: 1.0)
    }

    /// 躯干：纯色/双色用主色自下而上由深到浅；渐变沿尾→头由主色过渡到第二色；七彩沿尾→头三色铺开；后两者再叠一层自上而下的亮度保留立体感。
    private static func paintBody(_ ctx: CGContext, _ path: CGPath, bounds box: CGRect, paint: JellyPaint) {
        guard box.width > 0, box.height > 0 else { return }
        let vertical = (NSPoint(x: box.midX, y: box.minY), NSPoint(x: box.midX, y: box.maxY))
        let lengthwise = (NSPoint(x: box.minX, y: box.midY), NSPoint(x: box.maxX, y: box.midY))
        clipped(ctx, path) {
            switch paint.kind {
            case .solid, .duo:
                gradient([paint.a.color(0.93, darken: 0.05), paint.a.color(0.95, lighten: 0.22), paint.a.color(0.97, lighten: 0.50)], [0, 0.55, 1])?
                    .draw(from: vertical.0, to: vertical.1, options: clampBoth)
            case .blend:
                gradient([paint.a.color(0.95, lighten: 0.22), paint.b.color(0.95, lighten: 0.22)], [0, 1])?
                    .draw(from: lengthwise.0, to: lengthwise.1, options: clampBoth)
                gradient([NSColor.white.withAlphaComponent(0), NSColor.white.withAlphaComponent(0.32)], [0, 1])?
                    .draw(from: vertical.0, to: vertical.1, options: clampBoth)
            case .rainbow:
                gradient([paint.a.color(0.95, lighten: 0.22), paint.b.color(0.95, lighten: 0.22), paint.c.color(0.95, lighten: 0.22)], [0, 0.5, 1])?
                    .draw(from: lengthwise.0, to: lengthwise.1, options: clampBoth)
                gradient([NSColor.white.withAlphaComponent(0), NSColor.white.withAlphaComponent(0.32)], [0, 1])?
                    .draw(from: vertical.0, to: vertical.1, options: clampBoth)
            }
        }
        stroke(ctx, path, color: paint.outlineTone.color(0.9, darken: 0.28), width: 1.1)
    }

    // MARK: 脸（视图坐标）

    private static func paintFace(_ g: SpeciesGeometry, placement: CGAffineTransform, pose p: JellyPose) {
        let asleep = p.asleep && !p.grabbed
        let narrow = max(0.35, abs(p.facing))            // 转身途中眼睛变窄，但不消失
        let open = max(0.12, 1 - p.blink)
        let radius = g.eyeRadius * (p.alert && !asleep ? 1.25 : 1)
        for eye in g.eyes {
            let c = eye.applying(placement)
            let ex = c.x + p.look.x * 1.4, ey = c.y + p.look.y * 1.0
            if asleep {
                let arc = NSBezierPath()
                arc.lineWidth = 1.3
                arc.lineCapStyle = .round
                let half = radius * 1.25 * narrow
                arc.move(to: NSPoint(x: ex - half, y: ey + 0.8))
                arc.curve(to: NSPoint(x: ex + half, y: ey + 0.8), controlPoint1: NSPoint(x: ex - half * 0.6, y: ey - 2.2), controlPoint2: NSPoint(x: ex + half * 0.6, y: ey - 2.2))
                ink.setStroke()
                arc.stroke()
            } else {
                ink.setFill()
                NSBezierPath(ovalIn: NSRect(x: ex - radius * narrow, y: ey - radius * open, width: radius * 2 * narrow, height: radius * 2 * open)).fill()
                NSColor.white.withAlphaComponent(0.85).setFill()
                NSBezierPath(ovalIn: NSRect(x: ex - radius * 0.1 * narrow, y: ey + radius * 0.1 * open, width: radius * 0.6 * narrow, height: radius * 0.6 * open)).fill()
            }
        }
        NSColor(calibratedRed: 1.0, green: 0.55, blue: 0.62, alpha: 0.34).setFill()
        for spot in g.blush {
            let c = spot.center.applying(placement)
            NSBezierPath(ovalIn: NSRect(x: c.x - spot.rx * narrow, y: c.y - spot.ry, width: spot.rx * 2 * narrow, height: spot.ry * 2)).fill()
        }
    }
}
