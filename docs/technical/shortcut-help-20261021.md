# 快捷键查询面板（2026-10-21）

## 交互

- 首页右下角沿用 `.keyboard-hint` 的定位，与“Ctrl/⌘ + Shift + B 切换背景”并排增加“? 快捷键”按钮；与小鱼托盘横向留出 18px（窄屏 12px）；鼠标活动时显示、停止约 3 秒后隐藏，悬停/键盘焦点保留，极简模式仍隐藏。
- 首页、设置页的非编辑区域按 `?`（常见键盘为 Shift + /）打开面板；兼容旧帮助组合 Ctrl/⌘ + Shift + /。设置 → 快捷键增加按钮，旧任务帮助入口优先打开同一面板。
- 打开后聚焦搜索，可按功能、按键或使用场景过滤；无匹配时显示空结果。Esc、右上角关闭和点击遮罩可关闭；关闭后恢复原焦点。
- 普通输入框、富文本、select、textbox 不拦截问号，输入法组合态和长按不触发。面板内按键和点击不传播给底层应用处理器。
- 原生模态对话框负责焦点范围和背景交互隔离；顶部搜索和底部修改入口固定，中间列表滚动，适配窄屏。

## 数据与复用

当前项目为原生 JS，manifest 最低 Chrome 142。本次直接复用 Chromium 原生 `HTMLDialogElement.showModal()/close()` 和 Chrome 扩展公开 API，没有增加第三方库、SDK、依赖或权限，也没有新增后台消息和自建快捷键执行器。

- `chrome.commands.getAll()`：每次打开及页面重新可见时读取全部实际绑定和描述，包括未设置的命令；不从 manifest 的建议键推断实际绑定。该分组放在首页常用操作之后。
- 已有鉴权消息 `jelly_desktop_get`：仅查询桌面 AI 助手的配置及注册状态，不启用组件、不修改设置。明确展示未启用、需要常驻、冲突、旧组件和待连接等状态。
- 已有 `chrome.tabs.create({url:'chrome://extensions/shortcuts'})`：让用户前往 Chrome 修改绑定；只使用固定地址，失败时显示可复制到地址栏的地址。
- `js/main.js`、`js/memo.js`、`js/music-controller.js`、`js/assistant.js`、`js/product-shell-v5.js`、`js/knowledge-wall.js`、`js/blog.js`、游戏内帮助：维护常用应用内操作索引及生效场景。专门编辑器和各款游戏仍保留自己的详细帮助；预留给浏览器或系统的组合注明其可能优先处理。

`js/shortcut-help.js` 只负责索引展示和查询快捷键，不接管现有业务快捷键。首页和设置页共用相同模块；独立任务页面未加载模块时，旧任务帮助保留原行为。

两项读取独立进行，各限时 3 秒；失败后保留本地操作索引并明确提示，不将未知误写成“未设置”。每次读取绑定本次打开的版本，关闭、重新打开或刷新读取后，旧请求及超时后的结果均不能写入新面板。

## 安全边界

仅静态模板使用 `innerHTML`；命令描述、按键、状态和查询结果均通过 `textContent` 输出。既有后台扩展来源鉴权不变。没有模型调用、外部网络、业务动作、设置写入、存储新增或敏感日志；临时 HTTP 预览只监听本机并按静态文件白名单提供文件。

## 验证记录

- `node --check js/shortcut-help.js`、`js/settings-v5.js`、`js/memo.js`；`git diff --check`。
- `node --test test/settings-v5-contract.test.js test/product-ui-v5-contract.test.js`：19/19 通过。
- Playwright Chromium + HTTP 隔离夹具 `test/fixtures/shortcut-help-preview.html`：问号及兼容组合、点击入口、搜索与空结果、输入/富文本/组合态/长按保护、Tab/Shift+Tab、Esc/遮罩关闭、焦点恢复、底层按键隔离、最新绑定重读、读取失败、3 秒超时和迟到结果隔离、固定 Chrome 设置地址、动态文字输出检查通过。Chrome API、桌面状态及打开标签均为替身。
- 真实 `settings.html#shortcuts` 的 HTTP 预览：设置页按钮、问号唤出和关闭后焦点恢复通过。非扩展环境无法读取 Chrome 命令与桌面状态，面板如实显示不可用；预览白名单未提供的图标/字体产生 404，与功能脚本无关。
- 1440×900 与 390×844 截图检查通过；窄屏无横向溢出，底部入口在视口内，中间列表可滚动。截图位于 `output/playwright/shortcut-help-desktop.png`、`shortcut-help-mobile.png`。
- 未验证用户当前真实 Chrome 扩展实例或真实桌面组件；未修改 manifest 或后台，不需要重启本机 AI 服务。刷新扩展首页/设置页后验收即可。

