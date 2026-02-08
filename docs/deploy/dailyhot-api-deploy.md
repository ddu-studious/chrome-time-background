# DailyHotApi 部署指南

> **用途**: 为中国风景时钟扩展提供中国主流平台热搜/热榜数据  
> **项目**: [imsyy/DailyHotApi](https://github.com/imsyy/DailyHotApi)（3.5k Stars，MIT 协议）  
> **覆盖平台**: 微博、B站、知乎、抖音、百度、豆瓣、头条等 54 个平台

---

## 一、为什么要自部署

| 对比项 | 公共实例 | 自部署 |
|--------|---------|-------|
| 稳定性 | ❌ 不保证，海外服务器国内访问慢 | ✅ 自主可控 |
| CORS | ❌ 可能受限 | ✅ 可配置 `ALLOWED_DOMAIN=*` |
| 缓存策略 | ❌ 固定 60 分钟 | ✅ 可自定义 `CACHE_TTL` |
| 速率限制 | ❌ 与他人共享 | ✅ 独享 |
| 费用 | 免费 | 免费（Vercel/Railway 免费额度足够）|

---

## 二、部署方式选择

| 方式 | 难度 | 耗时 | 费用 | 推荐 |
|------|------|------|------|------|
| **Vercel** | ⭐ 极简 | 5 分钟 | 免费 | ⭐⭐⭐⭐⭐ |
| **Railway** | ⭐ 极简 | 5 分钟 | 免费（500h/月）| ⭐⭐⭐⭐ |
| **Docker（VPS）** | ⭐⭐⭐ | 15 分钟 | VPS 费用 | ⭐⭐⭐⭐ |
| **手动部署（VPS）** | ⭐⭐ | 10 分钟 | VPS 费用 | ⭐⭐⭐ |

---

## 三、方式 A：Vercel 部署（推荐）

### 前置条件

- GitHub 账号
- [Vercel](https://vercel.com) 账号（可用 GitHub 登录）

### 步骤

#### 1. Fork 仓库

访问 https://github.com/imsyy/DailyHotApi ，点击右上角 **Fork** 按钮，Fork 到自己的 GitHub 账号下。

#### 2. 登录 Vercel

访问 https://vercel.com ，使用 GitHub 账号登录。

#### 3. 导入项目

1. 点击 **Add New** → **Project**
2. 选择 **Import Git Repository**
3. 找到刚才 Fork 的 `DailyHotApi` 仓库
4. 点击 **Import**

#### 4. 配置环境变量

在 Vercel 项目设置中，添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|------|------|
| `PORT` | `6688` | 服务端口 |
| `ALLOWED_DOMAIN` | `*` | 允许所有域名跨域（Chrome 扩展需要）|
| `CACHE_TTL` | `1800` | 缓存 30 分钟（秒），默认 3600 |
| `REQUEST_TIMEOUT` | `8000` | 请求超时 8 秒 |
| `DISALLOW_ROBOT` | `true` | 禁止爬虫索引 |

#### 5. 部署

点击 **Deploy**，等待构建完成（约 1-2 分钟）。

#### 6. 获取 API 地址

部署成功后，Vercel 会分配一个地址，格式为：

```
https://daily-hot-api-xxxxx.vercel.app
```

你也可以绑定自定义域名（在 Vercel → Settings → Domains 中添加）。

#### 7. 验证

浏览器访问以下地址，确认返回 JSON 数据：

```
https://你的域名/weibo        # 微博热搜
https://你的域名/bilibili     # B站热榜
https://你的域名/zhihu        # 知乎热榜
https://你的域名/douyin       # 抖音热点
https://你的域名/baidu        # 百度热搜
```

---

## 四、方式 B：Railway 部署

### 步骤

1. 访问 https://railway.app ，使用 GitHub 登录
2. 点击 **New Project** → **Deploy from GitHub Repo**
3. 选择 Fork 的 `DailyHotApi` 仓库
4. 添加环境变量（同 Vercel 配置）
5. 等待部署完成
6. 在 Settings → Networking 中生成公网地址

---

## 五、方式 C：Docker 部署（VPS）

### 前置条件

- 一台 VPS（推荐 1核1G 即可）
- 已安装 Docker 和 Docker Compose

### 一键部署

项目提供了一键部署脚本，在 VPS 上执行：

```bash
curl -sSL https://raw.githubusercontent.com/你的用户名/DailyHotApi/master/deploy.sh | bash
```

或手动执行：

```bash
# 克隆仓库
git clone https://github.com/你的用户名/DailyHotApi.git
cd DailyHotApi

# 复制环境变量
cp .env.example .env

# 修改环境变量（按需）
# vim .env
# ALLOWED_DOMAIN=*
# CACHE_TTL=1800

# Docker 部署
docker-compose up -d

# 验证
curl http://localhost:6688/weibo
```

### 使用本项目提供的部署脚本

本项目在 `scripts/` 目录下提供了一键部署脚本：

```bash
# 赋予执行权限
chmod +x scripts/deploy-dailyhot.sh

# 执行部署
./scripts/deploy-dailyhot.sh
```

脚本会自动完成：克隆 → 配置 → Docker 启动 → 验证。

---

## 六、方式 D：手动部署（VPS / 本地）

```bash
# 克隆
git clone https://github.com/imsyy/DailyHotApi.git
cd DailyHotApi

# 安装依赖
npm install
# 或 pnpm install

# 配置
cp .env.example .env
# 编辑 .env，修改 ALLOWED_DOMAIN=*

# 开发模式
npm run dev

# 或编译运行
npm run build
npm run start

# 使用 pm2 守护进程（推荐）
npm i pm2 -g
pm2 start dist/index.js --name dailyhot-api
pm2 save
pm2 startup
```

---

## 七、部署后：接入扩展

部署完成后，需要在扩展代码中配置 API 地址。

### 1. 更新 `manifest.json`

在 `host_permissions` 中添加你的 API 域名：

```json
{
  "host_permissions": [
    "https://你的域名/*"
  ]
}
```

### 2. 更新 `js/ticker.js`

在 `TechTicker` 类中添加中国热搜数据源的 fetch 方法，API 基地址替换为你的部署地址：

```javascript
// DailyHotApi 基地址 - 替换为你的部署地址
const DAILYHOT_API = 'https://你的域名';

async fetchWeibo() {
    const resp = await fetch(`${DAILYHOT_API}/weibo`);
    const data = await resp.json();
    return (data.data || []).slice(0, 8).map(item => ({
        type: 'weibo',
        title: item.title,
        desc: `微博 · ${item.hot || ''}`,
        url: item.url || item.mobileUrl,
        icon: '🔥',
        metric: item.hot ? `${item.hot}` : '',
        metricType: 'weibo-hot'
    }));
}
```

### 3. API 响应格式参考

DailyHotApi 各平台返回格式统一：

```json
{
  "code": 200,
  "message": "获取成功",
  "name": "weibo",
  "title": "微博",
  "subtitle": "热搜榜",
  "total": 50,
  "updateTime": "2026-02-08T08:30:00.000Z",
  "data": [
    {
      "id": "1",
      "title": "话题标题",
      "desc": "描述文字",
      "hot": 5320000,
      "url": "https://...",
      "mobileUrl": "https://m..."
    }
  ]
}
```

各平台的 `data` 字段名基本一致，核心字段：

| 字段 | 说明 | 微博 | B站 | 知乎 |
|------|------|------|-----|------|
| `title` | 标题 | ✅ | ✅ | ✅ |
| `desc` | 描述 | ✅ | ✅ | ✅ |
| `hot` | 热度值 | ✅ | ✅ | ✅ |
| `url` | 链接 | ✅ | ✅ | ✅ |
| `mobileUrl` | 移动端链接 | ✅ | — | — |

---

## 八、运维与监控

### 健康检查

```bash
# 检查 API 是否正常
curl -s https://你的域名/weibo | jq '.code'
# 应返回 200
```

### 日志查看（Docker）

```bash
docker logs -f dailyhot-api --tail 50
```

### 更新版本

```bash
# Docker 方式
cd DailyHotApi
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Vercel/Railway
# 直接在 GitHub Fork 仓库中 Sync Fork 即可自动重新部署
```

### 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| 接口返回空 | 数据源网站变更 | 更新 DailyHotApi 到最新版 |
| CORS 错误 | 域名限制 | 确认 `ALLOWED_DOMAIN=*` |
| 超时 | 网络问题 | 增大 `REQUEST_TIMEOUT` |
| 429 错误 | 频率限制 | 增大 `CACHE_TTL` |

---

## 九、推荐配置

### 开发环境

```env
PORT=6688
ALLOWED_DOMAIN=*
CACHE_TTL=300          # 5 分钟缓存，方便调试
REQUEST_TIMEOUT=8000
USE_LOG_FILE=true
```

### 生产环境

```env
PORT=6688
ALLOWED_DOMAIN=*
CACHE_TTL=1800         # 30 分钟缓存
REQUEST_TIMEOUT=8000
DISALLOW_ROBOT=true
USE_LOG_FILE=true
```

---

**文档版本**: v1.0  
**创建日期**: 2026-02-08  
**配套脚本**: `scripts/deploy-dailyhot.sh`  
**关联调研**: `docs/research/china-hot-trending-ticker-research.md`
