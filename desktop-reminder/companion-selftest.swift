import Foundation
import CoreGraphics

// 纯逻辑自测：countdown-model.swift + jelly-model.swift + jelly-swim.swift + jelly-palette.swift + jelly-appearance.swift + jelly-species.swift + jelly-species-data.swift（生成物）+ marine-rig.swift + marine-rig-data.swift（生成物，写实骨架）+ jelly-paint.swift + assistant-model.swift（无 AppKit）。
// 运行：node --test test/desktop-companion-logic.test.mjs，或手工（入口文件须叫 main.swift，所以先复制一份）
//   cp desktop-reminder/companion-selftest.swift /tmp/main.swift && cd desktop-reminder && xcrun swiftc countdown-model.swift jelly-model.swift jelly-swim.swift jelly-palette.swift jelly-appearance.swift jelly-species.swift jelly-species-data.swift marine-rig.swift marine-rig-data.swift jelly-paint.swift assistant-model.swift /tmp/main.swift -o /tmp/companion-selftest && /tmp/companion-selftest
// 环境变量 HOTKEY_CASES 指向一个 JSON 数组文件时，额外打印每一项的规范化结果（HOTKEY 行）与展示符号（GLYPH 行），供 Node 测试与 JS 实现逐条对照。
// 环境变量 APPEARANCE_CASES 同理：打印每个外观负载解析后的结果（APPEARANCE 行）与各部位颜色（PAINT 行）。
// 环境变量 PARSE_CASES 同理：打印每个路径串的解析结果（PARSE 行），供 Node 与 JS 的 parsePath 逐条对照；动物几何（SPEC* 行）每次都打印。
var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { print("ok   \(message)") } else { failures += 1; print("FAIL \(message)") }
}

struct SeededRandom {
    var state: UInt64
    mutating func next() -> CGFloat {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat((state >> 33) & 0xFFFFFF) / CGFloat(0x1000000)
    }
}

// --- 阶段与文案 ---
check(CountdownModel.stage(seconds: 0) == .due, "0 秒为到点")
check(CountdownModel.stage(seconds: 1) == .final && CountdownModel.stage(seconds: 10) == .final, "1–10 秒为最后阶段")
check(CountdownModel.stage(seconds: 11) == .imminent && CountdownModel.stage(seconds: 60) == .imminent, "11–60 秒为临近")
check(CountdownModel.stage(seconds: 61) == .soon && CountdownModel.stage(seconds: 600) == .soon, "1–10 分钟为将至")
check(CountdownModel.stage(seconds: 601) == .calm, "10 分钟以上平静")
check(CountdownModel.stage(seconds: -5) == .due, "负数视为到点")
check(CountdownModel.clock(seconds: 11057) == "03:04:17", "时分秒格式")
check(CountdownModel.clock(seconds: 125) == "02:05", "不足一小时为分秒")
check(CountdownModel.clock(seconds: 90061) == "1天 01:01", "超过一天显示天")
check(CountdownModel.spoken(seconds: 11057) == "还有 3 小时 4 分", "报时：小时")
check(CountdownModel.spoken(seconds: 330) == "还有 5 分钟", "报时：分钟")
check(CountdownModel.spoken(seconds: 75) == "还有 1 分 15 秒", "报时：一分多")
check(CountdownModel.spoken(seconds: 8) == "还有 8 秒" && CountdownModel.spoken(seconds: 0) == "时间到啦", "报时：秒与到点")

// --- 夜晚荧光曲线（与首页 JellyfishCore.nightAmount 同一条；node 测试会逐点对照下面打印的 NIGHT 行） ---
do {
    for hour in [20.0, 23.0, 0.0, 3.0, 5.99, 6.0] { check(CountdownModel.nightAmount(hour: hour) == 1, "\(hour) 点是夜里") }
    for hour in [7.0, 9.0, 12.0, 15.0, 19.0] { check(CountdownModel.nightAmount(hour: hour) == 0, "\(hour) 点是白天") }
    check(abs(CountdownModel.nightAmount(hour: 19.5) - 0.5) < 1e-12, "19:30 渐入中点")
    check(abs(CountdownModel.nightAmount(hour: 6.5) - 0.5) < 1e-12, "6:30 渐出中点")
    check(CountdownModel.nightAmount(hour: .nan) == 0 && CountdownModel.nightAmount(hour: .infinity) == 0, "非有限数按白天")
    check(abs(CountdownModel.nightAmount(hour: 3) - CountdownModel.nightAmount(hour: 27)) < 1e-12 && abs(CountdownModel.nightAmount(hour: 3) - CountdownModel.nightAmount(hour: -21)) < 1e-12, "24 小时循环")
    var previous = CountdownModel.nightAmount(hour: 0), maxStep = 0.0, inRange = true
    for minute in 1...(24 * 60) {
        let value = CountdownModel.nightAmount(hour: Double(minute) / 60)
        if value < 0 || value > 1 { inRange = false }
        maxStep = max(maxStep, abs(value - previous)); previous = value
    }
    check(inRange && maxStep < 0.03, "全天取值在 0…1 且 1 分钟变化很小（最大 \(String(format: "%.4f", maxStep))）")
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 8 * 3600)!
    let moment = calendar.date(from: DateComponents(year: 2026, month: 10, day: 15, hour: 19, minute: 30, second: 36))!
    check(abs(CountdownModel.localHour(moment, calendar: calendar) - 19.51) < 1e-9, "本地小时按所给时区换算（19:30:36 → 19.51）")
    for hour in [0.0, 5.0, 6.25, 6.5, 6.75, 7.0, 12.0, 18.99, 19.25, 19.5, 19.75, 20.0, 22.0] {
        print(String(format: "NIGHT %.2f %.6f", hour, CountdownModel.nightAmount(hour: hour)))
    }
}

// --- 夜晚光晕不能被窗口截断（用户真机反馈“像被框住了”）：半径必须在碰到任一窗口边之前衰减完 ---
do {
    let width: CGFloat = 170, height: CGFloat = 150
    for (cx, cy) in [(CGFloat(85), CGFloat(73)), (85, 62), (85, 90), (60, 73), (110, 40)] {
        let r = CountdownModel.glowRadius(width: width, height: height, centerX: cx, centerY: cy)
        check(cx - r >= 8 && cx + r <= width - 8 && cy - r >= 8 && cy + r <= height - 8, "光晕完全在窗口内（中心 \(cx),\(cy) 半径 \(r)）")
        check(r > 0, "光晕半径为正")
    }
    check(CountdownModel.glowRadius(width: 170, height: 150, centerX: 2, centerY: 2) == 0, "中心贴边时没有光晕")
    check(CountdownModel.glowProfile(0) == 1 && CountdownModel.glowProfile(1) == 0 && CountdownModel.glowProfile(1.5) == 0 && CountdownModel.glowProfile(-1) == 1, "光晕中心为 1、边缘为 0，越界夹紧")
    var monotonic = true, maxEdgeSlope = 0.0
    for i in 1...200 {
        let a = CountdownModel.glowProfile(Double(i - 1) / 200), b = CountdownModel.glowProfile(Double(i) / 200)
        if b > a + 1e-12 { monotonic = false }
        if i > 190 { maxEdgeSlope = max(maxEdgeSlope, (a - b) * 200) }
    }
    check(monotonic, "光晕单调衰减")
    check(maxEdgeSlope < 0.05, "边缘处斜率趋近 0，没有可见轮廓（最大 \(String(format: "%.4f", maxEdgeSlope))）")
}

// --- 水母协议 v6：jelly 命令（常驻 / 夜晚荧光 / 今天的记录）---
do {
    check(JellyModel.parseState(nil) == nil && JellyModel.parseState("x") == nil && JellyModel.parseState([1, 2]) == nil, "jelly 负载必须是字典")
    let empty = JellyModel.parseState([String: Any]())!
    check(empty.resident == false && empty.night == true && empty.lines.isEmpty && empty.linesUntil == 0, "缺省：不常驻、夜晚荧光开、没有记录文字")
    check(JellyModel.parseState(["resident": true, "night": false])! == JellyModel.State(resident: true, night: false, lines: [], linesUntil: 0), "明确的布尔照单全收")
    check(JellyModel.parseState(["resident": "yes", "night": "no"])!.resident == false && JellyModel.parseState(["resident": "yes", "night": "no"])!.night == true, "非布尔：不常驻、夜晚照开")
    // 水母差事的右键菜单开关（协议 v9）：jelly 命令里 errands.enabled 严格为 true 才有菜单项，缺省与任何别的写法都没有
    check(empty.errands == false, "缺省：没有差事菜单")
    check(JellyModel.parseState(["errands": ["enabled": true]])!.errands == true, "errands.enabled 为 true：有差事菜单")
    check(JellyModel.parseState(["errands": ["enabled": false]])!.errands == false, "errands.enabled 为 false：没有")
    let notErrands: [Any] = [true, "yes", 1, [Any](), ["enabled": "yes"], ["enabled": 1], ["enabled": NSNull()], ["on": true], [String: Any]()]
    for value in notErrands { check(JellyModel.parseState(["errands": value])!.errands == false, "errands 不是 {enabled:true} 一律没有菜单：\(value)") }
    let many = JellyModel.parseState(["lines": ["a", "b", "c", "d", "e"]])!
    check(many.lines == ["a", "b", "c"], "记录文字最多 3 行")
    let long = JellyModel.parseState(["lines": [String(repeating: "水", count: 80)]])!
    check(long.lines.count == 1 && long.lines[0].count == 40, "每行最多 40 个字符（实际 \(long.lines.first?.count ?? -1)）")
    let dirtyLines: [Any] = ["今天\u{202E}喝了\n3 次\u{7}水", 42, "   ", ["x"], "好"]
    let dirty = JellyModel.parseState(["lines": dirtyLines])!
    check(dirty.lines == ["今天喝了3 次水", "好"], "控制字符、方向控制符被去掉，非字符串与空行丢弃（实际 \(dirty.lines)）")
    check(JellyModel.parseState(["lines": "not-a-list"])!.lines.isEmpty, "lines 不是数组时按没有处理")
    check(JellyModel.parseState(["linesUntil": 1_760_000_000_000.0])!.linesUntil == 1_760_000_000_000.0, "期限保留")
    for bad in [-1.0, Double.nan, Double.infinity, 9e15] { check(JellyModel.parseState(["linesUntil": bad])!.linesUntil == 0, "非法期限 \(bad) 视为没有期限") }
    check(JellyModel.visibleLines(["a"], until: 0, nowMs: 5e12) == ["a"], "没有期限的记录一直有效")
    check(JellyModel.visibleLines(["a"], until: 1000, nowMs: 999) == ["a"] && JellyModel.visibleLines(["a"], until: 1000, nowMs: 1000).isEmpty, "到期（含恰好到期）后不再显示昨天的数字")
}

// --- 水母协议 v6：nudge 命令（喝水 / 起身气泡）---
do {
    let button: [String: Any] = ["id": "done", "title": "喝了"]
    let snooze: [String: Any] = ["id": "snooze", "title": "10 分钟后"]
    func nudge(_ patch: [String: Any?] = [:]) -> [String: Any] {
        var base: [String: Any] = ["id": "jelly-nudge-water-1", "kind": "water", "title": "水母口渴了 💧", "text": "喝几口水吧（今天已喝了 2 次）", "buttons": [button, snooze], "ttl": 90]
        for (key, value) in patch { if let value = value { base[key] = value } else { base.removeValue(forKey: key) } }
        return base
    }
    let ok = JellyModel.parseNudge(nudge())
    check(ok != nil && ok!.buttons.map { $0.id } == ["done", "snooze"] && ok!.ttl == 90 && ok!.kind == "water", "合规的提醒被接受")
    check(JellyModel.parseNudge(nudge(["kind": "stretch"]))?.kind == "stretch", "起身类别被接受")
    check(JellyModel.parseNudge(nil) == nil && JellyModel.parseNudge("x") == nil, "提醒负载必须是字典")
    check(JellyModel.parseNudge(nudge(["id": nil])) == nil && JellyModel.parseNudge(nudge(["id": ""])) == nil, "缺少或为空的 id 被拒绝")
    check(JellyModel.parseNudge(nudge(["id": String(repeating: "x", count: 201)])) == nil, "过长的 id 被拒绝")
    check(JellyModel.parseNudge(nudge(["id": String(repeating: "x", count: 200)])) != nil, "200 字符的 id 可以")
    check(JellyModel.parseNudge(nudge(["kind": "rm -rf"])) == nil && JellyModel.parseNudge(nudge(["kind": nil])) == nil, "未知类别被拒绝")
    check(["other", "Water", "WATER", "water ", "alarm", ""].allSatisfy { JellyModel.parseNudge(nudge(["kind": $0])) == nil }, "只认 water / stretch，近似写法也拒绝")
    check(JellyModel.parseNudge(nudge(["title": nil])) == nil && JellyModel.parseNudge(nudge(["title": "  \u{7} "])) == nil, "标题缺失或清洗后为空被拒绝")
    check(JellyModel.parseNudge(nudge(["text": nil])) == nil, "缺少正文被拒绝")
    check(JellyModel.parseNudge(nudge(["title": String(repeating: "题", count: 40)]))?.title.count == 24, "标题截到 24 字符")
    check(JellyModel.parseNudge(nudge(["text": String(repeating: "文", count: 300)]))?.text.count == 120, "正文截到 120 字符")
    check(JellyModel.parseNudge(nudge(["buttons": [Any]()])) == nil, "没有按钮被拒绝（没有按钮就没有办法回应）")
    check(JellyModel.parseNudge(nudge(["buttons": [button, snooze, ["id": "done", "title": "再来"]]])) == nil, "超过 2 个按钮被拒绝")
    check(JellyModel.parseNudge(nudge(["buttons": [button]]))?.buttons.count == 1, "1 个按钮可以")
    check(JellyModel.parseNudge(nudge(["buttons": [button, button]])) == nil, "重复的按钮 id 被拒绝")
    check(JellyModel.parseNudge(nudge(["buttons": [["id": "delete", "title": "删除"]]])) == nil, "未知动作被拒绝：水母只能转发 done / snooze")
    check(["dismiss", "Done", "SNOOZE", "snooze ", "stop", ""].allSatisfy { JellyModel.parseNudge(nudge(["buttons": [["id": $0, "title": "按钮"]]])) == nil }, "只认 done / snooze，近似写法也拒绝")
    check(JellyModel.parseNudge(nudge(["buttons": [["id": "done"]]])) == nil && JellyModel.parseNudge(nudge(["buttons": ["done"]])) == nil, "按钮缺少文字或不是字典被拒绝")
    check(JellyModel.parseNudge(nudge(["buttons": [["id": "done", "title": String(repeating: "钮", count: 30)]]]))?.buttons[0].title.count == 12, "按钮文字截到 12 字符")
    check(JellyModel.parseNudge(nudge(["ttl": 1]))?.ttl == 10 && JellyModel.parseNudge(nudge(["ttl": 99999]))?.ttl == 180, "ttl 夹在 10–180 秒")
    check(JellyModel.parseNudge(nudge(["ttl": 45.4]))?.ttl == 45 && JellyModel.parseNudge(nudge(["ttl": nil]))?.ttl == 90, "ttl 取整，缺省 90 秒")
    check(JellyModel.parseNudge(nudge(["ttl": Double.nan]))?.ttl == 90 && JellyModel.parseNudge(nudge(["ttl": "soon"]))?.ttl == 90, "ttl 不是有限数字时用缺省")
}

// --- 水母协议 v8：差事气泡（复用 nudge 命令；类别与按钮白名单按类别逐项限定）---
do {
    func errand(_ kind: String, _ ids: [String], _ patch: [String: Any?] = [:]) -> [String: Any] {
        var base: [String: Any] = ["id": "jelly-errand-\(kind)-1", "kind": kind, "title": "有任务过期了", "text": "2 个任务已过期，处理一下吧",
                                   "buttons": ids.map { ["id": $0, "title": "按钮"] as [String: Any] }, "ttl": 90]
        for (key, value) in patch { if let value = value { base[key] = value } else { base.removeValue(forKey: key) } }
        return base
    }
    let accepted: [(String, [String])] = [
        ("brief", ["open", "later"]), ("task", ["open", "later"]), ("worklog", ["open", "later"]), ("lark", ["open", "later"]),
        ("song", ["play", "another", "dismiss"]), ("tidbit", ["more", "dismiss"]),
        ("tabs", ["open", "later"]), ("watch", ["open", "dismiss"]), ("bookmark", ["open", "later"])
    ]
    for (kind, ids) in accepted {
        let parsed = JellyModel.parseNudge(errand(kind, ids))
        check(parsed != nil && parsed!.kind == kind && parsed!.buttons.map { $0.id } == ids, "差事类别 \(kind) 带合规按钮被接受")
        check(JellyModel.parseNudge(errand(kind, [ids[0]]))?.buttons.count == 1, "差事类别 \(kind) 一个按钮也可以")
    }
    check(JellyModel.parseNudge(errand("task", ["done", "snooze"])) == nil, "差事类别不能带喝水的按钮")
    check(JellyModel.parseNudge(errand("water", ["open", "later"])) == nil && JellyModel.parseNudge(errand("stretch", ["more", "dismiss"])) == nil, "喝水/起身不能带差事的按钮")
    check(JellyModel.parseNudge(errand("tidbit", ["open", "later"])) == nil && JellyModel.parseNudge(errand("task", ["more", "dismiss"])) == nil, "按钮 id 必须属于该类别的允许集合")
    // 逐个按钮核对：期望表写成独立的字面量（不从被测的规则表推出，否则规则表被放宽时期望会跟着放宽）
    let everyButton = ["done", "snooze", "open", "later", "more", "dismiss", "play", "another"]
    let expectedButtons: [String: Set<String>] = [
        "water": ["done", "snooze"], "stretch": ["done", "snooze"], "brief": ["open", "later"], "task": ["open", "later"],
        "worklog": ["open", "later"], "lark": ["open", "later"], "song": ["play", "another", "dismiss"], "tidbit": ["more", "dismiss"],
        "tabs": ["open", "later"], "watch": ["open", "dismiss"], "bookmark": ["open", "later"],
    ]
    check(Set(JellyModel.nudgeButtonRules.keys) == Set(expectedButtons.keys), "规则表的类别与期望一致")
    for (kind, owned) in expectedButtons {
        for id in everyButton {
            let accepted = JellyModel.parseNudge(errand(kind, [id])) != nil
            check(accepted == owned.contains(id), "类别 \(kind) 的按钮 \(id)：\(owned.contains(id) ? "应接受" : "应拒绝")")
        }
    }
    check(JellyModel.parseNudge(errand("task", ["open", "open"])) == nil, "差事按钮 id 不能重复")
    check(JellyModel.parseNudge(errand("task", ["open", "later", "dismiss"])) == nil, "任务气泡带了不属于它的按钮被拒绝（dismiss 是小乐子与歌曲的）")
    // 歌曲（协议 v9）：3 个按钮，是唯一允许超过 2 个按钮的类别；其余类别仍最多 2 个
    check(JellyModel.parseNudge(errand("song", ["play", "another", "dismiss"]))?.buttons.map { $0.id } == ["play", "another", "dismiss"], "歌曲气泡 3 个按钮被接受，顺序保留")
    check(JellyModel.parseNudge(errand("song", ["play", "another"]))?.buttons.count == 2 && JellyModel.parseNudge(errand("song", ["play"]))?.buttons.count == 1, "歌曲气泡 1～2 个按钮也可以")
    check(JellyModel.parseNudge(errand("song", ["play", "another", "dismiss", "play"])) == nil, "歌曲气泡 4 个按钮被拒绝")
    check(JellyModel.parseNudge(errand("song", ["play", "another", "dismiss", "open"])) == nil, "歌曲气泡带第 4 个别类按钮被拒绝")
    check(JellyModel.parseNudge(errand("song", ["play", "play"])) == nil, "歌曲按钮 id 不能重复")
    check(JellyModel.parseNudge(errand("song", [String]())) == nil, "歌曲气泡没有按钮被拒绝")
    check(JellyModel.parseNudge(errand("song", ["open", "later"])) == nil && JellyModel.parseNudge(errand("song", ["more"])) == nil && JellyModel.parseNudge(errand("song", ["done", "snooze"])) == nil, "歌曲气泡不能带别类的按钮")
    check(JellyModel.parseNudge(errand("tidbit", ["more", "dismiss", "another"])) == nil && JellyModel.parseNudge(errand("water", ["done", "snooze", "play"])) == nil, "只有歌曲能带 3 个按钮，play / another 不能落在别的类别上")
    check(JellyModel.maxNudgeButtons("song") == 3, "歌曲最多 3 个按钮")
    check(["water", "stretch", "brief", "task", "worklog", "lark", "tidbit", "tabs", "watch", "bookmark", "unknown", ""].allSatisfy { JellyModel.maxNudgeButtons($0) == 2 }, "其余类别（含未知）最多 2 个按钮")
    check(["Task", "TASK", "task ", "tasks", "errand", ""].allSatisfy { JellyModel.parseNudge(errand($0, ["open", "later"])) == nil }, "差事类别的近似写法也拒绝")
    check(["Open", "OPEN", "open ", "delete", "play"].allSatisfy { JellyModel.parseNudge(errand("task", [$0])) == nil }, "差事按钮的近似写法与未知动作也拒绝")
    check(JellyModel.parseNudge(errand("task", ["open", "later"], ["title": String(repeating: "题", count: 40)]))?.title.count == 24, "差事标题同样截到 24 字符")
    check(JellyModel.parseNudge(errand("task", ["open", "later"], ["text": String(repeating: "文", count: 300)]))?.text.count == 120, "差事正文同样截到 120 字符")
    check(JellyModel.isErrandKind("task") && JellyModel.isErrandKind("tidbit") && JellyModel.isErrandKind("song") && JellyModel.isErrandKind("lark") && JellyModel.isErrandKind("tabs") && JellyModel.isErrandKind("watch") && JellyModel.isErrandKind("bookmark") && !JellyModel.isErrandKind("water") && !JellyModel.isErrandKind("stretch") && !JellyModel.isErrandKind("radio"), "差事类别判定")
    check(JellyModel.isPrimaryNudgeButton(kind: "water", id: "done") && !JellyModel.isPrimaryNudgeButton(kind: "water", id: "snooze"), "喝水的主按钮是“喝了”")
    check(JellyModel.isPrimaryNudgeButton(kind: "task", id: "open") && !JellyModel.isPrimaryNudgeButton(kind: "task", id: "later"), "过期任务的主按钮是“去处理”")
    check(JellyModel.isPrimaryNudgeButton(kind: "tidbit", id: "more") && !JellyModel.isPrimaryNudgeButton(kind: "tidbit", id: "dismiss"), "小乐子的主按钮是“再来一条”")
    check(JellyModel.isPrimaryNudgeButton(kind: "song", id: "play") && !JellyModel.isPrimaryNudgeButton(kind: "song", id: "another") && !JellyModel.isPrimaryNudgeButton(kind: "song", id: "dismiss"), "歌曲的主按钮是“播放”")
    check(JellyModel.isPrimaryNudgeButton(kind: "lark", id: "open") && JellyModel.isPrimaryNudgeButton(kind: "tabs", id: "open") && JellyModel.isPrimaryNudgeButton(kind: "watch", id: "open") && JellyModel.isPrimaryNudgeButton(kind: "bookmark", id: "open"), "飞书、整理标签页、接着看、深海拾贝的主按钮都是 open")
    check(!JellyModel.isPrimaryNudgeButton(kind: "task", id: "done") && !JellyModel.isPrimaryNudgeButton(kind: "unknown", id: "open"), "不属于该类别的按钮不是主按钮")
    for (kind, _) in accepted { print("ERRAND \(kind) \(JellyModel.primaryNudgeButton[kind] ?? "-") \((JellyModel.nudgeButtonRules[kind] ?? []).sorted().joined(separator: ","))") }
    // 右键菜单“水母，给我…”的八项：期望写成独立字面量；kind 必须与 JS 的 REQUEST_KINDS 一致（由 Node 侧对照）
    check(JellyModel.errandRequestItems.map { $0.kind } == ["brief", "lark", "song", "tidbit", "worklog", "tabs", "watch", "bookmark"], "菜单请求的类别与顺序")
    check(JellyModel.errandRequestItems.map { $0.title } == ["今日概览", "飞书 @我", "来首歌", "来点乐子", "工作日志", "整理标签页", "接着看", "深海拾贝"], "菜单项的文字")
    check(Set(JellyModel.errandRequestItems.map { $0.kind }).count == 8 && Set(JellyModel.errandRequestItems.map { $0.title }).count == 8, "菜单项的类别与文字互不重复")
    check(JellyModel.errandRequestItems.allSatisfy { JellyModel.isErrandKind($0.kind) }, "菜单请求的类别都是差事类别")
    check(JellyModel.isErrandRequestKind("song") && JellyModel.isErrandRequestKind("brief") && JellyModel.isErrandRequestKind("lark") && JellyModel.isErrandRequestKind("tabs") && JellyModel.isErrandRequestKind("watch") && JellyModel.isErrandRequestKind("bookmark") && !JellyModel.isErrandRequestKind("task") && !JellyModel.isErrandRequestKind("water") && !JellyModel.isErrandRequestKind("Song") && !JellyModel.isErrandRequestKind(""), "菜单请求的类别判定（任务提醒不在其中，它只由到期情况触发）")
    for item in JellyModel.errandRequestItems { print("ERRAND_REQUEST \(item.kind)") }
}

// --- 水母协议 v8：presence（在 / 不在电脑前）---
do {
    check(JellyModel.presenceAwaySeconds == 300, "离开阈值 300 秒")
    check(JellyModel.presenceState(idleSeconds: 0) == "active" && JellyModel.presenceState(idleSeconds: 299.9) == "active", "不足阈值是 active")
    check(JellyModel.presenceState(idleSeconds: 300) == "away" && JellyModel.presenceState(idleSeconds: 301) == "away" && JellyModel.presenceState(idleSeconds: 86400) == "away", "到达阈值（含恰好）是 away")
    check(JellyModel.presenceState(idleSeconds: nil) == "active" && JellyModel.presenceState(idleSeconds: -5) == "active" && JellyModel.presenceState(idleSeconds: Double.nan) == "active" && JellyModel.presenceState(idleSeconds: Double.infinity) == "active", "读不到、负数、非有限值都按 active（不能因读不出空闲时间就让水母一直沉默或乱报）")
}

// --- 水母协议 v10：jelly 命令的 errands.patrol（活动行为开关）---
do {
    // 拖拽投喂（parseDrop）：网页链接 > 本地白名单文件 > 纯文本；非法协议与路径穿越拒绝
    let urlDrop = JellyModel.parseDrop(url: "https://example.com/article?id=1")
    check(urlDrop?.kind == "url" && urlDrop?.prompt == "帮我看看这个链接：https://example.com/article?id=1", "拖拽 https 链接被接受并生成提示词")
    check(JellyModel.parseDrop(url: "javascript:alert(1)") == nil && JellyModel.parseDrop(url: "file:///etc/passwd") == nil, "非 http/https 链接被拒绝")
    let fileDrop = JellyModel.parseDrop(fileURL: "file:///Users/demo/notes/summary.md")
    check(fileDrop?.kind == "file" && fileDrop?.prompt == "帮我处理文件「summary.md」：", "白名单后缀本地文件被接受，且只保留文件名")
    check(JellyModel.parseDrop(fileURL: "/Users/demo/../etc/notes.md") == nil, "包含 .. 的路径被拒绝")
    check(JellyModel.parseDrop(fileURL: "file:///Users/demo/secret.key") == nil, "非白名单后缀的文件被拒绝")
    let textDrop = JellyModel.parseDrop(text: "帮我记一下明天下午三点开周会")
    check(textDrop?.kind == "text" && textDrop?.prompt == "帮我处理这段内容：帮我记一下明天下午三点开周会", "纯文本被接受")
    let textAsUrl = JellyModel.parseDrop(text: "https://developer.chrome.com/docs/extensions")
    check(textAsUrl?.kind == "url", "纯文本本身是 http(s) 网址时按链接处理")
    check(JellyModel.parseDrop(url: nil, fileURL: nil, text: "   \n\t ") == nil, "全空白拖拽被拒绝")
}

do {
    let plain = JellyModel.parseState([String: Any]())!
    check(plain.patrol == false, "缺省：没有活动行为（老样子，休息就睡）")
    check(JellyModel.parseState(["errands": ["enabled": true, "patrol": true]])!.patrol == true, "errands.enabled 与 patrol 都严格为 true：活动行为开")
    check(JellyModel.parseState(["errands": ["enabled": true, "patrol": true]])!.errands == true, "开活动行为不影响右键菜单开关")
    check(JellyModel.parseState(["errands": ["enabled": true]])!.patrol == false, "只开差事没带 patrol（v9 的写法）：没有活动行为")
    check(JellyModel.parseState(["errands": ["enabled": true, "patrol": false]])!.patrol == false, "patrol 为 false：没有")
    check(JellyModel.parseState(["errands": ["enabled": false, "patrol": true]])!.patrol == false, "差事没开时 patrol 不生效")
    check(JellyModel.parseState(["errands": ["patrol": true]])!.patrol == false, "没有 enabled：不生效")
    check(JellyModel.parseState(["patrol": true])!.patrol == false, "patrol 必须放在 errands 里")
    let notPatrol: [Any] = [1, "true", "yes", NSNull(), [true], ["on": true], [String: Any]()]
    for value in notPatrol { check(JellyModel.parseState(["errands": ["enabled": true, "patrol": value]])!.patrol == false, "patrol 不是布尔 true 一律没有：\(value)") }
    check(JellyModel.State(resident: true, night: false, lines: [], linesUntil: 0) == JellyModel.State(resident: true, night: false, lines: [], linesUntil: 0, errands: false, patrol: false), "State 的新字段缺省为关")
}

