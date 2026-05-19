/**
 * Phase 6 — A2A Protocol & Ecosystem Integration
 *
 * Implements:
 *   - Agent Card exposure (/.well-known/agent.json)
 *   - Agent capability discovery
 *   - Cross-session memory foundation (FTS5 search)
 *   - Browser automation hook endpoint
 */

import type { FastifyInstance } from 'fastify';
import { ENTERPRISE_ROLES } from '../services/enterprise-roles.js';
import { config } from '../config.js';
import { checkBrowserConnection, executeAction } from '../services/browser-automation.js';
import { searchMemories, createMemory, getMemoryStats } from '../services/memory-service.js';

const AGENT_CARD = {
  schema: 'https://a2a-protocol.org/schema/agent-card/v1',
  name: 'Cursor Bridge',
  description: '多角色协作 Agent 平台 — 模拟真实公司团队协作完成项目全生命周期',
  version: '1.0.0',
  url: `http://${config.host}:${config.port}`,
  capabilities: {
    taskAnalysis: {
      description: '自然语言需求分析，自动推荐角色和生成执行计划',
      endpoint: '/tasks/analyze',
      method: 'POST',
    },
    multiRoleDiscussion: {
      description: '多角色结构化讨论，支持多轮发言和 Tech Lead 裁决',
      endpoint: '/discussions/:id/round',
      method: 'POST',
    },
    executionSquad: {
      description: '项目经理带队的任务分解、分配和执行',
      endpoint: '/squads/:id/execute/:taskId',
      method: 'POST',
    },
    qaFeedbackLoop: {
      description: 'QA 闭环测试：测试 → Bug → 修复 → 回归',
      endpoint: '/qa/:id/run',
      method: 'POST',
    },
    whitebox: {
      description: '白盒可观测性：时间线、决策日志、因果图、回放',
      endpoint: '/traces',
      method: 'GET',
    },
  },
  roles: ENTERPRISE_ROLES.map((r) => ({
    id: r.id,
    name: r.name,
    nameEn: r.nameEn,
    icon: r.icon,
    phases: r.phase,
    canVeto: r.skill.canVeto,
    canDelegate: r.skill.canDelegate,
  })),
  supportedModels: [
    'claude-sonnet-4-6',
    'claude-opus-4-20250514',
    'gpt-4o',
    'gemini-2.5-pro',
  ],
  protocols: ['http', 'sse'],
  authentication: {
    type: 'bearer',
    header: 'Authorization',
  },
};

export async function a2aRoutes(app: FastifyInstance) {
  app.get('/.well-known/agent.json', async () => {
    return AGENT_CARD;
  });

  app.get('/a2a/capabilities', async () => {
    return {
      agentCard: AGENT_CARD,
      lifecycle: {
        phases: ['analysis', 'discussion', 'execution', 'qa', 'deployment', 'summary'],
        maxRolesPerSession: config.maxAgents,
        supportedWorkflows: ['waterfall', 'agile-sprint', 'code-review', 'security-audit'],
      },
      observability: {
        traceTypes: 18,
        views: ['timeline', 'decisions', 'role-perspective', 'causal-graph', 'replay'],
      },
    };
  });

  app.get('/a2a/health', async () => {
    return {
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      capabilities: Object.keys(AGENT_CARD.capabilities),
    };
  });

  // ─── Phase 6.2: Browser Automation ───

  app.get('/a2a/browser/status', async () => {
    return checkBrowserConnection(config.cdpPort);
  });

  app.post('/a2a/browser/action', async (req) => {
    const { action, target, params } = req.body as {
      action: string; target?: string; params?: Record<string, any>;
    };
    const validActions = ['navigate', 'click', 'type', 'screenshot', 'evaluate', 'waitFor', 'getContent', 'getTabs'];
    if (!validActions.includes(action)) {
      return { success: false, error: `Invalid action. Supported: ${validActions.join(', ')}` };
    }
    return executeAction({ action: action as any, target, params }, config.cdpPort);
  });

  app.post('/a2a/browser/batch', async (req) => {
    const { actions } = req.body as { actions: Array<{ action: string; target?: string; params?: Record<string, any> }> };
    if (!Array.isArray(actions) || actions.length === 0) {
      return { success: false, error: 'actions array is required' };
    }
    const results = [];
    for (const act of actions.slice(0, 20)) {
      results.push(await executeAction({ action: act.action as any, target: act.target, params: act.params }, config.cdpPort));
    }
    return { results, total: results.length };
  });

  // ─── Phase 6.3: Cross-Session Memory ───

  app.post('/a2a/memory/search', async (req) => {
    const { query, limit } = req.body as { query: string; limit?: number };
    if (!query) return { results: [], total: 0 };
    const results = searchMemories(query, limit || 10);
    return { results, total: results.length };
  });

  app.post('/a2a/memory/create', async (req) => {
    const body = req.body as {
      type?: string; content: string; summary?: string;
      source: string; sourceId?: string; tags?: string[]; importance?: number;
    };
    if (!body.content || !body.source) {
      return { error: 'content and source are required' };
    }
    const entry = createMemory({
      type: body.type as any || 'context',
      content: body.content,
      summary: body.summary,
      source: body.source,
      sourceId: body.sourceId,
      tags: body.tags,
      importance: body.importance,
    });
    return entry;
  });

  app.get('/a2a/memory/stats', async () => {
    return getMemoryStats();
  });
}
