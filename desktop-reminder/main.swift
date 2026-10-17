import AppKit

final class ReminderPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// 桌面组件宿主（协议 v7）：Native Messaging 的收发与路由，自己不保存任何业务状态。
/// 到点响铃、倒计时、喝水/起身提醒都由桌面水母（JellyController）承载，交互确认卡由 ConfirmationPanelController 承载，
/// 桌面 AI 助手面板与它的全局快捷键由 AssistantController 承载（v7，只显示与转发，任务全在 Chrome 的 AssistantEngine）；
/// 2026-10-16 起不再有独立的“提醒卡片”窗口（旧版深色卡片已被响铃气泡取代）。
final class DesktopReminder: NSObject, NSApplicationDelegate {
    var confirmation: ConfirmationPanelController!
    var assistant: AssistantController!
    let jelly = JellyController()
    var demo = false
    var spaceTransitions = 0
    var focusStayed = true
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        jelly.send = { [weak self] message in
            // --demo 没有 Chrome：点任一响铃按钮就结束进程（沿用旧卡片的行为）；其余消息丢弃
            if self?.demo == true { if message["type"] as? String == "action" { NSApp.terminate(nil) }; return }
            self?.send(message)
        }
        jelly.onFocusCheck = { [weak self] stayed in self?.focusStayed = stayed }
        confirmation = ConfirmationPanelController { [weak self] message in self?.send(message) }
        assistant = AssistantController()
        assistant.send = { [weak self] message in self?.send(message) }
        assistant.onMenuTitle = { [weak self] title in self?.jelly.assistantMenuTitle = title }
        jelly.onAskAssistant = { [weak self] in self?.assistant.show() }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.spaceTransitions += 1 }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "bell.badge", accessibilityDescription: "桌面闹钟")
        let menu = NSMenu()
        menu.addItem(withTitle: "显示当前提醒", action: #selector(showCurrent), keyEquivalent: "").target = self
        menu.addItem(withTitle: "退出桌面组件", action: #selector(quit), keyEquivalent: "").target = self
        statusItem.menu = menu
        if demo {
            let clock = DateFormatter(); clock.dateFormat = "HH:mm"
            let sample: [String: Any] = ["sessionId": "demo", "title": "桌面提醒测试", "timeText": "这是测试，不会修改你的闹钟", "clock": clock.string(from: Date()),
                                         "labels": ["桌面提醒测试"], "more": 0, "canSnooze": true, "snoozeMinutes": 10]
            _ = jelly.showRing(sample)
        } else {
            DispatchQueue.global(qos: .utility).async { self.readMessages() }
        }
    }

    /// 状态栏“显示当前提醒”：响铃进行中让水母重新游到落点并重播气泡；没有响铃时只是刷新水母的可见性。
    @objc func showCurrent() { jelly.replayRing() }
    /// 状态栏菜单“退出桌面组件”：先告诉 Chrome 这是用户主动退出（水母据此取消常驻、不再自动拉起），写出后才结束进程。
    @objc func quit() {
        send(["type": "componentQuit"])
        NSApp.terminate(nil)
    }

    /// 仅隔离验收用：按标题触发状态栏菜单项（同 JellyController.chooseMenuItem 的做法）。
    func chooseStatusItem(_ title: String?) -> Bool {
        guard let title = title, let item = statusItem.menu?.items.first(where: { $0.title == title && $0.isEnabled }),
              let action = item.action, let target = item.target as? NSObjectProtocol, target.responds(to: action) else { return false }
        return NSApp.sendAction(action, to: item.target, from: item)
    }

    func handle(_ message: [String: Any]) {
        let command = message["command"] as? String ?? ""
        var ok = true
        var extra: [String: Any] = [:]
        switch command {
        case "ping": break
        case "confirmation": ok = confirmation.set(message["card"])
        case "confirmationResult": confirmation.result(message)
        case "jelly":
            ok = jelly.setJelly(message["jelly"])
            if ok {
                // 外观跟着 jelly 命令走：带了就应用，并在回执里告诉 Chrome（它据此知道组件支持外观，协议版本不变）；
                // 没带就保持上一次（Chrome 读取外观失败时水母不会闪回默认）。负载不合规回默认，不影响水母显示。
                if let object = message["jelly"] as? [String: Any], object.keys.contains("appearance") {
                    jelly.setAppearance(object["appearance"])
                    // species 是实际生效的那一种：设置的动物还画不出来（没有几何数据）时回退成水母，这里如实报告，Chrome 据此不把它说成已应用
                    extra["appearance"] = ["status": "ok", "species": jelly.speciesName]
                }
                // 助手配置跟着 jelly 命令走：没带或明确关闭就注销全局快捷键、收起面板；启用时把注册结果带在回执里，
                // Chrome 据此在设置页如实显示（被占用 / 不合法 / 失败），不会把“没注册上”说成“已生效”
                let report = assistant.apply((message["jelly"] as? [String: Any])?["assistant"])
                if assistant.enabled {
                    var item: [String: Any] = ["status": report.status.rawValue]
                    if let hotkey = report.hotkey { item["hotkey"] = hotkey }
                    extra["assistant"] = item
                }
            }
        case "assistantState": ok = assistant.update(state: message["state"])
        case "assistantResult": assistant.result(message)
        case "countdown": ok = jelly.set(timer: message["timer"])
        case "countdownActionResult": jelly.actionResult(message)
        case "nudge": ok = jelly.showNudge(message["nudge"])
        case "nudgeClear": jelly.clearNudge(id: message["id"] as? String)
        case "nudgeActionResult": jelly.nudgeActionResult(message)
        case "menuItem":
            // 仅隔离验收：环境变量 TIMEKEEPER_TEST_HOOKS=1 时才可用，按标题触发水母右键菜单项或状态栏菜单项，效果等同用户点选；正式使用时恒为 false。
            // 状态栏的“退出桌面组件”会直接结束进程，不会有回执，调用方只能等 componentQuit 与进程退出。
            let title = message["title"] as? String
            ok = ProcessInfo.processInfo.environment["TIMEKEEPER_TEST_HOOKS"] == "1" && (jelly.chooseMenuItem(title) || chooseStatusItem(title))
        case "show": ok = jelly.showRing(message)
        case "hide": jelly.hideRing(id: message["sessionId"] as? String)
        case "actionResult": jelly.ringActionResult(message)
        case "ringButton":
            // 仅隔离验收：TIMEKEEPER_TEST_HOOKS=1 时才可用，直接走气泡按钮的动作入口（含弹出后 0.5 秒的防误触），
            // 让防误触窗口的测试不依赖鼠标时序；返回 ok 表示动作真的发出了。正式使用时恒为 false。
            ok = ProcessInfo.processInfo.environment["TIMEKEEPER_TEST_HOOKS"] == "1" && jelly.ringButton(message["id"] as? String)
        case "assistantHook":
            // 仅隔离验收：TIMEKEEPER_TEST_HOOKS=1 时才可用，走与用户操作相同的面板入口（显示、输入、发送、停止……），
            // 让测试不依赖键盘时序；返回 ok 表示操作真的被面板接受。正式使用时恒为 false。
            ok = ProcessInfo.processInfo.environment["TIMEKEEPER_TEST_HOOKS"] == "1" && assistant.hook(message["op"] as? String, text: message["text"] as? String)
        default: ok = false
        }
        respond(message, ok: ok, extra: extra)
    }
    func respond(_ message: [String: Any], ok: Bool, extra: [String: Any] = [:]) {
        guard let requestID = message["requestId"] as? String else { return }
        var reply: [String: Any] = ["type": "response", "requestId": requestID, "ok": ok, "version": 7]
        // 响铃与桌面水母（同一个窗口）
        reply["visible"] = jelly.ringVisible
        reply["onActiveSpace"] = jelly.companion.panel.isOnActiveSpace
        reply["screenCount"] = NSScreen.screens.count
        reply["mouse"] = NSStringFromPoint(NSEvent.mouseLocation)    // 验收诊断：水母按指针所在屏幕选落点，指针被挪动时失败信息里要看得到
        reply["spaceTransitions"] = spaceTransitions
        reply["focusStayed"] = focusStayed
        reply["confirmationKind"] = confirmation.card?["kind"] ?? "confirm"
        reply["confirmationChoiceCount"] = confirmation.choices.count
        reply["confirmationVisible"] = confirmation.panel.isVisible
        reply["confirmationId"] = confirmation.card?["id"] ?? NSNull()
        reply["confirmationWindowNumber"] = confirmation.panel.windowNumber
        reply["confirmationFocusStayed"] = confirmation.focusStayed
        reply["confirmationFrame"] = NSStringFromRect(confirmation.panel.frame)
        // 桌面水母：倒计时只是水母身上的一条气泡，countdown* 字段沿用旧名，指向水母的窗口
        reply["countdownVisible"] = jelly.countdownVisible
        reply["countdownText"] = jelly.timeText
        reply["countdownTitle"] = jelly.titleText
        reply["countdownWindowNumber"] = jelly.windowNumber
        reply["countdownFrame"] = jelly.frameString
        reply["countdownStage"] = jelly.lastStage.rawValue
        reply["countdownMenu"] = jelly.menuTitles()
        reply["countdownNight"] = Double(jelly.lastNight)
        reply["countdownReduceMotion"] = jelly.reduceMotion
        reply["jellyVisible"] = jelly.visible
        reply["jellyResident"] = jelly.resident
        reply["jellyNight"] = jelly.night
        reply["jellyLines"] = jelly.shownLines
        reply["jellyBubble"] = jelly.bubbleName
        reply["jellyAppearance"] = jelly.appearanceName
        reply["jellyLook"] = jelly.lookSummary
        reply["jellySpecies"] = jelly.speciesName
        reply["jellyPose"] = jelly.poseSummary
        reply["jellyTuning"] = jelly.tuningSummary
        reply["jellyTitle"] = jelly.titleSummary
        reply["jellyLabel"] = jelly.labelSummary
        reply["jellyPaintA"] = jelly.paintSummary
        reply["jellyTint"] = jelly.tintSummary
        reply["nudgeId"] = jelly.nudgeID ?? NSNull()
        reply["nudgeBusy"] = jelly.nudgeBusy
        reply["nudgeButtons"] = jelly.nudgeButtonFrames()
        // 响铃气泡（2026-10-16）：ringFrame 是水母窗口，ringLane 是所在屏幕可见区，ringBubble 是气泡本体在窗口里的矩形
        reply["ringId"] = jelly.ringID ?? NSNull()
        reply["ringBusy"] = jelly.ringBusy
        reply["ringPhase"] = jelly.ringPhaseName
        reply["ringStatus"] = jelly.ringStatusText
        reply["ringClock"] = jelly.ringClockText
        reply["ringLines"] = jelly.ringLinesShown
        reply["ringButtons"] = jelly.ringButtonFrames()
        reply["ringFrame"] = jelly.frameString
        reply["ringLane"] = jelly.laneString
        reply["ringBubble"] = jelly.bubbleRectString
        // 桌面 AI 助手面板（协议 v7）：除 assistant（jelly 命令的热键注册结果）外都是验收诊断，Chrome 不依赖
        reply["assistantEnabled"] = assistant.enabled
        reply["assistantVisible"] = assistant.visible
        reply["assistantKey"] = assistant.isKey
        reply["assistantEditing"] = assistant.isEditing
        reply["assistantActive"] = NSApp.isActive
        reply["assistantKeyWindow"] = NSApp.keyWindow?.title ?? NSNull()           // 验收诊断：谁拿着键盘（面板、水母窗口还是确认卡）；失败信息里要看得到
        reply["assistantFocusFailed"] = assistant.focusFailed
        reply["assistantHotkey"] = assistant.hotkeyText ?? NSNull()
        reply["assistantHotkeyStatus"] = assistant.hotkeyStatusName
        reply["assistantHotkeyPresses"] = assistant.hotkey.pressCount          // 验收诊断：系统递给本进程的热键次数（注销后应不再增加）
        reply["assistantMenu"] = assistant.menuTitle ?? NSNull()
        reply["assistantWindowNumber"] = assistant.windowNumber
        reply["assistantFrame"] = assistant.frameString
        reply["assistantInput"] = assistant.inputText
        reply["assistantYou"] = assistant.youText
        reply["assistantStatus"] = assistant.statusText
        reply["assistantTone"] = assistant.toneName
        reply["assistantBody"] = assistant.bodyText
        reply["assistantFooter"] = assistant.footerText
        reply["assistantPending"] = assistant.pendingName
        reply["assistantStopVisible"] = assistant.stopVisible
        reply["assistantSendEnabled"] = assistant.sendEnabled
        reply["assistantButtons"] = assistant.buttonFrames()
        reply["assistantTask"] = assistant.state?.taskId ?? NSNull()
        reply["assistantTaskStatus"] = assistant.state?.status.rawValue ?? NSNull()
        reply["assistantTaskVersion"] = assistant.state?.version ?? NSNull()
        for (key, value) in extra { reply[key] = value }
        send(reply)
    }
    func send(_ object: [String: Any]) {
        guard !demo, let data = try? JSONSerialization.data(withJSONObject: object), data.count < 65536 else { return }
        var length = UInt32(data.count).littleEndian
        let header = withUnsafeBytes(of: &length) { Data($0) }
        FileHandle.standardOutput.write(header + data)
    }
    func readExact(_ count: Int) -> Data? {
        var data = Data()
        while data.count < count {
            guard let chunk = try? FileHandle.standardInput.read(upToCount: count - data.count), !chunk.isEmpty else { return nil }
            data.append(chunk)
        }
        return data
    }
    func readMessages() {
        while let header = readExact(4) {
            let size = header.enumerated().reduce(UInt32(0)) { $0 | (UInt32($1.element) << ($1.offset * 8)) }
            guard size > 0, size <= 262144, let data = readExact(Int(size)),
                  let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { break }
            DispatchQueue.main.async { self.handle(message) }
        }
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }
}

let application = NSApplication.shared
let delegate = DesktopReminder()
delegate.demo = CommandLine.arguments.contains("--demo")
if !delegate.demo {
    let allowed = Bundle.main.object(forInfoDictionaryKey: "AllowedExtensionOrigins") as? [String] ?? []
    guard CommandLine.arguments.count > 1, allowed.contains(CommandLine.arguments[1]) else { exit(1) }
}
application.delegate = delegate
application.run()