// --- 水母协议 v10：睡觉规则（JellyBehavior.isAsleep）---
do {
    func asleep(_ lively: Bool, _ night: Double, _ idle: Double?) -> Bool { JellyBehavior.isAsleep(lively: lively, nightAmount: night, idleSeconds: idle) }
    check(JellyBehavior.sleepIdleSeconds == 600 && JellyBehavior.sleepNightAmount == 0.5, "睡觉门槛：空闲 600 秒、夜晚曲线 0.5")
    check(asleep(false, 0, 0) && asleep(false, 0, nil) && asleep(false, 0, 100) && asleep(false, 1, 700), "活动行为关：休息就睡，与别的条件无关（老样子）")
    check(!asleep(true, 0, 0) && !asleep(true, 0, 299) && !asleep(true, 0, 599.9), "活动行为开：白天在电脑前、短暂离开都不睡")
    check(!asleep(true, 0.49, 0) && asleep(true, 0.5, 0) && asleep(true, 0.51, 0) && asleep(true, 1, 0), "夜晚曲线 0.5 起睡（含恰好 0.5）")
    check(!asleep(true, 0, 599.9) && asleep(true, 0, 600) && asleep(true, 0, 601) && asleep(true, 0, 86400), "空闲 600 秒起睡（含恰好 600）")
    check(!asleep(true, 0, nil) && !asleep(true, 0, -1) && !asleep(true, 0, Double.nan) && !asleep(true, 0, Double.infinity), "读不出空闲时间：当作在电脑前，不睡")
    check(!asleep(true, Double.nan, 0) && !asleep(true, -3, 0) && !asleep(true, Double.infinity, 0), "夜晚值是 NaN、∞ 或负数：不睡")
    check(asleep(true, 0.5, 700) && asleep(true, 1, 0), "两个睡觉条件同时成立也只是睡")
    // 把曲线与小时对起来：19:30–06:30 睡（曲线半高处）；不受“夜晚荧光”开关影响，因为这里直接用曲线值
    func asleepAt(_ hour: Double) -> Bool { asleep(true, CountdownModel.nightAmount(hour: hour), 0) }
    check(!asleepAt(12) && !asleepAt(19.49) && asleepAt(19.5) && asleepAt(23) && asleepAt(0) && asleepAt(6.49) && !asleepAt(6.51) && !asleepAt(9), "按小时：19:30 睡下、06:30 起床")
}

// --- 水母协议 v10：什么时候可以巡游（JellyBehavior.canPatrol）---
do {
    let base = JellyBehavior.PatrolContext(lively: true, resident: true, reduceMotion: false, stage: .calm, busy: false, nightAmount: 0, idleSeconds: 5)
    func can(_ edit: (inout JellyBehavior.PatrolContext) -> Void) -> Bool { var c = base; edit(&c); return JellyBehavior.canPatrol(c) }
    check(JellyBehavior.canPatrol(base), "全部满足：可以巡游")
    check(!can { $0.lively = false }, "活动行为关：不巡游")
    check(!can { $0.resident = false }, "不常驻：不巡游")
    check(!can { $0.reduceMotion = true }, "减少动态效果：不巡游")
    for stage in [CountdownStage.soon, .imminent, .final, .due] { check(!can { $0.stage = stage }, "倒计时已进入 \(stage)：水母自己在游，不巡游") }
    check(!can { $0.busy = true }, "忙（气泡、响铃、被抓、菜单、鼠标在身上）：不巡游")
    check(!can { $0.meeting = true }, "开会中（摄像头或麦克风被占用）：不巡游")
    check(can { $0.nightAmount = 0.49 } && !can { $0.nightAmount = 0.5 } && !can { $0.nightAmount = 1 }, "夜里不巡游（曲线 0.5 起）")
    check(can { $0.idleSeconds = 299.9 } && !can { $0.idleSeconds = 300 } && !can { $0.idleSeconds = 601 }, "离开电脑（presence 为 away，300 秒起）不巡游")
    check(can { $0.idleSeconds = nil } && can { $0.idleSeconds = -2 } && can { $0.idleSeconds = Double.nan }, "读不出空闲时间：当作在电脑前，可以巡游")
    check(JellyBehavior.patrolIdleSeconds == JellyModel.presenceAwaySeconds, "巡游的空闲门槛就是 presence 的离开阈值，不另起一个数")
    // 右键菜单打开期间让路，但最多 180 秒（遗漏 menuDidClose 时不能把活动行为永远关掉）
    check(JellyBehavior.menuOpenMax == 180, "菜单让路上限 180 秒")
    check(!JellyBehavior.menuBlocks(openedSecondsAgo: nil), "没有打开中的菜单：不让路")
    check(JellyBehavior.menuBlocks(openedSecondsAgo: 0) && JellyBehavior.menuBlocks(openedSecondsAgo: 60) && JellyBehavior.menuBlocks(openedSecondsAgo: 179.9), "打开不足 180 秒：让路")
    check(!JellyBehavior.menuBlocks(openedSecondsAgo: 180) && !JellyBehavior.menuBlocks(openedSecondsAgo: 3600), "打开满 180 秒起不再让路（当作遗漏了关闭通知）")
    check(!JellyBehavior.menuBlocks(openedSecondsAgo: -5) && !JellyBehavior.menuBlocks(openedSecondsAgo: Double.nan) && !JellyBehavior.menuBlocks(openedSecondsAgo: Double.infinity), "时钟回拨的负间隔与非有限值：不让路")
}

// --- 水母协议 v10：时段性格（JellyBehavior.personality）---
do {
    let ids = ["night", "night", "night", "night", "night", "night", "lively", "lively", "lively", "steady", "steady", "steady",
               "drowsy", "drowsy", "busy", "busy", "busy", "busy", "mellow", "mellow", "night", "night", "night", "night"]
    for hour in 0..<24 { check(JellyBehavior.personality(hour: Double(hour)).id == ids[hour], "\(hour) 点的性格是 \(ids[hour])（实际 \(JellyBehavior.personality(hour: Double(hour)).id)）") }
    let edges: [(Double, String)] = [(5.999, "night"), (6, "lively"), (8.999, "lively"), (9, "steady"), (11.999, "steady"), (12, "drowsy"), (13.999, "drowsy"),
                                      (14, "busy"), (17.999, "busy"), (18, "mellow"), (19.999, "mellow"), (20, "night"), (23.999, "night"),
                                      (-1, "night"), (-18, "lively"), (24, "night"), (30, "lively"), (33, "steady"), (Double.nan, "steady"), (Double.infinity, "steady")]
    for (hour, id) in edges { check(JellyBehavior.personality(hour: hour).id == id, "小时 \(hour) 的性格是 \(id)（实际 \(JellyBehavior.personality(hour: hour).id)）") }
    // 各档数值（对着设计表写成字面量）
    func plan(_ hour: Double) -> (delay: ClosedRange<Double>, duration: ClosedRange<Double>, pace: Double, fidget: ClosedRange<Double>)? {
        let p = JellyBehavior.personality(hour: hour)
        guard let patrol = p.patrol, let fidget = p.fidget else { return nil }
        return (patrol.delayMinutes, patrol.durationSeconds, patrol.pace, fidget)
    }
    let table: [(Double, ClosedRange<Double>, ClosedRange<Double>, Double, ClosedRange<Double>)] = [
        (7, 3...5, 30...40, 1.15, 15...30), (10, 4...6, 25...35, 1.0, 25...45), (13, 6...8, 20...28, 0.75, 45...90),
        (16, 4...6, 25...40, 1.05, 20...40), (19, 5...8, 25...35, 0.85, 30...60),
    ]
    for (hour, delay, duration, pace, fidget) in table {
        let got = plan(hour)
        check(got?.delay == delay && got?.duration == duration && got?.pace == pace && got?.fidget == fidget, "\(hour) 点的出发间隔 \(delay) 分钟、时长 \(duration) 秒、游速 \(pace)、小动作 \(fidget) 秒（实际 \(String(describing: got))）")
    }
    check(JellyBehavior.personality(hour: 23).patrol == nil && JellyBehavior.personality(hour: 23).fidget == nil && JellyBehavior.personality(hour: 3).patrol == nil, "夜里没有巡游，也没有小动作")
    // 所有时段都落在设计稿的“3–8 分钟 / 20–40 秒”之内，游速倍率在调校函数接受的范围里
    var inside = true
    for tenth in 0..<240 {
        guard let patrol = JellyBehavior.personality(hour: Double(tenth) / 10).patrol else { continue }
        if patrol.delayMinutes.lowerBound < 3 || patrol.delayMinutes.upperBound > 8 || patrol.durationSeconds.lowerBound < 20 || patrol.durationSeconds.upperBound > 40 || patrol.pace < 0.5 || patrol.pace > 2 { inside = false }
    }
    check(inside, "所有时段的巡游参数都在 3–8 分钟、20–40 秒、游速 0.5–2 之内")
    // 取随机：单位随机数 0 与 1 分别取到区间两端，越界与非数夹紧
    check(JellyBehavior.pick(3...5, unit: 0) == 3 && JellyBehavior.pick(3...5, unit: 1) == 5 && JellyBehavior.pick(3...5, unit: 0.5) == 4, "pick 取区间的两端与中点")
    check(JellyBehavior.pick(3...5, unit: -1) == 3 && JellyBehavior.pick(3...5, unit: 2) == 5 && JellyBehavior.pick(3...5, unit: Double.nan) == 3, "pick 对越界与非数夹紧")
    check(JellyBehavior.pick(7...7, unit: 0.3) == 7, "单点区间恒取该点")
    // 真实用户走的取值路径（验收覆盖会绕过它）：出发的分钟区间要换成秒，时长与小动作本来就是秒
    if let steady = JellyBehavior.personality(hour: 10).patrol, let drowsy = JellyBehavior.personality(hour: 13).patrol, let fidget = JellyBehavior.personality(hour: 13).fidget {
        check(JellyBehavior.patrolDelaySeconds(steady, unit: 0, overrides: nil) == 240 && JellyBehavior.patrolDelaySeconds(steady, unit: 1, overrides: nil) == 360
              && JellyBehavior.patrolDelaySeconds(steady, unit: 0.5, overrides: nil) == 300, "专注（4–6 分钟）：出发要等 240–360 秒，中点 300 秒")
        check(JellyBehavior.patrolDelaySeconds(drowsy, unit: 0, overrides: nil) == 360 && JellyBehavior.patrolDelaySeconds(drowsy, unit: 1, overrides: nil) == 480, "犯困（6–8 分钟）：360–480 秒")
        check(JellyBehavior.patrolDurationSeconds(steady, unit: 0, overrides: nil) == 25 && JellyBehavior.patrolDurationSeconds(steady, unit: 1, overrides: nil) == 35
              && JellyBehavior.patrolDurationSeconds(drowsy, unit: 0.5, overrides: nil) == 24, "巡游时长直接是秒：专注 25–35，犯困中点 24")
        check(JellyBehavior.fidgetSeconds(fidget, unit: 0, overrides: nil) == 45 && JellyBehavior.fidgetSeconds(fidget, unit: 1, overrides: nil) == 90, "小动作间隔直接是秒：犯困 45–90")
        let fixed = JellyBehavior.Overrides(delay: 1.5, duration: 7, fidget: 2.5)
        check(JellyBehavior.patrolDelaySeconds(steady, unit: 0.9, overrides: fixed) == 1.5 && JellyBehavior.patrolDurationSeconds(steady, unit: 0.9, overrides: fixed) == 7
              && JellyBehavior.fidgetSeconds(fidget, unit: 0.9, overrides: fixed) == 2.5, "有验收覆盖时三项都以覆盖为准（原样的秒数，不再乘 60）")
        check(JellyBehavior.patrolDelaySeconds(steady, unit: Double.nan, overrides: nil) == 240, "出发等待遇到非数的随机数取区间下端")
    } else {
        check(false, "白天的性格应当有巡游与小动作")
    }
    // 验收用的覆盖：出发、时长、小动作三个秒数；任一项不是正有限数整条作废
    check(JellyBehavior.parseOverrides("1,3,2") == JellyBehavior.Overrides(delay: 1, duration: 3, fidget: 2), "覆盖：1,3,2")
    check(JellyBehavior.parseOverrides(" 0.5 , 2 , 4 ") == JellyBehavior.Overrides(delay: 0.5, duration: 2, fidget: 4), "覆盖允许空格与小数")
    for bad in [nil, "", "1,2", "1,2,3,4", "a,b,c", "0,1,2", "1,-1,2", "1,2,0", "1,2,inf", "1,nan,2", "1;2;3", ",,", "1,,3", "1,2,3,", ",1,2,3"] as [String?] {
        check(JellyBehavior.parseOverrides(bad) == nil, "非法覆盖整条作废：\(bad ?? "nil")")
    }
}

// --- 水母协议 v10：巡游的游动调校（JellyTuning.patrol）与物理分布 ---
do {
    let t1 = JellyTuning.patrol(pace: 1)
    check(abs(t1.period - 1.4) < 1e-9 && t1.thrustX == 62 && t1.hover == 16, "游速倍率 1：脉动 1.4 秒、水平冲量 62、愿意停留的高度 16")
    check(abs(t1.thrustY - 41.06) < 0.2, "游速倍率 1 的垂直冲量按“上升≈下沉”标定（约 41.06，实际 \(t1.thrustY)）")
    let slow = JellyTuning.patrol(pace: 0.75), fast = JellyTuning.patrol(pace: 1.15)
    check(abs(slow.period - 1.4 / 0.75) < 1e-9 && abs(fast.period - 1.4 / 1.15) < 1e-9, "倍率越大脉动越快（周期与倍率成反比）")
    check(abs(slow.thrustY - 50.8) < 0.3 && abs(fast.thrustY - 37.5) < 0.3, "周期越短垂直冲量越小，否则会一路升到顶（实际 \(slow.thrustY) / \(fast.thrustY)）")
    for bad in [0.0, -1.0, Double.nan, Double.infinity] {
        let t = JellyTuning.patrol(pace: bad)
        check(abs(t.period - t1.period) < 1e-9 && abs(t.thrustY - t1.thrustY) < 1e-9, "非法倍率 \(bad) 按 1")
    }
    check(abs(JellyTuning.patrol(pace: 10).period - 0.7) < 1e-9 && abs(JellyTuning.patrol(pace: 0.1).period - 2.8) < 1e-9, "倍率夹在 0.5–2")
    let calm = JellyTuning.forStage(.calm)
    check(calm.period == 2.4 && calm.thrustX == 40 && calm.thrustY == 62 && calm.hover == 12, "平静阶段的调校没有被改动")
}
for pace in [0.75, 1.0, 1.15] {
    var rng = SeededRandom(state: 99)
    var swim = JellySwim()
    swim.setBounds(lo: 100, hi: 1500)
    swim.x = 800
    swim.tuning = JellyTuning.patrol(pace: pace)
    swim.wantsRest = false
    swim.mode = .swim
    let dt: CGFloat = 1.0 / 30
    var samples = 0, sumY: CGFloat = 0, high = 0, ceiling = 0, below = 0, outside = 0
    var path30: CGFloat = 0, lastX = swim.x
    for step in 0..<(30 * 600) {
        swim.step(dt: dt, random: { rng.next() })
        samples += 1; sumY += swim.y
        if swim.y > 60 { high += 1 }
        if swim.y >= JellySwim.maxLift - 0.01 { ceiling += 1 }
        if swim.y < 0 { below += 1 }
        if swim.x < 100 || swim.x > 1500 { outside += 1 }
        if step < 30 * 30 { path30 += abs(swim.x - lastX) }
        lastX = swim.x
    }
    let mean = sumY / CGFloat(samples)
    check(below == 0 && outside == 0, "巡游 \(pace)：不沉到泳线以下、不越界")
    check(Double(high) / Double(samples) < 0.05, "巡游 \(pace)：超过 60 点高度的时间 < 5%（实际 \(String(format: "%.1f", Double(high) / Double(samples) * 100))%）")
    check(Double(ceiling) / Double(samples) < 0.02, "巡游 \(pace)：极少顶到高度上限（实际 \(String(format: "%.1f", Double(ceiling) / Double(samples) * 100))%）")
    check(mean > 3 && mean < swim.tuning.hover + 18, "巡游 \(pace)：平均高度接近愿意停留的高度（实际 \(String(format: "%.1f", mean))，目标 \(swim.tuning.hover)）")
    check(path30 >= 300, "巡游 \(pace)：前 30 秒水平路程至少 300 点（实际 \(String(format: "%.0f", path30))）")
    // 比平静阶段明显快：同样的种子与时长，路程至少 1.5 倍
    var calmRng = SeededRandom(state: 99)
    var calmSwim = JellySwim()
    calmSwim.setBounds(lo: 100, hi: 1500); calmSwim.x = 800
    calmSwim.tuning = JellyTuning.forStage(.calm); calmSwim.wantsRest = false; calmSwim.mode = .swim
    var calmPath: CGFloat = 0, calmLast = calmSwim.x
    for _ in 0..<(30 * 30) { calmSwim.step(dt: dt, random: { calmRng.next() }); calmPath += abs(calmSwim.x - calmLast); calmLast = calmSwim.x }
    check(path30 > calmPath * 1.5, "巡游 \(pace) 比平静阶段的漫游明显更快（\(String(format: "%.0f", path30)) 对 \(String(format: "%.0f", calmPath)) 点）")
    // 巡游结束（想休息）后落回泳线并静止
    swim.wantsRest = true
    var seconds = 0.0
    while swim.mode != .rest && seconds < 20 { swim.step(dt: dt, random: { rng.next() }); seconds += 1.0 / 30 }
    check(swim.mode == .rest && swim.y == 0 && swim.vx == 0 && swim.vy == 0, "巡游 \(pace)：结束后落回泳线并静止（用时 \(String(format: "%.1f", seconds)) 秒）")
}

