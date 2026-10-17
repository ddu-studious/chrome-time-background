import Foundation
import CoreGraphics

// 纯逻辑自测：countdown-model.swift + jelly-model.swift + jelly-swim.swift + jelly-palette.swift + jelly-appearance.swift + jelly-paint.swift + assistant-model.swift（无 AppKit）。
// 运行：node --test test/desktop-companion-logic.test.mjs，或手工（入口文件须叫 main.swift，所以先复制一份）
//   cp desktop-reminder/companion-selftest.swift /tmp/main.swift && xcrun swiftc desktop-reminder/countdown-model.swift desktop-reminder/jelly-model.swift desktop-reminder/jelly-swim.swift desktop-reminder/jelly-palette.swift desktop-reminder/jelly-appearance.swift desktop-reminder/jelly-paint.swift desktop-reminder/assistant-model.swift /tmp/main.swift -o /tmp/companion-selftest && /tmp/companion-selftest
// 环境变量 HOTKEY_CASES 指向一个 JSON 数组文件时，额外打印每一项的规范化结果（HOTKEY 行）与展示符号（GLYPH 行），供 Node 测试与 JS 实现逐条对照。
// 环境变量 APPEARANCE_CASES 同理：打印每个外观负载解析后的结果（APPEARANCE 行）与各部位颜色（PAINT 行）。
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
        // 口腕与描边
        check(solid.oralTone == solid.a && duo.oralTone == duo.b && blend.oralTone == blend.b && rainbow.oralTone == rainbow.b, "口腕：纯色用主色，其余用第二色")
        check(solid.outlineTone == solid.a && duo.outlineTone == duo.a && blend.outlineTone == blend.a && rainbow.outlineTone == rainbow.b, "描边：七彩用第二色，其余用主色")
    }
    // 与 JS 对照：Node 把一批外观负载（JSON 数组）交给这里，Swift 解析后逐项回显（APPEARANCE 行）并给出各部位颜色（PAINT 行）；调色板色相供 Node 对照首页调色板
    if let path = ProcessInfo.processInfo.environment["APPEARANCE_CASES"], let data = FileManager.default.contents(atPath: path),
       let cases = (try? JSONSerialization.jsonObject(with: data)) as? [Any] {
        func rgb(_ t: JellyTint) -> String { String(format: "%.6f,%.6f,%.6f", Double(t.r), Double(t.g), Double(t.b)) }
        for (index, value) in cases.enumerated() {
            let a = JellyAppearance.parse(value)
            print("APPEARANCE \(index) \(a.colors.map(String.init).joined(separator: ",")) \(a.look.rawValue) \(a.material.rawValue) \(a.size.rawValue) \(a.season ?? "-")")
            let paint = JellyPaint.make(appearance: a)
            let tentacles = (0..<5).map { rgb(paint.tentacleTone(index: $0, count: 5)) }.joined(separator: " ")
            print("PAINT \(index) \(paint.kind.rawValue) \(rgb(paint.a)) \(rgb(paint.b)) \(rgb(paint.c)) \(rgb(paint.oralTone)) \(rgb(paint.outlineTone)) \(tentacles)")
        }
    }
    for (index, rgb) in JellyAppearance.palette.enumerated() { print("PALETTEHUE \(index) \(String(format: "%.1f", JellyAppearance.hue(rgb)))") }
    print("STATUSES \(M.Status.allCases.map { $0.rawValue }.sorted().joined(separator: ","))")
}

print(failures == 0 ? "ALL PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
