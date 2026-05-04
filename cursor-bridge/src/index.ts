import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config, validateConfig } from './config.js';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { streamRoutes } from './routes/stream.js';
import { uiRoutes } from './routes/ui.js';
import { agentPool } from './services/agent-pool.js';

validateConfig();

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: [
    /^chrome-extension:\/\//,
    /^http:\/\/localhost/,
    /^http:\/\/127\.0\.0\.1/,
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

await fastify.register(uiRoutes);
await fastify.register(healthRoutes);
await fastify.register(agentRoutes);
await fastify.register(streamRoutes);

const shutdown = async () => {
  console.log('\n[cursor-bridge] Shutting down...');
  await agentPool.disposeAll();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`\n  cursor-bridge v0.1.0`);
  console.log(`  Listening on http://${config.host}:${config.port}`);
  console.log(`  Agents: ${agentPool.size}/${config.maxAgents}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
