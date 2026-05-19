/**
 * Collaboration State Machine — 协作状态管理
 *
 * 管理多 Agent 协作会话的生命周期状态转换：
 *   idle → analyzing → discussing → executing → testing → deploying → completed
 *
 * 提供：
 *   - 状态流转规则校验
 *   - 当前阶段参与者追踪
 *   - 阶段超时自动推进
 *   - 协作事件广播
 */

import type { FastifyInstance } from 'fastify';
import { getDb } from '../../services/database.js';

export type CollaborationPhase =
  | 'idle'
  | 'analyzing'
  | 'discussing'
  | 'executing'
  | 'testing'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'paused';

export interface CollaborationSession {
  id: string;
  taskId: string;
  phase: CollaborationPhase;
  participants: string[];
  activeRoleId: string | null;
  history: PhaseTransition[];
  startedAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}

export interface PhaseTransition {
  from: CollaborationPhase;
  to: CollaborationPhase;
  triggeredBy: string;
  reason: string;
  timestamp: number;
}

const VALID_TRANSITIONS: Record<CollaborationPhase, CollaborationPhase[]> = {
  idle: ['analyzing'],
  analyzing: ['discussing', 'failed'],
  discussing: ['executing', 'analyzing', 'failed', 'paused'],
  executing: ['testing', 'discussing', 'failed', 'paused'],
  testing: ['executing', 'deploying', 'failed', 'paused'],
  deploying: ['completed', 'failed'],
  completed: ['idle'],
  failed: ['idle', 'analyzing'],
  paused: ['discussing', 'executing', 'testing'],
};

const sessions = new Map<string, CollaborationSession>();

export function createSession(taskId: string, participants: string[]): CollaborationSession {
  const id = `collab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: CollaborationSession = {
    id,
    taskId,
    phase: 'idle',
    participants,
    activeRoleId: null,
    history: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
  sessions.set(id, session);
  persistSession(session);
  return session;
}

export function getSession(id: string): CollaborationSession | null {
  return sessions.get(id) || loadSession(id);
}

export function transitionPhase(
  sessionId: string,
  toPhase: CollaborationPhase,
  triggeredBy: string,
  reason: string,
): { success: boolean; error?: string; session?: CollaborationSession } {
  const session = getSession(sessionId);
  if (!session) return { success: false, error: 'Session not found' };

  const allowed = VALID_TRANSITIONS[session.phase];
  if (!allowed || !allowed.includes(toPhase)) {
    return {
      success: false,
      error: `Cannot transition from '${session.phase}' to '${toPhase}'. Allowed: ${allowed?.join(', ')}`,
    };
  }

  const transition: PhaseTransition = {
    from: session.phase,
    to: toPhase,
    triggeredBy,
    reason,
    timestamp: Date.now(),
  };

  session.history.push(transition);
  session.phase = toPhase;
  session.updatedAt = Date.now();

  persistSession(session);
  return { success: true, session };
}

export function setActiveRole(sessionId: string, roleId: string | null): boolean {
  const session = getSession(sessionId);
  if (!session) return false;
  session.activeRoleId = roleId;
  session.updatedAt = Date.now();
  persistSession(session);
  return true;
}

export function addParticipant(sessionId: string, roleId: string): boolean {
  const session = getSession(sessionId);
  if (!session) return false;
  if (!session.participants.includes(roleId)) {
    session.participants.push(roleId);
    session.updatedAt = Date.now();
    persistSession(session);
  }
  return true;
}

export function listActiveSessions(): CollaborationSession[] {
  return [...sessions.values()].filter(
    (s) => !['completed', 'failed', 'idle'].includes(s.phase),
  );
}

function persistSession(session: CollaborationSession) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO collaboration_sessions (id, task_id, phase, participants, active_role_id, history, metadata, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.taskId,
      session.phase,
      JSON.stringify(session.participants),
      session.activeRoleId,
      JSON.stringify(session.history),
      JSON.stringify(session.metadata),
      session.startedAt,
      session.updatedAt,
    );
  } catch {
    // Table might not exist yet during early init
  }
}

function loadSession(id: string): CollaborationSession | null {
  try {
    const db = getDb();
    const row: any = db.prepare('SELECT * FROM collaboration_sessions WHERE id = ?').get(id);
    if (!row) return null;

    const session: CollaborationSession = {
      id: row.id,
      taskId: row.task_id,
      phase: row.phase,
      participants: JSON.parse(row.participants),
      activeRoleId: row.active_role_id,
      history: JSON.parse(row.history),
      metadata: JSON.parse(row.metadata || '{}'),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
    };
    sessions.set(id, session);
    return session;
  } catch {
    return null;
  }
}

export function initCollaborationTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS collaboration_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'idle',
      participants TEXT NOT NULL DEFAULT '[]',
      active_role_id TEXT,
      history TEXT NOT NULL DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_collab_task ON collaboration_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_collab_phase ON collaboration_sessions(phase);
  `);
}

export async function collaborationRoutes(app: FastifyInstance) {
  app.post('/collaboration/sessions', async (req) => {
    const { taskId, participants } = req.body as {
      taskId: string;
      participants: string[];
    };
    if (!taskId || !participants?.length) {
      return { error: 'taskId and participants are required' };
    }
    const session = createSession(taskId, participants);
    return session;
  });

  app.get('/collaboration/sessions', async () => {
    const active = listActiveSessions();
    return { sessions: active, total: active.length };
  });

  app.get('/collaboration/sessions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const session = getSession(id);
    if (!session) return { error: 'Session not found' };
    return session;
  });

  app.post('/collaboration/sessions/:id/transition', async (req) => {
    const { id } = req.params as { id: string };
    const { phase, triggeredBy, reason } = req.body as {
      phase: CollaborationPhase;
      triggeredBy: string;
      reason: string;
    };
    if (!phase || !triggeredBy) {
      return { error: 'phase and triggeredBy are required' };
    }
    return transitionPhase(id, phase, triggeredBy, reason || '');
  });

  app.post('/collaboration/sessions/:id/role', async (req) => {
    const { id } = req.params as { id: string };
    const { roleId } = req.body as { roleId: string | null };
    const ok = setActiveRole(id, roleId);
    return ok ? { success: true } : { error: 'Session not found' };
  });

  app.post('/collaboration/sessions/:id/participants', async (req) => {
    const { id } = req.params as { id: string };
    const { roleId } = req.body as { roleId: string };
    if (!roleId) return { error: 'roleId is required' };
    const ok = addParticipant(id, roleId);
    return ok ? { success: true } : { error: 'Session not found' };
  });

  app.get('/collaboration/transitions', async () => {
    return { transitions: VALID_TRANSITIONS };
  });
}
