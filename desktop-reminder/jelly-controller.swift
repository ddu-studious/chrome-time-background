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
    private var nudgeArriving = false           // 差事气泡：水母还在游向你，到位之前气泡不出现、按钮不可点
    private var nudgeToken = 0                  // 使过期的“到位”回调（被替换、被撤、被响铃或被用户抓走）失效
    // 右键菜单“水母，给我…”（协议 v9）：由 jelly 命令的 errands 字段开启；同一时刻只有一个请求在等 Chrome 回执
    private var errandsMenu = false
    private var errandRequestPending: String?
    /// 请求发出后等回执的上限：Chrome 取歌最多等 6 秒，再留些余量；超过就提示可重试（迟到的回执按 requestId 不匹配而忽略）。
    static let errandRequestNoAck = 15.0
    // 活动行为（协议 v10）：差事开且 patrol 开时，水母白天保持清醒、偶尔巡游一圈、清醒静止时隔一阵做个小动作；
    // 睡与不睡、什么时候游都由 JellyBehavior 的纯逻辑决定，这里只是状态机。全是水母自己的动作：不产生业务数据，也不向 Chrome 回报。
    private var lively = false                          // jelly 命令 errands.enabled 与 errands.patrol 都严格为 true
    private var idleSeconds: Double?                    // main.swift 每 15 秒交来的系统空闲秒数；nil 表示不知道（当作在电脑前）
    private var menuOpenSince: Date?                    // 右键菜单打开中（menuWillOpen 起）；JellyBehavior.menuBlocks 只让路 180 秒，超过当作遗漏的 menuDidClose
    private var patrolTimer: Timer?                     // 等待出发 / 巡游时长，同一时刻只有一个
    private var fidgetTimer: Timer?                     // 清醒静止时下一次小动作
    private var recheckTimer: Timer?                    // 只因鼠标停在水母身上而暂时不能行动时，隔几秒再核对一次（鼠标移开没有事件通知）
    private var patrolTuning: JellyTuning?
    private(set) var patrolling = false
    private(set) var patrolCount = 0                    // 本进程开始过多少次巡游（验收诊断，不上报）
    private(set) var fidgetCount = 0                    // 本进程做过多少次小动作（验收诊断，不上报）
    private(set) var patrolPace = 0.0                   // 最近一次巡游用的游速倍率，0 表示还没巡游过（验收诊断，不上报）
    private(set) var personalityID = "steady"           // 最近一次安排计时器时的时段性格（验收诊断）
    /// 仅隔离验收：TIMEKEEPER_TEST_HOOKS=1 时环境变量 TIMEKEEPER_PATROL_SECONDS="出发,时长,小动作"（秒）替换随机取值，让验收不必等几分钟；
    /// 正式使用时恒为 nil。
    private let overrides: JellyBehavior.Overrides? = {
        let env = ProcessInfo.processInfo.environment
        return env["TIMEKEEPER_TEST_HOOKS"] == "1" ? JellyBehavior.parseOverrides(env["TIMEKEEPER_PATROL_SECONDS"]) : nil
    }()
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
        errandsMenu = state.errands
        lively = state.patrol
        updateVisibility()
        return true
    }

    /// Chrome 下发的外观（已是具体值）：解析成白名单值交给水母；非法字段回默认，永不失败。
    /// 没带 appearance 的 jelly 命令不会调用这里（Chrome 读取外观失败时水母保持上一次，不闪回默认）。
    func setAppearance(_ raw: Any?) {
        companion.setAppearance(JellyAppearance.parse(raw))
    }

    /// 验收诊断：当前外观（色位/花纹/材质/尺寸/节日）。注意与 ping 里的 jellyAppearance（系统浅/深外观）不是一回事。
    var lookSummary: String {
        let a = companion.appearance
        return "colors=\(a.colors.map(String.init).joined(separator: ",")) look=\(a.look.rawValue) material=\(a.material.rawValue) size=\(a.size.rawValue) season=\(a.season ?? "-")"
    }
    /// 实际生效的物种（jelly/hammer/…）：设置的动物还没有几何数据时是 jelly。jelly 命令的回执与 ping 都报告它，Chrome 据此判断是否真的按设置应用。
    var speciesName: String { companion.effectiveSpecies.rawValue }
    /// 验收诊断：动物的姿态（朝向 −1…1、俯仰弧度、划水相位 −1…1）与游动速度（点/秒）；水母恒为 1 / 0 / 0。
    var poseSummary: String {
        let p = companion.pose
        return "facing=\(String(format: "%.3f", Double(p.facing))) pitch=\(String(format: "%.3f", Double(p.pitch))) wave=\(String(format: "%.3f", Double(p.wave))) vx=\(String(format: "%.1f", Double(companion.swim.vx))) vy=\(String(format: "%.1f", Double(companion.swim.vy)))"
    }
    /// 验收诊断：运行中的游动调参（周期、横/纵冲量、下沉、横/纵阻力、愿意停留的高度）。用来核对“动物按自己的系数游、水母按原来的”
    /// 确实接到了正在运行的游动上（每次刷新与换物种时都要按实际生效的物种重新取）。
    var tuningSummary: String {
        let t = companion.swim.tuning
        func f(_ value: CGFloat) -> String { String(format: "%.3f", Double(value)) }
        return "period=\(f(t.period)) thrustX=\(f(t.thrustX)) thrustY=\(f(t.thrustY)) sink=\(f(t.sink)) dragX=\(f(t.dragX)) dragY=\(f(t.dragY)) hover=\(f(t.hover))"
    }
    /// 验收诊断：水母窗口的标题与读屏名称（实际生效的物种名，如“桌面小锤头鲨”）。
    var titleSummary: String { companion.panel.title }
    var labelSummary: String { companion.view.accessibilityLabel() ?? "" }
    /// 验收诊断：当前颜料主色（阶段覆盖与换色据此核对）。
    var paintSummary: String {
        let t = companion.pose.paint.a
        return String(format: "%.3f,%.3f,%.3f", Double(t.r), Double(t.g), Double(t.b))
    }
    /// 验收诊断：当前 tint（光晕、涟漪、睡觉标记与气泡边框的颜色）。约定它始终等于 paint.a，冒烟据此核对。
    var tintSummary: String {
        let t = companion.pose.tint
        return String(format: "%.3f,%.3f,%.3f", Double(t.r), Double(t.g), Double(t.b))
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
            cancelBehavior()
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

    private var tickerNeedsSeconds: Bool { (data != nil && ring == nil) || nudge != nil || feedback != nil || patrolling }

    private func remainingSeconds() -> (exact: Double, whole: Int)? {
        guard let at = data?["fireAt"] as? Double else { return nil }
        let exact = at / 1000 - Date().timeIntervalSince1970
        return (exact, max(0, Int(ceil(exact))))
    }

    private func relativeText(_ seconds: Int) -> String {
        CountdownModel.spoken(seconds: seconds).replacingOccurrences(of: "还有 ", with: "") + (seconds > 0 ? "后" : "")
    }

    /// 本地小时；隔离验收可用环境变量 TIMEKEEPER_NIGHT_HOUR=23 假定本地时间（只用于测试），夜晚荧光、睡觉与时段性格共用这一个读数。
    private func localHour(_ now: Date) -> Double {
        Double(ProcessInfo.processInfo.environment["TIMEKEEPER_NIGHT_HOUR"] ?? "") ?? CountdownModel.localHour(now)
    }

    /// 夜晚荧光程度：受“夜晚荧光”开关控制。
    private func nightAmount(_ now: Date) -> CGFloat {
        guard night else { return 0 }
        return CGFloat(CountdownModel.nightAmount(hour: localHour(now)))
    }

    /// 睡觉用的夜晚曲线值：不看“夜晚荧光”开关（荧光是视觉效果，睡觉是行为）。
    private func sleepNightAmount(_ now: Date) -> Double { CountdownModel.nightAmount(hour: localHour(now)) }

    /// 活动行为只对常驻的水母有意义：Chrome 在不常驻时本来就不带 errands，原生这里再认一次（临时出现的水母仍是老样子）。
    private func isSleeping(_ now: Date) -> Bool {
        JellyBehavior.isAsleep(lively: lively && resident, nightAmount: sleepNightAmount(now), idleSeconds: idleSeconds)
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
        let kind = JellyModel.bubbleKind(ringing: ring != nil, ringArrived: ringPhase == .shown, hasNudge: nudge != nil && !nudgeArriving, hasNote: feedback != nil, detailActive: detailUntil != nil, hasCountdown: remaining != nil)
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
                let buttons = nudgeClosing ? [] : current.buttons.map { JellyBubble.Button(id: $0.id, title: $0.title, enabled: nudgePending == nil, primary: JellyModel.isPrimaryNudgeButton(kind: current.kind, id: $0.id)) }
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
        // 活动行为：先按最新状态决定巡游 / 小动作（可能结束正在进行的巡游），再把结果交给水母。
        // 睡不睡只影响“休息时是否合眼”：活动行为关闭时 isAsleep 恒为真，awake 与旧版完全一样。
        syncBehavior(now, stage: stage)
        let sleeping = isSleeping(now)
        companion.update(JellyInfo(stage: ringing ? .due : stage, night: nightValue, bubble: bubble, awake: kind > .clock || ringing || !sleeping,
                                   rest: (ringing || ringExiting || stage == .calm || nudge != nil) && !patrolling,
                                   ripples: ringing && ringPhase == .shown, ringEpoch: ringEpoch,
                                   patrol: patrolling ? patrolTuning : nil), reduceMotion: reduceMotion)
        if ticker != nil && JellyModel.tickInterval(active: tickerNeedsSeconds) != tickerInterval { restartTicker() }
    }

    // MARK: 活动行为（协议 v10）：睡与不睡、巡游、小动作

    /// main.swift 每 15 秒交来系统空闲秒数（nil：读不到）。睡觉与巡游资格可能因此变化时才刷新，平时不额外刷新。
    func noteIdle(_ seconds: Double?) {
        let now = Date()
        let before = (isSleeping(now), behaviorEligible(now, stage: currentStage()))
        idleSeconds = seconds
        guard companion.isVisible else { return }
        let after = (isSleeping(now), behaviorEligible(now, stage: currentStage()))
        if before != after { refresh() }
    }

    func menuWillOpen(_ menu: NSMenu) {
        menuOpenSince = Date()
        refresh()
    }

    func menuDidClose(_ menu: NSMenu) {
        menuOpenSince = nil
        refresh()
    }

    /// 仅隔离验收（main.swift 要求 TIMEKEEPER_TEST_HOOKS=1）：走与 AppKit 打开 / 关闭右键菜单相同的委托入口，让验收不依赖真实菜单弹出。
    func setMenuTracking(_ open: Bool) {
        if open { menuWillOpen(menu) } else { menuDidClose(menu) }
    }

    private func currentStage() -> CountdownStage {
        guard data != nil, ring == nil, let remaining = remainingSeconds() else { return .calm }
        return CountdownModel.stage(seconds: remaining.whole)
    }

    /// “忙”：任何不该被水母自己的动作打扰的状态。时钟读数气泡不算（有闹钟时它一直在）。
    /// 鼠标停在水母身上单列（includePointer）：只有它没有“结束”事件可等，要靠定时再核对。
    private func behaviorBusy(_ now: Date, includePointer: Bool = true) -> Bool {
        if ring != nil || ringExiting || ringReturning || nudge != nil || feedback != nil || detailUntil != nil { return true }
        if companion.swim.mode == .grabbed || (includePointer && companion.isPointerOver) { return true }
        return JellyBehavior.menuBlocks(openedSecondsAgo: menuOpenSince.map { now.timeIntervalSince($0) })
    }

    private func patrolContext(_ now: Date, stage: CountdownStage, includePointer: Bool = true) -> JellyBehavior.PatrolContext {
        JellyBehavior.PatrolContext(lively: lively, resident: resident, reduceMotion: reduceMotion, stage: stage, busy: behaviorBusy(now, includePointer: includePointer),
                                    nightAmount: sleepNightAmount(now), idleSeconds: idleSeconds)
    }

    /// 现在能不能做“自己的动作”（巡游或小动作）：水母在屏幕上，且 JellyBehavior.canPatrol 为真。
    private func behaviorEligible(_ now: Date, stage: CountdownStage) -> Bool {
        companion.isVisible && JellyBehavior.canPatrol(patrolContext(now, stage: stage))
    }

    /// 每次刷新时调用：条件不再满足就取消等待并结束巡游，条件满足而没有计时器就安排一个（回来后重新计一段完整的等待）。
    private func syncBehavior(_ now: Date, stage: CountdownStage) {
        let eligible = behaviorEligible(now, stage: stage)
        if patrolling {
            if !eligible { endPatrol(refresh: false) }        // 水母沉回泳线并静止；外层 refresh 随后把结果交给水母
        } else if eligible {
            if patrolTimer == nil { schedulePatrol(now) }
        } else if patrolTimer != nil {
            patrolTimer?.invalidate(); patrolTimer = nil
        }
        if eligible && !patrolling {
            if fidgetTimer == nil { scheduleFidget(now) }
        } else {
            cancelFidget()
        }
        // 唯一的阻碍是鼠标停在水母身上：鼠标移开没有事件通知，隔 3 秒再核对一次（其余“忙”都有各自的结束事件或 1 秒刷新）
        let pointerOnly = !eligible && companion.isVisible && companion.isPointerOver
            && JellyBehavior.canPatrol(patrolContext(now, stage: stage, includePointer: false))
        if pointerOnly {
            if recheckTimer == nil {
                let timer = Timer(timeInterval: 3, repeats: false) { [weak self] _ in self?.recheckTimer = nil; self?.refresh() }
                timer.tolerance = 0.5
                RunLoop.main.add(timer, forMode: .common)
                recheckTimer = timer
            }
        } else {
            recheckTimer?.invalidate(); recheckTimer = nil
        }
    }

    private func schedulePatrol(_ now: Date) {
        let personality = JellyBehavior.personality(hour: localHour(now))
        personalityID = personality.id
        guard let plan = personality.patrol else { return }       // 夜里没有巡游（canPatrol 已经排除，这是第二道）
        let seconds = JellyBehavior.patrolDelaySeconds(plan, unit: Double.random(in: 0...1), overrides: overrides)
        let timer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in self?.patrolDue() }
        timer.tolerance = min(5, seconds * 0.1)
        RunLoop.main.add(timer, forMode: .common)
        patrolTimer = timer
    }

    /// 出发时间到：再核对一遍条件，满足才出发。
    private func patrolDue() {
        patrolTimer = nil
        let now = Date()
        guard behaviorEligible(now, stage: currentStage()), let plan = JellyBehavior.personality(hour: localHour(now)).patrol else {
            refresh()       // 条件变了：按新状态重新安排或不安排
            return
        }
        patrolling = true
        patrolCount += 1
        patrolPace = plan.pace                              // 验收诊断同时就是游动调校的输入，两者不会各取各的
        patrolTuning = JellyTuning.patrol(pace: patrolPace)
        cancelFidget()
        let seconds = JellyBehavior.patrolDurationSeconds(plan, unit: Double.random(in: 0...1), overrides: overrides)
        let timer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in self?.endPatrol(refresh: true) }
        timer.tolerance = 0.2
        RunLoop.main.add(timer, forMode: .common)
        patrolTimer = timer
        refresh()               // 巡游期间 tickerNeedsSeconds 为真：refresh 会把刷新改成每秒一次（鼠标靠近、菜单、气泡……都在这里被核对），结束后回到 30 秒
    }

    /// 结束巡游：让水母沉回泳线（不游回原位）。自然结束与被打断都走这里；refresh 为 false 时由调用方负责随后刷新。
    private func endPatrol(refresh doRefresh: Bool) {
        patrolTimer?.invalidate(); patrolTimer = nil
        guard patrolling else { return }
        patrolling = false
        patrolTuning = nil
        if doRefresh { refresh() }
    }

    private func scheduleFidget(_ now: Date) {
        guard let range = JellyBehavior.personality(hour: localHour(now)).fidget else { return }
        let seconds = JellyBehavior.fidgetSeconds(range, unit: Double.random(in: 0...1), overrides: overrides)
        let timer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in self?.fidgetDue() }
        timer.tolerance = min(3, seconds * 0.1)
        RunLoop.main.add(timer, forMode: .common)
        fidgetTimer = timer
    }

    private func cancelFidget() { fidgetTimer?.invalidate(); fidgetTimer = nil }

    /// 小动作：原地小跳一下（同“点一下”的跳，不弹气泡）。条件不满足就不跳；随后 refresh 重新安排下一次。
    private func fidgetDue() {
        fidgetTimer = nil
        let now = Date()
        if !patrolling, behaviorEligible(now, stage: currentStage()) {
            fidgetCount += 1
            companion.jump()
        }
        refresh()
    }

    /// 水母被隐藏或设置被关掉：清掉所有计时器与巡游状态，下次出现时重新计。
    private func cancelBehavior() {
        patrolTimer?.invalidate(); patrolTimer = nil
        recheckTimer?.invalidate(); recheckTimer = nil
        cancelFidget()
        patrolling = false
        patrolTuning = nil
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
        // 差事（协议 v8）先游到你所在的屏幕再开口：水母不在鼠标所在屏幕（或根本没出现）就从该屏右边游入，已经在这块屏幕上则原地不动；
        // 喝水/起身提醒保持原样（立即出现）。到位之前返回 true 只表示“已接手”，Chrome 据此不再发系统通知。
        let errand = JellyModel.isErrandKind(next.kind)
        let wasVisible = companion.isVisible
        let moves = errand && (!wasVisible || !companion.isOnMouseScreen())
        if moves && wasVisible { companion.hide(remember: false) }
        if moves { companion.startAtRightEdgeOnce = true }
        nudgeToken += 1
        nudge = next
        nudgeArriving = moves
        nudgePending = nil; nudgeStatus = nil; nudgeClosing = false
        detailTimer?.invalidate(); detailUntil = nil
        armNudgeTimer(after: next.ttl)
        updateVisibility()
        if moves { startNudgeArrival(fadeIn: true) }
        else if errand { announceNudge() }
        return companion.isVisible
    }

    private func startNudgeArrival(fadeIn: Bool) {
        let token = nudgeToken
        if fadeIn { setAlpha(0, duration: 0); setAlpha(1, duration: reduceMotion ? 0.2 : 0.25) }
        refresh()
        companion.dash(toX: companion.centerX) { [weak self] in self?.nudgeArrived(token) }
        // 到位回调在被用户抓住或被别的冲刺替换时不会触发：兜底，最多多等 4 秒就开口（同一个 token，已到位则无事发生）
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.nudgeArrived(token) }
    }

    private func nudgeArrived(_ token: Int) {
        guard nudge != nil, nudgeToken == token, nudgeArriving else { return }
        nudgeArriving = false
        refresh()
        announceNudge()
    }

    /// 读屏：差事气泡出现时播报一次（标题 + 正文），不抢键盘焦点。
    private func announceNudge() {
        guard let current = nudge else { return }
        NSAccessibility.post(element: companion.view, notification: .announcementRequested,
                             userInfo: [.announcement: "\(current.title)，\(current.text)", .priority: NSAccessibilityPriorityLevel.medium.rawValue])
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
        nudgeArriving = false; nudgeToken += 1
        if notify { send?(["type": "nudgeHidden", "id": current.id]) }
        updateVisibility()
    }

    private func nudgeButton(_ action: String) {
        guard let current = nudge, !nudgeArriving, nudgePending == nil, !nudgeClosing, current.buttons.contains(where: { $0.id == action }) else { return }
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

    // MARK: 右键菜单“水母，给我…”（协议 v9：只转发请求；内容由 Chrome 决定，经 nudge 命令回来；这里只显示结果）

    @objc private func requestErrand(_ sender: NSMenuItem) {
        guard let kind = sender.representedObject as? String else { return }
        sendErrandRequest(kind)
    }

    /// 向 Chrome 要一条差事。没有开启差事菜单、响铃中、上一个请求还在等回执、类别不在菜单里，都不发。
    private func sendErrandRequest(_ kind: String) {
        guard errandsMenu, ring == nil, !ringExiting, errandRequestPending == nil, JellyModel.isErrandRequestKind(kind) else { return }
        let errandID = UUID().uuidString
        errandRequestPending = errandID
        setFeedback("稍等，水母在准备…", bad: false, seconds: Self.errandRequestNoAck)
        send?(["type": "errandRequest", "errandId": errandID, "kind": kind])
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.errandRequestNoAck) { [weak self] in
            guard let self = self, self.errandRequestPending == errandID else { return }
            self.errandRequestPending = nil
            self.setFeedback("Chrome 没有回应，请重试", bad: true, seconds: 4)
        }
    }

    /// Chrome 对菜单请求的回执：errandId 要对得上未决请求。ok 且没有文字说明气泡已经由 nudge 命令呈现（只清掉“正在准备”）；
    /// ok 带文字是“没有内容可说”；失败显示原因。请求编号叫 errandId 而不是 requestId：requestId 是“命令 → 回执”的关联键，
    /// main.swift 的 respond 会把它原样写进回执，结果命令若也带 requestId，回执就被标成了菜单请求的编号，等回执的一方永远等不到。
    func errandRequestResult(_ message: [String: Any]) {
        guard let errandID = message["errandId"] as? String, errandID == errandRequestPending else { return }
        errandRequestPending = nil
        if message["ok"] as? Bool == true {
            if let text = JellyModel.clean(message["text"], max: 60) { setFeedback(text, bad: false, seconds: 4) }
            else { feedback = nil; refresh() }
        } else {
            setFeedback(JellyModel.clean(message["error"], max: 60) ?? "没能完成，请重试", bad: true, seconds: 5)
        }
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
        nudgeArriving = false; nudgeToken += 1       // 响铃接管冲刺：差事气泡不再等“到位”
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

    /// 仅隔离验收（TIMEKEEPER_TEST_HOOKS=1）：经提醒气泡按钮的真实入口发动作，返回动作是否真的发出（到位前、等回执时、收起中都不发）。
    func pressNudge(_ id: String?) -> Bool {
        guard let id = id, nudge != nil, ring == nil, nudgePending == nil else { return false }
        nudgeButton(id)
        return nudgePending != nil
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
        endPatrol(refresh: false)       // 被用户抓住：巡游立刻结束（放手后由 refresh 重新安排）
        cancelFidget()
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
        // “问 AI…”与“水母，给我…”是同一类入口：放在同一段里，谁有谁出现
        let errandsAvailable = errandsMenu && ring == nil && !ringExiting
        if assistantMenuTitle != nil || errandsAvailable { newSection() }
        if let title = assistantMenuTitle { _ = add(title, #selector(askAssistant)) }
        if errandsAvailable {
            let parent = add("水母，给我…", nil)
            parent.isEnabled = true
            let submenu = NSMenu()
            for entry in JellyModel.errandRequestItems {
                let item = submenu.addItem(withTitle: entry.title, action: #selector(requestErrand(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = entry.kind
                item.isEnabled = errandRequestPending == nil      // 上一个请求还在等 Chrome 时不能再点
            }
            parent.submenu = submenu
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
            _ = add("收起\(companion.effectiveSpecies.displayName)", #selector(collapseJelly))
        }
        if menu.items.isEmpty { _ = add(companion.effectiveSpecies.desktopTitle, nil, enabled: false) }
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
    var errandsMenuOn: Bool { errandsMenu }                              // 验收诊断：jelly 命令是否开启了差事菜单
    var errandRequestBusy: Bool { errandRequestPending != nil }          // 验收诊断：有请求在等 Chrome 回执
    var feedbackText: String { feedback?.text ?? "" }                    // 验收诊断：当前反馈气泡文字（含“没有内容可说”“失败原因”）
    var livelyOn: Bool { lively }                                        // 验收诊断（协议 v10）：活动行为是否开启
    var swimPeriod: Double { Double(companion.swim.tuning.period) }      // 验收诊断：水母此刻实际在用的脉动周期（巡游时 = 1.4 / 游速，否则按倒计时阶段挑的那份）
    var asleepNow: Bool { companion.pose.asleep }                        // 验收诊断：水母此刻是不是合着眼睡着
    var nudgeIsArriving: Bool { nudgeArriving }
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