## 加载后入口消失与提前就绪修复

用户反馈刷新时可见，过一会只剩“切换背景”文字。真实调用链为 `main.initApp()` 等待 `settingsManager.init()` 后调用 `i18nManager.init()`，后者经 `updatePageText()` 调用 `updateKeyboardHint()`；旧代码对整个 `.keyboard-hint` 设置 `textContent`，删除了新按钮及其事件监听。初版独立面板夹具没有加载真实国际化脚本，因此漏检此问题。

修复只更新 `.shortcut-hint-background` 的文本，保留同一栏的控件与事件；旧版纯文本提示仍可翻译。CSS 移到 head，入口脚本放在提示栏之后、重型编辑器供应脚本之前并立即绑定，去掉 DOMContentLoaded 等待。这样入口不依赖设置、天气或后续应用初始化。

- 新增 `test/shortcut-help-startup.test.js` 四项回归，连同现有两组检查共 23/23 通过；语法与 diff 检查通过。
- 更新隔离夹具，真实加载 `js/i18n.js`，延迟 1.5 秒初始化，避免再次遗漏入口生命周期。
- 完整首页 HTTP 对照使用同一套正式 HTML/脚本、隔离 Chrome API 与本地背景，设置读取延迟 1.3 秒、相同供应脚本人为延迟 2.5 秒。Chromium 151 中旧版入口约 2759ms 才绑定，国际化完成后按钮消失；修复版约 240ms 绑定、DOMContentLoaded 尚未发生即可打开；完成初始化并等待后，反复切换语言、点击、按键与搜索均通过，页面脚本错误为 0。证据 `output/playwright/shortcut-help-startup-20261021.json`，首页截图 `shortcut-help-full-home-fixed.png`。
- 上述耗时是故障注入下入口可响应时间，不代表真实整页加载提升；原首屏绘制约 280/284ms，整页脚本仍在后台完成加载。
- 原目录加载的真实扩展验收：Google Chrome for Testing / Chromium 151，临时空白配置，禁用联网模块并以无效本机代理阻断网络，未使用或更改用户 Chrome 配置、账号、提醒、音乐或 AI 服务。首次加载加两次刷新共三轮，均等待国际化完成后复查；按钮保留、点击与 `?` 唤出通过，反复中英文切换后仍可用，实际 `chrome.commands.getAll()` 的 8 项命令全部展示，页面脚本错误为 0。
- 该隔离扩展样本中入口绑定约 672ms、DOMContentLoaded 约 794ms，键盘打开面板约 37ms、两次刷新后的点击打开约 53/47ms。这些是隔离测试配置下的入口指标，不能代表用户真实配置或壁纸/联网数据完成时间。扩展资源未提供单脚本 Performance Resource Timing 记录，未据此判断整页慢点。证据 `output/playwright/shortcut-help-extension-20261021.json`，截图 `shortcut-help-real-extension-fixed.png`。

## 同日后续：中文化与首页减负

用户明确只需要中文，国际化运行时及英文词库、语言设置已移除。上文国际化初始化验收是该阶段历史记录，当前回归验证旧英文配置也显示中文，不再加载 i18n.js。提示恢复活动后显示/闲置隐藏并拉开小鱼间距。完整首页性能证据、冷壁纸上限及真实扩展验收见 [首页减负与中文化](home-startup-chinese-20261021.md)。
