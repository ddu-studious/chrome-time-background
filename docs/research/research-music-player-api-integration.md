# 音乐播放器 API 集成调研报告

**日期**: 2026-03-18  
**版本**: v1.0  
**目标**: 评估通过 Open API 替代/增强 DOM 操控方案，解决歌单加载失败、列表获取不稳定等体验问题

---

## 一、现有方案痛点

| 痛点 | 现象 | 根因 |
|------|------|------|
| 歌单列表为空 | 点击"我喜欢的音乐"后无歌曲 | DOM 选择器匹配失败，网易云用 iframe 加载内容页，cross-origin 无法访问 |
| 搜索结果不稳定 | 搜索歌曲偶尔返回空 | 依赖 DOM 交互链（填值→回车→等待→提取），任一环节失败即全链失败 |
| 播放列表获取困难 | 播放列表面板经常为空 | 需先打开播放列表面板 DOM，且列表容器选择器因版本迭代频繁变更 |
| 平台覆盖受限 | 仅支持网易云/酷狗 | 每增加一个平台需全面适配 DOM 选择器，维护成本极高 |

**核心矛盾**: DOM 操控方案的稳定性完全依赖平台前端不变更，这在实际中不可控。

---

## 二、可选 API 方案

### 2.1 NeteaseCloudMusicApi Enhanced（推荐 ⭐⭐⭐⭐⭐）

| 属性 | 说明 |
|------|------|
| **项目地址** | [NeteaseCloudMusicApiEnhanced/api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) |
| **Stars** | 651+（活跃维护，2026-03-14 更新） |
| **前身** | Binaryify/NeteaseCloudMusicApi（30K+ Stars，已归档） |
| **部署方式** | 自建 Node.js 服务 / Vercel 一键部署 / Docker |
| **接口数** | 200+ API |
| **授权** | MIT License |

**关键接口**:

| 接口 | 路径 | 说明 |
|------|------|------|
| 二维码登录 | `/login/qr/key` → `/login/qr/create` → `/login/qr/check` | 扫码登录，获取 cookie |
| 手机登录 | `/login/cellphone` | 手机号 + 密码/验证码 |
| 登录状态 | `/login/status` | 检测当前 cookie 有效性 |
| 用户歌单 | `/user/playlist?uid=xxx` | 获取用户所有歌单列表 |
| 歌单详情 | `/playlist/detail?id=xxx` | 获取歌单内所有歌曲 |
| 歌单所有歌曲 | `/playlist/track/all?id=xxx` | 完整歌曲列表 |
| 歌曲URL | `/song/url/v1?id=xxx&level=standard` | 获取播放地址 |
| 搜索 | `/search?keywords=xxx` | 搜索歌曲/歌手/歌单 |
| 歌词 | `/lyric?id=xxx` | 获取歌词 |
| 每日推荐 | `/recommend/songs` | 每日推荐歌曲（需登录） |
| 推荐歌单 | `/personalized` | 个性化推荐歌单 |
| 热搜 | `/search/hot/detail` | 热搜关键词 |

**集成架构**:
```
Chrome Extension (New Tab)
    ↓ fetch (background.js)
NeteaseCloudMusicApi Enhanced (自部署/Vercel)
    ↓ HTTP 模拟
NetEase Music Server
```

### 2.2 Jamendo API（开放免费音乐 ⭐⭐⭐）

| 属性 | 说明 |
|------|------|
| **官网** | https://developer.jamendo.com |
| **费用** | 免费（公共 client_id） |
| **音乐类型** | 独立音乐人作品（CC 许可） |
| **API 能力** | 搜索、播放、歌单、排行榜 |
| **限制** | 音乐库较小，无中文歌曲 |

适合作为"发现独立音乐"的补充源，不适合作为主力平台。

### 2.3 MusicBrainz（元数据 ⭐⭐）

