import { Agent } from '@cursor/sdk';
import type { SDKAgent, SDKMessage, Run } from '@cursor/sdk';
import { config } from '../config.js';
import type { BridgeAgent, CreateAgentOpts, AgentPublicInfo, RunRecord, McpServerConfig, SDKImageInput, AgentDefinition, CloudConfig } from '../types.js';
import type { ServerResponse } from 'node:http';
import {
  createConversation, updateConversationStatus, addMessage, recordTokenUsage,
} from './database.js';
import { recordTrace } from './trace-service.js';
import { recordRunUsage } from './dashboard.js';

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
  sdkAgentId?: string;
  sseClients: Set<ServerResponse>;
  currentRun?: Run;
  lastActivityAt: number;
  conversationId: string;
  textBuffer: string;
  approvalEnabled: boolean;
  pendingApprovals: Map<string, ApprovalRequest>;
  systemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  subAgents?: Record<string, AgentDefinition>;
  cloudConfig?: CloudConfig;
  runtime: 'local' | 'cloud';
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

    const modelConfig: { id: string; params?: Array<{ id: string; value: string }> } = { id: model };
    if (opts.modelParams?.length) {
      modelConfig.params = opts.modelParams;
    }

    let sdkAgent: SDKAgent;
    let sdkAgentId: string | undefined;

    const isCloud = !!opts.cloud?.repos?.length;

    if (opts.resumeAgentId) {
      sdkAgent = await Agent.resume(opts.resumeAgentId, {
        apiKey: config.apiKey,
        ...(isCloud ? {} : { local: { cwd: opts.cwd } }),
      });
      sdkAgentId = opts.resumeAgentId;
      console.log(`[AgentPool] Resumed existing SDK agent: ${opts.resumeAgentId}`);
    } else {
      const createOpts: Record<string, any> = {
        apiKey: config.apiKey,
        model: modelConfig,
        name: opts.name,
        mode: opts.mode || 'agent',
      };

      if (isCloud) {
        createOpts.cloud = {
          repos: opts.cloud!.repos,
          autoCreatePR: opts.cloud!.autoCreatePR ?? false,
          ...(opts.cloud!.envVars ? { envVars: opts.cloud!.envVars } : {}),
        };
        console.log(`[AgentPool] Creating cloud agent "${opts.name}" repos=${opts.cloud!.repos.map(r => r.url).join(', ')}`);
      } else {
        createOpts.local = {
          cwd: opts.cwd,
          settingSources: ['project', 'user'],
        };
      }

      if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
        createOpts.mcpServers = opts.mcpServers;
      }

      if (opts.agents && Object.keys(opts.agents).length > 0) {
        createOpts.agents = opts.agents;
        console.log(`[AgentPool] Agent "${opts.name}" configured with sub-agents: ${Object.keys(opts.agents).join(', ')}`);
      }

      sdkAgent = await Agent.create(createOpts);
      sdkAgentId = sdkAgent.agentId;
    }

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
      sdkAgentId,
      sseClients: new Set(),
      conversationId: convId,
      textBuffer: '',
      approvalEnabled: false,
      pendingApprovals: new Map(),
      systemPrompt: opts.systemPrompt,
      mcpServers: opts.mcpServers,
      subAgents: opts.agents,
      cloudConfig: opts.cloud,
      runtime: isCloud ? 'cloud' : 'local',
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

  async send(agentId: string, prompt: string, images?: SDKImageInput[]): Promise<string> {
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
    console.log(`[AgentPool] Agent ${agentId} (${agent.name}) → running, runId=${runId}, prompt="${prompt.substring(0, 80)}..."${images?.length ? `, images=${images.length}` : ''}`);

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

    const message: string | { text: string; images: SDKImageInput[] } =
      images?.length ? { text: prompt, images } : prompt;

    this.processRun(agent, message, record).catch(err => {
      console.error(`[AgentPool] Run error for ${agentId}:`, err.message);
    });

    return runId;
  }

  private async processRun(agent: InternalAgent, prompt: string | { text: string; images: SDKImageInput[] }, record: RunRecord) {
    try {
      const run = await agent.sdkAgent.send(prompt as any, {
        onDelta: ({ update }: { update: any }) => {
          this.handleDeltaEvent(agent, update, record.id);
        },
        onStep: ({ step }: { step: any }) => {
          this.broadcast(agent, 'step', {
            type: step.type,
            runId: record.id,
          });
        },
      });
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

      recordRunUsage({
        model: agent.model,
        runId: record.id,
        agentId: agent.id,
        durationMs: result.durationMs ?? 0,
        timestamp: Date.now(),
      });

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

  private async persistRunResult(agent: InternalAgent, record: RunRecord) {
    try {
      let text = agent.textBuffer.trim();

      if (agent.currentRun) {
        try {
          if (agent.currentRun.supports('conversation')) {
            const turns = await agent.currentRun.conversation();
            const structured = turns
              .filter((t: any) => t.type === 'agentConversationTurn')
              .map((t: any) => t.turn);

            if (structured.length > 0) {
              const structuredText = JSON.stringify(structured);
              addMessage(agent.conversationId, 'assistant', structuredText.substring(0, 50000), 'structured', record.id);
            }
          }
        } catch { /* conversation() may not be supported */ }
      }

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

  private handleDeltaEvent(agent: InternalAgent, update: any, runId: string) {
    switch (update.type) {
      case 'text-delta':
        this.broadcast(agent, 'delta', {
          type: 'text-delta',
          text: update.text,
          runId,
        });
        break;
      case 'thinking-delta':
        this.broadcast(agent, 'delta', {
          type: 'thinking-delta',
          text: update.text,
          runId,
        });
        break;
      case 'tool-call-started':
        this.broadcast(agent, 'delta', {
          type: 'tool-call-started',
          toolCall: { type: update.toolCall?.type, name: update.toolCall?.name },
          runId,
        });
        break;
      case 'tool-call-completed':
        this.broadcast(agent, 'delta', {
          type: 'tool-call-completed',
          toolCall: { type: update.toolCall?.type, name: update.toolCall?.name },
          runId,
        });
        break;
      case 'token-delta':
        this.broadcast(agent, 'delta', {
          type: 'token-delta',
          runId,
        });
        break;
      case 'step-started':
        this.broadcast(agent, 'delta', {
          type: 'step-started',
          runId,
        });
        break;
      case 'step-completed':
        this.broadcast(agent, 'delta', {
          type: 'step-completed',
          runId,
        });
        break;
      case 'turn-ended':
        this.broadcast(agent, 'delta', {
          type: 'turn-ended',
          runId,
        });
        break;
      case 'shell-output-delta':
        this.broadcast(agent, 'delta', {
          type: 'shell-output-delta',
          text: update.text,
          runId,
        });
        break;
    }
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

  async getConversation(agentId: string): Promise<any[]> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');

    if (agent.currentRun) {
      try {
        if (agent.currentRun.supports('conversation')) {
          return await agent.currentRun.conversation();
        }
      } catch { /* run may have ended */ }
    }

    const lastRun = agent.runHistory[agent.runHistory.length - 1];
    if (lastRun && agent.sdkAgentId) {
      try {
        const run = await Agent.getRun(lastRun.id, {
          runtime: 'local',
          cwd: agent.cwd,
        });
        if (run.supports('conversation')) {
          return await run.conversation();
        }
      } catch { /* best effort */ }
    }

    return [];
  }

  async listSdkAgents(cwd?: string): Promise<any[]> {
    try {
      const result = await Agent.list({
        runtime: 'local',
        cwd: cwd || process.cwd(),
      } as any);
      return result.items || [];
    } catch {
      return [];
    }
  }

  async getSdkAgent(sdkAgentId: string): Promise<any | null> {
    try {
      return await Agent.get(sdkAgentId, {
        cwd: process.cwd(),
      } as any);
    } catch {
      return null;
    }
  }

  async listSdkRuns(sdkAgentId: string): Promise<any[]> {
    try {
      const result = await Agent.listRuns(sdkAgentId, {
        runtime: 'local',
        cwd: process.cwd(),
      } as any);
      return result.items || [];
    } catch {
      return [];
    }
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

  // ─── Convenience methods for multi-role engine ───

  async createAgent(opts: { name: string; model?: string; systemPrompt?: string }): Promise<string> {
    const info = await this.create({
      name: opts.name,
      model: opts.model,
      cwd: process.cwd(),
      description: opts.systemPrompt?.slice(0, 200),
      systemPrompt: opts.systemPrompt,
    });
    return info.id;
  }

  async sendPrompt(agentId: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'running') throw new Error('Agent is currently running a task');
    if (agent.status === 'disposed') throw new Error('Agent has been disposed');

    agent.status = 'running';
    agent.lastActivityAt = Date.now();
    agent.textBuffer = '';

    try {
      addMessage(agent.conversationId, 'user', prompt.substring(0, 10000));
    } catch { /* best effort */ }

    try {
      const fullPrompt = agent.systemPrompt
        ? `${agent.systemPrompt}\n\n---\n\n${prompt}`
        : prompt;

      const run = await agent.sdkAgent.send(fullPrompt);
      agent.currentRun = run;

      for await (const event of run.stream()) {
        if (event.type === 'assistant') {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              agent.textBuffer += block.text;
            }
          }
        }
      }

      await run.wait();
      const result = agent.textBuffer.trim();
      agent.status = 'idle';
      agent.currentRun = undefined;
      agent.lastActivityAt = Date.now();
      agent.textBuffer = '';

      try {
        if (result) addMessage(agent.conversationId, 'assistant', result.substring(0, 50000));
        updateConversationStatus(agent.conversationId, 'completed');
      } catch { /* best effort */ }

      return result;
    } catch (err: any) {
      agent.status = 'error';
      agent.currentRun = undefined;
      agent.textBuffer = '';
      try { updateConversationStatus(agent.conversationId, 'error'); } catch { /* best effort */ }
      throw err;
    }
  }

  async *sendPromptStream(agentId: string, prompt: string): AsyncGenerator<{ type: 'token' | 'done' | 'error'; content?: string }> {
    const agent = this.agents.get(agentId);
    if (!agent) { yield { type: 'error', content: 'Agent not found' }; return; }
    if (agent.status === 'running') { yield { type: 'error', content: 'Agent is currently running' }; return; }
    if (agent.status === 'disposed') { yield { type: 'error', content: 'Agent has been disposed' }; return; }

    agent.status = 'running';
    agent.lastActivityAt = Date.now();
    agent.textBuffer = '';

    try {
      addMessage(agent.conversationId, 'user', prompt.substring(0, 10000));
    } catch { /* best effort */ }

    try {
      const fullPrompt = agent.systemPrompt
        ? `${agent.systemPrompt}\n\n---\n\n${prompt}`
        : prompt;

      const run = await agent.sdkAgent.send(fullPrompt);
      agent.currentRun = run;

      for await (const event of run.stream()) {
        if (event.type === 'assistant') {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              agent.textBuffer += block.text;
              yield { type: 'token', content: block.text };
            }
          }
        }
      }

      await run.wait();
      const result = agent.textBuffer.trim();
      agent.status = 'idle';
      agent.currentRun = undefined;
      agent.lastActivityAt = Date.now();
      agent.textBuffer = '';

      try {
        if (result) addMessage(agent.conversationId, 'assistant', result.substring(0, 50000));
        updateConversationStatus(agent.conversationId, 'completed');
      } catch { /* best effort */ }

      yield { type: 'done', content: result };
    } catch (err: any) {
      agent.status = 'error';
      agent.currentRun = undefined;
      agent.textBuffer = '';
      try { updateConversationStatus(agent.conversationId, 'error'); } catch { /* best effort */ }
      yield { type: 'error', content: err.message };
    }
  }

  // ─── One-shot prompt (Agent.prompt) ───

  async prompt(opts: {
    model?: string;
    modelParams?: Array<{ id: string; value: string }>;
    cwd?: string;
    prompt: string;
    mcpServers?: Record<string, McpServerConfig>;
  }): Promise<{ result: string; durationMs?: number }> {
    const modelId = opts.model || config.defaultModel;
    const modelConfig: { id: string; params?: Array<{ id: string; value: string }> } = { id: modelId };
    if (opts.modelParams?.length) modelConfig.params = opts.modelParams;

    const result = await Agent.prompt(opts.prompt, {
      apiKey: config.apiKey,
      model: modelConfig,
      local: { cwd: opts.cwd || process.cwd() },
      ...(opts.mcpServers ? { mcpServers: opts.mcpServers } : {}),
    } as any);

    return {
      result: result.result || '',
      durationMs: result.durationMs,
    };
  }

  // ─── Hot-reload agent config ───

  async reload(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'running') throw new Error('Cannot reload while running');

    try {
      await agent.sdkAgent.reload();
      console.log(`[AgentPool] Agent ${agentId} (${agent.name}) config reloaded`);
      return true;
    } catch (err: any) {
      console.warn(`[AgentPool] reload failed for ${agentId}: ${err.message}`);
      return false;
    }
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

  // ─── Cloud Artifacts ───

  async listArtifacts(agentId: string): Promise<Array<{ path: string; size?: number }>> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.runtime !== 'cloud') return [];

    try {
      const artifacts = await agent.sdkAgent.listArtifacts();
      return (artifacts || []).map((a: any) => ({
        path: a.path || a.absolutePath || '',
        size: a.size ?? a.sizeBytes,
      }));
    } catch (err: any) {
      console.warn(`[AgentPool] listArtifacts failed for ${agentId}: ${err.message}`);
      return [];
    }
  }

  async downloadArtifact(agentId: string, artifactPath: string): Promise<Buffer> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.runtime !== 'cloud') throw new Error('Artifacts only available for cloud agents');

    return agent.sdkAgent.downloadArtifact(artifactPath);
  }

  getSdkAgentId(agentId: string): string | undefined {
    return this.agents.get(agentId)?.sdkAgentId;
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
      sdkAgentId: agent.sdkAgentId,
      runtime: agent.runtime,
      subAgentNames: agent.subAgents ? Object.keys(agent.subAgents) : undefined,
      hasCloudConfig: !!agent.cloudConfig,
    };
  }
}

export const agentPool = new AgentPool();
