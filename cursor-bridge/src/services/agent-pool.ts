import { Agent } from '@cursor/sdk';
import type { SDKAgent, SDKMessage, Run } from '@cursor/sdk';
import { config } from '../config.js';
import type { BridgeAgent, CreateAgentOpts, AgentPublicInfo, RunRecord } from '../types.js';
import type { ServerResponse } from 'node:http';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface InternalAgent extends BridgeAgent {
  sdkAgent: SDKAgent;
  sseClients: Set<ServerResponse>;
  currentRun?: Run;
  lastActivityAt: number;
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
    };

    this.agents.set(id, agent);
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
    const runId = `run_${Date.now()}_${randomId()}`;
    agent.currentRunId = runId;

    const record: RunRecord = {
      id: runId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
    };
    agent.runHistory.push(record);

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
      agent.status = result.status === 'error' ? 'error' : 'idle';
      agent.currentRunId = undefined;
      agent.currentRun = undefined;
      agent.lastActivityAt = Date.now();
      this.broadcast(agent, 'status', {
        status: record.status,
        runId: record.id,
        result: result.result,
        durationMs: result.durationMs,
      });
    } catch (err: any) {
      record.status = 'error';
      record.finishedAt = Date.now();
      agent.status = 'error';
      agent.currentRunId = undefined;
      agent.currentRun = undefined;
      this.broadcast(agent, 'error', { message: err.message, runId: record.id });
    }
  }

  private handleStreamEvent(agent: InternalAgent, event: SDKMessage, runId: string) {
    switch (event.type) {
      case 'assistant':
        for (const block of event.message.content) {
          if (block.type === 'text') {
            this.broadcast(agent, 'text', { content: block.text, runId });
          } else if (block.type === 'tool_use') {
            this.broadcast(agent, 'tool_call', {
              tool: block.name,
              callId: block.id,
              runId,
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
        break;
      case 'thinking':
        this.broadcast(agent, 'thinking', { text: event.text, runId });
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
    const runId = `run_${Date.now()}_${randomId()}`;
    agent.currentRunId = runId;

    const record: RunRecord = {
      id: runId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
    };
    agent.runHistory.push(record);

    this.processRun(agent, prompt, record).catch(err => {
      console.error(`[AgentPool] Resume error for ${agentId}:`, err.message);
    });

    return runId;
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
    };
  }
}

export const agentPool = new AgentPool();