| 属性 | 说明 |
|------|------|
| **官网** | https://musicbrainz.org/doc/MusicBrainz_API |
| **费用** | 免费（无需 API key） |
| **能力** | 音乐元数据（歌手、专辑、曲目信息） |
| **限制** | 不提供音频流，仅元数据 |

适合做歌曲信息补全和封面获取，不适合播放功能。

### 2.4 Spotify Web API（国际平台 ⭐⭐⭐）

| 属性 | 说明 |
|------|------|
| **官网** | https://developer.spotify.com/documentation/web-api |
| **费用** | 免费（需注册开发者账号） |
| **能力** | 完整的播放控制、歌单、搜索、推荐 |
| **限制** | 需要 Premium 才能完整控制播放；中国大陆无法直接使用 |

中国用户使用受限，但架构设计上可预留支持。

---

## 三、方案对比

| 维度 | DOM 操控（现有） | NeteaseCloudMusicApi（推荐） | Jamendo | Spotify |
|------|------|------|------|------|
| 歌单获取 | ❌ 不稳定 | ✅ 100% 可靠 | ✅ 可靠 | ✅ 可靠 |
| 搜索功能 | ⚠️ 间歇失败 | ✅ 稳定 | ✅ 稳定 | ✅ 稳定 |
| 播放控制 | ✅ 通过 audio 元素 | ⚠️ 需自行实现 audio 播放 | ✅ 直接 URL | ⚠️ 需 Premium |
| 歌词获取 | ⚠️ 依赖 DOM | ✅ API 直接返回 | ❌ 不支持 | ✅ 支持 |
| 中文歌曲 | ✅ 丰富 | ✅ 丰富 | ❌ 极少 | ⚠️ 有限 |
| 登录需求 | 已有（网页） | 需实现（QR码/Cookie） | 免登录 | OAuth2 |
| 部署成本 | 无 | 需自建服务 | 无 | 无 |
| 维护成本 | 高（DOM 频变） | 低（API 稳定） | 低 | 低 |
| 版权风险 | 低（用户自身账号） | ⚠️ 中等（见下文） | 低（CC 许可） | 低 |

---

## 四、最优方案：Cookie 直连（已实现 v2.8.0）

### 核心发现

Chrome 扩展拥有 `chrome.cookies` API，可以直接读取用户在浏览器中已登录的网易云 Cookie（`MUSIC_U`、`__csrf` 等），然后在 background.js 中用 `fetch()` 调用网易云内部 API。

**这意味着**：
- **零部署成本**：不需要自建任何服务器
- **零登录成本**：不需要扫码/输密码，用户只要在浏览器中登录过 music.163.com 即可
- **稳定可靠**：直接调官方 API，不依赖 DOM 选择器

### 可用接口

| 接口 | 说明 | 需登录 |
|------|------|--------|
| `/api/nuser/account/get` | 获取当前用户信息 | 是 |
| `/api/user/playlist?uid=xxx` | 获取用户所有歌单 | 是 |
| `/api/v6/playlist/detail?id=xxx` | 获取歌单 trackIds | 是 |
| `/api/v3/song/detail` | 批量获取歌曲详情 | 否 |
| `/api/search/get/web?s=xxx&type=1` | 搜索歌曲 | 否 |
| `/api/song/lyric?id=xxx` | 获取歌词 | 否 |

### 权限需求

```json
{
    "permissions": ["cookies"],
    "host_permissions": ["*://music.163.com/*"]
}
```

---

## 五、远期方案：双通道混合架构

### 核心思路

保留 DOM 操控作为"控制通道"（播放/暂停/切歌），引入 API 作为"数据通道"（歌单/搜索/歌词），两者互补。

