/**
 * Phase 5 — Multi-Role Collaboration Engine
 *
 * Orchestrates the full lifecycle:
 *   A. Task Analysis → B. Discussion → C. Execution → D. QA → E. Deployment → F. Report
 *
 * Integrates with:
 *   - enterprise-roles.ts: role templates & system prompts
 *   - phase5-trace-hooks.ts: whitebox observability
 *   - agent-pool.ts: Cursor SDK agent management
 *   - database.ts: persistence
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';

const log = {
  info: (msg: string, data?: any) => console.log(`[multi-role] ${msg}`, data ? JSON.stringify(data, null, 0).slice(0, 500) : ''),
  warn: (msg: string, data?: any) => console.warn(`[multi-role] ⚠ ${msg}`, data ? JSON.stringify(data, null, 0).slice(0, 500) : ''),
  error: (msg: string, err?: any) => console.error(`[multi-role] ✖ ${msg}`, err?.message || err || ''),
  debug: (msg: string, data?: any) => console.log(`[multi-role] 🔍 ${msg}`, data ? JSON.stringify(data, null, 0).slice(0, 300) : ''),
};
import {
  ENTERPRISE_ROLES,
  getRoleById,
  getRolesByPhase,
  buildRoleSystemPrompt,
  resolveModelForRole,
  setRoleModelOverride,
  removeRoleModelOverride,
  getRoleModelOverrides,
  setModelTierDefault,
  getModelTierDefaults,
  getAvailableModels,
  getModelRecommendation,
  type EnterpriseRole,
  type ModelTier,
} from './enterprise-roles.js';
import { agentPool } from './agent-pool.js';
import {
  traceOpinion,
  traceAgreement,
  traceObjection,
  traceVerdict,
  traceDelegation,
  traceEscalation,
  traceBugReport,
  traceBugFix,
  traceQualityGate,
  tracePhaseEnter,
  tracePhaseExit,
  traceSystemEvent,
} from './phase5-trace-hooks.js';

// ─── Types ───

export interface TaskAnalysis {
  id: string;
  projectId?: string;
  originalRequirement: string;
  summary: {
    type: 'feature' | 'bugfix' | 'refactor' | 'infra' | 'research';
    scope: 'small' | 'medium' | 'large' | 'epic';
    techStack: string[];
    estimatedComplexity: 1 | 2 | 3 | 4 | 5;
  };
  recommendedRoles: RoleRecommendation[];
  executionPlan: ExecutionPlan;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  createdAt: number;
}

export interface RoleRecommendation {
  roleId: string;
  reason: string;
  priority: 'required' | 'recommended' | 'optional';
  phase: 'discussion' | 'execution' | 'qa' | 'deployment';
}

export interface ExecutionPlan {
  phases: ExecutionPhase[];
  maxRounds: number;
  successCriteria: string[];
}

export interface ExecutionPhase {
  id: string;
  name: string;
  type: 'discussion' | 'execution' | 'qa' | 'deployment' | 'summary';
  roles: string[];
  dependsOn: string[];
  maxRounds: number;
  exitCondition: string;
}

export interface Discussion {
  id: string;
  taskAnalysisId: string;
  topic: string;
  phase: string;
  participants: { roleId: string; joinedAt: number; messageCount: number }[];
  rounds: DiscussionRound[];
  maxRounds: number;
  currentRound: number;
  status: 'active' | 'concluded' | 'timeout';
  conclusion?: DiscussionConclusion;
  createdAt: number;
}

export interface DiscussionRound {
  roundNumber: number;
  messages: DiscussionMessage[];
  summary?: string;
}

export interface DiscussionMessage {
  id: string;
  roleId: string;
  content: string;
  references: string[];
  timestamp: number;
  type: 'opinion' | 'question' | 'objection' | 'agreement' | 'decision';
}

export interface DiscussionConclusion {
  summary: string;
  decisions: { topic: string; decision: string; reason: string; decidedBy: string }[];
  actionItems: { description: string; assignedTo: string; priority: 'P0' | 'P1' | 'P2' }[];
  dissents: { roleId: string; point: string; resolution: string }[];
}

export interface ExecutionSquad {
  id: string;
  taskAnalysisId: string;
  leaderId: string;
  members: { roleId: string; agentId: string; assignedTasks: string[]; completedTasks: string[] }[];
  tasks: ExecutionTask[];
  milestones: Milestone[];
  status: 'planning' | 'executing' | 'reviewing' | 'completed' | 'blocked';
  currentMilestone: number;
  progressPercent: number;
  createdAt: number;
}

export interface ExecutionTask {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  reviewerId?: string;
  status: 'pending' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'failed';
  priority: 'P0' | 'P1' | 'P2';
  dependsOn: string[];
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  reviewComment?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Milestone {
  id: string;
  name: string;
  tasks: string[];
  status: 'pending' | 'in_progress' | 'completed';
  dueDescription: string;
}

export interface QASession {
  id: string;
  taskAnalysisId: string;
  executionSquadId: string;
  testPlan: { testCases: TestCase[]; coverageAreas: string[] };
  bugs: Bug[];
  rounds: QARound[];
  maxRounds: number;
  currentRound: number;
  qualityScore: number;
  passThreshold: number;
  status: 'planning' | 'testing' | 'waiting_fix' | 'regression' | 'passed' | 'failed';
  createdAt: number;
}

export interface TestCase {
  id: string;
  title: string;
  type: 'functional' | 'edge_case' | 'performance' | 'security';
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  status: 'pending' | 'pass' | 'fail' | 'blocked';
  bugId?: string;
}

export interface Bug {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  testCaseId: string;
  reproSteps: string[];
  expected: string;
  actual: string;
  assignedTo?: string;
  fixDescription?: string;
  status: 'open' | 'assigned' | 'fixing' | 'fixed' | 'verified' | 'reopened' | 'wontfix';
  round: number;
}

export interface QARound {
  roundNumber: number;
  testResults: { testCaseId: string; status: 'pass' | 'fail' }[];
  newBugs: string[];
  fixedBugs: string[];
  reopenedBugs: string[];
  passRate: number;
  timestamp: number;
}

export interface ProjectReport {
  id: string;
  taskAnalysisId: string;
  status: 'success' | 'partial' | 'timeout' | 'failed';
  summary: string;
  phases: PhaseReport[];
  metrics: ProjectMetrics;
  createdAt: number;
}

export interface PhaseReport {
  phase: string;
  status: 'completed' | 'partial' | 'skipped';
  duration: number;
  rounds: number;
  participants: string[];
  keyDecisions: string[];
  outputSummary: string;
}

export interface ProjectMetrics {
  totalDuration: number;
  totalRounds: number;
  totalMessages: number;
  totalTokens: number;
  discussionRounds: number;
  executionTasks: number;
  completedTasks: number;
  totalBugs: number;
  fixedBugs: number;
  qaPassRate: number;
  rolesInvolved: string[];
}

// ─── Database Schema Init ───

export function initMultiRoleTables() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_analyses (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      original_requirement TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommended_roles TEXT NOT NULL,
      execution_plan TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discussions (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      phase TEXT NOT NULL,
      participants TEXT NOT NULL,
      rounds TEXT NOT NULL,
      max_rounds INTEGER DEFAULT 3,
      current_round INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      conclusion TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_squads (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      leader_role TEXT NOT NULL,
      members TEXT NOT NULL,
      tasks TEXT NOT NULL,
      milestones TEXT,
      status TEXT DEFAULT 'planning',
      progress_percent INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qa_sessions (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      execution_squad_id TEXT NOT NULL,
      test_plan TEXT NOT NULL,
      bugs TEXT NOT NULL,
      rounds TEXT NOT NULL,
      max_rounds INTEGER DEFAULT 5,
      current_round INTEGER DEFAULT 0,
      quality_score REAL DEFAULT 0,
      pass_threshold REAL DEFAULT 80,
      status TEXT DEFAULT 'planning',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_reports (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      phases TEXT NOT NULL,
      metrics TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_project ON task_analyses(project_id);
    CREATE INDEX IF NOT EXISTS idx_discussion_task ON discussions(task_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_squad_task ON execution_squads(task_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_qa_task ON qa_sessions(task_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_report_task ON project_reports(task_analysis_id);
  `);

  initProgressTable();
}

// ─── 5.1 Task Analyzer ───

const TASK_ANALYZER_PROMPT = `你是一个智能项目分析器。根据用户的自然语言需求，分析并输出以下 JSON 结构（不要输出其他内容）：

{
  "summary": {
    "type": "feature|bugfix|refactor|infra|research",
    "scope": "small|medium|large|epic",
    "techStack": ["技术关键词"],
    "estimatedComplexity": 1-5
  },
  "recommendedRoles": [
    { "roleId": "角色ID", "reason": "推荐理由", "priority": "required|recommended|optional", "phase": "discussion|execution|qa|deployment" }
  ],
  "executionPlan": {
    "phases": [
      { "id": "唯一ID", "name": "阶段名", "type": "discussion|execution|qa|deployment|summary", "roles": ["角色ID"], "dependsOn": ["前置阶段ID"], "maxRounds": 3, "exitCondition": "退出条件" }
    ],
    "maxRounds": 10,
    "successCriteria": ["成功标准"]
  }
}

可选角色ID: operations, business, product, project-manager, architect, senior-dev, developer, qa, devops, tech-lead

根据需求的规模和类型推荐合适的角色组合：
- small: product + architect + developer + tech-lead (4 人)
- medium: operations + product + project-manager + architect + senior-dev + developer + qa + tech-lead (8 人)
- large/epic: 全部 10 个角色`;

export async function analyzeTask(requirement: string, projectId?: string, modelOverrides?: Record<string, string>): Promise<TaskAnalysis> {
  const id = randomUUID();
  const now = Date.now();
  log.info(`📋 开始分析任务 [${id.slice(0, 8)}]`, { requirement: requirement.slice(0, 100), projectId });

  if (modelOverrides) {
    for (const [roleId, model] of Object.entries(modelOverrides)) {
      setRoleModelOverride(roleId, model);
    }
    log.debug('模型覆盖配置', modelOverrides);
  }

  const techLeadRole = getRoleById('tech-lead')!;
  const analyzerModel = resolveModelForRole(techLeadRole, 3);
  log.info(`🤖 使用模型 ${analyzerModel} 进行任务分析`);

  const agentId = await agentPool.createAgent({
    name: 'task-analyzer',
    model: analyzerModel,
    systemPrompt: TASK_ANALYZER_PROMPT,
  });
  log.debug(`Agent 已创建: ${agentId}`);

  const t0 = Date.now();
  const result = await agentPool.sendPrompt(agentId, requirement);
  log.info(`✅ 分析完成 (${Date.now() - t0}ms)`, { resultLen: result.length });
  await agentPool.dispose(agentId);

  let parsed: any;
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || result);
  } catch {
    parsed = {
      summary: { type: 'feature', scope: 'medium', techStack: [], estimatedComplexity: 3 },
      recommendedRoles: [
        { roleId: 'product', reason: '需求分析', priority: 'required', phase: 'discussion' },
        { roleId: 'architect', reason: '技术方案', priority: 'required', phase: 'discussion' },
        { roleId: 'developer', reason: '代码实现', priority: 'required', phase: 'execution' },
        { roleId: 'tech-lead', reason: '全局协调', priority: 'required', phase: 'discussion' },
      ],
      executionPlan: {
        phases: [
          { id: 'disc', name: '讨论', type: 'discussion', roles: ['product', 'architect', 'tech-lead'], dependsOn: [], maxRounds: 3, exitCondition: 'Tech Lead 总结' },
          { id: 'exec', name: '执行', type: 'execution', roles: ['developer'], dependsOn: ['disc'], maxRounds: 5, exitCondition: '任务完成' },
          { id: 'qa', name: '测试', type: 'qa', roles: ['qa'], dependsOn: ['exec'], maxRounds: 3, exitCondition: '通过率80%' },
        ],
        maxRounds: 10,
        successCriteria: ['功能实现完整', '测试通过率≥80%'],
      },
    };
  }

  const normalizeRoleId = (rid: string): string => {
    const role = getRoleById(rid);
    return role ? role.id : rid;
  };

  const normalizedRoles = (parsed.recommendedRoles || []).map((r: any) => ({
    ...r,
    roleId: normalizeRoleId(r.roleId || r.id || ''),
  }));

  const normalizedPlan = parsed.executionPlan || {};
  if (normalizedPlan.phases) {
    normalizedPlan.phases = normalizedPlan.phases.map((p: any) => ({
      ...p,
      roles: (p.roles || []).map((rid: string) => normalizeRoleId(rid)),
    }));
  }

  const analysis: TaskAnalysis = {
    id,
    projectId,
    originalRequirement: requirement,
    summary: parsed.summary,
    recommendedRoles: normalizedRoles,
    executionPlan: normalizedPlan,
    status: 'draft',
    createdAt: now,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO task_analyses (id, project_id, original_requirement, summary, recommended_roles, execution_plan, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId || null, requirement,
    JSON.stringify(analysis.summary),
    JSON.stringify(analysis.recommendedRoles),
    JSON.stringify(analysis.executionPlan),
    'draft', now,
  );

  traceSystemEvent({ taskAnalysisId: id, phase: 'analysis' }, `Task analyzed: ${requirement.slice(0, 80)}`);

  return analysis;
}

export function approveTask(taskId: string, modifications?: Partial<Pick<TaskAnalysis, 'recommendedRoles' | 'executionPlan'>>) {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM task_analyses WHERE id = ?').get(taskId);
  if (!row) throw new Error(`Task ${taskId} not found`);

  const updates: Record<string, string> = { status: 'approved' };
  if (modifications?.recommendedRoles) {
    updates.recommended_roles = JSON.stringify(modifications.recommendedRoles);
  }
  if (modifications?.executionPlan) {
    updates.execution_plan = JSON.stringify(modifications.executionPlan);
  }

  const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE task_analyses SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), taskId);

  traceSystemEvent({ taskAnalysisId: taskId, phase: 'analysis' }, 'Task approved by user');
}

// ─── 5.3 Discussion Protocol ───

export async function createDiscussion(taskAnalysisId: string, topic: string, phase: string, roleIds: string[], maxRounds = 3): Promise<Discussion> {
  const id = randomUUID();
  const now = Date.now();
  log.info(`💬 创建讨论 [${id.slice(0, 8)}]`, { taskAnalysisId: taskAnalysisId.slice(0, 8), topic: topic.slice(0, 80), phase, roles: roleIds, maxRounds });

  const participants = roleIds.map((roleId) => ({ roleId, joinedAt: now, messageCount: 0 }));

  const discussion: Discussion = {
    id,
    taskAnalysisId,
    topic,
    phase,
    participants,
    rounds: [],
    maxRounds,
    currentRound: 0,
    status: 'active',
    createdAt: now,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO discussions (id, task_analysis_id, topic, phase, participants, rounds, max_rounds, current_round, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskAnalysisId, topic, phase, JSON.stringify(participants), '[]', maxRounds, 0, 'active', now);

  tracePhaseEnter({ taskAnalysisId, phase }, 'system', 'system', `discussion:${phase}`);

  return discussion;
}

export async function runDiscussionRound(discussionId: string): Promise<DiscussionRound> {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM discussions WHERE id = ?').get(discussionId);
  if (!row) throw new Error(`Discussion ${discussionId} not found`);

  const discussion: Discussion = {
    ...row,
    participants: JSON.parse(row.participants),
    rounds: JSON.parse(row.rounds),
    conclusion: row.conclusion ? JSON.parse(row.conclusion) : undefined,
  };

  if (discussion.status !== 'active') throw new Error('Discussion is not active');
  if (discussion.currentRound >= discussion.maxRounds) throw new Error('Max rounds reached');

  const roundNumber = discussion.currentRound + 1;
  const messages: DiscussionMessage[] = [];
  const ctx = { taskAnalysisId: discussion.taskAnalysisId, phase: discussion.phase };

  const previousMessagesForContext = discussion.rounds.flatMap((r) =>
    r.messages.map((m) => `[${getRoleById(m.roleId)?.name || m.roleId}]: ${m.content.slice(0, 200)}`)
  );

  log.info(`🔄 讨论轮次 ${roundNumber}/${discussion.maxRounds} 开始, 参与者: ${discussion.participants.map(p => p.roleId).join(', ')}`);

  for (const participant of discussion.participants) {
    const role = getRoleById(participant.roleId);
    if (!role) { log.warn(`角色 ${participant.roleId} 未找到，跳过`); continue; }

    log.debug(`  → ${role.name} (${role.nameEn}) 开始发言...`);
    const systemPrompt = buildRoleSystemPrompt(role, {
      topic: discussion.topic,
      otherParticipants: discussion.participants
        .filter((p) => p.roleId !== participant.roleId)
        .map((p) => getRoleById(p.roleId)?.name || p.roleId),
      round: roundNumber,
      previousMessages: previousMessagesForContext,
    });

    const roleModel = resolveModelForRole(role);
    const agentId = await agentPool.createAgent({
      name: `${role.nameEn}-${discussionId.slice(0, 8)}`,
      model: roleModel,
      systemPrompt,
    });

    const prompt = roundNumber === 1
      ? `请针对以下议题发表你的专业意见：\n\n${discussion.topic}`
      : `基于前面各位的发言，请从你的角色视角补充、回应或提出新观点。`;

    const t0 = Date.now();
    const content = await agentPool.sendPrompt(agentId, prompt);
    await agentPool.dispose(agentId);
    log.info(`  ✅ ${role.name} 发言完成 (${Date.now() - t0}ms, ${content.length}字)`);

    const refs = parseReferences(content, discussionId);
    const msg: DiscussionMessage = {
      id: randomUUID(),
      roleId: participant.roleId,
      content,
      references: refs.map((r) => r.messageId),
      timestamp: Date.now(),
      type: 'opinion',
    };
    messages.push(msg);

    traceOpinion(ctx, `role-${participant.roleId}`, participant.roleId, content.slice(0, 500));
    participant.messageCount++;
  }
  log.info(`🔄 讨论轮次 ${roundNumber} 完成, 共 ${messages.length} 条发言`);

  const round: DiscussionRound = { roundNumber, messages };
  discussion.rounds.push(round);
  discussion.currentRound = roundNumber;

  if (roundNumber >= discussion.maxRounds) {
    discussion.status = 'concluded';
  }

  db.prepare(`
    UPDATE discussions SET rounds = ?, current_round = ?, status = ?, participants = ? WHERE id = ?
  `).run(
    JSON.stringify(discussion.rounds),
    discussion.currentRound,
    discussion.status,
    JSON.stringify(discussion.participants),
    discussionId,
  );

  return round;
}

export async function* streamDiscussionRound(discussionId: string): AsyncGenerator<{
  type: 'role_start' | 'role_token' | 'role_done' | 'round_done' | 'error';
  roleId?: string;
  roleName?: string;
  content?: string;
  roundNumber?: number;
  messageCount?: number;
  elapsed?: number;
  concluded?: boolean;
}> {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM discussions WHERE id = ?').get(discussionId);
  if (!row) { yield { type: 'error', content: `Discussion ${discussionId} not found` }; return; }

  const discussion: Discussion = {
    ...row,
    participants: JSON.parse(row.participants),
    rounds: JSON.parse(row.rounds),
    conclusion: row.conclusion ? JSON.parse(row.conclusion) : undefined,
  };

  if (discussion.status !== 'active') { yield { type: 'error', content: 'Discussion is not active' }; return; }
  if (discussion.currentRound >= discussion.maxRounds) { yield { type: 'error', content: 'Max rounds reached' }; return; }

  const roundNumber = discussion.currentRound + 1;
  const messages: DiscussionMessage[] = [];
  const ctx = { taskAnalysisId: discussion.taskAnalysisId, phase: discussion.phase };

  const previousMessagesForContext = discussion.rounds.flatMap((r) =>
    r.messages.map((m) => `[${getRoleById(m.roleId)?.name || m.roleId}]: ${m.content.slice(0, 200)}`)
  );

  log.info(`🔄 [流式] 讨论轮次 ${roundNumber}/${discussion.maxRounds} 开始`);

  for (const participant of discussion.participants) {
    const role = getRoleById(participant.roleId);
    if (!role) continue;

    yield { type: 'role_start', roleId: participant.roleId, roleName: role.name, roundNumber };

    const systemPrompt = buildRoleSystemPrompt(role, {
      topic: discussion.topic,
      otherParticipants: discussion.participants
        .filter((p) => p.roleId !== participant.roleId)
        .map((p) => getRoleById(p.roleId)?.name || p.roleId),
      round: roundNumber,
      previousMessages: previousMessagesForContext,
    });

    const roleModel = resolveModelForRole(role);
    const agentId = await agentPool.createAgent({ name: `${role.nameEn}-${discussionId.slice(0, 8)}`, model: roleModel, systemPrompt });

    const prompt = roundNumber === 1
      ? `请针对以下议题发表你的专业意见：\n\n${discussion.topic}`
      : `基于前面各位的发言，请从你的角色视角补充、回应或提出新观点。`;

    const t0 = Date.now();
    let fullContent = '';

    for await (const chunk of agentPool.sendPromptStream(agentId, prompt)) {
      if (chunk.type === 'token' && chunk.content) {
        fullContent += chunk.content;
        yield { type: 'role_token', roleId: participant.roleId, roleName: role.name, content: chunk.content, roundNumber };
      } else if (chunk.type === 'error') {
        log.error(`角色 ${role.name} 流式出错: ${chunk.content}`);
        break;
      }
    }

    await agentPool.dispose(agentId);
    const elapsed = Date.now() - t0;

    const refs = parseReferences(fullContent, discussionId);
    const msg: DiscussionMessage = {
      id: randomUUID(),
      roleId: participant.roleId,
      content: fullContent,
      references: refs.map((r) => r.messageId),
      timestamp: Date.now(),
      type: 'opinion',
    };
    messages.push(msg);
    participant.messageCount++;

    traceOpinion(ctx, `role-${participant.roleId}`, participant.roleId, fullContent.slice(0, 500));

    yield { type: 'role_done', roleId: participant.roleId, roleName: role.name, content: fullContent, roundNumber, elapsed };
  }

  const round: DiscussionRound = { roundNumber, messages };
  discussion.rounds.push(round);
  discussion.currentRound = roundNumber;

  const concluded = roundNumber >= discussion.maxRounds;
  if (concluded) discussion.status = 'concluded';

  db.prepare(`UPDATE discussions SET rounds = ?, current_round = ?, status = ?, participants = ? WHERE id = ?`).run(
    JSON.stringify(discussion.rounds), discussion.currentRound, discussion.status, JSON.stringify(discussion.participants), discussionId,
  );

  yield { type: 'round_done', roundNumber, messageCount: messages.length, concluded };
}

export async function concludeDiscussion(discussionId: string): Promise<DiscussionConclusion> {
  log.info(`📝 开始总结讨论 [${discussionId.slice(0, 8)}]`);
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM discussions WHERE id = ?').get(discussionId);
  if (!row) { log.error(`讨论 ${discussionId} 未找到`); throw new Error(`Discussion ${discussionId} not found`); }

  const discussion = {
    ...row,
    rounds: JSON.parse(row.rounds),
  };

  const allMessages = discussion.rounds.flatMap((r: DiscussionRound) =>
    r.messages.map((m: DiscussionMessage) => `[${getRoleById(m.roleId)?.name || m.roleId}] (Round ${r.roundNumber}): ${m.content}`)
  );

  const summaryPrompt = `你是技术负责人 (Tech Lead)，请总结以下团队讨论并做出决策。

## 讨论记录
${allMessages.join('\n\n---\n\n')}

## 请输出 JSON 格式的结论（不要输出其他内容）：
{
  "summary": "讨论总结",
  "decisions": [{ "topic": "决策议题", "decision": "决策内容", "reason": "理由", "decidedBy": "tech-lead" }],
  "actionItems": [{ "description": "行动项", "assignedTo": "角色ID", "priority": "P0|P1|P2" }],
  "dissents": [{ "roleId": "有异议的角色", "point": "异议点", "resolution": "处理方式" }]
}`;

  const techLeadRole = getRoleById('tech-lead')!;
  const concludeModel = resolveModelForRole(techLeadRole);
  const agentId = await agentPool.createAgent({
    name: `tech-lead-conclude-${discussionId.slice(0, 8)}`,
    model: concludeModel,
    systemPrompt: '你是技术负责人，负责总结团队讨论并做出最终决策。输出 JSON 格式。',
  });

  const result = await agentPool.sendPrompt(agentId, summaryPrompt);
  await agentPool.dispose(agentId);

  let conclusion: DiscussionConclusion;
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    conclusion = JSON.parse(jsonMatch?.[0] || result);
  } catch {
    conclusion = {
      summary: result.slice(0, 500),
      decisions: [],
      actionItems: [],
      dissents: [],
    };
  }

  db.prepare('UPDATE discussions SET status = ?, conclusion = ? WHERE id = ?')
    .run('concluded', JSON.stringify(conclusion), discussionId);

  const ctx = { taskAnalysisId: discussion.task_analysis_id, phase: discussion.phase };
  traceVerdict(ctx, 'role-tech-lead', 'tech-lead', discussion.topic, conclusion.summary, '多角色讨论收敛', [], [], []);
  tracePhaseExit(ctx, 'role-tech-lead', 'tech-lead', `discussion:${discussion.phase}`, 'concluded', conclusion.summary);

  return conclusion;
}

// ─── 5.4 Execution Squad ───

export function createExecutionSquad(taskAnalysisId: string, tasks: Omit<ExecutionTask, 'id' | 'status' | 'startedAt' | 'completedAt'>[]): ExecutionSquad {
  const id = randomUUID();
  const now = Date.now();

  const executionTasks: ExecutionTask[] = tasks.map((t) => ({
    ...t,
    id: randomUUID(),
    status: 'pending',
  }));

  const roleIds = [...new Set(tasks.map((t) => t.assignedTo))];
  const members = roleIds.map((roleId) => ({
    roleId,
    agentId: '',
    assignedTasks: executionTasks.filter((t) => t.assignedTo === roleId).map((t) => t.id),
    completedTasks: [],
  }));

  const squad: ExecutionSquad = {
    id,
    taskAnalysisId,
    leaderId: 'project-manager',
    members,
    tasks: executionTasks,
    milestones: [],
    status: 'planning',
    currentMilestone: 0,
    progressPercent: 0,
    createdAt: now,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO execution_squads (id, task_analysis_id, leader_role, members, tasks, milestones, status, progress_percent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskAnalysisId, 'project-manager', JSON.stringify(members), JSON.stringify(executionTasks), '[]', 'planning', 0, now);

  const ctx = { taskAnalysisId, phase: 'execution' };
  tracePhaseEnter(ctx, 'role-project-manager', 'project-manager', 'execution');
  for (const task of executionTasks) {
    traceDelegation(ctx, 'role-project-manager', 'project-manager', task.id, task.assignedTo, task.title);
  }

  return squad;
}

export async function executeTask(squadId: string, taskId: string): Promise<string> {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM execution_squads WHERE id = ?').get(squadId);
  if (!row) throw new Error(`Squad ${squadId} not found`);

  const tasks: ExecutionTask[] = JSON.parse(row.tasks);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  let role = getRoleById(task.assignedTo);
  if (!role && task.assignedTo.includes('+')) {
    const candidates = task.assignedTo.split('+');
    for (const c of candidates) {
      role = getRoleById(c.trim());
      if (role) break;
    }
  }
  if (!role) {
    log.warn(`角色 "${task.assignedTo}" 未找到，降级使用 senior-dev`);
    role = getRoleById('senior-dev')!;
  }

  task.status = 'in_progress';
  task.startedAt = Date.now();
  log.info(`⚙️ 执行任务 [${taskId.slice(0, 8)}]: ${task.title}, 分配给 ${role.name} (原始: ${task.assignedTo})`);

  const systemPrompt = buildRoleSystemPrompt(role, { topic: task.description });
  const execModel = resolveModelForRole(role);
  const agentId = await agentPool.createAgent({
    name: `${role.nameEn}-exec-${taskId.slice(0, 8)}`,
    model: execModel,
    systemPrompt,
  });

  const prompt = `## 任务\n${task.title}\n\n## 描述\n${task.description}\n\n## 输入\n${task.input}\n\n## 期望输出\n${task.expectedOutput}\n\n请完成该任务。`;
  const t0 = Date.now();
  const output = await agentPool.sendPrompt(agentId, prompt);
  await agentPool.dispose(agentId);
  log.info(`  ✅ 任务执行完成 (${Date.now() - t0}ms, ${output.length}字)`);

  task.actualOutput = output;
  task.status = task.reviewerId ? 'in_review' : 'completed';
  task.completedAt = Date.now();

  updateSquadProgress(row, tasks, db, squadId);
  return output;
}

function updateSquadProgress(row: any, tasks: ExecutionTask[], db: any, squadId: string) {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const progress = Math.round((completed / tasks.length) * 100);
  const status = progress === 100 ? 'completed' : 'executing';

  db.prepare('UPDATE execution_squads SET tasks = ?, progress_percent = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(tasks), progress, status, squadId);
}

// ─── 5.5 QA Feedback Loop ───

export function createQASession(taskAnalysisId: string, executionSquadId: string, testCases: Omit<TestCase, 'id' | 'status'>[], maxRounds = 5, passThreshold = 80): QASession {
  const id = randomUUID();
  const now = Date.now();

  const cases: TestCase[] = testCases.map((tc) => ({
    ...tc,
    id: randomUUID(),
    status: 'pending',
  }));

  const session: QASession = {
    id,
    taskAnalysisId,
    executionSquadId,
    testPlan: { testCases: cases, coverageAreas: [...new Set(cases.map((c) => c.type))] },
    bugs: [],
    rounds: [],
    maxRounds,
    currentRound: 0,
    qualityScore: 0,
    passThreshold,
    status: 'planning',
    createdAt: now,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO qa_sessions (id, task_analysis_id, execution_squad_id, test_plan, bugs, rounds, max_rounds, current_round, quality_score, pass_threshold, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskAnalysisId, executionSquadId, JSON.stringify(session.testPlan), '[]', '[]', maxRounds, 0, 0, passThreshold, 'planning', now);

  tracePhaseEnter({ taskAnalysisId, phase: 'qa' }, 'role-qa', 'qa', 'qa');
  return session;
}

export async function runQARound(sessionId: string): Promise<QARound> {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM qa_sessions WHERE id = ?').get(sessionId);
  if (!row) throw new Error(`QA Session ${sessionId} not found`);

  const session: QASession = {
    ...row,
    testPlan: JSON.parse(row.test_plan),
    bugs: JSON.parse(row.bugs),
    rounds: JSON.parse(row.rounds),
  };

  const roundNumber = session.currentRound + 1;
  const testResults: { testCaseId: string; status: 'pass' | 'fail' }[] = [];
  const newBugs: string[] = [];
  const ctx = { taskAnalysisId: session.taskAnalysisId, phase: 'qa' };

  const qaRole = getRoleById('qa')!;
  const qaModel = resolveModelForRole(qaRole);
  const agentId = await agentPool.createAgent({
    name: `qa-round-${roundNumber}`,
    model: qaModel,
    systemPrompt: buildRoleSystemPrompt(qaRole, { topic: '执行测试用例' }),
  });

  for (const tc of session.testPlan.testCases) {
    if (tc.status === 'pass') {
      testResults.push({ testCaseId: tc.id, status: 'pass' });
      continue;
    }

    const prompt = `执行测试用例：\n标题: ${tc.title}\n步骤: ${tc.steps.join(' → ')}\n期望结果: ${tc.expectedResult}\n\n请判断此测试用例是否通过（回答 PASS 或 FAIL，如果 FAIL 请说明原因）。`;
    const result = await agentPool.sendPrompt(agentId, prompt);

    const passed = result.toUpperCase().includes('PASS') && !result.toUpperCase().includes('FAIL');
    tc.status = passed ? 'pass' : 'fail';
    testResults.push({ testCaseId: tc.id, status: tc.status });

    if (!passed) {
      const bug: Bug = {
        id: randomUUID(),
        title: `${tc.title} 未通过`,
        severity: 'major',
        testCaseId: tc.id,
        reproSteps: tc.steps,
        expected: tc.expectedResult,
        actual: result.slice(0, 300),
        status: 'open',
        round: roundNumber,
      };
      session.bugs.push(bug);
      newBugs.push(bug.id);
      tc.bugId = bug.id;

      traceBugReport(ctx, 'role-qa', 'qa', bug.title, bug.severity);
    }
  }

  await agentPool.dispose(agentId);

  const passCount = testResults.filter((r) => r.status === 'pass').length;
  const passRate = Math.round((passCount / testResults.length) * 100);

  const round: QARound = {
    roundNumber,
    testResults,
    newBugs,
    fixedBugs: [],
    reopenedBugs: [],
    passRate,
    timestamp: Date.now(),
  };

  session.rounds.push(round);
  session.currentRound = roundNumber;
  session.qualityScore = passRate;

  let newStatus: QASession['status'] = 'testing';
  if (passRate >= session.passThreshold) newStatus = 'passed';
  else if (roundNumber >= session.maxRounds) newStatus = 'failed';
  else if (newBugs.length > 0) newStatus = 'waiting_fix';

  session.status = newStatus;
  traceQualityGate(ctx, 'role-qa', 'qa', passRate, session.passThreshold, passRate >= session.passThreshold);

  db.prepare(`
    UPDATE qa_sessions SET test_plan = ?, bugs = ?, rounds = ?, current_round = ?, quality_score = ?, status = ? WHERE id = ?
  `).run(
    JSON.stringify(session.testPlan),
    JSON.stringify(session.bugs),
    JSON.stringify(session.rounds),
    session.currentRound,
    session.qualityScore,
    session.status,
    sessionId,
  );

  return round;
}

// ─── 5.6 Completion & Report ───

export function generateProjectReport(taskAnalysisId: string): ProjectReport {
  const db = getDb();
  const taskRow: any = db.prepare('SELECT * FROM task_analyses WHERE id = ?').get(taskAnalysisId);
  if (!taskRow) throw new Error(`Task ${taskAnalysisId} not found`);

  const discussions: any[] = db.prepare('SELECT * FROM discussions WHERE task_analysis_id = ?').all(taskAnalysisId);
  const squads: any[] = db.prepare('SELECT * FROM execution_squads WHERE task_analysis_id = ?').all(taskAnalysisId);
  const qaSessions: any[] = db.prepare('SELECT * FROM qa_sessions WHERE task_analysis_id = ?').all(taskAnalysisId);

  const phases: PhaseReport[] = [];
  let totalMessages = 0;
  let totalRounds = 0;

  for (const d of discussions) {
    const rounds = JSON.parse(d.rounds);
    const msgs = rounds.flatMap((r: any) => r.messages);
    totalMessages += msgs.length;
    totalRounds += rounds.length;
    phases.push({
      phase: `discussion:${d.phase}`,
      status: d.status === 'concluded' ? 'completed' : 'partial',
      duration: Date.now() - d.created_at,
      rounds: rounds.length,
      participants: JSON.parse(d.participants).map((p: any) => p.roleId),
      keyDecisions: d.conclusion ? JSON.parse(d.conclusion).decisions?.map((d: any) => d.decision) || [] : [],
      outputSummary: d.conclusion ? JSON.parse(d.conclusion).summary || '' : '',
    });
  }

  let executionTasks = 0;
  let completedTasks = 0;
  for (const s of squads) {
    const tasks: ExecutionTask[] = JSON.parse(s.tasks);
    executionTasks += tasks.length;
    completedTasks += tasks.filter((t) => t.status === 'completed').length;
    phases.push({
      phase: 'execution',
      status: s.status === 'completed' ? 'completed' : 'partial',
      duration: Date.now() - s.created_at,
      rounds: 0,
      participants: JSON.parse(s.members).map((m: any) => m.roleId),
      keyDecisions: [],
      outputSummary: `${completedTasks}/${executionTasks} tasks completed`,
    });
  }

  let totalBugs = 0;
  let fixedBugs = 0;
  let qaPassRate = 0;
  for (const q of qaSessions) {
    const bugs: Bug[] = JSON.parse(q.bugs);
    totalBugs += bugs.length;
    fixedBugs += bugs.filter((b) => b.status === 'verified' || b.status === 'fixed').length;
    qaPassRate = q.quality_score;
    phases.push({
      phase: 'qa',
      status: q.status === 'passed' ? 'completed' : 'partial',
      duration: Date.now() - q.created_at,
      rounds: q.current_round,
      participants: ['qa'],
      keyDecisions: [],
      outputSummary: `Pass rate: ${q.quality_score}%, Bugs: ${bugs.length}`,
    });
  }

  const allRoles = [...new Set(phases.flatMap((p) => p.participants))];
  const overallStatus: ProjectReport['status'] = qaPassRate >= 80 ? 'success' : qaPassRate > 0 ? 'partial' : 'timeout';

  const report: ProjectReport = {
    id: randomUUID(),
    taskAnalysisId,
    status: overallStatus,
    summary: `需求: ${taskRow.original_requirement.slice(0, 100)}`,
    phases,
    metrics: {
      totalDuration: Date.now() - taskRow.created_at,
      totalRounds,
      totalMessages,
      totalTokens: 0,
      discussionRounds: totalRounds,
      executionTasks,
      completedTasks,
      totalBugs,
      fixedBugs,
      qaPassRate,
      rolesInvolved: allRoles,
    },
    createdAt: Date.now(),
  };

  db.prepare(`
    INSERT INTO project_reports (id, task_analysis_id, status, summary, phases, metrics, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(report.id, taskAnalysisId, report.status, report.summary, JSON.stringify(report.phases), JSON.stringify(report.metrics), report.createdAt);

  traceSystemEvent({ taskAnalysisId, phase: 'summary' }, `Report generated: ${overallStatus}`);
  return report;
}

// ─── 5.7 Progress Tracking (TodoWrite-style) ───

export interface ProgressItem {
  id: string;
  taskAnalysisId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  assignedTo: string;
  phase: string;
  order: number;
  output?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export function initProgressTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_progress (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_to TEXT NOT NULL,
      phase TEXT NOT NULL,
      item_order INTEGER NOT NULL,
      output TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress(task_analysis_id);
  `);
}

export function createProgressItems(taskAnalysisId: string, items: Omit<ProgressItem, 'id' | 'createdAt'>[]): ProgressItem[] {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO task_progress (id, task_analysis_id, title, status, assigned_to, phase, item_order, output, started_at, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result: ProgressItem[] = [];
  for (const item of items) {
    const id = randomUUID();
    stmt.run(id, taskAnalysisId, item.title, item.status, item.assignedTo, item.phase, item.order, item.output || null, item.startedAt || null, item.completedAt || null, now);
    result.push({ ...item, id, createdAt: now });
  }
  return result;
}

export function updateProgressItem(itemId: string, updates: Partial<Pick<ProgressItem, 'status' | 'output' | 'startedAt' | 'completedAt'>>): boolean {
  const db = getDb();
  const sets: string[] = [];
  const vals: any[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    vals.push(updates.status);
    if (updates.status === 'in_progress' && !updates.startedAt) {
      sets.push('started_at = ?');
      vals.push(Date.now());
    }
    if ((updates.status === 'completed' || updates.status === 'failed') && !updates.completedAt) {
      sets.push('completed_at = ?');
      vals.push(Date.now());
    }
  }
  if (updates.output !== undefined) { sets.push('output = ?'); vals.push(updates.output); }
  if (updates.startedAt !== undefined) { sets.push('started_at = ?'); vals.push(updates.startedAt); }
  if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); vals.push(updates.completedAt); }

  if (sets.length === 0) return false;
  vals.push(itemId);
  const res = db.prepare(`UPDATE task_progress SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return res.changes > 0;
}

export function getProgressItems(taskAnalysisId: string): ProgressItem[] {
  const db = getDb();
  const rows: any[] = db.prepare(
    'SELECT * FROM task_progress WHERE task_analysis_id = ? ORDER BY item_order ASC'
  ).all(taskAnalysisId);
  return rows.map((r) => ({
    id: r.id,
    taskAnalysisId: r.task_analysis_id,
    title: r.title,
    status: r.status,
    assignedTo: r.assigned_to,
    phase: r.phase,
    order: r.item_order,
    output: r.output,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }));
}

export function getProgressSummary(taskAnalysisId: string): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  failed: number;
  blocked: number;
  percent: number;
  items: ProgressItem[];
} {
  const items = getProgressItems(taskAnalysisId);
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const inProgress = items.filter((i) => i.status === 'in_progress').length;
  const pending = items.filter((i) => i.status === 'pending').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, inProgress, pending, failed, blocked, percent, items };
}

// ─── 5.8 Agent References (@agent-name) ───

export interface AgentReference {
  roleId: string;
  roleName: string;
  messageId: string;
  contentSnippet: string;
}

export function parseReferences(content: string, discussionId: string): AgentReference[] {
  const refPattern = /@(\S+)/g;
  const refs: AgentReference[] = [];
  let match;

  while ((match = refPattern.exec(content)) !== null) {
    const refName = match[1];
    const role = ENTERPRISE_ROLES.find(
      (r) => r.id === refName || r.name === refName || r.nameEn.toLowerCase() === refName.toLowerCase()
    );
    if (!role) continue;

    const db = getDb();
    const row: any = db.prepare('SELECT rounds FROM discussions WHERE id = ?').get(discussionId);
    if (!row) continue;

    const rounds: DiscussionRound[] = JSON.parse(row.rounds);
    const lastMsg = rounds
      .flatMap((r) => r.messages)
      .filter((m) => m.roleId === role.id)
      .pop();

    if (lastMsg) {
      refs.push({
        roleId: role.id,
        roleName: role.name,
        messageId: lastMsg.id,
        contentSnippet: lastMsg.content.slice(0, 200),
      });
    }
  }

  return refs;
}

export function buildReferenceContext(references: AgentReference[]): string {
  if (references.length === 0) return '';
  const lines = references.map((r) =>
    `[@${r.roleName}] 的发言: "${r.contentSnippet}..."`
  );
  return `\n## 引用的发言\n${lines.join('\n')}`;
}

// ─── Query Helpers ───

export function getTaskAnalysis(id: string): TaskAnalysis | null {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM task_analyses WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    originalRequirement: row.original_requirement,
    summary: JSON.parse(row.summary),
    recommendedRoles: JSON.parse(row.recommended_roles),
    executionPlan: JSON.parse(row.execution_plan),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function getDiscussion(id: string): Discussion | null {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM discussions WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    participants: JSON.parse(row.participants),
    rounds: JSON.parse(row.rounds),
    conclusion: row.conclusion ? JSON.parse(row.conclusion) : undefined,
  };
}

export function getExecutionSquad(id: string): ExecutionSquad | null {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM execution_squads WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    taskAnalysisId: row.task_analysis_id,
    leaderId: row.leader_role,
    members: JSON.parse(row.members),
    tasks: JSON.parse(row.tasks),
    milestones: row.milestones ? JSON.parse(row.milestones) : [],
    status: row.status,
    currentMilestone: 0,
    progressPercent: row.progress_percent,
    createdAt: row.created_at,
  };
}

export function getQASession(id: string): QASession | null {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM qa_sessions WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    taskAnalysisId: row.task_analysis_id,
    executionSquadId: row.execution_squad_id,
    testPlan: JSON.parse(row.test_plan),
    bugs: JSON.parse(row.bugs),
    rounds: JSON.parse(row.rounds),
    maxRounds: row.max_rounds,
    currentRound: row.current_round,
    qualityScore: row.quality_score,
    passThreshold: row.pass_threshold,
  };
}

export {
  ENTERPRISE_ROLES, getRoleById, getRolesByPhase,
  resolveModelForRole, setRoleModelOverride, removeRoleModelOverride,
  getRoleModelOverrides, setModelTierDefault, getModelTierDefaults,
  getAvailableModels, getModelRecommendation,
};
