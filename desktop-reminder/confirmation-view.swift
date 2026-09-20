import AppKit

// A projection of a Chrome-owned confirmation. No business actions run here.
final class ConfirmationPanelController: NSObject {
    let panel: ReminderPanel
    let glass = CountdownGlass()
    let heading = NSTextField(labelWithString: "需要你确认")
    let caption = NSTextField(labelWithString: "AI 工作台 · 核对后继续执行")
    let detail = NSTextView()
    let scroll = NSScrollView()
    let status = NSTextField(wrappingLabelWithString: "关闭只隐藏提示，也可回工作台处理")
    var confirm: NSButton!
    var cancel: NSButton!
    var close: NSButton!
    var card: [String: Any]?
    var pendingAction: String?
    var ticker: Timer?
    var positioned = false
    var focusStayed = true
    let send: ([String: Any]) -> Void

    init(send: @escaping ([String: Any]) -> Void) {
        self.send = send
        panel = ReminderPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 300), styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        super.init()
        panel.title = "AI 待确认操作"
        panel.isFloatingPanel = true; panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false; panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { panel.collectionBehavior.insert(.canJoinAllApplications) }
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.minSize = NSSize(width: 396, height: 270); panel.maxSize = NSSize(width: 660, height: 450)
        panel.contentAspectRatio = NSSize(width: 440, height: 300)
        panel.setFrameAutosaveName("AssistantConfirmationV1")
        glass.fixedCornerRadius = 24; glass.material = .hudWindow
        glass.blendingMode = .behindWindow; glass.state = .active; glass.wantsLayer = true
        glass.onLayout = { [weak self] in self?.layout() }
        panel.contentView = glass
        heading.textColor = .labelColor; caption.textColor = .secondaryLabelColor
        status.textColor = .secondaryLabelColor
        detail.isEditable = false; detail.isSelectable = true; detail.drawsBackground = false
        detail.isVerticallyResizable = true; detail.isHorizontallyResizable = false
        detail.textContainerInset = NSSize(width: 2, height: 2)
        scroll.drawsBackground = false; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
        scroll.documentView = detail
        confirm = NSButton(title: "确认执行", target: self, action: #selector(accept))
        cancel = NSButton(title: "取消本次操作", target: self, action: #selector(reject))
        for button in [confirm!, cancel!] { button.bezelStyle = .rounded }
        confirm.bezelColor = NSColor(calibratedRed: 0.15, green: 0.42, blue: 0.38, alpha: 1)
        confirm.contentTintColor = .white
        // Deliberately no Return/Escape key equivalents: typing in another app
        // must never approve or cancel a background operation.
        close = NSButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "隐藏确认浮层，保留待确认操作")!, target: self, action: #selector(hide))
        close.isBordered = false; close.contentTintColor = .secondaryLabelColor
        close.toolTip = "仅隐藏，仍可在工作台确认"
        for view in [heading, caption, scroll, status, confirm!, cancel!, close!] { glass.addSubview(view) }
    }

    func layout() {
        let scale = glass.bounds.width / 440
        func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
            NSRect(x: x * scale, y: y * scale, width: width * scale, height: height * scale)
        }
        heading.frame = rect(26, 254, 350, 24); heading.font = .systemFont(ofSize: 18 * scale, weight: .semibold)
        caption.frame = rect(26, 233, 350, 18); caption.font = .systemFont(ofSize: 11 * scale)
        close.frame = rect(391, 254, 22, 22)
        scroll.frame = rect(24, 103, 392, 117)
        detail.font = .systemFont(ofSize: 13 * scale); detail.textColor = .labelColor
        detail.textContainer?.containerSize = NSSize(width: scroll.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
        detail.textContainer?.widthTracksTextView = true
        detail.setFrameSize(NSSize(width: scroll.contentSize.width, height: scroll.contentSize.height))
        detail.sizeToFit()
        status.frame = rect(26, 66, 388, 32); status.font = .systemFont(ofSize: 10.5 * scale)
        cancel.frame = rect(22, 22, 185, 34); confirm.frame = rect(229, 22, 189, 34)
        cancel.font = .systemFont(ofSize: 12 * scale); confirm.font = .systemFont(ofSize: 12 * scale, weight: .medium)
    }

