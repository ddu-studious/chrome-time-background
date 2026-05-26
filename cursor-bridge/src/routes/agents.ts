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

  fastify.post<{ Body: {
    name: string;
    model?: string;
    modelParams?: Array<{ id: string; value: string }>;
    mode?: 'agent' | 'plan';
    cwd: string;
    description?: string;
    mcpServers?: Record<string, any>;
    resumeAgentId?: string;
    agents?: Record<string, { description: string; prompt: string; model?: any; mcpServers?: any[] }>;
    cloud?: { repos: Array<{ url: string; startingRef?: string }>; autoCreatePR?: boolean; envVars?: Record<string, string> };
  } }>(
    '/agents',
    async (request, reply) => {
      const { name, model, modelParams, mode, cwd, description, mcpServers, resumeAgentId, agents: subAgents, cloud } = request.body || {};
      if (!name) {
        return reply.code(400).send({ error: 'name is required' });
      }
      if (!cloud && !cwd) {
        return reply.code(400).send({ error: 'cwd is required for local agents' });
      }
      try {
        const agent = await agentPool.create({
          name, model, modelParams, mode,
          cwd: cwd || process.cwd(),
          description, mcpServers, resumeAgentId,
          agents: subAgents, cloud,
        });
        return reply.code(201).send(agent);
      } catch (err: any) {
        const code = err.message.includes('pool is full') ? 429 : 500;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: { prompt: string; images?: Array<{ url?: string; data?: string; mimeType?: string; dimension?: { width: number; height: number } }> } }>(
    '/agents/:id/send',
    async (request, reply) => {
      const { id } = request.params;
      const { prompt, images } = request.body || {};
      if (!prompt) {
        return reply.code(400).send({ error: 'prompt is required' });
      }
      try {
        const runId = await agentPool.send(id, prompt, images);
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

  // ─── Structured Conversation History ───

  fastify.get<{ Params: { id: string } }>(
    '/agents/:id/conversation',
    async (request, reply) => {
      try {
        const turns = await agentPool.getConversation(request.params.id);
        return { turns };
      } catch (err: any) {
        return reply.code(404).send({ error: err.message });
      }
    }
  );

  // ─── SDK Agent Discovery (Agent.list / Agent.get / Agent.listRuns) ───

  fastify.get<{ Querystring: { cwd?: string } }>(
    '/sdk/agents',
    async (request) => {
      const agents = await agentPool.listSdkAgents(request.query.cwd);
      return { agents };
    }
  );

  fastify.get<{ Params: { sdkAgentId: string } }>(
    '/sdk/agents/:sdkAgentId',
    async (request, reply) => {
      const agent = await agentPool.getSdkAgent(request.params.sdkAgentId);
      if (!agent) return reply.code(404).send({ error: 'SDK Agent not found' });
      return agent;
    }
  );

  fastify.get<{ Params: { sdkAgentId: string } }>(
    '/sdk/agents/:sdkAgentId/runs',
    async (request) => {
      const runs = await agentPool.listSdkRuns(request.params.sdkAgentId);
      return { runs };
    }
  );

  // ─── One-shot prompt (Agent.prompt) ───

  fastify.post<{ Body: {
    prompt: string;
    model?: string;
    modelParams?: Array<{ id: string; value: string }>;
    cwd?: string;
    mcpServers?: Record<string, any>;
  } }>(
    '/agents/prompt',
    async (request, reply) => {
      const { prompt, model, modelParams, cwd, mcpServers } = request.body || {};
      if (!prompt) return reply.code(400).send({ error: 'prompt is required' });
      try {
        const result = await agentPool.prompt({ prompt, model, modelParams, cwd, mcpServers });
        return result;
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // ─── Cloud Artifacts ───

  fastify.get<{ Params: { id: string } }>(
    '/agents/:id/artifacts',
    async (request, reply) => {
      try {
        const artifacts = await agentPool.listArtifacts(request.params.id);
        return { artifacts };
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404 : 500;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/agents/:id/artifacts/download',
    async (request, reply) => {
      const artifactPath = request.query.path;
      if (!artifactPath) return reply.code(400).send({ error: 'path query is required' });
      try {
        const buffer = await agentPool.downloadArtifact(request.params.id, artifactPath);
        const ext = artifactPath.split('.').pop() || 'bin';
        const mimeMap: Record<string, string> = {
          ts: 'text/typescript', js: 'text/javascript', json: 'application/json',
          md: 'text/markdown', txt: 'text/plain', html: 'text/html',
          css: 'text/css', py: 'text/x-python', rs: 'text/x-rust',
          png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
        };
        reply.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
        reply.header('Content-Disposition', `attachment; filename="${artifactPath.split('/').pop()}"`);
        return reply.send(buffer);
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404
          : err.message.includes('cloud') ? 400 : 500;
        return reply.code(code).send({ error: err.message });
      }
    }
  );

  // ─── Hot-reload agent config ───

  fastify.post<{ Params: { id: string } }>(
    '/agents/:id/reload',
    async (request, reply) => {
      try {
        const ok = await agentPool.reload(request.params.id);
        return { ok };
      } catch (err: any) {
        const code = err.message.includes('not found') ? 404 : 409;
        return reply.code(code).send({ error: err.message });
      }
    }
  );
}
