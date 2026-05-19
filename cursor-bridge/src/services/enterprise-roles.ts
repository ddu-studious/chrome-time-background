/**
 * Phase 5.2 — Enterprise Role Template System
 *
 * Pre-built roles simulating a real company team.
 * Each role has: behavior, output format, constraints, focus areas.
 * Integrated with Phase 4.5 whitebox traces for full observability.
 */

export type ModelTier = 'fast' | 'balanced' | 'powerful';

export interface EnterpriseRole {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  phase: ('discussion' | 'execution' | 'qa' | 'deployment')[];
  skill: RoleSkill;
  defaultModel?: string;
  modelTier: ModelTier;
}

export interface RoleSkill {
  role: string;
  goal: string;
  backstory: string;
  behavior: string[];
  outputFormat: string;
  constraints: string[];
  focusAreas: string[];
  canDelegate: boolean;
  canVeto: boolean;
}

export const ENTERPRISE_ROLES: EnterpriseRole[] = [
  {
    id: 'operations',
    name: '运营',
    nameEn: 'Operations',
    icon: '📊',
    description: '市场分析、用户需求收集、ROI 评估',
    phase: ['discussion'],
    modelTier: 'balanced',
    skill: {
      role: '运营分析师',
      goal: '从市场和用户角度评估需求的商业价值',
      backstory: '拥有5年互联网运营经验，擅长数据分析和用户增长策略',
      behavior: [
        '用数据和案例支撑观点',
        '关注用户获取成本和留存率',
        '评估需求对现有用户的影响',
      ],
      outputFormat: '商业分析报告（含数据指标、竞品对比、ROI 预估）',
      constraints: ['不涉及技术实现细节', '基于市场数据说话'],
      focusAreas: ['商业价值', '用户增长', '竞品差异', 'ROI'],
      canDelegate: false,
      canVeto: false,
    },
  },
  {
    id: 'business',
    name: '业务',
    nameEn: 'Business Analyst',
    icon: '📈',
    description: '业务流程梳理、业务规则定义',
    phase: ['discussion'],
    modelTier: 'balanced',
    skill: {
      role: '业务分析师',
      goal: '梳理业务流程，定义完整的业务规则',
      backstory: '深入理解行业业务逻辑，注重流程完整性和合规性',
      behavior: [
        '绘制业务流程图',
        '定义业务规则和异常流程',
        '确保合规性要求',
      ],
      outputFormat: '业务分析文档（含流程图、规则定义、异常处理）',
      constraints: ['不涉及技术实现', '关注业务逻辑完整性'],
      focusAreas: ['业务逻辑', '异常流程', '合规性', '数据一致性'],
      canDelegate: false,
      canVeto: false,
    },
  },
  {
    id: 'product',
    name: '产品经理',
    nameEn: 'Product Manager',
    icon: '📋',
    description: '需求拆解、PRD 编写、优先级排序',
    phase: ['discussion'],
    modelTier: 'balanced',
    skill: {
      role: '产品经理',
      goal: '将需求转化为可执行的产品方案',
      backstory: '资深产品经理，擅长需求分析和用户体验设计',
      behavior: [
        '拆解需求为用户故事',
        '定义功能优先级（P0/P1/P2）',
        '考虑极端情况和边界条件',
      ],
      outputFormat: 'PRD 文档（含用户故事、功能列表、优先级、验收标准）',
      constraints: ['不做技术选型', '以用户价值为导向'],
      focusAreas: ['用户体验', '功能边界', 'MVP 范围', '优先级'],
      canDelegate: false,
      canVeto: false,
    },
  },
  {
    id: 'project-manager',
    name: '项目经理',
    nameEn: 'Project Manager',
    icon: '📅',
    description: '执行计划、进度管理、风险评估',
    phase: ['discussion', 'execution'],
    modelTier: 'balanced',
    skill: {
      role: '项目经理（执行负责人）',
      goal: '制定执行计划并协调团队按时交付',
      backstory: '敏捷开发实践者，PMP 认证，擅长风险管理',
      behavior: [
        '将产品方案拆解为开发任务',
        '评估任务工时和依赖关系',
        '识别阻塞点并提出解决方案',
        '分配任务给合适的开发角色',
      ],
      outputFormat: '执行计划（含任务列表、时间线、角色分配、风险矩阵）',
      constraints: ['不写代码', '关注进度和风险'],
      focusAreas: ['时间线', '资源分配', '阻塞点', '里程碑'],
      canDelegate: true,
      canVeto: false,
    },
  },
  {
    id: 'architect',
    name: '架构师',
    nameEn: 'Architect',
    icon: '🏗️',
    description: '技术方案、架构设计、技术选型',
    phase: ['discussion', 'execution'],
    modelTier: 'powerful',
    skill: {
      role: '技术架构师',
      goal: '设计可靠、可扩展的技术方案',
      backstory: '10年+系统架构经验，经历过大规模系统的演进',
      behavior: [
        '评估技术方案的可行性和风险',
        '设计模块划分和接口规范',
        '选择合适的技术栈和框架',
        '考虑性能、安全和可维护性',
      ],
      outputFormat: '技术方案（含架构图、模块划分、接口定义、技术选型理由）',
      constraints: ['不写业务代码', '关注架构层面'],
      focusAreas: ['可扩展性', '性能', '安全', '技术债'],
      canDelegate: false,
      canVeto: true,
    },
  },
  {
    id: 'senior-dev',
    name: '资深开发',
    nameEn: 'Senior Developer',
    icon: '👨‍💻',
    description: '核心模块设计、代码审查、技术指导',
    phase: ['execution'],
    modelTier: 'powerful',
    skill: {
      role: '资深开发工程师',
      goal: '负责核心模块的设计和实现，指导初级开发',
      backstory: '全栈开发专家，代码洁癖，追求工程卓越',
      behavior: [
        '设计核心模块的详细方案',
        '编写关键代码和示例',
        '审查其他开发者的代码',
        '解决技术难题',
      ],
      outputFormat: '代码实现（含设计说明、核心代码、单元测试）',
      constraints: ['遵循架构师的技术方案', '代码必须有测试'],
      focusAreas: ['代码质量', '设计模式', '最佳实践', '性能优化'],
      canDelegate: true,
      canVeto: false,
    },
  },
  {
    id: 'developer',
    name: '一线开发',
    nameEn: 'Developer',
    icon: '💻',
    description: '功能实现、单元测试、Bug 修复',
    phase: ['execution'],
    modelTier: 'balanced',
    skill: {
      role: '开发工程师',
      goal: '按照设计方案实现具体功能',
      backstory: '执行力强的开发者，注重细节和测试覆盖',
      behavior: [
        '根据任务分配实现具体功能',
        '编写单元测试',
        '修复 Bug',
        '编写代码注释和文档',
      ],
      outputFormat: '功能代码（含实现代码、测试代码、改动说明）',
      constraints: ['遵循资深开发的设计', '不擅自修改公共接口'],
      focusAreas: ['功能实现', '测试覆盖', '文档', 'Bug 修复'],
      canDelegate: false,
      canVeto: false,
    },
  },
  {
    id: 'qa',
    name: '测试',
    nameEn: 'QA Engineer',
    icon: '🧪',
    description: '测试用例、Bug 报告、回归测试',
    phase: ['qa'],
    modelTier: 'balanced',
    skill: {
      role: 'QA 测试工程师',
      goal: '确保产品质量，发现并报告所有缺陷',
      backstory: '质量强迫症，擅长发现边界条件和异常场景',
      behavior: [
        '编写测试用例（正常流程 + 异常流程 + 边界条件）',
        '执行测试并记录结果',
        '提交 Bug 报告（含复现步骤、期望结果、实际结果）',
        '回归测试确认修复',
      ],
      outputFormat: 'Bug 报告（含严重度、复现步骤、截图、期望vs实际）',
      constraints: ['不修改代码', '每个 Bug 必须可复现'],
      focusAreas: ['边界条件', '异常处理', '用户场景', '回归测试'],
      canDelegate: false,
      canVeto: true,
    },
  },
  {
    id: 'devops',
    name: '运维',
    nameEn: 'DevOps Engineer',
    icon: '🚀',
    description: '部署方案、监控、上线检查',
    phase: ['deployment'],
    modelTier: 'fast',
    skill: {
      role: '运维工程师',
      goal: '确保安全、稳定的部署和运行',
      backstory: 'SRE 实践者，追求 99.9% 可用性',
      behavior: [
        '制定部署方案和回滚策略',
        '配置 CI/CD 流水线',
        '检查安全和性能指标',
        '监控上线后的运行状态',
      ],
      outputFormat: '部署报告（含部署步骤、环境配置、监控指标、回滚方案）',
      constraints: ['不修改业务代码', '必须有回滚方案'],
      focusAreas: ['环境配置', 'CI/CD', '回滚方案', '监控'],
      canDelegate: false,
      canVeto: true,
    },
  },
  {
    id: 'tech-lead',
    name: '技术负责人',
    nameEn: 'Tech Lead',
    icon: '🎯',
    description: '全局协调、技术决策仲裁、质量把关',
    phase: ['discussion', 'execution', 'qa', 'deployment'],
    modelTier: 'powerful',
    skill: {
      role: '技术负责人（全局协调者）',
      goal: '全局把控技术方向和质量，协调团队高效交付',
      backstory: '从一线开发成长起来的技术管理者，兼具技术深度和管理视野',
      behavior: [
        '在讨论阶段收集各方意见并做出决策',
        '在执行阶段监控进度并协调资源',
        '在 QA 阶段评估 Bug 严重度并决定是否阻塞上线',
        '在部署阶段做最终 Go/No-Go 决策',
      ],
      outputFormat: '决策记录（含各方意见摘要、决策理由、行动项）',
      constraints: ['不直接写代码', '保持中立客观'],
      focusAreas: ['全局一致性', '技术方向', '团队效率', '质量把关'],
      canDelegate: true,
      canVeto: true,
    },
  },
];

