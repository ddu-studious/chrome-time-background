import Foundation
import JavaScriptCore

/// Only the two trusted, bundled browser matching modules are evaluated. User
/// text/catalog fields are JSValue arguments, never JavaScript source. No native
/// objects, network, filesystem or model-generated code are exported to JS.
final class AssistantMatcher {
    static let shared = AssistantMatcher(bundle: .main)
    private let context: JSContext?
    private let api: JSValue?
    private var lastKey: String?
    private var lastIDs: [String]?

    init(bundle: Bundle) {
        guard let context = JSContext(),
              let pinyinURL = bundle.url(forResource: "pinyin-match", withExtension: "js"),
              let matchURL = bundle.url(forResource: "assistant-match", withExtension: "js"),
              let pinyin = try? String(contentsOf: pinyinURL, encoding: .utf8), pinyin.utf8.count < 100_000,
              let matching = try? String(contentsOf: matchURL, encoding: .utf8), matching.utf8.count < 20_000 else {
            self.context = nil; self.api = nil; return
        }
        context.evaluateScript(pinyin, withSourceURL: pinyinURL)
        context.evaluateScript(matching, withSourceURL: matchURL)
        let api = context.objectForKeyedSubscript("AssistantMatch")
        guard context.exception == nil, api?.isObject == true else { self.context = nil; self.api = nil; return }
        self.context = context; self.api = api
    }

    func rank(_ rows: [AssistantModel.CatalogItem], query: String, actions: Bool) -> [AssistantModel.CatalogItem]? {
        guard let context = context, let api = api, rows.count <= 64, query.utf16.count <= 40 else { return nil }
        let payload: [[String: Any]] = rows.map { ["id": $0.id, "name": $0.name, "aliases": actions ? [$0.id] : $0.aliases] }
        guard let encoded = try? JSONSerialization.data(withJSONObject: [payload, query] as [Any], options: [.sortedKeys]), encoded.count <= 65_536 else { return nil }
        let key = String(decoding: encoded, as: UTF8.self)
        let ids: [String]
        if key == lastKey, let cached = lastIDs { ids = cached }
        else {
            context.exception = nil
            guard let values = api.invokeMethod("rank", withArguments: [payload, query])?.toArray() as? [[String: Any]], context.exception == nil,
                  values.count <= rows.count else { return nil }
            ids = values.compactMap { $0["id"] as? String }
            guard ids.count == values.count, Set(ids).count == ids.count, ids.allSatisfy({ id in rows.contains { $0.id == id } }) else { return nil }
            lastKey = key; lastIDs = ids // one bounded query result, no permission or business-state caching
        }
        return ids.compactMap { id in rows.first { $0.id == id } }
    }
}
