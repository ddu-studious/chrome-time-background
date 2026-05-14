import { Agent } from '@cursor/sdk';
import type { SDKAgent, SDKMessage, Run } from '@cursor/sdk';
import { config } from '../config.js';
import type { BridgeAgent, CreateAgentOpts, AgentPublicInfo, RunRecord } from '../types.js';
import type { ServerResponse } from 'node:http';
import {
  createConversation, updateConversationStatus, addMessage, recordTokenUsage,
} from './database.js';
import { recordTrace } from './trace-service.js';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface ApprovalRequest {
  id: string;
  runId: string;
  agentId: string;
  type: 'tool_call' | 'milestone' | 'dangerous_action';
  description: string;
  details?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
  resolver?: (approved: boolean, message?: string) => void;
}

interface InternalAgent extends BridgeAgent {
  sdkAgent: SDKAgent;
  sseClients: Set<ServerResponse>;
  currentRun?: Run;
  lastActivityAt: number;
  conversationId: string;
  textBuffer: string;
  approvalEnabled: boolean;
  pendingApprovals: Map<string, ApprovalRequest>;
}

export class AgentPool {
  private agents = new Map<string, InternalAgent>();
  private idleTimeoutMs = 30 * 60 * 1000; // 30 minutes
  private gcInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.gcInterval = setInterval(() => this.gc(), 60_000);
  }

  get size() { return this.agents.size; }

  stats() {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      idle: agents.filter(a => a.status === 'idle').length,
      running: agents.filter(a => a.status === 'running').length,
      error: agents.filter(a => a.status === 'error').length,
    };
  }

  private gc() {
    const now = Date.now();
    for (const [id, agent] of this.agents) {
      if (agent.status === 'idle' && agent.sseClients.size === 0 &&
          now - agent.lastActivityAt > this.idleTimeoutMs) {
        console.log(`[AgentPool] GC: disposing idle agent ${id} (${agent.name})`);
        this.dispose(id).catch(() => {});
      }
    }
  }

  async create(opts: CreateAgentOpts): Promise<AgentPublicInfo> {
    if (this.agents.size >= config.maxAgents) {
      throw new Error(`Agent pool is full (max: ${config.maxAgents})`);
    }

    const model = opts.model || config.defaultModel;

    const sdkAgent = await Agent.create({
      apiKey: config.apiKey,
      model: { id: model },
      name: opts.name,
      local: { cwd: opts.cwd },
    });

    const id = `agent_${Date.now()}_${randomId()}`;
    const convId = `conv_${Date.now()}_${randomId()}`;
    const now = Date.now();
    const agent: InternalAgent = {
      id,
      name: opts.name,
      model,
      cwd: opts.cwd,
      description: opts.description,
      status: 'idle',
      createdAt: now,
      lastActivityAt: now,
      runHistory: [],
      sdkAgent,
      sseClients: new Set(),
      conversationId: convId,
      textBuffer: '',
      approvalEnabled: false,
      pendingApprovals: new Map(),
    };

    this.agents.set(id, agent);
    console.log(`[AgentPool] Agent created: ${id} name="${opts.name}" model=${model} cwd="${opts.cwd}"`);

    try {
      createConversation(convId, {
        agentName: opts.name,
        model,
        cwd: opts.cwd,
        description: opts.description,
      });
    } catch (e) {
      console.warn(`[AgentPool] Failed to persist conversation for ${id}:`, e);
    }

    return this.toPublicInfo(agent);
  }

  list(): AgentPublicInfo[] {
    return Array.from(this.agents.values()).map(a => this.toPublicInfo(a));
  }

  get(id: string) {
    return this.agents.get(id);
  }

  async send(agentId: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'running') throw new Error('Agent is currently running a task');
    if (agent.status === 'disposed') throw new Error('Agent has been disposed');

    agent.status = 'running';
    agent.lastActivityAt = Date.now();
    agent.textBuffer = '';
    const runId = `run_${Date.now()}_${randomId()}`;
    agent.currentRunId = runId;
    this.broadcast(agent, 'agent_status', { status: 'running' });
    console.log(`[AgentPool] Agent ${agentId} (${agent.name}) → running, runId=${runId}, prompt="${prompt.substring(0, 80)}..."`);

    const record: RunRecord = {
      id: runId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
    };
    agent.runHistory.push(record);

    try {
      addMessage(agent.conversationId, 'user', prompt.substring(0, 10000), undefined, runId);
    } catch (e) {
      console.warn(`[AgentPool] Failed to persist user message for ${agentId}:`, e);
    }

    this.processRun(agent, prompt, record).catch(err => {
      console.error(`[AgentPool] Run error for ${agentId}:`, err.message);
    });

    return runId;
  }

  private async processRun(agent: InternalAgent, prompt: string, record: RunRecord) {
    try {
      const run = await agent.sdkAgent.send(prompt);
      agent.currentRun = run;

      for await (const event of run.stream()) {
        this.handleStreamEvent(agent, event, record.id);
      }

      const result = await run.wait();
      record.status = result.status === 'error' ? 'error' : 'finished';
      record.finishedAt = Date.now();
      record.resultSummary = result.result?.slice(0, 500);
      const finalStatus = result.status === 'error' ? 'error' : 'idle';
      agent.status = finalStatus;
      agent.currentRunId = undefined;
      agent.currentRun = undefined;
      agent.lastActivityAt = Date.now();

      const durationSec = result.durationMs ? (result.durationMs / 1000).toFixed(1) : '?';
      console.log(`[AgentPool] Agent ${agent.id} (${agent.name}) → ${finalStatus}, duration=${durationSec}s, resultLen=${result.result?.length || 0}`);

      this.persistRunResult(agent, record);

      const inputTokens = (result as any).inputTokens || (result as any).usage?.input_tokens || 0;
      const outputTokens = (result as any).outputTokens || (result as any).usage?.output_tokens || 0;
      if (inputTokens || outputTokens) {
        try {
          recordTokenUsage({
            agentId: agent.id,
            conversationId: agent.conversationId,
            runId: record.id,
            model: agent.model,
            inputTokens,
            outputTokens,
            durationMs: result.durationMs,
          });
        } catch (e) {
          console.warn(`[AgentPool] Failed to record token usage for ${agent.id}:`, e);
        }
      }

      this.broadcast(agent, 'agent_status', { status: finalStatus });

      this.broadcast(agent, 'status', {
        status: record.status,
        runId: record.id,
        result: result.result,
        durationMs: result.durationMs,
        inputTokens,
        outputTokens,
      });
    } catch (err: any) {
      record.status = 'error';
      record.finishedAt = Date.now();
      agent.status = 'error';
      agent.currentRunId = undefined;
      agent.currentRun = undefined;
      console.error(`[AgentPool] Agent ${agent.id} (${agent.name}) → error: ${err.message}`);

      try {
        const errText = `[Error] ${err.message}`;
        addMessage(agent.conversationId, 'assistant', errText, 'error', record.id);
        updateConversationStatus(agent.conversationId, 'error');
      } catch { /* best effort */ }

      this.broadcast(agent, 'agent_status', { status: 'error' });
      this.broadcast(agent, 'error', { message: err.message, runId: record.id });
    }
  }

  private persistRunResult(agent: InternalAgent, record: RunRecord) {
    try {
      const text = agent.textBuffer.trim();
      if (text) {
        addMessage(agent.conversationId, 'assistant', text.substring(0, 50000), 'text', record.id);
      }
      const convStatus = record.status === 'finished' ? 'completed' : record.status;
      updateConversationStatus(agent.conversationId, convStatus);
    } catch (e) {
      console.warn(`[AgentPool] Failed to persist run result for ${agent.id}:`, e);
    }
    agent.textBuffer = '';
  }

  private handleStreamEvent(agent: InternalAgent, event: SDKMessage, runId: string) {
    switch (event.type) {
      case 'assistant':
        for (const block of event.message.content) {
          if (block.type === 'text') {
            agent.textBuffer += block.text;
            this.broadcast(agent, 'text', { content: block.text, runId });
          } else if (block.type === 'tool_use') {
            this.broadcast(agent, 'tool_call', {
              tool: block.name,
              callId: block.id,
              runId,
            });
            this.persistTrace(agent, runId, 'tool_call', `Tool call: ${block.name}`, {
              toolName: block.name,
              toolInput: block.input as Record<string, unknown> | undefined,
            });
          }
        }
        break;
      case 'tool_call':
        this.broadcast(agent, 'tool_call', {
          tool: event.name,
          callId: event.call_id,
          status: event.status,
          runId,
        });
        if (event.status === 'completed' || event.status === 'error') {
          this.persistTrace(agent, runId, 'tool_result', `Tool result: ${event.name} (${event.status})`, {
            toolName: event.name,
          });
        }
        break;
      case 'thinking':
        this.broadcast(agent, 'thinking', { text: event.text, runId });
        this.persistTrace(agent, runId, 'thinking', event.text || '', {
          reasoning: event.text,
        });
        break;
      case 'status':
        this.broadcast(agent, 'agent_status', {
          status: event.status,
          message: event.message,
          runId,
        });
        break;
      case 'task':
        this.broadcast(agent, 'task', {
          status: event.status,
          text: event.text,
          runId,
        });
        break;
    }
  }

  private persistTrace(
    agent: InternalAgent,
    runId: string,
    type: 'thinking' | 'tool_call' | 'tool_result' | 'system',
    content: string,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      recordTrace({
        taskAnalysisId: '',
        agentId: agent.id,
        roleId: '',
        runId,
        type,
        phase: '',
        content: content.substring(0, 50000),
        metadata: metadata as any,
      });
    } catch (e) {
      console.warn(`[AgentPool] Failed to persist trace for ${agent.id}:`, e);
    }
  }

  async cancel(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status !== 'running') throw new Error('Agent is not running');

    if (agent.currentRun) {
      try { await agent.currentRun.cancel(); } catch { /* best effort */ }
    }

    agent.status = 'idle';
    agent.currentRunId = undefined;
    agent.currentRun = undefined;
    const lastRun = agent.runHistory[agent.runHistory.length - 1];
    if (lastRun && lastRun.status === 'running') {
      lastRun.status = 'cancelled';
      lastRun.finishedAt = Date.now();
    }

    try {
      if (agent.textBuffer.trim()) {
        addMessage(agent.conversationId, 'assistant', agent.textBuffer.trim().substring(0, 50000), 'text', lastRun?.id);
      }
      updateConversationStatus(agent.conversationId, 'cancelled');
      agent.textBuffer = '';
    } catch { /* best effort */ }

    this.broadcast(agent, 'status', { status: 'cancelled' });
  }

  async dispose(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (agent.currentRun) {
      try { await agent.currentRun.cancel(); } catch { /* best effort */ }
    }

    try {
      agent.sdkAgent.close();
    } catch { /* best effort */ }

    try {
      updateConversationStatus(agent.conversationId, 'disposed');
    } catch { /* best effort */ }

    agent.status = 'disposed';
    for (const client of agent.sseClients) {
      try {
        client.write(`event: closed\ndata: {"reason":"disposed"}\n\n`);
        client.end();
      } catch { /* client may already be gone */ }
    }
    agent.sseClients.clear();
    this.agents.delete(agentId);
  }

  async disposeAll() {
    clearInterval(this.gcInterval);
    const ids = Array.from(this.agents.keys());
    await Promise.allSettled(ids.map(id => this.dispose(id)));
  }

  getPublicInfo(agentId: string): AgentPublicInfo | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return this.toPublicInfo(agent);
  }

  getHistory(agentId: string): RunRecord[] | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return [...agent.runHistory];
  }

  async resume(agentId: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'disposed') throw new Error('Agent has been disposed');
    if (agent.status === 'running') throw new Error('Agent is currently running a task');

    if (agent.status === 'error') {
      agent.status = 'idle';
    }

    agent.status = 'running';
    agent.textBuffer = '';
    const runId = `run_${Date.now()}_${randomId()}`;
    agent.currentRunId = runId;

    const record: RunRecord = {
      id: runId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
    };
    agent.runHistory.push(record);

    try {
      addMessage(agent.conversationId, 'user', prompt.substring(0, 10000), undefined, runId);
    } catch (e) {
      console.warn(`[AgentPool] Failed to persist resume message for ${agentId}:`, e);
    }

    this.processRun(agent, prompt, record).catch(err => {
      console.error(`[AgentPool] Resume error for ${agentId}:`, err.message);
    });

    return runId;
  }

  // ─── Human-in-the-Loop: Approval Gate ───

  setApprovalEnabled(agentId: string, enabled: boolean) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    agent.approvalEnabled = enabled;
  }

  getPendingApprovals(agentId?: string): ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    const targets = agentId
      ? [this.agents.get(agentId)].filter(Boolean) as InternalAgent[]
      : Array.from(this.agents.values());

    for (const agent of targets) {
      for (const req of agent.pendingApprovals.values()) {
        if (req.status === 'pending') {
          results.push({ ...req, resolver: undefined });
        }
      }
    }
    return results;
  }

  resolveApproval(agentId: string, approvalId: string, approved: boolean, message?: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    const req = agent.pendingApprovals.get(approvalId);
    if (!req || req.status !== 'pending') return false;

    req.status = approved ? 'approved' : 'rejected';
    req.resolvedAt = Date.now();
    if (req.resolver) req.resolver(approved, message);

    this.broadcast(agent, 'approval_resolved', {
      approvalId,
      approved,
      message,
    });

    agent.pendingApprovals.delete(approvalId);
    return true;
  }

  // ─── Emergency Stop All ───

  async emergencyStopAll(): Promise<number> {
    let stopped = 0;
    for (const [id, agent] of this.agents) {
      if (agent.status === 'running') {
        try {
          await this.cancel(id);
          stopped++;
        } catch { /* best effort */ }
      }
      for (const [, req] of agent.pendingApprovals) {
        if (req.status === 'pending') {
          req.status = 'rejected';
          req.resolvedAt = Date.now();
          if (req.resolver) req.resolver(false, 'Emergency stop');
        }
      }
      agent.pendingApprovals.clear();
    }
    return stopped;
  }

  addSSEClient(agentId: string, res: ServerResponse): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.sseClients.add(res);
    return true;
  }

  removeSSEClient(agentId: string, res: ServerResponse) {
    const agent = this.agents.get(agentId);
    if (agent) agent.sseClients.delete(res);
  }

  private broadcast(
    agent: Pick<InternalAgent, 'sseClients'>,
    event: string,
    data: Record<string, unknown>
  ) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of agent.sseClients) {
      try {
        client.write(payload);
      } catch { /* client disconnected */ }
    }
  }

  private toPublicInfo(agent: InternalAgent): AgentPublicInfo {
    return {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      cwd: agent.cwd,
      description: agent.description,
      status: agent.status,
      currentRunId: agent.currentRunId,
      createdAt: agent.createdAt,
      runCount: agent.runHistory.length,
      conversationId: agent.conversationId,
    };
  }
}

export const agentPool = new AgentPool();
