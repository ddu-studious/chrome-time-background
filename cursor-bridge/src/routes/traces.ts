import type { FastifyInstance } from 'fastify';
import {
  getTracesByTask, getTracesByPhase, getTraceById,
  getDecisionLog, getDecisionById,
  getCausalChain, getCausalLinksForTrace,
  getTimelineView, getRoleView,
  getReplayData, getReplaySnapshot,
  getTraceStats,
} from '../services/trace-service.js';
import type { TraceType } from '../types.js';

export async function traceRoutes(fastify: FastifyInstance) {

  // GET /tasks/:id/traces
  fastify.get<{
    Params: { id: string };
    Querystring: {
      type?: string; roleId?: string; phase?: string;
      since?: string; until?: string; limit?: string; offset?: string;
    };
  }>('/tasks/:id/traces', async (req) => {
    const filters: any = {};
    if (req.query.type) {
      filters.type = req.query.type.includes(',')
        ? req.query.type.split(',') as TraceType[]
        : req.query.type as TraceType;
    }
    if (req.query.roleId) filters.roleId = req.query.roleId;
    if (req.query.phase) filters.phase = req.query.phase;
    if (req.query.since) filters.since = Number(req.query.since);
    if (req.query.until) filters.until = Number(req.query.until);
    if (req.query.limit) filters.limit = Number(req.query.limit);
    if (req.query.offset) filters.offset = Number(req.query.offset);

    return getTracesByTask(req.params.id, filters);
  });

  // GET /tasks/:id/traces/timeline
  fastify.get<{ Params: { id: string } }>('/tasks/:id/traces/timeline', async (req) => {
    return getTimelineView(req.params.id);
  });

  // GET /tasks/:id/traces/by-role/:role
  fastify.get<{ Params: { id: string; role: string } }>(
    '/tasks/:id/traces/by-role/:role', async (req) => {
      return getRoleView(req.params.id, req.params.role);
    }
  );

  // GET /tasks/:id/traces/by-phase/:ph
  fastify.get<{ Params: { id: string; ph: string } }>(
    '/tasks/:id/traces/by-phase/:ph', async (req) => {
      return getTracesByPhase(req.params.id, req.params.ph);
    }
  );

  // GET /traces/:traceId/causal-chain
  fastify.get<{
    Params: { traceId: string };
    Querystring: { depth?: string };
  }>('/traces/:traceId/causal-chain', async (req, reply) => {
    try {
      const depth = req.query.depth ? Number(req.query.depth) : 5;
      return getCausalChain(req.params.traceId, depth);
    } catch (e: any) {
      reply.status(404);
      return { error: e.message };
    }
  });

  // GET /tasks/:id/decisions
  fastify.get<{ Params: { id: string } }>('/tasks/:id/decisions', async (req) => {
    return getDecisionLog(req.params.id);
  });

  // GET /decisions/:id
  fastify.get<{ Params: { id: string } }>('/decisions/:id', async (req, reply) => {
    const dec = getDecisionById(req.params.id);
    if (!dec) {
      reply.status(404);
      return { error: 'Decision not found' };
    }
    return dec;
  });

  // GET /tasks/:id/replay
  fastify.get<{ Params: { id: string } }>('/tasks/:id/replay', async (req) => {
    return getReplayData(req.params.id);
  });

  // GET /tasks/:id/replay/snapshot/:ts
  fastify.get<{ Params: { id: string; ts: string } }>(
    '/tasks/:id/replay/snapshot/:ts', async (req) => {
      return getReplaySnapshot(req.params.id, Number(req.params.ts));
    }
  );

  // GET /tasks/:id/traces/stats
  fastify.get<{ Params: { id: string } }>('/tasks/:id/traces/stats', async (req) => {
    return getTraceStats(req.params.id);
  });
}
