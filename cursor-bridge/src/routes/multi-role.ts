/**
 * Phase 5 — Multi-Role Collaboration API Routes
 *
 * Endpoints:
 *   POST   /tasks/analyze         — Analyze requirement, recommend roles
 *   GET    /tasks/:id             — Get task analysis
 *   PATCH  /tasks/:id/approve     — Approve execution plan
 *   GET    /tasks/:id/status      — Get full lifecycle status
 *   POST   /tasks/:id/discussions — Create discussion
 *   GET    /tasks/:id/discussions — List discussions
 *   POST   /discussions/:id/round — Run a discussion round
 *   POST   /discussions/:id/conclude — Tech Lead summarizes
 *   GET    /discussions/:id       — Get discussion details
 *   POST   /tasks/:id/squads     — Create execution squad
 *   GET    /squads/:id           — Get squad status
 *   POST   /squads/:id/execute/:taskId — Execute a task
 *   POST   /tasks/:id/qa         — Start QA session
 *   GET    /qa/:id               — Get QA session
 *   POST   /qa/:id/run           — Run QA round
 *   GET    /tasks/:id/report     — Get project report
 *   POST   /tasks/:id/report/generate — Generate report
 *   GET    /roles                — List all enterprise roles
 *   GET    /roles/:id            — Get role details
 */

import type { FastifyInstance } from 'fastify';

const log = {
  info: (msg: string, data?: any) => console.log(`[multi-role-routes] ${msg}`, data ?? ''),
  error: (msg: string, err?: any) => console.error(`[multi-role-routes] ✖ ${msg}`, err?.message || err || ''),
};

import {
  analyzeTask,
  approveTask,
  getTaskAnalysis,
  createDiscussion,
  runDiscussionRound,
  streamDiscussionRound,
  concludeDiscussion,
  getDiscussion,
  createExecutionSquad,
  executeTask,
  getExecutionSquad,
  createQASession,
  runQARound,
  getQASession,
  generateProjectReport,
  ENTERPRISE_ROLES,
  getRoleById,
  resolveModelForRole,
  setRoleModelOverride,
  removeRoleModelOverride,
  getRoleModelOverrides,
  setModelTierDefault,
  getModelTierDefaults,
  getAvailableModels,
  getModelRecommendation,
  createProgressItems,
  updateProgressItem,
  getProgressSummary,
  parseReferences,
} from '../services/multi-role-engine.js';
import { getDb } from '../services/database.js';

