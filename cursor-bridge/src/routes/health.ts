import type { FastifyInstance } from 'fastify';
import { agentPool } from '../services/agent-pool.js';
import { config } from '../config.js';
import {
  getStats, getTokenStats, getTokenUsageSummary, getRecentTokenUsage,
  getTokenUsageByAgent, getTokenUsageByProject,
} from '../services/database.js';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const stats = agentPool.stats();
    return {
      status: 'ok',
      version: '1.0.0',
      pid: process.pid,
      agents: agentPool.size,
      maxAgents: config.maxAgents,
      stats,
      uptime: Math.round((Date.now() - startTime) / 1000),
    };
  });

  fastify.get('/stats', async () => {
    return {
      ...getStats(),
      agents: agentPool.stats(),
    };
  });

  fastify.get('/stats/tokens', async () => {
    return {
      legacy: getTokenStats(),
      usage: getTokenUsageSummary(),
    };
  });

  fastify.get('/stats/tokens/recent', async (_req) => {
    return { records: getRecentTokenUsage(30) };
  });

  fastify.get<{ Params: { id: string } }>('/stats/tokens/agent/:id', async (req) => {
    return getTokenUsageByAgent(req.params.id) || { total_input: 0, total_output: 0, total: 0, run_count: 0 };
  });

  fastify.get<{ Params: { id: string } }>('/stats/tokens/project/:id', async (req) => {
    return { byModel: getTokenUsageByProject(req.params.id) };
  });
}
