import Foundation

// 桌面水母的纯逻辑：协议 v6 的字段校验与清洗、水母什么时候该出现、记录文字是否过期、气泡内容的优先级。
// 只依赖 Foundation，由 companion-selftest.swift 单独编译验证。
// 原生端不保存任何业务状态（今天的次数、下一次提醒、稍后提醒都由 Chrome 算好再发来），这里只是把 Chrome 发来的内容变成可以安全显示的值。
enum JellyModel {
    static let maxLines = 3
    static let maxLineChars = 40
    static let maxTitleChars = 24
    static let maxTextChars = 120
    static let maxButtonChars = 12
    static let maxIDChars = 200
    static let nudgeKinds: Set<String> = ["water", "stretch"]
    static let nudgeActions: Set<String> = ["done", "snooze"]
    static let ttlRange: ClosedRange<Double> = 10...180
    static let defaultTTL = 90.0

    /// 控制字符与方向控制符（与 js/jelly-desktop.js 的 CONTROL 同一集合）：留着会让文字改变显示方向或破坏版面。
    static func isControl(_ scalar: Unicode.Scalar) -> Bool {
        let v = scalar.value
        return v <= 0x1f || (0x7f...0x9f).contains(v) || v == 0x200e || v == 0x200f || (0x202a...0x202e).contains(v) || (0x2066...0x2069).contains(v)
    }

    /// 去掉控制字符，首尾空白去掉，按字符（不是字节）截断到 max；不是字符串或清洗后为空返回 nil。
    static func clean(_ value: Any?, max: Int) -> String? {
        guard let text = value as? String else { return nil }
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: text.unicodeScalars.filter { !isControl($0) })
        let trimmed = String(String(scalars).prefix(max)).trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// JSON 里的数字：JSONSerialization 给出 NSNumber，测试里可能是 Swift 的 Int / Double；两种都认，其余（含字符串）不是数字。
    static func number(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }

    // MARK: jelly 命令

    struct State: Equatable {
        var resident: Bool
        var night: Bool
        var lines: [String]
        var linesUntil: Double      // 毫秒时间戳；0 表示没有期限
    }

    /// 解析 `jelly` 命令的负载；不是字典返回 nil。resident 只有明确的 true 才算常驻，night 只有明确的 false 才关闭（缺省开）。
    /// lines 最多 3 行、每行最多 40 个字符，非字符串的项丢弃。
    static func parseState(_ raw: Any?) -> State? {
        guard let object = raw as? [String: Any] else { return nil }
        var lines: [String] = []
        if let list = object["lines"] as? [Any] {
            for item in list {
                if let line = clean(item, max: maxLineChars) { lines.append(line) }
                if lines.count >= maxLines { break }
            }
        }
        var until = 0.0
        if let value = number(object["linesUntil"]), value.isFinite, value > 0, value < 8_640_000_000_000_000 { until = value }
        return State(resident: (object["resident"] as? Bool) == true, night: (object["night"] as? Bool) != false, lines: lines, linesUntil: until)
    }

    /// 记录文字是否仍然有效：过期后不再显示，避免挂着昨天的数字。until 为 0 表示没有期限。
    static func visibleLines(_ lines: [String], until: Double, nowMs: Double) -> [String] {
        if until > 0 && nowMs >= until { return [] }
        return lines
    }

    // MARK: nudge 命令

    struct Button: Equatable {
        var id: String
        var title: String
    }

    struct Nudge: Equatable {
        var id: String
        var kind: String
        var title: String
        var text: String
        var buttons: [Button]
        var ttl: Double
    }

