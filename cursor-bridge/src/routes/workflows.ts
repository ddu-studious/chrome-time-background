import type { FastifyInstance } from 'fastify';
import { createWorkflow, listWorkflows, getWorkflow, deleteWorkflow } from '../services/database.js';
import { randomUUID } from 'node:crypto';

const BUILTIN_WORKFLOWS = [
  {
    id: 'wf-code-review',
    name: '代码审查流水线',
    description: '审查 → 修复建议 → 测试验证',
    steps: [
      { id: 's1', templateId: 'code-review', prompt: '审查当前项目中最近修改的文件，输出结构化审查报告。', dependsOn: [] },
      { id: 's2', templateId: 'bug-fix', prompt: '基于上一步审查报告，针对发现的问题提供修复方案。\n\n{output}', dependsOn: ['s1'] },
      { id: 's3', templateId: 'test-writer', prompt: '为修复后的代码编写单元测试，确保修复有效。\n\n{output}', dependsOn: ['s2'] },
    ],
    variables: [
      { name: 'path', description: '要审查的文件/目录路径', required: false, defaultValue: '.' },
    ],
  },
  {
    id: 'wf-feature-dev',
    name: '功能开发流程',
    description: '需求分析 → 编码实现 → 测试 → 文档',
    steps: [
      { id: 's1', templateId: 'architect', prompt: '分析以下功能需求，输出技术方案和实现步骤：\n\n{requirement}', dependsOn: [] },
      { id: 's2', templateId: 'bug-fix', prompt: '按照以下技术方案实现代码：\n\n{output}', dependsOn: ['s1'] },
      { id: 's3', templateId: 'test-writer', prompt: '为新实现的功能编写完整的测试用例：\n\n{output}', dependsOn: ['s2'] },
      { id: 's4', templateId: 'doc-writer', prompt: '为新功能编写用户文档和 API 文档：\n\n{output}', dependsOn: ['s3'] },
    ],
    variables: [
      { name: 'requirement', description: '功能需求描述', required: true },
    ],
  },
  {
    id: 'wf-refactor',
    name: '重构优化流程',
    description: '分析 → 重构 → 回归测试',
    steps: [
      { id: 's1', templateId: 'architect', prompt: '分析当前代码结构，找出需要重构的部分，输出重构计划。', dependsOn: [] },
      { id: 's2', templateId: 'code-review', prompt: '按照重构计划执行重构，确保不改变外部行为：\n\n{output}', dependsOn: ['s1'] },
      { id: 's3', templateId: 'test-writer', prompt: '运行回归测试并补充测试用例，确保重构没有引入问题：\n\n{output}', dependsOn: ['s2'] },
    ],
    variables: [
      { name: 'target', description: '重构目标模块/文件', required: false, defaultValue: '.' },
    ],
  },
  {
    id: 'wf-security',
    name: '安全审计流程',
    description: '漏洞扫描 → 修复建议 → 验证',
    steps: [
      { id: 's1', templateId: 'security', prompt: '对项目进行全面安全审计，输出漏洞报告。', dependsOn: [] },
      { id: 's2', templateId: 'bug-fix', prompt: '针对安全审计发现的漏洞，提供修复方案和代码：\n\n{output}', dependsOn: ['s1'] },
      { id: 's3', templateId: 'security', prompt: '验证安全修复是否有效，重新扫描已修复的漏洞：\n\n{output}', dependsOn: ['s2'] },
    ],
    variables: [],
  },
  {
    id: 'wf-docs',
    name: '文档生成流程',
    description: '代码分析 → 文档编写 → 校对',
    steps: [
      { id: 's1', templateId: 'architect', prompt: '分析项目代码结构和公共 API，输出文档大纲。', dependsOn: [] },
      { id: 's2', templateId: 'doc-writer', prompt: '按照大纲编写完整的项目文档（README + API 文档）：\n\n{output}', dependsOn: ['s1'] },
      { id: 's3', templateId: 'code-review', prompt: '校对文档内容，检查准确性、完整性和排版：\n\n{output}', dependsOn: ['s2'] },
    ],
    variables: [],
  },
];

function ensureBuiltinWorkflows() {
  const existing = listWorkflows() as any[];
  const existingIds = new Set(existing.map((w: any) => w.id));

  for (const wf of BUILTIN_WORKFLOWS) {
    if (!existingIds.has(wf.id)) {
      createWorkflow(wf.id, wf.name, wf.description, JSON.stringify(wf.steps), JSON.stringify(wf.variables), 1);
    }
  }
}

export async function workflowRoutes(fastify: FastifyInstance) {
  ensureBuiltinWorkflows();

  fastify.get('/workflows', async () => {
    const workflows = listWorkflows() as any[];
    return {
      workflows: workflows.map(w => ({
        ...w,
        steps: JSON.parse(w.steps || '[]'),
        variables: JSON.parse(w.variables || '[]'),
      })),
    };
  });

  fastify.get<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
    const wf = getWorkflow(request.params.id) as any;
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    return {
      ...wf,
      steps: JSON.parse(wf.steps || '[]'),
      variables: JSON.parse(wf.variables || '[]'),
    };
  });

  fastify.post<{ Body: { name: string; description?: string; steps: any[]; variables?: any[] } }>(
    '/workflows',
    async (request, reply) => {
      const { name, description, steps, variables } = request.body || {};
      if (!name || !steps?.length) {
        return reply.code(400).send({ error: 'name and steps are required' });
      }
      const id = `wf-custom-${randomUUID().slice(0, 8)}`;
      createWorkflow(id, name, description || '', JSON.stringify(steps), JSON.stringify(variables || []), 0);
      return reply.code(201).send({ id, name });
    }
  );

  fastify.delete<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
    deleteWorkflow(request.params.id);
    return reply.code(204).send();
  });
}
