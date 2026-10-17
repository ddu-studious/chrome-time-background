import AppKit

// 动物绘制层的离屏渲染工具（只用于验收，不进产品）：用与产品完全相同的源文件和同一个 JellyView.draw，
// 把指定的物种 / 外观 / 姿态画进位图并存成 PNG，由 species-render.mjs 独立量像素。
// 不创建窗口、不截屏、不碰键盘鼠标，所以结果确定、不受桌面上其他东西影响。
//
// 用法（由 species-render.mjs 编译并调用，本文件在编译时作为 main.swift 使用）：
//   species-render <cases.json> <输出目录>
//   species-render --palette                   输出产品里的 8 个色位（JSON：[[r,g,b], …]，0…1）
// cases.json 是数组，每项：
//   { name, species, colors: [色位…], look, facing, pitch, wave, dark, night, asleep, blink, alert, ripples, scale }
// 除 name / species / colors / look 外都可省略（朝右、不俯仰、不划水、浅色外观、白天、醒着、不眨眼、不警觉、不画涟漪、2 倍）。
// 工具固定开着“减少动态效果”，所以 ripples 画的是两圈静止的涟漪（与时间无关，见 JellyRingMotion.ripples）。
// 标准输出是一个 JSON 数组，每项 { name, file, species（实际生效的物种；画不出来时会是 jelly）, width, height, scale }。

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
    var blink: Double?
    var alert: Bool?
    var ripples: Bool?
    var scale: Int?
}

/// jelly-companion.swift 里的窗口类型 ReminderPanel 在产品的 main.swift 里定义；本工具只画 JellyView、不创建窗口，放一个同名占位好让源文件一起编译。
final class ReminderPanel: NSPanel {}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(2)
}

// 与桌面水母的窗口一致（JellyCompanion.size）
let viewSize = NSSize(width: 170, height: 150)

func render(_ item: RenderCase) -> (rep: NSBitmapImageRep, species: JellySpecies) {
    let appearance = JellyAppearance.parse([
        "colors": item.colors, "look": item.look, "material": "glass", "size": "medium", "species": item.species,
    ] as [String: Any])
    let scale = max(1, min(4, item.scale ?? 2))
    let view = JellyView(frame: NSRect(origin: .zero, size: viewSize))
    view.appearance = NSAppearance(named: (item.dark ?? false) ? .darkAqua : .aqua)
    view.reduceMotion = true
    view.jellyAppearance = appearance
    var pose = JellyPose()
    pose.asleep = item.asleep ?? false
    pose.alert = item.alert ?? false
    pose.ripples = item.ripples ?? false
    pose.blink = CGFloat(item.blink ?? 0)
    pose.night = CGFloat(item.night ?? 0)
    pose.species = appearance.species.effective
    pose.facing = CGFloat(item.facing ?? 1)
    pose.pitch = CGFloat(item.pitch ?? 0)
    pose.wave = CGFloat(item.wave ?? 0)
    pose.paint = JellyPaint.make(appearance: appearance)
    pose.tint = pose.paint.a
    view.pose = pose
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(viewSize.width) * scale, pixelsHigh: Int(viewSize.height) * scale,
                                     bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { fail("无法创建位图") }
    rep.size = viewSize
    view.cacheDisplay(in: view.bounds, to: rep)
    return (rep, appearance.species.effective)
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
    let (rep, species) = render(item)
    guard let png = rep.representation(using: .png, properties: [:]) else { fail("无法编码 PNG：\(item.name)") }
    let file = (arguments[2] as NSString).appendingPathComponent("\(item.name).png")
    do { try png.write(to: URL(fileURLWithPath: file)) } catch { fail("无法写入 \(file)：\(error)") }
    manifest.append(["name": item.name, "file": file, "species": species.rawValue, "width": rep.pixelsWide, "height": rep.pixelsHigh, "scale": max(1, min(4, item.scale ?? 2))])
}
guard let output = try? JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys]) else { fail("无法编码清单") }
FileHandle.standardOutput.write(output)
