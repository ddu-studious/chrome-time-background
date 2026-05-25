/**
 * Session Aggregation Routes — Multi-Agent task grouping
 *
 * Endpoints:
 *   GET    /sessions           — List sessions
 *   POST   /sessions           — Create session
 *   GET    /sessions/:id       — Get session detail + conversations
 *   PATCH  /sessions/:id       — Update session
 *   DELETE /sessions/:id       — Delete session
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  getSessionWithConversations,
  deleteSession,
} from '../services/database.js';

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/sessions', async (req) => {
    const { limit, status } = req.query as { limit?: string; status?: string };
    const rows = listSessions(Number(limit) || 50, status);
    return rows.map((r: any) => ({
      ...r,
      participantRoles: safeParseJSON(r.participant_roles, []),
    }));
  });

  app.post('/sessions', async (req, reply) => {
    const body = req.body as any;
    if (!body?.title) {
      return reply.status(400).send({ error: 'title is required' });
    }
    const id = `session_${Date.now()}_${randomUUID().slice(0, 8)}`;
    createSession(id, {
      taskAnalysisId: body.taskAnalysisId,
      title: body.title,
      participantRoles: body.participantRoles || [],
    });
    const session = getSession(id);
    return { id, ...(session ?? {}) };
  });

  app.get('/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = getSessionWithConversations(id);
    if (!result) return reply.status(404).send({ error: 'Session not found' });
    return {
      ...result.session,
      participantRoles: safeParseJSON((result.session as any).participant_roles, []),
      conversations: result.conversations,
    };
  });

  app.patch('/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    if (!getSession(id)) return reply.status(404).send({ error: 'Session not found' });
    updateSession(id, body);
    return getSession(id);
  });

  app.delete('/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getSession(id)) return reply.status(404).send({ error: 'Session not found' });
    deleteSession(id);
    return { ok: true };
  });
}

function safeParseJSON(str: unknown, fallback: any) {
  if (typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
