import { getDb } from './database.js';
import type {
  TraceEvent, TraceMetadata, TraceType, TraceFilter,
  Decision, CausalLink, CausalNode, TimelineEntry, TraceStats,
} from '../types.js';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Write API ───

export function recordTrace(event: Omit<TraceEvent, 'id' | 'timestamp'>): string {
  const id = `trace_${Date.now()}_${randomId()}`;
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO traces (id, task_analysis_id, agent_id, role_id, run_id, type, phase, content, metadata, caused_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    event.taskAnalysisId || null,
    event.agentId,
    event.roleId || null,
    event.runId || null,
    event.type,
    event.phase || null,
    event.content.substring(0, 50000),
    JSON.stringify(event.metadata || {}),
    event.causedBy || null,
    now,
  );
  return id;
}

export function recordDecision(decision: Omit<Decision, 'id' | 'createdAt'>): string {
  const id = `dec_${Date.now()}_${randomId()}`;
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO decisions (id, task_analysis_id, phase, topic, options, chosen, reason, decided_by, supporting_traces, dissenting_traces, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    decision.taskAnalysisId,
    decision.phase,
    decision.topic,
    JSON.stringify(decision.options),
    decision.chosen,
    decision.reason,
    decision.decidedBy,
    JSON.stringify(decision.supportingTraces || []),
    JSON.stringify(decision.dissentingTraces || []),
    now,
  );
  return id;
}

export function linkCause(
  fromTraceId: string,
  toTraceId: string,
  relation: string,
  description?: string,
): void {
  getDb().prepare(`
    INSERT INTO causal_links (from_trace, to_trace, relation, description)
    VALUES (?, ?, ?, ?)
  `).run(fromTraceId, toTraceId, relation, description || null);
}

// ─── Read API ───

function rowToTrace(row: any): TraceEvent {
  return {
    id: row.id,
    taskAnalysisId: row.task_analysis_id,
    agentId: row.agent_id,
    roleId: row.role_id,
    runId: row.run_id,
    type: row.type as TraceType,
    phase: row.phase,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    causedBy: row.caused_by,
    timestamp: row.created_at,
  };
}

function rowToDecision(row: any): Decision {
  return {
    id: row.id,
    taskAnalysisId: row.task_analysis_id,
    phase: row.phase,
    topic: row.topic,
    options: JSON.parse(row.options || '[]'),
    chosen: row.chosen,
    reason: row.reason,
    decidedBy: row.decided_by,
    supportingTraces: JSON.parse(row.supporting_traces || '[]'),
    dissentingTraces: JSON.parse(row.dissenting_traces || '[]'),
    createdAt: row.created_at,
  };
}

function rowToCausalLink(row: any): CausalLink {
  return {
    id: row.id,
    fromTrace: row.from_trace,
    toTrace: row.to_trace,
    relation: row.relation,
    description: row.description,
  };
}

