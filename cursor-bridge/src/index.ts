import Fastify from 'fastify';
import cors from '@fastify/cors';
import { writeFileSync, unlinkSync, existsSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateConfig } from './config.js';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { streamRoutes } from './routes/stream.js';
import { uiRoutes } from './routes/ui.js';
import { fsRoutes } from './routes/fs.js';
import { projectRoutes } from './routes/projects.js';
import { conversationRoutes } from './routes/conversations.js';
import { workflowRoutes } from './routes/workflows.js';
import { traceRoutes } from './routes/traces.js';
import { multiRoleRoutes } from './routes/multi-role.js';
import { a2aRoutes } from './routes/a2a.js';
import { memoryRoutes } from './routes/memory.js';
import { authRoutes } from './routes/auth.js';
import { agentPool } from './services/agent-pool.js';
import { closeDb } from './services/database.js';
import { initMultiRoleTables } from './services/multi-role-engine.js';
import { registerAuthHook } from './services/auth-middleware.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = resolve(__dirname, '..', '.bridge.pid');
const VERSION = '1.0.0';

validateConfig();

function writePidFile() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch { /* non-critical */ }
}

function cleanupPidFile() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch { /* non-critical */ }
}

function buildLoggerOpts() {
  const opts: Record<string, unknown> = {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
        colorize: true,
      },
    },
  };

  if (config.logFile) {
    const logPath = resolve(__dirname, '..', config.logFile);
    delete opts.transport;
    opts.stream = createWriteStream(logPath, { flags: 'a' });
    console.log(`[cursor-bridge] 日志文件: ${logPath}`);
  }

  return opts;
}

const fastify = Fastify({ logger: buildLoggerOpts() as any });

await fastify.register(cors, {
  origin: [
    /^chrome-extension:\/\//,
    /^http:\/\/localhost/,
    /^http:\/\/127\.0\.0\.1/,
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

registerAuthHook(fastify);

await fastify.register(uiRoutes);
await fastify.register(healthRoutes);
await fastify.register(agentRoutes);
await fastify.register(streamRoutes);
await fastify.register(fsRoutes);
await fastify.register(projectRoutes);
await fastify.register(conversationRoutes);
await fastify.register(workflowRoutes);
await fastify.register(traceRoutes);
await fastify.register(multiRoleRoutes);
await fastify.register(a2aRoutes);
await fastify.register(memoryRoutes);
await fastify.register(authRoutes);

initMultiRoleTables();

const shutdown = async () => {
  console.log('\n[cursor-bridge] Shutting down...');
  cleanupPidFile();
  await agentPool.disposeAll();
  closeDb();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await fastify.listen({ port: config.port, host: config.host });
  writePidFile();
  console.log(`\n  cursor-bridge v${VERSION}`);
  console.log(`  Listening on http://${config.host}:${config.port}`);
  console.log(`  PID: ${process.pid}`);
  console.log(`  Agents: ${agentPool.size}/${config.maxAgents}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
