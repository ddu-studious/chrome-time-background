import type { FastifyInstance } from 'fastify';
import { agentPool } from '../services/agent-pool.js';

export async function streamRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/agents/:id/stream',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentPool.get(id);
      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ agentId: id, status: agent.status })}\n\n`);

      agentPool.addSSEClient(id, reply.raw);

      request.raw.on('close', () => {
        agentPool.removeSSEClient(id, reply.raw);
      });

      // Keep-alive ping every 30s
      const ping = setInterval(() => {
        try { reply.raw.write(`:ping\n\n`); } catch { clearInterval(ping); }
      }, 30000);

      request.raw.on('close', () => clearInterval(ping));
    }
  );
}
