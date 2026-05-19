/**
 * Agent Registry — Agent 发现与动态注册
 *
 * 实现 A2A 协议中的 Agent 发现机制：
 *   - 外部 Agent 可以注册到本平台
 *   - 平台可以发现并调用外部 Agent
 *   - 支持能力查询与路由匹配
 */

import type { FastifyInstance } from 'fastify';
import { getDb } from '../../services/database.js';

export interface RegisteredAgent {
  id: string;
  name: string;
  url: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'error';
  lastHeartbeat: number;
  metadata?: Record<string, any>;
  registeredAt: number;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
}

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export function initAgentRegistry() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      last_heartbeat INTEGER NOT NULL,
      metadata TEXT DEFAULT '{}',
      registered_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry(status);
    CREATE INDEX IF NOT EXISTS idx_agent_registry_caps ON agent_registry(capabilities);
  `);
}

function getActiveAgents(): RegisteredAgent[] {
  const db = getDb();
  const rows: any[] = db.prepare(
    'SELECT * FROM agent_registry WHERE status = ? ORDER BY last_heartbeat DESC'
  ).all('active');

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    capabilities: JSON.parse(r.capabilities),
    status: r.status,
    lastHeartbeat: r.last_heartbeat,
    metadata: JSON.parse(r.metadata || '{}'),
    registeredAt: r.registered_at,
  }));
}

function registerAgent(agent: {
  id: string;
  name: string;
  url: string;
  capabilities: string[];
  metadata?: Record<string, any>;
}): RegisteredAgent {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO agent_registry (id, name, url, capabilities, status, last_heartbeat, metadata, registered_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    agent.id,
    agent.name,
    agent.url,
    JSON.stringify(agent.capabilities),
    now,
    JSON.stringify(agent.metadata || {}),
    now,
  );

  return {
    id: agent.id,
    name: agent.name,
    url: agent.url,
    capabilities: agent.capabilities,
    status: 'active',
    lastHeartbeat: now,
    metadata: agent.metadata,
    registeredAt: now,
  };
}

function heartbeat(agentId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'UPDATE agent_registry SET last_heartbeat = ?, status = ? WHERE id = ?'
  ).run(Date.now(), 'active', agentId);
  return result.changes > 0;
}

function deregisterAgent(agentId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'UPDATE agent_registry SET status = ? WHERE id = ?'
  ).run('inactive', agentId);
  return result.changes > 0;
}

function findAgentsByCapability(capability: string): RegisteredAgent[] {
  const agents = getActiveAgents();
  return agents.filter((a) => a.capabilities.includes(capability));
}

function routeTask(requirement: string): { agents: RegisteredAgent[]; confidence: number } {
  const keywords: Record<string, string[]> = {
    'code-generation': ['代码', '实现', '开发', '编写', '函数', '类', 'API'],
    'testing': ['测试', '验证', 'QA', '回归', '单元测试'],
    'review': ['审查', '代码审查', 'review', 'CR', '评审'],
    'design': ['设计', '架构', '方案', '规划', 'UI', 'UX'],
    'documentation': ['文档', '注释', '说明', 'README', '指南'],
    'deployment': ['部署', '发布', '上线', 'CI', 'CD', 'Docker'],
  };

  const matchedCapabilities: string[] = [];
  for (const [cap, words] of Object.entries(keywords)) {
    if (words.some((w) => requirement.includes(w))) {
      matchedCapabilities.push(cap);
    }
  }

  if (matchedCapabilities.length === 0) {
    return { agents: getActiveAgents(), confidence: 0.3 };
  }

  const matchedMap = new Map<string, RegisteredAgent>();
  for (const cap of matchedCapabilities) {
    for (const agent of findAgentsByCapability(cap)) {
      matchedMap.set(agent.id, agent);
    }
  }

  const agents = [...matchedMap.values()];
  const confidence = Math.min(0.95, 0.5 + matchedCapabilities.length * 0.15);

  return { agents, confidence };
}

function gcStaleAgents() {
  const db = getDb();
  const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
  db.prepare(
    'UPDATE agent_registry SET status = ? WHERE status = ? AND last_heartbeat < ?'
  ).run('inactive', 'active', cutoff);
}

export async function agentRegistryRoutes(app: FastifyInstance) {
  app.get('/registry/agents', async () => {
    gcStaleAgents();
    const agents = getActiveAgents();
    return { agents, total: agents.length };
  });

  app.post('/registry/agents', async (req) => {
    const body = req.body as {
      id: string;
      name: string;
      url: string;
      capabilities: string[];
      metadata?: Record<string, any>;
    };

    if (!body.id || !body.name || !body.url) {
      return { error: 'id, name, and url are required' };
    }

    const agent = registerAgent(body);
    return { success: true, agent };
  });

  app.post('/registry/agents/:id/heartbeat', async (req) => {
    const { id } = req.params as { id: string };
    const ok = heartbeat(id);
    return ok ? { success: true } : { error: 'Agent not found' };
  });

  app.delete('/registry/agents/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ok = deregisterAgent(id);
    return ok ? { success: true } : { error: 'Agent not found' };
  });

  app.post('/registry/discover', async (req) => {
    const { capability } = req.body as { capability: string };
    if (!capability) return { error: 'capability is required' };
    gcStaleAgents();
    const agents = findAgentsByCapability(capability);
    return { agents, total: agents.length };
  });

  app.post('/registry/route', async (req) => {
    const { requirement } = req.body as { requirement: string };
    if (!requirement) return { error: 'requirement is required' };
    gcStaleAgents();
    const result = routeTask(requirement);
    return {
      matchedAgents: result.agents,
      confidence: result.confidence,
      total: result.agents.length,
    };
  });
}
