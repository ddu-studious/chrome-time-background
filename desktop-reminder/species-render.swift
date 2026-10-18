import AppKit

// 动物绘制层的离屏渲染工具（只用于验收，不进产品）：用与产品完全相同的源文件和同一个 JellyView.draw，
// 把指定的物种 / 外观 / 姿态画进位图并存成 PNG，由 species-render.mjs 独立量像素。
// 不创建窗口、不截屏、不碰键盘鼠标，所以结果确定、不受桌面上其他东西影响。
//
// 用法（由 species-render.mjs 编译并调用，本文件在编译时作为 main.swift 使用）：
//   species-render <cases.json> <输出目录>
//   species-render --palette                   输出产品里的 8 个色位（JSON：[[r,g,b], …]，0…1）
// cases.json 是数组，每项：
//   { name, species, colors: [色位…], look, facing, pitch, wave, dark, night, asleep, grabbed, blink, alert, ripples, scale, gaze, direct, show }
// 除 name / species / colors / look 外都可省略（朝右、不俯仰、不划水、浅色外观、白天、醒着、没被抓、不眨眼、不警觉、不画涟漪、2 倍、瞳孔居中、走 JellyView）。
// direct 为真时不经过 JellyView，直接用 SpeciesPainter.draw 画进位图（动物以外什么都没有：没有光晕、涟漪、“z”、气泡），并可以用 show 只画一部分元素：
//   show: { parts: [部件下标…], strokes, eyes, blush, mouth }，没写的项照常画（parts 不写 = 全部部件）。
//   这是“画与不画”差分检查的入口：只画一个元素得到它自己画上去的东西，检查脚本独立量它的形状、透明度、描边与颜色，
//   再把各层叠起来与整只图对照。直接画与 JellyView 画的整只图必须逐像素一致（检查脚本核对，不一致就是视图在动物之外多画了东西、或者直接画的环境不对）。
// gaze 是瞳孔跟随的方向 [x, y]（−1…1，对应 JellyPose.look）。
// grabbed 与 asleep 同时为真时，动物应当醒着（睁眼、没有 “z”、侧视的有笑）：用户抓住睡着的水母时它会醒来。
// 工具固定开着“减少动态效果”，所以 ripples 画的是两圈静止的涟漪（与时间无关，见 JellyRingMotion.ripples）。
// 标准输出是一个 JSON 数组，每项 { name, file, species（实际生效的物种；画不出来时会是 jelly）, appearance, direct, show（实际生效的元素可见性，原样回报）, width, height, scale }。

struct RenderCase: Decodable {
    var name: String
    var species: String
    var colors: [Int]
    var look: String
    var facing: Double?
    var pitch: Double?
    var wave: Double?
    var dark: Bool?
    var night: Double?
    var asleep: Bool?
    var grabbed: Bool?
    var blink: Double?
    var alert: Bool?
    var ripples: Bool?
    var scale: Int?
    var gaze: [Double]?
    var direct: Bool?
    var show: ShowCase?
}

/// 元素可见性的请求（直接画时用），字段含义见 SpeciesVisibility。
struct ShowCase: Decodable {
    var parts: [Int]?
    var strokes: Bool?
    var eyes: Bool?
    var blush: Bool?
    var mouth: Bool?

    var visibility: SpeciesVisibility {
        var v = SpeciesVisibility()
        if let parts = parts { v.parts = Set(parts) }
        v.strokes = strokes ?? true
        v.eyes = eyes ?? true
        v.blush = blush ?? true
        v.mouth = mouth ?? true
        return v
    }
}

/// jelly-companion.swift 里的窗口类型 ReminderPanel 在产品的 main.swift 里定义；本工具只画 JellyView、不创建窗口，放一个同名占位好让源文件一起编译。
final class ReminderPanel: NSPanel {}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(2)
}

// 与桌面水母的窗口一致（JellyCompanion.size）
let viewSize = NSSize(width: 170, height: 150)

func makeAppearance(_ item: RenderCase) -> JellyAppearance {
    JellyAppearance.parse([
        "colors": item.colors, "look": item.look, "material": "glass", "size": "medium", "species": item.species,
    ] as [String: Any])
}

func makePose(_ item: RenderCase, _ appearance: JellyAppearance) -> JellyPose {
    var pose = JellyPose()
    pose.asleep = item.asleep ?? false
    pose.grabbed = item.grabbed ?? false
    pose.alert = item.alert ?? false
    pose.ripples = item.ripples ?? false
    pose.blink = CGFloat(item.blink ?? 0)
    pose.night = CGFloat(item.night ?? 0)
    pose.species = appearance.species.effective
    pose.facing = CGFloat(item.facing ?? 1)
    pose.pitch = CGFloat(item.pitch ?? 0)
    pose.wave = CGFloat(item.wave ?? 0)
    if let gaze = item.gaze, gaze.count == 2 { pose.look = CGPoint(x: gaze[0], y: gaze[1]) }
    pose.paint = JellyPaint.make(appearance: appearance)
    pose.tint = pose.paint.a
    return pose
}

func makeBitmap(_ scale: Int) -> NSBitmapImageRep {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(viewSize.width) * scale, pixelsHigh: Int(viewSize.height) * scale,
                                     bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { fail("无法创建位图") }
    rep.size = viewSize
    return rep
}