    func set(_ value: Any?) -> Bool {
        if value is NSNull {
            card = nil; pendingAction = nil; ticker?.invalidate(); ticker = nil; panel.orderOut(nil)
            return true
        }
        guard let next = value as? [String: Any],
              let id = next["id"] as? String, !id.isEmpty, id.count <= 240,
              let task = next["taskId"] as? String, !task.isEmpty, task.count <= 160,
              let version = next["version"] as? Int, version > 0,
              let choice = next["choiceId"] as? String, !choice.isEmpty, choice.count <= 240,
              let message = next["message"] as? String, message.count <= 1500,
              let label = next["label"] as? String, !label.isEmpty, label.count <= 80,
              let expires = next["expiresAt"] as? Double, expires.isFinite, expires > Date().timeIntervalSince1970 * 1000
        else { return false }
        let changed = card?["id"] as? String != id
        card = next
        if changed { pendingAction = nil; status.stringValue = "关闭只隐藏提示，也可回工作台处理" }
        detail.string = message; confirm.title = label
        confirm.isEnabled = pendingAction == nil; cancel.isEnabled = pendingAction == nil
        if !positioned {
            positioned = true
            if !panel.setFrameUsingName("AssistantConfirmationV1"), let screen = NSScreen.main {
                panel.setFrameOrigin(NSPoint(x: screen.visibleFrame.maxX - 464, y: screen.visibleFrame.maxY - 450))
            }
        }
        if let screen = panel.screen ?? NSScreen.main {
            let bounds = screen.visibleFrame
            var frame = panel.frame
            frame.origin.x = max(bounds.minX, min(frame.origin.x, bounds.maxX - frame.width))
            frame.origin.y = max(bounds.minY, min(frame.origin.y, bounds.maxY - frame.height))
            panel.setFrame(frame, display: true)
        }
        glass.layoutSubtreeIfNeeded(); layout()
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        panel.orderFrontRegardless()
        focusStayed = front == NSWorkspace.shared.frontmostApplication?.processIdentifier
        ticker?.invalidate()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self, let expiry = self.card?["expiresAt"] as? Double else { return }
            if expiry <= Date().timeIntervalSince1970 * 1000 { self.hide() }
        }
        RunLoop.main.add(timer, forMode: .common); ticker = timer
        return true
    }
    @objc func hide() {
        guard let id = card?["id"] as? String else { return }
        panel.saveFrame(usingName: "AssistantConfirmationV1")
        _ = set(NSNull())
        send(["type": "confirmationHidden", "confirmationId": id])
    }
    @objc func accept() { perform("confirm") }
    @objc func reject() { perform("cancel") }
    func perform(_ action: String) {
        guard let card = card, pendingAction == nil, let expires = card["expiresAt"] as? Double,
              expires > Date().timeIntervalSince1970 * 1000 else { return }
        let actionId = UUID().uuidString; pendingAction = actionId
        confirm.isEnabled = false; cancel.isEnabled = false
        status.stringValue = "正在提交到工作台…"
        send(["type": "confirmationAction", "confirmationId": card["id"]!, "taskId": card["taskId"]!, "version": card["version"]!, "choiceId": card["choiceId"]!, "actionId": actionId, "action": action])
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            if self?.pendingAction == actionId { self?.status.stringValue = "尚未收到回执，请在工作台核对；不会自动重试。" }
        }
    }
    func result(_ message: [String: Any]) {
        guard let id = card?["id"] as? String, message["confirmationId"] as? String == id,
              let pending = pendingAction, message["actionId"] as? String == pending else { return }
        if message["ok"] as? Bool == true { _ = set(NSNull()) }
        else {
            pendingAction = nil; confirm.isEnabled = true; cancel.isEnabled = true
            status.stringValue = String((message["error"] as? String ?? "操作未接受，请查看工作台").prefix(200))
        }
    }
}
