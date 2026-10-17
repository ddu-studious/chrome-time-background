import AppKit

// 桌面 AI 助手面板（协议 v7）：在任意应用里按全局快捷键（或水母右键菜单“问 AI…”）唤出的原生输入面板。
// 只显示与转发——任务、版本、取消、确认、预算、自动确认策略全在 Chrome 的 AssistantEngine：
//   · 回车 / “发送” → 事件 assistantAction{submit, actionId, text, taskId?, version?}；只有收到匹配 actionId 的 assistantResult(ok:true) 才算 Chrome 接受，
//     失败显示 Chrome 给的原因并保留输入；8 秒没有回执只提示“尚未确认”（不声称已提交），解除按钮锁定，同一段文字重试沿用同一个 actionId（Chrome 侧幂等）。
//   · 进度与结果只来自 Chrome 推来的 assistantState；completed 只写“助手已回复”，不改写成“已播放 / 已设置”。
//   · 需要选择 / 确认 / 补充时由原有交互确认卡（confirmation-view.swift）承担，这里只显示一行提示，不重复实现。
// 面板不记忆位置、不写任何持久化状态；Chrome 断开时进程随之结束，面板随之消失。设计见 docs/technical/native-assistant-workbench-20261016.md。

final class AssistantPanelWindow: NSPanel {
    var onCancel: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func cancelOperation(_ sender: Any?) { onCancel?() }
}

/// 助手原文：可选择、可复制。没有 Edit 菜单的辅助应用里 ⌘C / ⌘A 不会自动生效，所以自己接一下——只在它是第一响应者时，
/// 否则会抢走输入框里的 ⌘C。
final class AssistantBodyView: NSTextView {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard window?.firstResponder === self, event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command else { return super.performKeyEquivalent(with: event) }
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "c": copy(nil); return true
        case "a": selectAll(nil); return true
        default: return super.performKeyEquivalent(with: event)
        }
    }
}

final class AssistantController: NSObject, NSTextFieldDelegate {
    /// 发给 Chrome 的事件（main.swift 接线到 Native Messaging 的写出）。
    var send: (([String: Any]) -> Void)?
    /// 水母右键菜单项标题变化（nil 表示没有菜单项）。
    var onMenuTitle: ((String?) -> Void)?

    let panel: AssistantPanelWindow
    let hotkey = AssistantHotkey()

    private let glass = GlassView()
    private let caption = NSTextField(labelWithString: "桌面 AI 助手")
    private let input = InteractionInput()
    private let you = NSTextField(labelWithString: "")
    private let statusLabel = NSTextField(wrappingLabelWithString: "")
    private let statusIcon = NSImageView()            // 需要处理 / 出错时状态行前的符号：文字一律用系统标签色（保证在任何底色上都读得清），颜色只作辅助提示
    private let bodyView = AssistantBodyView()
    private let bodyScroll = NSScrollView()
    private let footer = NSTextField(labelWithString: "")
    private var sendButton: NSButton!, stopButton: NSButton!, workspaceButton: NSButton!, closeButton: NSButton!

    // —— 来自 Chrome 的内容（不持久化，不自行推算）——
    private(set) var state: AssistantModel.State?
    private var stateSeq = 0                       // 每次状态变化加一：回执到达前状态已经推来，就不再盖一条过时的“已交给 Chrome”
    // —— 配置（jelly.assistant）——
    private(set) var enabled = false
    private var registeredHotkey: AssistantModel.Hotkey?
    // —— 本地的短暂状态 ——
    private struct Pending {
        var kind: AssistantModel.PendingKind
        var actionId: String
        var text: String?                          // 提交的文字（重试判断用）
        var rawInput: String?                      // 发出时输入框里的原文（成功后只在没被改过时才清空）
        var stateSeq: Int
        var stale = false                          // 8 秒没有回执：解除锁定，但迟到的匹配回执仍然算数
    }
    private var pending: Pending?
    private var note: AssistantModel.Note?
    private(set) var focusFailed = false
    private var focusRetries = 0
    private var focusToken = 0
    /// 这次唤出之后面板是否拿到过键盘（键窗口 + 应用已激活）；拿到过之后再失去是用户自己切走，核对不能抢回来。
    private var keyboardSinceShow = false
    private var previousApp: NSRunningApplication?
    private var lastAnnounced = ""
    private var statusTone = AssistantModel.Tone.normal
    /// 仅隔离验收：环境变量 TIMEKEEPER_TEST_FOCUS_SKIP=N 让前 N 次“激活并聚焦”什么都不做（面板只是显示），用来走通焦点核对的重试与放弃路径；正式使用时恒为 0。
    private var focusSkip = Int(ProcessInfo.processInfo.environment["TIMEKEEPER_TEST_FOCUS_SKIP"] ?? "") ?? 0

