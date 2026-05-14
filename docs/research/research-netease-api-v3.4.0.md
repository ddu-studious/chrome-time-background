# 网易云音乐 Web API 调研报告（Cookie 直连 / 2026 年 3 月）

**调研日期**: 2026-03-20  
**调研背景**: 扩展 v3.3.1 发现 songs 相关接口返回 404，需排查接口变更并制定适配方案  
**扩展版本**: v3.4.0  

---

## 一、问题描述

扩展通过 Cookie 直连方式调用网易云音乐 API，发现 `/api/v6/recommend/songs`（每日推荐）接口返回 404 错误。

## 二、各接口现状

| 接口 | 状态 | 说明 |
|------|------|------|
| `/api/nuser/account/get` | ✅ 可用 | 需登录 Cookie，返回用户信息 |
| `/api/user/playlist` | ✅ 可用 | 需登录 Cookie + uid 参数 |
| `/api/v6/playlist/detail` | ✅ 可用 | GET 方式仍可返回数据 |
| `/api/playlist/detail` | ✅ 可用 | 注意返回结构可能包裹在 `result` 中 |
| `/api/v3/song/detail` | ✅ 可用 | GET 带 `c` 参数可返回 `songs` 数组 |
| `/api/search/get/web` | ✅ 可用 | GET 搜索入口 |
| `/api/song/lyric` | ✅ 可用 | GET/POST 均可 |
| **`/api/v6/recommend/songs`** | ❌ 已下线 | **返回 HTTP 200 但 JSON `code: 404`** |
| `/api/v3/discovery/recommend/songs` | ✅ 可用 | **替代接口，返回 `dailySongs` 结构** |
| `/api/song/enhance/player/url/v1` | ✅ 可用 | POST 明文可返回播放 URL |
| `/api/song/enhance/player/url` | ✅ 可用 | 旧版播放 URL 接口 |
| `/api/song/url/v1` | ✅ 可用 | 第三方降级 |

## 三、404 问题根因分析

### 3.1 区分 HTTP 404 与业务 404

- **HTTP 404**：极少见于网易云 JSON API
- **业务 404**：`{"code": 404, "message": "接口未找到！"}` — **该 API 路由未注册或已关闭**

扩展原逻辑通过 `resp.ok`（HTTP 状态码）判断，会误判 HTTP 200 + 业务 code 404 为成功。

### 3.2 `/api/v6/recommend/songs` 已废弃

对照开源 NeteaseCloudMusicApi 项目：
- `recommend_songs.js` 使用的是 `POST + weapi → /api/v3/discovery/recommend/songs`
- **没有任何模块使用 `/api/v6/recommend/songs`**
- 结论：v6 路径已下线/未路由

### 3.3 `/api/playlist/detail` 响应结构差异

- `/api/v6/playlist/detail` → `data.playlist`
- `/api/playlist/detail` → `data.result.playlist` 或 `data.playlist`

需兼容两种解析路径。

## 四、v3.4.0 修复方案

### 4.1 推荐接口替换

```javascript
// 修改前（v3.3.1）
const resp = await this._neteaseApi('/api/v6/recommend/songs');

// 修改后（v3.4.0）
const resp = await this._neteaseApi('/api/v3/discovery/recommend/songs');
const dailySongs = resp?.ok ? (resp?.data?.data?.dailySongs || resp?.data?.dailySongs) : null;
```

### 4.2 增加业务 code 校验

```javascript
// _neteaseApi 增加 body.code 校验
if (resp?.ok && resp?.data && typeof resp.data.code === 'number' && resp.data.code !== 200) {
    return { ok: false, data: resp.data, error: `biz-code-${resp.data.code}` };
}
```

### 4.3 热门歌曲降级兼容

```javascript
// 兼容两种响应结构
const hotPlaylist = hotResp?.ok ? (hotResp?.data?.playlist || hotResp?.data?.result?.playlist) : null;
```

## 五、长期风险与建议

| 风险 | 等级 | 应对 |
|------|------|------|
| 网易云全站升级 weapi/eapi 加密 | 中 | 保留多策略降级链；远期考虑移植加密层 |
| Cookie 过期 | 低 | 已有引导重新登录机制 |
| 更多接口废弃 | 中 | 定期对照 NeteaseCloudMusicApi 更新 |
| GET 方式被限制 | 低 | 可在 neteaseApiCall 中按接口切换 POST |

## 六、后续优化方向

1. **接口监控**：在 `neteaseApiCall` 中记录每个接口的 HTTP 状态 + 业务 code，便于快速定位
2. **POST 适配**：对关键接口（recommend/lyric/song/detail）准备 POST 明文降级
3. **weapi 加密预研**：参考 NeteaseCloudMusicApi 的 crypto 模块，为强制加密场景做准备

---

*文档版本: v1.0 | 评估日期: 2026-03-20*
