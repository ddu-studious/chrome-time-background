# 酷狗音乐（KuGou）Chrome 扩展集成调研报告

**调研角色**：Chrome 扩展音乐播放器集成（偏工程与合规）  
**背景**：新标签页扩展已实现网易云「Cookie / 登录态 + Offscreen Document」独立播放；需评估酷狗是否可采用同类方案。  
**调研日期**：2026-03-20  

---

## 执行摘要

| 维度 | 结论（简） |
|------|------------|
| **web.kugou.com** | 官方提示 **「网页版酷狗 play 已停止服务」**，不宜再作为独立网页播放器宿主。 |
| **www.kugou.com** | 门户 + 歌曲/歌单/MV/听书等 **传统 Web 形态**，实际播控依赖站内脚本与后端接口，而非单一稳定公开 API。 |
| **类 NeteaseCloudMusicApi 的酷狗实现** | **[MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)** 为社区最完整 Node 封装之一，原理为 **伪造请求头 + 调用官方接口**（README 自述含 CSRF 表述），功能面接近网易云 API 项目。 |
| **官方开放接口** | **[open.kugou.com](https://open.kugou.com/)「曲库开放计划」** 面向 **商业授权 / SDK 接入**，非面向个人扩展的免费 HTTP API。 |
| **Cookie 直连独立播放** | **部分可行**：纯 Cookie 往往不足以覆盖 **搜索签名、设备指纹（dfid）、mid** 等；需 **API 层逻辑**（或复用开源实现思路）才能稳定拿 `play_url`。 |
| **是否推荐开发酷狗独立集成** | **谨慎推荐**：工程上可做，但 **协议与版权风险高、接口与签名易变、web 播放器域名已下线**，长期维护成本明显高于网易云成熟路径。更稳妥的是 **官方商务授权** 或 **仅做 www.kugou.com 页内桥接**（与现有 `music-bridge` 思路一致）。 |

---

## 1. 酷狗音乐网页版结构

### 1.1 https://www.kugou.com/

- **定位**：酷狗主站门户，包含精选歌单、榜单、新歌、MV、听书、歌手入口等。
- **URL 形态示例**：`/mixsong/{id}.html`、`/songlist/gcid_xxx/`、`/singer/info/xxx/` 等，属 **内容站 + 站内播放器** 组合。
- **对扩展的含义**：若采用「Content Script 控制页面播放器」方案，需跟随 **DOM / 播放器脚本升级** 频繁改选择器；与网易云 `music.163.com` 相对集中的播放器 DOM 相比，**脆弱性更高**。

### 1.2 https://web.kugou.com/

- **当前状态（2026-03 抓取）**：页面明确说明 **「网页版酷狗 play 已停止服务」**，引导下载 **酷狗电脑版**；并附带移动端 App 后台网络被系统杀进程导致 **「异常断开」** 的说明。
- **结论**：**不应再依赖 `web.kugou.com` 作为「独立网页版播放器」集成目标**；仓库中 `manifest` / `music-bridge` 对 `web.kugou.com` 的匹配需视为 **兼容遗留或待下线**。

**可行性**：★☆☆☆☆（作为独立 Web 播放器宿主）

---

## 2. 网页侧 API 行为（非官方归纳）

> 下列接口来自社区逆向、博客与开源项目归纳，**非酷狗官方文档**，参数与域名可能变更。

### 2.1 常见域名与能力

| 能力 | 常见入口（示例） | 备注 |
|------|------------------|------|
| 搜索（偏移动 CDN） | `http://mobilecdn.kugou.com/api/v3/search/song` 等 | v3 风格接口，博客与聚合文档常见 |
| 搜索（新版/综合） | `https://complexsearch.kugou.com/v2/search/song` | 多篇文章提到需 **`signature` 等签名参数** |
| 播放信息 | `https://wwwapi.kugou.com/yy/index.php?r=play/getdata` | 依赖 `hash`、`album_id` 等，返回中含 **`play_url` / `play_backup_url`** 等字段（社区资料） |
| 歌词 | 常与播放信息或独立歌词接口同体系 | **MakcRe/KuGouMusicApi** 已实现「歌词搜索 / 获取歌词」等 |

### 2.2 Cookie / 登录态

- 社区资料指出部分场景需 **合理 Cookie / 设备标识**，例如 **`kg_mid`**、**`dfid`（设备指纹）**、**`mid`** 等与请求头组合；否则可能出现 **业务错误码**（如资料中提到的 `20010` 类问题，具体以实测为准）。
- **VIP / 高音质**：通常与 **账号登录态 + 服务端鉴权** 绑定，不是「匿名固定接口」可长期稳定复现。

**可行性（抽象 API 播放链）**：★★★☆☆（依赖持续逆向与对齐）

---

## 3. GitHub 与社区开源项目

### 3.1 接近 NeteaseCloudMusicApi 定位的项目

| 项目 | 说明 |
|------|------|
| **[MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)** | Node.js，README 写明灵感来自 **Binaryify/NeteaseCloudMusicApi**；工作原理为 **伪造请求头、调用官方 API**；功能列表覆盖 **登录、歌单、搜索、歌词、播放 URL、排行榜、评论** 等，**可作为技术对标对象**。 |
| **[LinZong/KugouMusicApi](https://github.com/LinZong/KugouMusicApi)** | Express 封装类项目（需自行评估更新频率）。 |
| **[keyule/KuGou-API](https://github.com/keyule/KuGou-API)** | Python，偏文档与脚本示例，提及海外区域限制等场景。 |
| **[MCQTSS/KuGouMusic](https://github.com/MCQTSS/KuGouMusic)** | Python，搜索与信息获取等。 |
| **Gitee 镜像/衍生** | 如 **cenguigui/KuGouMusicApi** 等，与 GitHub 项目可能同源或分叉，注意许可证与更新。 |

### 3.2 聚合播放器类扩展（参考「别人怎么做」）

- **Listen 1** 等多源扩展历史上会集成多家国内源（具体实现以各版本为准），说明 **「扩展内聚合 API」** 在工程上可行，但 **合规与商店审核** 是独立风险面。
- **UnlockKuGou** 等插件偏 **地区解锁 / Web 辅助**，与「新标签页独立解码播放」架构不完全相同。

**结论**：存在 **可 fork 学习的 Node 封装**，但没有网易云生态那样「单一事实标准」；扩展内落地需 **移植算法（签名、指纹、时间戳）** 或 **自建后端代理**（后者引入部署与隐私问题）。

---

## 4. 官方开放接口 vs 非官方逆向

### 4.1 官方：[open.kugou.com](https://open.kugou.com/)

- **酷狗曲库开放计划**：面向 **正版授权、App/SDK 接入**，需 **商务流程与控制台**（见站点导航中的 **控制台**、**open-player** 文档入口）。
- **对 Chrome 扩展**：除非走 **正式合作与授权**，否则 **不能** 将其视为与「网页抓包接口」等价的免费集成方案。

### 4.2 非官方逆向 API

- 典型特征：**无稳定 SLA**、**字段与加密策略随版本调整**、**可能针对异常流量风控**。
- **参数加密 / 签名（社区描述）**  
  - 多篇中文逆向文章描述 **`signature` 为 MD5**，拼接中包含 **固定密钥串**（例如博客中出现的 `NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt` 一类常量）及 `clienttime`、`keyword`、`appid` 等字段；**密钥与算法细节可能随时更换**，生产使用必须 **以抓包与回归测试为准**。

**可行性**：官方路径 ★★★★★（有预算与合同前提下）；逆向路径 ★★☆☆☆（技术可用、商业与合规弱）

---

## 5. Chrome 扩展集成可行性分析

### 5.1 「Cookie 直连」是否等价于网易云方案？

| 对比项 | 网易云（你们现状） | 酷狗 |
|--------|-------------------|------|
| **Web 播放器** | `music.163.com` 形态相对稳定 | **`web.kugou.com` 播放已停服**；主站为门户 + 内嵌逻辑 |
| **拿播放 URL** | 社区方案成熟，Cookie + 接口组合文档多 | 常需 **`hash` + `getdata` + 头/指纹/签名`**，**仅靠 Cookie 往往不够** |
| **风控** | 有加密与风控 | 同样有 **签名、设备指纹、Referer** 等（见下） |

**结论**：酷狗的「独立播放器」更像 **「迷你版 KuGouMusicApi 逻辑跑进扩展」**，而不是「只读 Cookie 就能复用网页同一套极简 API」。

### 5.2 音频 URL 防盗链 / 时效

- 社区经验：请求 API 时常需 **`Referer: https://www.kugou.com/`**（或同类）以满足服务端校验。
- 返回的 **`play_url` 往往带时效或一次性参数**（具体格式随 CDN 策略变），扩展内 **Offscreen `<audio>`** 播放需处理 **403 / 过期重取**。
- **结论**：存在 **防盗链与短效 URL** 风险，需 **重试与刷新播放信息** 的设计。

### 5.3 Manifest V3 实现要点（与你们架构对齐）

- **`host_permissions`**：需覆盖 `*.kugou.com` 下实际使用的 API 子域（如 `wwwapi`、`complexsearch`、`mobilecdn` 等，以实测为准）。
- **`chrome.cookies`**：可读取用户在 `kugou.com` 的登录相关 Cookie，与 **Offscreen Document** 内 `fetch` 组合时，要注意 **是否需 `credentials: 'include'`** 以及 **跨站 Cookie 属性（SameSite）** 限制。
- **Service Worker 限制**：重计算（如 MD5 签名）可放 SW 或 Offscreen；**不宜**假设与 Node 库 100% 同构，需 **抽核心纯函数** 或 **WASM/子线程**（若性能吃紧）。

**工程可行性**：★★★☆☆（能做，但签名与域名变更会消耗持续人力）

---

## 6. 版权、协议与法律风险

- 酷狗隶属 **腾讯音乐娱乐（TME）生态**，与 QQ 音乐、酷我等同属 **正版化与维权力度较强** 的一方。
- **用户协议**通常禁止未经授权的抓取、破解、绕过技术措施与商业性利用；扩展若 **向不特定用户分发「破解播放」能力**，法律与商店政策风险 **显著**。
- 参考：网易云 **NeteaseCloudMusicApi** 曾遭 **著作权与不正当竞争** 相关主张并停止维护（你们现有调研报告已记录）。酷狗侧 **同类风险不可忽视**。
- **建议**：仅 **个人学习、内测、不传播二进制** 与 **获得官方授权** 是两条相对低风险边界；**上架 Chrome Web Store 的公开扩展** 需产品级合规评估。

---

## 7. 综合建议

### 7.1 是否推荐开发「酷狗独立集成」（类网易云 Offscreen）？

**谨慎推荐（默认偏不推荐公开上架形态）**

- **技术**：可借鉴 **[MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)** 的请求与参数策略，在扩展内实现 **搜索 → hash → getdata → play_url → Offscreen 播放**；歌词、歌单等同理。
- **产品**：`web.kugou.com` **已停服**，用户心智与测试基准应转到 **`www.kugou.com` + 客户端**，预期管理成本上升。
- **合规**：公开分发前建议 **法务评审**；优先考虑 **官方 open.kugou 商务授权** 或 **仅页内控制不解析 CDN**。

### 7.2 若仍要推进，推荐技术路线（概述）

1. **能力分层**  
   - **P0**：在 `www.kugou.com` 上 **Content Script 桥接**（与现有 `music-bridge.js` 一致），不解析播放 URL。  
   - **P1**：独立播放：在 Background / Offscreen 内实现 **与 KuGouMusicApi 等价的签名与请求序列**，**可选** 使用 `chrome.cookies` 注入用户登录态以解锁 VIP 音质（若接口允许）。  
2. **密钥与算法**：**不要硬编码写死**社区博客密钥；以 **当前官网/客户端抓包** 为准，并做 **远程配置或快速热修** 能力。  
3. **播放与容错**：Offscreen `<audio>` + **`play_backup_url` 降级** + **URL 过期重拉**。  
4. **合规**：默认 **仅登录用户自用**、不缓存版权内容、不提供批量下载；文档与 UI 明确 **非官方、可能随时失效**。

### 7.3 与仓库现状的衔接说明

- `manifest.json` 与 `js/content-scripts/music-bridge.js` 已包含 **`www.kugou.com` / `web.kugou.com`**；在 `web.kugou.com` 停服前提下，宜将 **独立播放与联调重点放在 `www.kugou.com` 与 API 路径**，并重新验证 **酷狗选择器** 是否仍匹配当前 DOM。

---

## 8. 参考链接（外部）

- 酷狗主站：<https://www.kugou.com/>  
- 原网页播放域名（已提示停服）：<https://web.kugou.com/>  
- 酷狗开放平台入口：<https://open.kugou.com/>  
- KuGouMusicApi（Node）：<https://github.com/MakcRe/KuGouMusicApi>  
- 签名逆向示例（博客，算法可能过期）：[酷狗 signature 与爬虫相关文章](https://www.cnblogs.com/wxd501/p/17071045.html)  

---

*本报告仅供产品与工程决策参考，不构成法律意见。*