// --- 水母协议 v6：show 命令（到点响铃气泡）---
do {
    func show(_ patch: [String: Any?] = [:]) -> [String: Any] {
        var base: [String: Any] = ["sessionId": "ring-1", "title": "开会；喝水", "timeText": "10/16 09:30", "clock": "09:30", "labels": ["开会", "喝水"], "more": 0, "canSnooze": true, "snoozeMinutes": 10]
        for (key, value) in patch { if let value = value { base[key] = value } else { base.removeValue(forKey: key) } }
        return base
    }
    let ok = JellyModel.parseRing(show())
    check(ok == JellyModel.Ring(id: "ring-1", clock: "09:30", names: ["开会", "喝水"], more: 0, canSnooze: true, snoozeMinutes: 10), "合规的响铃负载被接受")
    check(JellyModel.parseRing(nil) == nil && JellyModel.parseRing("x") == nil && JellyModel.parseRing([1]) == nil, "响铃负载必须是字典")
    check(JellyModel.parseRing(show(["sessionId": nil])) == nil && JellyModel.parseRing(show(["sessionId": ""])) == nil, "缺少或为空的 sessionId 被拒绝")
    check(JellyModel.parseRing(show(["sessionId": String(repeating: "x", count: 201)])) == nil && JellyModel.parseRing(show(["sessionId": String(repeating: "x", count: 200)])) != nil, "sessionId 最多 200 字符")
    check(JellyModel.parseRing(show(["title": nil])) == nil && JellyModel.parseRing(show(["title": 42])) == nil, "title 必须是字符串")
    check(JellyModel.parseRing(show(["title": String(repeating: "题", count: 321)])) == nil && JellyModel.parseRing(show(["title": String(repeating: "题", count: 320)])) != nil, "title 最多 320 字符（沿用旧卡片的校验）")

    // 名字：labels 优先；缺失或清洗后为空时退回 title（≤80 字符）
    check(JellyModel.parseRing(show(["labels": ["a", "b", "c", "d", "e"], "more": 2]))!.names == ["a", "b", "c"], "labels 最多取 3 个")
    check(JellyModel.parseRing(show(["labels": [String(repeating: "名", count: 60)]]))!.names[0].count == 40, "每个名字最多 40 字符")
    let dirtyNames: [Any] = ["开\u{202E}会\n", 7, "   ", ["x"], "喝水"]
    check(JellyModel.parseRing(show(["labels": dirtyNames]))!.names == ["开会", "喝水"], "去掉控制字符，非字符串与空白名字丢弃")
    check(JellyModel.parseRing(show(["labels": nil]))!.names == ["开会；喝水"] && JellyModel.parseRing(show(["labels": "not-a-list"]))!.names == ["开会；喝水"], "没有 labels：整段 title 当作一个名字（旧扩展）")
    let blankNames: [Any] = ["  ", 1]
    check(JellyModel.parseRing(show(["labels": blankNames]))!.names == ["开会；喝水"], "labels 清洗后为空：退回 title")
    check(JellyModel.parseRing(show(["labels": nil, "title": String(repeating: "长", count: 200)]))!.names[0].count == 80, "退回 title 时最多 80 字符")
    check(JellyModel.parseRing(show(["labels": nil, "title": ""]))!.names.isEmpty, "标题也是空：没有名字（版式显示“时间到了”）")

    // more：只在 labels 有效时计入，夹在 0…99
    check(JellyModel.parseRing(show(["more": 2]))!.more == 2 && JellyModel.parseRing(show(["more": 500]))!.more == 99 && JellyModel.parseRing(show(["more": -3]))!.more == 0, "more 夹在 0…99")
    check(JellyModel.parseRing(show(["more": "x"]))!.more == 0 && JellyModel.parseRing(show(["more": Double.nan]))!.more == 0 && JellyModel.parseRing(show(["more": 2.6]))!.more == 3, "more 非数字按 0，小数四舍五入")
    check(JellyModel.parseRing(show(["labels": nil, "more": 5]))!.more == 0, "退回 title 时不采信 more")

    // clock：只认 H:mm / HH:mm 且在 0:00–23:59；缺失或非法时从 timeText 里取第一个有效时间
    check(JellyModel.parseRing(show(["clock": "9:05"]))!.clock == "09:05", "单位数小时补零")
    for bad in ["24:00", "12:60", "9:5", "09:30:00", "晚上9:30", "", "abc", "٠٩:٣٠"] {
        check(JellyModel.parseRing(show(["clock": bad, "timeText": "没有时间"]))!.clock == "", "非法 clock “\(bad)” 不显示")
    }
    check(JellyModel.parseRing(show(["clock": nil, "timeText": "10/16 21:45"]))!.clock == "21:45", "缺少 clock：从 timeText 取 21:45")
    check(JellyModel.parseRing(show(["clock": "99:99", "timeText": "10/16 21:45"]))!.clock == "21:45", "非法 clock：退回 timeText")
    check(JellyModel.parseRing(show(["clock": nil, "timeText": "这是测试，不会修改你的闹钟"]))!.clock == "", "都没有时间：不画大时间")
    check(JellyModel.firstClock(in: "123:45") == nil && JellyModel.firstClock(in: "1:234") == nil && JellyModel.firstClock(in: "上午 7:05 到 8:10") == "07:05", "时间前后不能紧挨数字；取第一个")
    check(JellyModel.validClock(" 23:59 ") == "23:59" && JellyModel.validClock("0:00") == "00:00" && JellyModel.validClock("24:00") == nil, "时间范围 0:00–23:59")
    check(JellyModel.validClock("012:30") == nil && JellyModel.validClock("000:00") == nil, "小时最多两位（补零的三位数不收）")

    // 按钮与稍后：canSnooze 只有明确的 true；分钟数夹在 1…60，缺省 10
    check(JellyModel.parseRing(show(["canSnooze": false]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": "yes"]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": 1]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": nil]))!.canSnooze == false, "canSnooze 只有明确的 true 才算")
    check(JellyModel.parseRing(show(["snoozeMinutes": 0]))!.snoozeMinutes == 1 && JellyModel.parseRing(show(["snoozeMinutes": 99]))!.snoozeMinutes == 60 && JellyModel.parseRing(show(["snoozeMinutes": 7.4]))!.snoozeMinutes == 7, "snoozeMinutes 夹在 1…60")
    check(JellyModel.parseRing(show(["snoozeMinutes": nil]))!.snoozeMinutes == 10 && JellyModel.parseRing(show(["snoozeMinutes": "x"]))!.snoozeMinutes == 10 && JellyModel.parseRing(show(["snoozeMinutes": Double.nan]))!.snoozeMinutes == 10, "snoozeMinutes 缺省或非法按 10")
    check(JellyModel.ringButtons(canSnooze: true, minutes: 7) == [JellyModel.Button(id: "snooze", title: "7 分钟后再提醒"), JellyModel.Button(id: "dismiss", title: "停止")], "有稍后：次按钮在左、主按钮在右")
    check(JellyModel.ringButtons(canSnooze: false, minutes: 7) == [JellyModel.Button(id: "dismiss", title: "停止")], "不能稍后：只剩“停止”，不放占位")
    check(JellyModel.ringActions == ["dismiss", "snooze"], "只转发 dismiss / snooze")
    check(JellyModel.ringConfirm(action: "dismiss", minutes: 7) == "已停止" && JellyModel.ringConfirm(action: "snooze", minutes: 7) == "好的，7 分钟后再叫你", "确认语")

    // 标题行：1–3 个名字各占一行；超过 3 个只列前 2 个，第 3 行写“等共 N 个”；没有名字写“时间到了”
    check(JellyModel.ringTitleLines(names: ["a"], more: 0) == ["a"] && JellyModel.ringTitleLines(names: ["a", "b"], more: 0) == ["a", "b"] && JellyModel.ringTitleLines(names: ["a", "b", "c"], more: 0) == ["a", "b", "c"], "1–3 个名字原样各占一行")
    check(JellyModel.ringTitleLines(names: ["a", "b", "c"], more: 2) == ["a", "b", "等共 5 个"], "3 个名字加 2 个更多：前 2 个 + 等共 5 个")
    check(JellyModel.ringTitleLines(names: ["a", "b"], more: 5) == ["a", "b", "等共 7 个"] && JellyModel.ringTitleLines(names: ["a", "b", "c", "d"], more: 0) == ["a", "b", "等共 4 个"], "总数超过 3 个一律折叠")
    check(JellyModel.ringTitleLines(names: [], more: 0) == ["时间到了"], "没有名字显示“时间到了”")
    check(JellyModel.ringTitleLines(names: ["x"], more: 5) == ["x", "等共 6 个"] && JellyModel.ringTitleLines(names: ["a", "b"], more: -4) == ["a", "b"], "只有 1 个名字却声称还有更多、或 more 为负：不越界")
    check(JellyModel.ringAnnouncement(clock: "09:30", names: ["开会"], more: 0) == "时间到了，09:30，开会"
          && JellyModel.ringAnnouncement(clock: "", names: ["开会", "写周报"], more: 0) == "时间到了，开会，写周报", "读屏播报：时间到了 + 时间 + 名字；没有时间就略去")
    check(JellyModel.ringAnnouncement(clock: "09:30", names: [], more: 0) == "时间到了，09:30"
          && JellyModel.ringAnnouncement(clock: "", names: [], more: 0) == "时间到了", "读屏播报：没有名字时“时间到了”不重复")
    check(JellyModel.ringAnnouncement(clock: "09:30", names: ["a", "b", "c"], more: 2) == "时间到了，09:30，a，b，等共 5 个", "读屏播报：名字折叠后照读折叠结果")
    check(JellyModel.ringClickGuard == 0.5 && JellyModel.ringFarewell == 1.4 && JellyModel.ringHideGrace == 1.5 && JellyModel.ringNoAck == 8, "响铃时序常量")
}

// --- 水母什么时候出现、气泡显示什么 ---
do {
    func show(_ resident: Bool, _ countdown: Bool, _ ringing: Bool, _ nudge: Bool) -> Bool { JellyModel.shouldShow(resident: resident, hasCountdown: countdown, ringing: ringing, hasNudge: nudge) }
    check(show(false, false, false, false) == false, "什么都没有：不出现（也就不占用桌面）")
    check(show(true, false, false, false) == true, "常驻：没有闹钟也出现")
    check(show(false, true, false, false) == true, "有倒计时：临时出现")
    check(show(false, true, true, false) == true, "响铃时水母不退场（倒计时读数让位给响铃气泡）")
    check(show(false, false, true, false) == true, "没有常驻、没有倒计时，响铃本身也让水母出现")
    check(show(true, true, true, false) == true, "常驻的水母不因响铃而消失")
    check(show(false, false, false, true) == true && show(false, true, true, true) == true, "提醒气泡一定要出现")
    check(JellyModel.bubbleKind(hasNudge: true, hasNote: true, detailActive: true, hasCountdown: true) == .nudge, "提醒气泡优先于其他内容")
    check(JellyModel.bubbleKind(hasNudge: false, hasNote: true, detailActive: true, hasCountdown: true) == .note, "操作反馈优先于详情")
    check(JellyModel.bubbleKind(hasNudge: false, hasNote: false, detailActive: true, hasCountdown: true) == .detail, "点一下的详情优先于读数")
    check(JellyModel.bubbleKind(hasNudge: false, hasNote: false, detailActive: false, hasCountdown: true) == .clock, "只有倒计时时显示读数")
    check(JellyModel.bubbleKind(hasNudge: false, hasNote: false, detailActive: false, hasCountdown: false) == .none, "什么都没有时不显示气泡")
    check(JellyModel.bubbleKind(ringing: true, ringArrived: true, hasNudge: true, hasNote: true, detailActive: true, hasCountdown: true) == .ring, "响铃气泡优先于一切")
    check(JellyModel.bubbleKind(ringing: true, ringArrived: false, hasNudge: true, hasNote: true, detailActive: true, hasCountdown: true) == .none, "水母还在游向落点时不带任何气泡")
    check(JellyModel.bubbleKind(ringing: false, ringArrived: true, hasNudge: true, hasNote: false, detailActive: false, hasCountdown: false) == .nudge, "没有响铃时 ringArrived 不起作用")
    check(JellyModel.BubbleKind.ring > JellyModel.BubbleKind.nudge, "响铃的优先级最高")
    check(JellyModel.tickInterval(active: true) == 1 && JellyModel.tickInterval(active: false) == 30, "常驻休息时 30 秒才刷新一次")
}

// --- 游动：纵向分布（首页水母曾一路游到顶端，这里守住） ---
for stage in [CountdownStage.soon, .imminent, .final] {
    var rng = SeededRandom(state: 42)
    var swim = JellySwim()
    swim.setBounds(lo: 100, hi: 1500)
    swim.x = 800
    swim.tuning = JellyTuning.forStage(stage)
    swim.wantsRest = false
    swim.mode = .swim
    let dt: CGFloat = 1.0 / 30
    var samples = 0, sumY: CGFloat = 0, high = 0, ceiling = 0, below = 0, outside = 0
    var minX: CGFloat = .infinity, maxX: CGFloat = -.infinity
    for _ in 0..<(30 * 600) {
        swim.step(dt: dt, random: { rng.next() })
        samples += 1; sumY += swim.y
        if swim.y > 60 { high += 1 }
        if swim.y >= JellySwim.maxLift - 0.01 { ceiling += 1 }
        if swim.y < 0 { below += 1 }
        if swim.x < 100 || swim.x > 1500 { outside += 1 }
        minX = min(minX, swim.x); maxX = max(maxX, swim.x)
    }
    let mean = sumY / CGFloat(samples)
    check(below == 0, "\(stage) 不会沉到游泳线以下")
    check(outside == 0, "\(stage) 不会越过屏幕边界")
    check(Double(high) / Double(samples) < 0.05, "\(stage) 超过 60 点高度的时间 < 5%（实际 \(String(format: "%.1f", Double(high) / Double(samples) * 100))%）")
    check(Double(ceiling) / Double(samples) < 0.02, "\(stage) 极少顶到高度上限（实际 \(String(format: "%.1f", Double(ceiling) / Double(samples) * 100))%）")
    check(mean > 3 && mean < swim.tuning.hover + 18, "\(stage) 平均高度接近愿意停留的高度（实际 \(String(format: "%.1f", mean))，目标 \(swim.tuning.hover)）")
    check(maxX - minX > 150, "\(stage) 会水平游动（范围 \(String(format: "%.0f", maxX - minX))）")
}

// --- 游到边缘会掉头 ---
do {
    var rng = SeededRandom(state: 7)
    var swim = JellySwim()
    swim.setBounds(lo: 100, hi: 600)
    swim.x = 560; swim.facing = 1; swim.mode = .swim; swim.wantsRest = false
    swim.tuning = JellyTuning.forStage(.imminent)
    var turned = false
    for _ in 0..<(30 * 20) {
        swim.step(dt: 1.0 / 30, random: { rng.next() })
        if swim.facing < 0 { turned = true }
        if swim.x > 600 { check(false, "不越界"); break }
    }
    check(turned, "靠近右边缘后掉头")
}

// --- 想睡觉：落回游泳线并静止，且静止后不再移动 ---
do {
    var rng = SeededRandom(state: 3)
    var swim = JellySwim()
    swim.setBounds(lo: 0, hi: 2000); swim.x = 900
    swim.tuning = JellyTuning.forStage(.soon); swim.wantsRest = false; swim.mode = .swim
    for _ in 0..<(30 * 8) { swim.step(dt: 1.0 / 30, random: { rng.next() }) }
    swim.wantsRest = true
    var seconds = 0.0
    while swim.mode != .rest && seconds < 20 { swim.step(dt: 1.0 / 30, random: { rng.next() }); seconds += 1.0 / 30 }
    check(swim.mode == .rest && swim.y == 0 && swim.vx == 0 && swim.vy == 0, "想休息时落回游泳线并静止（用时 \(String(format: "%.1f", seconds)) 秒）")
    for _ in 0..<(30 * 3) { swim.step(dt: 1.0 / 30, random: { rng.next() }) }
    check(swim.settled, "落地的形变在 3 秒内平复，之后不再需要动画帧")
    let x0 = swim.x
    for _ in 0..<300 { swim.step(dt: 1.0 / 30, random: { rng.next() }) }
    check(swim.x == x0 && swim.y == 0, "休息时位置不变")
    swim.wake()
    check(swim.mode == .swim && !swim.wantsRest, "唤醒进入游动")
}

// --- 抓起再放手：从高处落回合理高度 ---
do {
    var rng = SeededRandom(state: 11)
    var swim = JellySwim()
    swim.setBounds(lo: 0, hi: 2000); swim.x = 500
    swim.tuning = JellyTuning.forStage(.soon); swim.wantsRest = false; swim.mode = .swim
    for step in 0..<30 { swim.hold(x: 500 + CGFloat(step) * 4, y: 300, dt: 1.0 / 30) }
    check(swim.mode == .grabbed && swim.y == 300, "被抓住时位置由指针决定")
    check(abs(swim.vx) > 20 && abs(swim.vx) <= 260 || swim.mode == .grabbed, "被抓住时速度用于触手拖尾")
    swim.release()
    check(swim.mode == .swim && abs(swim.vx) <= 260, "放手后限速")
    var seconds = 0.0
    while swim.y > JellySwim.maxLift && seconds < 30 { swim.step(dt: 1.0 / 30, random: { rng.next() }); seconds += 1.0 / 30 }
    check(swim.y <= JellySwim.maxLift, "从 300 点高处放手后会沉回高度上限以内（用时 \(String(format: "%.1f", seconds)) 秒）")
}

// --- 休息时落地：想睡觉的水母从高处放手后落地并睡着 ---
do {
    var rng = SeededRandom(state: 5)
    var swim = JellySwim()
    swim.setBounds(lo: 0, hi: 2000); swim.x = 500; swim.wantsRest = true
    swim.hold(x: 500, y: 200, dt: 1.0 / 30); swim.release()
    var landed = false, seconds = 0.0
    while swim.mode != .rest && seconds < 30 { swim.step(dt: 1.0 / 30, random: { rng.next() }); landed = landed || swim.landed; seconds += 1.0 / 30 }
    check(swim.mode == .rest && landed, "睡着的水母被放手后触地、形变并重新睡着（用时 \(String(format: "%.1f", seconds)) 秒）")
}

// --- 戳一下：休息时小跳一下并回落 ---
do {
    var rng = SeededRandom(state: 9)
    var swim = JellySwim(); swim.setBounds(lo: 0, hi: 1000); swim.x = 300; swim.wantsRest = true
    swim.poke()
    var peak: CGFloat = 0, seconds = 0.0
    while !(swim.mode == .rest && swim.settled) && seconds < 20 { swim.step(dt: 1.0 / 30, random: { rng.next() }); peak = max(peak, swim.y); seconds += 1.0 / 30 }
    check(peak > 5 && peak < 60, "戳一下的小跳高度合理（\(String(format: "%.1f", peak))）")
    check(swim.mode == .rest && swim.settled, "小跳后重新睡着并平复（用时 \(String(format: "%.1f", seconds)) 秒）")
}

// --- 收缩量范围 ---
do {
    var swim = JellySwim(); swim.mode = .swim
    var low: CGFloat = 1, high: CGFloat = 0
    for i in 0...100 { swim.phase = CGFloat(i) / 100; low = min(low, swim.contraction); high = max(high, swim.contraction) }
    check(low >= 0 && high <= 1.0001 && high > 0.95, "脉动收缩量在 0…1")
    swim.mode = .rest; swim.phase = 0.2
    check(swim.contraction == 0, "休息时不收缩")
}

// --- 冲刺：响铃时游到落点、响铃后游回或游走 ---
do {
    check(abs(JellyDash.duration(distance: 0) - 0.7) < 1e-9 && abs(JellyDash.duration(distance: 600) - 1.05) < 1e-9 && abs(JellyDash.duration(distance: 1200) - 1.4) < 1e-9 && abs(JellyDash.duration(distance: 9000) - 1.4) < 1e-9, "冲刺时长随距离在 0.7–1.4 秒之间")
    check(JellyDash.ease(0) == 0 && JellyDash.ease(1) == 1 && abs(JellyDash.ease(0.5) - 0.5) < 1e-12 && JellyDash.ease(-1) == 0 && JellyDash.ease(2) == 1, "三次缓动：两端精确、中点 0.5、越界夹紧")
    var easeMonotonic = true
    for i in 1...100 { if JellyDash.ease(CGFloat(i) / 100) < JellyDash.ease(CGFloat(i - 1) / 100) { easeMonotonic = false } }
    check(easeMonotonic, "缓动单调不减")
    check(JellyDash.slope(0) == 0 && JellyDash.slope(1) == 0 && abs(JellyDash.slope(0.5) - 3) < 1e-12, "起止速度为 0、中点最快")

    struct DashRun { var swim: JellySwim; var xs: [CGFloat]; var minY: CGFloat; var maxY: CGFloat; var maxSpeed: CGFloat; var pulses: Int; var seconds: CGFloat; var landedAtEnd: Bool; var ended: Int; var facings: Set<CGFloat> }
    func runDash(from x0: CGFloat, to x1: CGFloat, y0: CGFloat = 0, wantsRest: Bool = true, dt: CGFloat = 1.0 / 30, lo: CGFloat = 0, hi: CGFloat = 2000) -> DashRun {
        var rng = SeededRandom(state: 1)
        var swim = JellySwim()
        swim.setBounds(lo: lo, hi: hi)
        swim.x = x0; swim.y = y0; swim.wantsRest = wantsRest; swim.mode = y0 > 0 ? .swim : .rest
        swim.startDash(toX: x1, toY: 0)
        var run = DashRun(swim: swim, xs: [swim.x], minY: swim.y, maxY: swim.y, maxSpeed: 0, pulses: 0, seconds: 0, landedAtEnd: false, ended: 0, facings: [])
        var steps = 0
        while run.swim.dash != nil && steps < 600 {
            run.swim.step(dt: dt, random: { rng.next() })
            steps += 1
            run.xs.append(run.swim.x); run.minY = min(run.minY, run.swim.y); run.maxY = max(run.maxY, run.swim.y)
            run.maxSpeed = max(run.maxSpeed, abs(run.swim.vx))
            if run.swim.pulsed { run.pulses += 1 }
            if run.swim.dashEnded { run.ended += 1; run.landedAtEnd = run.swim.landed }
            run.facings.insert(run.swim.facing)
        }
        run.seconds = CGFloat(steps) * dt
        return run
    }

    let right = runDash(from: 300, to: 1000)
    let expected = JellyDash.duration(distance: 700)
    check(right.swim.x == 1000 && right.swim.y == 0 && right.swim.vx == 0 && right.swim.vy == 0, "向右冲刺精确停在目标（x \(right.swim.x)）")
    check(right.swim.dash == nil && right.swim.mode == .rest && right.landedAtEnd && right.ended == 1, "到位后进入休息、落地一弹，且只通知一次结束")
    check(abs(right.seconds - expected) < 1.0 / 30 + 1e-9, "用时约等于计算的时长（\(String(format: "%.3f", right.seconds)) 对 \(String(format: "%.3f", expected))）")
    check(zip(right.xs, right.xs.dropFirst()).allSatisfy { $0 <= $1 }, "向右冲刺水平位置单调不减")
    check(right.minY >= 0 && right.maxY > 5 && right.maxY <= 18.001, "只有一道最高 18 点的轻弧，从不沉到泳线以下（最高 \(String(format: "%.1f", right.maxY))）")
    check(right.maxSpeed <= JellyDash.maxVisualSpeed + 1e-9 && right.maxSpeed > 100, "供倾斜与触手拖尾用的速度被限幅（最大 \(String(format: "%.0f", right.maxSpeed))）")
    check(abs(CGFloat(right.pulses) - right.seconds / JellyDash.pulsePeriod) <= 1, "钟罩按 0.5 秒节奏脉动（\(right.pulses) 次 / \(String(format: "%.2f", right.seconds)) 秒）")
    check(right.facings == [1], "向右游时朝右")

    let left = runDash(from: 1000, to: 300)
    check(left.swim.x == 300 && zip(left.xs, left.xs.dropFirst()).allSatisfy { $0 >= $1 } && left.facings == [-1], "向左冲刺同样精确、单调，朝左")

    let drop = runDash(from: 600, to: 600, y0: 60)
    check(drop.swim.x == 600 && drop.swim.y == 0 && drop.minY >= 0 && drop.maxY <= 60.001, "从高处冲到泳线：原地落下，不先升高")

    let near = runDash(from: 500, to: 500.5)
    check(near.swim.dash == nil && near.swim.x == 500.5 && near.ended == 0, "距离不足 1 点：直接到位")
    var tiny = JellySwim(); tiny.setBounds(lo: 0, hi: 1000); tiny.x = 500; tiny.wantsRest = true
    tiny.startDash(toX: 500.5)
    check(tiny.dashEnded && tiny.dash == nil && tiny.mode == .rest, "距离不足 1 点：立即标记结束，进入休息")
    let brief = runDash(from: 500, to: 503)
    check(brief.swim.x == 503 && brief.ended == 1 && brief.seconds >= 0.6, "距离 3 点仍是一次真正的冲刺，不当成“已在原地”（用时 \(String(format: "%.2f", brief.seconds)) 秒）")

    check(runDash(from: 800, to: 5000, hi: 1500).swim.x == 1500 && runDash(from: 800, to: -50, lo: 100).swim.x == 100, "目标夹在可游范围内")
    check(runDash(from: 300, to: 1000, dt: 1.0 / 15).swim.x == 1000 && runDash(from: 300, to: 1000, dt: 1.0 / 60).swim.x == 1000, "帧间隔变化（卡顿或 60 帧）都能精确到位")
    check(runDash(from: 300, to: 1000, wantsRest: false).swim.mode == .swim, "还想游的水母冲刺后继续游（不强行休息）")
    let shortTrip = JellyDash.duration(distance: 100), longTrip = JellyDash.duration(distance: 1000)
    check(shortTrip < longTrip && shortTrip >= 0.7 && longTrip <= 1.4, "路程越长用时越长")

    // 被抓住：取消冲刺，不通知结束（控制器据此丢弃回调）
    var held = JellySwim(); held.setBounds(lo: 0, hi: 2000); held.x = 300; held.wantsRest = true
    held.startDash(toX: 1000)
    var rng = SeededRandom(state: 2)
    for _ in 0..<5 { held.step(dt: 1.0 / 30, random: { rng.next() }) }
    held.hold(x: 700, y: 40, dt: 1.0 / 30)
    check(held.dash == nil && held.mode == .grabbed && held.dashEnded == false, "抓住水母会取消冲刺且不算“到位”")
    held.startDash(toX: 1200)
    check(held.dash == nil && held.mode == .grabbed, "被抓着时不能开始冲刺")

    // 外观收缩量：静态函数与实例读数一致，休息时为 0
    var pulse = JellySwim(); pulse.mode = .swim
    var same = true
    for i in 0...100 { pulse.phase = CGFloat(i) / 100; if pulse.contraction != JellySwim.contraction(atPhase: pulse.phase) { same = false } }
    check(same, "contraction(atPhase:) 与实例的 contraction 一致")
    check(JellySwim.contraction(atPhase: 0) == 0 && abs(JellySwim.contraction(atPhase: 0.28) - 1) < 1e-9 && JellySwim.contraction(atPhase: 1) == 0, "收缩曲线：起点 0、0.28 处最紧、终点 0")
}

// --- 响铃动效曲线：弹出与涟漪 ---
do {
    check(JellyRingMotion.popDuration == 0.32, "弹出时长 0.32 秒")
    check(abs(JellyRingMotion.popScale(age: 0) - 0.82) < 1e-9 && abs(JellyRingMotion.popScale(age: JellyRingMotion.popDuration) - 1) < 1e-9, "弹出缩放：0.82 起，0.32 秒到位")
    check(JellyRingMotion.popScale(age: -1) == JellyRingMotion.popScale(age: 0) && JellyRingMotion.popScale(age: 5) == 1, "弹出缩放：越界夹紧")
    var peak: CGFloat = 0, rising = true, last: CGFloat = 0
    for i in 0...64 {
        let value = JellyRingMotion.popScale(age: JellyRingMotion.popDuration * CGFloat(i) / 64)
        peak = max(peak, value)
        if i > 0 && value + 1e-9 < last && peak < 1.0 { rising = false }
        last = value
    }
    check(peak > 1.005 && peak < 1.06, "弹出有一点过冲但不夸张（峰值 \(String(format: "%.3f", peak))）")
    check(rising, "过冲之前缩放单调增大")
    check(JellyRingMotion.popAlpha(age: 0) == 0 && JellyRingMotion.popAlpha(age: JellyRingMotion.popDuration) == 1 && JellyRingMotion.popAlpha(age: 0.05) > 0 && JellyRingMotion.popAlpha(age: 0.05) < 1, "弹出透明度 0→1")
    check(abs(JellyRingMotion.popAlpha(age: JellyRingMotion.popDuration * 0.2) - 0.5) < 1e-9 && abs(JellyRingMotion.popAlpha(age: JellyRingMotion.popDuration * 0.4) - 1) < 1e-12, "弹出透明度比缩放快：20% 处一半，40% 处完全不透明")
    check(abs(JellyRingMotion.buttonAlpha(age: JellyRingMotion.popDuration * 0.55)) < 1e-12 && abs(JellyRingMotion.buttonAlpha(age: JellyRingMotion.popDuration * 0.775) - 0.5) < 1e-9, "按钮淡入从弹出的 55% 处开始，77.5% 处半透明")
    check(JellyRingMotion.buttonAlpha(age: 0) == 0 && JellyRingMotion.buttonAlpha(age: 0.1) == 0 && JellyRingMotion.buttonAlpha(age: JellyRingMotion.popDuration) == 1 && JellyRingMotion.buttonAlpha(age: 9) == 1, "按钮在弹出后段才淡入")
    var buttonMonotonic = true
    for i in 1...32 { if JellyRingMotion.buttonAlpha(age: 0.32 * CGFloat(i) / 32) < JellyRingMotion.buttonAlpha(age: 0.32 * CGFloat(i - 1) / 32) { buttonMonotonic = false } }
    check(buttonMonotonic, "按钮淡入单调")

    let first = JellyRingMotion.ripples(time: 0, reduceMotion: false)
    check(first.count == 1 && abs(first[0].radius - 20) < 1e-9 && abs(first[0].alpha - 0.55) < 1e-9, "刚开始只有第一圈，半径 20、透明度 0.55")
    check(JellyRingMotion.ripples(time: 0.8, reduceMotion: false).count == 2 && JellyRingMotion.ripples(time: 1.5, reduceMotion: false).count == 3, "后两圈各晚 0.73 秒出发")
    var withinRange = true, alwaysThree = true
    for i in 0...400 {
        let time = 1.5 + CGFloat(i) * 0.0173
        let rings = JellyRingMotion.ripples(time: time, reduceMotion: false)
        if rings.count != 3 { alwaysThree = false }
        for ring in rings where !(ring.radius >= 20 - 1e-9 && ring.radius <= 62 + 1e-9 && ring.alpha >= -1e-12 && ring.alpha <= 0.55 + 1e-9) { withinRange = false }
    }
    check(withinRange && alwaysThree, "稳定后恒为 3 圈，半径 20…62、透明度 0…0.55")
    let halfway = JellyRingMotion.ripples(time: JellyRingMotion.ripplePeriod / 2, reduceMotion: false)
    check(abs(halfway[0].radius - 41) < 1e-9 && abs(halfway[0].alpha - JellyRingMotion.rippleAlpha * 0.25) < 1e-9, "第一圈过半：半径 41，透明度是起点的 1/4（二次衰减，末段平滑消失）")
    func sortedRadii(_ time: CGFloat) -> [CGFloat] { JellyRingMotion.ripples(time: time, reduceMotion: false).map { $0.radius }.sorted() }
    check(zip(sortedRadii(3.0), sortedRadii(3.0 + JellyRingMotion.ripplePeriod)).allSatisfy { abs($0 - $1) < 1e-6 }, "涟漪按 2.2 秒周期循环")
    check(JellyRingMotion.ripples(time: 0.3, reduceMotion: true).count == 2 && JellyRingMotion.ripples(time: 0.3, reduceMotion: true).map { $0.alpha } == [0.30, 0.18] && JellyRingMotion.ripples(time: 7, reduceMotion: true).map { $0.radius } == JellyRingMotion.ripples(time: 0.3, reduceMotion: true).map { $0.radius }, "减少动态效果：静止的两圈，与时间无关")
    check(JellyRingMotion.ripples(time: 0, reduceMotion: true).allSatisfy { $0.radius + 0 <= 62 }, "静止的涟漪也在 62 点以内（不会碰到窗口边缘）")
}

// --- 气泡配色：浅/深两套。底板半透明，对比度按“底板叠在纯白与纯黑上各算一次、取更差的”，渐变两端都算 ---
do {
    func f(_ value: Double) -> String { String(format: "%.2f", value) }
    for (name, palette) in [("浅色", JellyBubblePalette.light), ("深色", JellyBubblePalette.dark)] {
        let rules: [(String, JellyRGB, Double)] = [("大号时间", palette.clock, 3), ("标题", palette.title, 4.5), ("正文", palette.body, 4.5), ("状态", palette.status, 4.5), ("成功", palette.success, 4.5), ("错误", palette.error, 4.5)]
        for (label, color, floor) in rules {
            let worst = palette.worstContrast(of: color)
            check(worst >= floor, "\(name)\(label)文字对比度 \(f(worst)) ≥ \(floor)")
        }
        check(palette.worstGhostContrast() >= 4.5, "\(name)次按钮文字对比度 \(f(palette.worstGhostContrast())) ≥ 4.5")
        check(palette.worstPrimaryContrast() >= 4.5, "\(name)主按钮白字对比度 \(f(palette.worstPrimaryContrast())) ≥ 4.5")
    }
    let lightFill = JellyBubblePalette.light.fillTop.composited(over: JellyRGB(hex: 0xFFFFFF)), darkFill = JellyBubblePalette.dark.fillTop.composited(over: JellyRGB(hex: 0xFFFFFF))
    check(lightFill.luminance > 0.85 && darkFill.luminance < 0.12, "浅色底亮、深色底暗（没有拿反：\(f(lightFill.luminance)) / \(f(darkFill.luminance))）")
    check(JellyBubblePalette.light.border.a > 0.3 && JellyBubblePalette.dark.border.a > 0.3, "金色描边在两套里都看得见")
    check(abs(JellyBubblePalette.contrast(JellyRGB(hex: 0x000000), on: JellyRGB(hex: 0xFFFFFF)) - 21) < 1e-9 && abs(JellyBubblePalette.contrast(JellyRGB(hex: 0xFFFFFF), on: JellyRGB(hex: 0xFFFFFF)) - 1) < 1e-9, "对比度公式：黑白 21:1、同色 1:1")
    check(abs(JellyRGB(hex: 0xFF0000, alpha: 0.5).composited(over: JellyRGB(hex: 0x000000)).r - 0.5) < 1e-12, "半透明叠色")

    // 最差对比度要同时考虑白、黑两种桌面背景：半透明底板在其中一种背景上会让灰字几乎看不清
    let gray = JellyRGB(hex: 0x808080)
    for (name, base) in [("白色半透明底板", JellyRGB(hex: 0xFFFFFF, alpha: 0.5)), ("黑色半透明底板", JellyRGB(hex: 0x000000, alpha: 0.5))] {
        var probe = JellyBubblePalette.light
        probe.fillTop = base; probe.fillBottom = base
        let onWhite = JellyBubblePalette.contrast(gray, on: base.composited(over: JellyRGB(hex: 0xFFFFFF)))
        let onBlack = JellyBubblePalette.contrast(gray, on: base.composited(over: JellyRGB(hex: 0x000000)))
        check(abs(probe.worstContrast(of: gray) - min(onWhite, onBlack)) < 1e-9 && abs(onWhite - onBlack) > 1, "\(name)：最差对比度取白、黑背景里更差的（白 \(f(onWhite))，黑 \(f(onBlack))）")
    }
}

// --- 桌面 AI 助手（协议 v7）：全局快捷键语法（test/desktop-companion-logic.test.mjs 另用 HOTKEY_CASES 与 JS 的 normalizeHotkey 逐条对照）---
// 注意：Swift 的类型推断对“很长的 && 链”和“混合字面量”很慢，这里的断言刻意拆成数组 + 循环，每条只做一次比较。
do {
    typealias M = AssistantModel
    func hk(_ modifiers: [String], _ key: String) -> M.Hotkey { M.Hotkey(modifiers: modifiers, key: key) }
    func config(_ enabled: Any?, _ hotkey: Any? = nil) -> [String: Any] {
        var object: [String: Any] = [:]
        if let enabled = enabled { object["enabled"] = enabled }
        if let hotkey = hotkey { object["hotkey"] = hotkey }
        return object
    }
    func status(_ value: M.Status, input: String = "", message: String = "", at: Double = 0) -> M.State {
        M.State(taskId: "t", version: 1, status: value, input: input, message: message, at: at)
    }

    check(M.canonicalHotkey("ctrl+shift+b") == "ctrl+shift+b", "默认热键本身是规范形式")
    check(M.defaultHotkey == "ctrl+shift+b", "默认热键是 ctrl+shift+b")
    check(M.canonicalHotkey("  Ctrl+Shift+B \n") == "ctrl+shift+b", "大小写与首尾空白被规范化")
    check(M.canonicalHotkey("shift+ctrl+b") == "ctrl+shift+b", "修饰键顺序被规范化（shift+ctrl → ctrl+shift）")
    check(M.canonicalHotkey("cmd+shift+option+ctrl+f20") == "ctrl+option+shift+cmd+f20", "四个修饰键按 ctrl/option/shift/cmd 的固定顺序")
    check(M.canonicalHotkey("cmd+shift+0") == "shift+cmd+0", "cmd+shift+0 规范化为 shift+cmd+0（shift 在 cmd 之前）")
    let validList = ["ctrl+shift+b", "ctrl+shift+space", "ctrl+option+a", "ctrl+option+b", "option+shift+z", "shift+cmd+0", "ctrl+cmd+9", "option+cmd+f1", "ctrl+option+f10", "ctrl+option+f19", "ctrl+option+shift+cmd+f20"]
    for valid in validList { check(M.canonicalHotkey(valid) == valid, "合法热键：\(valid)") }
    let invalidStrings = ["", "b", "ctrl+b", "shift+b", "ctrl+shift", "ctrl+shift+", "+ctrl+shift+b", "ctrl++b", "ctrl+ctrl+b", "ctrl+shift+shift+b",
                          "shift+shift+b", "ctrl+alt+b", "ctrl+shift+enter", "ctrl+shift+f0", "ctrl+shift+f21", "ctrl+shift+f01", "ctrl+shift+f+1", "ctrl+shift+ab", "ctrl+shift+é",
                          "shift+b+c", "ctrl+shift+b+", "ctrl shift b", "ctrl+shift+" + String(repeating: "a", count: 60)]
    for value in invalidStrings { check(M.canonicalHotkey(value) == nil, "非法热键：\(value.prefix(30))") }
    let invalidOthers: [Any?] = [nil, NSNull(), 5, ["ctrl"]]
    for value in invalidOthers { check(M.canonicalHotkey(value) == nil, "非字符串不是热键：\(String(describing: value))") }
    let keyCases: [(String, Bool)] = [("f", true), ("f1", true), ("f9", true), ("f10", true), ("f20", true), ("f21", false), ("f0", false), ("f+5", false), ("F1", false), ("space ", false), ("", false), ("a", true), ("0", true), ("é", false), ("aa", false)]
    for (key, expected) in keyCases { check(M.isValidKey(key) == expected, "按键语法：\(key.isEmpty ? "（空）" : key) → \(expected)") }

    // 键码与修饰键位
    var allKeys: [String] = []
    for code in 97...122 { allKeys.append(String(UnicodeScalar(UInt8(code)))) }
    for digit in 0...9 { allKeys.append(String(digit)) }
    allKeys.append("space")
    for number in 1...20 { allKeys.append("f\(number)") }
    check(allKeys.count == M.keyCount, "合法按键共 \(M.keyCount) 个（26 字母 + 10 数字 + space + 20 功能键）")
    var everyKeyHasCode = true
    for key in allKeys where !(M.isValidKey(key) && M.keyCode(key) != nil) { everyKeyHasCode = false }
    check(everyKeyHasCode, "每个合法按键都有键码")
    var codes = Set<UInt32>()
    for key in allKeys { if let code = M.keyCode(key) { codes.insert(code) } }
    check(codes.count == allKeys.count, "键码互不相同")
    let knownCodes: [(String, UInt32)] = [("a", 0), ("b", 11), ("z", 6), ("0", 29), ("9", 25), ("space", 49), ("f1", 122), ("f5", 96), ("f20", 90)]
    for (key, code) in knownCodes { check(M.keyCode(key) == code, "键码 \(key) = \(code)（与 Carbon kVK_* 一致）") }
    for key in ["enter", "B", "f21", ""] { check(M.keyCode(key) == nil, "不在表里的按键没有键码：\(key.isEmpty ? "（空）" : key)") }
    let modifierBits: [(String, UInt32)] = [("ctrl", 0x1000), ("option", 0x800), ("shift", 0x200), ("cmd", 0x100)]
    for (name, bit) in modifierBits { check(M.carbonModifiers([name]) == bit, "Carbon 修饰键位 \(name) = \(bit)") }
    check(M.carbonModifiers(["ctrl", "shift"]) == 0x1200, "修饰键位按位或")
    check(M.carbonModifiers(["ctrl", "option", "shift", "cmd"]) == 0x1B00, "四个修饰键位全开")
    check(M.carbonModifiers(["ctrl", "bogus"]) == 0x1000, "未知修饰键忽略")
    check(M.carbonModifiers([]) == 0, "没有修饰键位为 0")
    let glyphCases: [(M.Hotkey, String)] = [(hk(["ctrl", "shift"], "b"), "⌃⇧B"), (hk(["ctrl", "shift"], "space"), "⌃⇧空格"), (hk(["ctrl", "option"], "a"), "⌃⌥A"), (hk(["ctrl", "option"], "b"), "⌃⌥B"),
                                            (hk(["ctrl", "option", "shift", "cmd"], "f5"), "⌃⌥⇧⌘F5"), (hk(["ctrl", "cmd"], "0"), "⌃⌘0")]
    for (hotkey, text) in glyphCases { check(M.glyphs(hotkey) == text, "展示符号：\(hotkey.canonical) → \(text)") }

    // 注册结果与配置
    let osStatuses: [(Int32, M.HotkeyStatus)] = [(0, .ok), (-9878, .taken), (-9879, .invalid), (-50, .failed), (1, .failed)]
    for (code, expected) in osStatuses { check(M.hotkeyStatus(osStatus: code) == expected, "RegisterEventHotKey 返回 \(code) → \(expected.rawValue)") }
    check(Set(M.HotkeyStatus.allCases.map { $0.rawValue }) == ["off", "ok", "invalid", "taken", "failed"], "热键状态集合（Chrome 只认 ok/invalid/taken/failed；off 只用于本地与诊断）")
    let disabled: [Any?] = [nil, NSNull(), "x", [1], config(false, "ctrl+shift+b"), config(nil, "ctrl+shift+b"), config("true", "ctrl+shift+b")]
    for value in disabled { check(M.hotkeyPlan(value) == .disable, "关闭：\(String(describing: value))") }
    check(M.hotkeyPlan(config(true, "ctrl+shift+b")) == .register(hk(["ctrl", "shift"], "b")), "启用且热键合法 → 注册")
    check(M.hotkeyPlan(config(true, "Option+CTRL+F5")) == .register(hk(["ctrl", "option"], "f5")), "非规范写法被规范化后注册")
    let badHotkeys: [Any?] = ["shift+b", nil, 5, ""]
    for value in badHotkeys { check(M.hotkeyPlan(config(true, value)) == .invalid, "启用但热键缺失或非法 → invalid：\(String(describing: value))") }
    let shown = hk(["ctrl", "shift"], "b")
    check(M.menuTitle(hotkey: shown, status: .ok) == "问 AI…（⌃⇧B）", "菜单项标题：热键注册成功带符号")
    check(M.menuTitle(hotkey: shown, status: .taken) == "问 AI…", "热键被占用时菜单项不带符号")
    check(M.menuTitle(hotkey: nil, status: .ok) == "问 AI…", "没有热键时菜单项不带符号")
    check(M.footerHint(hotkey: hk(["ctrl", "option"], "a"), status: .ok) == "Esc 收起 · ⌃⌥A 再按一次也可收起", "面板底部提示：热键有效")
    check(M.footerHint(hotkey: nil, status: .off) == "Esc 收起", "面板底部提示：没有热键")
    for failed in [M.HotkeyStatus.taken, .failed, .invalid] { check(M.footerHint(hotkey: shown, status: failed).contains("没有生效"), "热键没生效（\(failed.rawValue)）时底部提示说清楚，不显示一个按了没用的组合") }

    // 工作台任务状态
    let statusNames = ["planning", "running", "waiting", "review", "clarify", "completed", "failed", "interrupted", "cancelled"]
    check(M.Status.allCases.map { $0.rawValue } == statusNames, "九个任务状态（与 Chrome 的 AssistantNative.STATUSES 同一集合，node 测试对照）")
    check(M.parseState(NSNull()) == .cleared, "state 为 null 表示没有任务")
    let notStates: [Any?] = [nil, "x", [1], [String: Any]()]
    for value in notStates { check(M.parseState(value) == .invalid, "state 不是 null 也不是合法对象 → invalid：\(String(describing: value))") }
    let good: [String: Any] = ["taskId": "task_1.a:b-c", "version": 3, "status": "running", "input": "  播放\n周杰伦\t的歌  ", "message": "正在查找…  \n\n\n\n第二段\r\n结尾  ", "at": 1_760_000_000_123.9]
    if case .task(let state) = M.parseState(good) {
        check(state.taskId == "task_1.a:b-c", "合法 state：任务标识")
        check(state.version == 3 && state.status == .running, "合法 state：版本与状态")
        check(state.input == "播放 周杰伦 的歌", "输入文字折成单行（换行与制表当空格、连续空白折叠）")
        check(state.message == "正在查找…\n\n第二段\n结尾", "助手原文保留换行：行尾空格去掉、3 个以上连续换行折成 2 个、CRLF 统一、首尾去空白")
        check(state.at == 1_760_000_000_123, "更新时间取整数毫秒")
    } else { check(false, "合法 state 应该被接受") }
    for name in statusNames {
        var copy = good; copy["status"] = name
        if case .task(let state) = M.parseState(copy) { check(state.status.rawValue == name, "接受状态 \(name)") } else { check(false, "接受状态 \(name)") }
    }
    func mutate(_ key: String, _ value: Any?) -> M.StateUpdate {
        var copy = good
        if let value = value { copy[key] = value } else { copy.removeValue(forKey: key) }
        return M.parseState(copy)
    }
    let badStatuses: [Any?] = ["done", "Running", "", "ready", nil, 3]
    for value in badStatuses { check(mutate("status", value) == .invalid, "未知状态一律 invalid：\(String(describing: value))") }
    let badIDs: [Any?] = ["", "has space", "../x", "a/b", "中文", String(repeating: "a", count: 101), nil, 5]
    for value in badIDs { check(mutate("taskId", value) == .invalid, "非法任务标识 invalid：\(String(describing: value).prefix(24))") }
    check(M.validTaskID(String(repeating: "a", count: 100)) != nil, "任务标识 100 个字符可以")
    check(M.validTaskID("a") != nil, "任务标识 1 个字符可以")
    let badVersions: [Any?] = [-1, 1.5, "3", nil]
    for value in badVersions { check(mutate("version", value) == .invalid, "非法版本 invalid：\(String(describing: value))") }
    if case .task(let state) = mutate("version", 0) { check(state.version == 0, "版本 0 可以") } else { check(false, "版本 0 可以") }
    // 与 JS 的 Number.isSafeInteger 同一条界线：2^53−1 可以，2^53 起拒绝（Chrome 侧本来就不会发出这样的版本，原生再防一道）
    if case .task(let state) = mutate("version", 9_007_199_254_740_991.0) { check(state.version == 9_007_199_254_740_991, "版本取到 2^53−1 可以") } else { check(false, "版本 2^53−1 可以") }
    check(mutate("version", 9_007_199_254_740_992.0) == .invalid, "版本超过 2^53−1 拒绝")
    let badTimes: [Any?] = [-5, "x", 1e300, 0, nil]
    for value in badTimes {
        if case .task(let state) = mutate("at", value) { check(state.at == 0, "更新时间不合规按“不详”处理：\(String(describing: value))") } else { check(false, "更新时间不合规不应拒绝整条 state") }
    }
    // 上限用字面数字而不是 M.maxInputShown / M.maxMessageShown：与常量比较会让“常量改了测试也跟着改”（js/assistant-native.js 的 MAX_SHOWN_* 是同一对数字）
    if case .task(let state) = mutate("input", String(repeating: "长", count: 300)) {
        check(state.input.unicodeScalars.count == 120, "输入文字超过 120 字截断到 120（含 …）")
        check(state.input.hasSuffix("…"), "输入文字截断后以 … 结尾")
    } else { check(false, "长输入不应被拒绝") }
    if case .task(let state) = mutate("input", String(repeating: "长", count: 120)) { check(state.input == String(repeating: "长", count: 120), "输入文字刚好 120 字原样保留") } else { check(false, "120 字输入不应被拒绝") }
    if case .task(let state) = mutate("input", String(repeating: "长", count: 121)) { check(state.input == String(repeating: "长", count: 119) + "…", "输入文字 121 字截成 119 字加 …") } else { check(false, "121 字输入不应被拒绝") }
    if case .task(let state) = mutate("message", String(repeating: "字", count: 2000)) {
        check(state.message.unicodeScalars.count == 1200, "助手原文超过 1200 字截断到 1200（含 …）")
        check(state.message.hasSuffix("…"), "助手原文截断后以 … 结尾")
    } else { check(false, "长原文不应被拒绝") }
    if case .task(let state) = mutate("message", String(repeating: "字", count: 1200)) { check(state.message == String(repeating: "字", count: 1200), "助手原文刚好 1200 字原样保留") } else { check(false, "1200 字原文不应被拒绝") }
    if case .task(let state) = mutate("message", String(repeating: "字", count: 1201)) { check(state.message == String(repeating: "字", count: 1199) + "…", "助手原文 1201 字截成 1199 字加 …") } else { check(false, "1201 字原文不应被拒绝") }
    if case .task(let state) = mutate("message", "a\u{202E}b\u{0007}c\u{200F}d\u{2066}e") { check(state.message == "abcde", "方向控制符与控制字符被去掉，不会改变显示方向") } else { check(false, "含控制字符的原文不应被拒绝") }
    if case .task(let state) = mutate("input", nil) {
        check(state.input == "", "缺少 input 按空串")
        check(M.youLine(state) == "", "没有需求文字时没有“你：”行")
    } else { check(false, "缺少 input 不应被拒绝") }
    check(M.clip("abcdef", max: 4) == "abc…", "截断：超出才截，末尾 …，总长不超过上限")
    check(M.clip("abcd", max: 4) == "abcd", "截断：刚好不超出就原样")
    check(M.clip("ab cd", max: 4) == "ab…", "截断处的空白去掉")
    check(M.clip("😀😀😀😀😀", max: 3) == "😀😀…", "非 BMP 字符按一个标量计")
    check(M.oneLine(5, max: 10) == "" && M.oneLine(nil, max: 10) == "" && M.multiline(nil, max: 10) == "", "清洗函数对非字符串返回空串")
    check(M.oneLine("  a \n b  ", max: 10) == "a b", "单行清洗：折叠空白")

    // 状态行：优先级与措辞
    let now = 1_760_000_000_000.0
    func line(_ value: M.Status?, pending: M.PendingKind? = nil, note: M.Note? = nil, ageSeconds: Double? = nil) -> (text: String, tone: M.Tone) {
        var state: M.State?
        if let value = value { state = status(value, input: "x", message: "m", at: ageSeconds.map { now - $0 * 1000 } ?? 0) }
        return M.statusLine(state: state, pending: pending, note: note, nowMs: now)
    }
    check(line(nil).text == M.idleHint, "没有任务：空闲提示")
    check(line(nil).tone == .normal, "没有任务：中性语气")
    check(line(.planning).text == "正在规划…", "规划中")
    check(line(.running).text == "正在执行…", "执行中")
    check(line(.planning).tone == .normal && line(.running).tone == .normal, "进行中是中性语气")
    for value in [M.Status.waiting, .review, .clarify] {
        check(line(value).tone == .attention, "\(value.rawValue)：需要用户处理的语气")
        check(line(value).text.contains("确认卡"), "\(value.rawValue)：说明在哪里处理")
        check(!line(value).text.contains("已弹出"), "\(value.rawValue)：不声称确认卡一定已弹出（那是另一条链路的事）")
    }
    check(line(.waiting).text.contains("选择"), "等待选择点明要选择")
    check(line(.review).text.contains("确认"), "等待确认点明要确认")
    check(line(.clarify).text.contains("补充"), "等待补充点明要补充")
    check(line(.completed).text == "助手已回复", "completed 只说“助手已回复”")
    for value in [M.Status.completed, .cancelled, .failed, .interrupted] {
        for claim in ["已播放", "已设置", "已完成", "已添加", "已创建"] { check(!line(value).text.contains(claim), "\(value.rawValue) 的状态行不改写成业务结果“\(claim)”") }
    }
    check(line(.failed).tone == .bad, "失败是醒目语气")
    check(line(.failed).text.hasPrefix("没有完成"), "失败的措辞")
    check(line(.interrupted).tone == .bad, "interrupted 是醒目语气")
    check(line(.interrupted).text.contains("核对") && line(.interrupted).text.contains("不要直接重做"), "interrupted（未知回执）要求核对，不提供重试")
    check(line(.cancelled).text == "已取消", "已取消")
    check(line(.completed, ageSeconds: 300).text == "助手已回复 · 5 分钟前", "已结束的状态带相对时间")
    check(line(.failed, ageSeconds: 10).text == "没有完成 · 刚刚", "失败也带相对时间")
    check(line(.planning, ageSeconds: 300).text == "正在规划…", "进行中的状态不带相对时间")
    check(line(.running, pending: .submit).text == "正在交给 Chrome…", "等提交回执：正在交给 Chrome")
    check(line(.running, pending: .stop).text == "正在请求停止…", "等停止回执：正在请求停止")
    check(line(.running, pending: .open).text.contains("打开工作台"), "等打开回执：正在请求打开工作台")
    let rejected = M.Note(text: "被拒绝了", bad: true)
    check(line(.running, note: rejected).text == "被拒绝了", "本地提示盖过任务状态")
    check(line(.running, note: rejected).tone == .bad, "本地提示的语气随 bad")
    check(line(nil, note: M.Note(text: "好的", bad: false)).tone == .normal, "非错误提示是中性语气")
    check(line(.running, pending: .submit, note: rejected).text == "正在交给 Chrome…", "回执等待盖过本地提示")
    check(M.canStop(nil) == false, "没有任务不显示停止")
    for value in M.Status.allCases { check(M.canStop(status(value)) == (value == .planning || value == .running), "只有规划 / 执行中才能停止：\(value.rawValue)") }
    check(M.needsAttention(nil) == false, "没有任务不需要处理")
    for value in M.Status.allCases { check(M.needsAttention(status(value)) == (value == .waiting || value == .review || value == .clarify), "需要用户处理的状态：\(value.rawValue)") }
    let ages: [(Double, String)] = [(0, ""), (now + 1000, ""), (now - 10_000, "刚刚"), (now - 44_900, "刚刚"), (now - 45_000, "1 分钟前"), (now - 119_000, "1 分钟前"), (now - 120_000, "2 分钟前"), (now - 3_599_000, "59 分钟前"),
                                    (now - 3_600_000, "1 小时前"), (now - 86_399_000, "23 小时前"), (now - 86_400_000, "超过一天前")]
    for (at, expected) in ages { check(M.ageText(at: at, nowMs: now) == expected, "相对时间 \(Int((now - at) / 1000)) 秒 → \(expected.isEmpty ? "（空）" : expected)") }
    check(M.youLine(nil) == "", "没有任务没有“你：”行")
    check(M.youLine(status(.completed, input: "播放周杰伦")) == "你：播放周杰伦", "“你：”那一行")
    let longYou = M.youLine(status(.completed, input: String(repeating: "字", count: 100)))
    check(longYou.hasPrefix("你：") && longYou.hasSuffix("…"), "“你：”过长截断并以 … 结尾")
    check(longYou.unicodeScalars.count == 2 + 60, "“你：”最多 60 个字符")

    // Chrome 回执 → 本地提示
    check(M.resultNote(kind: .submit, ok: true, error: nil, stateChangedSince: false) == M.Note(text: "已交给 Chrome，等待助手…", bad: false), "提交成功后只写中性说明，不声称任务已完成")
    check(M.resultNote(kind: .stop, ok: true, error: nil, stateChangedSince: false)?.bad == false, "停止成功的说明是中性的")
    check(M.resultNote(kind: .open, ok: true, error: nil, stateChangedSince: false)?.text == "已请求 Chrome 打开工作台", "打开成功的说明只说“已请求”")
    for kind in [M.PendingKind.submit, .stop, .open] { check(M.resultNote(kind: kind, ok: true, error: nil, stateChangedSince: true) == nil, "回执到达前状态已经推来：\(kind.rawValue) 不再盖一条过时的提示") }
    check(M.resultNote(kind: .submit, ok: false, error: "当前任务正在执行，请先停止或等待完成", stateChangedSince: true) == M.Note(text: "当前任务正在执行，请先停止或等待完成", bad: true), "失败：显示 Chrome 给的原因（即使状态变了也要显示）")
    check(M.resultNote(kind: .submit, ok: false, error: nil, stateChangedSince: false)?.text == "Chrome 没有接受这次操作，请重试", "失败但没有原因：通用说明")
    check(M.resultNote(kind: .submit, ok: false, error: 5, stateChangedSince: false)?.bad == true, "失败原因不是字符串：通用说明且醒目")
    check((M.resultNote(kind: .submit, ok: false, error: String(repeating: "错", count: 400), stateChangedSince: false)?.text.unicodeScalars.count ?? 999) <= 200, "失败原因最多 200 字")
    check(M.noAckNote.bad && M.noAckNote.text.contains("尚未确认"), "没有回执：提示尚未确认，不声称已提交")
    check(M.noAckSeconds == 8, "8 秒没有回执")

    // 输入检查
    check(M.checkInput("") == .empty, "空串不发")
    check(M.checkInput("   \n\t ") == .empty, "只有空白不发")
    check(M.checkInput("\u{0007}\u{202E}") == .empty, "只有控制字符不发")
    check(M.checkInput(" 播放音乐 ") == .ok("播放音乐"), "首尾空白去掉")
    check(M.checkInput("a\nb\tc") == .ok("a b c"), "换行与制表当空格")
    check(M.checkInput("a\u{0007}b\u{200F}c") == .ok("abc"), "控制字符与方向控制符去掉")
    check(M.checkInput(String(repeating: "字", count: 500)) == .ok(String(repeating: "字", count: 500)), "500 字可以")
    check(M.checkInput(String(repeating: "字", count: 501)) == .tooLong(501), "501 字不发（不截断）")
    check(M.checkInput(String(repeating: "😀", count: 500)) == .ok(String(repeating: "😀", count: 500)), "500 个非 BMP 字符可以（按 Unicode 标量计，与 Chrome 的 [...text].length 一致）")
    check(M.checkInput(String(repeating: "😀", count: 501)) == .tooLong(501), "501 个非 BMP 字符不发")
    check(M.checkInput(String(repeating: "e\u{301}", count: 251)) == .tooLong(502), "组合字符各算一个标量：251 个分解形式的 é 是 502")
    check(M.inputNote(.ok("x")) == nil, "能发的输入没有提示")
    check(M.inputNote(.empty)?.bad == false, "空白输入是中性提示")
    check(M.inputNote(.tooLong(501))?.bad == true, "超长是醒目提示")
    check(M.inputNote(.tooLong(501))?.text.contains("501") == true, "超长提示带当前字数")
    check(M.maxInput == 500, "输入上限与 Chrome 一致")

    // 焦点重试：核对一次，没拿到再试一次，仍没有就提示；不无限重试
    check(M.focusDecision(isKey: true, appActive: true, hadKeyboard: false, retries: 0) == .done, "已是键窗口且应用已激活：完成")
    check(M.focusDecision(isKey: true, appActive: true, hadKeyboard: false, retries: 1) == .done, "重试后拿到：完成")
    for (isKey, active) in [(true, false), (false, true), (false, false)] { check(M.focusDecision(isKey: isKey, appActive: active, hadKeyboard: false, retries: 0) == .retry, "首次没拿到（key \(isKey)、active \(active)）：重试") }
    for (isKey, active) in [(true, false), (false, true), (false, false)] { check(M.focusDecision(isKey: isKey, appActive: active, hadKeyboard: false, retries: 1) == .giveUp, "重试后仍没拿到（key \(isKey)、active \(active)）：放弃并提示") }
    check(M.focusDecision(isKey: false, appActive: false, hadKeyboard: false, retries: 5) == .giveUp, "重试次数越界也是放弃，不会无限重试")
    // 拿到过键盘又失去（用户切去别的应用或点了别处）：不是激活没生效，核对不能把键盘抢回来，也不提示“没有拿到键盘焦点”
    for retries in 0...5 { for (isKey, active) in [(true, false), (false, true), (false, false)] { check(M.focusDecision(isKey: isKey, appActive: active, hadKeyboard: true, retries: retries) == .done, "拿到过键盘后失去（key \(isKey)、active \(active)、已重试 \(retries)）：不重试不提示") } }
    check(M.maxFocusRetries == 1, "只重试一次")
    check(M.focusCheckDelay == 0.25, "250 毫秒后核对")
    check(M.focusHint.contains("点一下输入框"), "焦点提示可行动")

    // 面板位置
    let visible = CGRect(x: 0, y: 40, width: 1440, height: 860)
    let placed = M.panelFrame(visible: visible, size: CGSize(width: 560, height: 300))
    check(abs(placed.midX - 720) < 1e-9, "面板水平居中")
    check(abs(placed.maxY - (900 - 860 * 0.22)) < 1e-9, "面板顶边在可见区高度的 22% 处")
    check(placed.width == 560 && placed.height == 300, "面板尺寸不变")
    check(visible.contains(placed), "面板完全在可见区内")
    let second = CGRect(x: -1920, y: 0, width: 1920, height: 1055)
    let onSecond = M.panelFrame(visible: second, size: CGSize(width: 560, height: 300))
    check(abs(onSecond.midX - (-960)) < 1e-9, "副屏（原点为负）同样水平居中")
    check(second.contains(onSecond), "副屏上面板落在该屏内")
    let tall = M.panelFrame(visible: visible, size: CGSize(width: 560, height: 2000))
    check(tall.minY == visible.minY, "比可见区还高：贴可见区底边，不飞出")
    check(M.panelFrame(visible: visible, size: CGSize(width: 3000, height: 100)).minX == visible.minX, "比可见区还宽：贴左边")
    let shorter = M.resized(frame: placed, height: 200, visible: visible)
    let taller = M.resized(frame: placed, height: 480, visible: visible)
    check(abs(shorter.maxY - placed.maxY) < 1e-9, "变矮时顶边不动")
    check(abs(taller.maxY - placed.maxY) < 1e-9, "变高时顶边不动")
    check(shorter.minX == placed.minX && taller.width == placed.width, "高度变化时横向位置与宽度不变")
    let huge = M.resized(frame: placed, height: 900, visible: visible)
    check(huge.minY >= visible.minY, "高度超出可见区时底边夹进可见区")
    check(M.panelWidth == 560, "面板宽度 560")
    check(M.panelTopInset == 0.22, "面板顶边 22%")

    // 与 JS 对照用的输出：Node 测试把 HOTKEY_CASES（JSON 数组）里的每一项交给这里，再与 JS 的 normalizeHotkey 逐条比较；预设的展示符号与设置页下拉里的文字比较
    if let path = ProcessInfo.processInfo.environment["HOTKEY_CASES"], let data = FileManager.default.contents(atPath: path),
       let cases = (try? JSONSerialization.jsonObject(with: data)) as? [Any] {
        for (index, value) in cases.enumerated() {
            print("HOTKEY \(index) \(M.canonicalHotkey(value) ?? "-")")
            if let parsed = M.parseHotkey(value) { print("GLYPH \(index) \(M.glyphs(parsed))") }
        }
    }
    // ---- 外观解析与调色板（见 jelly-appearance.swift；Chrome 侧是 js/jelly-appearance.js）----
    do {
        typealias A = JellyAppearance
        check(A.palette.count == A.colorCount, "调色板有 8 个色位")
        check(A.palette[5].r == 0.40 && A.palette[5].g == 0.74 && A.palette[5].b == 0.90, "色位 5 恰好是平静色（默认外观才逐像素不变）")
        let hues = A.palette.map { A.hue($0) }
        check(zip(hues, hues.dropFirst()).allSatisfy { $0 < $1 }, "色位的色相严格递增（红→橙→黄→绿→薄荷→冰蓝→紫→洋红）")
        // 调色板的辨识度：任意两个色位的 CIE76 Lab 色差 ≥ 20（当前最近的一对是绿与薄荷，约 27）。
        // 半透明叠在壁纸上会压缩色差——真实渲染的数据见 desktop-reminder/appearance-contrast.mjs；Node 测试用另一份 Lab 实现对照这里的最小值
        func lab(_ c: (r: Double, g: Double, b: Double)) -> (l: Double, a: Double, b: Double) {
            func linear(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
            let r = linear(c.r), g = linear(c.g), b = linear(c.b)
            let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
            let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
            let z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883
            func f(_ t: Double) -> Double { t > 0.008856 ? cbrt(t) : 7.787 * t + 16.0 / 116.0 }
            return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
        }
        var closest = (i: 0, j: 1, delta: Double.infinity)
        for i in 0..<A.palette.count {
            for j in (i + 1)..<A.palette.count {
                let p = lab(A.palette[i]), q = lab(A.palette[j])
                let delta = (pow(p.l - q.l, 2) + pow(p.a - q.a, 2) + pow(p.b - q.b, 2)).squareRoot()
                if delta < closest.delta { closest = (i, j, delta) }
            }
        }
        check(closest.delta >= 20, "调色板任意两个色位的 Lab 色差 ≥ 20（最近的一对：色位 \(closest.i) 与 \(closest.j)，\(String(format: "%.1f", closest.delta))）")
        print("PALETTEMIN \(closest.i) \(closest.j) \(String(format: "%.2f", closest.delta))")
        check(A.parse(nil) == .default && A.parse("x") == .default && A.parse([String: Any]()) == .default, "没有或不是字典：默认")
        let full = A.parse(["color": 2, "colors": [2, 4, 6], "look": "rainbow", "material": "wire", "size": "large", "season": "christmas"] as [String: Any])
        check(full.colors == [2, 4, 6] && full.look == .rainbow && full.material == .wire && full.size == .large && full.season == "christmas", "完整负载逐项解析")
        check(A.parse(["colors": [9], "color": 3] as [String: Any]).colors == [3], "colors 里有越界色位：整体回到 color")
        check(A.parse(["colors": [1, 2, 3, 4]] as [String: Any]).colors == [A.defaultColor], "colors 超过 3 个：整体丢弃")
        check(A.parse(["colors": [] as [Int], "color": 6] as [String: Any]).colors == [6], "colors 为空：用 color")
        check(A.parse(["color": true] as [String: Any]).colors == [A.defaultColor], "布尔不是色位")
        check(A.parse(["color": 2.5] as [String: Any]).colors == [A.defaultColor], "小数不是色位")
        check(A.parse(["color": "1"] as [String: Any]).colors == [A.defaultColor], "字符串不是色位")
        check(A.parse(["colors": [true, 1]] as [String: Any]).colors == [A.defaultColor], "colors 里有布尔：整体丢弃")
        let thin = A.parse(["colors": [1], "look": "rainbow"] as [String: Any])
        check(thin.look == .solid && thin.colors == [1], "花纹要的颜色不够：退回纯色")
        check(A.parse(["colors": [1, 4], "look": "duo"] as [String: Any]).look == .duo, "两色可以是 duo")
        check(A.parse(["season": "easter"] as [String: Any]).season == nil, "未知节日丢弃")
        check(A.parse(["material": "metal"] as [String: Any]).material == .glass, "未知材质回到玻璃")
        check(A.parse(["size": "xl"] as [String: Any]).size == .medium, "未知尺寸回到中号")
        // 色位边界：0…7 合法，8 与 -1 不合法（只测过 9 时，把 `< 8` 写成 `<= 8` 也能通过）
        check(A.parse(["color": 0] as [String: Any]).colors == [0] && A.parse(["color": 7] as [String: Any]).colors == [7], "色位 0 与 7 合法")
        check(A.parse(["color": 8] as [String: Any]).colors == [A.defaultColor] && A.parse(["color": -1] as [String: Any]).colors == [A.defaultColor], "色位 8 与 -1 不合法，回到默认")
        check(A.parse(["colors": [7], "color": 3] as [String: Any]).colors == [7] && A.parse(["colors": [8], "color": 3] as [String: Any]).colors == [3], "colors 里的 7 合法，8 整体回到 color")
        check(A.parse(["colors": [0, 8], "color": 3] as [String: Any]).colors == [3], "colors 里只要有一个越界（哪怕在末位）就整体回到 color")
        // 花纹需要的色位数：七彩 3、双色与渐变 2、纯色 1
        let twoRainbow = A.parse(["colors": [1, 4], "look": "rainbow"] as [String: Any])
        check(twoRainbow.look == .solid && twoRainbow.colors == [1], "七彩只给两个色位：退回纯色，只留主色")
        check(A.parse(["colors": [1, 4, 6], "look": "rainbow"] as [String: Any]).look == .rainbow, "给足三个色位才是七彩")
        check(A.parse(["colors": [1], "look": "duo"] as [String: Any]).look == .solid && A.parse(["colors": [1], "look": "blend"] as [String: Any]).look == .solid, "双色与渐变各需要两个色位，只有一个时退回纯色")
        check(A.parse(["colors": [1, 4], "look": "blend"] as [String: Any]).look == .blend && A.parse(["colors": [1, 4, 6], "look": "duo"] as [String: Any]).look == .duo, "给足（或多给）色位时保持所选花纹")
    }
    // ---- 物种（见 jelly-species.swift；Chrome 侧是 js/jelly-appearance.js 的 SPECIES，Node 测试逐项对照）----
    do {
        typealias S = JellySpecies
        typealias A = JellyAppearance
        check(S.allCases.map { $0.rawValue } == ["jelly", "hammer", "manta", "turtle", "whaleshark"], "物种列表与顺序")
        print("SPECIES \(S.allCases.map { $0.rawValue }.joined(separator: ","))")
        for species in S.allCases { print("SPECIESNAME \(species.rawValue) \(species.displayName)") }
        check(S.default == .jelly && A.default.species == .jelly, "默认物种是水母")
        check(S.jelly.displayName == "水母" && S.hammer.displayName == "小锤头鲨" && S.manta.displayName == "蝠鲼" && S.turtle.displayName == "海龟" && S.whaleshark.displayName == "鲸鲨", "物种中文名")
        check(Set(S.allCases.map { $0.displayName }).count == S.allCases.count, "物种中文名互不相同")
        check(S.jelly.desktopTitle == "桌面水母" && S.hammer.desktopTitle == "桌面小锤头鲨" && S.manta.desktopTitle == "桌面蝠鲼" && S.turtle.desktopTitle == "桌面海龟" && S.whaleshark.desktopTitle == "桌面鲸鲨", "面板标题：水母保持“桌面水母”，动物用物种名")
        for species in S.allCases { check(S.parse(species.rawValue) == species, "解析 \(species.rawValue)") }
        let badValues: [(String, Any?)] = [("nil", nil), ("空串", ""), ("首字母大写", "Hammer"), ("全大写", "HAMMER"), ("前导空格", " hammer"), ("尾随空格", "hammer "),
                                           ("未知名", "shark"), ("整数", 3), ("NSNumber 1", NSNumber(value: 1)), ("布尔", true), ("NSNull", NSNull()), ("数组", ["hammer"]), ("字典", ["species": "hammer"])]
        for (name, value) in badValues { check(S.parse(value) == .jelly, "非法物种（\(name)）回到水母，不崩溃") }
        // 还画不出来的物种（没有几何数据）：生效的永远是水母——Chrome 据回执里的 species 判断，不会把没画出来的说成已应用
        check(S.jelly.isAvailable && S.jelly.effective == .jelly, "水母永远可用")
        for species in S.allCases { check(species.isAvailable ? species.effective == species : species.effective == .jelly, "\(species.rawValue)：可用则原样生效，不可用回退水母") }
        // 外观里的物种
        check(A.parse(["species": "hammer"] as [String: Any]).species == .hammer, "负载里的物种被解析")
        check(A.parse(["species": "Hammer"] as [String: Any]).species == .jelly && A.parse(["species": 3] as [String: Any]).species == .jelly && A.parse(["species": true] as [String: Any]).species == .jelly, "负载里的非法物种回到水母")
        check(A.parse(["species": NSNull()] as [String: Any]).species == .jelly && A.parse(["color": 2] as [String: Any]).species == .jelly, "负载里没有（或为 null 的）物种是水母")
        let withSpecies = A.parse(["colors": [1, 4, 6], "look": "rainbow", "material": "wire", "size": "large", "season": "christmas", "species": "hammer"] as [String: Any])
        check(withSpecies.colors == [1, 4, 6] && withSpecies.look == .rainbow && withSpecies.material == .wire && withSpecies.size == .large && withSpecies.season == "christmas" && withSpecies.species == .hammer, "物种与其他字段互不影响")
        let badSpecies = A.parse(["colors": [1, 4], "look": "duo", "species": "x"] as [String: Any])
        check(badSpecies.colors == [1, 4] && badSpecies.look == .duo && badSpecies.species == .jelly, "物种非法不影响别的字段")
        check(A.default != A.parse(["species": "hammer"] as [String: Any]), "物种参与相等判断（换物种要触发重绘与重新取调参）")
        check(A.parse(nil).species == .jelly && A.parse("x").species == .jelly, "没有或不是字典：水母")
    }
    // ---- 动物几何（见 jelly-species.swift 的解析与放置；形状数据由 gen-species.mjs 从 js/jelly-species-shapes.js 生成，Node 逐项对拍）----
    do {
        typealias P = SpeciesPath
        typealias S = JellySpecies
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }
        func f(_ value: CGFloat) -> String { String(format: "%.9f", Double(value)) }
        // 路径解析：合规输入逐命令还原
        let valid = P.parse("M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Q 1.5 2.25 3 4 Z")
        check(valid?.map { $0.kind } == [.move, .line, .cubic, .quad, .close], "路径：M/L/C/Q/Z 逐命令还原")
        check(valid?[0].points == [pt(10, -7)] && valid?[1].points == [pt(-2, -25)] && valid?[2].points == [pt(-6, -22), pt(-8, -14), pt(-9, -6)], "路径：M、L、C 的点")
        check(valid?[3].points == [pt(1.5, 2.25), pt(3, 4)] && valid?[4].points.isEmpty == true, "路径：Q 的点、Z 没有点")
        check(P.parse("M 0 0 L 1 1 Z M 5 5 L 6 6 Z")?.count == 6, "路径：Z 之后可以再开子路径")
        check(P.parse("M\t1\n2  L   3\r\n4")?.map { $0.points[0] } == [pt(1, 2), pt(3, 4)], "路径：空白只认空格、制表、换行（含 CRLF）")
        check(P.parse("M -0 0.5")?.first?.points.first == pt(0, 0.5), "路径：负零可以解析")
        // 不合规的输入一律 nil（与 JS 的 parsePath 同一份清单；PARSE_CASES 另外逐项对拍）
        let tooLong = "M 0 0 " + String(repeating: "L 1 1 ", count: P.maxChars)
        let tooMany = "M 0 0 " + String(repeating: "L 1 1 ", count: P.maxCommands + 1)
        let badPaths: [(String, String)] = [
            ("空串", ""), ("只有空白", "   \n"), ("不以 M 开头", "L 1 1"), ("Z 开头", "Z"),
            ("小写命令", "m 0 0 l 1 1"), ("相对命令", "M 0 0 l 1 1"), ("H", "M 0 0 H 5"), ("V", "M 0 0 V 5"), ("S", "M 0 0 S 1 1 2 2"), ("T", "M 0 0 T 1 1"), ("A", "M 0 0 A 1 1 0 0 0 5 5"),
            ("未知字母", "M 0 0 X 1 1"), ("命令与数字粘在一起", "M0 0 L 1 1"), ("数字粘着命令", "M 0 0L 1 1"),
            ("缺数字（M）", "M 1"), ("缺数字（L）", "M 0 0 L 1"), ("缺数字（C）", "M 0 0 C 1 1 2 2 3"), ("缺数字（Q）", "M 0 0 Q 1 1 2"),
            ("多余数字（隐式重复 L）", "M 0 0 L 1 1 2 2"), ("多余数字（M 后三个）", "M 0 0 5"), ("Z 后跟数字", "M 0 0 L 1 1 Z 5"), ("Z 之后不是 M", "M 0 0 L 1 1 Z L 2 2"),
            ("逗号分隔", "M 0,0 L 1,1"), ("指数", "M 1e3 0"), ("前导加号", "M +1 0"), ("省略整数部分", "M .5 0"), ("省略小数部分", "M 5. 0"), ("十六进制", "M 0x10 0"),
            ("无穷", "M Infinity 0"), ("NaN", "M NaN 0"), ("两个负号", "M --1 0"), ("数字里有字母", "M 1a 0"), ("全角数字", "M １ ０"), ("不间断空格", "M\u{00A0}0 0"),
            ("过长", tooLong), ("命令过多", tooMany),
        ]
        for (name, d) in badPaths { check(P.parse(d) == nil, "路径：不合规（\(name)）→ nil") }
        check(P.parse("M 0 0 " + String(repeating: "L 1 1 ", count: P.maxCommands - 1)) != nil, "路径：命令数刚好在上限内可以解析")
        check(P.parse("M 0 0 " + String(repeating: "L 1 1 ", count: P.maxCommands)) == nil, "路径：命令数超出上限一条就拒绝")
        let atLimit = "M 0 0 L 1." + String(repeating: "0", count: P.maxChars - 12) + " 1"
        check(atLimit.utf16.count == P.maxChars && P.parse(atLimit) != nil, "路径：长度刚好等于上限可以解析")
        let overLimit = "M 0 0 L 1." + String(repeating: "0", count: P.maxChars - 11) + " 1"
        check(overLimit.utf16.count == P.maxChars + 1 && P.parse(overLimit) == nil, "路径：长度超出上限一个字符就拒绝")
        // 取样点：端点原样，贝塞尔每段 16 个点（t = i/16）
        let cubic = P.sample(P.parse("M 0 0 C 0 10 10 10 10 0")!)
        check(cubic.count == 1 + P.samplesPerSegment && cubic.first == pt(0, 0) && cubic.last == pt(10, 0), "取样：三次贝塞尔 1 + 16 个点，首尾是端点")
        check(abs(cubic[8].x - 5) < 1e-9 && abs(cubic[8].y - 7.5) < 1e-9, "取样：三次贝塞尔 t = 0.5 处是 (5, 7.5)")
        let quad = P.sample(P.parse("M 0 0 Q 5 10 10 0")!)
        check(quad.count == 1 + P.samplesPerSegment && abs(quad[8].x - 5) < 1e-9 && abs(quad[8].y - 5) < 1e-9, "取样：二次贝塞尔 t = 0.5 处是 (5, 5)")
        check(P.sample(P.parse("M 1 2 L 3 4 Z")!) == [pt(1, 2), pt(3, 4)], "取样：直线端点原样，Z 不产生点")
        // 二次贝塞尔之后的曲线以它的终点为起点：第 17 个点是后面三次曲线 t = 1/16 处，起点必须是 (20, 0)
        let chain = P.sample(P.parse("M 0 0 Q 10 10 20 0 C 30 0 40 10 50 10")!)
        let t1: CGFloat = 1.0 / 16, s1 = 1 - t1
        let w0 = s1 * s1 * s1, w1 = 3 * s1 * s1 * t1, w2 = 3 * s1 * t1 * t1, w3 = t1 * t1 * t1
        check(chain.count == 1 + 2 * P.samplesPerSegment && chain[P.samplesPerSegment] == pt(20, 0), "取样：二次贝塞尔的最后一个点是它的终点")
        check(abs(chain[P.samplesPerSegment + 1].x - (w0 * 20 + w1 * 30 + w2 * 40 + w3 * 50)) < 1e-9 && abs(chain[P.samplesPerSegment + 1].y - (w2 * 10 + w3 * 10)) < 1e-9, "取样：二次贝塞尔之后的曲线以它的终点为起点（\(chain[P.samplesPerSegment + 1])）")
        // 动物：数据表与几何
        let animals = S.allCases.filter { $0 != .jelly }
        let available = animals.filter { $0.isAvailable }
        print("SPECAVAILABLE \(S.allCases.filter { $0.isAvailable }.map { $0.rawValue }.joined(separator: ","))")
        check(Set(JellySpeciesData.sources.keys) == Set(available), "可用的动物 = 数据表里的动物（每一项的全部路径都能解析成几何）")
        check(JellySpeciesGeometry.of(.jelly) == nil && S.jelly.isAvailable, "水母没有几何（过程式画法），但永远可用")
        // 一个坏数据表项（路径解析不了、没有部件、非有限缩放）不产生几何，物种就不可用
        let badSource = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 1", motion: nil)], eyeRadius: 1, eyes: [], blush: [])
        check(SpeciesGeometry(species: .hammer, source: badSource) == nil, "几何：路径解析不了 → 没有几何")
        let emptySource = SpeciesSource(view: .top, scale: 1, parts: [], eyeRadius: 1, eyes: [], blush: [])
        check(SpeciesGeometry(species: .hammer, source: emptySource) == nil, "几何：没有部件 → 没有几何")
        let zeroScale = SpeciesSource(view: .top, scale: 0, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 1 1 Z", motion: nil)], eyeRadius: 1, eyes: [], blush: [])
        check(SpeciesGeometry(species: .hammer, source: zeroScale) == nil, "几何：缩放为 0 → 没有几何")
        let noBody = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .limb, u: 0.5, path: "M 0 0 L 1 1 Z", motion: nil)], eyeRadius: 1, eyes: [], blush: [])
        check(SpeciesGeometry(species: .hammer, source: noBody) == nil, "几何：没有躯干部件 → 没有几何（渐变与光晕无处定位）")
        let badEye = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 1 1 Z", motion: nil)], eyeRadius: 1, eyes: [[1]], blush: [])
        check(SpeciesGeometry(species: .hammer, source: badEye) == nil, "几何：眼睛坐标不是两个数 → 没有几何")
        // 转动部件：转轴随缩放换算并翻成 y 向上，角度取反；包围盒随相位按解析值变化（缩放 0.5、转轴 (2, 1)、90°，方块 20…24 × 0…4；
        // 转轴有意不在方块的中线上，否则上下对称，转动公式里 y 分量的符号写反了也看不出来）
        let spinSource = SpeciesSource(view: .top, scale: 0.5, parts: [SpeciesPartSource(role: .body, u: 1.5, path: "M 20 0 L 24 0 L 24 4 L 20 4 Z", motion: SpeciesMotionSource(pivotX: 2, pivotY: 1, degrees: 90))], eyeRadius: 1, eyes: [], blush: [])
        if let spin = SpeciesGeometry(species: .hammer, source: spinSource), let motion = spin.parts[0].motion {
            func sameBox(_ box: CGRect, _ x0: CGFloat, _ x1: CGFloat, _ y0: CGFloat, _ y1: CGFloat) -> Bool {
                abs(box.minX - x0) < 1e-9 && abs(box.maxX - x1) < 1e-9 && abs(box.minY - y0) < 1e-9 && abs(box.maxY - y1) < 1e-9
            }
            check(abs(motion.pivot.x - 1) < 1e-12 && abs(motion.pivot.y + 0.5) < 1e-12 && abs(motion.maxAngle + .pi / 2) < 1e-12, "转动：转轴按缩放换算并翻成 y 向上（(1, −0.5)），角度取反（−90°）")
            check(spin.parts[0].u == 1, "转动：取色位置超过 1 时夹到 1")
            check(sameBox(spin.bounds(wave: 0), 10, 12, -2, 0), "转动：wave = 0 时方块不动（x 10…12、y −2…0）")
            check(sameBox(spin.bounds(wave: 1), -0.5, 1.5, -11.5, -9.5), "转动：wave = 1 时绕转轴顺时针转 90°（x −0.5…1.5、y −11.5…−9.5）")
            check(sameBox(spin.bounds(wave: -1), 0.5, 2.5, 8.5, 10.5), "转动：wave = −1 时逆时针转 90°（x 0.5…2.5、y 8.5…10.5）")
            let c = CGFloat(0.5).squareRoot()
            check(sameBox(spin.bounds(wave: 0.5), 1 + 7.5 * c, 1 + 11.5 * c, -0.5 - 12.5 * c, -0.5 - 8.5 * c), "转动：wave = 0.5 时转 45°（包围盒按解析值）")
            check(sameBox(spin.bounds(wave: -0.5), 1 + 8.5 * c, 1 + 12.5 * c, -0.5 + 7.5 * c, -0.5 + 11.5 * c), "转动：wave = −0.5 时反向转 45°（包围盒按解析值）")
            check(sameBox(spin.union, -0.5, 12, -11.5, 10.5), "转动：并集是各相位包围盒的并（x −0.5…12、y −11.5…10.5）")
            check(sameBox(spin.bodyBounds, 10, 12, -2, 0), "转动：躯干包围盒取 wave = 0（部件有转动时也不随相位变）")
        } else { check(false, "转动：合成数据应能生成几何") }
        // 绘制路径：命令逐条还原（M/L/C/Q/Z），转动部件按相位绕转轴摆动，wave 越界夹住、非有限当作 0
        if let spin = SpeciesGeometry(species: .hammer, source: spinSource), let part = spin.parts.first, let motion = part.motion {
            func corners(_ path: CGPath) -> [CGPoint] {
                var points: [CGPoint] = []
                path.applyWithBlock { element in
                    let e = element.pointee
                    if e.type == .moveToPoint || e.type == .addLineToPoint { points.append(e.points[0]) }
                }
                return points
            }
            let rest = corners(part.path(wave: 0))
            check(rest == [pt(10, 0), pt(12, 0), pt(12, -2), pt(10, -2)], "路径：wave = 0 时就是换算后的四个角（\(rest)）")
            let turned = corners(part.path(wave: 1))
            // 绕 (1, −0.5) 转 −90°：(x, y) → (1 + (y + 0.5), −0.5 − (x − 1))
            let expected = [pt(1.5, -9.5), pt(1.5, -11.5), pt(-0.5, -11.5), pt(-0.5, -9.5)]
            check(zip(turned, expected).allSatisfy { abs($0.x - $1.x) < 1e-9 && abs($0.y - $1.y) < 1e-9 } && turned.count == 4, "路径：wave = 1 时四个角绕转轴转 −90°（\(turned)）")
            check(part.path(wave: 3).boundingBoxOfPath == part.path(wave: 1).boundingBoxOfPath && part.path(wave: -7).boundingBoxOfPath == part.path(wave: -1).boundingBoxOfPath, "路径：wave 越界夹到 ±1")
            check(part.path(wave: .nan).boundingBoxOfPath == part.path(wave: 0).boundingBoxOfPath && part.path(wave: .infinity).boundingBoxOfPath == part.path(wave: 0).boundingBoxOfPath, "路径：wave 非有限当作 0")
            let t = motion.transform(wave: 1)
            let moved = pt(10, 0).applying(t), pivotMoved = motion.pivot.applying(t)
            check(abs(moved.x - 1.5) < 1e-9 && abs(moved.y + 9.5) < 1e-9 && abs(pivotMoved.x - 1) < 1e-9 && abs(pivotMoved.y + 0.5) < 1e-9, "转动变换：转轴不动，其他点绕它转（\(moved)）")
        } else { check(false, "路径：合成数据应能生成几何") }
        // 绘制路径逐条还原为 CGPath 元素：M/L/C/Q/Z 各对应一种元素，三次与二次贝塞尔的控制点与终点各就各位（缩放 2、y 翻成向上）。
        // 当前数据只用到 M/L/C/Z，Q 是解析器与 JS 都支持的命令：不测它，接线写错（比如控制点和终点对调）也没有任何检查会发现；
        // 变异检查里这一段的控制点序号变异体在纯逻辑层全部存活，只靠离屏渲染检查（它只会走到 C）。
        let curveSource = SpeciesSource(view: .side, scale: 2, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 2 0 C 3 1 4 2 5 0 Q 6 -3 8 0 Z", motion: nil)], eyeRadius: 1, eyes: [], blush: [])
        if let curves = SpeciesGeometry(species: .whaleshark, source: curveSource), let part = curves.parts.first {
            var seen: [(String, [CGPoint])] = []
            part.path(wave: 0).applyWithBlock { element in
                let e = element.pointee
                switch e.type {
                case .moveToPoint: seen.append(("M", [e.points[0]]))
                case .addLineToPoint: seen.append(("L", [e.points[0]]))
                case .addCurveToPoint: seen.append(("C", [e.points[0], e.points[1], e.points[2]]))
                case .addQuadCurveToPoint: seen.append(("Q", [e.points[0], e.points[1]]))
                case .closeSubpath: seen.append(("Z", []))
                @unknown default: seen.append(("?", []))
                }
            }
            check(seen.map { $0.0 }.joined() == "MLCQZ", "路径还原：五条命令各对应一种元素（\(seen.map { $0.0 }.joined())）")
            func sameSeq(_ a: [CGPoint], _ b: [CGPoint]) -> Bool { a.count == b.count && zip(a, b).allSatisfy { abs($0.x - $1.x) < 1e-9 && abs($0.y - $1.y) < 1e-9 } }
            if seen.count == 5 {
                check(sameSeq(seen[0].1, [pt(0, 0)]) && sameSeq(seen[1].1, [pt(4, 0)]), "路径还原：M 与 L 的点按缩放换算")
                check(sameSeq(seen[2].1, [pt(6, -2), pt(8, -4), pt(10, 0)]), "路径还原：C 依次是第一控制点、第二控制点、终点（\(seen[2].1)）")
                check(sameSeq(seen[3].1, [pt(12, 6), pt(16, 0)]), "路径还原：Q 依次是控制点、终点（\(seen[3].1)）")
            }
        } else { check(false, "路径还原：合成数据应能生成几何（侧视）") }
        // 拍翼（squash）：同一个转轴上把 y 方向缩放到 1 − squash × wave（wave = 1 最瘦、−1 最胖），先缩放后转动；wave = 0 时什么都不做。
        // 缩放 0.5、转轴 (2, 1)、squash 0.2，方块 20…24 × 0…4 → 换算后 x 10…12、y −2…0、转轴 (1, −0.5)；转轴有意不在方块的中线上（y 方向缩放以它为不动点）
        let squashSource = SpeciesSource(view: .top, scale: 0.5, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 20 0 L 24 0 L 24 4 L 20 4 Z", motion: SpeciesMotionSource(pivotX: 2, pivotY: 1, degrees: 0, squash: 0.2))], eyeRadius: 1, eyes: [], blush: [])
        if let flap = SpeciesGeometry(species: .hammer, source: squashSource), let part = flap.parts.first, let motion = part.motion {
            func sameBox(_ box: CGRect, _ x0: CGFloat, _ x1: CGFloat, _ y0: CGFloat, _ y1: CGFloat) -> Bool {
                abs(box.minX - x0) < 1e-9 && abs(box.maxX - x1) < 1e-9 && abs(box.minY - y0) < 1e-9 && abs(box.maxY - y1) < 1e-9
            }
            check(motion.squash == 0.2 && motion.maxAngle == 0 && SpeciesMotion.maxSquash == 0.3, "拍翼：幅度原样带出（0.2），上限 0.3（与 JS 的 MAX_SQUASH 一致）")
            check(sameBox(flap.bounds(wave: 0), 10, 12, -2, 0), "拍翼：wave = 0 时方块不变（y −2…0）")
            check(sameBox(flap.bounds(wave: 1), 10, 12, -1.7, -0.1), "拍翼：wave = 1 时 y 方向缩到 0.8 倍，以转轴 y = −0.5 为不动点（−1.7…−0.1），x 不变")
            check(sameBox(flap.bounds(wave: -1), 10, 12, -2.3, 0.1), "拍翼：wave = −1 时胀到 1.2 倍（−2.3…0.1）")
            check(sameBox(flap.bounds(wave: 0.5), 10, 12, -1.85, -0.05), "拍翼：wave = 0.5 时 0.9 倍（−1.85…−0.05）")
            check(sameBox(flap.union, 10, 12, -2.3, 0.1), "拍翼：并集取最胖的相位（−2.3…0.1），任何一帧都不越出")
            check(sameBox(flap.bodyBounds, 10, 12, -2, 0), "拍翼：躯干包围盒取 wave = 0（渐变与光晕定位不随相位变）")
            func corners(_ path: CGPath) -> [CGPoint] {
                var points: [CGPoint] = []
                path.applyWithBlock { element in
                    let e = element.pointee
                    if e.type == .moveToPoint || e.type == .addLineToPoint { points.append(e.points[0]) }
                }
                return points
            }
            let thin = corners(part.path(wave: 1)), expectedThin = [pt(10, -0.1), pt(12, -0.1), pt(12, -1.7), pt(10, -1.7)]
            check(thin.count == 4 && zip(thin, expectedThin).allSatisfy { abs($0.x - $1.x) < 1e-9 && abs($0.y - $1.y) < 1e-9 }, "拍翼路径：wave = 1 时四个角按 0.8 倍缩放（\(thin)）")
            check(corners(part.path(wave: 0)) == [pt(10, 0), pt(12, 0), pt(12, -2), pt(10, -2)], "拍翼路径：wave = 0 时不动")
            check(part.path(wave: 3).boundingBoxOfPath == part.path(wave: 1).boundingBoxOfPath && part.path(wave: -7).boundingBoxOfPath == part.path(wave: -1).boundingBoxOfPath, "拍翼路径：wave 越界夹到 ±1")
            check(part.path(wave: .nan).boundingBoxOfPath == part.path(wave: 0).boundingBoxOfPath, "拍翼路径：wave 非有限当作 0")
            // 变换与包围盒取样是同一个公式（绘制按变换，放置按取样，两者不能漂移）
            for wave in [CGFloat(-1), -0.5, 0, 0.3, 1] {
                let viaTransform = pt(11, -1.5).applying(motion.transform(wave: wave)), viaApply = motion.apply(to: pt(11, -1.5), wave: wave)
                check(abs(viaTransform.x - viaApply.x) < 1e-9 && abs(viaTransform.y - viaApply.y) < 1e-9, "拍翼：wave = \(wave) 时变换与取样公式一致")
            }
            // 变换自己也要处理非有限与越界的 wave（路径入口另有一道，但不能只靠它）
            check(motion.transform(wave: .nan) == motion.transform(wave: 0) && motion.transform(wave: .infinity) == motion.transform(wave: 0) && motion.transform(wave: -.infinity) == motion.transform(wave: 0), "拍翼变换：wave 非有限当作 0")
            check(motion.transform(wave: 3) == motion.transform(wave: 1) && motion.transform(wave: -7) == motion.transform(wave: -1), "拍翼变换：wave 越界夹到 ±1")
        } else { check(false, "拍翼：合成数据应能生成几何") }
        // 先缩放后转动：矩形 4×2、转轴在原点、转 90°（SVG 顺时针，换算后 −π/2）、squash 0.3、wave = 1：
        // 原生点 (4, 0)(4, −2)(0, −2) → 先缩：(4, 0)(4, −1.4)(0, −1.4) → 再转 −90°，(x, y) → (y, −x)：(0, −4)(−1.4, −4)(−1.4, 0)；顺序反了会是 x −2…0、y −2.8…0
        let orderSource = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 4 0 L 4 2 L 0 2 Z", motion: SpeciesMotionSource(pivotX: 0, pivotY: 0, degrees: 90, squash: 0.3))], eyeRadius: 1, eyes: [], blush: [])
        if let order = SpeciesGeometry(species: .hammer, source: orderSource), let motion = order.parts.first?.motion {
            let box = order.bounds(wave: 1)
            check(abs(box.minX + 1.4) < 1e-9 && abs(box.maxX) < 1e-9 && abs(box.minY + 4) < 1e-9 && abs(box.maxY) < 1e-9, "先缩后转：包围盒 x −1.4…0、y −4…0（\(box)）")
            let corner = pt(4, -2).applying(motion.transform(wave: 1))
            check(abs(corner.x + 1.4) < 1e-9 && abs(corner.y + 4) < 1e-9, "先缩后转：变换作用在 (4, −2) 上得到 (−1.4, −4)（\(corner)）")
        } else { check(false, "先缩后转：合成数据应能生成几何") }
        // 不合规的幅度让整种动物不可用：非有限、负数、超过上限；0 与上限本身合规
        for (name, squash) in [("NaN", Double.nan), ("无穷", Double.infinity), ("负无穷", -Double.infinity), ("负数", -0.01), ("略超上限", 0.3000001), ("远超上限", 1.0)] {
            let source = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 4 0 L 4 2 Z", motion: SpeciesMotionSource(pivotX: 0, pivotY: 0, degrees: 0, squash: squash))], eyeRadius: 1, eyes: [], blush: [])
            check(SpeciesGeometry(species: .hammer, source: source) == nil, "拍翼：幅度不合规（\(name)）→ 没有几何")
        }
        for squash in [0.0, 0.3, 0.15] {
            let source = SpeciesSource(view: .top, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 4 0 L 4 2 Z", motion: SpeciesMotionSource(pivotX: 0, pivotY: 0, degrees: 0, squash: squash))], eyeRadius: 1, eyes: [], blush: [])
            check(SpeciesGeometry(species: .hammer, source: source) != nil, "拍翼：幅度 \(squash) 合规")
        }
        let defaultSquash = SpeciesMotionSource(pivotX: 0, pivotY: 0, degrees: 5)
        check(defaultSquash.squash == 0, "拍翼：数据里没写就是 0（旧的三参数写法仍可用）")
        // 直接构造的运动（不写 squash）默认也是 0：只转动、不缩放。点 (4, 4) 相对转轴 (1, 2) 是 (3, 2)，转 0.5 × 0.7 = 0.35 弧度
        let plain = SpeciesMotion(pivot: pt(1, 2), maxAngle: 0.5)
        let plainMoved = plain.apply(to: pt(4, 4), wave: 0.7), c35 = CGFloat(cos(0.35)), s35 = CGFloat(sin(0.35))
        check(plain.squash == 0 && abs(plainMoved.x - (1 + 3 * c35 - 2 * s35)) < 1e-9 && abs(plainMoved.y - (2 + 3 * s35 + 2 * c35)) < 1e-9, "拍翼：直接构造的运动默认幅度是 0（只转动，\(plainMoved)）")
        // 取色位置夹到 0…1
        let clampSource = SpeciesSource(view: .side, scale: 1, parts: [SpeciesPartSource(role: .body, u: 0.4, path: "M 0 0 L 4 0 L 4 4 Z", motion: nil), SpeciesPartSource(role: .limb, u: -3, path: "M 0 0 L 1 1 Z", motion: nil), SpeciesPartSource(role: .limb, u: 9, path: "M 0 0 L 1 1 Z", motion: nil)], eyeRadius: 1, eyes: [], blush: [])
        check(SpeciesGeometry(species: .hammer, source: clampSource)?.parts.map { $0.u } == [0.4, 0, 1], "几何：取色位置夹到 0…1（−3 → 0、9 → 1）")
        // 嘴（微笑）：只有侧视动物有；四个点按缩放换算并翻成 y 向上；不参与包围盒与并集（放置不受影响）
        let mouthPoints: [[Double]] = [[10, 2], [8, 5], [4, 5], [2, 2]]
        func mouthSource(_ view: SpeciesView, _ mouth: [[Double]]) -> SpeciesSource {
            SpeciesSource(view: view, scale: 0.5, parts: [SpeciesPartSource(role: .body, u: 0.5, path: "M 0 0 L 8 0 L 8 4 Z", motion: nil)], eyeRadius: 1, eyes: [], blush: [], mouth: mouth)
        }
        if let smile = SpeciesGeometry(species: .whaleshark, source: mouthSource(.side, mouthPoints)), let plain = SpeciesGeometry(species: .whaleshark, source: mouthSource(.side, [])) {
            check(smile.mouth == [pt(5, -1), pt(4, -2.5), pt(2, -2.5), pt(1, -1)], "嘴：四个点按缩放 0.5 换算并翻成 y 向上（\(smile.mouth)）")
            check(plain.mouth.isEmpty, "嘴：数据里没写就是空")
            check(smile.union == plain.union && smile.bodyBounds == plain.bodyBounds, "嘴：不参与并集与躯干包围盒（放置不受影响）")
            check(SpeciesSource(view: .side, scale: 1, parts: [], eyeRadius: 1, eyes: [], blush: []).mouth.isEmpty, "嘴：数据结构里默认没有嘴（旧的写法仍可用）")
        } else { check(false, "嘴：合成数据应能生成几何") }
        let badMouths: [(String, SpeciesView, [[Double]])] = [
            ("俯视动物写了嘴", .top, mouthPoints), ("只有三个点", .side, Array(mouthPoints.prefix(3))), ("有五个点", .side, mouthPoints + [[0, 0]]),
            ("某点只有一个数", .side, [[10, 2], [8], [4, 5], [2, 2]]), ("某点有三个数", .side, [[10, 2], [8, 5, 1], [4, 5], [2, 2]]),
            ("NaN", .side, [[10, 2], [8, .nan], [4, 5], [2, 2]]), ("正无穷", .side, [[10, 2], [8, 5], [.infinity, 5], [2, 2]]), ("负无穷", .side, [[10, 2], [8, 5], [4, 5], [2, -.infinity]]),
        ]
        for (name, view, mouth) in badMouths { check(SpeciesGeometry(species: .whaleshark, source: mouthSource(view, mouth)) == nil, "嘴：不合规（\(name)）→ 没有几何，整种动物不可用") }
        for species in available {
            let id = species.rawValue
            guard let g = JellySpeciesGeometry.of(species), let source = JellySpeciesData.sources[species] else { check(false, "\(id)：有几何"); continue }
            check(g.parts.map { $0.role } == source.parts.map { $0.role } && g.parts.count == source.parts.count, "\(id)：部件数与角色顺序和数据表一致")
            check(g.parts.contains { $0.role == .body } && g.view == source.view && g.scale == CGFloat(source.scale), "\(id)：有躯干、视角与缩放照数据表")
            check(g.parts.allSatisfy { $0.u >= 0 && $0.u <= 1 }, "\(id)：取色位置都在 0…1")
            // y 翻成向上、按缩放换算：第一个部件的起点
            if let first = SpeciesPath.parse(source.parts[0].path)?.first?.points.first, let got = g.parts[0].commands.first?.points.first {
                check(abs(got.x - first.x * g.scale) < 1e-9 && abs(got.y + first.y * g.scale) < 1e-9, "\(id)：缩放后 y 翻成向上")
            } else { check(false, "\(id)：第一个部件的起点") }
            check(g.union.width >= 72 && g.union.width <= 94 && g.union.height > 20, "\(id)：整体长度 \(f(g.union.width)) 在水母量级内（72–94 pt）")
            check(g.bodyBounds.minX >= g.union.minX - 1e-9 && g.bodyBounds.maxX <= g.union.maxX + 1e-9 && g.bodyBounds.minY >= g.union.minY - 1e-9 && g.bodyBounds.maxY <= g.union.maxY + 1e-9, "\(id)：躯干包围盒在并集里")
            var contained = true
            for wave in SpeciesGeometry.waves { let b = g.bounds(wave: wave); if !(b.minX >= g.union.minX - 1e-9 && b.maxX <= g.union.maxX + 1e-9 && b.minY >= g.union.minY - 1e-9 && b.maxY <= g.union.maxY + 1e-9) { contained = false } }
            check(contained, "\(id)：并集包含每个相位的包围盒")
            // 绘制用的路径（CGPath）与放置用的包围盒是同一份几何：各相位下 CGPath 的紧包围盒与取样得到的包围盒相差不到 0.1 pt，且不会越出并集
            var pathBox = true, pathInside = true
            for wave in SpeciesGeometry.waves {
                var drawn = CGRect.null
                for part in g.parts { drawn = drawn.union(part.path(wave: wave).boundingBoxOfPath) }
                let b = g.bounds(wave: wave)
                if abs(drawn.minX - b.minX) > 0.1 || abs(drawn.maxX - b.maxX) > 0.1 || abs(drawn.minY - b.minY) > 0.1 || abs(drawn.maxY - b.maxY) > 0.1 { pathBox = false }
                if drawn.minX < g.union.minX - 0.1 || drawn.maxX > g.union.maxX + 0.1 || drawn.minY < g.union.minY - 0.1 || drawn.maxY > g.union.maxY + 0.1 { pathInside = false }
            }
            check(pathBox, "\(id)：绘制路径各相位的包围盒与几何包围盒一致（相差 < 0.1 pt）")
            check(pathInside, "\(id)：绘制路径不越出并集（放置与余量按并集算）")
            check(g.eyes.allSatisfy { $0.x >= g.union.minX && $0.x <= g.union.maxX && $0.y >= g.union.minY && $0.y <= g.union.maxY }, "\(id)：眼睛在并集里")
            // 与 JS 对拍用的行：各相位包围盒、并集、各部件的角色/取色位置/转动、眼睛与腮红
            for wave in SpeciesGeometry.waves { let b = g.bounds(wave: wave); print("SPEC \(id) \(wave) \(f(b.minX)) \(f(b.maxX)) \(f(b.minY)) \(f(b.maxY))") }
            print("SPECUNION \(id) \(f(g.union.minX)) \(f(g.union.maxX)) \(f(g.union.minY)) \(f(g.union.maxY))")
            print("SPECVIEW \(id) \(g.view.rawValue) \(f(g.scale))")
            for (index, part) in g.parts.enumerated() {
                let motion = part.motion.map { "\(f($0.pivot.x)),\(f($0.pivot.y)),\(f($0.maxAngle)),\(f($0.squash))" } ?? "-"
                print("SPECPART \(id) \(index) \(part.role.rawValue) \(f(part.u)) \(motion)")
            }
            print("SPECEYES \(id) \(f(g.eyeRadius)) \(g.eyes.map { "\(f($0.x)),\(f($0.y))" }.joined(separator: " "))")
            print("SPECBLUSH \(id) \(g.blush.map { "\(f($0.center.x)),\(f($0.center.y)),\(f($0.rx)),\(f($0.ry))" }.joined(separator: " "))")
            // 嘴：俯视动物没有；侧视动物要么没有、要么是四个点。脸（所有眼睛点与嘴的四个点）落在同一个躯干或肢体部件（静止相位）的包围盒里——
            // 鲸鲨的头就是躯干，海龟的头是单独的肢体部件（脸不在龟壳的包围盒里）；脸不能一半在头上、一半在壳上
            check(g.view == .side || g.mouth.isEmpty, "\(id)：俯视动物没有嘴")
            check(g.mouth.isEmpty || g.mouth.count == 4, "\(id)：嘴要么没有、要么是四个点")
            let faceCarriers = g.parts.filter { $0.role == .body || $0.role == .limb }
            check(g.mouth.isEmpty || faceCarriers.contains { part in
                let box = part.path(wave: 0).boundingBoxOfPath.insetBy(dx: -1e-9, dy: -1e-9)
                return (g.eyes + g.mouth).allSatisfy { box.contains($0) }
            }, "\(id)：眼睛与嘴的所有点落在同一个躯干或肢体部件的包围盒里（脸画在同一个身体部分上）")
            print("SPECMOUTH \(id) \(g.mouth.isEmpty ? "-" : g.mouth.map { "\(f($0.x)),\(f($0.y))" }.joined(separator: " "))")
            // 放置：窗口 170×150（JellyCompanion.size，Node 测试核对源码里的这两个数），并集顶端离底边 91 pt，水平居中，任何姿态不越出
            let width: CGFloat = 170, height: CGFloat = 150, cx = width / 2
            func extent(_ facing: CGFloat, _ pitch: CGFloat) -> CGRect { g.union.applying(SpeciesPlacement.transform(g, centerX: cx, facing: facing, pitch: pitch)) }
            let right = extent(1, 0), left = extent(-1, 0)
            check(abs(right.maxY - 91) < 1e-6 && abs(right.midX - cx) < 1e-6, "\(id)：朝右平放时并集顶端离窗口底边 91 pt、水平居中")
            check(abs(left.maxY - 91) < 1e-6 && abs(left.midX - cx) < 1e-6, "\(id)：朝左平放时同样")
            check(abs(SpeciesPlacement.center(g, centerX: cx).y - (91 - g.union.height / 2)) < 1e-9 && SpeciesPlacement.topAboveWindowBottom == 91, "\(id)：放置中心在 91 − 高/2")
            var mirrored = true
            for pitch in [CGFloat(-0.35), 0, 0.2, 0.35] {
                let a = extent(1, pitch), b = extent(-1, pitch)
                if !(abs(b.minX - (2 * cx - a.maxX)) < 1e-6 && abs(b.maxX - (2 * cx - a.minX)) < 1e-6 && abs(b.minY - a.minY) < 1e-6 && abs(b.maxY - a.maxY) < 1e-6) { mirrored = false }
            }
            check(mirrored, "\(id)：朝左是朝右关于窗口中线的镜像（含俯仰，鼻子朝上的符号不随朝向变）")
            var margin = CGFloat.infinity
            for facing in [CGFloat(1), 0.5, 0, -0.5, -1] {
                for pitch in [CGFloat(-0.35), -0.1, 0, 0.1, 0.35] {
                    let e = extent(facing, pitch)
                    margin = min(margin, e.minX, width - e.maxX, e.minY, height - e.maxY)
                }
            }
            check(margin >= 8, "\(id)：朝向（含转身途中）与俯仰 ±0.35 弧度的所有组合里，并集离窗口四边最少 \(f(margin)) pt（≥ 8）")
            // 俯仰的方向：鼻子（朝向一侧的最前端）在 pitch > 0 时升高
            let noseUp = SpeciesPlacement.transform(g, centerX: cx, facing: 1, pitch: 0.3)
            let noseDown = SpeciesPlacement.transform(g, centerX: cx, facing: 1, pitch: -0.3)
            let nose = CGPoint(x: g.union.maxX, y: g.union.midY)
            check(nose.applying(noseUp).y > nose.applying(noseDown).y, "\(id)：pitch > 0 抬头（朝右时前端升高）")
            let noseLeftUp = SpeciesPlacement.transform(g, centerX: cx, facing: -1, pitch: 0.3)
            let noseLeftDown = SpeciesPlacement.transform(g, centerX: cx, facing: -1, pitch: -0.3)
            check(nose.applying(noseLeftUp).y > nose.applying(noseLeftDown).y, "\(id)：朝左时 pitch > 0 同样抬头")
        }
    }
    // ---- 动物的姿态（朝向、俯仰、划水包络，见 jelly-species.swift 的 SpeciesPose）与逐物种游动调参 ----
    do {
        typealias Pose = SpeciesPose
        typealias S = JellySpecies
        let nan: CGFloat = .nan, inf: CGFloat = .infinity
        func near(_ a: CGFloat, _ b: CGFloat, _ eps: CGFloat = 1e-9) -> Bool { abs(a - b) <= eps }
        // 俯仰目标：符号只由纵向速度决定，横向速度下限 30，夹在 ±0.35，非有限速度当作 0
        check(Pose.targetPitch(vx: 0, vy: 0) == 0, "俯仰目标：静止是 0")
        check(near(Pose.targetPitch(vx: 100, vy: 20), atan2(20, 100)) && Pose.targetPitch(vx: 100, vy: 20) > 0, "俯仰目标：向上游时鼻子朝上，值是 atan2(vy, |vx|)")
        check(near(Pose.targetPitch(vx: -100, vy: 20), atan2(20, 100)), "俯仰目标：符号只由纵向速度决定，朝左游时数值相同")
        check(near(Pose.targetPitch(vx: 0, vy: 10), atan2(10, 30)) && near(Pose.targetPitch(vx: 0, vy: -10), -atan2(10, 30)), "俯仰目标：横向速度小于 30 时分母取 30")
        check(near(Pose.targetPitch(vx: 29.9, vy: 10), atan2(10, 30)) && near(Pose.targetPitch(vx: 30.1, vy: 10), atan2(10, 30.1)), "俯仰目标：下限的交界在 30")
        check(Pose.targetPitch(vx: 5, vy: 1000) == 0.35 && Pose.targetPitch(vx: 5, vy: -1000) == -0.35, "俯仰目标：夹在 ±0.35")
        check(Pose.targetPitch(vx: nan, vy: 5) == 0 && Pose.targetPitch(vx: 5, vy: nan) == 0 && Pose.targetPitch(vx: inf, vy: 5) == 0 && Pose.targetPitch(vx: 5, vy: -inf) == 0, "俯仰目标：非有限速度当作 0")
        // 朝向迟滞：横向速度要超过 12 才改变目标
        check(Pose.heading(after: 1, vx: 12) == 1 && Pose.heading(after: 1, vx: 12.0001) == 1 && Pose.heading(after: 1, vx: -12) == 1 && Pose.heading(after: 1, vx: -12.0001) == -1, "朝向：朝右时，向左的速度超过 12 才转")
        check(Pose.heading(after: -1, vx: -12) == -1 && Pose.heading(after: -1, vx: 12) == -1 && Pose.heading(after: -1, vx: 12.0001) == 1, "朝向：朝左时，向右的速度超过 12 才转")
        check(Pose.heading(after: -1, vx: 0) == -1 && Pose.heading(after: 1, vx: 0) == 1 && Pose.heading(after: -1, vx: nan) == -1 && Pose.heading(after: 1, vx: nan) == 1, "朝向：停下或速度非法时保持原朝向")
        check(Pose.heading(after: -1, vx: inf) == -1 && Pose.heading(after: 1, vx: -inf) == 1, "朝向：无穷大的速度不是有效数据，保持原朝向")
        // 转身：0.3 秒线性，单调、不过冲，途中可以反悔
        do {
            var pose = Pose()
            let dt: CGFloat = 1.0 / 60
            var previous = pose.facing, monotone = true, steps = 0
            while pose.facing > -1 && steps < 200 { pose.step(dt: dt, vx: -50, vy: 0, stroking: true, reduceMotion: false); if pose.facing > previous { monotone = false }; previous = pose.facing; steps += 1; if steps == 9 { check(near(pose.facing, 0, 1e-9), "转身：0.15 秒时正侧着（水平缩放 0）") } }
            check(pose.facing == -1 && pose.heading == -1 && monotone && steps == 18, "转身：18 帧（0.3 秒）转完，单调、不过冲（实际 \(steps) 帧）")
            pose.step(dt: dt, vx: -50, vy: 0, stroking: true, reduceMotion: false)
            check(pose.facing == -1, "转身完成后保持朝向")
            var back = Pose()
            for _ in 0..<5 { back.step(dt: dt, vx: -50, vy: 0, stroking: true, reduceMotion: false) }
            let midway = back.facing
            back.step(dt: dt, vx: 50, vy: 0, stroking: true, reduceMotion: false)
            check(back.heading == 1 && near(back.facing, midway + 2 * dt / 0.3), "转身途中反悔：从当前位置折回，不跳变")
            var calm = Pose()
            for _ in 0..<5 { calm.step(dt: dt, vx: -10, vy: 0, stroking: true, reduceMotion: false) }
            check(calm.facing == 1 && calm.heading == 1, "速度在迟滞带里不会开始转身")
            var still = Pose()
            still.step(dt: 1.0 / 30, vx: -50, vy: 20, stroking: true, reduceMotion: true)
            check(still.facing == -1 && still.pitch == 0 && still.envelope == 0, "减少动态效果：立即朝向目标、不俯仰、不划水")
            var restful = Pose(facing: 1, heading: 1, pitch: 0.3, envelope: 0.8)
            restful.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: true, reduceMotion: true)
            check(restful.pitch == 0 && restful.envelope == 0 && restful.settled, "减少动态效果：已有的俯仰与包络也立刻归零，姿态静止")
        }
        // 俯仰：低通、单调逼近目标、不越界
        do {
            var pose = Pose()
            var previous: CGFloat = 0, monotone = true, bounded = true
            for _ in 0..<60 { pose.step(dt: 1.0 / 30, vx: 0, vy: 20, stroking: true, reduceMotion: false); if pose.pitch < previous { monotone = false }; if pose.pitch > 0.35 { bounded = false }; previous = pose.pitch }
            check(monotone && bounded && pose.pitch > 0.349, "俯仰：向上游时单调升向 0.35，不过冲（实际 \(String(format: "%.4f", Double(pose.pitch)))）")
            pose.step(dt: 1.0 / 30, vx: 0, vy: -20, stroking: true, reduceMotion: false)
            check(near(pose.pitch, 0.35 - 0.7 * (8.0 / 30), 1e-6), "俯仰：目标反向时只走一小步（低通 8/秒 × 1/30 秒 = 26.7%），不跳变（实际 \(String(format: "%.4f", Double(pose.pitch)))）")
            for _ in 0..<90 { pose.step(dt: 1.0 / 30, vx: 0, vy: -20, stroking: true, reduceMotion: false) }
            check(pose.pitch < -0.349 && pose.pitch >= -0.35, "俯仰：向下游时转为低头（实际 \(String(format: "%.4f", Double(pose.pitch)))）")
        }
        // 划水包络：游动时升到 1，停下后 1 秒内落到 0.01 以下；落回之前 settled 为 false
        do {
            var pose = Pose()
            check(pose.settled, "初始姿态是静止的")
            for _ in 0..<30 { pose.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false) }
            check(pose.envelope > 0.99 && !pose.settled, "游动 1 秒后包络接近 1，姿态不静止")
            var frames = 0
            while !pose.settled && frames < 600 { pose.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: false, reduceMotion: false); frames += 1 }
            check(pose.settled && frames > 10 && frames <= 60 && pose.envelope < 0.01 && abs(pose.pitch) < 0.003, "停下后包络与俯仰在 2 秒内落回，之后不再需要动画帧（实际 \(frames) 帧）")
            var flipping = Pose(facing: 1, heading: 1, pitch: 0, envelope: 0)
            flipping.step(dt: 1.0 / 30, vx: -50, vy: 0, stroking: false, reduceMotion: false)
            check(!flipping.settled, "转身途中不算静止")
        }
        // 划水相位：收缩量 0.5 为中位，包络是幅度
        do {
            var pose = Pose(); pose.envelope = 1
            check(pose.wave(contraction: 0) == -1 && pose.wave(contraction: 0.5) == 0 && pose.wave(contraction: 1) == 1 && near(pose.wave(contraction: 0.25), -0.5) && near(pose.wave(contraction: 0.75), 0.5), "划水：收缩量 0 / 0.25 / 0.5 / 0.75 / 1 对应 −1 / −0.5 / 0 / 0.5 / 1")
            check(pose.wave(contraction: 3) == 1 && pose.wave(contraction: -2) == -1 && pose.wave(contraction: nan) == 0 && pose.wave(contraction: inf) == 0, "划水：越界夹住，非有限值为 0")
            pose.envelope = 0.5
            check(near(pose.wave(contraction: 1), 0.5) && near(pose.wave(contraction: 0), -0.5), "划水：幅度乘包络")
            pose.envelope = 0
            check(pose.wave(contraction: 1) == 0 && pose.wave(contraction: 0) == 0, "划水：包络为 0 时尾鳍回到中位")
            check(pose.wave(contraction: 0).sign == .plus && pose.wave(contraction: 0.25).sign == .plus && pose.wave(contraction: -2).sign == .plus, "划水：包络为 0 时是 +0（不是 −0，诊断读数不显示 “-0.000”）")
        }
        // 无效的步长不改变姿态（包括不让朝向目标改变：第二个起点朝右，−50 的横向速度本会让它开始转身）
        do {
            for start in [Pose(facing: 0.3, heading: -1, pitch: 0.1, envelope: 0.4), Pose(facing: 1, heading: 1, pitch: 0.1, envelope: 0.4)] {
                for bad in [CGFloat(0), -1, nan, inf] {
                    var pose = start
                    pose.step(dt: bad, vx: -50, vy: 20, stroking: true, reduceMotion: false)
                    check(pose == start, "步长 \(bad) 不改变姿态（朝向目标 \(start.heading)）")
                }
            }
        }
        // 单步的数值：包络按 5×dt、俯仰按 8×dt 走向各自的目标（dt = 1/30 一步）；步长大到 rate×dt ≥ 1 时一步到位而不过冲
        do {
            var rising = Pose()
            rising.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: true, reduceMotion: false)
            check(near(rising.envelope, 5.0 / 30, 1e-12), "包络：游动时每步向 1 走 5×dt（1/30 秒一步是 1/6），实际 \(rising.envelope)")
            var falling = Pose(facing: 1, heading: 1, pitch: 0, envelope: 1)
            falling.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: false, reduceMotion: false)
            check(near(falling.envelope, 1 - 5.0 / 30, 1e-12), "包络：停下时每步向 0 落 5×dt，实际 \(falling.envelope)")
            var tilting = Pose()
            tilting.step(dt: 1.0 / 30, vx: 0, vy: 20, stroking: true, reduceMotion: false)
            check(near(tilting.pitch, Pose.targetPitch(vx: 0, vy: 20) * 8.0 / 30, 1e-12), "俯仰：每步向目标走 8×dt，实际 \(tilting.pitch)")
            for dt: CGFloat in [0.2, 0.5, 1, 10] {
                var big = Pose()
                big.step(dt: dt, vx: 0, vy: 20, stroking: true, reduceMotion: false)
                check(big.pitch == Pose.pitchLimit && big.envelope == 1, "大步长 \(dt) 秒：俯仰与包络一步到位，不过冲（俯仰 \(big.pitch)、包络 \(big.envelope)）")
                big.step(dt: dt, vx: 0, vy: -20, stroking: false, reduceMotion: false)
                check(big.pitch == -Pose.pitchLimit && big.envelope == 0, "大步长 \(dt) 秒：反向也一步到位，不过冲（俯仰 \(big.pitch)、包络 \(big.envelope)）")
            }
        }
        // 静止判据的边界：包络、俯仰恰好等于阈值都还不算静止（严格小于），略小于才算
        do {
            let rest = { (pitch: CGFloat, envelope: CGFloat) in Pose(facing: 1, heading: 1, pitch: pitch, envelope: envelope) }
            check(!rest(0, Pose.settledEnvelope).settled && rest(0, Pose.settledEnvelope * 0.99).settled, "包络恰好等于阈值：不算静止；略小于：静止")
            check(!rest(Pose.settledPitch, 0).settled && !rest(-Pose.settledPitch, 0).settled, "俯仰恰好等于阈值（正负）：不算静止")
            check(rest(Pose.settledPitch * 0.99, 0).settled && rest(-Pose.settledPitch * 0.99, 0).settled, "俯仰略小于阈值（正负）：静止")
            check(!rest(0.005, 0).settled && !rest(-0.005, 0).settled, "俯仰 0.005 仍在动（阈值 0.003，约 0.17°）")
            check(!Pose(facing: 0.99, heading: 1, pitch: 0, envelope: 0).settled && !Pose(facing: -1, heading: 1, pitch: 0, envelope: 0).settled, "朝向没转完不算静止")
        }
        // 与游动物理联动：60 秒里朝向只在横向速度超过 12 时才变，俯仰不越界，包络起来
        do {
            var rng = SeededRandom(state: 42)
            var swim = JellySwim(); swim.setBounds(lo: 100, hi: 1500); swim.x = 800
            swim.tuning = JellyTuning.forStage(.soon, species: .hammer); swim.wantsRest = false; swim.mode = .swim
            var pose = Pose(), flips = 0, wrongFlip = false, maxPitch: CGFloat = 0
            for _ in 0..<(30 * 60) {
                swim.step(dt: 1.0 / 30, random: { rng.next() })
                let before = pose.heading
                pose.step(dt: 1.0 / 30, vx: swim.vx, vy: swim.vy, stroking: swim.mode == .swim && !swim.wantsRest, reduceMotion: false)
                if pose.heading != before { flips += 1; if abs(swim.vx) <= 12 { wrongFlip = true } }
                maxPitch = max(maxPitch, abs(pose.pitch))
            }
            check(!wrongFlip, "联动：朝向只在横向速度超过 12 时才改变")
            check(flips >= 1 && flips <= 20, "联动：60 秒里会掉头，但不是来回抖（\(flips) 次）")
            check(maxPitch <= 0.35 && maxPitch > 0.05, "联动：俯仰在 ±0.35 内且确有起伏（最大 \(String(format: "%.3f", Double(maxPitch)))）")
            check(pose.envelope > 0.99, "联动：一直在游，包络保持满")
        }
        // 游动调参：水母不变；动物乘系数；不可用的物种回退水母
        let animals = S.allCases.filter { $0 != .jelly }
        for stage in [CountdownStage.calm, .soon, .imminent, .final, .due] {
            let base = JellyTuning.forStage(stage)
            check(base.sink == JellySwim.sink && base.dragX == JellySwim.dragX && base.dragY == JellySwim.dragY, "\(stage)：水母调参的下沉与阻力就是 JellySwim 的常量（与加入这三项之前相同）")
            check(JellyTuning.forStage(stage, species: .jelly) == base, "\(stage)：水母的物种调参与原来完全相同")
            for species in animals {
                let tuning = JellyTuning.forStage(stage, species: species)
                if !species.isAvailable { check(tuning == base, "\(stage)/\(species.rawValue)：不可用（回退水母）的调参与水母相同"); continue }
                let positive = tuning.period > 0 && tuning.thrustX >= 0 && tuning.thrustY > 0 && tuning.sink > 0 && tuning.dragX > 0 && tuning.dragY > 0
                check(positive && tuning.hover == base.hover, "\(stage)/\(species.rawValue)：系数有限且为正，愿意停留的高度不乘系数")
            }
        }
        check(S.jelly.swimProfile == SwimProfile() && S.hammer.swimProfile != SwimProfile() && S.manta.swimProfile != SwimProfile() && S.turtle.swimProfile != SwimProfile() && S.whaleshark.swimProfile != SwimProfile(), "水母的系数全是 1，小锤头鲨、蝠鲼、海龟与鲸鲨各有自己的系数")
        // 系数怎么乘：用合成系数逐项核对“六项各乘各的、愿意停留的高度不乘”（真实动物只有几项不是 1，光靠它们分不出某一项被漏乘）
        do {
            let synthetic = SwimProfile(period: 1.1, thrustX: 1.2, thrustY: 1.3, sink: 1.4, dragX: 1.5, dragY: 1.6)
            for stage in [CountdownStage.calm, .soon, .imminent, .final, .due] {
                let base = JellyTuning.forStage(stage), t = JellyTuning.forStage(stage, profile: synthetic)
                check(t.period == base.period * 1.1 && t.thrustX == base.thrustX * 1.2 && t.thrustY == base.thrustY * 1.3, "\(stage)：周期与两个冲量各乘各的系数")
                check(t.sink == base.sink * 1.4 && t.dragX == base.dragX * 1.5 && t.dragY == base.dragY * 1.6, "\(stage)：下沉与两个阻力各乘各的系数")
                check(t.hover == base.hover, "\(stage)：愿意停留的高度不乘系数")
                check(JellyTuning.forStage(stage, profile: SwimProfile()) == base, "\(stage)：系数全是 1 时与原调参完全相同")
                for species in S.allCases {
                    check(JellyTuning.forStage(stage, species: species) == JellyTuning.forStage(stage, profile: species.effective.swimProfile), "\(stage)/\(species.rawValue)：物种入口 = 实际生效物种的系数")
                }
            }
            // 小锤头鲨的系数是用种子化模拟标定的：改它们必须重跑下面逐阶段的纵向分布与平均速度检查，并同步这里与技术文档
            check(S.hammer.swimProfile == SwimProfile(period: 1, thrustX: 0.8, thrustY: 0.55, sink: 0.6, dragX: 0.7, dragY: 1), "小锤头鲨的标定系数：冲量 0.8 / 0.55、下沉 0.6、横向阻力 0.7，其余为 1")
            // 蝠鲼同样是标定出来的（游得最慢、滑得最远）：改它们必须重跑下面的逐阶段检查（含“比小锤头鲨慢”）并同步这里与技术文档
            check(S.manta.swimProfile == SwimProfile(period: 1.35, thrustX: 0.6, thrustY: 0.5, sink: 0.5, dragX: 0.5, dragY: 1), "蝠鲼的标定系数：周期 1.35、冲量 0.6 / 0.5、下沉 0.5、横向阻力 0.5，其余为 1")
            // 鲸鲨同样是标定出来的（纵向最平稳）：改它们必须重跑下面的逐阶段检查（含“比小锤头鲨慢”“起伏比蝠鲼和小锤头鲨都小”与多种子稳健性）并同步这里与技术文档
            check(S.whaleshark.swimProfile == SwimProfile(period: 1, thrustX: 0.6, thrustY: 0.3, sink: 0.4, dragX: 0.65, dragY: 1), "鲸鲨的标定系数：冲量 0.6 / 0.3、下沉 0.4、横向阻力 0.65，其余为 1")
            // 海龟同样是标定出来的（慢而稳：拍鳍放慢、五种里游得最慢、纵向起伏很小）：改它们必须重跑下面的逐阶段检查（含“比小锤头鲨慢”“比蝠鲼略慢”“起伏不到水母的一半”与多种子稳健性）并同步这里与技术文档
            check(S.turtle.swimProfile == SwimProfile(period: 1.25, thrustX: 0.7, thrustY: 0.4, sink: 0.4, dragX: 0.7, dragY: 1), "海龟的标定系数：周期 1.25、冲量 0.7 / 0.4、下沉 0.4、横向阻力 0.7，其余为 1")
        }
        // 水母的游动轨迹与改动前逐位一致：用改动前（只有 JellyTuning 的四项）的代码在同一批种子下跑出的值
        let pinned: [(CountdownStage, Int, CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (.calm, 900, 898.651897697, 30.310247839, 7.980068039, -4.672575696), (.calm, 3600, 1030.028533784, 22.104397719, -2.252631295, -10.709088363),
            (.soon, 900, 999.449280200, 28.140844166, 11.168110470, -5.933704919), (.soon, 3600, 1037.086099057, 26.411190833, -13.043823988, -5.710048515),
            (.imminent, 900, 1211.366413456, 31.834731570, -25.625907073, -6.668073275), (.imminent, 3600, 1002.301850173, 32.980472004, -22.691314693, -6.480545441),
            (.final, 900, 1230.798880200, 38.444499813, -29.738351468, -4.471501553), (.final, 3600, 1242.724851723, 40.002126977, -9.348166065, -0.307942660),
            (.due, 900, 800.000000000, 45.194950610, 0.0, -3.679063839), (.due, 3600, 800.000000000, 45.448911620, 0.0, -3.359734256),
        ]
        for stage in [CountdownStage.calm, .soon, .imminent, .final, .due] {
            for tuning in [JellyTuning.forStage(stage), JellyTuning.forStage(stage, species: .jelly)] {
                var rng = SeededRandom(state: 42)
                var swim = JellySwim(); swim.setBounds(lo: 100, hi: 1500); swim.x = 800
                swim.tuning = tuning; swim.wantsRest = false; swim.mode = .swim
                var reached = 0
                for step in 1...3600 {
                    swim.step(dt: 1.0 / 30, random: { rng.next() })
                    for row in pinned where row.0 == stage && row.1 == step {
                        reached += 1
                        check(near(swim.x, row.2, 1e-6) && near(swim.y, row.3, 1e-6) && near(swim.vx, row.4, 1e-6) && near(swim.vy, row.5, 1e-6), "\(stage) 第 \(step) 步：水母轨迹与改动前一致（x \(String(format: "%.6f", Double(swim.x)))）")
                    }
                }
                check(reached == 2, "\(stage)：两个钉住的检查点都到了")
            }
        }
        // 逐物种、逐阶段的纵向分布与平均速度（与水母同一套判据；动物的垂直起伏更小、平均速度与水母相当）
        typealias Sim = (mean: CGFloat, high: Double, ceiling: Double, below: Int, outside: Int, speed: CGFloat, range: CGFloat, vyMax: CGFloat, hover: CGFloat, path30: CGFloat)
        // 按任意一份游动调参跑 10 分钟的种子化模拟：阶段调参（forStage）与巡游调参（patrol，协议 v10）共用这一份循环，判据口径一致；path30 是前 30 秒的水平路程
        func simulateTuning(_ tuning: JellyTuning, seed: UInt64 = 42) -> Sim {
            var rng = SeededRandom(state: seed)
            var swim = JellySwim(); swim.setBounds(lo: 100, hi: 1500); swim.x = 800
            swim.tuning = tuning; swim.wantsRest = false; swim.mode = .swim
            var n = 0, high = 0, ceiling = 0, below = 0, outside = 0
            var sumY: CGFloat = 0, sumSpeed: CGFloat = 0, minX = CGFloat.infinity, maxX = -CGFloat.infinity, vyMax: CGFloat = 0
            var path30: CGFloat = 0, lastX = swim.x
            for step in 0..<(30 * 600) {
                swim.step(dt: 1.0 / 30, random: { rng.next() })
                n += 1; sumY += swim.y; sumSpeed += abs(swim.vx)
                if swim.y > 60 { high += 1 }
                if swim.y >= JellySwim.maxLift - 0.01 { ceiling += 1 }
                if swim.y < 0 { below += 1 }
                if swim.x < 100 || swim.x > 1500 { outside += 1 }
                minX = min(minX, swim.x); maxX = max(maxX, swim.x); vyMax = max(vyMax, abs(swim.vy))
                if step < 30 * 30 { path30 += abs(swim.x - lastX) }
                lastX = swim.x
            }
            return (sumY / CGFloat(n), Double(high) / Double(n), Double(ceiling) / Double(n), below, outside, sumSpeed / CGFloat(n), maxX - minX, vyMax, swim.tuning.hover, path30)
        }
        func simulate(_ stage: CountdownStage, _ species: S, seed: UInt64 = 42) -> Sim { simulateTuning(JellyTuning.forStage(stage, species: species), seed: seed) }
        for species in S.allCases where species.isAvailable && species != .jelly {
            for stage in [CountdownStage.soon, .imminent, .final] {
                let id = "\(species.rawValue)/\(stage)"
                let a = simulate(stage, species), j = simulate(stage, .jelly)
                check(a.below == 0 && a.outside == 0, "\(id)：不沉到游泳线以下、不越过屏幕边界")
                check(a.high < 0.05 && a.ceiling < 0.02, "\(id)：超过 60 点的时间 < 5%、顶到上限 < 2%（\(String(format: "%.1f", a.high * 100))% / \(String(format: "%.1f", a.ceiling * 100))%）")
                check(a.mean > 3 && a.mean < a.hover + 18, "\(id)：平均高度接近愿意停留的高度（\(String(format: "%.1f", Double(a.mean)))，目标 \(a.hover)）")
                check(a.range > 150, "\(id)：会水平游动（范围 \(String(format: "%.0f", Double(a.range)))）")
                check(a.speed >= j.speed * 0.7 && a.speed <= j.speed * 1.4, "\(id)：平均横向速度与水母相当（\(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(j.speed)))，要求 0.7–1.4 倍）")
                check(a.vyMax < j.vyMax, "\(id)：垂直起伏比水母更小（最大纵向速度 \(String(format: "%.1f", Double(a.vyMax))) 对 \(String(format: "%.1f", Double(j.vyMax)))）")
                check(a.mean > a.hover, "\(id)：平均高度不低于愿意停留的高度，不贴着泳线（\(String(format: "%.1f", Double(a.mean))) 对 \(a.hover)）")
                if species == .manta {
                    let h = simulate(stage, .hammer)
                    check(a.speed < h.speed, "\(id)：蝠鲼游得比小锤头鲨慢（平均横向速度 \(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(h.speed)))）")
                    check(a.speed >= j.speed * 0.75, "\(id)：但不至于慢得像停住（不低于水母的 0.75 倍，留出到 0.7 下限的余量）")
                }
                if species == .whaleshark {
                    let h = simulate(stage, .hammer), m = simulate(stage, .manta)
                    check(a.speed < h.speed, "\(id)：鲸鲨游得比小锤头鲨慢（平均横向速度 \(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(h.speed)))）")
                    check(a.speed >= j.speed * 0.75, "\(id)：但不至于慢得像停住（不低于水母的 0.75 倍）")
                    check(a.vyMax < h.vyMax && a.vyMax < m.vyMax, "\(id)：鲸鲨的纵向起伏最小，比小锤头鲨与蝠鲼都平稳（最大纵向速度 \(String(format: "%.1f", Double(a.vyMax))) 对 \(String(format: "%.1f", Double(h.vyMax))) / \(String(format: "%.1f", Double(m.vyMax)))）")
                    check(a.vyMax < j.vyMax * 0.5, "\(id)：纵向最大速度不到水母的一半（侧视时上下起伏最明显，要明显更平）")
                }
                if species == .turtle {
                    let h = simulate(stage, .hammer), m = simulate(stage, .manta), w = simulate(stage, .whaleshark)
                    check(a.speed < h.speed, "\(id)：海龟游得比小锤头鲨慢（平均横向速度 \(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(h.speed)))）")
                    check(a.speed < m.speed && a.speed < w.speed, "\(id)：海龟是五种里游得最慢的，比蝠鲼与鲸鲨都慢（\(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(m.speed))) / \(String(format: "%.1f", Double(w.speed)))）")
                    check(a.speed >= j.speed * 0.75, "\(id)：但不至于慢得像停住（不低于水母的 0.75 倍，留出到 0.7 下限的余量）")
                    check(a.vyMax < j.vyMax * 0.5, "\(id)：纵向最大速度不到水母的一半（侧视时上下起伏最明显，要明显更平）")
                    check(a.vyMax < m.vyMax * 1.1 && a.vyMax < h.vyMax, "\(id)：纵向起伏不比蝠鲼大、比小锤头鲨小（\(String(format: "%.1f", Double(a.vyMax))) 对 \(String(format: "%.1f", Double(m.vyMax))) / \(String(format: "%.1f", Double(h.vyMax)))）")
                }
            }
        }
        // 多种子稳健性：系数是按种子 42 标定的，换一批随机数也必须满足同一套通用判据（不沉到泳线以下、不越界、不贴顶、速度与水母相当、起伏更小）
        for species in S.allCases where species.isAvailable && species != .jelly {
            var failures: [String] = []
            for seed in 1...12 {
                for stage in [CountdownStage.soon, .imminent, .final] {
                    let a = simulate(stage, species, seed: UInt64(seed)), j = simulate(stage, .jelly, seed: UInt64(seed))
                    let ok = a.below == 0 && a.outside == 0 && a.high < 0.05 && a.ceiling < 0.02 && a.mean > a.hover && a.mean < a.hover + 18 && a.range > 150
                        && a.speed >= j.speed * 0.7 && a.speed <= j.speed * 1.4 && a.vyMax < j.vyMax
                    if !ok { failures.append("种子 \(seed)/\(stage)") }
                }
            }
            check(failures.isEmpty, "\(species.rawValue)：12 个种子 × 三个阶段都满足通用判据（失败：\(failures.prefix(5).joined(separator: "、"))）")
        }
        // ---- 巡游（协议 v10）× 物种系数：巡游调校是按水母标定的，动物巡游时必须乘上自己的物种系数（JellyTuning.current）----
        // 并入 feat/jelly-errands 时发现的交叠：两边各自都对，只有放在一起才出问题——巡游不乘系数的话，侧视动物（鲸鲨、海龟）会按水母的幅度上下摆动（最大纵向速度约 38 对 11–21）。
        do {
            let synthetic = SwimProfile(period: 1.1, thrustX: 1.2, thrustY: 1.3, sink: 1.4, dragX: 1.5, dragY: 1.6)
            for (name, base) in [("巡游 1.0", JellyTuning.patrol(pace: 1)), ("巡游 0.75", JellyTuning.patrol(pace: 0.75)), ("平静", JellyTuning.forStage(.calm)), ("到点", JellyTuning.forStage(.due))] {
                let t = base.scaled(by: synthetic)
                check(near(t.period, base.period * 1.1) && near(t.thrustX, base.thrustX * 1.2) && near(t.thrustY, base.thrustY * 1.3) && near(t.sink, base.sink * 1.4) && near(t.dragX, base.dragX * 1.5) && near(t.dragY, base.dragY * 1.6), "\(name)：六项各乘各的系数")
                check(t.hover == base.hover, "\(name)：愿意停留的高度 hover 不乘系数")
                check(base.scaled(by: SwimProfile()) == base, "\(name)：系数全是 1 时与原调校完全相同")
            }
            for stage in [CountdownStage.calm, .soon, .imminent, .final, .due] {
                check(JellyTuning.forStage(stage, profile: synthetic) == JellyTuning.forStage(stage).scaled(by: synthetic), "\(stage)：按阶段挑的调参 = 水母调参乘系数（与巡游共用同一个乘法）")
            }
            // current：没有巡游时就是 forStage（含不可用物种回退水母）；有巡游时是“巡游乘上实际生效物种的系数”，水母原样，且与阶段无关
            for species in S.allCases {
                for stage in [CountdownStage.calm, .soon, .imminent, .final, .due] {
                    check(JellyTuning.current(stage: stage, patrol: nil, species: species) == JellyTuning.forStage(stage, species: species), "\(species.rawValue)/\(stage)：没有巡游时与阶段调参完全相同")
                    check(JellyTuning.current(stage: stage, patrol: JellyTuning.patrol(pace: 1), species: species) == JellyTuning.patrol(pace: 1).scaled(by: species.effective.swimProfile), "\(species.rawValue)/\(stage)：有巡游时 = 巡游调校乘实际生效物种的系数")
                }
                for pace in [0.75, 1.0, 1.15] {
                    let patrol = JellyTuning.patrol(pace: pace)
                    let current = JellyTuning.current(stage: .calm, patrol: patrol, species: species)
                    check(current.hover == patrol.hover && current.hover == 16, "\(species.rawValue)/\(pace)：巡游时愿意停留的高度仍是 16")
                    if species.effective == .jelly { check(current == patrol, "\(species.rawValue)/\(pace)：水母的巡游调校原样（与加入物种之前逐位相同）") }
                    else { check(current != patrol, "\(species.rawValue)/\(pace)：动物的巡游调校不是水母那一份（乘了自己的系数）") }
                }
            }
            check(near(JellyTuning.current(stage: .calm, patrol: JellyTuning.patrol(pace: 1), species: .manta).period, 1.4 * 1.35), "蝠鲼巡游：脉动周期是水母巡游的 1.35 倍（拍翼更慢）")
            check(JellyTuning.current(stage: .calm, patrol: JellyTuning.patrol(pace: 1), species: .whaleshark).period == JellyTuning.patrol(pace: 1).period, "鲸鲨巡游：脉动周期不变")
            // 种子化模拟：逐物种、逐倍率；判据与阶段检查同口径，再加三条巡游特有的——比平静阶段明显快、倍率越大越快、不按水母的幅度上下摆
            for species in S.allCases where species.isAvailable && species != .jelly {
                var speeds: [Double] = []
                let calm = simulate(.calm, species)
                for pace in [0.75, 1.0, 1.15] {
                    let patrol = JellyTuning.patrol(pace: pace)
                    let a = simulateTuning(JellyTuning.current(stage: .calm, patrol: patrol, species: species), seed: 99)
                    let j = simulateTuning(patrol, seed: 99)
                    let id = "\(species.rawValue)/巡游 \(pace)"
                    check(a.below == 0 && a.outside == 0, "\(id)：不沉到泳线以下、不越界")
                    check(a.high < 0.05 && a.ceiling < 0.02, "\(id)：超过 60 点的时间 < 5%、顶到上限 < 2%（\(String(format: "%.1f", a.high * 100))% / \(String(format: "%.1f", a.ceiling * 100))%）")
                    check(a.mean > a.hover && a.mean < a.hover + 18, "\(id)：平均高度在愿意停留的高度之上、不贴泳线也不飘高（\(String(format: "%.1f", Double(a.mean)))，目标 \(a.hover)）")
                    check(a.path30 >= 300 && a.range > 400, "\(id)：前 30 秒水平路程至少 300 点、10 分钟内游过的范围 > 400（\(String(format: "%.0f", Double(a.path30))) / \(String(format: "%.0f", Double(a.range)))）")
                    check(a.path30 >= calm.path30 * 1.5, "\(id)：比这只动物平静阶段明显快（前 30 秒路程 \(String(format: "%.0f", Double(a.path30))) 对 \(String(format: "%.0f", Double(calm.path30)))，至少 1.5 倍）")
                    check(a.speed >= j.speed * 0.7 && a.speed <= j.speed * 1.4, "\(id)：平均横向速度与同倍率的水母相当（\(String(format: "%.1f", Double(a.speed))) 对 \(String(format: "%.1f", Double(j.speed)))，要求 0.7–1.4 倍）")
                    check(a.vyMax < j.vyMax * 0.7, "\(id)：纵向起伏明显比水母小（最大纵向速度 \(String(format: "%.1f", Double(a.vyMax))) 对 \(String(format: "%.1f", Double(j.vyMax)))；不乘物种系数时与水母相同）")
                    speeds.append(Double(a.speed))
                }
                check(speeds[0] < speeds[1] && speeds[1] < speeds[2], "\(species.rawValue)：游速倍率越大平均横向速度越大（\(speeds.map { String(format: "%.1f", $0) }.joined(separator: " < "))）")
            }
            // 多种子稳健性：系数与巡游调校都是按固定种子标定的，换一批随机数也必须满足同一套判据
            for species in S.allCases where species.isAvailable && species != .jelly {
                var failures: [String] = []
                for pace in [0.75, 1.0, 1.15] {
                    let patrol = JellyTuning.patrol(pace: pace)
                    for seed in 1...12 {
                        let a = simulateTuning(JellyTuning.current(stage: .calm, patrol: patrol, species: species), seed: UInt64(seed)), j = simulateTuning(patrol, seed: UInt64(seed))
                        let ok = a.below == 0 && a.outside == 0 && a.high < 0.05 && a.ceiling < 0.02 && a.mean > a.hover && a.mean < a.hover + 18
                            && a.path30 >= 300 && a.range > 400 && a.speed >= j.speed * 0.7 && a.speed <= j.speed * 1.4 && a.vyMax < j.vyMax * 0.7
                        if !ok { failures.append("倍率 \(pace)/种子 \(seed)") }
                    }
                }
                check(failures.isEmpty, "\(species.rawValue)：三个倍率 × 12 个种子的巡游都满足判据（失败：\(failures.prefix(5).joined(separator: "、"))）")
            }
        }
        // 响铃涟漪的外半径：默认 62；离窗口最近一边不足 70 时缩小，最外圈离边缘至少 8 点；下限 inner + 4
        typealias R = JellyRingMotion
        check(R.outerRadius(centerX: 85, centerY: 76.4, width: 170, height: 150) == 62, "涟漪外半径：水母的中心离边缘够远，仍是 62")
        check(R.outerRadius(centerX: 85, centerY: 69, width: 170, height: 150) == 61, "涟漪外半径：中心离底边 69 点时缩到 61（边缘留 8 点）")
        check(R.outerRadius(centerX: 85, centerY: 69, width: 170, height: 150) + 8 <= 69, "涟漪外半径：最外圈不碰窗口边缘")
        check(R.outerRadius(centerX: 40, centerY: 69, width: 300, height: 300) == 32 && R.outerRadius(centerX: 260, centerY: 69, width: 300, height: 300) == 32, "涟漪外半径：窗口被夹到屏幕边时左右两边同样收缩")
        check(R.outerRadius(centerX: 85, centerY: 140, width: 170, height: 150) == R.rippleInner + 4, "涟漪外半径：太靠边时不小于 inner + 4")
        check(R.outerRadius(centerX: .nan, centerY: 69, width: 170, height: 150) == R.rippleOuter && R.outerRadius(centerX: 85, centerY: .infinity, width: 170, height: .nan) == R.rippleOuter, "涟漪外半径：非有限输入按默认 62")
        func flat(_ rings: [(radius: CGFloat, alpha: CGFloat)]) -> [CGFloat] { rings.flatMap { [$0.radius, $0.alpha] } }
        check(flat(R.ripples(time: 1, reduceMotion: false)) == flat(R.ripples(time: 1, reduceMotion: false, outer: R.rippleOuter)) && flat(R.ripples(time: 0.5, reduceMotion: true)) == flat(R.ripples(time: 0.5, reduceMotion: true, outer: 62)), "涟漪：不传 outer 与传 62 完全相同（水母不变）")
        let rings = R.ripples(time: 1, reduceMotion: false)
        check(rings.count == 2 && abs(rings[0].radius - (20 + 42 * (1 / 2.2))) < 1e-9 && abs(rings[0].alpha - 0.55 * (1 - 1 / 2.2) * (1 - 1 / 2.2)) < 1e-9 && abs(rings[1].radius - (20 + 42 * (0.27 / 2.2))) < 1e-9, "涟漪：水母的涟漪数值与改动前一致（time = 1：两圈，半径 39.09 与 25.15）")
        let small = R.ripples(time: 1.4, reduceMotion: false, outer: 40)
        check(!small.isEmpty && small.allSatisfy { $0.radius >= R.rippleInner && $0.radius <= 40 }, "涟漪：外半径缩小后所有圈都在 inner…outer 里")
        check(R.ripples(time: 0.5, reduceMotion: true, outer: 40).map({ $0.radius }) == [R.rippleInner + 20 * 0.35, R.rippleInner + 20 * 0.75], "涟漪：减少动态效果的两圈也按新的外半径算")
    }
    // ---- 色相（HSV 定义，度）：只在自测里核对调色板顺序，但公式本身用独立的基准点钉住（各分支、灰色、0° 与 360° 的临界、红色分支里的负值折回）----
    do {
        func hue(_ r: Double, _ g: Double, _ b: Double) -> Double { JellyAppearance.hue((r: r, g: g, b: b)) }
        let cases: [(Double, Double, Double, Double, String)] = [
            (1, 0, 0, 0, "红 0°（不能被折成 360°）"), (1, 1, 0, 60, "黄 60°"), (0, 1, 0, 120, "绿 120°"), (0, 1, 1, 180, "青 180°"), (0, 0, 1, 240, "蓝 240°"), (1, 0, 1, 300, "洋红 300°"),
            (1, 0.5, 0, 30, "橙 30°"), (0.5, 1, 0, 90, "黄绿 90°"), (0, 1, 0.5, 150, "春绿 150°"), (0, 0.5, 1, 210, "天蓝 210°"), (0.5, 0, 1, 270, "紫 270°"),
            (1, 0, 0.5, 330, "玫红 330°（红色分支里的负值要折回）"), (1, 0, 0.25, 345, "345°"), (1, 0.01, 0, 0.6, "刚过 0° 的红是 0.6°，不能被折成 360.6°"),
            (0.5, 0.5, 0.5, 0, "灰色没有色相，约定为 0"), (0, 0, 0, 0, "黑色为 0"), (1, 1, 1, 0, "白色为 0"),
        ]
        for (r, g, b, expected, name) in cases { check(abs(hue(r, g, b) - expected) < 1e-9, "色相：\(name)（得到 \(hue(r, g, b))）") }
        check(hue(1, 0.2, 0.2) == hue(0.5, 0.1, 0.1), "色相与明暗无关")
    }
    // ---- 颜料（见 jelly-paint.swift）：花纹 → 各部位颜色，阶段/夜晚过渡；与 JS 的 paintOf 逐部位对照在 Node 测试里（数值来自下面的 PAINT 行）----
    do {
        typealias T = JellyTint
        typealias P = JellyPaint
        typealias A = JellyAppearance
        func same(_ x: T, _ y: T) -> Bool { abs(x.r - y.r) < 1e-12 && abs(x.g - y.g) < 1e-12 && abs(x.b - y.b) < 1e-12 }
        func look(_ colors: [Int], _ look: String) -> A { A.parse(["colors": colors, "look": look] as [String: Any]) }
        let red = T(r: 1, g: 0, b: 0), blue = T(r: 0, g: 0, b: 1)
        // 阶段色与夜晚色是产品行为（默认外观必须与重构前逐像素一致），数值被钉死
        check(T.calm == T(r: 0.40, g: 0.74, b: 0.90), "平静色就是调色板的默认色位（冰蓝 0.40/0.74/0.90）")
        check(T.soon == T(r: 0.98, g: 0.76, b: 0.42) && T.imminent == T(r: 1.0, g: 0.56, b: 0.46), "将至、临近的阶段色数值")
        check(T.final == T(r: 1.0, g: 0.40, b: 0.50) && T.due == T(r: 1.0, g: 0.85, b: 0.45), "最后阶段、到点的阶段色数值")
        check(T.nightBlue == T(r: 0.38, g: 0.52, b: 1.0), "夜晚荧光色数值")
        check(T.forStage(.calm) == .calm && T.forStage(.soon) == .soon && T.forStage(.imminent) == .imminent && T.forStage(.final) == .final && T.forStage(.due) == .due, "阶段与颜色一一对应")
        let stageColors = [T.forStage(.calm), .forStage(.soon), .forStage(.imminent), .forStage(.final), .forStage(.due)]
        check(Set(stageColors.map { "\($0.r),\($0.g),\($0.b)" }).count == 5, "五个阶段的颜色各不相同")
        // 插值
        check(red.mixed(toward: blue, 0) == red && red.mixed(toward: blue, 1) == blue, "插值：t=0 是自己、t=1 是目标")
        check(same(red.mixed(toward: blue, 0.25), T(r: 0.75, g: 0, b: 0.25)), "插值：t=1/4")
        check(same(T(r: 0.2, g: 0.4, b: 0.6).mixed(toward: T(r: 0.6, g: 0.0, b: 1.0), 0.5), T(r: 0.4, g: 0.2, b: 0.8)), "插值：三个通道各算各的")
        // 色位 → 颜色
        check(P.tint(slot: 3) == T(r: CGFloat(A.palette[3].r), g: CGFloat(A.palette[3].g), b: CGFloat(A.palette[3].b)), "色位取调色板对应项")
        check(P.tint(slot: -3) == P.tint(slot: 0) && P.tint(slot: 99) == P.tint(slot: A.colorCount - 1), "色位越界夹到两端，不崩溃")
        check((0..<A.colorCount).allSatisfy { P.tint(slot: $0) != P.tint(slot: ($0 + 1) % A.colorCount) }, "相邻色位的颜色不同")
        // 花纹 → 三个主要颜色
        let solid = P.make(appearance: look([2], "solid")), duo = P.make(appearance: look([1, 4], "duo"))
        let blend = P.make(appearance: look([1, 4], "blend")), rainbow = P.make(appearance: look([0, 3, 6], "rainbow"))
        check(solid == P.solid(P.tint(slot: 2)) && solid.kind == .solid, "纯色：三个部位同一种颜色")
        check(duo.kind == .duo && duo.a == P.tint(slot: 1) && duo.b == P.tint(slot: 4) && duo.c == P.tint(slot: 4), "双色：a 主色，b 与 c 第二色")
        check(blend.kind == .blend && blend.a == P.tint(slot: 1) && blend.b == P.tint(slot: 4) && blend.c == P.tint(slot: 4), "渐变：与双色同样的三色，只是种类不同")
        check(rainbow.kind == .rainbow && rainbow.a == P.tint(slot: 0) && rainbow.b == P.tint(slot: 3) && rainbow.c == P.tint(slot: 6), "七彩：三个色位依次放在 a、b、c")
        check(P.solid(red) != P(kind: .duo, a: red, b: red, c: red), "花纹种类参与相等判断")
        // 阶段覆盖
        check(P.target(stage: .calm, appearance: look([1, 4], "duo")) == duo, "平静阶段用自选外观")
        for stage in [CountdownStage.soon, .imminent, .final, .due] {
            check(P.target(stage: stage, appearance: look([0, 3, 6], "rainbow")) == P.solid(T.forStage(stage)), "\(stage) 阶段整只变成阶段色（覆盖自选色与花纹）")
        }
        // 平滑过渡
        let toDuo = rainbow.mixed(toward: duo, 0)
        check(toDuo.kind == .duo && toDuo.a == rainbow.a && toDuo.b == rainbow.b && toDuo.c == rainbow.c, "过渡 t=0：颜色不动，花纹种类立刻取目标的")
        check(rainbow.mixed(toward: duo, 1) == duo, "过渡 t=1：等于目标")
        let half = rainbow.mixed(toward: duo, 0.5)
        check(half.kind == .duo && same(half.a, rainbow.a.mixed(toward: duo.a, 0.5)) && same(half.b, rainbow.b.mixed(toward: duo.b, 0.5)) && same(half.c, rainbow.c.mixed(toward: duo.c, 0.5)), "过渡 t=0.5：三个颜色各向目标走一半")
        var walking = solid
        for _ in 0..<80 { walking = walking.mixed(toward: P.solid(T.final), 0.12) }
        check(abs(walking.a.r - T.final.r) < 1e-3 && abs(walking.a.g - T.final.g) < 1e-3 && abs(walking.a.b - T.final.b) < 1e-3 && walking.kind == .solid, "每步靠近 12%，80 步后几乎到位")
        // 夜晚：整体略推向夜蓝，花纹种类不变
        let night = rainbow.mixedAll(toward: .nightBlue, 0.05)
        check(night.kind == .rainbow && same(night.a, rainbow.a.mixed(toward: .nightBlue, 0.05)) && same(night.b, rainbow.b.mixed(toward: .nightBlue, 0.05)) && same(night.c, rainbow.c.mixed(toward: .nightBlue, 0.05)), "夜晚：保持花纹，三个颜色各自略推向夜蓝")
        check(rainbow.mixedAll(toward: .nightBlue, 0) == rainbow && rainbow.mixedAll(toward: .nightBlue, 1).c == .nightBlue, "夜晚强度 0 不变、1 全变夜蓝")
        // 触手：五根，各花纹的取色规则
        for index in 0..<5 {
            check(solid.tentacleTone(index: index, count: 5) == solid.a, "纯色：第 \(index) 根触手用主色")
            check(duo.tentacleTone(index: index, count: 5) == duo.b, "双色：第 \(index) 根触手用第二色")
            check(same(blend.tentacleTone(index: index, count: 5), blend.a.mixed(toward: blend.b, 0.7)), "渐变：第 \(index) 根触手偏向第二色（0.7）")
        }
        check(rainbow.tentacleTone(index: 0, count: 5) == rainbow.a, "七彩：最左一根是第一色")
        check(same(rainbow.tentacleTone(index: 1, count: 5), rainbow.a.mixed(toward: rainbow.b, 0.5)), "七彩：第 1 根在第一、二色正中")
        check(rainbow.tentacleTone(index: 2, count: 5) == rainbow.b, "七彩：正中一根恰是第二色（分段交界）")
        check(same(rainbow.tentacleTone(index: 3, count: 5), rainbow.b.mixed(toward: rainbow.c, 0.5)), "七彩：第 3 根在第二、三色正中")
        check(same(rainbow.tentacleTone(index: 4, count: 5), rainbow.c), "七彩：最右一根是第三色")
        check(rainbow.tentacleTone(index: 0, count: 1) == rainbow.b && rainbow.tentacleTone(index: 0, count: 0) == rainbow.b, "只有一根（或没有）：取正中，不除零")
        check(rainbow.tentacleTone(index: 0, count: 2) == rainbow.a && same(rainbow.tentacleTone(index: 1, count: 2), rainbow.c), "两根：左右两端")
        // 个数不是 5 时的分段（u = i/(count-1)）：u<0.5 在第一、二色之间，其余在第二、三色之间；0.4 与 0.5 两侧各取点，分界写偏了会被发现
        check(same(rainbow.tentacleTone(index: 2, count: 6), rainbow.a.mixed(toward: rainbow.b, 0.8)), "六根：第 2 根 u=0.4，在第一、二色之间（0.8）")
        check(same(rainbow.tentacleTone(index: 3, count: 6), rainbow.b.mixed(toward: rainbow.c, 0.2)), "六根：第 3 根 u=0.6，在第二、三色之间（0.2）")
        check(same(rainbow.tentacleTone(index: 5, count: 12), rainbow.a.mixed(toward: rainbow.b, 10.0 / 11.0)), "十二根：第 5 根 u=5/11≈0.455，还没到正中")
        check(same(rainbow.tentacleTone(index: 6, count: 12), rainbow.b.mixed(toward: rainbow.c, 1.0 / 11.0)), "十二根：第 6 根 u=6/11≈0.545，已过正中")
        // 肢体取色 limbTone(u:)：触手、鳍、四肢共用同一条规则（u 沿身体长轴，0 尾端 → 1 头端）；触手只是它在等距 u 上的特例
        for u in [0, 0.1, 0.25, 0.5, 0.57, 0.9, 1] as [CGFloat] {
            check(solid.limbTone(u: u) == solid.a, "肢体：纯色在 u=\(u) 用主色")
            check(duo.limbTone(u: u) == duo.b, "肢体：双色在 u=\(u) 用第二色")
            check(same(blend.limbTone(u: u), blend.a.mixed(toward: blend.b, 0.7)), "肢体：渐变在 u=\(u) 偏向第二色（0.7）")
        }
        check(rainbow.limbTone(u: 0) == rainbow.a && rainbow.limbTone(u: 0.5) == rainbow.b && same(rainbow.limbTone(u: 1), rainbow.c), "肢体：七彩的 u=0 / 0.5 / 1 是 a / b / c")
        check(same(rainbow.limbTone(u: 0.25), rainbow.a.mixed(toward: rainbow.b, 0.5)) && same(rainbow.limbTone(u: 0.75), rainbow.b.mixed(toward: rainbow.c, 0.5)), "肢体：七彩的 u=0.25 / 0.75 在相邻两色正中")
        check(same(rainbow.limbTone(u: 0.57), rainbow.b.mixed(toward: rainbow.c, 0.14)), "肢体：七彩 u=0.57（已过交界）在 b、c 之间（0.14）")
        check(same(rainbow.limbTone(u: 0.4999), rainbow.a.mixed(toward: rainbow.b, 0.9998)), "肢体：七彩 u 刚好在交界之前仍在 a、b 之间")
        for (name, paint) in [("纯色", solid), ("双色", duo), ("渐变", blend), ("七彩", rainbow)] {
            let same_ = (1...9).allSatisfy { count in (0..<count).allSatisfy { index in
                paint.tentacleTone(index: index, count: count) == paint.limbTone(u: count > 1 ? CGFloat(index) / CGFloat(count - 1) : 0.5) } }
            check(same_, "\(name)：1…9 根触手逐根等于 limbTone(i/(n-1))（只有一根取 0.5）")
        }
        check(rainbow.limbTone(u: -3) == rainbow.limbTone(u: 0) && rainbow.limbTone(u: 7) == rainbow.limbTone(u: 1), "肢体：u 越界夹到两端，不外推")
        let centre = rainbow.limbTone(u: 0.5)
        let nan: CGFloat = .nan, inf: CGFloat = .infinity
        check(rainbow.limbTone(u: nan) == centre, "肢体：u 是 NaN 时取正中")
        check(rainbow.limbTone(u: inf) == centre && rainbow.limbTone(u: -inf) == centre, "肢体：u 是正负无穷时取正中（不是夹到两端）")
        // 口腕与描边
        check(solid.oralTone == solid.a && duo.oralTone == duo.b && blend.oralTone == blend.b && rainbow.oralTone == rainbow.b, "口腕：纯色用主色，其余用第二色")
        check(solid.outlineTone == solid.a && duo.outlineTone == duo.a && blend.outlineTone == blend.a && rainbow.outlineTone == rainbow.b, "描边：七彩用第二色，其余用主色")
    }
    // 与 JS 对照：Node 把一批路径串（JSON 数组）交给这里，逐项回显解析结果：不合规是 “-”，合规是以分号分隔的 “命令字母 + 逗号分隔的数字”（Z 没有数字）
    if let path = ProcessInfo.processInfo.environment["PARSE_CASES"], let data = FileManager.default.contents(atPath: path),
       let cases = (try? JSONSerialization.jsonObject(with: data)) as? [Any] {
        for (index, value) in cases.enumerated() {
            guard let d = value as? String, let commands = SpeciesPath.parse(d) else { print("PARSE \(index) -"); continue }
            let letters: [PathCommand.Kind: String] = [.move: "M", .line: "L", .cubic: "C", .quad: "Q", .close: "Z"]
            let text = commands.map { command in
                (letters[command.kind] ?? "?") + command.points.flatMap { [$0.x, $0.y] }.map { String(format: "%.9g", Double($0)) }.joined(separator: ",")
            }.joined(separator: ";")
            print("PARSE \(index) \(text)")
            // 取样点：Node 与 JS 的 sample 逐点对照（独立的 De Casteljau 校验在 Node 一侧，对 JS 的取样做）
            let samples = SpeciesPath.sample(commands).map { String(format: "%.9g,%.9g", Double($0.x), Double($0.y)) }.joined(separator: ";")
            print("SAMPLES \(index) \(samples)")
        }
    }
    // 与 JS 对照：Node 把一批外观负载（JSON 数组）交给这里，Swift 解析后逐项回显（APPEARANCE 行）并给出各部位颜色（PAINT 行）；调色板色相供 Node 对照首页调色板
    if let path = ProcessInfo.processInfo.environment["APPEARANCE_CASES"], let data = FileManager.default.contents(atPath: path),
       let cases = (try? JSONSerialization.jsonObject(with: data)) as? [Any] {
        func rgb(_ t: JellyTint) -> String { String(format: "%.6f,%.6f,%.6f", Double(t.r), Double(t.g), Double(t.b)) }
        for (index, value) in cases.enumerated() {
            let a = JellyAppearance.parse(value)
            print("APPEARANCE \(index) \(a.colors.map(String.init).joined(separator: ",")) \(a.look.rawValue) \(a.material.rawValue) \(a.size.rawValue) \(a.season ?? "-") \(a.species.rawValue)")
            print("REALISTIC \(index) \(a.realistic ? 1 : 0)")
            let paint = JellyPaint.make(appearance: a)
            let tentacles = (0..<5).map { rgb(paint.tentacleTone(index: $0, count: 5)) }.joined(separator: " ")
            print("PAINT \(index) \(paint.kind.rawValue) \(rgb(paint.a)) \(rgb(paint.b)) \(rgb(paint.c)) \(rgb(paint.oralTone)) \(rgb(paint.outlineTone)) \(tentacles)")
            // 肢体取色：固定的 u 采样点（含交界两侧与越界），Node 与设置页示意图的 limbTone 逐点对照
            let limbs = [0.0, 0.1, 0.25, 0.4999, 0.5, 0.57, 0.9, 1.0, -2.0, 5.0].map { rgb(paint.limbTone(u: CGFloat($0))) }.joined(separator: " ")
            print("LIMB \(index) \(limbs)")
        }
    }
    for (index, rgb) in JellyAppearance.palette.enumerated() { print("PALETTEHUE \(index) \(String(format: "%.1f", JellyAppearance.hue(rgb)))") }
    print("STATUSES \(M.Status.allCases.map { $0.rawValue }.sorted().joined(separator: ","))")
}