    /// 解析并校验 `nudge` 命令的负载。任何一项不合规就返回 nil（调用方回 ok:false，Chrome 据此退回系统通知）：
    /// id 非空且 ≤200 字符；kind 只能是 water / stretch；标题 ≤24、正文 ≤120（超出截断，清洗后为空则拒绝）；
    /// 1 至 2 个按钮，id 只能是 done / snooze 且不重复，文字 ≤12；ttl 夹在 10–180 秒（缺省 90）。
    static func parseNudge(_ raw: Any?) -> Nudge? {
        guard let object = raw as? [String: Any],
              let id = object["id"] as? String, !id.isEmpty, id.count <= maxIDChars,
              let kind = object["kind"] as? String, nudgeKinds.contains(kind),
              let title = clean(object["title"], max: maxTitleChars),
              let text = clean(object["text"], max: maxTextChars),
              let list = object["buttons"] as? [Any], (1...2).contains(list.count) else { return nil }
        var buttons: [Button] = []
        for item in list {
            guard let entry = item as? [String: Any],
                  let buttonID = entry["id"] as? String, nudgeActions.contains(buttonID),
                  !buttons.contains(where: { $0.id == buttonID }),
                  let label = clean(entry["title"], max: maxButtonChars) else { return nil }
            buttons.append(Button(id: buttonID, title: label))
        }
        var ttl = defaultTTL
        if let value = number(object["ttl"]), value.isFinite { ttl = min(ttlRange.upperBound, max(ttlRange.lowerBound, value.rounded())) }
        return Nudge(id: id, kind: kind, title: title, text: text, buttons: buttons, ttl: ttl)
    }

    // MARK: show 命令（到点响铃）

    static let maxRingNames = 3
    static let maxRingNameChars = 40
    static let maxRingTitleChars = 80
    static let maxSessionTitleChars = 320
    static let ringActions: Set<String> = ["dismiss", "snooze"]
    static let ringClickGuard = 0.5     // 气泡弹出后这么久之内忽略点击，免得用户正好点别处时误触
    static let ringFarewell = 1.4       // 成功回执后显示确认语的时长
    static let ringHideGrace = 1.5      // Chrome 先结束会话（hide）、回执随后才到时，多等回执的时间
    static let ringNoAck = 8.0          // 点了按钮而 Chrome 一直不回执

    struct Ring: Equatable {
        var id: String
        var clock: String          // "HH:mm"；没有可用的时间时为空，版式里不画大时间
        var names: [String]        // 已清洗的提醒名字，最多 3 个；标题也为空时没有名字
        var more: Int              // names 之外还有几个（0…99）
        var canSnooze: Bool
        var snoozeMinutes: Int     // 1…60
    }

    private static func isDigit(_ scalar: Unicode.Scalar) -> Bool { ("0"..."9").contains(scalar) }

    /// 严格的 H:mm / HH:mm（只认 ASCII 数字，0:00–23:59），规整为 HH:mm；其余返回 nil。
    static func validClock(_ text: String) -> String? {
        let parts = text.trimmingCharacters(in: .whitespaces).split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, (1...2).contains(parts[0].count), parts[1].count == 2,
              parts.allSatisfy({ $0.unicodeScalars.allSatisfy(isDigit) }),
              let hour = Int(parts[0]), let minute = Int(parts[1]), hour <= 23, minute <= 59 else { return nil }
        return String(format: "%02d:%02d", hour, minute)
    }

    /// 文字里第一个有效的时间（前后不能紧挨数字）：旧扩展只发 timeText（如“10/16 09:30”）时用它兜底。
    static func firstClock(in text: String) -> String? {
        let scalars = Array(text.unicodeScalars)
        func digit(_ index: Int) -> Bool { index >= 0 && index < scalars.count && isDigit(scalars[index]) }
        for i in 0..<scalars.count where scalars[i] == ":" && digit(i - 1) && digit(i + 1) && digit(i + 2) && !digit(i + 3) {
            var start = i - 1
            if digit(start - 1) { start -= 1 }
            if digit(start - 1) { continue }
            if let valid = validClock(String(String.UnicodeScalarView(scalars[start..<(i + 3)]))) { return valid }
        }
        return nil
    }

