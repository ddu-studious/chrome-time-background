import type { FastifyInstance } from 'fastify';
import {
  createConversation, listConversations, getConversation,
  updateConversationStatus, deleteConversation, resumeConversation,
  searchConversations, addMessage, getMessages,
} from '../services/database.js';

function genId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function conversationRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { projectId?: string; limit?: string } }>(
    '/conversations',
    async (request) => {
      const limit = parseInt(request.query.limit || '50', 10);
      return { conversations: listConversations(request.query.projectId, limit) };
    }
  );

  fastify.post<{ Body: { projectId?: string; agentName: string; model: string; cwd?: string; description?: string } }>(
    '/conversations',
    async (request, reply) => {
      const { projectId, agentName, model, description } = request.body || {};
      const cwd = (request.body?.cwd || '').trim() || process.cwd();
      if (!agentName || !model) {
        return reply.code(400).send({ error: 'agentName and model are required' });
      }
      const id = genId();
      createConversation(id, { projectId, agentName, model, cwd, description });
      return reply.code(201).send(getConversation(id));
    }
  );

  fastify.get<{ Querystring: { q?: string; limit?: string } }>(
    '/conversations/search',
    async (request) => {
      const { q } = request.query;
      if (!q || q.trim().length === 0) {
        return { conversations: [] };
      }
      const limit = parseInt(request.query.limit || '50', 10);
      return { conversations: searchConversations(q.trim(), limit) };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/conversations/:id',
    async (request, reply) => {
      const conv = getConversation(request.params.id);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      return conv;
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/conversations/:id',
    async (request, reply) => {
      const { status } = request.body || {};
      if (!status) return reply.code(400).send({ error: 'status is required' });
      updateConversationStatus(request.params.id, status);
      return { status: 'ok' };
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/conversations/:id/messages',
    async (request, reply) => {
      const conv = getConversation(request.params.id);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      const limit = parseInt(request.query.limit || '200', 10);
      return { messages: getMessages(request.params.id, limit) };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { role: string; content: string; eventType?: string; runId?: string } }>(
    '/conversations/:id/messages',
    async (request, reply) => {
      const conv = getConversation(request.params.id);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      const { role, content, eventType, runId } = request.body || {};
      if (!role || !content) return reply.code(400).send({ error: 'role and content are required' });
      addMessage(request.params.id, role, content, eventType, runId);
      return reply.code(201).send({ status: 'ok' });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/conversations/:id',
    async (request, reply) => {
      const conv = getConversation(request.params.id);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      deleteConversation(request.params.id);
      return { status: 'ok' };
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/resume',
    async (request, reply) => {
      const conv = getConversation(request.params.id);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      resumeConversation(request.params.id);
      const messages = getMessages(request.params.id, 200);
      return { conversation: getConversation(request.params.id), messages };
    }
  );

}
