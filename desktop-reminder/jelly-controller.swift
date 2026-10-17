import AppKit

// 桌面水母的控制器（协议 v6）：把 Chrome 发来的内容——水母设置、今天的记录、闹钟倒计时、喝水/起身提醒、到点响铃——拼成水母头上的气泡，
// 再把用户的操作（延后/跳过倒计时、气泡按钮、响铃的“停止/稍后再提醒”、收起水母、隐藏倒计时）原样交回 Chrome。
// 原生端不拥有任何业务状态：闹钟的修改、今天的次数、稍后提醒、响铃会话的结束都由 Chrome 执行并回执，收到成功回执才显示结果；
// 连接断开时水母随进程一起结束（寿命跟随 Chrome）。
// 水母不依赖闹钟：常驻（resident）时没有倒计时也在；没有常驻时只在倒计时、提醒气泡或响铃期间临时出现。
final class JellyController: NSObject, NSMenuDelegate {
    var send: (([String: Any]) -> Void)?
    var onFocusCheck: ((Bool) -> Void)?
    /// 桌面 AI 助手启用时右键菜单第一项的标题（nil：没有这一项）与点选后的回调；助手本身在 assistant-panel.swift，这里只放入口。
    var assistantMenuTitle: String?
    var onAskAssistant: (() -> Void)?

    let companion = JellyCompanion()
    let menu = NSMenu()

    // —— 来自 Chrome 的内容（不持久化、不自行推算）——
    private(set) var resident = false
    private(set) var night = true
    private var lines: [String] = []
    private var linesUntil = 0.0
    private(set) var data: [String: Any]?
    private var titleValue = ""
    private(set) var nudge: JellyModel.Nudge?

    // —— 本地的短暂显示状态 ——
    private var ticker: Timer?
    private var tickerInterval = 0.0
    private var feedback: (text: String, until: Date, bad: Bool)?
    private var detailUntil: Date?
    private var detailTimer: Timer?
    private var pendingAction: String?          // 倒计时操作：等待 Chrome 回执的 actionId
    private var nudgePending: String?           // 提醒气泡按钮：等待 Chrome 回执的 actionId
    private var nudgeStatus: (text: String, bad: Bool)?
    private var nudgeClosing = false            // 成功回执已显示，正在收起
    private var nudgeTimer: Timer?
    private var countdownShown = false
    // 读数（协议回执与验收脚本用）
    private(set) var lastStage = CountdownStage.calm
    private(set) var lastNight: CGFloat = 0
    private(set) var lastClock = ""
    private(set) var lastBubble = JellyModel.BubbleKind.none

