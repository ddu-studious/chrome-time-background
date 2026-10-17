import AppKit
import Foundation
import CoreGraphics
import Carbon.HIToolbox

// 验收用的合成鼠标 / 键盘事件（只在隔离测试里由 jelly-smoke.mjs 与 assistant-smoke.mjs 编译和调用，不随 App 发布）。
// 坐标使用 Cocoa 屏幕坐标（原点在主屏左下角）：
//   mouse-helper move X Y | click X Y | rightclick X Y | drag X1 Y1 X2 Y2 [steps]
//   mouse-helper screens          每块屏幕的可见区，一行一块：x y w h（多显示器验收先用它找到各屏的位置）
//   mouse-helper key 组合         合成一次真实按键（修饰键按下 → 按键按下与抬起 → 修饰键抬起），组合形如 ctrl+option+shift+cmd+f20、return、escape、cmd+a
//   mouse-helper text 文字        把文字当作键入内容送给当前键盘焦点（Unicode 注入，不经过输入法）
// 键盘事件会送给当前拿着键盘的应用：调用方必须先确认目标窗口确实是键窗口，运行期间不要碰键盘与鼠标。
let args = CommandLine.arguments
if args.count >= 2 && args[1] == "screens" {
    // 与桌面组件同一口径：没有初始化 NSApplication 时 AppKit 不会扣除副屏的菜单栏高度（2026-10-16 实测副屏 1080 对 1050），所以先初始化再读。
    _ = NSApplication.shared
    NSApp.setActivationPolicy(.accessory)
    for screen in NSScreen.screens {
        let frame = screen.visibleFrame
        print("\(frame.origin.x) \(frame.origin.y) \(frame.size.width) \(frame.size.height)")
    }
    exit(0)
}
let keyCodes: [String: Int] = [
    "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G, "h": kVK_ANSI_H, "i": kVK_ANSI_I,
    "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L, "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R,
    "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X, "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
    "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3, "4": kVK_ANSI_4, "5": kVK_ANSI_5, "6": kVK_ANSI_6, "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
    "space": kVK_Space, "return": kVK_Return, "escape": kVK_Escape, "tab": kVK_Tab, "delete": kVK_Delete,
    "f1": kVK_F1, "f2": kVK_F2, "f3": kVK_F3, "f4": kVK_F4, "f5": kVK_F5, "f6": kVK_F6, "f7": kVK_F7, "f8": kVK_F8, "f9": kVK_F9, "f10": kVK_F10,
    "f11": kVK_F11, "f12": kVK_F12, "f13": kVK_F13, "f14": kVK_F14, "f15": kVK_F15, "f16": kVK_F16, "f17": kVK_F17, "f18": kVK_F18, "f19": kVK_F19, "f20": kVK_F20,
]
let modifierKeys: [(name: String, code: Int, flag: CGEventFlags)] = [
    ("ctrl", kVK_Control, .maskControl), ("option", kVK_Option, .maskAlternate), ("shift", kVK_Shift, .maskShift), ("cmd", kVK_Command, .maskCommand),
]
func postKey(_ code: Int, down: Bool, flags: CGEventFlags) {
    let event = CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: CGKeyCode(code), keyDown: down)
    event?.flags = flags
    event?.post(tap: .cghidEventTap)
    usleep(30_000)
}
if args.count >= 3 && args[1] == "key" {
    var parts = args[2].lowercased().split(separator: "+", omittingEmptySubsequences: false).map(String.init)
    guard let key = parts.popLast(), let code = keyCodes[key] else { exit(2) }
    var held: [(name: String, code: Int, flag: CGEventFlags)] = []
    for part in parts {
        guard let modifier = modifierKeys.first(where: { $0.name == part }) else { exit(2) }
        held.append(modifier)
    }
    var flags = CGEventFlags()
    for modifier in held { flags.insert(modifier.flag); postKey(modifier.code, down: true, flags: flags) }
    // 实体键盘上的功能键 F1–F19 自带 fn 标志；系统的热键匹配对它们要求事件带这个标志（2026-10-16 在 macOS 26.5 上逐键实测：不带 fn 的合成 F1–F19
    // 不会触发已注册的 Carbon 热键，带上就触发）。F20 反过来——带 fn 不触发、不带才触发；字母、数字、空格同样不能带 fn。所以只给 F1–F19 加。
    let isFunctionKey = key.hasPrefix("f") && (Int(key.dropFirst()).map { (1...19).contains($0) } ?? false)
    let keyFlags = isFunctionKey ? flags.union(.maskSecondaryFn) : flags
    postKey(code, down: true, flags: keyFlags); postKey(code, down: false, flags: keyFlags)
    for modifier in held.reversed() { flags.remove(modifier.flag); postKey(modifier.code, down: false, flags: flags) }
    exit(0)
}
if args.count >= 3 && args[1] == "text" {
    for character in args[2] {
        let units = Array(String(character).utf16)
        for down in [true, false] {
            let event = CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: 0, keyDown: down)
            event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
            event?.post(tap: .cghidEventTap)
        }
        usleep(25_000)
    }
    exit(0)
}
let mainHeight = Double(CGDisplayBounds(CGMainDisplayID()).height)
func flip(_ y: Double) -> Double { mainHeight - y }
func post(_ type: CGEventType, _ x: Double, _ y: Double, button: CGMouseButton = .left) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: button)?.post(tap: .cghidEventTap)
}
guard args.count >= 4, let x = Double(args[2]), let rawY = Double(args[3]) else { exit(2) }
let y = flip(rawY)
switch args[1] {
case "move": post(.mouseMoved, x, y)
case "click":
    post(.mouseMoved, x, y); usleep(80_000)
    post(.leftMouseDown, x, y); usleep(60_000); post(.leftMouseUp, x, y)
case "rightclick":
    post(.mouseMoved, x, y); usleep(80_000)
    post(.rightMouseDown, x, y, button: .right); usleep(60_000); post(.rightMouseUp, x, y, button: .right)
case "drag":
    guard args.count >= 6, let x2 = Double(args[4]), let rawY2 = Double(args[5]) else { exit(2) }
    let y2 = flip(rawY2)
    let steps = args.count > 6 ? Int(args[6]) ?? 20 : 20
    post(.mouseMoved, x, y); usleep(80_000)
    post(.leftMouseDown, x, y); usleep(60_000)
    for step in 1...steps {
        let t = Double(step) / Double(steps)
        post(.leftMouseDragged, x + (x2 - x) * t, y + (y2 - y) * t); usleep(16_000)
    }
    usleep(60_000)
    post(.leftMouseUp, x2, y2)
default: exit(2)
}
