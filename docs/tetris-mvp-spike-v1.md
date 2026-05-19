# Tetris MVP 技术 Spike 结论（v1）

**周期**：约 0.5–2 人日（本轮交付聚焦「管线打通 + 证据链」，非玩法全集）。  
**范围**：确定性离散内核（现有 `createTetrisGameCore`）+ Canvas 快照渲染适配 + 单机重力 tick；验证完整「下落触地 → 锁定写入盘面 → 满行消除 → 计分 → 生成下一块」链路。

---

## 已落地的架构切片

| 层级 | 职责 | 仓库锚点 |
|------|------|-----------|
| Simulation | 七袋 RNG、碰撞、踢墙（generic）、锁定、`tick`/`softDrop`、消行计分 | `js/tetris-game.js` → `createTetrisGameCore` |
| Snapshot | `getState()` 输出只读盘面 + 当前骨牌 + 分数等 | 同上 |
| Rendering | `drawTetrisFrame(ctx, w, h, state)`：零时钟耦合，便于替换 WebGL | `js/tetris-game.js` |
| Host / Tick | `TetrisGameManager`：`setTimeout` 调度、`tick()`、键盘→内核调用 | `js/tetris-game.js` → `TetrisGameManager` |

参数包 SSOT：`docs/tetris-rules-v1-parameter-bundle.json`（guideline profile 尚未全部植入内核，见风险）。

---

## Build / 演示录制

1. **静态打开**：仓库根目录启动任意静态服务（或直接打开 `index.html`，若浏览器允许 `file://` 脚本）。
   ```bash
   cd /path/to/chrome-time-background
   python3 -m http.server 8080
   ```
   浏览器访问页面 → 点击底部 dock「俄罗斯方块」→ 「开始」→ 操作一局直至消行。
2. **录屏**：macOS 可用 QuickTime / Cmd+Shift+5；Windows Xbox Game Bar；产物归档至团队制品库即可。
3. **回归命令**（规则内核 + spike 链路）：
   ```bash
   cd /path/to/chrome-time-background
   node --test test/tetris-game-core.test.js
   ```

---

## 风险清单（按优先级）

| ID | 风险 | 影响 | 缓解 / 后续 |
|----|------|------|-------------|
| R1 | **guideline** 锁定延迟、`lockResetLimit`、SRS 分块踢墙未接入内核 | 与现代方块体感不一致；竞技向舆情 | 按 JSON profile 拆分 `rotateCW`/重力计时；单测对齐 `pieceSpecificKickTables` |
| R2 | **softDrop** 当前为「每次下移一格并可能瞬时锁」，与「重力倍率 + lock delay」并存时需语义分叉 | lock delay 引入后与输入打架 | Core 引入重力累计器；softDrop 仅加速累计 |
| R3 | **WebGL / 扩展**：主扩展 CSP、`chrome-extension://` 限制 | 日后 3D 表现层不可用或需降级 | Spike 保留 Canvas 路径；Three 入口单独分包 + feature probe |
| R4 | **快捷键**：全局 `keydown` + `preventDefault` | 页面其它快捷键被吞 | 收敛为面板 `focus`/捕获范围或 `shadow DOM` |
| R5 | **低端机**：`requestAnimationFrame` + WebGL 发热（未来） | 帧率崩盘 | 沿用 `tetris-effect-tiers.js` 分辨率缩放；判定优先于特效 |

---

## 修订估时（在 Spike 基础上的增量）

| 项 | 粗估（人日） | 说明 |
|----|----------------|------|
| Profile 加载器（classic/guideline）+ SRS 踢墙 | 1–2 | 表格已由 JSON 给出 |
| 锁定延迟 + 重置计数 | 1–1.5 | 与重力驱动 refactor 捆绑 |
| 速度曲线对齐 JSON（帧/ms） | 0.5–1 | `getTickMs` 替换为 profile |
| 幽灵块 / Hold（若 P1） | 1–3 | 产品裁剪 |
| WebGL 纵深栅格 MVP | 3–7 | 相机 + mesh 实例化 + 降级 |

**共识**：在未冻结「真 3D 玩法」前，优先完成 guideline 子集与重力模型，再叠加视觉 3D，可避免双倍返工。

---

## 验收指针（本轮 Spike）

- [x] 单机 `tick` 驱动重力步与锁定逻辑可读、可测。
- [x] 渲染与仿真通过快照解耦（`drawTetrisFrame`）。
- [x] 单元测试覆盖「软降 / tick → 锁定 → 1 行消除 → 100 分」完整链路。
- [ ] 录屏：由团队在本地按上文步骤产出（CI 不强制）。
