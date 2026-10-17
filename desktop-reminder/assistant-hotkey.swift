import AppKit
import Carbon.HIToolbox

// 桌面 AI 助手的全局快捷键：Carbon RegisterEventHotKey 的薄封装。
// 这是 macOS 上不需要“辅助功能 / 输入监控”权限的公开热键 API；系统只在热键被按下时通知本进程，进程读不到任何其他按键内容。
// 只管注册、注销与结果映射，什么时候该注册（设置里启用 + 常驻）由 Chrome 经 jelly.assistant 决定，面板怎么显示在 assistant-panel.swift。
// 语法、键码、状态映射都是纯逻辑，在 assistant-model.swift 里自测；这里只有 Carbon 调用，靠隔离冒烟（合成热键按下）验收。
final class AssistantHotkey {
    var onPressed: (() -> Void)?
    private(set) var registered: AssistantModel.Hotkey?
    private(set) var status = AssistantModel.HotkeyStatus.off
    /// 系统把已注册热键递给本进程的次数（只数自己注册的那一个组合；不读也不记任何别的按键）。仅验收诊断：停用 / 换键 / 非法之后系统还在递送，说明注册没有真正注销。
    private(set) var pressCount = 0

    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?
    private static let signature: OSType = 0x544B4148        // 'TKAH'
    private static let identifier: UInt32 = 1

    deinit {
        unregister()
        if let handler = handlerRef { RemoveEventHandler(handler) }
    }

    /// 按配置注册或注销，返回结果状态。同一热键已经注册成功时不重复注册；上次失败（被占用）则重新尝试，
    /// 因为这次调用是 Chrome 因设置变化或新连接才发来的，不是定时重试。
    @discardableResult
    func apply(_ plan: AssistantModel.HotkeyPlan) -> AssistantModel.HotkeyStatus {
        switch plan {
        case .disable:
            unregister()
            status = .off
        case .invalid:
            unregister()
            status = .invalid
        case .register(let hotkey):
            if registered == hotkey && status == .ok { return status }
            unregister()
            guard let code = AssistantModel.keyCode(hotkey.key), installHandler() else { status = .failed; return status }
            var ref: EventHotKeyRef?
            let result = RegisterEventHotKey(code, AssistantModel.carbonModifiers(hotkey.modifiers),
                                             EventHotKeyID(signature: AssistantHotkey.signature, id: AssistantHotkey.identifier),
                                             GetApplicationEventTarget(), 0, &ref)
            status = AssistantModel.hotkeyStatus(osStatus: result)
            if status == .ok { hotKeyRef = ref; registered = hotkey }
        }
        return status
    }

    func unregister() {
        if let ref = hotKeyRef { UnregisterEventHotKey(ref) }
        hotKeyRef = nil
        registered = nil
    }

    /// 事件处理函数只装一次（进程生命周期内保留）；之后每次注册只换热键本身。
    private func installHandler() -> Bool {
        if handlerRef != nil { return true }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let result = InstallEventHandler(GetApplicationEventTarget(), { _, event, userData in
            guard let event = event, let userData = userData else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            let read = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier)
            guard read == noErr, identifier.signature == AssistantHotkey.signature, identifier.id == AssistantHotkey.identifier else { return OSStatus(eventNotHandledErr) }
            let owner = Unmanaged<AssistantHotkey>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { owner.pressCount += 1; owner.onPressed?() }      // 尽快离开 Carbon 回调，界面工作放到主队列
            return noErr
        }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), &handlerRef)
        return result == noErr
    }
}