    private let margin: CGFloat = 20, topPad: CGFloat = 14, bottomPad: CGFloat = 12
    private let inputHeight: CGFloat = 34, maxBodyHeight: CGFloat = 240

    static var reduceMotion: Bool {
        ProcessInfo.processInfo.environment["TIMEKEEPER_REDUCE_MOTION"] == "1" || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    override init() {
        panel = AssistantPanelWindow(contentRect: NSRect(x: 0, y: 0, width: AssistantModel.panelWidth, height: 150), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        panel.title = "桌面 AI 助手"
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if #available(macOS 13.0, *) { panel.collectionBehavior.insert(.canJoinAllApplications) }
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isReleasedWhenClosed = false
        panel.isMovableByWindowBackground = true
        panel.setAccessibilityLabel("桌面 AI 助手")
        switch ProcessInfo.processInfo.environment["TIMEKEEPER_APPEARANCE"] {          // 仅隔离验收：强制浅/深外观，用来看两种外观下的截图
        case "light": panel.appearance = NSAppearance(named: .aqua)
        case "dark": panel.appearance = NSAppearance(named: .darkAqua)
        default: break
        }
        panel.onCancel = { [weak self] in self?.hide() }
        glass.fixedCornerRadius = 18
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.onLayout = { [weak self] in self?.relayout() }
        panel.contentView = glass

        caption.font = .systemFont(ofSize: 11, weight: .semibold); caption.textColor = .secondaryLabelColor
        you.font = .systemFont(ofSize: 12); you.textColor = .secondaryLabelColor; you.lineBreakMode = .byTruncatingTail
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium); statusLabel.maximumNumberOfLines = 2; statusLabel.lineBreakMode = .byWordWrapping
        statusIcon.imageScaling = .scaleProportionallyDown; statusIcon.setAccessibilityElement(false)
        footer.font = .systemFont(ofSize: 11); footer.textColor = .secondaryLabelColor; footer.alignment = .right; footer.lineBreakMode = .byTruncatingHead

        input.placeholderString = "对 AI 助手说点什么…"
        input.font = .systemFont(ofSize: 15)
        input.bezelStyle = .roundedBezel
        input.isEditable = true; input.isSelectable = true
        input.cell?.usesSingleLineMode = true; input.cell?.isScrollable = true; input.cell?.wraps = false
        input.lineBreakMode = .byTruncatingTail
        input.delegate = self
        input.target = self; input.action = #selector(submit)         // 回车（输入法组字中的第一次回车由系统吃掉）
        input.setAccessibilityLabel("向 AI 助手描述需求")

        sendButton = NSButton(title: "发送", target: self, action: #selector(submit))
        stopButton = NSButton(title: "停止", target: self, action: #selector(stop))
        workspaceButton = NSButton(title: "在 Chrome 中查看", target: self, action: #selector(openWorkspace))
        closeButton = NSButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "收起 AI 助手面板")!, target: self, action: #selector(closeTapped))
        for button in [sendButton!, stopButton!, workspaceButton!] { button.bezelStyle = .rounded }
        sendButton.bezelColor = NSColor(calibratedRed: 0.15, green: 0.42, blue: 0.38, alpha: 1); sendButton.contentTintColor = .white
        sendButton.font = .systemFont(ofSize: 13); stopButton.font = .systemFont(ofSize: 12); workspaceButton.font = .systemFont(ofSize: 12)
        stopButton.setAccessibilityLabel("停止当前任务")
        closeButton.isBordered = false; closeButton.contentTintColor = .secondaryLabelColor
        // 回车与 Esc 都不是全局的按键等价：别的应用里打字不能触发这里（面板只有在它是键窗口时才收键盘）。

        bodyView.isEditable = false; bodyView.isSelectable = true; bodyView.drawsBackground = false
        bodyView.font = .systemFont(ofSize: 13); bodyView.textColor = .labelColor
        bodyView.textContainerInset = NSSize(width: 2, height: 4)
        bodyView.isVerticallyResizable = true; bodyView.isHorizontallyResizable = false
        bodyView.setAccessibilityLabel("助手回复")
        bodyScroll.drawsBackground = false; bodyScroll.hasVerticalScroller = true; bodyScroll.autohidesScrollers = true; bodyScroll.borderType = .noBorder
        bodyScroll.documentView = bodyView

        for view in [caption, closeButton!, input, sendButton!, you, statusIcon, statusLabel, stopButton!, bodyScroll, workspaceButton!, footer] as [NSView] { glass.addSubview(view) }
        hotkey.onPressed = { [weak self] in self?.toggle() }
        NotificationCenter.default.addObserver(self, selector: #selector(panelBecameKey), name: NSWindow.didBecomeKeyNotification, object: panel)
        NotificationCenter.default.addObserver(self, selector: #selector(noteKeyboard), name: NSApplication.didBecomeActiveNotification, object: nil)
        refresh()
    }

    // MARK: 配置（jelly.assistant）

    /// 处理 `jelly` 命令里的 assistant 字段：注册 / 注销热键，启用或停用面板与菜单项。返回回报给 Chrome 的状态与规范热键。
    /// 热键非法、被占用时面板仍然启用（菜单入口可用）；只有明确停用（没带 assistant、enabled 不是 true）才收起面板并清掉状态。
    @discardableResult
    func apply(_ raw: Any?) -> (status: AssistantModel.HotkeyStatus, hotkey: String?) {
        let plan = AssistantModel.hotkeyPlan(raw)
        let result = hotkey.apply(plan)
        switch plan {
        case .disable:
            let wasEnabled = enabled
            enabled = false
            registeredHotkey = nil
            if wasEnabled {
                hide(restoreFocus: false)
                state = nil; stateSeq += 1; pending = nil; note = nil; focusFailed = false; input.stringValue = ""
                refresh()
            }
        case .invalid:
            enabled = true
            registeredHotkey = nil
        case .register(let value):
            enabled = true
            registeredHotkey = result == .ok ? value : nil
        }
        onMenuTitle?(menuTitle)
        if enabled { refresh() }
        var reported: String?
        if case .register(let value) = plan { reported = value.canonical }
        return (result, reported)
    }

    var menuTitle: String? { enabled ? AssistantModel.menuTitle(hotkey: registeredHotkey, status: hotkey.status) : nil }

    // MARK: 显示与收起

    var visible: Bool { panel.isVisible }
    var isKey: Bool { panel.isKeyWindow }
    var windowNumber: Int { panel.windowNumber }
    var frameString: String { NSStringFromRect(panel.frame) }
    /// 输入框是否正在编辑（第一响应者是它的字段编辑器）：验收“能直接打字”要看这个，不能只看窗口是不是键窗口。
    var isEditing: Bool { (panel.firstResponder as? NSTextView)?.delegate === input }

    /// 热键 / 菜单 / 测试钩子：已显示且键盘在面板里则收起，否则显示并聚焦。
    func toggle() {
        guard enabled else { return }
        if panel.isVisible && panel.isKeyWindow && NSApp.isActive { hide() } else { show() }
    }

    func show() {
        guard enabled else { return }
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != ProcessInfo.processInfo.processIdentifier { previousApp = front }
        let fresh = !panel.isVisible
        refresh(reposition: fresh)
        if fresh && !AssistantController.reduceMotion {
            panel.alphaValue = 0
            NSAnimationContext.runAnimationGroup { context in context.duration = 0.12; panel.animator().alphaValue = 1 }
        } else { panel.alphaValue = 1 }
        focusRetries = 0
        keyboardSinceShow = false
        activateAndFocus()
        scheduleFocusCheck()
    }

    /// 收起面板（任务继续在 Chrome 里执行，不取消）。键盘还在面板里时把前台还给唤出前的应用。
    func hide(restoreFocus: Bool = true) {
        guard panel.isVisible else { return }
        let hadKeyboard = panel.isKeyWindow && NSApp.isActive
        focusToken += 1                                  // 作废排队中的焦点核对
        focusFailed = false
        panel.orderOut(nil)
        if restoreFocus && hadKeyboard, let app = previousApp, !app.isTerminated { app.activate(options: []) }
        previousApp = nil
    }

    private func activateAndFocus() {
        if focusSkip > 0 { focusSkip -= 1; panel.orderFrontRegardless(); return }
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(input)
        noteKeyboard()
    }

    /// 应用激活与窗口成为键窗口是两个先后不定的通知：任何一个到达时，只要两个条件同时成立就记下“这次拿到过键盘”。
    @objc private func noteKeyboard() {
        if panel.isVisible && panel.isKeyWindow && NSApp.isActive { keyboardSinceShow = true }
    }

    private func scheduleFocusCheck() {
        focusToken += 1
        let token = focusToken
        DispatchQueue.main.asyncAfter(deadline: .now() + AssistantModel.focusCheckDelay) { [weak self] in self?.checkFocus(token) }
    }

    /// 激活偶发不生效（调研原型里出现过面板可见、应用没激活）：核对一次，没拿到再试一次，仍没有就提示，面板保持可见，不吞输入。
    private func checkFocus(_ token: Int) {
        guard token == focusToken, panel.isVisible else { return }
        switch AssistantModel.focusDecision(isKey: panel.isKeyWindow, appActive: NSApp.isActive, hadKeyboard: keyboardSinceShow, retries: focusRetries) {
        case .done:
            if focusFailed { focusFailed = false; refresh() }
        case .retry:
            focusRetries += 1
            activateAndFocus()
            scheduleFocusCheck()
        case .giveUp:
            focusFailed = true
            refresh()
        }
    }

    @objc private func panelBecameKey() {
        noteKeyboard()
        if focusFailed { focusFailed = false; refresh() }
        if !isEditing { panel.makeFirstResponder(input) }
    }

    @objc private func closeTapped() { hide() }

    // MARK: 数据入口（来自 Chrome）

    /// `assistantState` 命令：null 表示没有任务；非法负载返回 false（Chrome 据此知道没有被接受）。
    func update(state raw: Any?) -> Bool {
        let next: AssistantModel.State?
        switch AssistantModel.parseState(raw) {
        case .invalid: return false
        case .cleared: next = nil
        case .task(let value): next = value
        }
        if next == state { return true }
        state = next
        stateSeq += 1
        note = nil                                       // 新状态盖过旧的本地提示（拒绝原因、没有回执……）
        refresh()
        return true
    }

    /// `assistantResult` 命令：只认当前未决动作的 actionId；迟到、不匹配的回执一律忽略。
    func result(_ message: [String: Any]) {
        guard let current = pending, message["actionId"] as? String == current.actionId else { return }
        pending = nil
        let ok = (message["ok"] as? Bool) == true
        note = AssistantModel.resultNote(kind: current.kind, ok: ok, error: message["error"], stateChangedSince: stateSeq != current.stateSeq)
        if ok, current.kind == .submit, let raw = current.rawInput, input.stringValue == raw { input.stringValue = "" }
        refresh()
        if panel.isKeyWindow && !isEditing { panel.makeFirstResponder(input) }
    }

    // MARK: 用户操作

    private var locked: Bool { pending != nil && pending?.stale == false }

    @objc private func submit() {
        guard enabled, !locked else { return }
        let check = AssistantModel.checkInput(input.stringValue)
        guard case .ok(let text) = check else { note = AssistantModel.inputNote(check); refresh(); return }
        // 8 秒没有回执后用同一段文字重试：沿用同一个 actionId，Chrome 侧已处理过会只重复回执，不会再提交一次
        var reuse: String?
        if let stale = pending, stale.stale, stale.kind == .submit, stale.text == text { reuse = stale.actionId }
        begin(.submit, actionId: reuse ?? UUID().uuidString, text: text, rawInput: input.stringValue)
    }

    @objc private func stop() {
        guard enabled, !locked, AssistantModel.canStop(state) else { return }
        begin(.stop, actionId: UUID().uuidString)
    }

    @objc private func openWorkspace() {
        guard enabled, !locked else { return }
        begin(.open, actionId: UUID().uuidString)
    }

    private func begin(_ kind: AssistantModel.PendingKind, actionId: String, text: String? = nil, rawInput: String? = nil) {
        var event: [String: Any] = ["type": "assistantAction", "actionId": actionId, "action": kind == .stop ? "cancel" : kind.rawValue]
        if let text = text { event["text"] = text }
        // 与浏览器工作台一致：带上面板所见的任务与版本（提交时用来走原有的“第 2 个”引用与过期检查，停止时必须匹配）
        if kind != .open, let state = state { event["taskId"] = state.taskId; event["version"] = state.version }
        pending = Pending(kind: kind, actionId: actionId, text: text, rawInput: rawInput, stateSeq: stateSeq)
        note = nil
        focusFailed = false
        refresh()
        send?(event)
        DispatchQueue.main.asyncAfter(deadline: .now() + AssistantModel.noAckSeconds) { [weak self] in self?.noAck(actionId) }
    }

    private func noAck(_ actionId: String) {
        guard var current = pending, current.actionId == actionId, !current.stale else { return }
        current.stale = true
        pending = current
        note = AssistantModel.noAckNote
        refresh()
    }

    // MARK: NSTextFieldDelegate

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) { hide(); return true }
        return false
    }

    func controlTextDidChange(_ notification: Notification) {
        guard !locked else { return }
        let check = AssistantModel.checkInput(input.stringValue)
        if case .tooLong = check { note = AssistantModel.inputNote(check) } else if note != nil { note = nil }
        refresh()
    }

    // MARK: 渲染

    /// 当前要显示的状态行（含焦点提示）。
    private func currentLine() -> (text: String, tone: AssistantModel.Tone) {
        var shownNote = note
        if shownNote == nil && focusFailed { shownNote = AssistantModel.Note(text: AssistantModel.focusHint, bad: false) }
        return AssistantModel.statusLine(state: state, pending: locked ? pending?.kind : nil, note: shownNote, nowMs: Date().timeIntervalSince1970 * 1000)
    }

    /// 状态行的语气：文字永远是系统标签色（窗口材质是半透明的，底色不可知，自定义彩色字无法保证对比度），
    /// 需要处理 / 出错时改用半粗体并在前面放一个带色符号；含义由文字本身承担，颜色只是辅助。
    private func applyTone(_ tone: AssistantModel.Tone) {
        let symbol: (name: String, tint: NSColor)?
        switch tone {
        case .normal: symbol = nil
        case .attention: symbol = ("exclamationmark.circle.fill", .systemOrange)
        case .bad: symbol = ("exclamationmark.triangle.fill", .systemRed)
        }
        statusLabel.textColor = .labelColor
        statusLabel.font = .systemFont(ofSize: 13, weight: tone == .normal ? .medium : .semibold)
        if let symbol = symbol, let image = NSImage(systemSymbolName: symbol.name, accessibilityDescription: nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 14, weight: .semibold)) {
            statusIcon.image = image
            statusIcon.contentTintColor = symbol.tint
            statusIcon.isHidden = false
        } else { statusIcon.isHidden = true }
    }

    /// 把当前内容放到控件上、必要时改面板高度（顶边不动）并重新排版。
    func refresh(reposition: Bool = false) {
        let line = currentLine()
        statusTone = line.tone
        statusLabel.stringValue = line.text
        applyTone(line.tone)
        you.stringValue = AssistantModel.youLine(state)
        let body = state?.message ?? ""
        if bodyView.string != body { bodyView.string = body }       // 没变就不重设：重设会让正在选中的文字与滚动位置回到起点
        stopButton.isHidden = !AssistantModel.canStop(state)
        stopButton.isEnabled = !locked
        sendButton.isEnabled = !locked
        workspaceButton.isEnabled = !locked
        footer.stringValue = AssistantModel.footerHint(hotkey: registeredHotkey, status: hotkey.status)
        let height = layoutAll(height: nil)
        if reposition || !panel.isVisible {
            if let screen = screenUnderMouse() {
                panel.setFrame(AssistantModel.panelFrame(visible: screen.visibleFrame, size: CGSize(width: AssistantModel.panelWidth, height: height)), display: false)
            }
        } else if abs(panel.frame.height - height) > 0.5, let screen = panel.screen ?? screenUnderMouse() {
            panel.setFrame(AssistantModel.resized(frame: panel.frame, height: height, visible: screen.visibleFrame), display: true)
        }
        relayout()
        announce(line)
    }

    /// 鼠标所在的屏幕（面板出现在用户正在看的那块屏幕上）；取不到时退回主屏。
    private func screenUnderMouse() -> NSScreen? {
        let point = NSEvent.mouseLocation
        return NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main ?? NSScreen.screens.first
    }

    private func relayout() { _ = layoutAll(height: panel.frame.height) }

    /// 自上而下排版；height 为 nil 时只量总高度不动控件。
    @discardableResult
    private func layoutAll(height total: CGFloat?) -> CGFloat {
        let width = AssistantModel.panelWidth, inner = width - 2 * margin
        var y = topPad
        func place(_ view: NSView, x: CGFloat, w: CGFloat, h: CGFloat, dy: CGFloat = 0) {
            guard let total = total else { return }
            view.frame = NSRect(x: x, y: total - (y + dy + h), width: w, height: h)
        }
        place(caption, x: margin, w: inner - 28, h: 16)
        place(closeButton, x: width - margin - 20, w: 20, h: 20, dy: -2)
        y += 16 + 8
        place(input, x: margin, w: inner - 92, h: inputHeight)
        place(sendButton, x: width - margin - 84, w: 84, h: 30, dy: 2)
        y += inputHeight + 10
        let youShown = !you.stringValue.isEmpty
        you.isHidden = !youShown
        if youShown { place(you, x: margin, w: inner, h: 16); y += 16 + 4 }
        let iconWidth: CGFloat = statusIcon.isHidden ? 0 : 22
        let statusWidth = inner - iconWidth - (stopButton.isHidden ? 0 : 64)
        let measured = statusLabel.cell?.cellSize(forBounds: NSRect(x: 0, y: 0, width: statusWidth, height: CGFloat.greatestFiniteMagnitude)).height ?? 16
        let statusHeight = min(36, max(18, ceil(measured)))
        place(statusIcon, x: margin, w: 18, h: 18, dy: 0)
        place(statusLabel, x: margin + iconWidth, w: statusWidth, h: statusHeight)
        place(stopButton, x: width - margin - 56, w: 56, h: 24, dy: -2)
        y += statusHeight + 8
        let bodyShown = !bodyView.string.isEmpty
        bodyScroll.isHidden = !bodyShown
        if bodyShown {
            let bodyHeight = min(maxBodyHeight, measureBody(width: inner))
            place(bodyScroll, x: margin, w: inner, h: bodyHeight)
            if total != nil {
                bodyView.frame.size.width = bodyScroll.contentSize.width
                bodyView.textContainer?.containerSize = NSSize(width: max(1, bodyScroll.contentSize.width - 2 * bodyView.textContainerInset.width), height: CGFloat.greatestFiniteMagnitude)
                bodyView.textContainer?.widthTracksTextView = true
            }
            y += bodyHeight + 8
        }
        place(workspaceButton, x: margin, w: 136, h: 24)
        place(footer, x: margin + 144, w: inner - 144, h: 16, dy: 4)
        y += 28
        return y + bottomPad
    }

    /// 助手原文需要的高度：用文本视图自己的排版管理器量，与实际绘制同一套字体回退与行高。
    private func measureBody(width: CGFloat) -> CGFloat {
        guard let container = bodyView.textContainer, let manager = bodyView.layoutManager else { return 0 }
        container.widthTracksTextView = false
        container.containerSize = NSSize(width: max(1, width - 2 * bodyView.textContainerInset.width), height: CGFloat.greatestFiniteMagnitude)
        manager.ensureLayout(for: container)
        return ceil(manager.usedRect(for: container).height + 2 * bodyView.textContainerInset.height)
    }

    /// 读屏：状态行变化时，只播报需要处理、失败、已回复与已取消；空闲提示、等回执和规划 / 执行中不播（太啰嗦）。
    private func announce(_ line: (text: String, tone: AssistantModel.Tone)) {
        guard panel.isVisible, line.text != lastAnnounced else { return }
        lastAnnounced = line.text
        let finished = state?.status == .completed || state?.status == .cancelled
        guard line.tone != .normal || (finished && pending == nil) else { return }
        NSAccessibility.post(element: statusLabel, notification: .announcementRequested,
                             userInfo: [.announcement: line.text, .priority: NSAccessibilityPriorityLevel.medium.rawValue])
    }

    // MARK: 读数（协议回执与验收脚本用）

    var inputText: String { input.stringValue }
    var youText: String { you.stringValue }
    var statusText: String { statusLabel.stringValue }
    var toneName: String { statusTone.rawValue }
    var bodyText: String { bodyView.string }
    var footerText: String { footer.stringValue }
    var stopVisible: Bool { !stopButton.isHidden }
    var sendEnabled: Bool { sendButton.isEnabled }
    var pendingName: String {
        guard let current = pending else { return "none" }
        return current.stale ? "stale-\(current.kind.rawValue)" : current.kind.rawValue
    }
    var hotkeyText: String? { registeredHotkey?.canonical }
    var hotkeyStatusName: String { hotkey.status.rawValue }

    private func screenFrame(of view: NSView) -> String {
        NSStringFromRect(panel.convertToScreen(view.convert(view.bounds, to: nil)))
    }
    /// 各按钮的屏幕位置（NSStringFromRect 格式），验收脚本据此做真实点击；隐藏的按钮不在其中。
    func buttonFrames() -> [String: String] {
        guard panel.isVisible else { return [:] }
        var frames: [String: String] = ["send": screenFrame(of: sendButton), "open": screenFrame(of: workspaceButton), "close": screenFrame(of: closeButton), "input": screenFrame(of: input)]
        if !stopButton.isHidden { frames["stop"] = screenFrame(of: stopButton) }
        return frames
    }

    /// 仅隔离验收：环境变量 TIMEKEEPER_TEST_HOOKS=1 时才由 main.swift 放行；走与用户操作相同的入口，让测试不依赖鼠标键盘时序。
    func hook(_ operation: String?, text: String?) -> Bool {
        switch operation {
        case "show": guard enabled else { return false }; show(); return true
        case "toggle": guard enabled else { return false }; toggle(); return true
        case "hide": hide(); return true
        case "focus": guard enabled, panel.isVisible else { return false }; activateAndFocus(); return true       // 用户点了面板 / 再按一次热键：重新要键盘
        case "skipfocus": focusSkip = Int(text ?? "") ?? 1; return true                                          // 让接下来的 N 次激活不生效：验收“再次唤出的核对从头算，不沿用上一次拿到过键盘”
        case "deactivate":
            // 用户切到了别的应用：激活唤出前的那个应用（没有就 Finder），面板仍可见（浮动），但不再是键窗口。
            // 不用 NSApp.deactivate()：macOS 14 起的合作式激活下它只让窗口放弃键盘、不一定交出激活权（实测 7 次里 6 次应用仍是激活状态）。
            guard panel.isVisible else { return false }
            let other = previousApp ?? NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == "com.apple.finder" }
            guard let target = other, !target.isTerminated else { return false }
            return target.activate(options: [])
        case "move":
            // 模拟用户拖动面板（"dx,dy"，Cocoa 坐标，单位点）：用来核对“面板已显示时再次唤出，不把它拽回原位”
            let offsets = (text ?? "").split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard panel.isVisible, offsets.count == 2 else { return false }
            panel.setFrameOrigin(NSPoint(x: panel.frame.origin.x + offsets[0], y: panel.frame.origin.y + offsets[1]))
            return true
        case "type":
            guard enabled, panel.isVisible else { return false }
            input.stringValue = text ?? ""
            if let editor = panel.firstResponder as? NSTextView, editor.delegate === input { editor.setSelectedRange(NSRange(location: (input.stringValue as NSString).length, length: 0)) }     // 像真实打字一样光标在末尾，不整段选中
            controlTextDidChange(Notification(name: NSControl.textDidChangeNotification))
            return true
        case "submit": guard enabled, panel.isVisible else { return false }; submit(); return true
        case "stop": guard enabled, panel.isVisible, AssistantModel.canStop(state), !locked else { return false }; stop(); return true
        case "open": guard enabled, panel.isVisible, !locked else { return false }; openWorkspace(); return true
        case "close": guard panel.isVisible else { return false }; closeTapped(); return true
        default: return false
        }
    }
}
