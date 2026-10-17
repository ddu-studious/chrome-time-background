// 自动生成，请勿手改：node desktop-reminder/gen-species.mjs
// 来源：js/jelly-species-shapes.js（唯一的形状来源；部件顺序即绘制顺序，mirror 与椭圆已展开成 M/L/C/Q/Z 绝对路径，未缩放、y 向下）。
// 改形状只改来源文件然后重新生成；test/jelly-species-gen.test.mjs 检查本文件与来源一致，companion-selftest 对拍 Swift 解析与包围盒。
enum JellySpeciesData {
    static let sources: [JellySpecies: SpeciesSource] = [
        .hammer: SpeciesSource(
            view: .top, scale: 0.89,
            parts: [
                SpeciesPartSource(role: .limb, u: 0.57, path: "M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z", motion: nil),
                SpeciesPartSource(role: .limb, u: 0.57, path: "M 10 7 L -2 25 C -6 22 -8 14 -9 6 Z", motion: nil),
                SpeciesPartSource(role: .limb, u: 0.1, path: "M -28 -2 C -36 -5 -45 -13 -53 -17 C -50 -9 -48 -3 -44 0 C -48 3 -50 9 -52 13 C -46 10 -36 5 -28 2 Z", motion: SpeciesMotionSource(pivotX: -28, pivotY: 0, degrees: 12)),
                SpeciesPartSource(role: .body, u: 0.5, path: "M 24 -8 C 10 -9 -10 -8 -30 -2 L -30 2 C -10 8 10 9 24 8 Z", motion: nil),
                SpeciesPartSource(role: .body, u: 0.5, path: "M 22 -11 C 28 -22 36 -22 36 -14 L 36 14 C 36 22 28 22 22 11 Z", motion: nil),
                SpeciesPartSource(role: .shine, u: 0.5, path: "M 11.993 -5.419 C 12.039 -4.094 6.707 -2.833 0.084 -2.601 C -6.54 -2.37 -11.946 -3.257 -11.993 -4.581 C -12.039 -5.906 -6.707 -7.167 -0.084 -7.399 C 6.54 -7.63 11.946 -6.743 11.993 -5.419 Z", motion: nil),
            ],
            eyeRadius: 2.2, eyes: [[32, -17], [32, 17]],
            blush: [[30, -10, 2.6, 1.8], [30, 10, 2.6, 1.8]]),
    ]
}
