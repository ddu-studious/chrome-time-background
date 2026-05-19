/**
 * Multi-Role Collaboration Module — 多角色协作模块
 *
 * 独立模块，使用 Cursor SDK 驱动多 Agent 团队协作。
 * 与写作 AI 补全模块完全解耦，各自独立迭代。
 *
 * 包含：
 *   - MultiRoleEngine: 协作引擎（任务分析/讨论/执行/QA/报告）
 *   - EnterpriseRoles: 角色模板与系统提示词
 *   - A2A Protocol: Agent Card 暴露与跨 Agent 发现
 *   - AgentRegistry: Agent 发现与注册
 *   - CollaborationState: 协作状态机管理
 */

export { multiRoleRoutes } from './routes.js';
export { a2aRoutes } from './a2a-routes.js';
export { agentRegistryRoutes, initAgentRegistry } from './registry.js';
export { collaborationRoutes, initCollaborationTables } from './collaboration-state.js';
export { initMultiRoleTables } from './engine-init.js';