export function getTracesByTask(taskId: string, filters?: TraceFilter): TraceEvent[] {
  const conditions = ['task_analysis_id = ?'];
  const params: any[] = [taskId];

  if (filters?.type) {
    if (Array.isArray(filters.type)) {
      conditions.push(`type IN (${filters.type.map(() => '?').join(',')})`);
      params.push(...filters.type);
    } else {
      conditions.push('type = ?');
      params.push(filters.type);
    }
  }
  if (filters?.roleId) {
    conditions.push('role_id = ?');
    params.push(filters.roleId);
  }
  if (filters?.phase) {
    conditions.push('phase = ?');
    params.push(filters.phase);
  }
  if (filters?.agentId) {
    conditions.push('agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters?.since) {
    conditions.push('created_at >= ?');
    params.push(filters.since);
  }
  if (filters?.until) {
    conditions.push('created_at <= ?');
    params.push(filters.until);
  }

  const limit = filters?.limit || 500;
  const offset = filters?.offset || 0;

  const rows = getDb().prepare(`
    SELECT * FROM traces
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  return rows.map(rowToTrace);
}

export function getTracesByAgent(agentId: string, limit = 200): TraceEvent[] {
  const rows = getDb().prepare(
    'SELECT * FROM traces WHERE agent_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(agentId, limit) as any[];
  return rows.map(rowToTrace);
}

export function getTracesByPhase(taskId: string, phase: string): TraceEvent[] {
  const rows = getDb().prepare(
    'SELECT * FROM traces WHERE task_analysis_id = ? AND phase = ? ORDER BY created_at ASC'
  ).all(taskId, phase) as any[];
  return rows.map(rowToTrace);
}

export function getTraceById(traceId: string): TraceEvent | null {
  const row = getDb().prepare('SELECT * FROM traces WHERE id = ?').get(traceId) as any;
  return row ? rowToTrace(row) : null;
}

export function getDecisionLog(taskId: string): Decision[] {
  const rows = getDb().prepare(
    'SELECT * FROM decisions WHERE task_analysis_id = ? ORDER BY created_at ASC'
  ).all(taskId) as any[];
  return rows.map(rowToDecision);
}

export function getDecisionById(id: string): Decision | null {
  const row = getDb().prepare('SELECT * FROM decisions WHERE id = ?').get(id) as any;
  return row ? rowToDecision(row) : null;
}

export function getCausalChain(traceId: string, depth = 5): CausalNode {
  const trace = getTraceById(traceId);
  if (!trace) throw new Error(`Trace not found: ${traceId}`);

  const visited = new Set<string>();
  return buildCausalNode(trace, depth, visited);
}

function buildCausalNode(trace: TraceEvent, depth: number, visited: Set<string>): CausalNode {
  visited.add(trace.id);
  const node: CausalNode = { trace, children: [], parents: [] };

  if (depth <= 0) return node;

  const childLinks = getDb().prepare(
    'SELECT * FROM causal_links WHERE from_trace = ?'
  ).all(trace.id) as any[];

  for (const link of childLinks) {
    if (visited.has(link.to_trace)) continue;
    const childTrace = getTraceById(link.to_trace);
    if (childTrace) {
      node.children.push(buildCausalNode(childTrace, depth - 1, visited));
    }
  }

  const parentLinks = getDb().prepare(
    'SELECT * FROM causal_links WHERE to_trace = ?'
  ).all(trace.id) as any[];

  for (const link of parentLinks) {
    if (visited.has(link.from_trace)) continue;
    const parentTrace = getTraceById(link.from_trace);
    if (parentTrace) {
      node.parents.push(buildCausalNode(parentTrace, depth - 1, visited));
    }
  }

  return node;
}

export function getCausalLinksForTrace(traceId: string): CausalLink[] {
  const rows = getDb().prepare(
    'SELECT * FROM causal_links WHERE from_trace = ? OR to_trace = ?'
  ).all(traceId, traceId) as any[];
  return rows.map(rowToCausalLink);
}

export function getTimelineView(taskId: string): TimelineEntry[] {
  const traces = getTracesByTask(taskId);
  const decisions = getDecisionLog(taskId);
  const decisionMap = new Map(decisions.map(d => [d.id, d]));

  return traces.map(trace => {
    const links = getCausalLinksForTrace(trace.id);

    let relatedDecision: Decision | undefined;
    if (trace.type === 'decision' && trace.metadata.reason) {
      const dec = decisions.find(d =>
        d.decidedBy === trace.roleId &&
        Math.abs(d.createdAt - trace.timestamp) < 2000
      );
      if (dec) relatedDecision = dec;
    }

    return { trace, relatedDecision, causalLinks: links };
  });
}

export function getRoleView(taskId: string, roleId: string): TraceEvent[] {
  return getTracesByTask(taskId, { roleId });
}

export function getReplayData(taskId: string): TraceEvent[] {
  return getTracesByTask(taskId);
}

export function getReplaySnapshot(taskId: string, timestamp: number): {
  activePhase: string | null;
  activeRoles: string[];
  completedTraces: number;
  totalTraces: number;
} {
  const allTraces = getTracesByTask(taskId);
  const before = allTraces.filter(t => t.timestamp <= timestamp);

  const phaseTraces = before.filter(t => t.type === 'phase_enter' || t.type === 'phase_exit');
  let activePhase: string | null = null;
  for (const pt of phaseTraces) {
    if (pt.type === 'phase_enter') activePhase = pt.phase;
    if (pt.type === 'phase_exit') activePhase = null;
  }

  const activeRoles = [...new Set(
    before.filter(t => t.timestamp > timestamp - 30000).map(t => t.roleId).filter(Boolean)
  )];

  return {
    activePhase,
    activeRoles,
    completedTraces: before.length,
    totalTraces: allTraces.length,
  };
}

export function getTraceStats(taskId: string): TraceStats {
  const d = getDb();

  const total = d.prepare(
    'SELECT COUNT(*) as count FROM traces WHERE task_analysis_id = ?'
  ).get(taskId) as any;

  const byTypeRows = d.prepare(
    'SELECT type, COUNT(*) as count FROM traces WHERE task_analysis_id = ? GROUP BY type'
  ).all(taskId) as any[];

  const byRoleRows = d.prepare(
    'SELECT role_id, COUNT(*) as count FROM traces WHERE task_analysis_id = ? AND role_id IS NOT NULL GROUP BY role_id'
  ).all(taskId) as any[];

  const byPhaseRows = d.prepare(
    'SELECT phase, COUNT(*) as count FROM traces WHERE task_analysis_id = ? AND phase IS NOT NULL GROUP BY phase'
  ).all(taskId) as any[];

  const decisionCount = d.prepare(
    'SELECT COUNT(*) as count FROM decisions WHERE task_analysis_id = ?'
  ).get(taskId) as any;

  const allTraceIds = d.prepare(
    'SELECT id FROM traces WHERE task_analysis_id = ?'
  ).all(taskId) as any[];
  const traceIds = allTraceIds.map((r: any) => r.id);

  let causalCount = 0;
  if (traceIds.length > 0) {
    const placeholders = traceIds.map(() => '?').join(',');
    const cl = d.prepare(
      `SELECT COUNT(*) as count FROM causal_links WHERE from_trace IN (${placeholders}) OR to_trace IN (${placeholders})`
    ).get(...traceIds, ...traceIds) as any;
    causalCount = cl.count;
  }

  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.type] = r.count;

  const byRole: Record<string, number> = {};
  for (const r of byRoleRows) byRole[r.role_id] = r.count;

  const byPhase: Record<string, number> = {};
  for (const r of byPhaseRows) byPhase[r.phase] = r.count;

  return {
    total: total.count,
    byType,
    byRole,
    byPhase,
    decisions: decisionCount.count,
    causalLinks: causalCount,
  };
}
