import Foundation
import Carbon.HIToolbox

// 桌面 AI 助手（协议 v7）的纯逻辑：全局快捷键语法与键码、`jelly.assistant` 配置、`assistantState` 解析、面板文案、输入检查、
// 焦点重试决策、面板位置。依赖 Foundation 与 jelly-model.swift 的控制字符集合；Carbon.HIToolbox 只取 kVK_* 与修饰键这些编译期整数常量，
// 不调用任何运行时 API。由 companion-selftest.swift 单独编译验证（不含 AppKit）。
// 原生端不拥有任务：任务、版本、取消、确认、预算全在 Chrome 的 AssistantEngine，这里只把 Chrome 发来的内容变成可以安全显示的值，
// 并把用户键入的文字检查成可以发出的文字。设计见 docs/technical/native-assistant-workbench-20261016.md。
enum AssistantModel {

    // MARK: 全局快捷键语法（与 js/jelly-desktop.js 的 normalizeHotkey 同一套；test/desktop-companion-logic.test.mjs 逐条对照）

    static let defaultHotkey = "ctrl+shift+b"
    /// 修饰键的规范顺序，也是展示顺序（⌃⌥⇧⌘）。
    static let modifierOrder = ["ctrl", "option", "shift", "cmd"]
    static let maxHotkeyLength = 64

    struct Hotkey: Equatable {
        var modifiers: [String]     // 规范顺序、不重复
        var key: String
        var canonical: String { (modifiers + [key]).joined(separator: "+") }
    }

    /// 按键只允许 a–z、0–9、space、f1–f20（f01、f21、f+1 都不是）。
    static func isValidKey(_ key: String) -> Bool {
        if key == "space" { return true }
        let scalars = Array(key.unicodeScalars)
        if scalars.count == 1 { return ("a"..."z").contains(scalars[0]) || ("0"..."9").contains(scalars[0]) }
        let digits = String(key.dropFirst())
        guard key.hasPrefix("f"), let number = Int(digits), String(number) == digits else { return false }
        return (1...20).contains(number)
    }

    /// JS `String.prototype.trim` 去掉的字符：WhiteSpace（制表、垂直制表、换页、空格、NBSP、BOM 与所有 Zs 空格分隔符）加 LineTerminator（LF、CR、LS、PS）。
    /// 与 Foundation 的 whitespacesAndNewlines 不同（后者没有 U+FEFF，却多了 U+0085），而热键语法要和 normalizeHotkey 逐字符一致。
    static let jsWhitespace: CharacterSet = {
        var set = CharacterSet()
        for value: UInt32 in [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF] {
            if let scalar = Unicode.Scalar(value) { set.insert(scalar) }
        }
        if let low = Unicode.Scalar(0x2000 as UInt32), let high = Unicode.Scalar(0x200A as UInt32) { set.insert(charactersIn: low...high) }
        return set
    }()

