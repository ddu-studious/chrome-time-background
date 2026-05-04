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
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}