export async function multiRoleRoutes(app: FastifyInstance) {

  // ─── Enterprise Roles ───

  app.get('/roles', async () => {
    const overrides = getRoleModelOverrides();
    return {
      roles: ENTERPRISE_ROLES.map(({ skill, ...r }) => ({
        ...r,
        resolvedModel: resolveModelForRole(getRoleById(r.id)!),
        modelOverride: overrides[r.id] || null,
      })),
    };
  });

  app.get('/roles/:id', async (req) => {
    const { id } = req.params as { id: string };
    const role = getRoleById(id);
    if (!role) return { error: 'Role not found' };
    const overrides = getRoleModelOverrides();
    return {
      ...role,
      resolvedModel: resolveModelForRole(role),
      modelOverride: overrides[id] || null,
    };
  });

  // ─── Model Configuration ───

  app.get('/models/config', async () => {
    const overrides = getRoleModelOverrides();
    const tierDefaults = getModelTierDefaults();
    return {
      tierDefaults,
      roleOverrides: overrides,
      roles: ENTERPRISE_ROLES.map((r) => ({
        id: r.id,
        name: r.name,
        modelTier: r.modelTier,
        defaultModel: r.defaultModel || null,
        resolvedModel: resolveModelForRole(r),
        userOverride: overrides[r.id] || null,
      })),
    };
  });

  app.put('/models/config', async (req) => {
    const body = req.body as {
      roleOverrides?: Record<string, string | null>;
      tierDefaults?: Record<string, string>;
      autoAssign?: boolean;
    };

    if (body.roleOverrides) {
      for (const [roleId, model] of Object.entries(body.roleOverrides)) {
        if (model === null || model === '') {
          removeRoleModelOverride(roleId);
        } else {
          setRoleModelOverride(roleId, model);
        }
      }
    }

    if (body.tierDefaults) {
      for (const [tier, model] of Object.entries(body.tierDefaults)) {
        if (['fast', 'balanced', 'powerful'].includes(tier)) {
          setModelTierDefault(tier as any, model);
        }
      }
    }

    const overrides = getRoleModelOverrides();
    return {
      success: true,
      roleOverrides: overrides,
      tierDefaults: getModelTierDefaults(),
    };
  });

  app.get('/models/available', async () => {
    return { models: getAvailableModels() };
  });

  app.post('/models/recommend', async (req) => {
    const { roleId, complexity, taskType } = req.body as {
      roleId: string;
      complexity: 1 | 2 | 3 | 4 | 5;
      taskType?: string;
    };
    if (!roleId || !complexity) return { error: 'roleId and complexity are required' };
    return getModelRecommendation(roleId, complexity, taskType);
  });

  // ─── Task Analysis ───

  app.post('/tasks/analyze', async (req, reply) => {
    const { requirement, projectId, modelOverrides } = req.body as {
      requirement: string;
      projectId?: string;
      modelOverrides?: Record<string, string>;
    };
    if (!requirement) return { error: 'requirement is required' };
    log.info(`POST /tasks/analyze: "${requirement.slice(0, 80)}"`);
    try {
      const analysis = await analyzeTask(requirement, projectId, modelOverrides);
      log.info(`POST /tasks/analyze 完成: id=${analysis.id.slice(0, 8)}, roles=${analysis.recommendedRoles.length}`);
      return analysis;
    } catch (err: any) {
      log.error('POST /tasks/analyze 失败', err);
      app.log.error(err, 'tasks/analyze failed');
      reply.status(500);
      return { error: err.message || 'Analysis failed' };
    }
  });

  app.get('/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const task = getTaskAnalysis(id);
    if (!task) return { error: 'Task not found' };
    return task;
  });

  app.patch('/tasks/:id/approve', async (req) => {
    const { id } = req.params as { id: string };
    const modifications = req.body as any;
    try {
      approveTask(id, modifications);
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  app.get('/tasks/:id/status', async (req) => {
    const { id } = req.params as { id: string };
    const task = getTaskAnalysis(id);
    if (!task) return { error: 'Task not found' };

    const db = getDb();
    const discussions = db.prepare('SELECT id, phase, status, current_round, max_rounds FROM discussions WHERE task_analysis_id = ?').all(id);
    const squads = db.prepare('SELECT id, status, progress_percent FROM execution_squads WHERE task_analysis_id = ?').all(id);
    const qaSessions = db.prepare('SELECT id, status, quality_score, current_round, max_rounds FROM qa_sessions WHERE task_analysis_id = ?').all(id);
    const reports = db.prepare('SELECT id, status FROM project_reports WHERE task_analysis_id = ?').all(id);

    return {
      task: { id: task.id, status: task.status, requirement: task.originalRequirement.slice(0, 100) },
      discussions,
      squads,
      qaSessions,
      reports,
    };
  });

  // ─── Discussions ───

  app.post('/tasks/:id/discussions', async (req) => {
    const { id } = req.params as { id: string };
    const { topic, phase, roleIds, maxRounds } = req.body as {
      topic: string; phase: string; roleIds: string[]; maxRounds?: number;
    };
    if (!topic || !phase || !roleIds?.length) {
      return { error: 'topic, phase, and roleIds are required' };
    }
    log.info(`POST /tasks/${id.slice(0, 8)}/discussions: roles=[${roleIds.join(',')}]`);
    const discussion = await createDiscussion(id, topic, phase, roleIds, maxRounds);
    log.info(`讨论已创建: ${discussion.id.slice(0, 8)}`);
    return discussion;
  });

  app.get('/tasks/:id/discussions', async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const rows = db.prepare('SELECT id, topic, phase, status, current_round, max_rounds, created_at FROM discussions WHERE task_analysis_id = ? ORDER BY created_at DESC').all(id);
    return { discussions: rows };
  });

  app.get('/discussions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const discussion = getDiscussion(id);
    if (!discussion) return { error: 'Discussion not found' };
    return discussion;
  });

  app.post('/discussions/:id/round', async (req) => {
    const { id } = req.params as { id: string };
    log.info(`POST /discussions/${id.slice(0, 8)}/round`);
    try {
      const round = await runDiscussionRound(id);
      log.info(`讨论轮次完成: round=${round.roundNumber}, messages=${round.messages.length}`);
      return round;
    } catch (e: any) {
      log.error(`讨论轮次失败: ${id.slice(0, 8)}`, e);
      return { error: e.message };
    }
  });

  app.post('/discussions/:id/round/stream', async (req, reply) => {
    const { id } = req.params as { id: string };
    log.info(`POST /discussions/${id.slice(0, 8)}/round/stream [SSE]`);

    reply.hijack();

    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    const sendSSE = (event: string, data: any) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const ev of streamDiscussionRound(id)) {
        if (ev.type === 'error') {
          sendSSE('error', { message: ev.content });
          break;
        }
        sendSSE(ev.type, ev);
      }
    } catch (e: any) {
      log.error(`流式讨论轮次失败: ${id.slice(0, 8)}`, e);
      sendSSE('error', { message: e.message });
    }

    raw.end();
  });

  app.post('/discussions/:id/conclude', async (req) => {
    const { id } = req.params as { id: string };
    log.info(`POST /discussions/${id.slice(0, 8)}/conclude`);
    try {
      const conclusion = await concludeDiscussion(id);
      log.info(`讨论总结完成: decisions=${conclusion.decisions?.length || 0}, actionItems=${conclusion.actionItems?.length || 0}`);
      return conclusion;
    } catch (e: any) {
      log.error(`讨论总结失败: ${id.slice(0, 8)}`, e);
      return { error: e.message };
    }
  });

  // ─── Execution Squad ───

  app.post('/tasks/:id/squads', async (req) => {
    const { id } = req.params as { id: string };
    const { tasks } = req.body as { tasks: any[] };
    if (!tasks?.length) return { error: 'tasks array is required' };
    const squad = createExecutionSquad(id, tasks);
    return squad;
  });

  app.get('/squads/:id', async (req) => {
    const { id } = req.params as { id: string };
    const squad = getExecutionSquad(id);
    if (!squad) return { error: 'Squad not found' };
    return squad;
  });

  app.post('/squads/:id/execute/:taskId', async (req) => {
    const { id, taskId } = req.params as { id: string; taskId: string };
    try {
      const output = await executeTask(id, taskId);
      return { taskId, output };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // ─── QA ───

  app.post('/tasks/:id/qa', async (req) => {
    const { id } = req.params as { id: string };
    const { executionSquadId, testCases, maxRounds, passThreshold } = req.body as {
      executionSquadId: string; testCases: any[]; maxRounds?: number; passThreshold?: number;
    };
    if (!executionSquadId || !testCases?.length) {
      return { error: 'executionSquadId and testCases are required' };
    }
    const session = createQASession(id, executionSquadId, testCases, maxRounds, passThreshold);
    return session;
  });

  app.get('/qa/:id', async (req) => {
    const { id } = req.params as { id: string };
    const session = getQASession(id);
    if (!session) return { error: 'QA session not found' };
    return session;
  });

  app.post('/qa/:id/run', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const round = await runQARound(id);
      return round;
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // ─── Reports ───

  app.get('/tasks/:id/report', async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const row: any = db.prepare('SELECT * FROM project_reports WHERE task_analysis_id = ? ORDER BY created_at DESC LIMIT 1').get(id);
    if (!row) return { error: 'No report found' };
    return {
      ...row,
      phases: JSON.parse(row.phases),
      metrics: JSON.parse(row.metrics),
    };
  });

  app.post('/tasks/:id/report/generate', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const report = generateProjectReport(id);
      return report;
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // ─── Progress Tracking (TodoWrite-style) ───

  app.get('/tasks/:id/progress', async (req) => {
    const { id } = req.params as { id: string };
    return getProgressSummary(id);
  });

  app.post('/tasks/:id/progress', async (req) => {
    const { id } = req.params as { id: string };
    const { items } = req.body as {
      items: { title: string; assignedTo: string; phase: string; order: number }[];
    };
    if (!items?.length) return { error: 'items array is required' };

    const created = createProgressItems(
      id,
      items.map((i) => ({ ...i, taskAnalysisId: id, status: 'pending' as const })),
    );
    return { success: true, items: created };
  });

  app.patch('/progress/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string };
    const updates = req.body as {
      status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
      output?: string;
    };
    const ok = updateProgressItem(itemId, updates);
    return ok ? { success: true } : { error: 'Progress item not found' };
  });

  // ─── Agent References ───

  app.post('/discussions/:id/references', async (req) => {
    const { id } = req.params as { id: string };
    const { content } = req.body as { content: string };
    if (!content) return { error: 'content is required' };
    const refs = parseReferences(content, id);
    return { references: refs, count: refs.length };
  });
}