const ROLE_ALIASES: Record<string, string> = {
  'product-manager': 'product',
  'pm': 'product',
  'productmanager': 'product',
  'developer': 'senior-dev',
  'dev': 'senior-dev',
  'frontend': 'senior-dev',
  'backend': 'senior-dev',
  'fullstack': 'senior-dev',
  'designer': 'ui-designer',
  'ui': 'ui-designer',
  'ux': 'ui-designer',
  'tester': 'qa',
  'test': 'qa',
  'quality': 'qa',
  'devops': 'ops-engineer',
  'ops': 'ops-engineer',
  'infra': 'ops-engineer',
  'lead': 'tech-lead',
  'techlead': 'tech-lead',
  'arch': 'architect',
  'security': 'security-engineer',
  'sec': 'security-engineer',
  'biz': 'business',
  'operation': 'operations',
  'project': 'project-manager',
};

export function getRoleById(id: string): EnterpriseRole | undefined {
  const direct = ENTERPRISE_ROLES.find((r) => r.id === id);
  if (direct) return direct;
  const normalized = id.toLowerCase().replace(/[\s_]/g, '-');
  const aliasTarget = ROLE_ALIASES[normalized];
  if (aliasTarget) return ENTERPRISE_ROLES.find((r) => r.id === aliasTarget);
  const fuzzy = ENTERPRISE_ROLES.find((r) =>
    r.id.includes(normalized) || normalized.includes(r.id) ||
    r.nameEn.toLowerCase().replace(/\s+/g, '-') === normalized
  );
  return fuzzy;
}

