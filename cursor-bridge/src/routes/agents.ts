import type { FastifyInstance } from 'fastify';
import { Cursor } from '@cursor/sdk';
import { config } from '../config.js';
import { agentPool } from '../services/agent-pool.js';

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.get('/agents', async () => {
    return { agents: agentPool.list() };
  });

  fastify.post<{ Body: { name: string; model?: string; cwd: string; description?: string } }>(
    '/agents',
    async (request, reply) => {
      const { name, model, cwd, description } = request.body || {};
      if (!name || !cwd) {
        return reply.code(400).send({ error: 'name and cwd are required' });
      }
      try {
        const agent = await agentPool.create({ name, model, cwd, description });
        return reply.code(201).send(agent);
      } catch (err: any) {
        const code = err.message.includes('pool is full') ? 429 : 500;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: { prompt: string } }>(
    '/agents/:id/send',
    async (request, reply) => {
      const { id } = request.params;
      const { prompt } = request.body || {};
      if (!prompt) {
        return reply.code(400).send({ error: 'prompt is required' });
      }
      try {
        const runId = await agentPool.send(id, prompt);
        return { runId, status: 'running' };
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404
          : err.message.includes('disposed') ? 410
          : 409;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/agents/:id/cancel',
    async (request, reply) => {
      try {
        await agentPool.cancel(request.params.id);
        return { status: 'cancelled' };
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404 : 409;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/agents/:id',
    async (request, reply) => {
      await agentPool.dispose(request.params.id);
      return reply.code(204).send();
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/agents/:id',
    async (request, reply) => {
      const agent = agentPool.get(request.params.id);
      if (!agent) return reply.code(404).send({ error: 'Agent not found' });
      return agentPool.getPublicInfo(request.params.id);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/agents/:id/history',
    async (request, reply) => {
      const history = agentPool.getHistory(request.params.id);
      if (!history) return reply.code(404).send({ error: 'Agent not found' });
      return { history };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { prompt: string } }>(
    '/agents/:id/resume',
    async (request, reply) => {
      const { id } = request.params;
      const { prompt } = request.body || {};
      if (!prompt) {
        return reply.code(400).send({ error: 'prompt is required' });
      }
      try {
        const runId = await agentPool.resume(id, prompt);
        return { runId, status: 'running' };
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404
          : err.message.includes('disposed') ? 410
          : 409;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.get('/models', async (_request, reply) => {
    try {
      const models = await Cursor.models.list({ apiKey: config.apiKey });
      return { models };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
