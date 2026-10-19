import AppKit

// 写实海洋动物的 CoreGraphics 画笔：把 MarineRigEvaluator.evaluate 的 ops 画进当前图形上下文（桌面水母窗口）。
// 水族馆在 js/marine-rig-canvas.js 里用 Canvas 2D 画**同一份** ops——这里和那里都只做“数据 → 绘制调用”，不做任何形状、颜色或姿态决定
// （形状与颜色在 js/marine-rig-data.js，姿态在 marine-rig.swift 的求值里），所以两个平台的动物是同一只。
//  · 颜色按 sRGB 解释（Canvas 也是 sRGB），通道取 8 位、不透明度取 3 位小数，与 JS 的 css() 一致；
//  · 渐变按两端夹取（canvas 的 createLinearGradient 行为），填充规则（nonzero / evenodd）与描边线帽照 op；
//  · 骨架坐标 y 向下、体长 100 单位：先按 unit 缩放并翻 y，再套 SpeciesPlacement 的放置（并集居中、顶端离窗口底边 91 pt、俯仰、朝向翻转），
//    所以写实与卡通动物悬在同一个标准高度，光晕、涟漪、“z” 的锚点规则相同；
//  · 阶段色（倒计时临近/紧迫/最后 10 秒）以 stageMix 为强度向阶段色混合一部分，保留动物的明暗与细节；平静时不混，用自然体色。
enum MarineRigPainter {
    /// 阶段色混入的最大强度：足以一眼看出“变红了/变黄了”，又不抹掉鳍的深浅、斑点与眼睛。
    static let stageTintStrength: CGFloat = 0.34

    private static let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

    private static func clamp01(_ value: Double) -> Double { value < 0 ? 0 : (value > 1 ? 1 : value) }

    /// rgba（各分量 0…1）→ CGColor：scale 乘到不透明度上，tint 把颜色向目标色混合；与 js/marine-rig-canvas.js 的 css() 同一套量化。
    static func color(_ rgba: [Double], scale: Double, tint: (r: Double, g: Double, b: Double, amount: Double)?) -> CGColor {
        var r = rgba[0], g = rgba[1], b = rgba[2]
        if let tint = tint, tint.amount > 0 {
            let k = clamp01(tint.amount)
            r += (tint.r - r) * k; g += (tint.g - g) * k; b += (tint.b - b) * k
        }
        func channel(_ value: Double) -> CGFloat { CGFloat((clamp01(value) * 255).rounded() / 255) }
        let alpha = (clamp01(rgba[3] * scale) * 1000).rounded() / 1000
        return CGColor(colorSpace: space, components: [channel(r), channel(g), channel(b), CGFloat(alpha)]) ?? CGColor(gray: 0, alpha: 0)
    }

    private static func path(_ polys: [MarinePoly]) -> CGMutablePath {
        let path = CGMutablePath()
        for poly in polys {
            let pts = poly.pts
            let n = pts.count
            if n < 4 { continue }      // 少于两个点画不出东西（与 JS 的 tracePolys 一致）
            path.move(to: CGPoint(x: pts[0], y: pts[1]))
            var i = 2
            while i < n { path.addLine(to: CGPoint(x: pts[i], y: pts[i + 1])); i += 2 }
            if poly.closed { path.closeSubpath() }
        }
        return path
    }

