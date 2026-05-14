import type { FastifyInstance } from 'fastify';
import {
  createProject, listProjects, getProject, getProjectByPath,
  updateProjectLastOpened, updateProject, deleteProject,
  getProjectPresets,
} from '../services/database.js';

function genId() {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/projects', async () => {
    return { projects: listProjects() };
  });

  fastify.post<{ Body: { name: string; path: string; description?: string; defaultModel?: string } }>(
    '/projects',
    async (request, reply) => {
      const { name, path, description, defaultModel } = request.body || {};
      if (!name || !path) {
        return reply.code(400).send({ error: 'name and path are required' });
      }
      const existing = getProjectByPath(path);
      if (existing) {
        updateProjectLastOpened((existing as any).id);
        return existing;
      }
      const id = genId();
      createProject(id, name, path, description, defaultModel);
      return reply.code(201).send(getProject(id));
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/projects/:id',
    async (request, reply) => {
      const project = getProject(request.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      return project;
    }
  );

  fastify.put<{ Params: { id: string }; Body: { name?: string; description?: string; defaultModel?: string; agentPresets?: any[] } }>(
    '/projects/:id',
    async (request, reply) => {
      const project = getProject(request.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      updateProject(request.params.id, request.body || {});
      return getProject(request.params.id);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/presets',
    async (request, reply) => {
      const project = getProject(request.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      return { presets: getProjectPresets(request.params.id) };
    }
  );

  fastify.put<{ Params: { id: string }; Body: { presets: any[] } }>(
    '/projects/:id/presets',
    async (request, reply) => {
      const project = getProject(request.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      const presets = request.body?.presets || [];
      updateProject(request.params.id, { agentPresets: presets });
      return { presets: getProjectPresets(request.params.id) };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/projects/:id',
    async (request, reply) => {
      deleteProject(request.params.id);
      return reply.code(204).send();
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/projects/:id/open',
    async (request, reply) => {
      const project = getProject(request.params.id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      updateProjectLastOpened(request.params.id);
      return { status: 'ok' };
    }
  );
}
