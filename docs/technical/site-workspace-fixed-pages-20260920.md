# 网站工作区：固定入口与临时页面（2026-09-20）

## 用户体验与兼容

- 现有页面全部迁移为固定入口，保留 id、URL 和自定义名称；不倒推历史来源、不批量清理旧页面。沿用既有同分组同 URL 的去重规则。
- 主动“加入”、从入口打开的新页面默认固定；重命名或点击“固定”也会固定。点击“已固定”可取消固定，已关闭的页面会立即进入最近关闭。
- Chrome 工作区组中自动发现的新页面默认临时；有可验证来源的收在固定祖先下，其他页面收在“其他临时页面”，无法识别时显示“来源未知”。
- 固定入口同标签跳转到不同地址时，原固定记录保持原地址，新地址作为临时关联页面。再次点击固定入口会打开原地址；直接点击临时页面切换到当前标签。
- 临时页面关闭后从主列表移出，进入“最近关闭”，保留 7 天、全局最多 30 条，按关闭时间排序。支持精确地址重开、复用同组同 URL 活动标签和单条删除。7 天期限在读写时清理，不额外创建定时任务。
- “从工作区移除并保留标签”继续保留 Chrome 标签，移除的页面不加入最近关闭。手动拖出 Chrome 分组会结束工作区管理，临时记录可在最近关闭中找到。
- 批量打开分组只打开固定页面与既有网站入口，不批量恢复临时页面或最近关闭。
- “查找 / 打开分组”按名称在本地匹配；自然语言匹配折叠展示，提供开关/连接失败状态及刷新按钮。取消、输入变化使晚到结果失效；打开前校验当前分组及固定入口内容。

## 复用与实际边界

复用现有 `WorkspaceService`、`SiteWorkspaceController`、`SceneAI`、`workspace.match` 和 Chrome 平台正式 API。未引入 SDK、依赖、权限或独立工作区数据库，无新增模型调用路径；扩展要求仍为 Chrome 142+。这是标签/本地存储适配，不涉及 pi 的代理规划、执行或授权能力。

查阅的上游 API：

- [Chrome tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)：`Tab.openerTabId` 只在来源标签仍存在时提供；`onCreated` 时 URL 和 groupId 可能尚未确定，需要 `onUpdated` 补齐。后台在创建时保存已有来源绑定，后续再核对实际分组与 URL；中间 `about:blank` 等非 HTTP(S) 地址不会入库。
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)：继续用 `storage.local` 保存配置，`storage.session` 保存标签绑定。
- Web Locks `navigator.locks.request()` 串行化同扩展源的后台、侧栏与页面事务；嵌套内部调用使用独立事务接收对象，避免重入死锁。没有浏览器 API 的 Node 替身使用同 Chrome 对象上的 Promise 队列。

自有适配只负责固定/临时分类、来源持久化、有限最近关闭和界面投影。来源不是根据同域、标题或模型猜测。若网页未提供 opener、来源在首次记录前已关闭，仍无法可靠还原；旧记录不补造关系。来源父记录仍存在时显示其最新别名，删除后保留已记录的来源文字。

## 数据与同步

- 存储键继续为 `siteWorkspaceV1`、`siteWorkspaceTabBindingsV1`，配置版本升为 3。
- `pages[]` 增加 `pinned`、`sourcePageId`、`sourceTitle`；缺少 `pinned` 的记录按固定处理。
- `recentClosed[]` 只存临时页面关闭后的 URL、标题、来源、分组和关闭时间，有数量及期限约束。
- 同一标签跳转不改写固定 URL；多个标签共享同一页面记录时，一个标签跳转会拆分记录，不覆盖其他标签。
- 临时父页面关闭前，将仍存活后代连接到可验证的固定祖先；祖先查找有循环保护。
- `onCreated / onUpdated / onRemoved / onAttached / tabGroups.onRemoved` 在侧栏关闭时也同步。所有配置修改与快照对账由同一串行事务保护；绑定未变化时不重复写 session，避免 storage 事件自激刷新。
- 不删除原业务存储键。旧程序不认识 V3 的新字段，回退代码会丢失分类、来源及最近关闭元数据，因此不应在新旧版本间交替写入。

## 验证

- `node --test test/site-workspace-core.test.js test/site-workspace-contract.test.js test/local-ai-workspace.test.mjs`：36/36 通过，包括升级保留、别名、真实 opener 替身、跨域/多级来源、固定入口跳转、临时固定/重命名、关闭恢复、30 条/7 天、非法中间 URL、多窗口、并发、同 URL 多标签、精确恢复及批量打开范围。
- JavaScript 全量回归：`node --test test/*.test.js` 734/734 通过；另行运行的本机 AI 工作区合同测试 1/1 通过（模型替身）。
- 生产脚本语法检查、`git diff --check`。
- HTTP 隔离预览：`test/fixtures/site-workspace-preview.html` 引用生产 CSS、Core、Controller 和 Matcher，Chrome/AI 使用替身，与单元测试共用 Chrome fixture。390 与 320 像素宽均无横向溢出；已点击验证固定、关闭临时页、最近关闭重开、AI 关闭时按名称打开分组、自然语言输入使用自定义标题、取消后晚到结果不再显示打开按钮。
- 截图：`output/playwright/workspace-v3-390.png`、`output/playwright/workspace-v3-320.png`。预览 favicon.ico 404 是本地服务器图标请求，不是业务请求失败。
- 未在用户真实 Chrome 扩展/账号和真实本机模型上验证。未操作真实标签队列、用户工作区存储或 AI 设置；使用新版本需在扩展管理页重新加载扩展，并重新打开工作区。
