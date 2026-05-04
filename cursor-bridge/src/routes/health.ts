import type { FastifyInstance } from 'fastify';
import { agentPool } from '../services/agent-pool.js';
import { config } from '../config.js';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const stats = agentPool.stats();
    return {
      status: 'ok',
      version: '0.1.0',
      agents: agentPool.size,
      maxAgents: config.maxAgents,
      stats,
      uptime: Math.round((Date.now() - startTime) / 1000),
    };
  });
}
