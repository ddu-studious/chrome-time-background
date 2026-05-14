/**
 * Phase 6.4 — Multi-User Isolation
 *
 * Provides authentication middleware and user context injection.
 * Supports Bearer token auth with per-user data isolation.
 *
 * Two modes:
 *  1. Single-user (default): no auth required, all data accessible
 *  2. Multi-user: Bearer token resolves to user_id, queries scoped automatically
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './database.js';
import { config } from '../config.js';

export interface UserContext {
  userId: string;
  displayName?: string;
  role: 'admin' | 'user' | 'readonly';
  createdAt: number;
}

let initialized = false;

function ensureSchema() {
  if (initialized) return;
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT,
      scopes TEXT DEFAULT '["*"]',
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_token ON users(token_hash);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
  `);
  initialized = true;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomToken(): string {
  return 'cb_' + randomBytes(24).toString('hex');
}

// ─── User Management ───

export function createUser(displayName: string, role: 'admin' | 'user' | 'readonly' = 'user'): {
  user: UserContext;
  token: string;
} {
  ensureSchema();
  const token = randomToken();
  const hash = hashToken(token);
  const id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO users (id, display_name, token_hash, role, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, displayName, hash, role, now, now);

  return {
    user: { userId: id, displayName, role, createdAt: now },
    token,
  };
}

export function listUsers(): UserContext[] {
  ensureSchema();
  const rows = getDb().prepare('SELECT id, display_name, role, created_at FROM users ORDER BY created_at DESC').all() as any[];
  return rows.map(r => ({
    userId: r.id,
    displayName: r.display_name,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export function deleteUser(userId: string): boolean {
  ensureSchema();
  const info = getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
  return info.changes > 0;
}

export function resolveToken(token: string): UserContext | null {
  ensureSchema();
  const hash = hashToken(token);
  const row = getDb().prepare(
    'SELECT id, display_name, role, created_at FROM users WHERE token_hash = ?'
  ).get(hash) as any;
  if (!row) return null;

  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), row.id);
  return {
    userId: row.id,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

// ─── API Token Management ───

export function createApiToken(userId: string, name: string, scopes: string[] = ['*']): {
  tokenId: string;
  token: string;
} {
  ensureSchema();
  const token = randomToken();
  const hash = hashToken(token);
  const id = 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO api_tokens (id, user_id, token_hash, name, scopes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, hash, name, JSON.stringify(scopes), now);

  return { tokenId: id, token };
}

export function revokeApiToken(tokenId: string): boolean {
  ensureSchema();
  const info = getDb().prepare('DELETE FROM api_tokens WHERE id = ?').run(tokenId);
  return info.changes > 0;
}

export function resolveApiToken(token: string): { user: UserContext; scopes: string[] } | null {
  ensureSchema();
  const hash = hashToken(token);
  const row = getDb().prepare(`
    SELECT t.scopes, t.expires_at, u.id as user_id, u.display_name, u.role, u.created_at
    FROM api_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(hash) as any;

  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) return null;

  let scopes: string[] = ['*'];
  try { scopes = JSON.parse(row.scopes); } catch { /* default */ }

  return {
    user: {
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      createdAt: row.created_at,
    },
    scopes,
  };
}

// ─── Fastify Auth Hook ───

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: UserContext;
  }
}

export function isMultiUserEnabled(): boolean {
  return config.multiUser === true;
}

export function registerAuthHook(app: FastifyInstance) {
  app.decorateRequest('userContext', undefined);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isMultiUserEnabled()) {
      request.userContext = {
        userId: 'default',
        displayName: 'Local User',
        role: 'admin',
        createdAt: 0,
      };
      return;
    }

    const skipPaths = ['/health', '/.well-known/agent.json', '/a2a/health', '/auth/login'];
    if (skipPaths.some(p => request.url.startsWith(p))) {
      request.userContext = {
        userId: 'anonymous',
        displayName: 'Anonymous',
        role: 'readonly',
        createdAt: 0,
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Authentication required', hint: 'Set Authorization: Bearer <token>' });
      return;
    }

    const token = authHeader.slice(7);
    const user = resolveToken(token);
    if (user) {
      request.userContext = user;
      return;
    }

    const apiResult = resolveApiToken(token);
    if (apiResult) {
      request.userContext = apiResult.user;
      return;
    }

    reply.code(401).send({ error: 'Invalid token' });
  });
}
