# cursor-bridge

本地 Node.js 桥接服务，将 Cursor SDK 的 Agent 能力暴露为 HTTP/SSE API。

## 快速开始

```bash
# 安装依赖
npm install

# 配置
cp .env.example .env
# 编辑 .env 填入 CURSOR_API_KEY

# 开发模式
npm run dev
```

服务默认监听 `http://127.0.0.1:19840`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /agents | 列出所有 Agent |
| POST | /agents | 创建 Agent |
| POST | /agents/:id/send | 发送 prompt |
| POST | /agents/:id/cancel | 取消当前 run |
| DELETE | /agents/:id | 销毁 Agent |
| GET | /agents/:id/stream | SSE 实时输出 |
| GET | /models | 可用模型列表 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CURSOR_API_KEY | (必填) | Cursor API Key |
| BRIDGE_PORT | 19840 | 服务端口 |
| BRIDGE_HOST | 127.0.0.1 | 监听地址 |
| BRIDGE_MAX_AGENTS | 10 | Agent 池上限 |
| BRIDGE_DEFAULT_MODEL | composer-2 | 默认模型 |

## 已知问题

**sqlite3 架构不兼容**：如果 `npm install` 时的 Node.js 架构与运行时不同（如 Rosetta x64 Node + arm64 prebuild），需要手动重建：

```bash
cd node_modules/sqlite3 && npx node-gyp rebuild
```

`postinstall` 脚本会自动尝试重建。
