import AppKit

final class ReminderPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class DesktopReminder: NSObject, NSApplicationDelegate {
    var panel: ReminderPanel!
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

    @objc func showCurrent() { if sessionID != nil { position(); panel.orderFrontRegardless() } }
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
        case "show":
            guard let id = message["sessionId"] as? String, !id.isEmpty, id.count <= 200,
                  let title = message["title"] as? String, title.count <= 320 else { respond(message, ok: false); return }
            show(message)
        case "hide":
            if message["sessionId"] as? String == sessionID { panel.orderOut(nil); sessionID = nil; actionID = nil }
        case "actionResult":
            if message["sessionId"] as? String == sessionID && message["actionId"] as? String == actionID {
                actionID = nil
                if message["ok"] as? Bool == true { panel.orderOut(nil); sessionID = nil }
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
            send(["type": "response", "requestId": requestID, "ok": ok, "version": 1, "visible": panel.isVisible, "onActiveSpace": panel.isOnActiveSpace, "screenCount": NSScreen.screens.count, "spaceTransitions": spaceTransitions, "focusStayed": focusStayed])
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
