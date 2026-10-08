import AppKit

final class InteractionInput: NSTextField {
    override var needsPanelToBecomeKey: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
              let editor = currentEditor() as? NSTextView else { return super.performKeyEquivalent(with: event) }
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "a": editor.selectAll(nil)
        case "c": editor.copy(nil)
        case "x": editor.cut(nil)
        case "v": editor.paste(nil)
        case "z": editor.undoManager?.undo()
        default: return super.performKeyEquivalent(with: event)
        }
        return true
    }
}

// Display and input only. Chrome owns all candidates, authorization and execution.
final class ConfirmationPanelController: NSObject {
    let panel: ReminderPanel
    let glass = CountdownGlass()
    let heading = NSTextField(labelWithString: "需要你处理")
    let caption = NSTextField(labelWithString: "AI 工作台 · 选择或补充后继续")
    let detail = NSTextView(), scroll = NSScrollView()
    let choicesScroll = NSScrollView(), choicesView = NSView()
    let input = InteractionInput()
    let status = NSTextField(wrappingLabelWithString: "关闭只隐藏提示，也可回工作台处理")
    var confirm: NSButton!, cancel: NSButton!, close: NSButton!, reply: NSButton!, workspace: NSButton!
    var choiceButtons: [NSButton] = []
    var choices: [[String: Any]] = []
    var card: [String: Any]?
    var pendingAction: String?
    var ticker: Timer?
    var positioned = false
    var focusStayed = true
    let send: ([String: Any]) -> Void