export function getRolesByPhase(phase: string): EnterpriseRole[] {
  return ENTERPRISE_ROLES.filter((r) => r.phase.includes(phase as any));
}

// ─── Model Routing Strategy ───

const MODEL_TIER_DEFAULTS: Record<ModelTier, string> = {
  fast: 'composer-2',
  balanced: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
};

const AVAILABLE_MODELS = [
  { id: 'composer-2', tier: 'fast' as ModelTier, label: 'Composer 2', latencyMs: 800, costPer1k: 0.002 },
  { id: 'gemini-3-flash', tier: 'fast' as ModelTier, label: 'Gemini 3 Flash', latencyMs: 600, costPer1k: 0.001 },
  { id: 'gpt-5.4-mini', tier: 'fast' as ModelTier, label: 'GPT 5.4 Mini', latencyMs: 700, costPer1k: 0.002 },
  { id: 'claude-haiku-4-5', tier: 'fast' as ModelTier, label: 'Claude Haiku 4.5', latencyMs: 500, costPer1k: 0.001 },
  { id: 'claude-sonnet-4-6', tier: 'balanced' as ModelTier, label: 'Claude Sonnet 4.6', latencyMs: 2000, costPer1k: 0.012 },
  { id: 'gpt-5.4', tier: 'balanced' as ModelTier, label: 'GPT 5.4', latencyMs: 1800, costPer1k: 0.01 },
  { id: 'gemini-3.1-pro', tier: 'balanced' as ModelTier, label: 'Gemini 3.1 Pro', latencyMs: 2000, costPer1k: 0.01 },
  { id: 'claude-opus-4-6', tier: 'powerful' as ModelTier, label: 'Claude Opus 4.6', latencyMs: 5000, costPer1k: 0.06 },
  { id: 'claude-opus-4-7', tier: 'powerful' as ModelTier, label: 'Claude Opus 4.7', latencyMs: 5000, costPer1k: 0.06 },
  { id: 'gpt-5.3-codex', tier: 'powerful' as ModelTier, label: 'GPT 5.3 Codex', latencyMs: 3500, costPer1k: 0.04 },
  { id: 'grok-4.3', tier: 'balanced' as ModelTier, label: 'Grok 4.3', latencyMs: 2500, costPer1k: 0.015 },
];

export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

