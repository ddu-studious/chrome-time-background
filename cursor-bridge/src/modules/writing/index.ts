/**
 * Writing AI Module — 写作 AI 补全模块
 *
 * 独立模块，使用千问 Qwen API 提供实时写作补全能力。
 * 与多角色协作模块完全解耦，各自独立迭代。
 *
 * 包含：
 *   - QwenClient: 千问 API 客户端（OpenAI 兼容接口）
 *   - WritingService: 补全/改写/摘要业务逻辑
 *   - WritingRoutes: HTTP API 路由（SSE 流式）
 *   - CompletionCache: 相似输入缓存复用
 *   - RAGService: 基于千问 embedding 的文档检索增强
 */

export { writingRoutes } from './routes.js';
export { initWritingTables } from './service.js';
export { isQwenConfigured } from './qwen-client.js';
export { initRAGTables } from './rag-service.js';
export { initHermesImportTables } from './hermes-import.js';