    /// 解析并校验整条 `show` 命令。必需字段（sessionId、title）不合规返回 nil（调用方回 ok:false，Chrome 据此退回系统通知）；
    /// 可选字段 clock / labels / more 缺失或非法时各自兜底，不拒绝整条命令。
    static func parseRing(_ raw: Any?) -> Ring? {
        guard let object = raw as? [String: Any],
              let id = object["sessionId"] as? String, !id.isEmpty, id.count <= maxIDChars,
              let title = object["title"] as? String, title.count <= maxSessionTitleChars else { return nil }
        var names: [String] = []
        var more = 0
        if let list = object["labels"] as? [Any] {
            for item in list {
                if let name = clean(item, max: maxRingNameChars) { names.append(name) }
                if names.count >= maxRingNames { break }
            }
            if !names.isEmpty, let value = number(object["more"]), value.isFinite { more = Int(min(99, max(0, value.rounded()))) }
        }
        if names.isEmpty, let whole = clean(title, max: maxRingTitleChars) { names = [whole] }
        var clock = ""
        if let own = object["clock"] as? String, let valid = validClock(own) { clock = valid }
        else if let text = object["timeText"] as? String, let found = firstClock(in: text) { clock = found }
        var minutes = 10
        if let value = number(object["snoozeMinutes"]), value.isFinite { minutes = Int(min(60, max(1, value.rounded()))) }
        return Ring(id: id, clock: clock, names: names, more: more, canSnooze: (object["canSnooze"] as? Bool) == true, snoozeMinutes: minutes)
    }

    /// 响铃气泡标题区的行：1–3 个名字各占一行；总数超过 3 个只列前 2 个，第 3 行写“等共 N 个”；没有名字写“时间到了”。
    /// 对任意输入都有定义（例如只有 1 个名字却声明还有 5 个：列出这 1 个，再写“等共 6 个”），不会越界。
    static func ringTitleLines(names: [String], more: Int) -> [String] {
        if names.isEmpty { return ["时间到了"] }
        let total = names.count + max(0, more)
        if total <= maxRingNames { return names }
        return Array(names.prefix(2)) + ["等共 \(total) 个"]
    }

    /// 读屏播报文字：“时间到了”、时间、提醒名字，以逗号连接，空项略去。没有名字时标题行本身就是“时间到了”，不重复。
    static func ringAnnouncement(clock: String, names: [String], more: Int) -> String {
        let titles = names.isEmpty ? [] : ringTitleLines(names: names, more: more)
        return (["时间到了", clock] + titles).filter { !$0.isEmpty }.joined(separator: "，")
    }

    /// 响铃气泡的按钮：左“N 分钟后再提醒”（次按钮，仅在还能稍后时有），右“停止”（主按钮）。id 就是回传给 Chrome 的 action。
    static func ringButtons(canSnooze: Bool, minutes: Int) -> [Button] {
        var list: [Button] = []
        if canSnooze { list.append(Button(id: "snooze", title: "\(minutes) 分钟后再提醒")) }
        list.append(Button(id: "dismiss", title: "停止"))
        return list
    }

    /// 收到 Chrome 的成功回执后显示的确认语。
    static func ringConfirm(action: String, minutes: Int) -> String {
        action == "snooze" ? "好的，\(minutes) 分钟后再叫你" : "已停止"
    }

    // MARK: 显示规则

    /// 水母是否应该出现：常驻、有提醒气泡、有倒计时，或正在响铃（响铃由水母本人报时）。
    static func shouldShow(resident: Bool, hasCountdown: Bool, ringing: Bool, hasNudge: Bool) -> Bool {
        resident || hasNudge || hasCountdown || ringing
    }

    enum BubbleKind: Int, Comparable {
        case none, clock, detail, note, nudge, ring
        static func < (a: BubbleKind, b: BubbleKind) -> Bool { a.rawValue < b.rawValue }
    }

    /// 气泡内容的优先级：响铃 > 提醒 > 操作反馈 > 点一下的详情 > 倒计时读数 > 没有。
    /// 响铃时只显示响铃气泡；水母还在游向落点（ringArrived 为 false）时不带任何气泡。
    static func bubbleKind(ringing: Bool = false, ringArrived: Bool = false, hasNudge: Bool, hasNote: Bool, detailActive: Bool, hasCountdown: Bool) -> BubbleKind {
        if ringing { return ringArrived ? .ring : .none }
        if hasNudge { return .nudge }
        if hasNote { return .note }
        if detailActive { return .detail }
        if hasCountdown { return .clock }
        return .none
    }

    /// 刷新间隔：有倒计时或提醒气泡时每秒一次；否则（常驻休息）30 秒一次，只为夜晚荧光与记录过期。
    static func tickInterval(active: Bool) -> TimeInterval { active ? 1 : 30 }
}