```
┌─────────────────────────────────────────────────────┐
│  Chrome Extension (New Tab Page)                    │
│                                                     │
│  MusicController                                    │
│  ├── 控制通道 (DOM): playPause / prev / next / seek │
│  ├── 数据通道 (API): 歌单 / 搜索 / 歌词 / 推荐     │
│  └── 播放通道: 优先 DOM audio → 降级 API song/url   │
└────────┬──────────────────────┬──────────────────────┘
         │                      │
   Content Script          Background.js
   (DOM 操控音乐网页)     (fetch → API Server)
                                │
                    NeteaseCloudMusicApi Enhanced
                    (Vercel / Railway / 自建)
```

### 实施路径

**Phase A (v2.8.0)**: API 数据层接入
- 部署 NeteaseCloudMusicApi Enhanced 到 Vercel/Railway
- 实现二维码登录流程
- 通过 API 获取用户歌单列表（替代 DOM 提取）
- 通过 API 搜索歌曲（替代 DOM 交互链）
- 通过 API 获取歌词（替代 DOM 提取）

**Phase B (v2.9.0)**: 独立播放能力
- 通过 `/song/url` 获取音乐播放地址
- 在扩展内置 Audio 播放器（无需打开音乐网页标签）
- 实现纯 API 驱动的播放/切歌/进度控制

**Phase C (v3.0.0)**: 多平台 & 离线
- 预留 Spotify/QQ音乐接口适配层
- 播放历史记录 & 收藏同步
- 离线歌单缓存

---

## 五、风险评估

### 5.1 版权与法律风险

| 风险 | 等级 | 说明 | 应对 |
|------|------|------|------|
| 音乐版权 | ⚠️ 中 | 通过非官方 API 获取音乐 URL 存在版权灰色地带 | 仅在用户已登录自有账号的前提下使用；不缓存/分发音频内容 |
| API 服务稳定性 | ⚠️ 中 | 网易云可能封锁 API 服务器 IP | 支持自部署 + 多备用节点 |
| 账号安全 | ⚠️ 中 | Cookie 传输可能泄露 | 使用二维码登录，Cookie 仅本地存储，不上传 |
| Chrome 商店审核 | ⚠️ 中 | 调用第三方音乐 API 可能触发审核 | API 域名使用 optional_host_permissions，按需授权 |

### 5.2 技术风险

| 风险 | 等级 | 说明 | 应对 |
|------|------|------|------|
| API 服务部署成本 | 低 | Vercel 免费层 / Railway 免费额度 | 优先使用免费平台部署 |
| Cookie 过期 | 中 | 登录态可能失效 | 定期检测 + 自动刷新 + 引导重新登录 |
| API 接口变更 | 低 | Enhanced 版本活跃维护 | 关注上游更新，及时跟进 |
| 网络延迟 | 低 | 多一跳请求 | 数据预加载 + 本地缓存 |

### 5.3 用户体验风险

| 风险 | 等级 | 说明 | 应对 |
|------|------|------|------|
| 初次配置复杂 | 中 | 需要配置 API 地址 + 登录 | 提供一键部署教程 + 默认公共实例 |
| 两套系统并存 | 低 | DOM + API 双通道可能状态不一致 | 明确优先级：API 优先，DOM 降级 |

---

## 六、总结

### 推荐行动

1. **短期（v2.7.3）**: 继续优化 DOM 操控方案的稳定性，修复当前已知 bug
2. **中期（v2.8.0）**: 接入 NeteaseCloudMusicApi Enhanced 作为数据通道，解决歌单/搜索/歌词的稳定性问题
3. **长期（v3.0.0）**: 实现纯 API 驱动的独立播放能力，摆脱对音乐网页标签的依赖

### 投入预估

| 阶段 | 工作量 | 依赖 |
|------|--------|------|
| Phase A | 3-5 天 | Vercel 账号 + API 部署 |
| Phase B | 5-7 天 | Phase A 完成 |
| Phase C | 7-10 天 | Phase B 完成 |

---

*文档版本: v1.1 | 最后更新: 2026-03-18 | 新增 Cookie 直连方案（v2.8.0 已实现）*
