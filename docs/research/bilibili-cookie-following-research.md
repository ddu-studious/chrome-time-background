# B站 Cookie 共享与关注列表推荐分类调研报告

> 调研日期：2026-03-22  
> 调研人：AI Agent  
> 关联版本：v3.8.0  
> 前置调研：[bilibili-offscreen-audio-research.md](./bilibili-offscreen-audio-research.md)

---

## 1. 调研结论

| 需求 | 可行性 | 技术路线 | 复杂度 |
|------|--------|----------|--------|
| Cookie 共享登录态 | ✅ 已实现 | `chrome.cookies.getAll({domain: '.bilibili.com'})` | 低 |
| 已购课程列表 | ✅ 可行 | iframe 嵌入 `cheese.bilibili.com/mine` + API 混合 | 中 |
| 关注列表展示 | ✅ 可行 | `/x/relation/followings` + 分组 tags | 低 |
| 关注 UP 主最新内容 | ✅ 可行 | `/x/polymer/web-dynamic/v1/feed/all` 或 space API | 中 |
| 按钮不跳转 | ✅ 可行 | 事件拦截 + `preventDefault()` | 低 |
| 关闭清除资源 | ✅ 可行 | 移除 iframe `src` + 清空 innerHTML | 低 |

---

## 2. Cookie 共享机制

### 2.1 技术原理

Chrome 扩展通过 `chrome.cookies` API 可以读取浏览器中任意已授权域名的 Cookie。当用户在浏览器中登录 bilibili.com 后，扩展可直接复用登录态。

```
用户浏览器登录 B站
  ↓
浏览器 Cookie 存储：SESSDATA、bili_jct、DedeUserID...
  ↓
chrome.cookies.getAll({domain: '.bilibili.com'})
  ↓
拼接为 Cookie 请求头，代理调用 B站 API
  ↓
等效于用户在 B站网页上的操作权限
```

### 2.2 关键 Cookie

| Cookie | 作用 | 已购课程是否需要 | 关注列表是否需要 |
|--------|------|-----------------|-----------------|
| `SESSDATA` | 会话凭证 | ✅ 必须 | ✅ 必须 |
| `bili_jct` | CSRF Token | 仅 POST 操作 | 仅 POST 操作 |
| `DedeUserID` | 用户 UID | ✅ 获取 vmid | ✅ 获取 vmid |
| `DedeUserID__ckMd5` | UID 校验 | 可选 | 可选 |

### 2.3 当前实现状态

`background.js` 中 `getBilibiliCookies()` 已实现完整的 Cookie 读取和拼接，所有 B站 API 调用均通过 Service Worker 代理并自动附带 Cookie。

### 2.4 已购课程权限共享

**核心问题**：用户在 B站已购买的课程，通过扩展能否访问？

**结论：可以。** 已购课程的访问权限完全绑定在 `SESSDATA` 上。扩展通过 `chrome.cookies` 读取同一 `SESSDATA`，调用课程 API 时具有相同权限。嵌入播放器 iframe 加载 `cheese.bilibili.com` 时，浏览器会自动携带域下的 Cookie，因此课程视频也可以正常播放。

---

## 3. 已购课程 API

### 3.1 API 端点

**获取已购课程列表**（需验证，B站文档未公开）：

| API | 方法 | 参数 | 鉴权 | 备注 |
|-----|------|------|------|------|
| `/pugv/app/v2/mine/seasons` | GET | `pn`(页码), `ps`(每页数) | Cookie(SESSDATA) | App 端 API |
| `/pugv/view/web/season` | GET | `season_id` | Cookie(SESSDATA) | 单课程详情 |
| `/pugv/view/web/ep/list` | GET | `season_id`, `pn`, `ps` | Cookie(SESSDATA) | 课程分集列表 |

### 3.2 推荐方案：iframe 混合模式

由于已购课程列表 API 未被社区完整文档化，推荐采用 **iframe 嵌入 + API 补充** 混合方案：

1. **课程 tab 默认**：嵌入 `https://www.bilibili.com/cheese/mine/list` 作为课程列表（用户已购课程页面）
2. **课程播放**：嵌入 `https://www.bilibili.com/cheese/play/ss{seasonId}` 播放具体课程
3. **API 补充**：通过 `/pugv/view/web/season` 获取课程元数据（标题、封面、进度等）

**优势**：
- 无需逆向未文档化的 API
- 浏览器自动携带 Cookie，权限与网页完全一致
- 用户看到的就是 B站官方课程页面

---

## 4. 关注列表 API

### 4.1 关注列表

| API | 方法 | 参数 | 鉴权 | WBI |
|-----|------|------|------|-----|
| `/x/relation/followings` | GET | `vmid`(用户mid), `order_type`(排序), `ps`(默认50), `pn` | Cookie | ❌ 不需要 |
| `/x/relation/followings/search` | GET | `vmid`, `name`(搜索关键词), `ps`, `pn` | Cookie | ❌ 不需要 |

