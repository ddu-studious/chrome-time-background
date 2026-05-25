/**
 * Prompt Version Management Routes
 *
 * Endpoints:
 *   GET    /prompts/roles                 — List all roles with active prompt info
 *   GET    /prompts/roles/:roleId         — Get role prompt versions
 *   POST   /prompts/roles/:roleId         — Create new prompt version
 *   PATCH  /prompts/versions/:id/activate — Activate a version
 *   PATCH  /prompts/versions/:id/score    — Update performance score
 *   DELETE /prompts/versions/:id          — Delete a version (non-active only)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createPromptVersion,
  activatePromptVersion,
  getActivePromptVersion,
  listPromptVersions,
  updatePromptVersionScore,
  deletePromptVersion,
} from '../services/database.js';
import {
  ENTERPRISE_ROLES,
  getRoleById,
  type EnterpriseRole,
} from '../services/enterprise-roles.js';

export async function promptVersionRoutes(app: FastifyInstance) {
  app.get('/prompts/roles', async () => {
    return ENTERPRISE_ROLES.map((role: EnterpriseRole) => {
      const active = getActivePromptVersion(role.id) as any;
      const versions = listPromptVersions(role.id) as any[];
      return {
        id: role.id,
        name: role.name,
        nameEn: role.nameEn,
        icon: role.icon,
        description: role.description,
        phase: role.phase,
        modelTier: role.modelTier,
        skill: role.skill,
        activeVersion: active ? {
          id: active.id,
          version: active.version,
          score: active.performance_score,
          usageCount: active.usage_count,
          createdAt: active.created_at,
        } : null,
        versionCount: versions.length,
      };
    });
  });

  app.get('/prompts/roles/:roleId', async (req, reply) => {
    const { roleId } = req.params as { roleId: string };
    const role = getRoleById(roleId);
    if (!role) return reply.status(404).send({ error: 'Role not found' });

    const versions = (listPromptVersions(roleId) as any[]).map(v => ({
      id: v.id,
      version: v.version,
      promptConfig: safeParseJSON(v.prompt_config, {}),
      changelog: v.changelog,
      score: v.performance_score,
      usageCount: v.usage_count,
      isActive: !!v.is_active,
      createdAt: v.created_at,
      createdBy: v.created_by,
    }));

    return {
      role: {
        id: role.id,
        name: role.name,
        nameEn: role.nameEn,
        icon: role.icon,
        description: role.description,
        phase: role.phase,
        modelTier: role.modelTier,
        currentSkill: role.skill,
      },
      versions,
    };
  });

  app.post('/prompts/roles/:roleId', async (req, reply) => {
    const { roleId } = req.params as { roleId: string };
    const body = req.body as any;
    const role = getRoleById(roleId);
    if (!role) return reply.status(404).send({ error: 'Role not found' });
    if (!body?.promptConfig) return reply.status(400).send({ error: 'promptConfig is required' });

    const existing = listPromptVersions(roleId) as any[];
    const nextVersion = existing.length > 0
      ? Math.max(...existing.map((v: any) => v.version)) + 1
      : 1;

    const id = `pv_${roleId}_v${nextVersion}_${randomUUID().slice(0, 8)}`;
    createPromptVersion(id, {
      roleId,
      version: nextVersion,
      promptConfig: typeof body.promptConfig === 'string'
        ? body.promptConfig
        : JSON.stringify(body.promptConfig),
      changelog: body.changelog,
      createdBy: body.createdBy,
    });

    if (body.activate) {
      activatePromptVersion(id, roleId);
    }

    return { id, version: nextVersion, roleId };
  });

  app.patch('/prompts/versions/:id/activate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parts = id.split('_');
    const roleId = parts[1];
    if (!getRoleById(roleId)) return reply.status(404).send({ error: 'Role not found' });
    activatePromptVersion(id, roleId);
    return { ok: true, activated: id };
  });

  app.patch('/prompts/versions/:id/score', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    if (typeof body?.score !== 'number') return reply.status(400).send({ error: 'score is required (number)' });
    updatePromptVersionScore(id, body.score);
    return { ok: true };
  });

  app.delete('/prompts/versions/:id', async (req) => {
    const { id } = req.params as { id: string };
    deletePromptVersion(id);
    return { ok: true };
  });
}

function safeParseJSON(str: unknown, fallback: any) {
  if (typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
