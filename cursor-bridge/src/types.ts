export type AgentStatus = 'idle' | 'running' | 'error' | 'disposed';

export interface CreateAgentOpts {
  name: string;
  model?: string;
  cwd: string;
  description?: string;
}

export interface BridgeAgent {
  id: string;
  name: string;
  model: string;
  cwd: string;
  description?: string;
  status: AgentStatus;
  createdAt: number;
  currentRunId?: string;
  runHistory: RunRecord[];
}

export interface RunRecord {
  id: string;
  prompt: string;
  status: 'running' | 'finished' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  resultSummary?: string;
}

export interface AgentPublicInfo {
  id: string;
  name: string;
  model: string;
  cwd: string;
  description?: string;
  status: AgentStatus;
  currentRunId?: string;
  createdAt: number;
  runCount: number;
  conversationId: string;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// ─── Whitebox Observability Types ───

export type TraceType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'decision'
  | 'opinion'
  | 'agreement'
  | 'objection'
  | 'reference'
  | 'delegation'
  | 'escalation'
  | 'phase_enter'
  | 'phase_exit'
  | 'approval'
  | 'veto'
  | 'bug_report'
  | 'bug_fix'
  | 'quality_gate'
  | 'system';

export interface TraceMetadata {
  reasoning?: string;
  confidence?: number;

  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  durationMs?: number;

  options?: string[];
  chosen?: string;
  reason?: string;
  decisionBy?: string;

  targetRoleId?: string;
  targetTraceId?: string;
  stance?: 'agree' | 'disagree' | 'neutral' | 'conditional';

  fromPhase?: string;
  toPhase?: string;
  exitCondition?: string;
  exitReason?: string;

  passRate?: number;
  threshold?: number;
  passed?: boolean;

  taskId?: string;
  assignedTo?: string;

  tokenInput?: number;
  tokenOutput?: number;
}

export interface TraceEvent {
  id: string;
  taskAnalysisId: string;
  agentId: string;
  roleId: string;
  runId?: string;
  type: TraceType;
  phase: string;
  content: string;
  metadata: TraceMetadata;
  causedBy?: string;
  timestamp: number;
}

export interface TraceFilter {
  type?: TraceType | TraceType[];
  roleId?: string;
  phase?: string;
  agentId?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface Decision {
  id: string;
  taskAnalysisId: string;
  phase: string;
  topic: string;
  options: string[];
  chosen: string;
  reason: string;
  decidedBy: string;
  supportingTraces: string[];
  dissentingTraces: string[];
  createdAt: number;
}

export interface CausalLink {
  id: number;
  fromTrace: string;
  toTrace: string;
  relation: 'caused' | 'influenced' | 'blocked' | 'unblocked' | 'referenced';
  description?: string;
}

export interface CausalNode {
  trace: TraceEvent;
  children: CausalNode[];
  parents: CausalNode[];
}

export interface TimelineEntry {
  trace: TraceEvent;
  relatedDecision?: Decision;
  causalLinks: CausalLink[];
}

export interface TraceStats {
  total: number;
  byType: Record<string, number>;
  byRole: Record<string, number>;
  byPhase: Record<string, number>;
  decisions: number;
  causalLinks: number;
}