    /// 系统“减少动态效果”；验收脚本可用环境变量 TIMEKEEPER_REDUCE_MOTION=1 强制开启（只用于隔离测试）。
    var reduceMotion: Bool {
        ProcessInfo.processInfo.environment["TIMEKEEPER_REDUCE_MOTION"] == "1" || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    override init() {
        super.init()
        companion.view.menu = menu
        companion.view.toolTip = "点一下看看 · 拖起来放下它 · 右键更多操作"
        companion.onPoke = { [weak self] in self?.poked() }
        companion.onButton = { [weak self] id in self?.bubbleButton(id) }
        companion.onGrabBegin = { [weak self] in self?.grabBegan() }
        companion.onGrabEnd = { [weak self] in self?.grabEnded() }
        menu.delegate = self
    }

    // MARK: 数据入口（来自 Chrome）

    /// 水母自身状态：是否常驻、夜晚荧光、今天的记录文字。负载不合规返回 false。
    func setJelly(_ raw: Any?) -> Bool {
        guard let state = JellyModel.parseState(raw) else { return false }
        resident = state.resident
        night = state.night
        lines = state.lines
        linesUntil = state.linesUntil
        updateVisibility()
        return true
    }

    /// 校验并接收一条倒计时；NSNull 表示没有可显示的倒计时。返回是否接受。
    func set(timer: Any?) -> Bool {
        if let timer = timer as? [String: Any] {
            guard let id = timer["id"] as? String, !id.isEmpty, id.count <= 200,
                  let text = timer["title"] as? String, text.count <= 320,
                  let at = timer["fireAt"] as? Double, at.isFinite, at > 0, at < 8640000000000000 else { return false }
            data = timer
            titleValue = JellyModel.clean(text, max: 80) ?? "闹钟"
        } else if timer is NSNull {
            data = nil
            feedback = nil
        } else { return false }
        updateVisibility()
        return true
    }

    // MARK: 显示与退场

    func updateVisibility() {
        let ringing = ring != nil || ringExiting
        let countdownActive = data != nil && ring == nil
        guard JellyModel.shouldShow(resident: resident, hasCountdown: data != nil, ringing: ringing, hasNudge: nudge != nil) else {
            stopTicker()
            detailTimer?.invalidate(); detailUntil = nil
            companion.hide(remember: !ringReturning)      // 回家的路上被隐藏：当前位置不是用户放下的位置，不能记
            ringReturning = false; ringHomeX = nil        // 回家的路取消了：不留“还在回家”的残留，否则下一次响铃会沿用过期的家
            countdownShown = false
            return
        }
        // 倒计时刚被响铃接棒：水母留下，只做一次到点的“炸开”
        if countdownShown && !countdownActive && !reduceMotion && companion.isVisible { companion.burst() }
        countdownShown = countdownActive
        if !companion.isVisible {
            let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
            companion.show()
            onFocusCheck?(frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier)
        }
        refresh()
        restartTicker()
    }

    // MARK: 刷新

    private func stopTicker() { ticker?.invalidate(); ticker = nil; tickerInterval = 0 }

    /// 有倒计时、提醒气泡或操作反馈时每秒刷新一次；常驻休息时 30 秒一次（只为夜晚荧光和记录过期）。
    private func restartTicker() {
        stopTicker()
        guard companion.isVisible else { return }
        tickerInterval = JellyModel.tickInterval(active: tickerNeedsSeconds)
        let tick = Timer(timeInterval: tickerInterval, repeats: true) { [weak self] _ in self?.refresh() }
        tick.tolerance = tickerInterval * 0.1
        RunLoop.main.add(tick, forMode: .common)
        ticker = tick
    }

    private var tickerNeedsSeconds: Bool { (data != nil && ring == nil) || nudge != nil || feedback != nil }

    private func remainingSeconds() -> (exact: Double, whole: Int)? {
        guard let at = data?["fireAt"] as? Double else { return nil }
        let exact = at / 1000 - Date().timeIntervalSince1970
        return (exact, max(0, Int(ceil(exact))))
    }

    private func relativeText(_ seconds: Int) -> String {
        CountdownModel.spoken(seconds: seconds).replacingOccurrences(of: "还有 ", with: "") + (seconds > 0 ? "后" : "")
    }

    /// 本机时间对应的夜晚荧光程度；隔离验收可用环境变量 TIMEKEEPER_NIGHT_HOUR=23 假定本地时间（只用于测试）。
    private func nightAmount(_ now: Date) -> CGFloat {
        guard night else { return 0 }
        let hour = Double(ProcessInfo.processInfo.environment["TIMEKEEPER_NIGHT_HOUR"] ?? "") ?? CountdownModel.localHour(now)
        return CGFloat(CountdownModel.nightAmount(hour: hour))
    }

    private var visibleLines: [String] {
        JellyModel.visibleLines(lines, until: linesUntil, nowMs: Date().timeIntervalSince1970 * 1000)
    }

    func refresh() {
        let now = Date()
        if let note = feedback, note.until < now { feedback = nil }
        if let until = detailUntil, until < now { detailUntil = nil }
        let remaining = (data != nil && ring == nil) ? remainingSeconds() : nil
        var stage = CountdownStage.calm, seconds = 0, clock = ""
        if let remaining = remaining {
            seconds = remaining.whole
            stage = CountdownModel.stage(seconds: seconds)
            clock = CountdownModel.clock(seconds: seconds)
        }
        lastStage = stage
        lastClock = clock
        let nightValue = nightAmount(now)
        lastNight = nightValue
        let shown = visibleLines
        let kind = JellyModel.bubbleKind(ringing: ring != nil, ringArrived: ringPhase == .shown, hasNudge: nudge != nil, hasNote: feedback != nil, detailActive: detailUntil != nil, hasCountdown: remaining != nil)
        lastBubble = kind
        var bubble: JellyBubble?
        switch kind {
        case .none:
            bubble = nil
        case .clock:
            bubble = JellyBubble(kind: .clock, lines: [stage == .due ? "时间到啦" : clock], alert: stage >= .imminent)
        case .note:
            if let note = feedback { bubble = JellyBubble(kind: .note, lines: [note.text], bad: note.bad) }
        case .detail:
            var detail: [String] = []
            var title: String?
            if remaining != nil {
                title = String(titleValue.prefix(14)) + (titleValue.count > 14 ? "…" : "")
                detail.append(stage == .due ? "时间到啦" : CountdownModel.spoken(seconds: seconds))
            } else if !shown.isEmpty {
                title = "今天"
            }
            detail += shown
            if detail.isEmpty { detail = ["我在这儿～"] }
            bubble = JellyBubble(kind: .detail, title: title, lines: detail)
        case .nudge:
            if let current = nudge {
                let buttons = nudgeClosing ? [] : current.buttons.map { JellyBubble.Button(id: $0.id, title: $0.title, enabled: nudgePending == nil, primary: $0.id == "done") }
                bubble = JellyBubble(kind: .nudge, title: current.title, lines: [current.text],
                                     status: nudgeStatus?.text ?? (nudgePending != nil ? "正在同步到 Chrome…" : nil),
                                     bad: nudgeStatus?.bad ?? false, buttons: buttons)
            }
        case .ring:
            if let current = ring {
                let closing = ringClosing
                let buttons = JellyModel.ringButtons(canSnooze: current.canSnooze, minutes: current.snoozeMinutes)
                    .map { JellyBubble.Button(id: $0.id, title: $0.title, enabled: ringPending == nil && !closing, primary: $0.id == "dismiss") }
                bubble = JellyBubble(kind: .ring, lines: JellyModel.ringTitleLines(names: current.names, more: current.more),
                                     status: closing ? nil : (ringStatus?.text ?? (ringPending != nil ? "正在同步到 Chrome…" : nil)),
                                     bad: ringStatus?.bad ?? false, buttons: buttons,
                                     bigClock: current.clock.isEmpty ? nil : current.clock, confirm: closing ? ringStatus?.text : nil)
            }
        }
        // 倒计时临近时水母游起来；提醒气泡与响铃期间让它停在游泳线上，按钮才不会从鼠标下游走
        let ringing = ring != nil
        companion.update(JellyInfo(stage: ringing ? .due : stage, night: nightValue, bubble: bubble, awake: kind > .clock || ringing,
                                   rest: ringing || ringExiting || stage == .calm || nudge != nil,
                                   ripples: ringing && ringPhase == .shown, ringEpoch: ringEpoch), reduceMotion: reduceMotion)
        if ticker != nil && JellyModel.tickInterval(active: tickerNeedsSeconds) != tickerInterval { restartTicker() }
    }

    // MARK: 点击水母：看看详情

    private func poked() {
        guard nudge == nil, ring == nil else { return }       // 提醒气泡与响铃期间不跳动，免得按钮从鼠标下跑掉
        if !reduceMotion { companion.jump() }
        detailUntil = Date().addingTimeInterval(4)
        detailTimer?.invalidate()
        detailTimer = Timer.scheduledTimer(withTimeInterval: 4.05, repeats: false) { [weak self] _ in
            self?.detailUntil = nil
            self?.refresh()
        }
        refresh()
    }

    // MARK: 喝水 / 起身提醒气泡（来自 Chrome 的 nudge；按钮动作交回 Chrome，计数与稍后提醒都由 Chrome 拥有）

    /// 显示一条提醒气泡；负载不合规返回 false（Chrome 据此退回系统通知）。返回 true 表示气泡已经出现在桌面上。
    func showNudge(_ raw: Any?) -> Bool {
        guard ring == nil, !ringExiting, let next = JellyModel.parseNudge(raw) else { return false }     // 响铃优先：此时 Chrome 退回系统通知
        nudge = next
        nudgePending = nil; nudgeStatus = nil; nudgeClosing = false
        detailTimer?.invalidate(); detailUntil = nil
        armNudgeTimer(after: next.ttl)
        updateVisibility()
        return companion.isVisible
    }

    /// 撤掉指定的气泡（迟到或被替换）；id 不是当前气泡就忽略。Chrome 自己发起的撤销不需要再回报 nudgeHidden。
    func clearNudge(id: String?) {
        guard let current = nudge, id == current.id else { return }
        endNudge(notify: false)
    }

    private func armNudgeTimer(after seconds: TimeInterval) {
        nudgeTimer?.invalidate()
        nudgeTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in self?.endNudge(notify: true) }
    }