func render(_ item: RenderCase) -> (rep: NSBitmapImageRep, species: JellySpecies, appearance: String) {
    let appearance = makeAppearance(item)
    let scale = max(1, min(4, item.scale ?? 2))
    let view = JellyView(frame: NSRect(origin: .zero, size: viewSize))
    view.appearance = NSAppearance(named: (item.dark ?? false) ? .darkAqua : .aqua)
    view.reduceMotion = true
    view.jellyAppearance = appearance
    view.pose = makePose(item, appearance)
    let rep = makeBitmap(scale)
    view.cacheDisplay(in: view.bounds, to: rep)
    // 外观名取产品自己的判断（JellyView.appearanceName，与 ping 回执同一个来源），不是转述请求里的 dark：检查脚本据此确认“深色/浅色”真的切过去了，
    // 否则“动物在两种外观下逐像素相同”这类检查在渲染工具根本没切换外观时也会通过（变异检查里删掉那行赋值，全部检查依然全绿）
    return (rep, appearance.species.effective, view.appearanceName)
}

/// 直接画：不经过 JellyView，只调用 SpeciesPainter.draw（与 JellyView.drawAnimal 同一个调用，水平中心也相同），并按请求只画一部分元素。
/// 位图一开始是全透明，所以只画一个元素时，图上除了它之外什么都没有。动物的画法与外观（深浅）无关，所以不报告外观。
func renderDirect(_ item: RenderCase) -> (rep: NSBitmapImageRep, species: JellySpecies) {
    let appearance = makeAppearance(item)
    let scale = max(1, min(4, item.scale ?? 2))
    let pose = makePose(item, appearance)
    guard pose.species != .jelly, let geometry = JellySpeciesGeometry.of(pose.species) else { fail("\(item.name)：\(item.species) 没有动物几何，不能直接画") }
    let rep = makeBitmap(scale)
    guard let context = NSGraphicsContext(bitmapImageRep: rep) else { fail("无法创建绘图环境") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    SpeciesPainter.draw(geometry, pose: pose, centerX: viewSize.width / 2, show: item.show?.visibility ?? .all)
    NSGraphicsContext.restoreGraphicsState()
    return (rep, pose.species)
}

let arguments = CommandLine.arguments
// 调色板（产品里的色位 RGB，0…1）：检查脚本据此算期望色相，不在脚本里另抄一份
if arguments.count == 2 && arguments[1] == "--palette" {
    let palette = JellyAppearance.palette.map { [$0.r, $0.g, $0.b] }
    guard let output = try? JSONSerialization.data(withJSONObject: palette) else { fail("无法编码调色板") }
    FileHandle.standardOutput.write(output)
    exit(0)
}
guard arguments.count == 3 else { fail("用法：species-render <cases.json> <输出目录> | species-render --palette") }
_ = NSApplication.shared
guard let data = FileManager.default.contents(atPath: arguments[1]) else { fail("读不到 \(arguments[1])") }
let cases: [RenderCase]
do { cases = try JSONDecoder().decode([RenderCase].self, from: data) } catch { fail("cases.json 格式不对：\(error)") }
do { try FileManager.default.createDirectory(atPath: arguments[2], withIntermediateDirectories: true) } catch { fail("无法创建输出目录：\(error)") }

var manifest: [[String: Any]] = []
for item in cases {
    guard item.name.range(of: "^[A-Za-z0-9._-]{1,80}$", options: .regularExpression) != nil else { fail("用例名不合规：\(item.name)") }
    let direct = item.direct ?? false
    let rep: NSBitmapImageRep, species: JellySpecies, appearanceName: String
    if direct {
        (rep, species) = renderDirect(item)
        appearanceName = "none"
    } else {
        if item.show != nil { fail("\(item.name)：show 只在 direct 渲染里有意义（走 JellyView 时没有隔离元素的入口）") }
        (rep, species, appearanceName) = render(item)
    }
    guard let png = rep.representation(using: .png, properties: [:]) else { fail("无法编码 PNG：\(item.name)") }
    let file = (arguments[2] as NSString).appendingPathComponent("\(item.name).png")
    do { try png.write(to: URL(fileURLWithPath: file)) } catch { fail("无法写入 \(file)：\(error)") }
    // 实际生效的元素可见性原样回报（没有 show 的用例报告“全部”）：检查脚本据此确认请求的隔离真的生效了，
    // 否则渲染工具忽略 show、每次都画整只时，“只画这一个”的各项检查拿到的是整只图
    let v = item.show?.visibility ?? .all
    let shown: [String: Any] = ["parts": v.parts.map { Array($0).sorted() } ?? NSNull(), "strokes": v.strokes, "eyes": v.eyes, "blush": v.blush, "mouth": v.mouth]
    manifest.append(["name": item.name, "file": file, "species": species.rawValue, "appearance": appearanceName, "direct": direct, "show": shown,
                     "width": rep.pixelsWide, "height": rep.pixelsHigh, "scale": max(1, min(4, item.scale ?? 2))])
}
guard let output = try? JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys]) else { fail("无法编码清单") }
FileHandle.standardOutput.write(output)
