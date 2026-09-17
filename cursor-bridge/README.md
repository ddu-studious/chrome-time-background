# 本地写作 Bridge

保留原目录与19840端口，提供写作、RAG、Prompt管理及历史数据接口。Cursor SDK智能体功能已移除，不再需要Cursor API Key。

先启动项目的local-ai控制面，再执行 `npm run build` 和 `npm start`。模型、预算和开关统一在AI控制台设置。

可选环境变量：`BRIDGE_HOST`（默认127.0.0.1）、`BRIDGE_PORT`（默认19840）、`LOCAL_AI_TOKEN_FILE`（默认项目local-ai/.local/token）、`CURSOR_BRIDGE_DATA_DIR`（兼容原数据目录配置）。历史数据库保持原位。
