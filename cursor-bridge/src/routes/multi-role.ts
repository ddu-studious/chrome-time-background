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
import {
  analyzeTask,
  approveTask,
  getTaskAnalysis,
  createDiscussion,
  runDiscussionRound,
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
} from '../services/multi-role-engine.js';
import { getDb } from '../services/database.js';

export async function multiRoleRoutes(app: FastifyInstance) {

  // ─── Enterprise Roles ───

  app.get('/roles', async () => {
    return { roles: ENTERPRISE_ROLES.map(({ skill, ...r }) => r) };
  });

  app.get('/roles/:id', async (req) => {
    const { id } = req.params as { id: string };
    const role = getRoleById(id);
    if (!role) return { error: 'Role not found' };
    return role;
  });

  // ─── Task Analysis ───

  app.post('/tasks/analyze', async (req) => {
    const { requirement, projectId } = req.body as { requirement: string; projectId?: string };
    if (!requirement) return { error: 'requirement is required' };
    const analysis = await analyzeTask(requirement, projectId);
    return analysis;
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
    const discussion = await createDiscussion(id, topic, phase, roleIds, maxRounds);
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
    try {
      const round = await runDiscussionRound(id);
      return round;
    } catch (e: any) {
      return { error: e.message };
    }
  });

  app.post('/discussions/:id/conclude', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const conclusion = await concludeDiscussion(id);
      return conclusion;
    } catch (e: any) {
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
}
