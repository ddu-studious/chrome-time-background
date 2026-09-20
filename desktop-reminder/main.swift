import AppKit

final class ReminderPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class DesktopReminder: NSObject, NSApplicationDelegate {
    var panel: ReminderPanel!
    var confirmation: ConfirmationPanelController!
    var countdownPanel: ReminderPanel!
    var countdownGlass: CountdownGlass!
    var countdownIcon: NSImageView!
    var countdownClose: NSButton!
    var countdownGrip: CountdownResizeGrip!
    var countdownTitle = NSTextField(labelWithString: "")
    var countdownTime = NSTextField(labelWithString: "")
    var countdownMeta = NSTextField(labelWithString: "")
    var countdownData: [String: Any]?
    var countdownTicker: Timer?
    var countdownPositioned = false
    var titleLabel = NSTextField(wrappingLabelWithString: "")
    var timeLabel = NSTextField(labelWithString: "")
    var statusLabel = NSTextField(wrappingLabelWithString: "当前桌面提醒 · 不切换应用")
    var stopButton: NSButton!
    var snoozeButton: NSButton!
    var sessionID: String?
    var actionID: String?
    var snoozeMinutes = 10
    var demo = false
    var spaceTransitions = 0
    var focusStayed = true
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        buildPanel()
        buildCountdown()
        confirmation = ConfirmationPanelController { [weak self] message in self?.send(message) }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.spaceTransitions += 1 }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "bell.badge", accessibilityDescription: "桌面闹钟")
        let menu = NSMenu()
        menu.addItem(withTitle: "显示当前提醒", action: #selector(showCurrent), keyEquivalent: "").target = self
        menu.addItem(withTitle: "退出桌面组件", action: #selector(quit), keyEquivalent: "").target = self
        statusItem.menu = menu
        if demo {
            show(["sessionId": "demo", "title": "桌面提醒测试", "timeText": "这是测试卡片，不会修改你的闹钟", "canSnooze": true, "snoozeMinutes": 10])
        } else {
            DispatchQueue.global(qos: .utility).async { self.readMessages() }
        }
    }

    func buildPanel() {
        panel = ReminderPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 250), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "桌面闹钟"
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { panel.collectionBehavior.insert(.canJoinAllApplications) }
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        let content = NSView()
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(calibratedRed: 0.055, green: 0.085, blue: 0.14, alpha: 0.98).cgColor
        content.layer?.cornerRadius = 20
        content.layer?.borderWidth = 1
        content.layer?.borderColor = NSColor(calibratedWhite: 1, alpha: 0.18).cgColor
        panel.contentView = content
        let kicker = NSTextField(labelWithString: "⏰  时间到了")
        kicker.font = .systemFont(ofSize: 13, weight: .semibold)
        kicker.textColor = .systemOrange
        titleLabel.font = .systemFont(ofSize: 24, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.maximumNumberOfLines = 3
        timeLabel.font = .systemFont(ofSize: 13)
        timeLabel.textColor = .lightGray
        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = .lightGray
        statusLabel.maximumNumberOfLines = 2
        stopButton = NSButton(title: "停止提醒", target: self, action: #selector(dismiss))
        snoozeButton = NSButton(title: "10 分钟后再提醒", target: self, action: #selector(snooze))
        for button in [stopButton!, snoozeButton!] { button.bezelStyle = .rounded; button.controlSize = .large }
        stopButton.bezelColor = .systemOrange
        let buttons = NSStackView(views: [stopButton, snoozeButton])
        buttons.orientation = .horizontal
        buttons.spacing = 12
        let stack = NSStackView(views: [kicker, titleLabel, timeLabel, statusLabel, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 13
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor, constant: -22),
            titleLabel.widthAnchor.constraint(equalTo: stack.widthAnchor),
            statusLabel.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
    }

    func buildCountdown() {
        countdownPanel = ReminderPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 100), styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        countdownPanel.title = "闹钟倒计时"
        countdownPanel.isFloatingPanel = true
        countdownPanel.becomesKeyOnlyIfNeeded = true
        countdownPanel.hidesOnDeactivate = false
        countdownPanel.level = .floating
        countdownPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { countdownPanel.collectionBehavior.insert(.canJoinAllApplications) }
        countdownPanel.isOpaque = false
        countdownPanel.backgroundColor = .clear
        countdownPanel.hasShadow = true
        countdownPanel.isMovableByWindowBackground = true
        countdownPanel.minSize = NSSize(width: 272, height: 80)
        countdownPanel.maxSize = NSSize(width: 544, height: 160)
        countdownPanel.contentAspectRatio = NSSize(width: 3.4, height: 1)
        countdownPanel.setFrameAutosaveName("CountdownPanelV1")
        let glass = CountdownGlass()
        countdownGlass = glass
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.appearance = NSAppearance(named: .aqua)
        glass.wantsLayer = true
        glass.layer?.borderWidth = 0.5
        glass.layer?.borderColor = NSColor.white.withAlphaComponent(0.48).cgColor
        countdownPanel.contentView = glass
        countdownIcon = NSImageView(image: NSImage(systemSymbolName: "timer", accessibilityDescription: "倒计时")!)
        countdownIcon.contentTintColor = NSColor(calibratedRed: 0.22, green: 0.40, blue: 0.42, alpha: 1)
        countdownTitle.textColor = NSColor(calibratedRed: 0.30, green: 0.36, blue: 0.37, alpha: 1)
        countdownTitle.lineBreakMode = .byTruncatingTail
        countdownMeta.textColor = .secondaryLabelColor
        countdownMeta.lineBreakMode = .byTruncatingTail
        countdownClose = NSButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "隐藏倒计时，闹钟继续运行")!, target: self, action: #selector(hideCountdown))
        countdownClose.isBordered = false
        countdownClose.contentTintColor = .secondaryLabelColor
        countdownClose.toolTip = "隐藏倒计时，不取消闹钟"
        countdownGrip = CountdownResizeGrip()
        countdownGrip.setAccessibilityElement(true)
        countdownGrip.setAccessibilityRole(.button)
        countdownGrip.setAccessibilityLabel("调整倒计时大小")
        countdownGrip.toolTip = "拖动调整大小 · 点击选择尺寸"
        countdownGrip.onResize = { [weak self] width in self?.resizeCountdown(to: width) }
        countdownGrip.onFinish = { [weak self] in self?.countdownPanel.saveFrame(usingName: "CountdownPanelV1") }
        for view in [countdownIcon!, countdownTitle, countdownTime, countdownMeta, countdownClose!, countdownGrip!] { glass.addSubview(view) }
        let sizes = NSMenu()
        for (name, width) in [("小巧", 272), ("标准", 340), ("舒展", 442)] {
            let item = sizes.addItem(withTitle: name, action: #selector(selectCountdownSize(_:)), keyEquivalent: "")
            item.target = self; item.tag = width
        }
        glass.menu = sizes
        countdownGrip.menu = sizes
        glass.onLayout = { [weak self] in self?.layoutCountdown() }
        layoutCountdown()
    }

    func layoutCountdown() {
        let scale = countdownGlass.bounds.width / 340
        func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect {
            NSRect(x: x * scale, y: y * scale, width: w * scale, height: h * scale)
        }
        countdownIcon.frame = rect(23, 33, 34, 34)
        countdownIcon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 27 * scale, weight: .light)
        countdownTitle.frame = rect(73, 67, 211, 17)
        countdownTitle.font = .systemFont(ofSize: 11.5 * scale, weight: .medium)
        countdownTime.frame = rect(71, 27, 216, 40)
        countdownTime.font = .monospacedDigitSystemFont(ofSize: 30 * scale, weight: .regular)
        countdownMeta.frame = rect(73, 14, 211, 15)
        countdownMeta.font = .systemFont(ofSize: 10 * scale)
        countdownClose.frame = rect(296, 49, 23, 23)
        countdownClose.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "隐藏倒计时，闹钟继续运行")?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 11 * scale, weight: .regular))
        countdownClose.imageScaling = .scaleProportionallyDown
        countdownGrip.frame = rect(295, 25, 25, 23)
        countdownGrip.needsDisplay = true
    }

    func resizeCountdown(to requestedWidth: CGFloat) {
        let old = countdownPanel.frame
        let screen = countdownPanel.screen ?? NSScreen.main
        let maxWidth = min(544, min(screen?.visibleFrame.width ?? 544, (screen?.visibleFrame.height ?? 160) * 3.4))
        let width = max(272, min(requestedWidth, maxWidth))
        let height = width / 3.4
        var next = NSRect(x: old.minX, y: old.maxY - height, width: width, height: height)
        if let bounds = screen?.visibleFrame {
            next.origin.x = max(bounds.minX, min(next.minX, bounds.maxX - width))
            next.origin.y = max(bounds.minY, min(next.minY, bounds.maxY - height))
        }
        countdownPanel.setFrame(next, display: true)
        countdownGlass.layoutSubtreeIfNeeded()
        countdownPanel.invalidateShadow()
    }

    @objc func selectCountdownSize(_ item: NSMenuItem) {
        resizeCountdown(to: CGFloat(item.tag))
        countdownPanel.saveFrame(usingName: "CountdownPanelV1")
    }

    func positionCountdown() {
        if !countdownPositioned {
            countdownPositioned = true
            if !countdownPanel.setFrameUsingName("CountdownPanelV1") {
                let screen = NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main
                if let bounds = screen?.visibleFrame {
                    countdownPanel.setFrameOrigin(NSPoint(x: bounds.maxX - 364, y: bounds.maxY - 124))
                }
            }
        }
        // Preserve the saved size as well as position; clamp if a monitor disappears.
        resizeCountdown(to: countdownPanel.frame.width)
    }

    func refreshCountdown() {
        guard let data = countdownData, let at = data["fireAt"] as? Double else { return }
        let seconds = max(0, Int(ceil(at / 1000 - Date().timeIntervalSince1970)))
        if seconds >= 86400 {
            countdownTime.stringValue = "\(seconds / 86400)天 " + String(format: "%02d:%02d", (seconds % 86400) / 3600, (seconds % 3600) / 60)
        } else if seconds >= 3600 {
            countdownTime.stringValue = String(format: "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
        } else {
            countdownTime.stringValue = String(format: "%02d:%02d", seconds / 60, seconds % 60)
        }
        let date = Date(timeIntervalSince1970: at / 1000)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "M月d日 HH:mm"
        let count = data["count"] as? Int ?? 1
        countdownMeta.stringValue = seconds == 0 ? "时间到了 · 等待 Chrome 响铃" : "\(formatter.string(from: date)) 到点" + (count > 1 ? " · 同时 \(count) 条" : data["snoozed"] as? Bool == true ? " · 稍后提醒" : " · 最近提醒")
        countdownTime.textColor = seconds <= 60 ? .systemOrange : NSColor(calibratedRed: 0.12, green: 0.19, blue: 0.20, alpha: 1)
    }

    func updateCountdownVisibility() {
        countdownTicker?.invalidate(); countdownTicker = nil
        guard countdownData != nil, sessionID == nil else { countdownPanel.orderOut(nil); return }
        refreshCountdown()
        if !countdownPanel.isVisible {
            positionCountdown()
            let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
            countdownPanel.orderFrontRegardless()
            focusStayed = frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier
        }
        let ticker = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.refreshCountdown() }
        ticker.tolerance = 0.1
        RunLoop.main.add(ticker, forMode: .common)
        countdownTicker = ticker
    }

    @objc func hideCountdown() {
        guard let id = countdownData?["id"] as? String else { return }
        countdownPanel.saveFrame(usingName: "CountdownPanelV1")
        countdownData = nil
        updateCountdownVisibility()
        send(["type": "countdownHidden", "id": id])
    }

    func position() {
        let point = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(point) }) ?? NSScreen.main else { return }
        let frame = screen.visibleFrame
        let width = min(440, frame.width - 32)
        let titleHeight = titleLabel.cell?.cellSize(forBounds: NSRect(x: 0, y: 0, width: width - 48, height: 1000)).height ?? 30
        let height = min(frame.height - 40, 220 + max(0, min(90, titleHeight) - 30))
        panel.setFrame(NSRect(x: frame.maxX - width - 20, y: frame.maxY - height - 20, width: width, height: height), display: true)
    }

    func show(_ message: [String: Any]) {
        guard let id = message["sessionId"] as? String, !id.isEmpty, id.count <= 200,
              let title = message["title"] as? String, title.count <= 320 else { return }
        let changed = sessionID != id
        sessionID = id
        updateCountdownVisibility()
        if changed { actionID = nil }
        titleLabel.stringValue = title
        timeLabel.stringValue = String((message["timeText"] as? String ?? "").prefix(100))
        snoozeMinutes = max(1, min(60, message["snoozeMinutes"] as? Int ?? 10))
        snoozeButton.title = "\(snoozeMinutes) 分钟后再提醒"
        snoozeButton.isHidden = message["canSnooze"] as? Bool != true
        stopButton.isEnabled = actionID == nil; snoozeButton.isEnabled = actionID == nil
        statusLabel.stringValue = actionID == nil ? "当前桌面提醒 · 不切换应用" : "正在同步到 Chrome…"
        if changed || !panel.isVisible { position() }
        let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
        panel.orderFrontRegardless()
        focusStayed = frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier
    }

    @objc func showCurrent() { if sessionID != nil { position(); panel.orderFrontRegardless() } else { updateCountdownVisibility() } }
    @objc func quit() { NSApp.terminate(nil) }
    @objc func dismiss() { perform("dismiss") }
    @objc func snooze() { perform("snooze") }
    func perform(_ action: String) {
        guard let id = sessionID, actionID == nil else { return }
        if demo { panel.orderOut(nil); NSApp.terminate(nil); return }
        let actionID = UUID().uuidString
        self.actionID = actionID
        stopButton.isEnabled = false; snoozeButton.isEnabled = false
        statusLabel.stringValue = "正在同步到 Chrome…"
        send(["type": "action", "sessionId": id, "actionId": actionID, "action": action, "minutes": snoozeMinutes])
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if self.actionID == actionID {
                self.actionID = nil
                self.stopButton.isEnabled = true; self.snoozeButton.isEnabled = true
                self.statusLabel.stringValue = "Chrome 尚未确认，请重试或在浏览器中处理"
            }
        }
    }

    func handle(_ message: [String: Any]) {
        let command = message["command"] as? String ?? ""
        var ok = true
        switch command {
        case "ping": break
        case "confirmation": ok = confirmation.set(message["card"])
        case "confirmationResult": confirmation.result(message)
        case "countdown":
            if let timer = message["timer"] as? [String: Any] {
                guard let id = timer["id"] as? String, !id.isEmpty, id.count <= 200,
                      let title = timer["title"] as? String, title.count <= 320,
                      let at = timer["fireAt"] as? Double, at.isFinite, at > 0, at < 8640000000000000 else { respond(message, ok: false); return }
                countdownData = timer
                countdownTitle.stringValue = title
                countdownTitle.toolTip = title
            } else if message["timer"] is NSNull {
                countdownData = nil
            } else { respond(message, ok: false); return }
            updateCountdownVisibility()
        case "show":
            guard let id = message["sessionId"] as? String, !id.isEmpty, id.count <= 200,
                  let title = message["title"] as? String, title.count <= 320 else { respond(message, ok: false); return }
            show(message)
        case "hide":
            if message["sessionId"] as? String == sessionID { panel.orderOut(nil); sessionID = nil; actionID = nil; updateCountdownVisibility() }
        case "actionResult":
            if message["sessionId"] as? String == sessionID && message["actionId"] as? String == actionID {
                actionID = nil
                if message["ok"] as? Bool == true { panel.orderOut(nil); sessionID = nil; updateCountdownVisibility() }
                else {
                    statusLabel.stringValue = String((message["error"] as? String ?? "操作失败，请重试").prefix(160))
                    stopButton.isEnabled = true; snoozeButton.isEnabled = true
                }
            }
        default: ok = false
        }
        respond(message, ok: ok)
    }
    func respond(_ message: [String: Any], ok: Bool) {
        if let requestID = message["requestId"] as? String {
            send(["type": "response", "requestId": requestID, "ok": ok, "version": 3, "confirmationVisible": confirmation.panel.isVisible, "confirmationId": confirmation.card?["id"] ?? NSNull(), "confirmationWindowNumber": confirmation.panel.windowNumber, "confirmationFocusStayed": confirmation.focusStayed, "confirmationFrame": NSStringFromRect(confirmation.panel.frame), "countdownVisible": countdownPanel.isVisible, "countdownText": countdownTime.stringValue, "countdownTitle": countdownTitle.stringValue, "countdownWindowNumber": countdownPanel.windowNumber, "countdownFrame": NSStringFromRect(countdownPanel.frame), "visible": panel.isVisible, "onActiveSpace": panel.isOnActiveSpace, "screenCount": NSScreen.screens.count, "spaceTransitions": spaceTransitions, "focusStayed": focusStayed])
        }
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
            guard size > 0, size <= 65536, let data = readExact(Int(size)),
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
