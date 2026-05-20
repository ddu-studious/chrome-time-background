import type { FastifyInstance } from 'fastify';
import { Cursor } from '@cursor/sdk';
import { config } from '../config.js';
import { agentPool } from '../services/agent-pool.js';
import { sendAgentMessage, getAgentMessages, getAgentMessagesSent, markAgentMessageRead } from '../services/database.js';
import { updateAvailableModelsFromApi } from '../services/enterprise-roles.js';

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

  // ─── Agent 间消息通信 ───

  fastify.post<{ Params: { id: string }; Body: { fromAgent: string; content: string; type?: string } }>(
    '/agents/:id/message',
    async (request, reply) => {
      const { id } = request.params;
      const { fromAgent, content, type } = request.body || {};
      if (!fromAgent || !content) {
        return reply.code(400).send({ error: 'fromAgent and content are required' });
      }
      const msg = sendAgentMessage(fromAgent, id, content, type || 'reference');
      return reply.code(201).send(msg);
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { direction?: string; limit?: string } }>(
    '/agents/:id/messages',
    async (request) => {
      const { id } = request.params;
      const dir = request.query.direction || 'received';
      const limit = parseInt(request.query.limit || '50', 10);
      const messages = dir === 'sent'
        ? getAgentMessagesSent(id, limit)
        : getAgentMessages(id, limit);
      return { messages };
    }
  );

  fastify.post<{ Params: { id: string; msgId: string } }>(
    '/agents/:id/messages/:msgId/read',
    async (request) => {
      markAgentMessageRead(parseInt(request.params.msgId, 10));
      return { status: 'ok' };
    }
  );

  // ─── Human-in-the-Loop Approval Gate ───

  fastify.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/agents/:id/approval',
    async (request, reply) => {
      try {
        agentPool.setApprovalEnabled(request.params.id, request.body?.enabled ?? false);
        return { status: 'ok', enabled: request.body?.enabled };
      } catch (err: any) {
        return reply.code(404).send({ error: err.message });
      }
    }
  );

  fastify.get('/approvals', async () => {
    return { approvals: agentPool.getPendingApprovals() };
  });

  fastify.get<{ Params: { id: string } }>(
    '/agents/:id/approvals',
    async (request) => {
      return { approvals: agentPool.getPendingApprovals(request.params.id) };
    }
  );

  fastify.post<{
    Params: { id: string; approvalId: string };
    Body: { approved: boolean; message?: string };
  }>(
    '/agents/:id/approvals/:approvalId/resolve',
    async (request, reply) => {
      const { approved, message } = request.body || {};
      if (typeof approved !== 'boolean') {
        return reply.code(400).send({ error: 'approved (boolean) is required' });
      }
      const resolved = agentPool.resolveApproval(
        request.params.id, request.params.approvalId, approved, message
      );
      if (!resolved) return reply.code(404).send({ error: 'Approval not found or already resolved' });
      return { status: 'ok' };
    }
  );

  // ─── Emergency Stop All ───

  fastify.post('/agents/emergency-stop', async () => {
    const stopped = await agentPool.emergencyStopAll();
    return { status: 'ok', stoppedCount: stopped };
  });

  fastify.get('/models', async (_request, reply) => {
    try {
      const models = await Cursor.models.list({ apiKey: config.apiKey });
      if (Array.isArray(models)) {
        updateAvailableModelsFromApi(models as { id: string; displayName?: string }[]);
      }
      return { models };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