**响应结构**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "mid": 123456,
        "uname": "UP主昵称",
        "face": "头像URL",
        "sign": "个人签名",
        "official_verify": { "type": 0, "desc": "认证信息" },
        "vip": { "vipType": 2, "label": {...} },
        "attribute": 2
      }
    ],
    "total": 100
  }
}
```

### 4.2 关注分组（推荐分类基础）

| API | 方法 | 参数 | 鉴权 | 说明 |
|-----|------|------|------|------|
| `/x/relation/tags` | GET | 无 | Cookie | 获取所有分组 |
| `/x/relation/tag` | GET | `tagid`, `order_type`, `ps`, `pn` | Cookie | 获取某分组内成员 |

**分组说明**：
- `tagid = -10`：特别关注
- `tagid = 0`：默认分组
- 用户自定义分组：`tagid > 0`

### 4.3 关注动态 Feed

| API | 方法 | 参数 | 鉴权 |
|-----|------|------|------|
| `/x/polymer/web-dynamic/v1/feed/all` | GET | `timezone_offset`(-480), `type`(all), `page`, `offset` | Cookie |

### 4.4 UP 主空间视频

| API | 方法 | 参数 | 鉴权 |
|-----|------|------|------|
| `/x/space/wbi/arc/search` | GET | `mid`, `ps`, `tid`, `pn`, `order` | Cookie + WBI |

---

## 5. 关注列表推荐分类设计

### 5.1 分类策略

利用 B站自带的 **关注分组** 功能作为基础分类，同时根据 UP 主属性进行智能补充：

```
关注列表
├── 🌟 特别关注（tagid = -10）
├── 📂 用户自定义分组 1（tagid = N）
├── 📂 用户自定义分组 2（tagid = M）
├── ✅ 认证 UP 主（official_verify.type >= 0）
├── 👑 大会员 UP 主（vip.vipType > 0）
└── 📦 默认分组（tagid = 0）
```

### 5.2 UI 设计

```
┌─────────────────────────────────────┐
│ 👥 关注列表              🔍 搜索    │
├─────────────────────────────────────┤
│ [全部] [特别关注] [分组1] [分组2]   │
├─────────────────────────────────────┤
│ ┌──────┐ UP主名称 ①认证            │
│ │ 头像 │ 个人签名...               │
│ └──────┘ 最新视频: xxxxx    →      │
├─────────────────────────────────────┤
│ ┌──────┐ UP主名称 ②大会员          │
│ │ 头像 │ 个人签名...               │
│ └──────┘ 最新视频: xxxxx    →      │
└─────────────────────────────────────┘
```

---

## 6. 按钮不跳转方案

### 6.1 问题分析

当前 B站浮层中，以下元素会触发跳转：
- 课程 tab 顶部的「前往课程中心」链接（`<a href="..." target="_blank">`）
- 列表项中可能包含的链接
- iframe 内部的链接（受限于跨域策略）

### 6.2 解决方案

1. **移除所有外链**：课程 tab 不再使用「前往课程中心」外链
2. **事件委托拦截**：在面板根元素上拦截所有 `<a>` 标签的 click 事件
3. **iframe sandbox**：对嵌入 iframe 添加 `sandbox` 属性限制导航

```javascript
// 面板级别拦截
panel.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href]');
    if (anchor) {
        e.preventDefault();
        e.stopPropagation();
    }
});
```

---

## 7. 关闭清除资源方案

### 7.1 资源释放策略

```javascript
hide() {
    // 1. 销毁 iframe（释放视频资源）
    const frame = this._el.querySelector('#bili-player-frame');
    const iframe = frame.querySelector('iframe');
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.remove();
    }
    
    // 2. 恢复默认占位
    frame.innerHTML = '<div class="bili-player-empty">...</div>';
    
    // 3. 隐藏信息栏
    this._el.querySelector('#bili-player-info').classList.add('hidden');
    
    // 4. 清除当前视频状态
    this._currentVideo = null;
    
    // 5. 隐藏面板
    this._panelOpen = false;
    this._el.classList.remove('visible');
    document.body.classList.remove('bili-panel-open');
}
```

---

## 8. 风险评估

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|----------|
| 已购课程 API 不稳定 | 🟡 中 | 非公开 API | iframe 兜底方案 |
| 关注列表分页限制 | 🟢 低 | 自己的列表无限制 | 分页加载 |
| B站 Cookie 过期 | 🟢 低 | 与浏览器一致 | 提示用户重新登录 |
| WBI 签名变更 | 🟢 低 | 关注/课程 API 不需 WBI | 仅搜索受影响 |
| iframe 跨域限制 | 🟡 中 | 无法控制 iframe 内按钮 | sandbox + 提示 |

---

## 9. 实施计划

### v3.7.0 变更清单

| 序号 | 任务 | 优先级 | 预估 |
|------|------|--------|------|
| 1 | 关注列表 tab + 分组分类 UI | P0 | 2h |
| 2 | 已购课程 iframe 嵌入（替代搜索） | P0 | 1h |
| 3 | 关闭面板清除视频资源 | P0 | 30min |
| 4 | 按钮不跳转拦截 | P0 | 30min |
| 5 | 更新 background.js API 白名单 | P0 | 15min |
| 6 | 更新设置说明书 | P1 | 30min |
| 7 | 版本号更新 | P0 | 5min |

---

## 10. 参考资源

- [Chrome cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [BAC Document（bilibili-API-collect 镜像）](https://sessionhu.github.io/bilibili-API-collect/)
- [B站关系接口文档](https://lxb007981.github.io/bilibili-API-collect/user/relation.html)
- [B站课堂接口文档](https://lxb007981.github.io/bilibili-API-collect/cheese/info.html)
- [B站动态 Feed API](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/dynamic/space.md)
