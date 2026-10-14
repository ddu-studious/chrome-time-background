import AppKit
import WebKit

// Research spike (not production code): can a model-written HTML/CSS card be shown in the native panel
// without giving the model code execution or network access?
// Usage: spike --port=N --html=file --png=out.png --label=name [--js] [--no-rules]
let args = CommandLine.arguments
func opt(_ name: String) -> String? { args.first { $0.hasPrefix("--\(name)=") }.map { String($0.dropFirst(name.count + 3)) } }
let jsEnabled = args.contains("--js"), useRules = !args.contains("--no-rules"), allowNav = args.contains("--allow-nav")
let port = opt("port")!, htmlPath = opt("html")!, pngPath = opt("png")!, label = opt("label") ?? "run"

final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var panel: NSPanel!
    var web: WKWebView!
    var log: [String] = []
    var marks: [String: Double] = [:]
    var loaded = false
    let t0 = Date()
    func ms() -> Double { (Date().timeIntervalSince(t0) * 1000).rounded() }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        marks["launch"] = ms()
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = jsEnabled
        config.websiteDataStore = .nonPersistent()
        guard useRules else { start(config); return }
        // Subresources only: the document itself comes from loadHTMLString and the navigation delegate vets every navigation.
        let rules = """
        [{"trigger":{"url-filter":".*","resource-type":["image","style-sheet","script","font","raw","svg-document","media","popup","ping"]},"action":{"type":"block"}}]
        """
        let id = "spike-\(UUID().uuidString)"
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: id, encodedContentRuleList: rules) { list, error in
            if let list = list { config.userContentController.add(list) } else { self.log.append("RULES-ERROR \(String(describing: error))") }
            self.marks["rulesCompiled"] = self.ms()
            self.start(config)
            WKContentRuleListStore.default().removeContentRuleList(forIdentifier: id) { _ in }
        }
    }

    func start(_ config: WKWebViewConfiguration) {
        let rect = NSRect(x: 0, y: 0, width: 520, height: 440)
        panel = NSPanel(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true; panel.level = .floating
        let glass = NSVisualEffectView(frame: rect)
        glass.material = .hudWindow; glass.blendingMode = .behindWindow; glass.state = .active
        glass.wantsLayer = true; glass.layer?.cornerRadius = 24; glass.layer?.masksToBounds = true
        panel.contentView = glass
        marks["beforeWebView"] = ms()
        web = WKWebView(frame: rect, configuration: config)
        web.setValue(false, forKey: "drawsBackground") // unofficial KVC; used here only to see the glass through the page
        web.navigationDelegate = self; web.uiDelegate = self
        glass.addSubview(web)
        marks["afterWebView"] = ms()
        panel.setFrameOrigin(NSPoint(x: 120, y: 160)); panel.orderFrontRegardless()
        let html = (try! String(contentsOfFile: htmlPath)).replacingOccurrences(of: "__PORT__", with: port)
        marks["loadStart"] = ms()
        web.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        log.append("NAV type=\(action.navigationType.rawValue) main=\(action.targetFrame?.isMainFrame ?? false) url=\(String(url?.absoluteString.prefix(70) ?? "nil"))")
        if url?.scheme == "action" { log.append("ACTION \(url?.host ?? "")\(url?.path ?? "")"); decisionHandler(.cancel); return }
        if allowNav { decisionHandler(.allow); return } // control experiment only: no navigation vetting
        if !loaded, url?.absoluteString == "about:blank" { decisionHandler(.allow); return }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        log.append("POPUP-REQUEST \(String(navigationAction.request.url?.absoluteString.prefix(60) ?? "nil"))"); return nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !loaded else { return }
        loaded = true; marks["didFinish"] = ms()
        // App-side script still runs when page scripts are off; the page's own inline script is what must stay inert.
        web.evaluateJavaScript("document.body.dataset.scriptRan + '|' + Math.ceil(document.body.getBoundingClientRect().height) + '|' + Math.ceil(document.body.getBoundingClientRect().width)") { value, error in
            let parts = String(describing: value ?? "nil").split(separator: "|").map(String.init)
            self.log.append("scriptRan=\(parts.first ?? "?") contentHeight=\(parts.count > 1 ? parts[1] : "?") contentWidth=\(parts.count > 2 ? parts[2] : "?") appJS=\(error == nil ? "ok" : "error")")
            self.clickAll(["a.primary", "#evil", "#blank"]) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.snapshot() }
            }
        }
    }
    // Synthetic clicks from the app side (page scripts stay off); each goes through the same navigation policy as a user click.
    func clickAll(_ selectors: [String], done: @escaping () -> Void) {
        guard let selector = selectors.first else { done(); return }
        web.evaluateJavaScript("(function(){var e=document.querySelector('\(selector)'); if(!e) return 'absent'; e.click(); return 'clicked';})()") { v, e in
            self.log.append("click \(selector)=\(v ?? "nil") err=\(e == nil ? "none" : "error")")
            self.clickAll(Array(selectors.dropFirst()), done: done)
        }
    }
    func snapshot() {
        let config = WKSnapshotConfiguration()
        web.takeSnapshot(with: config) { image, error in
            self.marks["snapshot"] = self.ms()
            if let image = image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: pngPath))
            } else { self.log.append("SNAPSHOT-ERROR \(String(describing: error))") }
            print("WINDOW \(self.panel.windowNumber)"); fflush(stdout)
            // Stay up long enough for an external screenshot and for any delayed loads (meta refresh, iframes).
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { self.finish() }
        }
    }
    func finish() {
        let result: [String: Any] = ["label": label, "js": jsEnabled, "rules": useRules, "navVetting": !allowNav, "marks": marks, "log": log, "pid": ProcessInfo.processInfo.processIdentifier]
        let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print("RESULT " + String(data: data, encoding: .utf8)!); fflush(stdout)
        NSApp.terminate(nil)
    }
}
let app = NSApplication.shared
let spike = Spike()
app.delegate = spike
app.run()