    /// 解析并规范化。小写、`+` 分隔、末尾一个按键；修饰键至少 2 个且至少 1 个属于 ctrl / option / cmd（只有 Shift 太容易与普通输入冲突）；
    /// 重复、未知、缺少按键、超长（按 UTF-16 单元，与 JS 的 length 一致）都无效。
    static func parseHotkey(_ raw: Any?) -> Hotkey? {
        guard let value = raw as? String, value.utf16.count <= maxHotkeyLength else { return nil }
        var parts = value.trimmingCharacters(in: jsWhitespace).lowercased()
            .split(separator: "+", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 3, let key = parts.popLast(), isValidKey(key) else { return nil }
        var seen = Set<String>()
        for part in parts {
            guard modifierOrder.contains(part), seen.insert(part).inserted else { return nil }
        }
        guard seen.count >= 2, seen.contains("ctrl") || seen.contains("option") || seen.contains("cmd") else { return nil }
        return Hotkey(modifiers: modifierOrder.filter { seen.contains($0) }, key: key)
    }

    static func canonicalHotkey(_ raw: Any?) -> String? { parseHotkey(raw)?.canonical }

    /// 虚拟键码（kVK_*，按键的物理位置，美式键盘 ANSI 布局；其他布局上同一位置的字母可能不同，Carbon 热键本来就是这样）。
    private static let keyCodes: [String: Int] = [
        "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G,
        "h": kVK_ANSI_H, "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L, "m": kVK_ANSI_M, "n": kVK_ANSI_N,
        "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R, "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U,
        "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X, "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
        "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3, "4": kVK_ANSI_4,
        "5": kVK_ANSI_5, "6": kVK_ANSI_6, "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
        "space": kVK_Space,
        "f1": kVK_F1, "f2": kVK_F2, "f3": kVK_F3, "f4": kVK_F4, "f5": kVK_F5, "f6": kVK_F6, "f7": kVK_F7, "f8": kVK_F8, "f9": kVK_F9, "f10": kVK_F10,
        "f11": kVK_F11, "f12": kVK_F12, "f13": kVK_F13, "f14": kVK_F14, "f15": kVK_F15, "f16": kVK_F16, "f17": kVK_F17, "f18": kVK_F18, "f19": kVK_F19, "f20": kVK_F20,
    ]
    /// 所有合法按键的个数：26 个字母 + 10 个数字 + space + 20 个功能键。
    static let keyCount = 57

    static func keyCode(_ key: String) -> UInt32? { keyCodes[key].map { UInt32($0) } }

    /// Carbon 修饰键位（controlKey / optionKey / shiftKey / cmdKey）。
    static func carbonModifiers(_ modifiers: [String]) -> UInt32 {
        var flags = 0
        for modifier in modifiers {
            switch modifier {
            case "ctrl": flags |= controlKey
            case "option": flags |= optionKey
            case "shift": flags |= shiftKey
            case "cmd": flags |= cmdKey
            default: break
            }
        }
        return UInt32(flags)
    }

    /// 展示用符号：⌃⇧B、⌃⇧空格、⌃⌥F5。
    static func glyphs(_ hotkey: Hotkey) -> String {
        let symbols = ["ctrl": "⌃", "option": "⌥", "shift": "⇧", "cmd": "⌘"]
        return hotkey.modifiers.compactMap { symbols[$0] }.joined() + (hotkey.key == "space" ? "空格" : hotkey.key.uppercased())
    }

    // MARK: jelly.assistant 配置与注册结果

    enum HotkeyPlan: Equatable {
        case disable                // 没带 assistant、不是对象或 enabled 不是明确的 true：注销热键、收起面板、去掉菜单项
        case register(Hotkey)
        case invalid                // enabled 为 true 但热键不合语法：不注册，回报 invalid
    }

    /// 解析 `jelly` 命令里的 assistant 字段（Chrome 只在“常驻且已启用”时才带；不带就是关闭）。
    static func hotkeyPlan(_ raw: Any?) -> HotkeyPlan {
        guard let object = raw as? [String: Any], (object["enabled"] as? Bool) == true else { return .disable }
        guard let hotkey = parseHotkey(object["hotkey"]) else { return .invalid }
        return .register(hotkey)
    }

    enum HotkeyStatus: String, CaseIterable { case off, ok, invalid, taken, failed }

    /// RegisterEventHotKey 的返回值 → 状态：0 成功；eventHotKeyExistsErr（-9878）已被别处占用；eventHotKeyInvalidErr（-9879）系统认为非法；其余失败。
    static func hotkeyStatus(osStatus: Int32) -> HotkeyStatus {
        switch Int(osStatus) {
        case 0: return .ok
        case eventHotKeyExistsErr: return .taken
        case eventHotKeyInvalidErr: return .invalid
        default: return .failed
        }
    }

    /// 水母右键菜单项的标题；热键注册成功时带上符号。菜单项只在助手启用时出现，不依赖热键。
    static func menuTitle(hotkey: Hotkey?, status: HotkeyStatus) -> String {
        if status == .ok, let hotkey = hotkey { return "问 AI…（\(glyphs(hotkey))）" }
        return "问 AI…"
    }

    /// 面板底部的提示：Esc 收起；热键有效时说明再按一次也能收起，无效时提醒去设置页换一个。
    static func footerHint(hotkey: Hotkey?, status: HotkeyStatus) -> String {
        switch status {
        case .ok: return hotkey.map { "Esc 收起 · \(glyphs($0)) 再按一次也可收起" } ?? "Esc 收起"
        case .taken, .failed, .invalid: return "Esc 收起 · 全局快捷键没有生效，请在设置页换一个"
        case .off: return "Esc 收起"
        }
    }

    // MARK: assistantState 命令

    enum Status: String, CaseIterable { case planning, running, waiting, review, clarify, completed, failed, interrupted, cancelled }

    struct State: Equatable {
        var taskId: String
        var version: Int
        var status: Status
        var input: String       // 用户上一次的需求，单行，≤120 字符
        var message: String     // 助手原文，保留换行，≤1200 字符
        var at: Double          // Chrome 记录的更新时间（毫秒时间戳），0 表示不详
    }

    enum StateUpdate: Equatable {
        case cleared
        case task(State)
        case invalid
    }

    static let maxInputShown = 120
    static let maxMessageShown = 1200
    static let maxIDChars = 100

    private static func isWord(_ scalar: Unicode.Scalar) -> Bool {
        ("a"..."z").contains(scalar) || ("A"..."Z").contains(scalar) || ("0"..."9").contains(scalar) || scalar == "_"
    }

    /// 任务标识：1–100 个 `[A-Za-z0-9_.:-]`（与 js/assistant-native.js 的 ID 同一套）。
    static func validTaskID(_ value: Any?) -> String? {
        guard let id = value as? String, (1...maxIDChars).contains(id.unicodeScalars.count),
              id.unicodeScalars.allSatisfy({ isWord($0) || $0 == "." || $0 == ":" || $0 == "-" }) else { return nil }
        return id
    }

    /// 解析 `assistantState` 命令的 state：null 表示没有任务；认不出的状态、非法标识、负数或小数版本一律 invalid（调用方回 ok:false）。
    static func parseState(_ raw: Any?) -> StateUpdate {
        if raw is NSNull { return .cleared }
        guard let object = raw as? [String: Any], let taskId = validTaskID(object["taskId"]),
              let version = JellyModel.number(object["version"]), version.isFinite, version >= 0, version == version.rounded(.down), version <= 9_007_199_254_740_991,
              let name = object["status"] as? String, let status = Status(rawValue: name) else { return .invalid }
        var at = 0.0
        if let value = JellyModel.number(object["at"]), value.isFinite, value > 0, value < 8_640_000_000_000_000 { at = value.rounded(.down) }
        return .task(State(taskId: taskId, version: Int(version), status: status,
                           input: oneLine(object["input"], max: maxInputShown), message: multiline(object["message"], max: maxMessageShown), at: at))
    }

    // MARK: 文字清洗（与 js/assistant-native.js 的 oneLine / multiline 同一套；Chrome 已清洗过，这里再防一道）

    /// 末尾写 …、总长不超过 max（按 Unicode 标量，与 JS 的 [...text] 一致）。
    static func clip(_ text: String, max: Int) -> String {
        let scalars = Array(text.unicodeScalars)
        guard scalars.count > max else { return text }
        var head = String.UnicodeScalarView(scalars.prefix(max - 1))
        while let last = head.last, CharacterSet.whitespacesAndNewlines.contains(last) { head.removeLast() }
        return String(head) + "…"
    }

    /// 单行：换行与制表当作空格，其余控制字符与方向控制符去掉，连续空白折成一个，首尾去空白，超出 max 截断。
    static func oneLine(_ value: Any?, max: Int) -> String {
        guard let text = value as? String else { return "" }
        var kept = String.UnicodeScalarView()
        for scalar in text.unicodeScalars {
            if ["\n", "\r", "\t", "\u{0B}", "\u{0C}"].contains(scalar) { kept.append(" ") }
            else if !JellyModel.isControl(scalar) { kept.append(scalar) }
        }
        return clip(String(kept).split(whereSeparator: { $0.isWhitespace }).joined(separator: " "), max: max)
    }

    /// 多行：统一换行，去控制字符，制表当空格，行尾空格去掉，3 个以上连续换行折成 2 个，首尾去空白，超出 max 截断。
    static func multiline(_ value: Any?, max: Int) -> String {
        guard let raw = value as? String else { return "" }
        var kept = String.UnicodeScalarView()
        for scalar in raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").unicodeScalars {
            if scalar == "\n" { kept.append(scalar) }
            else if ["\t", "\u{0B}", "\u{0C}"].contains(scalar) { kept.append(" ") }
            else if !JellyModel.isControl(scalar) { kept.append(scalar) }
        }
        var text = String(kept)
        while text.contains(" \n") { text = text.replacingOccurrences(of: " \n", with: "\n") }
        while text.contains("\n\n\n") { text = text.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
        return clip(text.trimmingCharacters(in: .whitespacesAndNewlines), max: max)
    }

    // MARK: 面板文案

    enum Tone: String { case normal, attention, bad }
    enum PendingKind: String { case submit, stop, open }

    struct Note: Equatable {
        var text: String
        var bad: Bool
    }

    /// 任务还能不能停止：只有 planning / running（与 Chrome 的 AssistantNative.cancel 同一判定）。
    static func canStop(_ state: State?) -> Bool { state?.status == .planning || state?.status == .running }

    static func needsAttention(_ state: State?) -> Bool {
        guard let status = state?.status else { return false }
        return status == .waiting || status == .review || status == .clarify
    }

    /// “刚刚 / N 分钟前 / N 小时前 / 超过一天前”；时间不详或时钟回拨返回空串。
    static func ageText(at: Double, nowMs: Double) -> String {
        guard at > 0, nowMs >= at else { return "" }
        let seconds = (nowMs - at) / 1000
        if seconds < 45 { return "刚刚" }
        if seconds < 3600 { return "\(max(1, Int(seconds / 60))) 分钟前" }
        if seconds < 86400 { return "\(Int(seconds / 3600)) 小时前" }
        return "超过一天前"
    }

    static let idleHint = "输入需求，按回车发送"
    static let focusHint = "没有拿到键盘焦点，请点一下输入框再输入"
    static let noAckNote = Note(text: "Chrome 尚未确认，请重试或到浏览器里查看；若 Chrome 已接受，这里会自动显示进度", bad: true)

    /// 状态行。优先级：正在等 Chrome 回执 > 本地提示（拒绝原因、没有回执、焦点）> Chrome 推来的任务状态 > 空闲提示。
    /// 状态文字只复述引擎的任务状态：completed 写“助手已回复”，不改写成“已播放 / 已设置”；interrupted 明确要求核对、不提供重试。
    static func statusLine(state: State?, pending: PendingKind?, note: Note?, nowMs: Double) -> (text: String, tone: Tone) {
        if let pending = pending {
            switch pending {
            case .submit: return ("正在交给 Chrome…", .normal)
            case .stop: return ("正在请求停止…", .normal)
            case .open: return ("正在请求 Chrome 打开工作台…", .normal)
            }
        }
        if let note = note { return (note.text, note.bad ? .bad : .normal) }
        guard let state = state else { return (idleHint, .normal) }
        let age = ageText(at: state.at, nowMs: nowMs)
        let suffix = age.isEmpty ? "" : " · \(age)"
        switch state.status {
        case .planning: return ("正在规划…", .normal)
        case .running: return ("正在执行…", .normal)
        case .waiting: return ("需要你选择：请在确认卡或 Chrome 工作台里处理", .attention)
        case .review: return ("需要你确认：请在确认卡或 Chrome 工作台里处理", .attention)
        case .clarify: return ("需要你补充：请在确认卡里回答，或直接在这里输入", .attention)
        case .completed: return ("助手已回复" + suffix, .normal)
        case .failed: return ("没有完成" + suffix, .bad)
        case .interrupted: return ("已中断，请到 Chrome 里核对实际结果，不要直接重做" + suffix, .bad)
        case .cancelled: return ("已取消" + suffix, .normal)
        }
    }

    /// “你：…”那一行（上一次提交的需求，最多 60 字符）；没有需求时为空。
    static func youLine(_ state: State?) -> String {
        guard let text = state?.input, !text.isEmpty else { return "" }
        return "你：" + clip(text, max: 60)
    }

    /// Chrome 回执 → 本地提示。成功后只写一条中性说明（不声称任务已完成）；若回执到达前任务状态已经推来
    /// （Chrome 先推状态、后回执），状态本身已经说明进度，不再盖一条过时的提示。
    static func resultNote(kind: PendingKind, ok: Bool, error: Any?, stateChangedSince: Bool) -> Note? {
        if ok {
            if stateChangedSince { return nil }
            switch kind {
            case .submit: return Note(text: "已交给 Chrome，等待助手…", bad: false)
            case .stop: return Note(text: "已请求停止，等 Chrome 更新任务状态…", bad: false)
            case .open: return Note(text: "已请求 Chrome 打开工作台", bad: false)
            }
        }
        let reason = oneLine(error, max: 200)
        return Note(text: reason.isEmpty ? "Chrome 没有接受这次操作，请重试" : reason, bad: true)
    }

    // MARK: 输入

    /// 与 Chrome 一致的上限（Contract.clean 的 500 字符，按 Unicode 标量计）。
    static let maxInput = 500

    enum InputCheck: Equatable {
        case ok(String)
        case empty
        case tooLong(Int)
    }

    /// 发送前的检查：换行与制表当空格、控制字符去掉、首尾去空白；空白不发；超过 500 字不发（不截断，由用户精简）。
    static func checkInput(_ raw: String) -> InputCheck {
        var kept = String.UnicodeScalarView()
        for scalar in raw.unicodeScalars {
            if ["\n", "\r", "\t"].contains(scalar) { kept.append(" ") }
            else if !JellyModel.isControl(scalar) { kept.append(scalar) }
        }
        let text = String(kept).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return .empty }
        let count = text.unicodeScalars.count
        return count > maxInput ? .tooLong(count) : .ok(text)
    }

