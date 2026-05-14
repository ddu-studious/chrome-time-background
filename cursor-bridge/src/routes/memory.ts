/**
 * Phase 6.3 — Memory Management Routes
 *
 * Full CRUD + search for cross-session long-term memory.
 */

import type { FastifyInstance } from 'fastify';
import {
  createMemory, getMemory, updateMemory, deleteMemory,
  listMemories, searchMemories, getMemoryStats, extractMemoriesFromText,
} from '../services/memory-service.js';

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/memories', async (req) => {
    const { type, source, limit, offset, sortBy } = req.query as Record<string, string>;
    return listMemories({
      type,
      source,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      sortBy: sortBy as any,
    });
  });

  app.get('/memories/stats', async () => {
    return getMemoryStats();
  });

  app.get('/memories/search', async (req) => {
    const { q, limit } = req.query as { q: string; limit?: string };
    if (!q) return { results: [], total: 0 };
    const results = searchMemories(q, limit ? parseInt(limit) : 10);
    return { results, total: results.length };
  });

  app.get('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const entry = getMemory(id);
    if (!entry) return reply.code(404).send({ error: 'Memory not found' });
    return entry;
  });

  app.post('/memories', async (req) => {
    const body = req.body as {
      type?: string; content: string; summary?: string;
      source: string; sourceId?: string; tags?: string[]; importance?: number;
    };
    if (!body.content || !body.source) {
      return { error: 'content and source are required' };
    }
    return createMemory({
      type: body.type as any,
      content: body.content,
      summary: body.summary,
      source: body.source,
      sourceId: body.sourceId,
      tags: body.tags,
      importance: body.importance,
    });
  });

  app.put('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      content?: string; summary?: string;
      tags?: string[]; importance?: number; type?: string;
    };
    const updated = updateMemory(id, {
      content: body.content,
      summary: body.summary,
      tags: body.tags,
      importance: body.importance,
      type: body.type as any,
    });
    if (!updated) return reply.code(404).send({ error: 'Memory not found' });
    return { updated: true };
  });

  app.delete('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = deleteMemory(id);
    if (!deleted) return reply.code(404).send({ error: 'Memory not found' });
    return { deleted: true };
  });

  app.post('/memories/extract', async (req) => {
    const { text, source, sourceId } = req.body as {
      text: string; source: string; sourceId?: string;
    };
    if (!text || !source) return { error: 'text and source are required', entries: [] };
    const entries = extractMemoriesFromText(text, source, sourceId);
    return { entries, count: entries.length };
  });
}