    private func endNudge(notify: Bool) {
        guard let current = nudge else { return }
        nudgeTimer?.invalidate(); nudgeTimer = nil
        nudge = nil; nudgePending = nil; nudgeStatus = nil; nudgeClosing = false
        if notify { send?(["type": "nudgeHidden", "id": current.id]) }
        updateVisibility()
    }

    private func nudgeButton(_ action: String) {
        guard let current = nudge, nudgePending == nil, !nudgeClosing, current.buttons.contains(where: { $0.id == action }) else { return }
        let actionID = UUID().uuidString
        nudgePending = actionID
        nudgeStatus = nil
        send?(["type": "nudgeAction", "id": current.id, "actionId": actionID, "action": action])
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self = self, self.nudgePending == actionID, self.nudge?.id == current.id else { return }
            self.nudgePending = nil
            self.nudgeStatus = ("Chrome 尚未确认，请重试", true)
            self.refresh()
        }
    }

    /// Chrome 对气泡按钮的回执：id 与 actionId 都要对得上当前气泡；成功才显示结果并收起，失败保留按钮以便重试。
    func nudgeActionResult(_ message: [String: Any]) {
        guard let current = nudge, message["id"] as? String == current.id,
              let actionID = message["actionId"] as? String, actionID == nudgePending else { return }
        nudgePending = nil
        if message["ok"] as? Bool == true {
            nudgeStatus = (JellyModel.clean(message["text"], max: 40) ?? "好的", false)
            nudgeClosing = true
            armNudgeTimer(after: 2.4)
        } else {
            nudgeStatus = (JellyModel.clean(message["error"], max: 60) ?? "操作失败，请重试", true)
        }
        refresh()
    }

    // MARK: 倒计时上的操作与反馈（延后/跳过由 Chrome 执行；这里只转发并显示结果）

    private func setFeedback(_ text: String, bad: Bool, seconds: TimeInterval) {
        feedback = (String(text.prefix(60)), Date().addingTimeInterval(seconds), bad)
        refresh()
        if ticker != nil && JellyModel.tickInterval(active: tickerNeedsSeconds) != tickerInterval { restartTicker() }
    }

    private var canAct: Bool {
        guard let data = data else { return false }
        return data["canAct"] as? Bool == true && data["alarmId"] is String && data["revision"] is NSNumber
    }

    @objc private func menuDelay() { perform("delay", minutes: 5) }
    @objc private func menuOpen() { perform("open") }
    @objc private func askAssistant() { onAskAssistant?() }
    @objc private func confirmSkip() { perform("skip") }

    func perform(_ action: String, minutes: Int? = nil) {
        guard pendingAction == nil else { return }       // 正在等 Chrome 回执：重复点选一律忽略，不再提交也不改提示
        guard let data = data, let id = data["id"] as? String, let alarmId = data["alarmId"] as? String else {
            setFeedback("这版 Chrome 扩展不支持从倒计时操作", bad: true, seconds: 3)
            return
        }
        let actionID = UUID().uuidString
        pendingAction = actionID
        setFeedback("正在同步到 Chrome…", bad: false, seconds: 8)
        var message: [String: Any] = ["type": "countdownAction", "id": id, "alarmId": alarmId, "actionId": actionID, "action": action, "revision": data["revision"] ?? 0]
        if let minutes = minutes { message["minutes"] = minutes }
        send?(message)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self = self, self.pendingAction == actionID else { return }
            self.pendingAction = nil
            // 倒计时在等待期间已经没了（被隐藏或结束）就不再弹这条提示
            if self.data != nil { self.setFeedback("Chrome 尚未确认，请重试或在浏览器中处理", bad: true, seconds: 4) } else { self.refresh() }
        }
    }

    func actionResult(_ message: [String: Any]) {
        guard let actionID = message["actionId"] as? String, actionID == pendingAction else { return }
        pendingAction = nil
        if message["ok"] as? Bool == true {
            setFeedback(JellyModel.clean(message["text"], max: 60) ?? "已完成", bad: false, seconds: 2.6)
        } else {
            setFeedback(JellyModel.clean(message["error"], max: 60) ?? "操作失败，请重试", bad: true, seconds: 4)
        }
    }

    // MARK: 到点响铃（来自 Chrome 的 show / hide / actionResult；动作交回 Chrome，水母只显示）
    // 水母游到所在屏幕的底部正中，弹出玻璃气泡；点按钮发 action，收到匹配的回执才显示结果；Chrome 是闹钟、稍后提醒与会话结束的唯一所有者。

    private enum RingPhase: String { case none, arriving, shown }

    private(set) var ring: JellyModel.Ring?
    private var ringPhase = RingPhase.none
    private var ringEpoch = 0                           // 每次气泡（重新）弹出 +1：水母据此重播弹出与涟漪
    private var ringClickableAt = Date.distantFuture    // 弹出后 0.5 秒内忽略点击
    private var ringPending: (id: String, action: String)?
    private var ringStatus: (text: String, bad: Bool)?
    private var ringClosing = false                     // 回执已到，正在显示确认语（或失败说明），随后离开
    private var ringHideRequested = false               // Chrome 先结束了会话（hide），回执随后才到：多等一小会儿
    private var ringHomeX: CGFloat?                     // 响铃前水母所在的横坐标；nil 表示本来就不在，响完游走
    private var ringMoved = false                       // 响铃期间用户拖动过：以放下的位置为准
    private var ringReturning = false
    private var ringExiting = false
    private var ringToken = 0                           // 使进行中的游动 / 淡出回调失效
    private var ringTimer: Timer?                       // 确认语时长
    private var ringGraceTimer: Timer?                  // 先 hide 后回执的等待

    /// 显示一次响铃；负载不合规返回 false（Chrome 据此退回系统通知）。返回 true 表示水母已出现在桌面上。
    func showRing(_ raw: Any?) -> Bool {
        guard let next = JellyModel.parseRing(raw) else { return false }
        if let current = ring, current.id == next.id {
            // 同一会话重发（重连后 Chrome 重新 show）：只更新内容，不重播入场，也不重新计防误触
            ring = next
            refresh()
            return companion.isVisible
        }
        let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let replacing = ring != nil
        let leaving = ringReturning || ringExiting      // 上一次响铃的收尾还在途中：沿用最初的“家”
        let wasVisible = companion.isVisible
        let home: CGFloat? = wasVisible ? companion.swim.x : nil
        var fromEdge = !wasVisible
        if wasVisible && !companion.isOnMouseScreen() { companion.hide(remember: false); fromEdge = true }
        cancelRingTimers()
        ringToken += 1
        ring = next
        ringPending = nil; ringStatus = nil; ringClosing = false; ringHideRequested = false
        ringReturning = false; ringExiting = false
        if !replacing && !leaving { ringHomeX = home; ringMoved = false }
        detailTimer?.invalidate(); detailUntil = nil
        feedback = nil
        if fromEdge { companion.startAtRightEdgeOnce = true }
        updateVisibility()
        startArrival(fadeIn: fromEdge)
        onFocusCheck?(frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier)
        return companion.isVisible
    }

    private func startArrival(fadeIn: Bool) {
        ringPhase = .arriving
        ringClickableAt = .distantFuture
        ringToken += 1
        let token = ringToken
        if fadeIn { setAlpha(0, duration: 0); setAlpha(1, duration: reduceMotion ? 0.2 : 0.25) } else { setAlpha(1, duration: 0) }
        refresh()
        companion.dash(toX: companion.centerX) { [weak self] in self?.ringArrived(token) }
    }

    private func ringArrived(_ token: Int) {
        guard ring != nil, ringToken == token, ringPhase == .arriving else { return }
        ringPhase = .shown
        ringEpoch += 1
        ringClickableAt = Date().addingTimeInterval(JellyModel.ringClickGuard)
        refresh()
        announceRing()
    }

    /// 读屏：气泡弹出时播报一次（时间 + 提醒名字），不抢键盘焦点。
    private func announceRing() {
        guard let current = ring else { return }
        let text = JellyModel.ringAnnouncement(clock: current.clock, names: current.names, more: current.more)
        NSAccessibility.post(element: companion.view, notification: .announcementRequested,
                             userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.high.rawValue])
    }

    /// 气泡里的按钮：响铃气泡走响铃动作入口，其余是喝水/起身提醒的按钮。
    private func bubbleButton(_ id: String) {
        if ring != nil { ringButton(id) } else { nudgeButton(id) }
    }

    /// 气泡按钮（也是隔离验收钩子的入口）：返回是否真的发出了动作。弹出后 0.5 秒内、等待回执期间、确认语期间都忽略。
    @discardableResult
    func ringButton(_ action: String?) -> Bool {
        guard let action = action, JellyModel.ringActions.contains(action), let current = ring, ringPhase == .shown,
              ringPending == nil, !ringClosing, Date() >= ringClickableAt, action == "dismiss" || current.canSnooze else { return false }
        let actionID = UUID().uuidString
        ringPending = (actionID, action)
        ringStatus = nil
        send?(["type": "action", "sessionId": current.id, "actionId": actionID, "action": action, "minutes": current.snoozeMinutes])
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + JellyModel.ringNoAck) { [weak self] in
            guard let self = self, self.ringPending?.id == actionID, self.ring?.id == current.id else { return }
            self.ringPending = nil
            self.ringStatus = ("Chrome 尚未确认，请重试或在浏览器中处理", true)
            self.refresh()
        }
        return true
    }

    /// Chrome 对按钮动作的回执：sessionId 与 actionId 都要对得上；成功才显示确认语，失败保留按钮以便重试。
    func ringActionResult(_ message: [String: Any]) {
        guard let current = ring, message["sessionId"] as? String == current.id,
              let pending = ringPending, message["actionId"] as? String == pending.id else { return }
        ringPending = nil
        ringGraceTimer?.invalidate(); ringGraceTimer = nil
        if message["ok"] as? Bool == true {
            ringStatus = (JellyModel.ringConfirm(action: pending.action, minutes: current.snoozeMinutes), false)
            beginRingFarewell()
        } else {
            ringStatus = (JellyModel.clean(message["error"], max: 60) ?? "操作失败，请重试", true)
            if ringHideRequested { beginRingFarewell() } else { refresh() }   // 会话已被 Chrome 结束，重试没有意义：显示原因后离开
        }
    }

    private func beginRingFarewell() {
        ringClosing = true
        ringTimer?.invalidate()
        ringTimer = Timer.scheduledTimer(withTimeInterval: JellyModel.ringFarewell, repeats: false) { [weak self] _ in self?.finishRing() }
        refresh()
    }

    /// Chrome 结束了这次会话（在别处处理了，或自己处理完动作）。Chrome 的真实顺序是先 hide、后回执：
    /// 有等待中的动作就再等回执（最多 ringHideGrace 秒）并显示确认语；没有就直接收尾，不显示确认语。
    func hideRing(id: String?) {
        guard let current = ring, id == current.id, !ringClosing else { return }
        if ringPending != nil {
            guard !ringHideRequested else { return }
            ringHideRequested = true
            ringGraceTimer?.invalidate()
            ringGraceTimer = Timer.scheduledTimer(withTimeInterval: JellyModel.ringHideGrace, repeats: false) { [weak self] _ in
                guard let self = self, self.ring?.id == current.id, !self.ringClosing else { return }
                self.ringPending = nil
                self.finishRing()
            }
            return
        }
        finishRing()
    }

    private func cancelRingTimers() {
        ringTimer?.invalidate(); ringTimer = nil
        ringGraceTimer?.invalidate(); ringGraceTimer = nil
    }

    /// 收尾：常驻或仍有倒计时 / 提醒 → 游回响铃前的位置（用户拖动过就留在放下的位置）；否则游向右边后消失。
    private func finishRing() {
        guard ring != nil else { return }
        cancelRingTimers()
        ring = nil; ringPhase = .none; ringPending = nil; ringStatus = nil; ringClosing = false; ringHideRequested = false
        ringToken += 1
        let token = ringToken
        if JellyModel.shouldShow(resident: resident, hasCountdown: data != nil, ringing: false, hasNudge: nudge != nil) {
            if !ringMoved, let home = ringHomeX {
                ringReturning = true
                refresh()
                companion.dash(toX: home) { [weak self] in self?.ringReturned(token) }
            } else {
                ringHomeX = nil
                refresh()
            }
            restartTicker()
        } else {
            ringHomeX = nil
            ringExiting = true
            refresh()
            companion.dash(toX: companion.rightEdgeX) { [weak self] in self?.fadeOutAndHide(token) }
        }
    }

    private func ringReturned(_ token: Int) {
        guard ringToken == token, ringReturning else { return }
        ringReturning = false
        ringHomeX = nil
        refresh()
    }

    private func fadeOutAndHide(_ token: Int) {
        guard ringToken == token, ringExiting else { return }
        setAlpha(0, duration: reduceMotion ? 0.2 : 0.25) { [weak self] in
            guard let self = self, self.ringToken == token, self.ringExiting else { return }
            self.ringExiting = false
            if JellyModel.shouldShow(resident: self.resident, hasCountdown: self.data != nil, ringing: false, hasNudge: self.nudge != nil) {
                self.setAlpha(1, duration: 0)       // 淡出期间别的内容需要水母了：留在原地
                self.refresh()
            } else {
                self.stopTicker()
                self.companion.hide(remember: false)   // 响铃自身不改写记住的位置
                self.setAlpha(1, duration: 0)
            }
        }
    }

    /// 状态栏“显示当前提醒”：响铃进行中把水母重新游到落点并重播弹出；没有响铃时只是刷新可见性。
    func replayRing() {
        guard ring != nil else { updateVisibility(); return }
        ringMoved = false
        startArrival(fadeIn: false)
    }

    private func grabBegan() {
        if ring != nil { ringMoved = true }
        if ringReturning || ringExiting {
            ringToken += 1
            ringReturning = false; ringExiting = false
            setAlpha(1, duration: 0)
        }
    }

    private func grabEnded() {
        if ring != nil, ringPhase == .arriving { ringArrived(ringToken) }   // 还没游到落点就被抓走：放下的位置就是落点
        updateVisibility()
    }

    /// 窗口透明度；duration 为 0 时同时打断正在进行的淡入淡出。
    private func setAlpha(_ value: CGFloat, duration: TimeInterval, completion: (() -> Void)? = nil) {
        let panel = companion.panel
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = duration
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = value
        }, completionHandler: completion)
        if duration <= 0 { panel.alphaValue = value }
    }

    // MARK: 菜单动作

    /// 隐藏倒计时（不取消闹钟）：水母若是常驻的就留下，否则退场。
    @objc private func hideTapped() { hideRequested() }

    func hideRequested() {
        guard let id = data?["id"] as? String else { return }
        data = nil
        feedback = nil
        updateVisibility()
        send?(["type": "countdownHidden", "id": id])
    }

    /// 收起水母：只把“不再常驻”交回 Chrome 保存；水母要等 Chrome 推来新状态才消失（原生不替 Chrome 改设置）。
    @objc private func collapseJelly() { send?(["type": "jellySetting", "resident": false]) }

    @objc private func dismissNudge() { endNudge(notify: true) }

    // MARK: 菜单

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        func add(_ text: String, _ action: Selector?, enabled: Bool = true) -> NSMenuItem {
            let item = menu.addItem(withTitle: text, action: action, keyEquivalent: "")
            item.target = self
            item.isEnabled = enabled && (action != nil)
            return item
        }
        var sections = 0
        func newSection() { if sections > 0 { menu.addItem(.separator()) }; sections += 1 }
        if let title = assistantMenuTitle {
            newSection()
            _ = add(title, #selector(askAssistant))
        }
        if data != nil && ring == nil {
            newSection()
            if let items = data?["items"] as? [[String: Any]], items.count > 0 {
                _ = add("接下来", nil, enabled: false)
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "zh_CN")
                for entry in items.prefix(5) {
                    guard let at = entry["fireAt"] as? Double else { continue }
                    let name = JellyModel.clean(entry["title"], max: 18) ?? "闹钟"
                    let date = Date(timeIntervalSince1970: at / 1000)
                    formatter.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "M月d日 HH:mm"
                    let seconds = max(0, Int(ceil(at / 1000 - Date().timeIntervalSince1970)))
                    let item = menu.addItem(withTitle: "\(formatter.string(from: date))  \(name)  ·  \(relativeText(seconds))", action: nil, keyEquivalent: "")
                    item.isEnabled = false
                    item.indentationLevel = 1
                }
                menu.addItem(.separator())
            }
            if canAct && (remainingSeconds()?.whole ?? 0) > 10 {
                _ = add("延后 5 分钟", #selector(menuDelay))
                let skip = add("跳过本次", nil)
                skip.isEnabled = true
                let submenu = NSMenu()
                let confirm = submenu.addItem(withTitle: "确认跳过这一次提醒", action: #selector(confirmSkip), keyEquivalent: "")
                confirm.target = self
                skip.submenu = submenu
            }
            _ = add("在 Chrome 中打开闹钟中心", #selector(menuOpen))
            _ = add("隐藏倒计时（不取消闹钟）", #selector(hideTapped))
        } else if !visibleLines.isEmpty {
            newSection()
            for line in visibleLines { _ = add(line, nil, enabled: false) }
        }
        if nudge != nil {
            newSection()
            _ = add("收起提醒气泡", #selector(dismissNudge))
        }
        if resident {
            newSection()
            _ = add("收起水母", #selector(collapseJelly))
        }
        if menu.items.isEmpty { _ = add("桌面水母", nil, enabled: false) }
    }

    // MARK: 读数（协议回执与验收脚本用）

    /// 仅隔离验收用：按完整标题找到右键菜单项（含子菜单）并执行，走与 AppKit 点选相同的 sendAction 路径；
    /// 找不到、被禁用或没有动作返回 false。正式使用不会调用（main.swift 要求环境变量 TIMEKEEPER_TEST_HOOKS=1）。
    func chooseMenuItem(_ title: String?) -> Bool {
        guard let title = title else { return false }
        let scratch = NSMenu()
        menuNeedsUpdate(scratch)
        func find(_ menu: NSMenu) -> NSMenuItem? {
            for item in menu.items {
                // 带子菜单的条目只是入口（AppKit 会给它自动配 submenuAction:，控制器并不响应），只在子菜单里找可执行项
                if let sub = item.submenu { if let hit = find(sub) { return hit }; continue }
                if item.title == title && item.isEnabled && item.action != nil { return item }
            }
            return nil
        }
        guard let item = find(scratch), let action = item.action,
              let target = item.target as? NSObjectProtocol, target.responds(to: action) else { return false }
        return NSApp.sendAction(action, to: item.target, from: item)
    }

    /// 当前右键菜单的条目文字（分隔线为 "---"），供隔离验收核对，不弹出菜单。
    func menuTitles() -> [String] {
        let scratch = NSMenu()
        menuNeedsUpdate(scratch)
        return scratch.items.map { $0.isSeparatorItem ? "---" : $0.title }
    }

    var visible: Bool { companion.isVisible }
    var countdownVisible: Bool { companion.isVisible && data != nil && ring == nil }
    var timeText: String { lastClock }
    var titleText: String { titleValue }
    var windowNumber: Int { companion.panel.windowNumber }
    var frameString: String { NSStringFromRect(companion.panel.frame) }
    var shownLines: [String] { visibleLines }
    var nudgeID: String? { nudge?.id }
    var nudgeBusy: Bool { nudgePending != nil }
    var ringActive: Bool { ring != nil }
    var ringVisible: Bool { ring != nil && companion.isVisible }
    var ringID: String? { ring?.id }
    var ringBusy: Bool { ringPending != nil }
    var ringPhaseName: String { ring == nil ? "none" : ringPhase.rawValue }
    var ringStatusText: String { ringStatus?.text ?? (ringPending != nil ? "正在同步到 Chrome…" : "") }
    /// 气泡里的大号时间与标题各行（经解析、清洗、截断后真正显示的内容），验收脚本据此核对 Chrome 发来的 clock / labels 是否生效。
    var ringClockText: String { ring?.clock ?? "" }
    var ringLinesShown: [String] { ring.map { JellyModel.ringTitleLines(names: $0.names, more: $0.more) } ?? [] }
    var laneString: String { NSStringFromRect(companion.laneRect) }
    var bubbleRectString: String { companion.view.bubbleRectString() }
    var appearanceName: String { companion.view.appearanceName }
    /// 响铃气泡里各按钮的屏幕位置（NSStringFromRect 格式）；当前不是响铃气泡时为空。
    func ringButtonFrames() -> [String: String] {
        lastBubble == .ring ? companion.view.buttonScreenFrames().mapValues { NSStringFromRect($0) } : [:]
    }
    var bubbleName: String {
        switch lastBubble {
        case .none: return "none"
        case .clock: return "clock"
        case .detail: return "detail"
        case .note: return "note"
        case .nudge: return "nudge"
        case .ring: return "ring"
        }
    }
    /// 提醒气泡里各按钮的屏幕位置（NSStringFromRect 格式），验收脚本据此做真实点击；当前不是提醒气泡时为空。
    func nudgeButtonFrames() -> [String: String] {
        lastBubble == .nudge ? companion.view.buttonScreenFrames().mapValues { NSStringFromRect($0) } : [:]
    }
}