    static func inputNote(_ check: InputCheck) -> Note? {
        switch check {
        case .ok: return nil
        case .empty: return Note(text: "请先输入需求", bad: false)
        case .tooLong(let count): return Note(text: "超过 \(maxInput) 字（现在 \(count) 字），请精简后再发送", bad: true)
        }
    }

    // MARK: 回执门槛与焦点

    /// 点了按钮而 Chrome 一直不回执：这么久之后提示“尚未确认”（并解除按钮锁定，允许用同一个 actionId 重试，Chrome 侧幂等）。
    static let noAckSeconds = 8.0
    /// 唤出后多久核对一次“确实拿到了键盘焦点”，没拿到再试一次（调研原型里偶发过面板可见但应用没激活）。
    static let focusCheckDelay = 0.25
    static let maxFocusRetries = 1

    enum FocusDecision: Equatable { case done, retry, giveUp }

    /// `hadKeyboard`：这次唤出之后面板确实拿到过键盘（既是键窗口、应用也已激活）。拿到过又没了，是用户自己切去了别的应用或点了别处，
    /// 不是激活没生效，核对不能把键盘抢回来（2026-10-16 隔离验收实测：唤出后 250 毫秒内切走，旧逻辑会把焦点重新抢回面板）。
    static func focusDecision(isKey: Bool, appActive: Bool, hadKeyboard: Bool, retries: Int) -> FocusDecision {
        if hadKeyboard || (isKey && appActive) { return .done }
        return retries < maxFocusRetries ? .retry : .giveUp
    }

