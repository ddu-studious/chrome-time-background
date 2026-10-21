# 首页闲置资源：失焦休息、隐藏回收与媒体工作台懒初始化（2026-10-21）

起因：任务管理器里新标签页 482 MB / CPU 17%，用户希望“海洋生态只有获得焦点才占用，其他不要占”，并考虑懒加载、过期回收。

## 实测（真实 Chrome 156 无头、隔离配置、扩展目录即当前工作区；GPU 为软件渲染，只是代理）

- 内存无单一大户：扩展渲染进程 footprint 约 250–300 MB，malloc 约 150 MB（来源分散，未能归到某个模块），其余为 cc 瓦片、画布、已解码壁纸（轮换壁纸会让 `cc/image_memory`/`discardable` 随运行时间增长）。用户机器上的 482 MB 含真实数据与长时间运行，**本机无法复现，只复现了结构**。
- 海洋生态本身主要吃 CPU/GPU，不是内存大户。
- 空闲时仍有 4 条无限 CSS 动画在跑：背景颗粒、滚动条、**关闭状态的响铃光晕**、**隐藏的 B 站面板脉冲**（后两条白白让页面持续产生帧）。

## 改动

1. **失焦休息**（`js/background-experience.js`）：窗口失焦 `REST_BLUR_DELAY_MS = 4000` 毫秒后取消 rAF 循环，画布保留最后一帧、不清屏；`body.home-resting` 暂停无限 CSS 动画（不隐藏任何图层）。重新获得焦点立即恢复；失焦时鼠标在页面上移动（`noteHover`）也会短暂唤醒并再次休息，所以放在副屏看着不会冻住。`onRestChange(listener)` 供 `main.js` 暂停视频壁纸、停止自动轮换、转场按“被暂停”处理。`document.hasFocus` 不存在的旧环境视为有焦点，不休息。
2. **隐藏后深度回收**：标签页隐藏（`document.hidden`/工作台遮挡）超过 `DEEP_REST_MS = 60000` 毫秒，水母皮肤下的水族馆、水层与皮肤自身 `stop()`（释放 WebGL 画布与鱼层状态），画布缩成 1×1；恢复可见时 `resize()`、重新种子、按当前设置重启。隐藏期间不重新分配画布。水层调速器忽略超过 `GOV_MAX_GAP` 的帧间隔，恢复不会出现大步长。
3. **媒体工作台懒初始化**（`js/main.js`）：B 站、YouTube、虎牙不再在启动时注入面板 DOM、读存储、发请求；`createLazyWorkbench` 在第一次需要时同步调用其 `init`（只调一次，失败状态保留，不重复注入），`bindLazyDock` 绑定 Dock：悬停 200 ms、键盘聚焦或触摸预热，点击时 YouTube/虎牙等初始化完成再开面板（等待期间重复点击忽略），B 站面板数据本来就边加载边渲染，所以点击即开。`appVideoRequest` 深链仍在启动时初始化对应平台并保持原有错误提示。初始化失败时仍可打开面板（与旧行为一致），只记录错误。
4. **闲置动画只在可见时运行**：响铃光晕动画挪到 `.alarm-ringing-overlay.open`；B 站面板脉冲在 `body:not(.bili-panel-open)` 时停止。`prefers-reduced-motion` 规则同步调整。

版本号：`background-experience.js` 20、`background-experience.css` 7、`alarm-center.css` 2、`product-ui-v5.css` 53、`main.js` 17，对应测试同步。

## 数据（同一台机器、同一脚本、两次取平均前的单次值，噪声约 ±5 MB）

- 懒初始化 vs 旧行为（加载后再手动 `init` 三个工作台模拟）：footprint 294–301 vs 302–306 MB；partition_alloc 约 19 vs 36 MB；web_cache 图片 0.2–0.5 vs 9.9 MB。启动时省约 5–10 MB，远不是 482 MB 的主因，真实账号下载推荐/图片时差距会更大，未实测。
- 失焦休息（用脚本覆盖 `document.hasFocus` 并派发 `blur`，无头无法制造真实失焦）：重新聚焦稳态扩展渲染进程 8.7% / GPU 19.7% → 休息 4.7% / 2.4%（单核百分比，软件渲染，仅供对比）。第一个窗口 58%/21% 含启动瞬态，不用于比较。

## 验证与边界

- `test/background-rest.test.js`（13 项，手动时钟）、`test/lazy-workbench.test.js`（7 项）及被改动的接线/版本测试；全量 `node --test --test-force-exit --test-concurrency=4 test/*.test.js test/*.test.mjs` 3618 项通过。几处旧夹具补了只存在、不计时的 `setTimeout/clearTimeout`。
- 真实 Chrome：三个 Dock 按钮点击均能打开并关闭面板，无页面错误；休息/恢复、`home-resting` 类、无运行动画均已读回。
- **未验收**：真实失焦/隐藏标签（无头 `document.hidden` 不可造）、真实 GPU、用户自己的配置与长时间运行的 482 MB、深度回收后恢复的真实观感、视频壁纸真实暂停/恢复、触屏预热。
- 没有新增权限、依赖、网络或设置项；休息时间常量是工程取值，没有用户体验实验。