// --- 写实海洋动物（见 marine-rig.swift；JS 参考实现是 js/marine-rig.js，test/marine-rig-parity.test.mjs 把两边的求值逐点对拍）---
do {
    typealias S = JellySpecies
    typealias E = MarineRigEvaluator
    let animals: [S] = [.hammer, .manta, .turtle, .whaleshark]
    check(animals.allSatisfy { MarineRigGeometries.of($0) != nil && $0.hasRealisticRig }, "写实骨架：四种动物都编译成功")
    check(MarineRigGeometries.of(.jelly) == nil && !S.jelly.hasRealisticRig && S.jelly.rigBodyLength == nil && S.jelly.rigFrequency == 0, "写实骨架：水母没有骨架、体长与频率为空")
    check(Set(MarineRigData.sources.keys.map { $0.rawValue }) == Set(animals.map { $0.rawValue }), "写实骨架：数据表里恰好是这四种动物")
    // 体长与频率（桌面上的大小与摆动快慢）是产品取值，被钉死；改动要同步技术文档与下面的占位检查
    check(S.hammer.rigBodyLength == 70 && S.manta.rigBodyLength == 74 && S.turtle.rigBodyLength == 64 && S.whaleshark.rigBodyLength == 84, "写实骨架：体长 70 / 74 / 64 / 84 pt")
    check(S.hammer.rigFrequency == 0.75 && S.manta.rigFrequency == 0.5 && S.turtle.rigFrequency == 0.4 && S.whaleshark.rigFrequency == 0.4, "写实骨架：游动频率 0.75 / 0.5 / 0.4 / 0.4 Hz")

    // 取整：远离零的一侧进位（正负对称），-0 归一为 0（与 JS 的 roundOps 同一组用例）
    check(E.round4(0.00005) == 0.0001 && E.round4(-0.00005) == -0.0001, "round4：恰好一半时远离零进位，正负对称")
    check(E.round4(1.23456) == 1.2346 && E.round4(-1.23454) == -1.2345, "round4：取整到 1e-4")
    check(E.round4(-0.00001) == 0 && E.round4(-0.00001).sign == .plus && E.round4(-0.0).sign == .plus, "round4：-0 归一为 +0")
    check([0.12345, 3.00005, 17.77775, 0.99995].allSatisfy { E.round4(-$0) == -E.round4($0) }, "round4：负数是正数的镜像")

    // 压平：M/L 端点原样；每段 C/Q 取 8 个点且终点精确；闭合时去掉与起点重合的末点
    do {
        func flat(_ d: String) -> [MarinePoly]? { SpeciesPath.parse(d).map { MarineRig.flatten($0) } }
        let square = flat("M 0 0 L 10 0 L 10 10 L 0 10 Z")
        check(square?.count == 1 && square?[0].pts == [0, 0, 10, 0, 10, 10, 0, 10] && square?[0].closed == true, "压平：折线端点原样，Z 标记闭合")
        let curve = flat("M 0 0 C 0 10 10 10 10 0")
        check(curve?[0].pts.count == 2 * (1 + MarineRigLimits.curveSteps) && curve?[0].pts.suffix(2) == [10, 0] && curve?[0].closed == false, "压平：一段三次曲线 8 个点，终点精确，没写 Z 不闭合")
        let quad = flat("M 0 0 Q 5 10 10 0")
        check(quad?[0].pts.count == 2 * (1 + MarineRigLimits.curveSteps) && quad?[0].pts.suffix(2) == [10, 0], "压平：二次曲线同样")
        check(flat("M 0 0 L 10 0 L 0 0 Z")?[0].pts == [0, 0, 10, 0], "压平：闭合时末点与起点重合就去掉")
        check(flat("M 0 0 L 10 0 Z M 20 20 L 30 20 L 30 30")?.map { $0.closed } == [true, false], "压平：多个子路径各自记录是否闭合")
        check(flat("M 0 0 L 10") == nil && flat("L 0 0") == nil && flat("M 0 0 L 1,2") == nil, "压平：坏路径（数字不够、不以 M 开头、含逗号）返回 nil")
    }

    // 姿态规范化：非有限的数当缺省（phase 0、amp 1、turn 0、lod 2），再夹到合法范围
    do {
        let n = MarineRigPose(phase: .nan, amp: .infinity, turn: -.infinity, lod: 9).normalized
        check(n.phase == 0 && n.amp == 1 && n.turn == 0 && n.lod == 2, "姿态规范化：非有限数用缺省，lod 夹到 2")
        let m = MarineRigPose(phase: 1.5, amp: 5, turn: 3, lod: -4).normalized
        check(m.phase == 1.5 && m.amp == 1 && m.turn == 1 && m.lod == 0, "姿态规范化：amp 夹到 1、turn 夹到 1、lod 夹到 0")
        check(MarineRigPose(phase: 1, amp: -2, turn: -3, lod: 1).normalized == MarineRigPose(phase: 1, amp: 0, turn: -1, lod: 1), "姿态规范化：amp 下限 0、turn 下限 -1")
    }

    // 数据校验：坏数据让整个骨架不可用（返回 nil），不画半个动物
    do {
        func minimal(d: String = "M 0 0 L 10 0 L 10 10 Z", fill: MarineFillSource? = .flat(0.5, 0.5, 0.5), stroke: MarineStrokeSource? = nil, part: String? = nil,
                     parts: [String: MarineFlapSource] = [:], bend: MarineBendSource = MarineBendSource(ampHead: 0.01, ampTail: 0.05, pow: 2, waves: 1, turn: 0.05),
                     alpha: Double = 1, lod: Int = 0, tail: Double = -50, snout: Double = 50) -> MarineRigSource {
            MarineRigSource(view: .side, tail: tail, snout: snout, bend: bend, parts: parts,
                            layers: [MarineLayerSource(id: "a", part: part, d: d, fill: fill, stroke: stroke, alpha: alpha, evenOdd: false, lod: lod)])
        }
        let flap = MarineFlapSource(pivotX: 0, pivotY: 0, deg: 10, lag: 0.3, phase: 0, freq: 1, squash: 0, squashPhase: 0)
        check(MarineRig(source: minimal()) != nil, "校验：最小的合规骨架可以编译")
        check(MarineRig(source: minimal(d: "M 0 0 L 10")) == nil, "校验：路径不合规 → nil")
        check(MarineRig(source: minimal(fill: nil)) == nil, "校验：既没有填充也没有描边 → nil")
        check(MarineRig(source: minimal(alpha: 1.5)) == nil && MarineRig(source: minimal(alpha: .nan)) == nil, "校验：不透明度越界或非有限 → nil")
        check(MarineRig(source: minimal(lod: 3)) == nil && MarineRig(source: minimal(lod: -1)) == nil, "校验：lod 只能是 0/1/2")
        check(MarineRig(source: minimal(part: "ghost")) == nil, "校验：引用没有登记的部件 → nil")
        check(MarineRig(source: minimal(part: "f", parts: ["f": flap])) != nil, "校验：登记过的部件可以引用")
        check(MarineRig(source: minimal(part: "f", parts: ["f": MarineFlapSource(pivotX: 0, pivotY: 0, deg: 120, lag: 0, phase: 0, freq: 1, squash: 0, squashPhase: 0)])) == nil, "校验：转动幅度超过 ±90 → nil")
        check(MarineRig(source: minimal(part: "f", parts: ["f": MarineFlapSource(pivotX: 0, pivotY: 0, deg: 5, lag: 0, phase: 0, freq: 0, squash: 0, squashPhase: 0)])) == nil, "校验：freq 必须为正 → nil")
        check(MarineRig(source: minimal(part: "f", parts: ["f": MarineFlapSource(pivotX: 0, pivotY: 0, deg: 5, lag: 0, phase: 0, freq: 1, squash: 0.9, squashPhase: 0)])) == nil, "校验：squash 超过 0.6 → nil")
        check(MarineRig(source: minimal(bend: MarineBendSource(ampHead: 0.3, ampTail: 0.05, pow: 2, waves: 1, turn: 0))) == nil, "校验：脊柱振幅超过 0.2 → nil")
        check(MarineRig(source: minimal(bend: MarineBendSource(ampHead: 0.01, ampTail: 0.05, pow: 0.2, waves: 1, turn: 0))) == nil && MarineRig(source: minimal(bend: MarineBendSource(ampHead: 0.01, ampTail: 0.05, pow: 2, waves: 5, turn: 0))) == nil, "校验：pow 与 waves 越界 → nil")
        check(MarineRig(source: minimal(tail: 10, snout: 10)) == nil && MarineRig(source: minimal(tail: .nan)) == nil, "校验：体长范围不合规 → nil")
        let grad: (Double, [[Double]]) -> MarineRigSource = { _, stops in minimal(fill: .gradient(ax: 0, ay: 0, bx: 10, by: 0, stops: stops)) }
        check(MarineRig(source: grad(0, [[0, 0, 0, 0, 1], [1, 1, 1, 1, 1]])) != nil, "校验：合规渐变可以编译")
        check(MarineRig(source: grad(0, [[0, 0, 0, 0, 1]])) == nil, "校验：渐变色标少于 2 个 → nil")
        check(MarineRig(source: grad(0, [[0.8, 0, 0, 0, 1], [0.2, 1, 1, 1, 1]])) == nil, "校验：渐变色标位置递减 → nil")
        check(MarineRig(source: grad(0, [[0, 0, 0, 0, 1], [1, 1, 1, 1.5, 1]])) == nil && MarineRig(source: grad(0, [[0, 0, 0, 0, 1], [1, 1, 1]])) == nil, "校验：色标颜色越界或分量个数不对 → nil")
        check(MarineRig(source: minimal(fill: nil, stroke: MarineStrokeSource(r: 0, g: 0, b: 0, width: 2, alpha: 1, butt: false))) != nil, "校验：只有描边也可以")
        check(MarineRig(source: minimal(fill: nil, stroke: MarineStrokeSource(r: 0, g: 0, b: 0, width: 9, alpha: 1, butt: false))) == nil && MarineRig(source: minimal(fill: nil, stroke: MarineStrokeSource(r: 0, g: 0, b: 0, width: 0, alpha: 1, butt: false))) == nil, "校验：线宽超出 (0, 8] → nil")
        let big = "M 0 0 " + (0..<799).map { "L \($0 % 100) \($0 / 100)" }.joined(separator: " ")
        check(SpeciesPath.parse(big) != nil && MarineRig(source: minimal(d: big)) != nil, "校验：命令数在上限内的路径可以编译")
    }

    // 逐种动物：求值的结构、站位表与精确公式的偏差、并集包围盒
    for species in animals {
        guard let g = MarineRigGeometries.of(species) else { continue }
        let rig = g.rig
        let name = species.rawValue
        let lod0 = E.evaluate(rig, pose: MarineRigPose(phase: 1, amp: 1, turn: 0, lod: 0))
        let lod2 = E.evaluate(rig, pose: MarineRigPose(phase: 1, amp: 1, turn: 0, lod: 2))
        check(lod0.ops.count >= 10 && lod0.ops.count < lod2.ops.count, "\(name)：lod 0 有 \(lod0.ops.count) 个绘制步骤（≥10），少于 lod 2 的 \(lod2.ops.count)")
        check(lod0.ops.allSatisfy { op in lod2.ops.contains { $0.id == op.id && $0.kind == op.kind } }, "\(name)：lod 0 的每个步骤都包含在 lod 2 里")
        check(E.evaluate(rig, pose: MarineRigPose(phase: 1, amp: 1, turn: 0, lod: 2)).ops == lod2.ops, "\(name)：同一姿态求值两次结果完全相同（确定性）")
        var finite = true, maxDeviation = 0.0, widest = 0.0, count = 0
        var overshoot = 0.0
        for i in 0..<12 {
            for amp in [0.3, 1.0] {
                for turn in [-1.0, 0.0, 1.0] {
                    let pose = MarineRigPose(phase: Double(i) * .pi / 6 + 0.1, amp: amp, turn: turn, lod: 2)
                    let fast = E.evaluate(rig, pose: pose), exact = E.evaluateExact(rig, pose: pose)
                    guard fast.ops.count == exact.ops.count else { finite = false; continue }
                    for (a, b) in zip(fast.ops, exact.ops) {
                        if a.id != b.id || a.kind != b.kind || a.polys.count != b.polys.count { finite = false; continue }
                        for (p, q) in zip(a.polys, b.polys) {
                            if p.pts.count != q.pts.count || p.closed != q.closed { finite = false; continue }
                            for (x, y) in zip(p.pts, q.pts) {
                                if !x.isFinite || !y.isFinite { finite = false }
                                maxDeviation = max(maxDeviation, abs(x - y))
                                count += 1
                            }
                        }
                    }
                    if let box = fast.bounds {
                        widest = max(widest, Double(box.width))
                        // 并集只采样 12 个相位 × 3 个转弯（lod 0），实际的任一帧（任意相位、lod 2）不能越出太多：越出量按骨架单位（体长 100）量
                        let u = CGRect(x: g.union.minX / g.unit, y: -g.union.maxY / g.unit, width: g.union.width / g.unit, height: g.union.height / g.unit)
                        overshoot = max(overshoot, Double(u.minX - box.minX), Double(box.maxX - u.maxX), Double(u.minY - box.minY), Double(box.maxY - u.maxY))
                    }
                }
            }
        }
        check(finite && count > 1000, "\(name)：72 个姿态的所有坐标都是有限数，且站位表版与精确公式结构相同（共 \(count) 个坐标）")
        check(maxDeviation <= 2e-3, "\(name)：站位表与精确公式的最大偏差 \(String(format: "%.5f", maxDeviation)) ≤ 2e-3 个单位（体长 100）")
        check(overshoot <= 0.6, "\(name)：任一帧越出并集包围盒最多 \(String(format: "%.3f", overshoot)) 个单位（≤ 0.6，约半个点）")
        check(widest > 20, "\(name)：求出的形状有合理大小（最宽 \(String(format: "%.1f", widest)) 个单位）")
        // 放置：并集（点）的大小要装进窗口里动物上方 91 pt 的空间，且大小与卡通动物相当（设计稿批准的 76–92 pt 长度）
        let u = g.union
        check(u.height <= 88 && u.width <= 100, "\(name)：写实版并集 \(String(format: "%.1f × %.1f", Double(u.width), Double(u.height))) pt 装得进窗口（高 ≤ 88、宽 ≤ 100）")
        check(max(u.width, u.height) >= 76 && max(u.width, u.height) <= 92, "\(name)：最长的一边 \(String(format: "%.1f", Double(max(u.width, u.height)))) pt 在批准的 76–92 pt 里")
        let center = SpeciesPlacement.center(union: u, centerX: 85)
        check(abs(center.y + u.height / 2 - SpeciesPlacement.topAboveWindowBottom) < 1e-9 && center.y - u.height / 2 >= 3, "\(name)：写实动物与卡通动物悬在同一个标准高度（顶端 91 pt），底边离窗口底边至少 3 pt")
        // 几何的 unit 是体长换算：每个骨架单位 = rigBodyLength / 100
        check(abs(g.unit - (species.rigBodyLength ?? 0) / CGFloat(rig.span)) < 1e-12, "\(name)：unit = 体长 ÷ 骨架长度")
        print(String(format: "MARINE %@ %.9g %.9g %.9g %.9g %.9g", name, Double(g.unit), Double(u.minX), Double(u.minY), Double(u.width), Double(u.height)))
    }

    // SpeciesPlacement 的并集重载与几何版完全一致（重构不改变卡通动物的放置）
    do {
        var same = true
        for species in animals {
            guard let g = JellySpeciesGeometry.of(species) else { same = false; continue }
            for (facing, pitch) in [(1.0, 0.0), (-1.0, 0.2), (0.4, -0.3)] as [(CGFloat, CGFloat)] {
                if SpeciesPlacement.transform(g, centerX: 85, facing: facing, pitch: pitch) != SpeciesPlacement.transform(union: g.union, centerX: 85, facing: facing, pitch: pitch) { same = false }
            }
            if SpeciesPlacement.center(g, centerX: 85) != SpeciesPlacement.center(union: g.union, centerX: 85) { same = false }
        }
        check(same, "放置：用并集直接放置与用几何放置结果一致（卡通动物的放置没有变）")
    }

    // 游动相位：只在写实动物游动时推进；停下、静止、减少动态效果时不动；不传频率（卡通与水母）恒为 0
    do {
        typealias P = SpeciesPose
        var cartoon = P()
        for _ in 0..<60 { cartoon.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false) }
        check(cartoon.rigPhase == 0 && cartoon.envelope > 0.9, "游动相位：不传频率（卡通、水母）时相位恒为 0，其余姿态照常")
        var pose = P()
        for _ in 0..<30 { pose.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: 0.5) }
        check(pose.rigPhase > 0 && pose.rigPhase < 2 * .pi, "游动相位：游动时推进并落在 0…2π")
        var wrapped = true, previous: CGFloat = pose.rigPhase, advanced = 0
        for _ in 0..<600 {
            pose.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: 0.75)
            if pose.rigPhase < 0 || pose.rigPhase >= 2 * .pi { wrapped = false }
            if pose.rigPhase != previous { advanced += 1 }
            previous = pose.rigPhase
        }
        check(wrapped && advanced >= 590, "游动相位：连续推进 20 秒始终在 0…2π（折回正确），几乎每帧都在变")
        // 频率：每秒 0.5 个周期 → 30 帧后约 π（从零相位的新姿态量）
        var timed = P()
        timed.envelope = 1
        for _ in 0..<30 { timed.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: 0.5) }
        check(abs(timed.rigPhase - .pi) < 1e-5, "游动相位：0.5 Hz 的动物 1 秒转半周（π），实际 \(timed.rigPhase)")
        // 停下：包络落回 0 之后相位不再推进（不再要求动画帧）
        var stopping = P()
        stopping.envelope = 1
        for _ in 0..<120 { stopping.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: false, reduceMotion: false, rigFrequency: 0.5) }
        let frozen = stopping.rigPhase
        stopping.step(dt: 1.0 / 30, vx: 0, vy: 0, stroking: false, reduceMotion: false, rigFrequency: 0.5)
        check(stopping.envelope < P.settledEnvelope && stopping.rigPhase == frozen && stopping.settled, "游动相位：包络落回 0 后相位不再推进，姿态进入静止")
        var still = P()
        still.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: true, rigFrequency: 0.5)
        check(still.rigPhase == 0 && still.envelope == 0, "游动相位：减少动态效果时不推进、不摆动")
        var bad = P()
        bad.envelope = 1
        bad.step(dt: .nan, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: 0.5)
        bad.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: .nan)
        bad.step(dt: 1.0 / 30, vx: 40, vy: 0, stroking: true, reduceMotion: false, rigFrequency: -1)
        check(bad.rigPhase == 0, "游动相位：dt 或频率不是正的有限数时不推进")
    }

    // 外观的 realistic 字段：只有明确的布尔 true 才写实（数字 1、字符串 "true"、缺省都不算）；默认外观不写实
    do {
        typealias A = JellyAppearance
        check(A.default.realistic == false, "外观：默认不写实（旧 Chrome 不下发这个字段时组件照旧画卡通）")
        check(A.parse(["realistic": true] as [String: Any]).realistic == true, "外观：realistic 为布尔 true → 写实")
        check(A.parse(["realistic": false] as [String: Any]).realistic == false && A.parse([:] as [String: Any]).realistic == false, "外观：false 与缺省 → 不写实")
        check(A.parse(["realistic": 1] as [String: Any]).realistic == false && A.parse(["realistic": "true"] as [String: Any]).realistic == false, "外观：数字 1 与字符串 \"true\" 不算布尔 true")
        check(A.parse(["realistic": NSNull()] as [String: Any]).realistic == false && A.parse("x").realistic == false && A.parse(nil).realistic == false, "外观：null、非字典、nil → 不写实")
        check(A.parse(["species": "whaleshark", "realistic": true] as [String: Any]) != A.parse(["species": "whaleshark"] as [String: Any]), "外观：realistic 参与相等判断（换风格会重绘）")
    }
}