    init(send: @escaping ([String: Any]) -> Void) {
        self.send = send
        panel = ReminderPanel(contentRect: NSRect(x: 0, y: 0, width: 520, height: 500), styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        super.init()
        panel.title = "AI 等待你处理"
        panel.isFloatingPanel = true; panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false; panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { panel.collectionBehavior.insert(.canJoinAllApplications) }
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.minSize = NSSize(width: 468, height: 450); panel.maxSize = NSSize(width: 780, height: 750)
        panel.contentAspectRatio = NSSize(width: 520, height: 500)
        panel.setFrameAutosaveName("AssistantInteractionV2")
        glass.fixedCornerRadius = 24; glass.material = .hudWindow
        glass.blendingMode = .behindWindow; glass.state = .active; glass.wantsLayer = true
        glass.onLayout = { [weak self] in self?.layout() }; panel.contentView = glass
        heading.textColor = .labelColor; caption.textColor = .secondaryLabelColor; status.textColor = .secondaryLabelColor
        detail.isEditable = false; detail.isSelectable = true; detail.drawsBackground = false
        detail.isVerticallyResizable = true; detail.isHorizontallyResizable = false
        detail.textContainerInset = NSSize(width: 2, height: 2)
        scroll.drawsBackground = false; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true; scroll.documentView = detail
        choicesScroll.drawsBackground = false; choicesScroll.hasVerticalScroller = true; choicesScroll.autohidesScrollers = true; choicesScroll.documentView = choicesView
        input.placeholderString = "输入回答或补充说明…"; input.isEditable = true; input.isSelectable = true
        input.setAccessibilityLabel("回答或补充说明")
        confirm = NSButton(title: "确认执行", target: self, action: #selector(accept))
        cancel = NSButton(title: "取消任务", target: self, action: #selector(reject))
        workspace = NSButton(title: "打开工作台", target: self, action: #selector(openWorkspace))
        reply = NSButton(title: "发送回答", target: self, action: #selector(submitText))
        for button in [confirm!, cancel!, workspace!, reply!] { button.bezelStyle = .rounded }
        confirm.bezelColor = NSColor(calibratedRed: 0.15, green: 0.42, blue: 0.38, alpha: 1); confirm.contentTintColor = .white
        // No global Return/Escape equivalents. Typing in another app must not submit.
        close = NSButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "隐藏交互面板，保留任务")!, target: self, action: #selector(hide))
        close.isBordered = false; close.contentTintColor = .secondaryLabelColor
        for view in [heading, caption, scroll, choicesScroll, input, status, confirm!, cancel!, workspace!, reply!, close!] { glass.addSubview(view) }
    }
    func layout() {
        let scale = glass.bounds.width / 520
        func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
            NSRect(x: x * scale, y: y * scale, width: width * scale, height: height * scale)
        }
        heading.frame = rect(26, 452, 430, 26); heading.font = .systemFont(ofSize: 18 * scale, weight: .semibold)
        caption.frame = rect(26, 429, 440, 18); caption.font = .systemFont(ofSize: 11 * scale)
        close.frame = rect(474, 452, 22, 22)
        let hasList = !choicesScroll.isHidden
        scroll.frame = hasList ? rect(24, 321, 472, 97) : rect(24, 155, 472, 263)
        detail.font = .systemFont(ofSize: 13 * scale); detail.textColor = .labelColor
        detail.textContainer?.containerSize = NSSize(width: scroll.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
        detail.textContainer?.widthTracksTextView = true
        detail.setFrameSize(NSSize(width: scroll.contentSize.width, height: scroll.contentSize.height)); detail.sizeToFit()
        choicesScroll.frame = rect(24, 155, 472, 158)
        let rowHeight = 64 * scale, contentHeight = max(choicesScroll.contentSize.height, CGFloat(choiceButtons.count) * rowHeight)
        choicesView.frame = NSRect(x: 0, y: 0, width: choicesScroll.contentSize.width, height: contentHeight)
        for (index, button) in choiceButtons.enumerated() {
            button.frame = NSRect(x: 0, y: contentHeight - CGFloat(index + 1) * rowHeight + 3 * scale, width: choicesScroll.contentSize.width, height: rowHeight - 6 * scale)
            button.font = .systemFont(ofSize: 12 * scale)
        }
        input.frame = rect(26, 110, 358, 30); input.font = .systemFont(ofSize: 13 * scale)
        reply.frame = rect(390, 108, 108, 34); reply.font = .systemFont(ofSize: 12 * scale)
        status.frame = rect(26, 65, 468, 36); status.font = .systemFont(ofSize: 10.5 * scale)
        cancel.frame = rect(22, 22, 110, 34); workspace.frame = rect(140, 22, 130, 34); confirm.frame = rect(282, 22, 216, 34)
        for button in [cancel!, workspace!, confirm!] { button.font = .systemFont(ofSize: 12 * scale) }
    }
    func set(_ value: Any?) -> Bool {
        if value is NSNull {
            card = nil; pendingAction = nil; input.stringValue = ""; ticker?.invalidate(); ticker = nil; panel.orderOut(nil)
            return true
        }
        guard let next = value as? [String: Any],
              let id = next["id"] as? String, !id.isEmpty, id.count <= 240,
              let task = next["taskId"] as? String, !task.isEmpty, task.count <= 160,
              let version = next["version"] as? Int, version > 0,
              let message = next["message"] as? String, message.count <= 1500,
              let expires = next["expiresAt"] as? Double, expires.isFinite, expires > Date().timeIntervalSince1970 * 1000 else { return false }
        let modern = (next["protocolVersion"] as? Int) == 4
        let kind = modern ? next["kind"] as? String ?? "" : "confirm"
        guard ["confirm", "select", "input", "inspect"].contains(kind) else { return false }
        var rows: [[String: Any]]
        if modern {
            guard let list = next["choices"] as? [[String: Any]], list.count <= 96, next["allowText"] is Bool else { return false }; rows = list
        } else {
            guard let choice = next["choiceId"] as? String, let label = next["label"] as? String else { return false }
            rows = [["id": choice, "title": next["choiceTitle"] as? String ?? label, "label": label]]
        }
        var ids = Set<String>()
        for row in rows {
            guard let choice = row["id"] as? String, !choice.isEmpty, choice.count <= 240, ids.insert(choice).inserted,
                  let title = row["title"] as? String, title.count <= 200,
                  let label = row["label"] as? String, !label.isEmpty, label.count <= 80,
                  (row["subtitle"] as? String ?? "").count <= 240 else { return false }
        }
        let changed = card?["id"] as? String != id || card?["status"] as? String != next["status"] as? String
        card = next; choices = rows
        if changed { pendingAction = nil; input.stringValue = ""; status.stringValue = "关闭只隐藏提示；已有操作不会因取消而撤销" }
        heading.stringValue = ["confirm": "需要你确认", "select": "需要你选择", "input": "需要你补充", "inspect": "需要你处理"][kind]!
        detail.string = message
        input.placeholderString = next["inputPlaceholder"] as? String ?? "输入回答或补充说明…"
        workspace.isHidden = !modern
        input.isHidden = !modern || next["allowText"] as? Bool != true; reply.isHidden = input.isHidden
        confirm.isHidden = kind != "confirm" || rows.count != 1
        if !confirm.isHidden { confirm.title = rows[0]["label"] as? String ?? "确认执行" }
        for button in choiceButtons { button.removeFromSuperview() }; choiceButtons = []
        choicesScroll.isHidden = rows.isEmpty || !confirm.isHidden
        if !choicesScroll.isHidden {
            for (index, row) in rows.enumerated() {
                let title = row["title"] as? String ?? "", subtitle = row["subtitle"] as? String ?? "", label = row["label"] as? String ?? "选择"
                let button = NSButton(title: "\(title) · \(label)\n\(subtitle)", target: self, action: #selector(selectChoice(_:)))
                button.tag = index; button.bezelStyle = .regularSquare; button.alignment = .left
                button.cell?.wraps = true; button.toolTip = "\(title)\n\(subtitle)\n\(label)"
                button.setAccessibilityLabel("\(title)，\(subtitle)，\(label)")
                choicesView.addSubview(button); choiceButtons.append(button)
            }
        }
        setEnabled(pendingAction == nil)
        if !positioned {
            positioned = true
            if !panel.setFrameUsingName("AssistantInteractionV2"), let screen = NSScreen.main {
                panel.setFrameOrigin(NSPoint(x: screen.visibleFrame.maxX - 544, y: screen.visibleFrame.maxY - 560))
            }
        }
        if let screen = panel.screen ?? NSScreen.main {
            let bounds = screen.visibleFrame; var frame = panel.frame
            frame.origin.x = max(bounds.minX, min(frame.origin.x, bounds.maxX - frame.width)); frame.origin.y = max(bounds.minY, min(frame.origin.y, bounds.maxY - frame.height))
            panel.setFrame(frame, display: true)
        }
        glass.layoutSubtreeIfNeeded(); layout()
        if changed { choicesScroll.contentView.scroll(to: NSPoint(x: 0, y: max(0, choicesView.bounds.height - choicesScroll.contentSize.height))) }
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        panel.orderFrontRegardless(); focusStayed = front == NSWorkspace.shared.frontmostApplication?.processIdentifier
        ticker?.invalidate()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self, let expiry = self.card?["expiresAt"] as? Double else { return }
            if expiry <= Date().timeIntervalSince1970 * 1000 { self.hide() }
        }
        RunLoop.main.add(timer, forMode: .common); ticker = timer
        return true
    }
    func setEnabled(_ enabled: Bool) {
        for button in [confirm!, cancel!, reply!, workspace!] + choiceButtons { button.isEnabled = enabled }
        input.isEnabled = enabled
    }
    @objc func hide() {
        guard let id = card?["id"] as? String else { return }
        panel.saveFrame(usingName: "AssistantInteractionV2"); _ = set(NSNull())
        send(["type": "confirmationHidden", "confirmationId": id])
    }
    @objc func accept() { perform(card?["protocolVersion"] as? Int == 4 ? "select" : "confirm", choiceId: choices.first?["id"] as? String) }
    @objc func selectChoice(_ sender: NSButton) {
        guard choices.indices.contains(sender.tag) else { return }
        perform("select", choiceId: choices[sender.tag]["id"] as? String)
    }
    @objc func reject() { perform("cancel") }
    @objc func openWorkspace() { perform("open") }
    @objc func submitText() {
        let text = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf16.count <= 500 else { status.stringValue = "请输入1至500字的补充内容"; return }
        perform("reply", text: text)
    }
    func perform(_ action: String, choiceId: String? = nil, text: String? = nil) {
        guard let card = card, pendingAction == nil, let expires = card["expiresAt"] as? Double,
              expires > Date().timeIntervalSince1970 * 1000 else { return }
        let actionId = UUID().uuidString; pendingAction = actionId; setEnabled(false); status.stringValue = "正在提交到工作台…"
        var event: [String: Any] = ["type": "confirmationAction", "confirmationId": card["id"]!, "taskId": card["taskId"]!, "version": card["version"]!, "actionId": actionId, "action": action]
        if let choiceId = choiceId { event["choiceId"] = choiceId }; if let text = text { event["text"] = text }
        send(event)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            if self?.pendingAction == actionId { self?.status.stringValue = "尚未收到回执，请在工作台核对；不会自动重试。" }
        }
    }
    func result(_ message: [String: Any]) {
        guard let id = card?["id"] as? String, message["confirmationId"] as? String == id,
              let pending = pendingAction, message["actionId"] as? String == pending else { return }
        if message["ok"] as? Bool == true { _ = set(NSNull()) }
        else { pendingAction = nil; setEnabled(true); status.stringValue = String((message["error"] as? String ?? "操作未接受，请查看工作台").prefix(200)) }
    }
}