    // MARK: 面板位置

    static let panelWidth: CGFloat = 560
    /// 面板顶边落在屏幕可见区高度的这一比例处（自上而下），与 Spotlight 类面板的位置相近。
    static let panelTopInset: CGFloat = 0.22

    private static func clamp(_ value: CGFloat, _ low: CGFloat, _ high: CGFloat) -> CGFloat { min(max(value, low), Swift.max(low, high)) }

    /// 在可见区里水平居中、顶边在 panelTopInset 处；结果夹进可见区（面板比可见区大时贴左下角）。
    static func panelFrame(visible: CGRect, size: CGSize) -> CGRect {
        let top = visible.maxY - visible.height * panelTopInset
        return CGRect(x: clamp(visible.midX - size.width / 2, visible.minX, visible.maxX - size.width),
                      y: clamp(top - size.height, visible.minY, visible.maxY - size.height), width: size.width, height: size.height)
    }

    /// 已显示的面板高度变化后顶边不动（再夹进可见区），横向位置与宽度不变。
    static func resized(frame: CGRect, height: CGFloat, visible: CGRect) -> CGRect {
        let top = frame.maxY
        return CGRect(x: clamp(frame.minX, visible.minX, visible.maxX - frame.width), y: clamp(top - height, visible.minY, visible.maxY - height), width: frame.width, height: height)
    }
}