// 桌面目录补全：只读数据、前置语法、精确优先、稳定排序与范围过滤。
do {
    typealias A = AssistantModel
    let raw: [String: Any] = ["version": 1, "revision": 1,
        "apps": [["id": "music", "name": "音乐", "aliases": ["网易云", "music"], "description": "播放音乐"], ["id": "alarm", "name": "闹钟", "aliases": ["提醒"], "description": "提醒"]],
        "actions": [["id": "play", "name": "播放", "apps": ["music"], "description": "播放"], ["id": "alarms", "name": "查看提醒", "apps": ["alarm"], "description": "查看"]]]
    let catalog = A.parseCatalog(raw)
    check(catalog?.apps.count == 2, "目录：有效有界载荷")
    for text in ["@", "@音", "@mus", "@网易"] {
        check(A.completion(text, caret: text.utf16.count, catalog: catalog)?.items.first?.id == "music", "目录：本地匹配 \(text)")
    }
    check(A.completion("@音乐 /", caret: 5, catalog: catalog)?.items.map { $0.id } == ["play"], "目录：动作按应用过滤")
    check(A.completion("@未知", caret: 3, catalog: catalog)?.items.isEmpty == true, "目录：无匹配不猜测")
    for text in ["联系 a@music.com", "https://example.test/a", "正文 @音乐", "@音乐 /play 正文@"] {
        check(A.completion(text, caret: text.utf16.count, catalog: catalog) == nil, "目录：正文邮箱URL不补全 \(text)")
    }
    check(A.completion("@音 后面保留", caret: 2, catalog: catalog)?.range == NSRange(location: 0, length: 2), "目录：替换范围不包含正文")
    check(A.completion("@", caret: 1, catalog: nil)?.items.isEmpty == true, "目录：未同步仍保留编辑入口")
    var invalid = raw; invalid["revision"] = -1
    check(A.parseCatalog(invalid) == nil, "目录：非法版本拒绝")
    invalid = raw; invalid["apps"] = Array(repeating: raw["apps"] as! [[String: Any]], count: 20).flatMap { $0 }
    check(A.parseCatalog(invalid) == nil, "目录：超限拒绝")
}