    /// 在已经建立好骨架坐标系的上下文里画 ops（调用方负责 save/restore 与坐标变换；线宽是骨架单位）。
    static func drawOps(_ ctx: CGContext, _ ops: [MarineOp], alpha: Double = 1, tint: (r: Double, g: Double, b: Double, amount: Double)? = nil) {
        let scale = alpha.isFinite ? clamp01(alpha) : 1
        if scale <= 0 { return }
        let mixing = (tint?.amount ?? 0) > 0 ? tint : nil
        for op in ops {
            let shape = path(op.polys)
            switch op.kind {
            case .fill:
                guard let paint = op.paint else { continue }
                switch paint {
                case .rgba(let r, let g, let b, let a):
                    ctx.addPath(shape)
                    ctx.setFillColor(color([r, g, b, a], scale: scale, tint: mixing))
                    ctx.fillPath(using: op.evenOdd ? .evenOdd : .winding)
                case .gradient(let ax, let ay, let bx, let by, let stops):
                    var components: [CGFloat] = []
                    var locations: [CGFloat] = []
                    for stop in stops {
                        let c = color([stop[1], stop[2], stop[3], stop[4]], scale: scale, tint: mixing).components ?? [0, 0, 0, 0]
                        components.append(contentsOf: c.prefix(4))
                        locations.append(CGFloat(clamp01(stop[0])))
                    }
                    guard let gradient = CGGradient(colorSpace: space, colorComponents: components, locations: locations, count: stops.count) else { continue }
                    ctx.saveGState()
                    ctx.addPath(shape)
                    ctx.clip(using: op.evenOdd ? .evenOdd : .winding)
                    ctx.drawLinearGradient(gradient, start: CGPoint(x: ax, y: ay), end: CGPoint(x: bx, y: by), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
                    ctx.restoreGState()
                }
            case .stroke:
                ctx.addPath(shape)
                ctx.setLineWidth(CGFloat(op.width))
                ctx.setLineCap(op.butt ? .butt : .round)
                ctx.setLineJoin(.round)
                ctx.setStrokeColor(color(op.rgba, scale: scale, tint: mixing))
                ctx.strokePath()
            }
        }
    }

    /// 骨架坐标 → 视图坐标的变换：先按 unit 缩放并翻 y（骨架 y 向下、视图 y 向上），再放置（并集居中、俯仰、朝向翻转、标准高度）。
    static func transform(_ g: MarineRigGeometry, centerX cx: CGFloat, facing: CGFloat, pitch: CGFloat) -> CGAffineTransform {
        CGAffineTransform(scaleX: g.unit, y: -g.unit)
            .concatenating(SpeciesPlacement.transform(union: g.union, centerX: cx, facing: facing, pitch: pitch))
    }

    /// 姿态里写实动物的求值姿态：相位与幅度来自 SpeciesPose，不转弯（桌面上的转身靠朝向翻转），细节档取最高。
    static func rigPose(_ p: JellyPose) -> MarineRigPose {
        MarineRigPose(phase: Double(p.rigPhase), amp: Double(p.rigAmp), turn: 0, lod: 2)
    }

    /// 阶段色混入：stageMix 为 0（平静）不混；否则向 p.tint（此时就是阶段色）混入 stageTintStrength × stageMix。
    static func tint(_ p: JellyPose) -> (r: Double, g: Double, b: Double, amount: Double)? {
        let mix = max(0, min(1, p.stageMix))
        guard mix > 0.004 else { return nil }
        return (Double(p.tint.r), Double(p.tint.g), Double(p.tint.b), Double(stageTintStrength * mix))
    }

    static func draw(_ g: MarineRigGeometry, pose p: JellyPose, centerX cx: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let evaluation = MarineRigEvaluator.evaluate(g.rig, pose: rigPose(p))
        ctx.saveGState()
        ctx.concatenate(transform(g, centerX: cx, facing: p.facing, pitch: p.pitch))
        drawOps(ctx, evaluation.ops, tint: tint(p))
        ctx.restoreGState()
    }

    /// 睡着时 “z” 的锚点（视图坐标）：朝向一侧的前端上方，跟着头走。侧视动物与卡通动物一样取并集顶端；
    /// 俯视的蝠鲼与海龟翼展/鳍展远大于身体，取并集顶端会让 “z” 飘在翼尖上方、离头很远，所以取中线上方 20 pt（不超过并集半高）。
    static func sleepAnchor(_ g: MarineRigGeometry, centerX cx: CGFloat, pose p: JellyPose) -> CGPoint {
        let placement = SpeciesPlacement.transform(union: g.union, centerX: cx, facing: p.facing, pitch: p.pitch)
        let u = g.union
        let y = g.rig.view == .top ? u.midY + min(u.height / 2, 20) : u.maxY
        return CGPoint(x: u.maxX - u.width * 0.12, y: y).applying(placement)
    }
}
