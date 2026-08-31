# YouTube OAuth 配置与验收指南

> 日期：2026-08-16  
> 状态：YouTube Data API、OAuth 权限请求页面、测试用户、Chrome 扩展客户端与 manifest 已配置；用户已完成首次只读授权，扩展内真实 API 回归待最终确认  
> 权限边界：R1 仅申请 `youtube.readonly`

## 1. 当前诊断

真实 Chrome 扩展页已核验：

- 当前本地扩展 ID：`ipcgchgohpjheedlgfkcjlhhfbdljefo`
- 工作台运行于 `chrome-extension://ipcgchgohpjheedlgfkcjlhhfbdljefo/index.html`
- Google Cloud 项目 `bold-gadget-443501-s9` 已完成 OAuth 初始配置
- YouTube Data API v3 已启用
- OAuth 权限请求页面已配置
- 当前 Google 账号已加入 OAuth 测试用户
- Chrome 扩展 OAuth 客户端已创建并绑定当前扩展 ID
- `manifest.json` 已配置真实 client ID 和唯一的 `youtube.readonly` scope；扩展重载后应显示“待授权”

YouTube 网页登录态由 `youtube.com` Cookie 管理；扩展账号能力由 `chrome.identity` 和 Google OAuth token 管理。二者相互独立。本扩展明确不读取或注入 YouTube Cookie。

## 2. 云端配置顺序

1. 在目标 Google Cloud 项目启用 YouTube Data API v3。（已完成）
2. 配置 OAuth 权限请求页面：应用名称、支持邮箱、开发者联系邮箱、目标用户与测试用户。（已完成，当前账号已加入测试用户）
3. 创建 OAuth 客户端，应用类型选择 Chrome 扩展，并绑定扩展 ID `ipcgchgohpjheedlgfkcjlhhfbdljefo`。（已完成）
4. 将生成的 client ID 写入 `manifest.json`，只配置只读 scope。（已完成）

```json
"oauth2": {
  "client_id": "<Google Cloud 生成的客户端 ID>",
  "scopes": [
    "https://www.googleapis.com/auth/youtube.readonly"
  ]
}
```

5. 在 `chrome://extensions` 重新加载扩展，打开 YouTube 工作台。
6. 顶部状态应从“OAuth 未配置”变为“待授权”。
7. 用户点击“连接账号”后再发起 Google 授权；初始化和打开工作台时不得自动弹窗。

首次授权可能在独立 Chrome 小窗口中依次出现通行密钥确认、测试应用警告和权限摘要。扩展端对授权消息设置 60 秒超时；窗口未完成或系统验证被取消时，必须退出“连接中”并提示检查其他 Chrome 窗口后重试。

## 3. 发布 ID 注意事项

OAuth Chrome 扩展客户端与扩展 ID 强绑定。本地验收 ID 只能用于当前解压加载实例；如果 Chrome Web Store 发布 ID 不同，必须为正式 ID 创建对应客户端，并替换 manifest 中的 client ID。不要为了固定 ID 把私钥或 OAuth 凭据提交到仓库。

## 4. 验收矩阵

| 场景 | 预期状态 | 核验点 |
|---|---|---|
| manifest 无 OAuth | OAuth 未配置 | 显示当前扩展 ID和配置步骤，不弹授权窗 |
| manifest 已配置、无 token | 待授权 | “连接账号”可点击，私有数据不请求 |
| 首次同意只读授权 | 已连接 · 只读 | 能读取 `channels.list(mine=true)` |
| 用户取消授权 | 待授权 | 本地稍后看、学习清单仍可用 |
| API 返回 401 | 授权过期 | 清理缓存 token，引导重新连接 |
| 主动断开 | 待授权 | token 缓存移除，私有列表不再读取 |

## 5. 完成门槛

- YouTube Data API v3 已启用。
- OAuth 权限请求页面已配置，测试用户可授权。
- Chrome 扩展 OAuth 客户端绑定实际扩展 ID。
- manifest 只含 `youtube.readonly`，不含写 scope。
- 首次授权、静默取 token、取消、401 恢复、断开五条链路均在真实 `chrome-extension://` 页面通过。

官方参考：

- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [OAuth 2.0 for Client-side Web Applications](https://developers.google.com/youtube/v3/guides/auth/client-side-web-apps)
- [YouTube Data API OAuth scopes](https://developers.google.com/youtube/v3/guides/auth/installed-apps)