// 与浏览器同一批查询逐项核对拼音、缩写、混输、排序；仅自测入口读取夹具。
if let path = ProcessInfo.processInfo.environment["ASSISTANT_MATCH_CASES"],
   let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
   let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
   let catalog = AssistantModel.parseCatalog(raw["catalog"]), let cases = raw["cases"] as? [[String: Any]] {
    let matchingStarted = Date()
    for (index, row) in cases.enumerated() {
        guard let text = row["text"] as? String else { continue }
        let result = AssistantModel.completion(text, caret: text.utf16.count, catalog: catalog)
        check(result == nil || result?.matchingUnavailable == false, "拼音匹配器可用 \(index)")
        let ids = result?.items.map { $0.id } ?? []
        let encoded = try! JSONSerialization.data(withJSONObject: ids)
        print("MATCH \(index) \(String(decoding: encoded, as: UTF8.self))")
    }
    print("MATCH_MS \(Date().timeIntervalSince(matchingStarted) * 1000)")
}

do {
    let state = AssistantModel.State(taskId: "review-task", version: 2, status: .review, input: "播放", message: "确认", at: 1)
    let card: [String: Any] = ["taskId": "review-task", "version": 2, "status": "review", "expiresAt": 2000.0]
    check(AssistantModel.canFocusInteraction(card, state: state, now: 1000), "确认卡可发现：同任务、版本、状态且未过期")
    for patch in [["taskId": "other"], ["version": 1], ["status": "completed"], ["expiresAt": 1000.0]] as [[String: Any]] {
        check(!AssistantModel.canFocusInteraction(card.merging(patch) { _, new in new }, state: state, now: 1000), "不聚焦过期或不匹配的确认卡")
    }
    check(!AssistantModel.canFocusInteraction(nil, state: state, now: 1000), "不存在的交互卡不伪造")
}

print(failures == 0 ? "ALL PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
