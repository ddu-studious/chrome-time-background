# AI 工作台视频进入 App 播放器

## 行为

B 站、YouTube 的搜索候选、续看候选和模型 `video.open` 都打开扩展 App 内对应播放器。已知观看秒数、B 站分 P、标题和作者随入口传递；没有有效秒数时沿用播放器本地续播。YouTube 未连接账号时提供 App 内连接/搜索入口，并保留关键词；旧任务中保存的 `video.search-site` 也映射到这一入口。

后台创建一个 App 标签页，不替换用户当前网页。收到创建标签页回执后只返回 `opened: true, destination: app, playbackConfirmed: false`，提示“已打开视频页 / 已请求续看”，不能据此声称视频已播放。播放器故障保留其已有错误界面。

## 复用与适配

- `assistant-tools.js` 的候选动作与 `assistant-management.js` 的引用工具共用打开函数，引用选择、过期、跨平台及重复打开校验维持原路径。
- 新的 `app-video.js` 仅验证平台、视频 ID、秒数和分 P，并编解码扩展 `index.html` 深链；同时导出 CommonJS 与浏览器 API。没有新增播放器、AI 规划循环、外部依赖或权限。
- B 站复用 `BilibiliController.show()` / `_playItem()`，保持本地观看进度合并（本地分 P 或同分 P 秒数更靠后时优先使用本地记录）、Cookie/iframe、播放器控制及观看记录的现有实现。
- YouTube 复用 `YouTubeController.open()` / `_play()` 和已有官方 iframe/IFrame Player API；仅增加可选续播秒数。已有 YouTube.js 18.0.0 负责首页推荐，其公开首页 API 不负责扩展 App 导航，此次无需新增或升级 SDK，也不改该集成。
- `main.js` 在目标 controller 初始化后消费深链；深链从地址栏移除，刷新不重放打开动作。目标模块被关闭时显示提示，不绕过设置。默认列表初始化不得晚到覆盖目标播放器。
- 新写依赖 `openVideo` 加入原有 trace 和 `sideEffectStarted` 路径，调用前后检查任务状态。发送后丢失回执属于 unknown，不自动重复开页。

## 生效与验证

重载扩展以更新 Service Worker 和 App 页面。模型 Skill 文案在本机 AI 服务启动时载入，因此重启该服务后规划提示也会更新；视频执行入口由扩展代码决定。

验证结果：

- 17 个相关测试文件联合运行，233/233 通过；覆盖路由、真实 Tools/Engine + 浏览器/API 替身、后台真实适配函数、取消/unknown/重复动作、现有视频工作台与首页推荐回归。其中 10 项 VM 行为测试覆盖页面初始化、关闭模块的可见提示、App 内连接、真实播放器方法生成的 iframe 参数以及晚到结果隔离。
- 修改的 JS/MJS 脚本语法检查、`git diff --check` 通过。
- 部分执行链回归使用临时本机 HTTP 服务与业务替身，未调用真实本机模型，未进行 HTTP UI 预览或真实 Chrome 扩展/账号播放验收。未操作真实播放队列、提醒或账号。

真实验收：重载扩展，在 AI 工作台分别选择 B 站/YouTube 搜索与续看候选，确认新标签页为扩展 App、目标视频和续播位置正确；B 站检查多 P 历史；YouTube 未连接时应停留在 App 连接页。播放器是否实际开始播放仍以平台播放器状态为准。
