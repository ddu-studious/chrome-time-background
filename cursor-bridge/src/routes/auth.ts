/**
 * Phase 6.4 — Authentication & User Management Routes
 */

import type { FastifyInstance } from 'fastify';
import {
  createUser, listUsers, deleteUser,
  createApiToken, revokeApiToken, isMultiUserEnabled,
} from '../services/auth-middleware.js';

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/mode', async () => {
    return {
      multiUser: isMultiUserEnabled(),
      description: isMultiUserEnabled()
        ? 'Multi-user mode: Bearer token required for API access'
        : 'Single-user mode: no authentication required',
    };
  });

  app.get('/auth/me', async (req) => {
    return req.userContext || { userId: 'anonymous', role: 'readonly' };
  });

  app.get('/auth/users', async (req, reply) => {
    if (req.userContext?.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    return listUsers();
  });

  app.post('/auth/users', async (req, reply) => {
    if (isMultiUserEnabled() && req.userContext?.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    const { displayName, role } = req.body as { displayName: string; role?: string };
    if (!displayName) return reply.code(400).send({ error: 'displayName is required' });

    const validRoles = ['admin', 'user', 'readonly'];
    const userRole = validRoles.includes(role || '') ? role as any : 'user';
    const result = createUser(displayName, userRole);
    return {
      user: result.user,
      token: result.token,
      hint: 'Save this token — it cannot be retrieved later',
    };
  });

  app.delete('/auth/users/:id', async (req, reply) => {
    if (req.userContext?.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    const { id } = req.params as { id: string };
    if (id === req.userContext?.userId) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }
    const deleted = deleteUser(id);
    if (!deleted) return reply.code(404).send({ error: 'User not found' });
    return { deleted: true };
  });

  app.post('/auth/tokens', async (req, reply) => {
    const userId = req.userContext?.userId;
    if (!userId || userId === 'anonymous') {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    const { name, scopes } = req.body as { name: string; scopes?: string[] };
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const result = createApiToken(userId, name, scopes);
    return {
      ...result,
      hint: 'Save this token — it cannot be retrieved later',
    };
  });

  app.delete('/auth/tokens/:id', async (req, reply) => {
    if (req.userContext?.role === 'readonly') {
      return reply.code(403).send({ error: 'Write access required' });
    }
    const { id } = req.params as { id: string };
    const revoked = revokeApiToken(id);
    if (!revoked) return reply.code(404).send({ error: 'Token not found' });
    return { revoked: true };
  });
}
