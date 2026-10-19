import Foundation

// 写实海洋动物骨架的对拍工具（只用于验收，不进产品）：用与产品相同的 marine-rig.swift / marine-rig-data.swift，
// 在指定物种与姿态下求值，把 ops 与包围盒输出成 JSON，由 test/marine-rig-parity.test.mjs 与 JS 的 MarineRig.evaluate 逐点比较。
// 不依赖 AppKit，不创建窗口。
//
// 用法（编译时本文件作为 main.swift）：
//   marine-rig-parity <cases.json>
// cases.json 是数组，每项 { species, phase, amp, turn, lod, exact, detail }（除 species 外都可省略，缺省与 MarineRigPose 一致；exact 为真时用精确公式的参考实现；
// detail 缺省为真：逐点输出；为假时每个 op 只输出摘要 { k, id, n（点数）, closed（闭合子路径数）, sx, sy（坐标和） }，大批量姿态网格用它，输出才不会上百兆）。
// 标准输出是 JSON 数组，每项 { species, ok, unit, union:[x,y,w,h], bodyLength, ops:[…], bounds:[minX,minY,maxX,maxY]|null }；
// 物种没有骨架时 { species, ok:false }。ops 的字段与 JS 一致：fill { k, id, rule, polys:[{pts, closed}], paint:{rgba}|{grad:{a,b,stops}} }，stroke { k, id, polys, width, rgba, cap }。

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(2)
}

func polysJSON(_ polys: [MarinePoly]) -> [[String: Any]] {
    polys.map { ["pts": $0.pts, "closed": $0.closed] }
}

func digestJSON(_ op: MarineOp) -> [String: Any] {
    var n = 0, sx = 0.0, sy = 0.0
    for poly in op.polys {
        var i = 0
        while i < poly.pts.count { sx += poly.pts[i]; sy += poly.pts[i + 1]; n += 1; i += 2 }
    }
    return ["k": op.kind == .fill ? "fill" : "stroke", "id": op.id, "n": n, "closed": op.polys.filter { $0.closed }.count, "sx": sx, "sy": sy]
}

func opJSON(_ op: MarineOp) -> [String: Any] {
    switch op.kind {
    case .fill:
        var item: [String: Any] = ["k": "fill", "id": op.id, "rule": op.evenOdd ? "evenodd" : "nonzero", "polys": polysJSON(op.polys)]
        switch op.paint {
        case .rgba(let r, let g, let b, let a)?: item["paint"] = ["rgba": [r, g, b, a]]
        case .gradient(let ax, let ay, let bx, let by, let stops)?: item["paint"] = ["grad": ["a": [ax, ay], "b": [bx, by], "stops": stops] as [String: Any]]
        case nil: break
        }
        return item
    case .stroke:
        return ["k": "stroke", "id": op.id, "polys": polysJSON(op.polys), "width": op.width, "rgba": op.rgba, "cap": op.butt ? "butt" : "round"]
    }
}

let arguments = CommandLine.arguments
guard arguments.count >= 2, let data = FileManager.default.contents(atPath: arguments[1]),
      let cases = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { fail("用法：marine-rig-parity <cases.json>") }

func number(_ value: Any?, _ fallback: Double) -> Double {
    if let n = value as? NSNumber { return n.doubleValue }
    return fallback
}

var results: [[String: Any]] = []
for item in cases {
    guard let name = item["species"] as? String, let species = JellySpecies(rawValue: name) else { fail("未知物种：\(String(describing: item["species"]))") }
    guard let geometry = MarineRigGeometries.of(species) else { results.append(["species": name, "ok": false]); continue }
    let pose = MarineRigPose(phase: number(item["phase"], 0), amp: number(item["amp"], 1), turn: number(item["turn"], 0), lod: Int(number(item["lod"], 2)))
    let exact = (item["exact"] as? Bool) ?? false
    let detail = (item["detail"] as? Bool) ?? true
    let evaluation = exact ? MarineRigEvaluator.evaluateExact(geometry.rig, pose: pose) : MarineRigEvaluator.evaluate(geometry.rig, pose: pose)
    var out: [String: Any] = [
        "species": name, "ok": true, "unit": Double(geometry.unit), "bodyLength": Double(species.rigBodyLength ?? 0),
        "union": [Double(geometry.union.minX), Double(geometry.union.minY), Double(geometry.union.width), Double(geometry.union.height)],
        "ops": evaluation.ops.map(detail ? opJSON : digestJSON),
    ]
    if let b = evaluation.bounds { out["bounds"] = [Double(b.minX), Double(b.minY), Double(b.maxX), Double(b.maxY)] } else { out["bounds"] = NSNull() }
    results.append(out)
}
guard let json = try? JSONSerialization.data(withJSONObject: results, options: []) else { fail("无法序列化输出") }
FileHandle.standardOutput.write(json)
