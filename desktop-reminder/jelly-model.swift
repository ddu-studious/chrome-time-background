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
    // 气泡类别：water / stretch 是喝水、起身提醒；brief / task / worklog / song / tidbit 是水母差事（协议 v8 起复用同一个气泡管线，song 自 v9 起）。
    // 每个类别只允许自己那几个按钮（nudgeButtonRules）：水母只转发这些白名单里的动作，其余一律当作非法负载。
    // 类别、按钮与主按钮在 JS（js/jelly-errands-core.js 的 KINDS）里有同一份，test/desktop-companion-logic.test.mjs 逐类逐按钮对照，改一边必须改另一边。
    static let errandKinds: Set<String> = ["brief", "task", "worklog", "lark", "song", "tidbit", "tabs", "watch", "bookmark"]
    static let nudgeKinds: Set<String> = Set(["water", "stretch"]).union(errandKinds)
    static let nudgeButtonRules: [String: Set<String>] = [
        "water": ["done", "snooze"], "stretch": ["done", "snooze"],
        "brief": ["open", "later"], "task": ["open", "later"], "worklog": ["open", "later"], "lark": ["open", "later"],
        "song": ["play", "another", "dismiss"],
        "tidbit": ["more", "dismiss"],
        "tabs": ["open", "later"], "watch": ["open", "dismiss"], "bookmark": ["open", "later"],
    ]
    /// 每个类别的主按钮（实心高亮的那个）。
    static let primaryNudgeButton: [String: String] = [
        "water": "done", "stretch": "done", "brief": "open", "task": "open", "worklog": "open", "lark": "open", "song": "play", "tidbit": "more", "tabs": "open", "watch": "open", "bookmark": "open",
    ]
    static func isErrandKind(_ kind: String) -> Bool { errandKinds.contains(kind) }
    static func isPrimaryNudgeButton(kind: String, id: String) -> Bool { primaryNudgeButton[kind] == id }
    /// 一个气泡最多几个按钮：歌曲气泡有“播放 / 换一首 / 不听”三个，其余类别最多两个（未知类别也按 2，反正过不了类别校验）。
    static func maxNudgeButtons(_ kind: String) -> Int { kind == "song" ? 3 : 2 }

    // 右键菜单“水母，给我…”（协议 v9）：用户主动要一条差事。类别必须与 JS（JellyErrandsCore.REQUEST_KINDS）一致，由 Node 侧对照；
    // 任务提醒（task）不在其中——它只由真正到期的任务触发。点选后只把请求发给 Chrome，内容由 Chrome 决定并经 nudge 命令回来。
    static let errandRequestItems: [(kind: String, title: String)] = [
        ("brief", "今日概览"),
        ("lark", "飞书 @我"),
        ("song", "来首歌"),
        ("tidbit", "来点乐子"),
        ("worklog", "工作日志"),
        ("tabs", "整理标签页"),
        ("watch", "接着看"),
        ("bookmark", "深海拾贝"),
    ]
    static func isErrandRequestKind(_ kind: String) -> Bool { errandRequestItems.contains { $0.kind == kind } }
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
        var errands = false         // 协议 v9：errands.enabled 严格为 true 才显示右键菜单“水母，给我…”
        var patrol = false          // 协议 v10：errands.enabled 与 errands.patrol 都严格为 true 才开启“活动行为”（白天保持清醒、偶尔巡游），见 JellyBehavior
    }

    /// 解析 `jelly` 命令的负载；不是字典返回 nil。resident 只有明确的 true 才算常驻，night 只有明确的 false 才关闭（缺省开）。
    /// lines 最多 3 行、每行最多 40 个字符，非字符串的项丢弃。errands 只认 { enabled: true }，其余（缺省、false、别的写法）都没有差事菜单；
    /// 活动行为（协议 v10）要 errands.enabled 与 errands.patrol 都严格为 true，只开差事不带 patrol（v9 的写法）仍是老样子。
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
        let errandsObject = object["errands"] as? [String: Any]
        let errands = (errandsObject?["enabled"] as? Bool) == true
        let patrol = errands && (errandsObject?["patrol"] as? Bool) == true
        return State(resident: (object["resident"] as? Bool) == true, night: (object["night"] as? Bool) != false, lines: lines, linesUntil: until, errands: errands, patrol: patrol)
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
    /// id 非空且 ≤200 字符；kind 只能是 water / stretch 或差事类别；标题 ≤24、正文 ≤120（超出截断，清洗后为空则拒绝）；
    /// 1 至 2 个按钮（歌曲 1 至 3 个，见 maxNudgeButtons），id 只能是该类别自己的按钮且不重复，文字 ≤12；ttl 夹在 10–180 秒（缺省 90）。
    static func parseNudge(_ raw: Any?) -> Nudge? {
        guard let object = raw as? [String: Any],
              let id = object["id"] as? String, !id.isEmpty, id.count <= maxIDChars,
              let kind = object["kind"] as? String, nudgeKinds.contains(kind),
              let title = clean(object["title"], max: maxTitleChars),
              let text = clean(object["text"], max: maxTextChars),
              let list = object["buttons"] as? [Any], (1...maxNudgeButtons(kind)).contains(list.count) else { return nil }
        var buttons: [Button] = []
        for item in list {
            guard let entry = item as? [String: Any],
                  let buttonID = entry["id"] as? String, nudgeButtonRules[kind]?.contains(buttonID) == true,
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

    // MARK: presence（在 / 不在电脑前，协议 v8）

    /// 系统空闲这么多秒就算“不在电脑前”。
    static let presenceAwaySeconds = 300.0

    /// 由系统空闲秒数得到两态之一（只有 active / away，不上报具体秒数）。读不到、负数、非有限值都按 active：
    /// 读不出空闲时间不能让水母一直沉默，也不能乱报“离开”。
    static func presenceState(idleSeconds: Double?) -> String {
        guard let seconds = idleSeconds, seconds.isFinite, seconds >= 0 else { return "active" }
        return seconds >= presenceAwaySeconds ? "away" : "active"
    }

    /// 刷新间隔：有倒计时或提醒气泡时每秒一次；否则（常驻休息）30 秒一次，只为夜晚荧光与记录过期。
    static func tickInterval(active: Bool) -> TimeInterval { active ? 1 : 30 }

    // MARK: 拖拽投喂（拖网址、文字或文件到水母身上，预填桌面 AI 助手输入框）

    static let maxDropPromptChars = 400
    static let maxDropTextChars = 320
    static let maxDropURLChars = 300
    static let allowedDropExtensions: Set<String> = [
        "md", "txt", "json", "csv", "log", "pdf", "swift", "js", "mjs", "ts", "py", "html", "css", "yml", "yaml"
    ]

    struct DropItem: Equatable {
        var kind: String       // "url" | "file" | "text"
        var label: String      // 水母气泡反馈用的简短标签
        var prompt: String     // 预填到桌面 AI 助手输入框的文字（≤400 字符）
    }

    /// 解析拖拽到水母身上的内容（优先级：网页链接 > 本地文件 > 纯文本）。
    /// 只认 http/https 网址、白名单后缀且无路径穿越的本地文件、清洗后非空的文字；其余返回 nil（拒绝拖拽）。
    static func parseDrop(url: String? = nil, fileURL: String? = nil, text: String? = nil) -> DropItem? {
        if let rawURL = clean(url, max: maxDropURLChars),
           let parsed = URL(string: rawURL),
           let scheme = parsed.scheme?.lowercased(), (scheme == "http" || scheme == "https"),
           let host = parsed.host, !host.isEmpty {
            let prompt = String("帮我看看这个链接：\(rawURL)".prefix(maxDropPromptChars))
            return DropItem(kind: "url", label: "已收下链接，按回车发送", prompt: prompt)
        }
        if let rawFile = clean(fileURL, max: maxDropURLChars) {
            let path: String
            if rawFile.lowercased().hasPrefix("file://"), let parsed = URL(string: rawFile), parsed.isFileURL {
                path = parsed.path
            } else {
                path = rawFile
            }
            let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
            if !parts.isEmpty, !parts.contains(".."), !parts.contains("."),
               let fileName = parts.last, let dot = fileName.lastIndex(of: "."), dot > fileName.startIndex {
                let ext = String(fileName[fileName.index(after: dot)...]).lowercased()
                if allowedDropExtensions.contains(ext), let safeName = clean(fileName, max: 80) {
                    let prompt = String("帮我处理文件「\(safeName)」：".prefix(maxDropPromptChars))
                    return DropItem(kind: "file", label: "已收下文件，补充需求后发送", prompt: prompt)
                }
            }
        }
        if let rawText = clean(text, max: maxDropTextChars) {
            if !rawText.contains(where: { $0.isWhitespace }),
               let parsed = URL(string: rawText),
               let scheme = parsed.scheme?.lowercased(), (scheme == "http" || scheme == "https"),
               let host = parsed.host, !host.isEmpty {
                let clipped = String(rawText.prefix(maxDropURLChars))
                return DropItem(kind: "url", label: "已收下链接，按回车发送", prompt: String("帮我看看这个链接：\(clipped)".prefix(maxDropPromptChars)))
            }
            let prompt = String("帮我处理这段内容：\(rawText)".prefix(maxDropPromptChars))
            return DropItem(kind: "text", label: "已收下文字，按回车发送", prompt: prompt)
        }
        return nil
    }
}

/// 水母的“活动行为”（协议 v10）：差事开着时白天保持清醒、每隔几分钟自己在桌面上巡游一圈，只在夜里、你离开电脑太久或这项能力关闭时才睡。
/// 纯逻辑，只依赖 Foundation；睡与不睡、什么时候游、游多久都是水母自己的动作，不产生任何业务数据，也不向 Chrome 回报。
/// 时段性格的区间与设计取舍见 docs/technical/jelly-errands-20261017.md 第 3 期；游动本身仍由 JellySwim 的物理完成（JellyTuning.patrol 只是另一份调校）。
enum JellyBehavior {
    /// 系统空闲这么多秒水母才睡：比 presence 的“离开”阈值（300 秒）更慢，刚走开一会儿它不会立刻躺下。
    static let sleepIdleSeconds = 600.0
    /// 夜晚曲线（CountdownModel.nightAmount）达到这个值就睡：曲线的半高处，即 19:30 起、到次日 06:30。
    /// 直接用曲线值而不是“夜晚荧光”开关：荧光是视觉效果，睡觉是行为，关荧光不该让水母整夜清醒。
    static let sleepNightAmount = 0.5
    /// 巡游的空闲门槛就是 presence 的离开阈值，不另起一个数。
    static let patrolIdleSeconds = JellyModel.presenceAwaySeconds

    /// 休息时是否睡着。lively 是“活动行为”开关（差事开且 patrol 开）：关着就是老样子——休息就睡；
    /// 开着只有夜晚（曲线 ≥ 0.5）或空闲 ≥ 600 秒才睡。读不到空闲秒数、负数、非有限值都按“在电脑前”，夜晚值非有限同样不睡。
    static func isAsleep(lively: Bool, nightAmount: Double, idleSeconds: Double?) -> Bool {
        guard lively else { return true }
        if nightAmount.isFinite && nightAmount >= sleepNightAmount { return true }
        if let idle = idleSeconds, idle.isFinite, idle >= sleepIdleSeconds { return true }
        return false
    }

    /// 右键菜单打开期间巡游与小动作让路，但最多让 180 秒：超过当作遗漏了 menuDidClose（不能让一次遗漏把活动行为永远关掉）；
    /// 时钟回拨出现的负间隔与非有限值同样不算在打开中。
    static let menuOpenMax = 180.0
    static func menuBlocks(openedSecondsAgo: Double?) -> Bool {
        guard let seconds = openedSecondsAgo, seconds.isFinite else { return false }
        return seconds >= 0 && seconds < menuOpenMax
    }

    /// 判断能否巡游所需的全部输入（由控制器逐项给出；busy 把“不该被打扰”的状态合成一项，见控制器）。
    struct PatrolContext: Equatable {
        var lively: Bool
        var resident: Bool
        var reduceMotion: Bool
        var stage: CountdownStage     // 倒计时阶段；没有倒计时给 .calm
        var busy: Bool                // 响铃及收尾、差事/提醒气泡及其到位、详情与反馈气泡、被抓着、右键菜单打开、鼠标正停在水母上
        var nightAmount: Double
        var idleSeconds: Double?
        var meeting: Bool = false     // 摄像头或麦克风被占用（开会中）时不巡游、不小跳
    }

    /// 能不能巡游：活动行为开、常驻、没有减少动态效果、倒计时不在临近阶段（临近时水母自己就在游）、不忙、没在开会、没睡着、presence 为 active。
    /// 时钟读数气泡不算忙（有闹钟时它一直在，算忙的话有闹钟的人永远等不到巡游）。
    static func canPatrol(_ context: PatrolContext) -> Bool {
        guard context.lively, context.resident, !context.reduceMotion, context.stage == .calm, !context.busy, !context.meeting else { return false }
        if isAsleep(lively: true, nightAmount: context.nightAmount, idleSeconds: context.idleSeconds) { return false }
        return JellyModel.presenceState(idleSeconds: context.idleSeconds) == "active"
    }

    /// 一个时段的性格：巡游的出发间隔（分钟）、时长（秒）、游速倍率，以及清醒静止时“小动作”（原地小跳）的间隔（秒）。
    /// 夜里 patrol 与 fidget 都是 nil：睡着，没有巡游也没有小动作。
    struct Personality: Equatable {
        struct Patrol: Equatable {
            var delayMinutes: ClosedRange<Double>
            var durationSeconds: ClosedRange<Double>
            var pace: Double
        }
        var id: String
        var patrol: Patrol?
        var fidget: ClosedRange<Double>?
    }

    /// 本地小时（可带小数，按 24 小时取模，非有限数按白天）对应的性格；半开区间，数值是设计取舍，须以真实观感校准。
    static func personality(hour: Double) -> Personality {
        func make(_ id: String, delay: ClosedRange<Double>, duration: ClosedRange<Double>, pace: Double, fidget: ClosedRange<Double>) -> Personality {
            Personality(id: id, patrol: Personality.Patrol(delayMinutes: delay, durationSeconds: duration, pace: pace), fidget: fidget)
        }
        guard hour.isFinite else { return make("steady", delay: 4...6, duration: 25...35, pace: 1.0, fidget: 25...45) }
        var day = hour.truncatingRemainder(dividingBy: 24)
        if day < 0 { day += 24 }
        switch day {
        case 6..<9: return make("lively", delay: 3...5, duration: 30...40, pace: 1.15, fidget: 15...30)
        case 9..<12: return make("steady", delay: 4...6, duration: 25...35, pace: 1.0, fidget: 25...45)
        case 12..<14: return make("drowsy", delay: 6...8, duration: 20...28, pace: 0.75, fidget: 45...90)
        case 14..<18: return make("busy", delay: 4...6, duration: 25...40, pace: 1.05, fidget: 20...40)
        case 18..<20: return make("mellow", delay: 5...8, duration: 25...35, pace: 0.85, fidget: 30...60)
        default: return Personality(id: "night", patrol: nil, fidget: nil)
        }
    }

    /// 在区间里按单位随机数（0…1）取值：0 取下端、1 取上端；越界夹紧，非数按 0。
    static func pick(_ range: ClosedRange<Double>, unit: Double) -> Double {
        let u = unit.isFinite ? min(1, max(0, unit)) : 0
        return range.lowerBound + (range.upperBound - range.lowerBound) * u
    }

    /// 仅隔离验收：出发、巡游时长、小动作三个“秒数”，用来让验收不必等几分钟。
    struct Overrides: Equatable {
        var delay: Double
        var duration: Double
        var fidget: Double
    }

    /// 出发前要等多少秒：时段性格里的分钟区间按单位随机数取值再换成秒；有验收覆盖时以覆盖为准。
    /// 单位换算放在这里（而不是控制器里），是因为验收覆盖会绕过它——真实用户走的就是这一条，只能由纯逻辑自测守住。
    static func patrolDelaySeconds(_ plan: Personality.Patrol, unit: Double, overrides: Overrides?) -> Double {
        overrides?.delay ?? pick(plan.delayMinutes, unit: unit) * 60
    }

    /// 一次巡游游多少秒（性格里本来就是秒）；有验收覆盖时以覆盖为准。
    static func patrolDurationSeconds(_ plan: Personality.Patrol, unit: Double, overrides: Overrides?) -> Double {
        overrides?.duration ?? pick(plan.durationSeconds, unit: unit)
    }

    /// 清醒静止时下一次小动作隔多少秒；有验收覆盖时以覆盖为准。
    static func fidgetSeconds(_ range: ClosedRange<Double>, unit: Double, overrides: Overrides?) -> Double {
        overrides?.fidget ?? pick(range, unit: unit)
    }

    /// 解析 "出发,时长,小动作"（秒，逗号分隔，允许空格与小数）。必须恰好三项且都是正有限数，否则整条作废（nil）。
    static func parseOverrides(_ text: String?) -> Overrides? {
        guard let text = text else { return nil }
        let parts = text.split(separator: ",", omittingEmptySubsequences: false).map { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 3 else { return nil }
        var values: [Double] = []
        for part in parts {
            guard let value = part, value.isFinite, value > 0 else { return nil }
            values.append(value)
        }
        return Overrides(delay: values[0], duration: values[1], fidget: values[2])
    }
}