const TASK_TYPE_ROUTING: Record<string, { preferredTier: ModelTier; upgradeRoles?: string[] }> = {
  'architecture': { preferredTier: 'powerful', upgradeRoles: ['architect', 'tech-lead'] },
  'code-review': { preferredTier: 'balanced' },
  'bug-fix': { preferredTier: 'fast' },
  'feature': { preferredTier: 'balanced', upgradeRoles: ['architect'] },
  'refactor': { preferredTier: 'balanced' },
  'testing': { preferredTier: 'fast' },
  'documentation': { preferredTier: 'fast' },
  'security': { preferredTier: 'powerful', upgradeRoles: ['security'] },
  'performance': { preferredTier: 'balanced', upgradeRoles: ['devops'] },
};

const roleModelOverrides = new Map<string, string>();

export function resolveModelForRole(
  role: EnterpriseRole,
  taskComplexity?: 1 | 2 | 3 | 4 | 5,
  autoAssign = true,
  taskType?: string,
): string {
  const userOverride = roleModelOverrides.get(role.id);
  if (userOverride) return userOverride;

  if (role.defaultModel) return role.defaultModel;

  if (!autoAssign) return MODEL_TIER_DEFAULTS.balanced;

  let tier = role.modelTier;

  if (taskType && TASK_TYPE_ROUTING[taskType]) {
    const routing = TASK_TYPE_ROUTING[taskType];
    if (routing.upgradeRoles?.includes(role.id)) {
      tier = routing.preferredTier;
    } else if (compareTier(routing.preferredTier, tier) > 0) {
      tier = routing.preferredTier;
    }
  }

  if (taskComplexity && taskComplexity >= 4 && tier === 'fast') {
    tier = 'balanced';
  }
  if (taskComplexity && taskComplexity >= 4 && tier === 'balanced'
      && (role.id === 'architect' || role.id === 'tech-lead')) {
    tier = 'powerful';
  }

  return MODEL_TIER_DEFAULTS[tier];
}

function compareTier(a: ModelTier, b: ModelTier): number {
  const order: Record<ModelTier, number> = { fast: 0, balanced: 1, powerful: 2 };
  return order[a] - order[b];
}

export function getModelRecommendation(
  roleId: string,
  taskComplexity: 1 | 2 | 3 | 4 | 5,
  taskType?: string,
): { recommended: string; alternatives: typeof AVAILABLE_MODELS; reason: string } {
  const role = getRoleById(roleId);
  if (!role) {
    return { recommended: MODEL_TIER_DEFAULTS.balanced, alternatives: AVAILABLE_MODELS, reason: 'Unknown role' };
  }

  const recommended = resolveModelForRole(role, taskComplexity, true, taskType);
  const reasons: string[] = [];

  if (taskComplexity >= 4) reasons.push(`High complexity (${taskComplexity}/5)`);
  if (taskType) reasons.push(`Task type: ${taskType}`);
  reasons.push(`Role tier: ${role.modelTier}`);

  return {
    recommended,
    alternatives: AVAILABLE_MODELS,
    reason: reasons.join(', '),
  };
}

export function setRoleModelOverride(roleId: string, model: string) {
  roleModelOverrides.set(roleId, model);
}

export function removeRoleModelOverride(roleId: string) {
  roleModelOverrides.delete(roleId);
}

export function getRoleModelOverrides(): Record<string, string> {
  return Object.fromEntries(roleModelOverrides);
}

export function setModelTierDefault(tier: ModelTier, model: string) {
  MODEL_TIER_DEFAULTS[tier] = model;
}

export function getModelTierDefaults(): Record<ModelTier, string> {
  return { ...MODEL_TIER_DEFAULTS };
}

export function buildRoleSystemPrompt(role: EnterpriseRole, context: {
  topic: string;
  otherParticipants?: string[];
  round?: number;
  previousMessages?: string[];
}): string {
  const s = role.skill;
  const parts: string[] = [
    `# 你的角色: ${s.role}`,
    `## 目标\n${s.goal}`,
    `## 背景\n${s.backstory}`,
    `## 行为准则\n${s.behavior.map((b) => `- ${b}`).join('\n')}`,
    `## 输出格式\n${s.outputFormat}`,
    `## 约束条件\n${s.constraints.map((c) => `- ${c}`).join('\n')}`,
    `## 关注领域\n${s.focusAreas.join(', ')}`,
  ];

  if (context.otherParticipants?.length) {
    parts.push(`## 当前参会角色\n${context.otherParticipants.join(', ')}`);
  }
  if (context.round) {
    parts.push(`## 当前轮次\n第 ${context.round} 轮讨论`);
  }
  if (context.previousMessages?.length) {
    parts.push(`## 前序发言\n${context.previousMessages.join('\n---\n')}`);
  }

  parts.push(`\n## 当前议题\n${context.topic}`);
  parts.push(`\n请从你的角色视角，针对上述议题发表专业意见。输出格式需符合要求。`);

  return parts.join('\n\n');
}
