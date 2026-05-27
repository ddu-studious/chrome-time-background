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
import { memoryRoutes } from './routes/memory.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
import { promptVersionRoutes } from './routes/prompt-versions.js';
import { abTestRoutes } from './routes/ab-test.js';
import { promptEditorUIRoutes } from './routes/prompt-editor-ui.js';
import { sessionPanelUIRoutes } from './routes/session-panel-ui.js';
import { agentPool } from './services/agent-pool.js';
import { closeDb, getActivePromptVersion } from './services/database.js';
import { registerAuthHook } from './services/auth-middleware.js';
import { setPromptVersionResolver } from './services/enterprise-roles.js';
import { getDashboardData, getLocalUsage } from './services/dashboard.js';
import { selfLoopVerify } from './services/self-loop-verify.js';
import type { VerificationConfig, TestCase } from './services/self-loop-verify.js';

// ─── Isolated Feature Modules ───
import { writingRoutes, initWritingTables, initRAGTables } from './modules/writing/index.js';
import {
  multiRoleRoutes,
  a2aRoutes,
  agentRegistryRoutes,
  collaborationRoutes,
  initMultiRoleTables,
  initAgentRegistry,
  initCollaborationTables,
} from './modules/multi-role/index.js';

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

const QUIET_ROUTES = new Set(['/health', '/approvals']);

const fastify = Fastify({
  logger: buildLoggerOpts() as any,
  disableRequestLogging: true,
});

fastify.addHook('onRequest', async (req) => {
  if (!QUIET_ROUTES.has(req.url)) {
    req.log.info({ method: req.method, url: req.url }, 'incoming request');
  }
});

fastify.addHook('onResponse', async (req, reply) => {
  if (!QUIET_ROUTES.has(req.url)) {
    req.log.info(
      { method: req.method, url: req.url, statusCode: reply.statusCode, responseTime: Math.round(reply.elapsedTime) },
      'request completed',
    );
  }
});

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
await fastify.register(memoryRoutes);
await fastify.register(authRoutes);
await fastify.register(sessionRoutes);
await fastify.register(promptVersionRoutes);
await fastify.register(abTestRoutes);
await fastify.register(promptEditorUIRoutes);
await fastify.register(sessionPanelUIRoutes);

// ─── Dashboard Usage Routes ───
fastify.get('/dashboard', async (req) => {
  const { since } = req.query as { since?: string };
  return getDashboardData(since ? Number(since) : undefined);
});
fastify.get('/dashboard/usage', async (req) => {
  const { since } = req.query as { since?: string };
  return getLocalUsage(since ? Number(since) : undefined);
});

// ─── Self-Loop Verification ───
fastify.post<{ Body: { config: VerificationConfig; testCases: TestCase[] } }>(
  '/verify',
  async (req, reply) => {
    const { config: verifyConfig, testCases } = req.body || {};
    if (!verifyConfig?.baseUrl || !Array.isArray(testCases) || testCases.length === 0) {
      return reply.code(400).send({ error: 'config.baseUrl and non-empty testCases[] are required' });
    }
    const result = await selfLoopVerify(verifyConfig, testCases);
    return result;
  },
);

// ─── Module: Multi-Role Collaboration ───
await fastify.register(multiRoleRoutes);
await fastify.register(a2aRoutes);
await fastify.register(agentRegistryRoutes);
await fastify.register(collaborationRoutes);

// ─── Module: Writing AI ───
await fastify.register(writingRoutes);

// ─── Init Tables ───
initMultiRoleTables();
initAgentRegistry();
initCollaborationTables();
initWritingTables();
initRAGTables();

setPromptVersionResolver(getActivePromptVersion);

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
